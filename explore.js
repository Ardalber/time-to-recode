// Exploration game (16x16 grid), miner explorer
const canvas = document.getElementById('exploreCanvas');
const ctx = canvas.getContext('2d');
const pauseBtn = document.getElementById('pause');
const resetBtn = document.getElementById('reset');
const scoreEl = document.getElementById('score');
const treasuresEl = document.getElementById('treasures');
const levelEl = document.getElementById('level');

const GRID = 16;
const TILE = 32; // 16*32 = 512 canvas
const WIDTH = GRID * TILE;
const HEIGHT = GRID * TILE;

let map = [];
let revealed = [];
let player = {x: Math.floor(GRID/2), y: 1, dir: 'down', walkPhase: 0, moving: false};
let score = 0;
let level = 1;
let treasuresRemaining = 0;
let running = false;
let animationId = null;
const revealRadius = 3;
let playerColor = '#ffd166';
let magnetActive = false; // becomes true after collecting color-change item
// message bubble shown when picking up items
let pickupMessage = null; // {text, start, x, y}
const MESSAGE_DURATION = 1100; // ms
// path-following state for click-to-move
let currentPath = null;
let pathTimer = null;
const STEP_DELAY = 120; // ms per step

canvas.width = WIDTH; canvas.height = HEIGHT;

// tile types: 0 = empty/floor, 1 = dirt/floor, 2 = wall/rock, 3 = treasure
function generateMap(){
  map = []; revealed = [];
  treasuresRemaining = 0;
  const treasureBase = 4;
  const treasuresCount = treasureBase + Math.min(8, level);
  // chance values
  const wallChance = Math.min(0.35, 0.08 + level*0.03);
  for(let y=0;y<GRID;y++){
    const row = []; const rev = [];
    for(let x=0;x<GRID;x++){
      // always revealed (no fog)
      rev.push(true);
      if(y === 0 || y === GRID-1 || x===0 || x===GRID-1){
        row.push(2); // border walls
      } else {
        const r = Math.random();
        if(r < wallChance) row.push(2);
        else row.push(1);
      }
    }
    map.push(row); revealed.push(rev);
  }
  // ensure player spawn clear
  player = {x: Math.floor(GRID/2), y:1};
  map[player.y][player.x] = 1;
  // place treasures only on reachable tiles so the level is always finishable
  const reachable = getReachable(player.x, player.y);
  // filter out start tile
  const candidates = reachable.filter(p => !(p.x === player.x && p.y === player.y));
  // ensure we don't place more treasures than available reachable tiles
  const finalCount = Math.min(treasuresCount, candidates.length);
  // shuffle candidates
  for(let i = candidates.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i+1));
    const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
  }
  for(let i=0;i<finalCount;i++){
    const c = candidates[i];
    map[c.y][c.x] = 3; treasuresRemaining++;
  }
  // place a color-change item on level 2 and above
  if(level >= 2){
    const itemCandidates = candidates.filter(p => map[p.y][p.x] === 1);
    if(itemCandidates.length > 0){
      const pick = itemCandidates[Math.floor(Math.random()*itemCandidates.length)];
      map[pick.y][pick.x] = 4; // item: color changer
    }
  }
  updateHUD();
  revealAround(player.x, player.y);
}

function updateHUD(){
  scoreEl.textContent = score;
  treasuresEl.textContent = treasuresRemaining;
  levelEl.textContent = level;
}

function revealAround(px,py){
  for(let y = Math.max(0,py-revealRadius); y<=Math.min(GRID-1,py+revealRadius); y++){
    for(let x = Math.max(0,px-revealRadius); x<=Math.min(GRID-1,px+revealRadius); x++){
      const dx = x-px, dy = y-py;
      if(dx*dx+dy*dy <= revealRadius*revealRadius) revealed[y][x] = true;
    }
  }
}

