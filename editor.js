// Simple level editor for 16x16 maps
const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
const GRID = 16; const TILE = 32; const WIDTH = GRID*TILE, HEIGHT = GRID*TILE;
let map = []; // numbers: 1 floor,2 wall,3 treasure,4 item
let playerPos = {x: Math.floor(GRID/2), y:1};
let isMouseDown = false;
let currentTool = 'paint';
let currentType = 1; // tile type to paint

// sprite management
let sprites = [
  {name:'treasure', src:'sprites/treasure.svg'},
  {name:'chest', src:'sprites/chest.svg'},
  {name:'wall', src:'sprites/wall.svg'}
];
const spriteImgs = {};
const spriteAssignment = {}; // map type -> sprite src
let selectedSpriteIndex = 0;
let spriteLayer = []; // per-tile sprite src or null

// sequence of levels (order of appearance)
let sequence = []; // array of { name: string, data: object }

function renderSequenceList(){
  const el = document.getElementById('sequenceList'); if(!el) return; el.innerHTML = '';
  sequence.forEach((entry, idx) =>{
    const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.marginBottom='6px';
    const name = document.createElement('div'); name.textContent = entry.name || ('niveau ' + (idx+1)); name.style.flex='1';
    const up = document.createElement('button'); up.textContent='↑'; up.title='Monter'; up.style.marginRight='4px';
    const down = document.createElement('button'); down.textContent='↓'; down.title='Descendre'; down.style.marginRight='4px';
    const del = document.createElement('button'); del.textContent='×'; del.title='Supprimer';
    up.addEventListener('click', ()=>{ if(idx<=0) return; const a=sequence[idx-1]; sequence[idx-1]=sequence[idx]; sequence[idx]=a; renderSequenceList(); });
    down.addEventListener('click', ()=>{ if(idx>=sequence.length-1) return; const a=sequence[idx+1]; sequence[idx+1]=sequence[idx]; sequence[idx]=a; renderSequenceList(); });
    del.addEventListener('click', ()=>{ sequence.splice(idx,1); renderSequenceList(); });
    row.appendChild(name); row.appendChild(up); row.appendChild(down); row.appendChild(del); el.appendChild(row);
  });
}

function addLevelToSequence(name, data){ sequence.push({ name: name || ('niveau' + (sequence.length+1)), data: data || {} }); renderSequenceList(); }

function saveSequenceDownload(filename){ if(!filename) filename = 'sequence.json'; const out = sequence.map(s=>({ name: s.name, level: s.data })); const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); alert('Ordre exporté: ' + filename); }


// history for undo (top-level so all functions can access)
let history = [];
const MAX_HISTORY = 100;

function snapshot(){
  return {
    map: map.map(r=>r.slice()),
    spriteLayer: spriteLayer.map(r=>r.slice()),
    playerPos: { x: playerPos.x, y: playerPos.y }
  };
}

function pushHistory(){
  history.push(snapshot());
  if(history.length > MAX_HISTORY) history.shift();
}

function undo(){
  if(history.length === 0){ alert('Rien à annuler'); return; }
  const s = history.pop();
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){ map[y][x] = s.map[y][x]; spriteLayer[y][x] = s.spriteLayer[y][x]; }
  playerPos = { x: s.playerPos.x, y: s.playerPos.y };
  draw();
}

function init(){
  canvas.width = WIDTH; canvas.height = HEIGHT;
  // init map
  for(let y=0;y<GRID;y++){ const row=[]; for(let x=0;x<GRID;x++) row.push(1); map.push(row); }
  // init spriteLayer
  for(let y=0;y<GRID;y++){ const r=[]; for(let x=0;x<GRID;x++) r.push(null); spriteLayer.push(r); }
  // load base sprites
  preloadSprites().then(()=>{ renderSpriteList(); draw(); });
  attachUI();
}

function preloadSprites(){
  const promises = sprites.map(s => new Promise(resolve=>{
    const img = new Image(); img.onload = ()=>{ spriteImgs[s.src] = img; resolve(); };
    img.onerror = ()=>{ resolve(); };
    img.src = s.src;
  }));
  return Promise.all(promises);
}

function renderSpriteList(){
  const el = document.getElementById('spriteList'); el.innerHTML = '';
  sprites.forEach((s,i)=>{
    const div = document.createElement('div'); div.className='spriteItem';
    if(i===selectedSpriteIndex) div.classList.add('selected');
    const img = document.createElement('img'); img.src = s.src; img.width = 40; img.height = 40; img.alt = s.name;
    div.appendChild(img);
    div.addEventListener('click', ()=>{ selectedSpriteIndex=i; document.querySelectorAll('.spriteItem').forEach(n=>n.classList.remove('selected')); div.classList.add('selected'); updateSelectedSpriteName(); });
    el.appendChild(div);
  });
  updateSelectedSpriteName();
}

