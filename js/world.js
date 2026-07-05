'use strict';

// Mondo: paratie della nave come rettangoli AABB + spatial hash per raycast/collisioni.
let rayStamp = 0;

function generateWorld(seed) {
  const rng = mulberry32(seed);
  const W = CFG.WORLD_W, H = CFG.WORLD_H, C = CFG.CELL, T = CFG.WALL_T, B = CFG.BORDER;
  const NC = (W / C) | 0; // celle per lato
  const walls = [];

  // perimetro
  walls.push({ x: 0, y: 0, w: W, h: B });
  walls.push({ x: 0, y: H - B, w: W, h: B });
  walls.push({ x: 0, y: 0, w: B, h: H });
  walls.push({ x: W - B, y: 0, w: B, h: H });

  // stato dei segmenti interni: 'none' | 'door' | 'full'
  const V = [], Hh = [];
  for (let i = 1; i < NC; i++) {
    V[i] = [];
    for (let j = 0; j < NC; j++) {
      const r = rng();
      V[i][j] = r < 0.34 ? 'none' : r < 0.78 ? 'door' : 'full';
    }
  }
  for (let j = 1; j < NC; j++) {
    Hh[j] = [];
    for (let i = 0; i < NC; i++) {
      const r = rng();
      Hh[j][i] = r < 0.34 ? 'none' : r < 0.78 ? 'door' : 'full';
    }
  }

  // 3 sale grandi 2x2 (hangar): niente pareti interne
  for (let k = 0; k < 3; k++) {
    const hx = (rng() * (NC - 1)) | 0, hy = (rng() * (NC - 1)) | 0;
    V[hx + 1][hy] = 'none'; V[hx + 1][hy + 1] = 'none';
    Hh[hy + 1][hx] = 'none'; Hh[hy + 1][hx + 1] = 'none';
  }

  // connettività: ogni cella deve avere almeno 2 lati attraversabili
  for (let cx = 0; cx < NC; cx++) {
    for (let cy = 0; cy < NC; cy++) {
      const sides = [];
      if (cx > 0) sides.push(['V', cx, cy]);
      if (cx < NC - 1) sides.push(['V', cx + 1, cy]);
      if (cy > 0) sides.push(['H', cy, cx]);
      if (cy < NC - 1) sides.push(['H', cy + 1, cx]);
      const stOf = s => s[0] === 'V' ? V[s[1]][s[2]] : Hh[s[1]][s[2]];
      let open = sides.filter(s => stOf(s) !== 'full').length;
      let guard = 0;
      while (open < 2 && guard++ < 10) {
        const s = sides[(rng() * sides.length) | 0];
        if (stOf(s) === 'full') {
          if (s[0] === 'V') V[s[1]][s[2]] = 'door'; else Hh[s[1]][s[2]] = 'door';
          open++;
        }
      }
    }
  }

  const emit = (x, y, w, h) => { if (w > 1 && h > 1) walls.push({ x, y, w, h }); };

  for (let i = 1; i < NC; i++) {
    for (let j = 0; j < NC; j++) {
      const st = V[i][j];
      if (st === 'none') continue;
      const x = i * C, y0 = j * C, y1 = y0 + C;
      if (st === 'full') emit(x - T / 2, y0 - T / 2, T, C + T);
      else {
        const gw = 150 + rng() * 70;
        const gc = y0 + C * 0.5 + (rng() - 0.5) * C * 0.3;
        emit(x - T / 2, y0 - T / 2, T, (gc - gw / 2) - (y0 - T / 2));
        emit(x - T / 2, gc + gw / 2, T, (y1 + T / 2) - (gc + gw / 2));
      }
    }
  }
  for (let j = 1; j < NC; j++) {
    for (let i = 0; i < NC; i++) {
      const st = Hh[j][i];
      if (st === 'none') continue;
      const y = j * C, x0 = i * C, x1 = x0 + C;
      if (st === 'full') emit(x0 - T / 2, y - T / 2, C + T, T);
      else {
        const gw = 150 + rng() * 70;
        const gc = x0 + C * 0.5 + (rng() - 0.5) * C * 0.3;
        emit(x0 - T / 2, y - T / 2, (gc - gw / 2) - (x0 - T / 2), T);
        emit(gc + gw / 2, y - T / 2, (x1 + T / 2) - (gc + gw / 2), T);
      }
    }
  }

  // pilastri e container sparsi nelle stanze
  for (let k = 0; k < 26; k++) {
    const cx = (rng() * NC) | 0, cy = (rng() * NC) | 0;
    const m = 175;
    let w, h;
    if (rng() < 0.3) { w = 42 + rng() * 40; h = 150 + rng() * 60; }   // container lungo
    else { w = 55 + rng() * 80; h = w * (0.7 + rng() * 0.6); }        // pilastro
    if (rng() < 0.5) { const t2 = w; w = h; h = t2; }
    const x = cx * C + m + rng() * Math.max(1, C - 2 * m - w);
    const y = cy * C + m + rng() * Math.max(1, C - 2 * m - h);
    emit(x, y, w, h);
  }

  // spatial hash
  const HS = CFG.HASH;
  const cols = Math.ceil(W / HS), rows = Math.ceil(H / HS);
  const grid = new Array(cols * rows);
  walls.forEach((wl, idx) => {
    wl.stamp = 0;
    const x0 = clamp((wl.x / HS) | 0, 0, cols - 1);
    const x1 = clamp(((wl.x + wl.w) / HS) | 0, 0, cols - 1);
    const y0 = clamp((wl.y / HS) | 0, 0, rows - 1);
    const y1 = clamp(((wl.y + wl.h) / HS) | 0, 0, rows - 1);
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++) {
        const key = gx + gy * cols;
        (grid[key] || (grid[key] = [])).push(idx);
      }
  });

  Game.world = { W, H, walls, grid, cols, rows, strips: [] };

  // strisce guida luminose sul pavimento (ambientazione visibile nel buio)
  for (let k = 0; k < 70; k++) {
    const p = randomOpenPos(34);
    Game.world.strips.push({
      x: p.x, y: p.y,
      horiz: rng() < 0.5,
      len: 70 + rng() * 70,
      pink: rng() > 0.78,
      phase: rng() * TAU,
    });
  }
}