function draw(){
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  for(let y=0;y<GRID;y++){
    for(let x=0;x<GRID;x++){
      if(!revealed[y][x]){
        // fog
        ctx.fillStyle = '#02060a';
        ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
        continue;
      }
      const t = map[y][x];
      if(t === 2){ // wall
        ctx.fillStyle = '#44484d';
        ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
        // rock texture
        ctx.fillStyle = '#3a3f44';
        ctx.fillRect(x*TILE+6, y*TILE+6, TILE-12, TILE-12);
      } else if(t === 4){ // color-change item
        ctx.fillStyle = '#2b6cb0'; ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
        ctx.fillStyle = '#9ad3ff';
        ctx.beginPath();
        ctx.moveTo(x*TILE+TILE*0.5, y*TILE+TILE*0.18);
        ctx.lineTo(x*TILE+TILE*0.78, y*TILE+TILE*0.5);
        ctx.lineTo(x*TILE+TILE*0.5, y*TILE+TILE*0.82);
        ctx.lineTo(x*TILE+TILE*0.22, y*TILE+TILE*0.5);
        ctx.closePath(); ctx.fill();
      } else if(t === 3){ // treasure
        ctx.fillStyle = '#5b3a1a'; ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(x*TILE+TILE/2, y*TILE+TILE/2, TILE*0.2, 0, Math.PI*2);
        ctx.fill();
      } else { // floor/dirt
        ctx.fillStyle = '#6b4f3b';
        ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
      }
      // grid lines subtle
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.strokeRect(x*TILE, y*TILE, TILE, TILE);
    }
  }
  // draw player as a simple human sprite with basic walk animation
  const px = player.x*TILE; const py = player.y*TILE;
  drawHumanPlayer(px, py);

  // draw pickup message if any
  if(pickupMessage){
    const elapsed = performance.now() - pickupMessage.start;
    if(elapsed > MESSAGE_DURATION){ pickupMessage = null; }
    else {
      const alpha = 1 - (elapsed / MESSAGE_DURATION);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const text = pickupMessage.text;
      const tx = pickupMessage.x * TILE + TILE/2;
      const ty = pickupMessage.y * TILE;
      const metrics = ctx.measureText(text);
      const paddingX = 10;
      const paddingY = 6;
      const boxW = metrics.width + paddingX*2;
      const boxH = 20 + paddingY;
      const bx = tx - boxW/2;
      const by = ty - TILE*0.25 - boxH;
      // bubble background
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, bx, by, boxW, boxH, 6, true, false);
      // text
      ctx.fillStyle = '#fff';
      ctx.fillText(text, tx, by + boxH - paddingY - 2);
      ctx.restore();
    }
  }
}

// attract treasures within radius 3: treasures move one step toward player if possible
function attractTreasures(){
  if(!magnetActive) return;
  const toMove = [];
  for(let y=0;y<GRID;y++){
    for(let x=0;x<GRID;x++){
      if(map[y][x] === 3){
        const dx = player.x - x;
        const dy = player.y - y;
        const dist2 = dx*dx + dy*dy;
        if(dist2 <= 3*3){
          toMove.push({x,y});
        }
      }
    }
  }
  for(const t of toMove){
    // if treasure already removed, skip
    if(map[t.y][t.x] !== 3) continue;
    const dx = Math.sign(player.x - t.x);
    const dy = Math.sign(player.y - t.y);
    // prefer diagonal reduction by trying x then y
    const tryPositions = [ {x: t.x+dx, y: t.y}, {x: t.x, y: t.y+dy}, {x: t.x+dx, y: t.y+dy} ];
    let moved = false;
    for(const np of tryPositions){
      if(np.x<0||np.x>=GRID||np.y<0||np.y>=GRID) continue;
      // if moving into player -> collect
      if(np.x === player.x && np.y === player.y){
        map[t.y][t.x] = 1; // remove treasure
        score += 1; treasuresRemaining = Math.max(0, treasuresRemaining-1); updateHUD();
        const totalText = score + ' pépite' + (score > 1 ? 's' : '');
        pickupMessage = { text: `(Total: ${totalText})`, start: performance.now(), x: player.x, y: player.y };
        moved = true; break;
      }
      // only move into floor (1)
      if(map[np.y][np.x] === 1){
        map[np.y][np.x] = 3; map[t.y][t.x] = 1; moved = true; break;
      }
    }
    if(!moved){
      // try any adjacent floor as fallback
      const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
      for(const d of dirs){
        const nx = t.x + d.x, ny = t.y + d.y;
        if(nx<0||nx>=GRID||ny<0||ny>=GRID) continue;
        if(nx === player.x && ny === player.y){
          map[t.y][t.x] = 1; score += 1; treasuresRemaining = Math.max(0, treasuresRemaining-1); updateHUD();
          pickupMessage = { text: `(Total: ${score})`, start: performance.now(), x: player.x, y: player.y };
          moved = true; break;
        }
        if(map[ny][nx] === 1){ map[ny][nx] = 3; map[t.y][t.x] = 1; moved = true; break; }
      }
    }
    if(treasuresRemaining === 0){ nextLevel(); }
  }
}

// helper: rounded rectangle
function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

