Sprites folder

Place here your sprite images and organize them in subfolders.

Recommended structure:

- sprites/
  - player/               # player animation frames (PNG)
    - idle_0.png
    - idle_1.png
    - walk_0.png
    - walk_1.png
  - enemies/              # enemy sprites (one folder per enemy type)
    - slimes/
      - idle_0.png
      - idle_1.png
      - attack_0.png
  - tiles/                # tileset images (tiles.png or individual tile files)
    - tiles.png
  - items/                # items and pickups
    - color_item.png
    - treasure.png

Naming & sizes:
- Use PNG with transparent background for characters and items.
- Default tile size in the game is 32x32 px (TILE constant). Keep sprites aligned to this grid for easier rendering.
- Player/enemy frames: keep consistent frame size (e.g., 32x32 or 64x64) and name frames sequentially.

Using sprites in `explore.js`:
- Load images with `new Image()` and draw them using `ctx.drawImage(img, x, y)`.
- Use `TILE` constant to position sprites on grid: `ctx.drawImage(img, tileX * TILE, tileY * TILE)`.

Tips:
- For animated sprites, store arrays of frames and advance index based on `player.walkPhase` or a timer.
- Keep filenames descriptive (e.g., `player_walk_0.png`) to simplify code that auto-loads frames.

Example loader snippet (to add in your JS):

const imgs = {};
function loadSprite(name, src){
  return new Promise(resolve => { const img = new Image(); img.onload = ()=>{ imgs[name]=img; resolve(img); }; img.src = src; });
}

// usage:
// await loadSprite('player_idle_0', 'sprites/player/idle_0.png');

