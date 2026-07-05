'use strict';

// ===== Boot, input e game loop =====
let canvas, ctx;
let vw = 0, vh = 0, dpr = 1;
let lastTs = 0;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = vw * dpr;
  canvas.height = vh * dpr;
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
}

function spawnPlayer(name, skin) {
  removePlayer();
  // spawn lontano dai bot: nessuna morte istantanea
  let pos = null;
  for (let i = 0; i < 40 && !pos; i++) {
    const p = randomOpenPos(50);
    if (Game.blobs.every(b => !b.alive || dist(p.x, p.y, b.x, b.y) > 550)) pos = p;
  }
  if (!pos) pos = randomOpenPos(50);
  const b = new Blob({ name, skin, x: pos.x, y: pos.y, xp: 0 });
  Game.player = b;
  Game.blobs.push(b);
  Game.cam.x = b.x;
  Game.cam.y = b.y;
  Game.state = 'play';
}

function respawnPlayer() {
  const me = Game.player;
  spawnPlayer(me ? me.name : 'SENZA NOME', me ? me.skin : SKINS[0]);
}

function removePlayer() {
  if (!Game.player) return;
  const i = Game.blobs.indexOf(Game.player);
  if (i >= 0) Game.blobs.splice(i, 1);
  Game.player = null;
}

// ===== Input =====
function setupInput() {
  window.addEventListener('mousemove', e => {
    Game.mouse.x = e.clientX;
    Game.mouse.y = e.clientY;
  });

  window.addEventListener('mousedown', e => {
    AudioSys.resume();
    if (Game.state === 'play' && Game.player && e.target === canvas) {
      Game.player.tryAttack();
    }
  });

  window.addEventListener('contextmenu', e => {
    if (e.target === canvas) e.preventDefault();
  });

  window.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'BUTTON')) return;
    e.preventDefault();
    if (Game.state === 'play' && Game.player) Game.player.echoHold = true;
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space' && Game.player) Game.player.echoHold = false;
  });

  window.addEventListener('blur', () => {
    if (Game.player) Game.player.echoHold = false;
  });

  // touch: trascina per dirigere, pulsanti ECO/ATK
  canvas.addEventListener('touchstart', onTouch, { passive: false });
  canvas.addEventListener('touchmove', onTouch, { passive: false });
  function onTouch(e) {
    e.preventDefault();
    if (!e.touches.length) return;
    Game.mouse.x = e.touches[0].clientX;
    Game.mouse.y = e.touches[0].clientY;
  }
  const btnEco = document.getElementById('btnEco');
  const btnAtk = document.getElementById('btnAtk');
  btnEco.addEventListener('touchstart', e => { e.preventDefault(); if (Game.player) Game.player.echoHold = true; });
  btnEco.addEventListener('touchend', e => { e.preventDefault(); if (Game.player) Game.player.echoHold = false; });
  btnAtk.addEventListener('touchstart', e => { e.preventDefault(); if (Game.state === 'play' && Game.player) Game.player.tryAttack(); });
}

// ===== Update =====
function update(dt) {
  runSched();

  // direzione del player verso il mouse (in coordinate schermo)
  const me = Game.player;
  if (Game.state === 'play' && me && me.alive) {
    const zoom = Game.cam.zoom * (1 + Game.cam.zoomPulse);
    const sx = (me.x - Game.cam.x) * zoom + vw / 2;
    const sy = (me.y - Game.cam.y) * zoom + vh / 2;
    const dx = Game.mouse.x - sx, dy = Game.mouse.y - sy;
    if (dx * dx + dy * dy > 100) me.targetDir = Math.atan2(dy, dx);
  }

  for (const b of Game.blobs) {
    if (!b.alive) continue;
    if (b.brain) b.brain.update(dt);
    b.update(dt);
  }

  updateFragments(dt);
  updateMotes(dt);
  updateParticles(dt);
  updateEcho();

  // camera: segue il player con un piccolo anticipo nella direzione di marcia
  const cam = Game.cam;
  let tx = cam.x, ty = cam.y, tz = 1;
  if (me) {
    tx = me.x + Math.cos(me.dir) * 46;
    ty = me.y + Math.sin(me.dir) * 46;
    tz = 1 / (1 + me.power * 0.16);
  } else {
    // spettatore dietro al menu: segui il bot più forte
    let best = null;
    for (const b of Game.blobs) if (b.alive && (!best || b.score > best.score)) best = b;
    if (best) { tx = best.x; ty = best.y; }
    tz = 0.82;
  }
  const k = 1 - Math.exp(-4 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.zoom += (tz - cam.zoom) * k;
  cam.shake *= Math.exp(-5.5 * dt);
  cam.zoomPulse *= Math.exp(-4 * dt);
  Game.redFlash = Math.max(0, Game.redFlash - dt * 1.4);
}

// ===== Loop =====
function frame(ts) {
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  Game.now += dt;

  update(dt);

  Renderer.render(ctx, vw, vh, dpr);

  Minimap.render();
  UI.update(dt);

  requestAnimationFrame(frame);
}

// ===== Avvio =====
window.addEventListener('load', () => {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  generateWorld((Math.random() * 1e9) | 0);
  initMotes();
  for (let i = 0; i < CFG.BOT_COUNT; i++) Game.blobs.push(makeBot());

  UI.init();
  Minimap.init();
  setupInput();

  requestAnimationFrame(frame);
});