// draw a simple human-like player sprite at pixel position px,py
function drawHumanPlayer(px, py){
  const cx = px + TILE/2;
  const cy = py + TILE/2;
  const skin = '#f1c27d';
  const shirt = playerColor;
  const legColor = '#3b3b3b';
  // walking swing: -1 or 1
  const phase = player.walkPhase ? 1 : -1;
  const swing = player.moving ? phase * (TILE * 0.08) : 0;

  // legs
  ctx.fillStyle = legColor;
  ctx.fillRect(cx - TILE*0.08 + swing, cy + TILE*0.18, TILE*0.14, TILE*0.28);
  ctx.fillRect(cx + TILE*0.08 - swing, cy + TILE*0.18, TILE*0.14, TILE*0.28);

  // body (shirt)
  ctx.fillStyle = shirt;
  ctx.fillRect(cx - TILE*0.18, cy - TILE*0.02, TILE*0.36, TILE*0.36);

  // arms (swing opposite to legs)
  ctx.fillStyle = skin;
  ctx.fillRect(cx - TILE*0.28 - swing, cy - TILE*0.02, TILE*0.12, TILE*0.28);
  ctx.fillRect(cx + TILE*0.16 + swing, cy - TILE*0.02, TILE*0.12, TILE*0.28);

  // head
  ctx.fillStyle = skin;
  const headR = TILE*0.12;
  ctx.beginPath(); ctx.arc(cx, cy - TILE*0.22, headR, 0, Math.PI*2); ctx.fill();
  // small eyes
  ctx.fillStyle = '#222'; ctx.fillRect(cx - headR*0.4, cy - TILE*0.24, 2, 2); ctx.fillRect(cx + headR*0.2, cy - TILE*0.24, 2, 2);
  // optional cap/helmet highlight
  ctx.fillStyle = '#ffb703'; ctx.fillRect(cx - headR, cy - TILE*0.32, headR*2, headR*0.4);
}

function canMove(x,y){
  if(x<0||x>=GRID||y<0||y>=GRID) return false;
  return map[y][x] !== 2; // cannot move into wall
}

// return array of reachable positions from (sx,sy) using BFS
function getReachable(sx, sy){
  const q = [{x:sx,y:sy}];
  const seen = new Set([sx+','+sy]);
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  const out = [];
  while(q.length){
    const cur = q.shift();
    out.push(cur);
    for(const d of dirs){
      const nx = cur.x + d.x, ny = cur.y + d.y;
      const k = nx+','+ny;
      if(nx<0||nx>=GRID||ny<0||ny>=GRID) continue;
      if(seen.has(k)) continue;
      if(map[ny][nx] === 2) continue; // wall blocks
      seen.add(k);
      q.push({x:nx,y:ny});
    }
  }
  return out;
}

// BFS pathfinder returning array of positions from next step to goal (excluding start)
function findPath(start, goal){
  const key = (p)=> p.x + ',' + p.y;
  const q = [start];
  const visited = new Set([key(start)]);
  const prev = new Map();
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  while(q.length){
    const cur = q.shift();
    if(cur.x === goal.x && cur.y === goal.y) break;
    for(const d of dirs){
      const nx = cur.x + d.x, ny = cur.y + d.y;
      const k = nx+','+ny;
      if(nx<0||nx>=GRID||ny<0||ny>=GRID) continue;
      if(visited.has(k)) continue;
      if(!canMove(nx,ny)) continue;
      visited.add(k);
      prev.set(k, cur);
      q.push({x:nx,y:ny});
    }
  }
  // reconstruct
  const goalKey = key(goal);
  if(!prev.has(goalKey) && !(start.x===goal.x && start.y===goal.y)) return null;
  const path = [];
  let curKey = goalKey;
  let curPos = goal;
  while(!(curPos.x === start.x && curPos.y === start.y)){
    path.push(curPos);
    const p = prev.get(curKey);
    if(!p) break;
    curPos = p; curKey = key(curPos);
  }
  path.reverse();
  return path;
}