function forEachWallNear(x, y, r, cb) {
  const wd = Game.world, HS = CFG.HASH;
  const x0 = clamp(((x - r) / HS) | 0, 0, wd.cols - 1);
  const x1 = clamp(((x + r) / HS) | 0, 0, wd.cols - 1);
  const y0 = clamp(((y - r) / HS) | 0, 0, wd.rows - 1);
  const y1 = clamp(((y + r) / HS) | 0, 0, wd.rows - 1);
  rayStamp++;
  for (let gy = y0; gy <= y1; gy++)
    for (let gx = x0; gx <= x1; gx++) {
      const list = wd.grid[gx + gy * wd.cols];
      if (!list) continue;
      for (const idx of list) {
        const w = wd.walls[idx];
        if (w.stamp === rayStamp) continue;
        w.stamp = rayStamp;
        cb(w);
      }
    }
}

// intersezione raggio-AABB (slab), ritorna {t, axis} o null
function rayRect(px, py, dx, dy, w) {
  const ix = 1 / dx, iy = 1 / dy;
  const tx1 = (w.x - px) * ix, tx2 = (w.x + w.w - px) * ix;
  const ty1 = (w.y - py) * iy, ty2 = (w.y + w.h - py) * iy;
  const txmin = Math.min(tx1, tx2), txmax = Math.max(tx1, tx2);
  const tymin = Math.min(ty1, ty2), tymax = Math.max(ty1, ty2);
  let axis, tmin;
  if (txmin > tymin) { tmin = txmin; axis = 0; } else { tmin = tymin; axis = 1; }
  const tmax = Math.min(txmax, tymax);
  if (tmax < 0 || tmin > tmax) return null;
  return { t: tmin < 0 ? 0 : tmin, axis };
}