function updateSelectedSpriteName(){
  const el = document.getElementById('selectedSpriteName');
  const s = sprites[selectedSpriteIndex];
  el.textContent = s ? s.name : '(aucun)';
}

function attachUI(){
  // tools
  document.querySelectorAll('input[name=tool]').forEach(r=> r.addEventListener('change', e=>{ currentTool = e.target.value; }));
  document.querySelectorAll('.typeBtn').forEach(b=> b.addEventListener('click', e=>{ currentType = parseInt(b.dataset.type,10); document.querySelectorAll('.typeBtn').forEach(x=>x.disabled=false); b.disabled=true; }));
  const clearBtn = document.getElementById('clearBtn'); if(clearBtn) clearBtn.addEventListener('click', ()=>{
    if(!confirm('Confirmer: effacer la carte, les sprites par tuile et recentrer le joueur ?')) return;
    pushHistory();
    for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){ map[y][x]=1; spriteLayer[y][x]=null; }
    playerPos = { x: Math.floor(GRID/2), y: 1 };
    draw();
  });
  document.getElementById('downloadBtn').addEventListener('click', ()=>{ const name = document.getElementById('saveName').value || 'mylevel.json'; saveLevelDownloadEditor(name); });
  const clearTileSpritesBtn = document.getElementById('clearTileSprites'); if(clearTileSpritesBtn) clearTileSpritesBtn.addEventListener('click', ()=>{
    if(!confirm('Effacer tous les sprites assignés aux tuiles ?')) return; pushHistory(); for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++) spriteLayer[y][x]=null; draw();
  });
  // undo button
  const undoBtn = document.getElementById('undoBtn'); if(undoBtn) undoBtn.addEventListener('click', ()=>{ undo(); });
  // add sprite file
  document.getElementById('spriteFile').addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return; const url = URL.createObjectURL(f);
    const name = f.name.replace(/\.[^/.]+$/, ""); sprites.push({name, src: url}); const img = new Image();
    img.onload = ()=>{ spriteImgs[url]=img; renderSpriteList(); updateSelectedSpriteName(); URL.revokeObjectURL(url); };
    img.onerror = ()=>{ renderSpriteList(); URL.revokeObjectURL(url); };
    img.src = url;
  });
  // load level JSON
  document.getElementById('loadFile').addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return; const reader = new FileReader(); reader.onload = ()=>{ try{ const obj = JSON.parse(reader.result); applyLoadedLevelEditor(obj); }catch(err){ alert('Fichier invalide'); } }; reader.readAsText(f);
  });

  // sequence controls: add level from file
  const seqFile = document.getElementById('seqFile'); const addLevelFromFile = document.getElementById('addLevelFromFile');
  if(addLevelFromFile && seqFile){ addLevelFromFile.addEventListener('click', ()=>{ const f = seqFile.files[0]; if(!f) return alert('Choisir un fichier JSON'); const reader = new FileReader(); reader.onload = ()=>{ try{ const obj = JSON.parse(reader.result); addLevelToSequence(obj.name || f.name, obj); alert('Niveau ajouté à la séquence: ' + (obj.name || f.name)); }catch(err){ alert('Fichier invalide'); } }; reader.readAsText(f); }); }

  // save sequence
  const saveSeqBtn = document.getElementById('saveSequenceBtn'); const seqName = document.getElementById('sequenceName'); if(saveSeqBtn){ saveSeqBtn.addEventListener('click', ()=>{ const fn = (seqName && seqName.value) ? seqName.value : 'ordre_niveaux.json'; saveSequenceDownload(fn); }); }
  // render initial sequence (empty)
  renderSequenceList();

  // canvas interactions
  canvas.addEventListener('mousedown', e=>{ isMouseDown=true; pushHistory(); handlePointer(e); });
  canvas.addEventListener('mouseup', ()=>{ isMouseDown=false; hideSpritePicker(); });
  canvas.addEventListener('mousemove', e=>{ if(isMouseDown) handlePointer(e); });
  // click to open sprite picker when using sprite tool
  canvas.addEventListener('click', e=>{
    if(currentTool === 'sprite'){
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
      const tx = Math.floor(cx / TILE); const ty = Math.floor(cy / TILE);
      if(tx<0||tx>=GRID||ty<0||ty>=GRID) return;
      showSpritePicker(e.clientX, e.clientY, tx, ty);
    }
  });
}