function followPath(path){
  // cancel existing
  if(pathTimer) { clearTimeout(pathTimer); pathTimer = null; }
  if(!path || path.length===0) return;
  // step through path
  let i = 0;
    function step(){
    if(i >= path.length) return;
    const p = path[i];
    const prevX = player.x, prevY = player.y;
    player.x = p.x; player.y = p.y;
    const dxMove = player.x - prevX, dyMove = player.y - prevY;
    if(dxMove > 0) player.dir = 'right';
    else if(dxMove < 0) player.dir = 'left';
    else if(dyMove > 0) player.dir = 'down';
    else if(dyMove < 0) player.dir = 'up';
    player.walkPhase = (player.walkPhase + 1) % 2;
    player.moving = true;
    setTimeout(()=>{ player.moving = false; }, Math.max(40, STEP_DELAY-20));
    revealAround(player.x, player.y);
    // collect item (color changer)
    if(map[player.y][player.x] === 4){
      map[player.y][player.x] = 1;
      playerColor = '#2b6cb0';
      pickupMessage = { text: 'Couleur changée !', start: performance.now(), x: player.x, y: player.y };
      magnetActive = true;
    }
    // collect if treasure
    if(map[player.y][player.x] === 3){
      map[player.y][player.x] = 1; score += 1; treasuresRemaining -= 1; updateHUD();
      const totalText = score + ' pépite' + (score > 1 ? 's' : '');
      pickupMessage = { text: `(Total: ${totalText})`, start: performance.now(), x: player.x, y: player.y };
      if(treasuresRemaining === 0){ nextLevel(); }
    }
    // attract nearby treasures after each step
    attractTreasures();
    draw();
    i++;
    if(i < path.length){ pathTimer = setTimeout(step, STEP_DELAY); }
    else { pathTimer = null; }
  }
  step();
}

function move(dx,dy){
  const nx = player.x + dx; const ny = player.y + dy;
  if(!canMove(nx,ny)) return;
  const prevX = player.x, prevY = player.y;
  player.x = nx; player.y = ny;
  const dxMove = player.x - prevX, dyMove = player.y - prevY;
  if(dxMove > 0) player.dir = 'right';
  else if(dxMove < 0) player.dir = 'left';
  else if(dyMove > 0) player.dir = 'down';
  else if(dyMove < 0) player.dir = 'up';
  player.walkPhase = (player.walkPhase + 1) % 2;
  player.moving = true; setTimeout(()=>{ player.moving = false; }, Math.max(40, STEP_DELAY-20));
  revealAround(player.x, player.y);
  // collect item (color changer)
  if(map[player.y][player.x] === 4){
    map[player.y][player.x] = 1;
    playerColor = '#2b6cb0';
    pickupMessage = { text: 'Couleur changée !', start: performance.now(), x: player.x, y: player.y };
    magnetActive = true;
  }
  // collect treasure
  if(map[player.y][player.x] === 3){
    map[player.y][player.x] = 1; score += 1; treasuresRemaining -= 1; updateHUD();
    // show pickup message
    const totalText = score + ' pépite' + (score > 1 ? 's' : '');
    pickupMessage = { text: `(Total: ${totalText})`, start: performance.now(), x: player.x, y: player.y };
    if(treasuresRemaining === 0){ nextLevel(); }
  }
  // attract nearby treasures after move
  attractTreasures();
}

window.addEventListener('keydown', e=>{
  if(!running) return;
  const key = e.key;
  if(key === 'ArrowUp' || key === 'w') move(0,-1);
  if(key === 'ArrowDown' || key === 's') move(0,1);
  if(key === 'ArrowLeft' || key === 'a') move(-1,0);
  if(key === 'ArrowRight' || key === 'd') move(1,0);
  draw();
});
pauseBtn.addEventListener('click', ()=>{ running=false; if(animationId) cancelAnimationFrame(animationId); animationId=null; });
resetBtn.addEventListener('click', ()=>{ resetGame(); });

// click-to-move: find path and follow it
canvas.addEventListener('click', e=>{
  // compute grid pos
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const tx = Math.floor(cx / TILE);
  const ty = Math.floor(cy / TILE);
  if(tx<0||tx>=GRID||ty<0||ty>=GRID) return;
  if(!canMove(tx,ty)) return;
  // find shortest path using BFS
  const path = findPath({x:player.x,y:player.y}, {x:tx,y:ty});
  if(path && path.length>0){
    followPath(path);
  }
});

function nextLevel(){
  running = false; if(animationId) cancelAnimationFrame(animationId);
  setTimeout(()=>{
    alert('Niveau ' + level + ' terminé ! Génération du niveau suivant...');
    level += 1;
    // lose magnet power when advancing to the next level
    magnetActive = false;
    updateHUD(); generateMap(); draw();
    setTimeout(()=>{ running=true; loop(); }, 600);
  }, 120);
}

function resetGame(){
  score = 0; level = 1; playerColor = '#ffd166'; magnetActive = false; updateHUD(); generateMap(); draw();
  // auto-start
  if(!running){ running = true; loop(); }
}

function loop(){
  draw();
  if(running) animationId = requestAnimationFrame(loop);
}

// init
resetGame();