// raycast sul mondo via DDA sulla griglia hash → {d,x,y,nx,ny} | null
function castRay(px, py, dx, dy, maxD) {
  if (dx === 0) dx = 1e-9;
  if (dy === 0) dy = 1e-9;
  const wd = Game.world, HS = CFG.HASH;
  let cx = clamp((px / HS) | 0, 0, wd.cols - 1);
  let cy = clamp((py / HS) | 0, 0, wd.rows - 1);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = Math.abs(HS / dx), tDeltaY = Math.abs(HS / dy);
  let tMaxX = (dx > 0 ? (cx + 1) * HS - px : px - cx * HS) / Math.abs(dx);
  let tMaxY = (dy > 0 ? (cy + 1) * HS - py : py - cy * HS) / Math.abs(dy);

  rayStamp++;
  let best = maxD + 1, bAxis = 0;
  let t = 0;
  while (t <= maxD) {
    const list = wd.grid[cx + cy * wd.cols];
    if (list) {
      for (const idx of list) {
        const w = wd.walls[idx];
        if (w.stamp === rayStamp) continue;
        w.stamp = rayStamp;
        const hit = rayRect(px, py, dx, dy, w);
        if (hit && hit.t < best) { best = hit.t; bAxis = hit.axis; }
      }
    }
    // se il colpo migliore cade prima del confine della prossima cella, è definitivo
    const nextT = Math.min(tMaxX, tMaxY);
    if (best <= nextT) break;
    if (tMaxX < tMaxY) { t = tMaxX; cx += stepX; tMaxX += tDeltaX; }
    else { t = tMaxY; cy += stepY; tMaxY += tDeltaY; }
    if (cx < 0 || cy < 0 || cx >= wd.cols || cy >= wd.rows) break;
  }
  if (best > maxD) return null;
  return {
    d: best,
    x: px + dx * best,
    y: py + dy * best,
    nx: bAxis === 0 ? (dx > 0 ? -1 : 1) : 0,
    ny: bAxis === 1 ? (dy > 0 ? -1 : 1) : 0,
  };
}

// risoluzione cerchio-muri (scivolamento lungo le pareti)
function resolveCircle(o, r) {
  forEachWallNear(o.x, o.y, r + 40, w => {
    const cx = clamp(o.x, w.x, w.x + w.w);
    const cy = clamp(o.y, w.y, w.y + w.h);
    const dx = o.x - cx, dy = o.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    if (d < 0.001) {
      // centro dentro il muro: espelli lungo l'asse più vicino
      const left = o.x - w.x, right = w.x + w.w - o.x, top = o.y - w.y, bot = w.y + w.h - o.y;
      const m = Math.min(left, right, top, bot);
      if (m === left) o.x = w.x - r;
      else if (m === right) o.x = w.x + w.w + r;
      else if (m === top) o.y = w.y - r;
      else o.y = w.y + w.h + r;
      return;
    }
    const push = (r - d) / d;
    o.x += dx * push;
    o.y += dy * push;
  });
  o.x = clamp(o.x, CFG.BORDER + r, CFG.WORLD_W - CFG.BORDER - r);
  o.y = clamp(o.y, CFG.BORDER + r, CFG.WORLD_H - CFG.BORDER - r);
}

function isOpen(x, y, clear) {
  let ok = true;
  forEachWallNear(x, y, clear + 10, w => {
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < clear * clear) ok = false;
  });
  return ok;
}

// punto libero casuale; opzionale: entro [minD,maxD] da (nx,ny)
function randomOpenPos(clear, nx, ny, minD, maxD) {
  const B = CFG.BORDER;
  for (let i = 0; i < 90; i++) {
    let x, y;
    if (nx !== undefined) {
      const a = rand(TAU), d = rand(minD, maxD);
      x = nx + Math.cos(a) * d;
      y = ny + Math.sin(a) * d;
      if (x < B + clear + 20 || y < B + clear + 20 || x > CFG.WORLD_W - B - clear - 20 || y > CFG.WORLD_H - B - clear - 20) continue;
    } else {
      x = rand(B + clear + 20, CFG.WORLD_W - B - clear - 20);
      y = rand(B + clear + 20, CFG.WORLD_H - B - clear - 20);
    }
    if (isOpen(x, y, clear)) return { x, y };
  }
  return { x: CFG.WORLD_W / 2, y: CFG.WORLD_H / 2 };
}

// ===== Energia ambientale (motes) =====
function spawnMote() {
  const p = randomOpenPos(26);
  Game.motes.push({ x: p.x, y: p.y, phase: rand(TAU) });
}

function initMotes() {
  for (let i = 0; i < CFG.MOTE_COUNT; i++) spawnMote();
}