function showSpritePicker(pageX, pageY, tx, ty){
  const picker = document.getElementById('spritePicker');
  picker.innerHTML = '';
  sprites.forEach((s,i)=>{
    const div = document.createElement('div'); div.className = 'spritePickItem';
    const img = document.createElement('img'); img.src = s.src; img.width = 36; img.height = 36; img.alt = s.name;
    div.appendChild(img);
    div.addEventListener('click', (ev)=>{ ev.stopPropagation(); spriteLayer[ty][tx] = s.src; draw(); hideSpritePicker(); });
    picker.appendChild(div);
  });
  // add clear option
  const clear = document.createElement('div'); clear.className='spritePickItem'; clear.textContent='X'; clear.style.fontWeight='bold'; clear.style.fontSize='14px'; clear.style.display='flex'; clear.style.alignItems='center'; clear.style.justifyContent='center';
  clear.addEventListener('click', ev=>{ ev.stopPropagation(); spriteLayer[ty][tx] = null; draw(); hideSpritePicker(); });
  picker.appendChild(clear);
  picker.style.left = (pageX + 6) + 'px'; picker.style.top = (pageY + 6) + 'px'; picker.style.display = 'flex';
  // hide when clicking elsewhere
  setTimeout(()=>{ window.addEventListener('click', onWindowClickForPicker); }, 10);
}

function hideSpritePicker(){
  const picker = document.getElementById('spritePicker');
  if(picker) picker.style.display = 'none';
  window.removeEventListener('click', onWindowClickForPicker);
}

function onWindowClickForPicker(e){
  const picker = document.getElementById('spritePicker');
  if(!picker) return; if(!picker.contains(e.target)) hideSpritePicker();
}

function handlePointer(e){
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
  const tx = Math.floor(cx / TILE); const ty = Math.floor(cy / TILE);
  if(tx<0||tx>=GRID||ty<0||ty>=GRID) return;
  if(currentTool === 'erase'){
    map[ty][tx]=1; spriteLayer[ty][tx]=null;
  }
  else if(currentTool === 'paint'){
    map[ty][tx]=currentType;
    // apply selected sprite only to this tile (do NOT change global type->sprite mapping)
    const s = sprites[selectedSpriteIndex];
    if(s) spriteLayer[ty][tx] = s.src;
  }
  else if(currentTool === 'player'){
    playerPos.x = tx; playerPos.y = ty;
  }
  else if(currentTool === 'sprite'){
    const s = sprites[selectedSpriteIndex];
    spriteLayer[ty][tx] = s ? s.src : null;
  }
  draw();
}

function draw(){
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  for(let y=0;y<GRID;y++){
    for(let x=0;x<GRID;x++){
      const t = map[y][x];
      const sx = x*TILE, sy = y*TILE;
      // draw background for types
      if(t === 2){ ctx.fillStyle = '#44484d'; ctx.fillRect(sx,sy,TILE,TILE); }
      else if(t === 3){ ctx.fillStyle = '#5b3a1a'; ctx.fillRect(sx,sy,TILE,TILE); }
      else if(t === 4){ ctx.fillStyle = '#2b6cb0'; ctx.fillRect(sx,sy,TILE,TILE); }
      else { ctx.fillStyle = '#6b4f3b'; ctx.fillRect(sx,sy,TILE,TILE); }
      // per-tile sprite overrides global type->sprite mapping
      const tileSprite = spriteLayer[y][x];
      if(tileSprite && spriteImgs[tileSprite]){
        ctx.drawImage(spriteImgs[tileSprite], sx, sy, TILE, TILE);
      } else {
        const spriteSrc = spriteAssignment[t];
        if(spriteSrc && spriteImgs[spriteSrc]) ctx.drawImage(spriteImgs[spriteSrc], sx, sy, TILE, TILE);
      }
      // grid lines
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(sx,sy,TILE,TILE);
    }
  }
  // draw player
  ctx.save();
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(playerPos.x*TILE + TILE*0.25, playerPos.y*TILE + TILE*0.1, TILE*0.5, TILE*0.8);
  ctx.restore();
}

function saveLevelDownloadEditor(filename){
  if(!filename) return;
  const obj = { name: filename, player: { x: playerPos.x, y: playerPos.y }, map: map, spriteLayer: spriteLayer };
  const data = JSON.stringify(obj, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  alert('Niveau exporté: ' + filename);
}

function applyLoadedLevelEditor(obj){
  if(!obj || !obj.map) return alert('Fichier invalide');
  // allow undo of load
  pushHistory();
  // ensure size
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++) map[y][x] = (obj.map[y] && typeof obj.map[y][x] !== 'undefined') ? obj.map[y][x] : 1;
  if(obj.player) playerPos = {x: obj.player.x, y: obj.player.y};
  if(obj.spriteLayer){ for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++) spriteLayer[y][x] = (obj.spriteLayer[y] && obj.spriteLayer[y][x]) ? obj.spriteLayer[y][x] : null; }
  draw();
  alert('Niveau chargé');
}

// init UI defaults
window.addEventListener('load', ()=>{ init(); });
