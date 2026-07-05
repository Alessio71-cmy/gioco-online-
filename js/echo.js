'use strict';

// ===== SISTEMA ECO =====
// L'impulso viaggia a ECHO_SPEED: l'informazione torna dopo 2*d/v.
// Giochi sempre con dati vecchi. Tutto (raggio, durata, chiarezza, colore)
// scala con un solo valore: Eco Power.

function echoParamsOf(b) {
  const p = b.power;
  return {
    p,
    range: 460 + 560 * p,
    half: 0.55 + 0.17 * p,
    ttl: 1.7 + 1.5 * p,
    tier: tierOf(p),
  };
}

// errore d'informazione: cala con la potenza, cresce con la distanza
function echoErr(d, p) {
  return (16 + d * 0.05) * (1.15 - 0.85 * p);
}

function emitEcho(b) {
  if (!b.alive || b.battery < CFG.PING_COST) return false;
  b.battery -= CFG.PING_COST;
  const now = Game.now;
  const ep = echoParamsOf(b);
  b.pingFlareT = now; // usare l'eco ti espone: bagliore visibile a tutti

  Game.waves.push({
    x: b.x, y: b.y, dir: b.dir,
    half: ep.half, range: ep.range, t0: now,
    tier: ep.tier, owner: b,
  });
  if (b === Game.player) AudioSys.ping(ep.p);

  // --- pareti: un reveal per raggio, mostrato al tempo del ritorno ---
  const N = CFG.ECHO_RAYS;
  let minWallD = Infinity;
  for (let i = 0; i < N; i++) {
    const a = b.dir - ep.half + (2 * ep.half) * i / (N - 1);
    const hit = castRay(b.x, b.y, Math.cos(a), Math.sin(a), ep.range);
    if (!hit) continue;
    if (hit.d < minWallD) minWallD = hit.d;
    const len = clamp(hit.d * (2 * ep.half / (N - 1)) * 0.62 + 2.5, 3, 26);
    if (Game.reveals.length < CFG.REVEAL_CAP) {
      Game.reveals.push({
        x: hit.x, y: hit.y,
        tx: -hit.ny, ty: hit.nx, len,
        show: now + 2 * hit.d / CFG.ECHO_SPEED,
        ttl: ep.ttl, tier: ep.tier,
      });
    }
  }
  if (b === Game.player && minWallD < ep.range) {
    const s = clamp(1 - minWallD / ep.range, 0, 1);
    sched(now + 2 * minWallD / CFG.ECHO_SPEED, () => AudioSys.wallReturn(s));
  }

  // --- player nel cono ---
  for (const o of Game.blobs) {
    if (o === b || !o.alive) continue;
    const dx = o.x - b.x, dy = o.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d > ep.range + o.r || d < 1) continue;
    const ang = Math.atan2(dy, dx);
    if (Math.abs(angDiff(ang, b.dir)) > ep.half + Math.asin(Math.min(1, o.r / d))) continue;
    const block = castRay(b.x, b.y, Math.cos(ang), Math.sin(ang), d);
    if (block && block.d < d - o.r) continue; // parete in mezzo

    // andata: il bersaglio percepisce di essere stato "toccato"
    sched(now + d / CFG.ECHO_SPEED, () => {
      if (!o.alive || !b.alive) return;
      o.onPinged(b);
      // il ritorno parte dalla posizione REALE al momento del contatto
      const sx = o.x, sy = o.y, sr = o.r, spow = o.power;
      sched(Game.now + d / CFG.ECHO_SPEED, () => {
        if (!b.alive || !o.alive) return;
        b.onEchoReturn(o, sx, sy, sr, spow, d, ep);
      });
    });
  }

  // --- fuga sonora: il ping si sente anche fuori dal cono ---
  const hearR = ep.range * 1.7;
  for (const o of Game.blobs) {
    if (o === b || !o.alive) continue;
    const d = dist(b.x, b.y, o.x, o.y);
    if (d > hearR) continue;
    const sx = b.x, sy = b.y;
    sched(now + d / CFG.ECHO_SPEED, () => {
      if (o.alive && b.alive) o.onHeardPing(b, sx, sy, d, ep);
    });
  }
  return true;
}

function addSmudge(x, y, strong) {
  Game.smudges.push({ x, y, t: Game.now, ttl: strong ? 4.5 : 3.2, strong });
  if (Game.smudges.length > 40) Game.smudges.shift();
}

function runSched() {
  const due = [];
  Game.sched = Game.sched.filter(s => {
    if (s.t <= Game.now) { due.push(s); return false; }
    return true;
  });
  for (const s of due) s.fn();
}

function updateEcho() {
  const now = Game.now;
  Game.waves = Game.waves.filter(w => (now - w.t0) * CFG.ECHO_SPEED < w.range + 60);
  Game.reveals = Game.reveals.filter(r => now < r.show + r.ttl);
  Game.ghosts = Game.ghosts.filter(g => now < g.t + g.ttl);
  Game.smudges = Game.smudges.filter(s => now < s.t + s.ttl);
}
