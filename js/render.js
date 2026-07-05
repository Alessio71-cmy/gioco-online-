'use strict';

// ===== Renderer =====
// Buio vivo: il mondo appare solo dove l'eco lo rivela. Glow additivo,
// pavimento pseudo-3D visibile solo intorno a te, polvere in parallasse.
const Renderer = (() => {
  let floorCv = null, floorCtx = null;
  let dustA = null, dustB = null;
  const DUST_TILE = 1400;
  let vw = 0, vh = 0, camL = 0, camT = 0, zoom = 1;

  function makeDust(n, rMax) {
    const pts = [];
    const rng = mulberry32(12345 + n);
    for (let i = 0; i < n; i++) {
      pts.push({ x: rng() * DUST_TILE, y: rng() * DUST_TILE, r: 0.5 + rng() * rMax, a: 0.05 + rng() * 0.16 });
    }
    return pts;
  }

  function inView(x, y, pad) {
    return x > camL - pad && x < camL + vw / zoom + pad && y > camT - pad && y < camT + vh / zoom + pad;
  }

  function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // hash deterministico per pannello → dettagli stabili del pavimento
  function panelHash(ix, iy) {
    let h = ix * 374761393 + iy * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  }

  // ---- bolla di luce: attorno al player l'ambiente si vede DAVVERO ----
  // Pavimento, pannelli, decal e pareti pseudo-3D disegnati in un offscreen
  // world-aligned, poi mascherati con un gradiente radiale pieno e sfumato.
  function drawLightBubble(ctx, px, py) {
    const S = CFG.LIGHT_R * 2 + 20, HFS = S / 2;
    if (!floorCv || floorCv.width !== S) {
      floorCv = document.createElement('canvas');
      floorCv.width = floorCv.height = S;
      floorCtx = floorCv.getContext('2d');
    }
    const c = floorCtx;
    const wx = x => x - px + HFS, wy = y => y - py + HFS;
    c.clearRect(0, 0, S, S);

    // base metallica del pavimento
    c.fillStyle = '#13233a';
    c.fillRect(0, 0, S, S);

    const g1 = 120, g2 = 600;
    const px0 = Math.floor((px - HFS) / g2) * g2;
    const py0 = Math.floor((py - HFS) / g2) * g2;

    // pannelli 600x600 con tinta variata + decal deterministici
    for (let gx = px0; gx <= px + HFS; gx += g2) {
      for (let gy = py0; gy <= py + HFS; gy += g2) {
        const h = panelHash(gx / g2, gy / g2);
        const v = (h % 256) / 255;
        c.fillStyle = `rgba(${24 + v * 20 | 0},${42 + v * 24 | 0},${62 + v * 28 | 0},0.7)`;
        c.fillRect(wx(gx), wy(gy), g2, g2);

        // decal: prese d'aria, frecce, strisce di pericolo, graffi
        const t = (h >>> 4) % 8;
        const dx = wx(gx + 90 + ((h >>> 8) % 400));
        const dy = wy(gy + 90 + ((h >>> 16) % 400));
        c.strokeStyle = 'rgba(130,200,240,0.65)';
        c.fillStyle = 'rgba(130,200,240,0.5)';
        c.lineWidth = 2;
        if (t === 0) {          // presa d'aria circolare
          c.beginPath(); c.arc(dx, dy, 26, 0, TAU); c.stroke();
          c.beginPath();
          for (let i = -1; i <= 1; i++) { c.moveTo(dx - 18, dy + i * 9); c.lineTo(dx + 18, dy + i * 9); }
          c.stroke();
        } else if (t === 1) {   // doppia freccia di corridoio
          c.beginPath();
          for (let i = 0; i < 2; i++) {
            c.moveTo(dx - 12 + i * 22, dy - 12); c.lineTo(dx + 2 + i * 22, dy); c.lineTo(dx - 12 + i * 22, dy + 12);
          }
          c.stroke();
        } else if (t === 2) {   // strisce di pericolo
          c.save();
          c.beginPath(); c.rect(dx - 34, dy - 12, 68, 24); c.clip();
          c.strokeStyle = 'rgba(230,190,80,0.4)';
          c.lineWidth = 6;
          c.beginPath();
          for (let i = -5; i < 6; i++) { c.moveTo(dx + i * 14 - 12, dy + 14); c.lineTo(dx + i * 14 + 12, dy - 14); }
          c.stroke();
          c.restore();
        } else if (t === 3) {   // botola quadrata
          c.strokeRect(dx - 22, dy - 22, 44, 44);
          c.strokeRect(dx - 14, dy - 14, 28, 28);
        } else if (t === 4) {   // graffi
          c.strokeStyle = 'rgba(140,170,190,0.25)';
          c.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = ((h >>> (i * 3)) % 100) / 100 * TAU, l = 14 + (h >>> (i * 4)) % 22;
            c.moveTo(dx + i * 9, dy + i * 7);
            c.lineTo(dx + i * 9 + Math.cos(a) * l, dy + i * 7 + Math.sin(a) * l);
          }
          c.stroke();
        } else if (t === 5) {   // codice settore
          c.fillRect(dx, dy, 30, 5); c.fillRect(dx, dy + 9, 18, 5); c.fillRect(dx + 22, dy + 9, 8, 5);
        }
      }
    }

    // griglia fine
    c.strokeStyle = 'rgba(80,155,205,0.4)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = Math.floor((px - HFS) / g1) * g1; x <= px + HFS; x += g1) { c.moveTo(wx(x), 0); c.lineTo(wx(x), S); }
    for (let y = Math.floor((py - HFS) / g1) * g1; y <= py + HFS; y += g1) { c.moveTo(0, wy(y)); c.lineTo(S, wy(y)); }
    c.stroke();

    // giunzioni dei pannelli + bulloni
    c.strokeStyle = 'rgba(105,190,240,0.6)';
    c.lineWidth = 3;
    c.beginPath();
    for (let x = px0; x <= px + HFS; x += g2) { c.moveTo(wx(x), 0); c.lineTo(wx(x), S); }
    for (let y = py0; y <= py + HFS; y += g2) { c.moveTo(0, wy(y)); c.lineTo(S, wy(y)); }
    c.stroke();
    c.fillStyle = 'rgba(140,210,245,0.7)';
    for (let x = px0; x <= px + HFS; x += g2) {
      for (let y = py0; y <= py + HFS; y += g2) {
        c.beginPath(); c.arc(wx(x), wy(y), 3.2, 0, TAU); c.fill();
      }
    }

    // pareti pseudo-3D dentro la luce: corpo, faccia superiore rialzata, neon alla base
    forEachWallNear(px, py, HFS + 40, w => {
      const x = wx(w.x), y = wy(w.y);
      c.fillStyle = '#0d1a29';                       // fianco in ombra
      c.fillRect(x, y, w.w, w.h);
      c.fillStyle = 'rgba(70,225,255,0.45)';         // striscia luminosa alla base
      c.fillRect(x - 2, y + w.h, w.w + 4, 3.5);
      c.fillStyle = '#1e3d5e';                       // faccia superiore (estrusa)
      c.fillRect(x, y - 12, w.w, w.h);
      c.strokeStyle = 'rgba(125,205,250,0.7)';
      c.lineWidth = 1.6;
      c.strokeRect(x, y - 12, w.w, w.h);
      // pannellatura sulla faccia superiore
      c.strokeStyle = 'rgba(70,140,190,0.3)';
      c.lineWidth = 1;
      c.beginPath();
      if (w.w > w.h) for (let sx = w.x + 60; sx < w.x + w.w; sx += 60) { c.moveTo(wx(sx), y - 12); c.lineTo(wx(sx), y - 12 + w.h); }
      else for (let sy = w.y + 60; sy < w.y + w.h; sy += 60) { c.moveTo(x, wy(sy) - 12); c.lineTo(x + w.w, wy(sy) - 12); }
      c.stroke();
    });

    // maschera radiale: luce piena al centro, sfuma fino al buio
    const grad = c.createRadialGradient(HFS, HFS, 26, HFS, HFS, HFS - 8);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.88)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = grad;
    c.fillRect(0, 0, S, S);
    c.globalCompositeOperation = 'source-over';

    ctx.drawImage(floorCv, px - HFS, py - HFS);
  }

  // ---- corpo del blob (condiviso con le anteprime del menu) ----
  function blobPath(ctx, r, t, seed, droop) {
    const N = 16;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU;
      let rr = r * (1 + 0.055 * Math.sin(a * 3 + t * 2.1 + seed) + 0.04 * Math.sin(a * 5 - t * 1.7 + seed * 2));
      if (droop) rr *= 1 + 0.12 * Math.max(0, Math.sin(a));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  // disegna un blob centrato in (0,0), orientato verso +x
  function drawBlobShape(ctx, skin, r, t, seed, alpha, opts = {}) {
    const droop = skin.id === 'slime';
    ctx.globalAlpha = alpha;

    // alone
    const halo = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.2);
    halo.addColorStop(0, hexA(skin.glow, 0.34 * alpha));
    halo.addColorStop(1, hexA(skin.glow, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, TAU);
    ctx.fill();

    // corpo
    blobPath(ctx, r, t, seed, droop);
    const body = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.2, 0, 0, r * 1.25);
    if (skin.id === 'void') {
      body.addColorStop(0, '#1c2246');
      body.addColorStop(1, '#05060f');
    } else {
      body.addColorStop(0, skin.glow);
      body.addColorStop(0.55, skin.body);
      body.addColorStop(1, skin.dark);
    }
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = hexA(skin.rim, 0.85 * alpha);
    ctx.lineWidth = skin.id === 'void' ? 2.2 : 1.4;
    ctx.stroke();

    // dettagli skin
    if (skin.id === 'void') {
      ctx.fillStyle = hexA(skin.rim, 0.6 * alpha);
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4 + seed;
        ctx.beginPath();
        ctx.arc(Math.cos(a + t * 0.4) * r * 0.5, Math.sin(a * 1.7 + t * 0.3) * r * 0.5, 1.3, 0, TAU);
        ctx.fill();
      }
    }
    if (skin.id === 'glitch' && Math.sin(t * 9 + seed) > 0.45) {
      ctx.save();
      const y0 = -r + ((t * 60 + seed * 37) % (2 * r));
      ctx.beginPath();
      ctx.rect(-r * 1.5, y0, r * 3, r * 0.3);
      ctx.clip();
      blobPath(ctx, r, t, seed, droop);
      ctx.translate(5, 0);
      ctx.fillStyle = hexA('#ff4d6b', 0.5 * alpha);
      ctx.fill();
      ctx.restore();
    }
    if (skin.id === 'slime') {
      // goccioline satelliti
      for (let i = 0; i < 3; i++) {
        const a = seed + i * 2.1 + t * 0.8;
        const dd = r * (1.3 + 0.25 * Math.sin(t * 1.9 + i));
        ctx.beginPath();
        ctx.arc(Math.cos(a) * dd, Math.abs(Math.sin(a)) * dd * 0.6 + r * 0.5, r * 0.12, 0, TAU);
        ctx.fillStyle = hexA(skin.body, 0.7 * alpha);
        ctx.fill();
      }
    }

    // occhio unico (guarda avanti = +x)
    if (!opts.noEye) {
      const ex = r * 0.32, er = r * 0.34;
      const blink = Math.abs(Math.sin(t * 0.7 + seed * 3)) > 0.985 ? 0.15 : 1;
      ctx.save();
      ctx.translate(ex, -r * 0.05);
      ctx.scale(1, blink);
      ctx.beginPath();
      ctx.arc(0, 0, er, 0, TAU);
      ctx.fillStyle = '#f2fbff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,20,30,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(er * 0.3, 0, er * 0.42, 0, TAU);
      ctx.fillStyle = '#101623';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(er * 0.45, -er * 0.2, er * 0.13, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBlob(ctx, b, alpha) {
    const now = Game.now;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.dir);

    // affondo dell'attacco + compressione quando colpisce
    let sx = 1, sy = 1;
    const at = (now - b.attackAnimT) / 0.32;
    if (at >= 0 && at < 1) {
      const k = Math.sin(Math.PI * at);
      sx = 1 + 0.35 * k;
      sy = 1 - 0.22 * k;
    }
    const st = (now - b.squashT) / 0.22;
    if (st >= 0 && st < 1) {
      sx *= 1 - 0.3 * Math.sin(Math.PI * st);
      sy *= 1 + 0.2 * Math.sin(Math.PI * st);
    }
    ctx.scale(sx, sy);

    drawBlobShape(ctx, b.skin, b.r, now, b.wobSeed, alpha);

    // flash quando viene colpito
    const ht = (now - b.hitT) / 0.25;
    if (ht >= 0 && ht < 1) {
      blobPath(ctx, b.r, now, b.wobSeed, b.skin.id === 'slime');
      ctx.fillStyle = `rgba(255,90,110,${(1 - ht) * 0.55 * alpha})`;
      ctx.fill();
    }
    // protezione spawn
    if (b.protected) {
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 9, 0, TAU);
      ctx.setLineDash([6, 7]);
      ctx.strokeStyle = `rgba(180,240,255,${(0.4 + 0.25 * Math.sin(now * 8)) * alpha})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // etichette in spazio non ruotato
    if (b !== Game.player && alpha > 0.4) {
      ctx.globalAlpha = alpha * 0.75;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#bfe6f5';
      ctx.fillText(b.name.toUpperCase(), b.x, b.y - b.r - 14);
      // mini barra hp
      const bw = 34;
      ctx.fillStyle = 'rgba(20,30,44,0.8)';
      ctx.fillRect(b.x - bw / 2, b.y - b.r - 10, bw, 3);
      ctx.fillStyle = TIER_COLORS[b.tier];
      ctx.fillRect(b.x - bw / 2, b.y - b.r - 10, bw * clamp(b.hp / b.maxHp, 0, 1), 3);
      ctx.globalAlpha = 1;
    }
  }

  // quanto è visibile un altro blob per l'osservatore
  function blobAlpha(b, ox, oy) {
    const now = Game.now;
    const d = dist(b.x, b.y, ox, oy);
    if (d > 1300) return 0;
    let a = clamp(1 - (d - CFG.NEAR_LIGHT * 0.55) / (CFG.NEAR_LIGHT * 0.45), 0, 1);
    const ft = now - b.pingFlareT;
    if (ft >= 0 && ft < 0.9) a = Math.max(a, (1 - ft / 0.9) * 0.85); // l'eco ti espone
    const ht = now - b.hitT;
    if (ht >= 0 && ht < 0.5) a = Math.max(a, (1 - ht / 0.5) * 0.9);
    const at = now - b.attackAnimT;
    if (at >= 0 && at < 0.4) a = Math.max(a, (1 - at / 0.4) * 0.7);
    return a;
  }

  function render(ctx, w, h, dpr) {
    const now = Game.now;
    const cam = Game.cam;
    vw = w; vh = h;
    zoom = cam.zoom * (1 + cam.zoomPulse);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, w, h);

    // ---- polvere in parallasse (spazio schermo) ----
    if (!dustA) { dustA = makeDust(70, 1.2); dustB = makeDust(50, 1.9); }
    for (const [pts, f] of [[dustA, 0.35], [dustB, 0.62]]) {
      ctx.fillStyle = '#7fb8d8';
      for (const p of pts) {
        let sx = (p.x - cam.x * f) % DUST_TILE; if (sx < 0) sx += DUST_TILE;
        let sy = (p.y - cam.y * f) % DUST_TILE; if (sy < 0) sy += DUST_TILE;
        for (let tx = -1; tx * DUST_TILE + sx < w + DUST_TILE; tx++) {
          for (let ty = -1; ty * DUST_TILE + sy < h + DUST_TILE; ty++) {
            const px = tx * DUST_TILE + sx, py = ty * DUST_TILE + sy;
            if (px < -10 || py < -10 || px > w + 10 || py > h + 10) continue;
            ctx.globalAlpha = p.a * 0.5;
            ctx.fillRect(px, py, p.r, p.r);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---- trasformazione camera ----
    const shx = (Math.random() - 0.5) * cam.shake;
    const shy = (Math.random() - 0.5) * cam.shake;
    camL = cam.x - w / 2 / zoom;
    camT = cam.y - h / 2 / zoom;
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, (-camL * zoom + shx) * dpr, (-camT * zoom + shy) * dpr);

    const me = Game.player;
    const ox = me ? me.x : cam.x;
    const oy = me ? me.y : cam.y;

    // bolla di luce: pavimento + pareti visibili attorno all'osservatore
    drawLightBubble(ctx, ox, oy);

    // ---- luce additiva da qui in poi ----
    ctx.globalCompositeOperation = 'lighter';

    // alone pieno e sfumato che parte dal corpo del blob
    {
      const skin = me ? me.skin : SKINS[0];
      const lr = CFG.LIGHT_R;
      const lg = ctx.createRadialGradient(ox, oy, 8, ox, oy, lr);
      lg.addColorStop(0, hexA(skin.glow, 0.2));
      lg.addColorStop(0.35, 'rgba(135,190,225,0.09)');
      lg.addColorStop(1, 'rgba(135,190,225,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(ox, oy, lr, 0, TAU);
      ctx.fill();
    }

    // strisce guida luminose sul pavimento (si vedono anche oltre la bolla)
    for (const s of Game.world.strips) {
      const d = dist(s.x, s.y, ox, oy);
      if (d > 720 || !inView(s.x, s.y, 80)) continue;
      const a = clamp(1 - d / 720, 0, 1) * (0.4 + 0.18 * Math.sin(now * 2.2 + s.phase));
      const col = s.pink ? '255,110,220' : '80,225,255';
      const hl = s.horiz ? s.len / 2 : 0, vl = s.horiz ? 0 : s.len / 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${col},${a * 0.22})`;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(s.x - hl, s.y - vl);
      ctx.lineTo(s.x + hl, s.y + vl);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${col},${a})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // energia ambientale
    for (const m of Game.motes) {
      const d = dist(m.x, m.y, ox, oy);
      if (d > 400 || !inView(m.x, m.y, 30)) continue;
      const a = clamp(1 - d / 400, 0, 1) * (0.5 + 0.3 * Math.sin(now * 2.4 + m.phase));
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 9);
      g.addColorStop(0, `rgba(120,255,220,${a})`);
      g.addColorStop(1, 'rgba(120,255,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, TAU);
      ctx.fill();
    }

    // frammenti organici
    for (const f of Game.fragments) {
      const d = dist(f.x, f.y, ox, oy);
      if (d > 560 || !inView(f.x, f.y, 30)) continue;
      const life = 1 - (now - f.t) / f.ttl;
      const a = clamp(1 - d / 560, 0, 1) * clamp(life * 3, 0, 1) * 0.9;
      const wob = 1 + 0.25 * Math.sin(now * 5 + f.phase);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2.4);
      g.addColorStop(0, `rgba(190,255,235,${a})`);
      g.addColorStop(0.45, `rgba(90,235,200,${a * 0.7})`);
      g.addColorStop(1, 'rgba(90,235,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 2.4 * wob, 0, TAU);
      ctx.fill();
      // secondo lobo: forma organica, non pallino
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(f.phase + now * 2) * f.r * 0.8, f.y + Math.sin(f.phase + now * 2) * f.r * 0.8, f.r * 0.9, 0, TAU);
      ctx.fillStyle = `rgba(160,255,225,${a * 0.5})`;
      ctx.fill();
    }

    // segmenti di parete rivelati dall'eco
    for (const rv of Game.reveals) {
      if (now < rv.show) continue;
      if (!inView(rv.x, rv.y, 40)) continue;
      const k = (now - rv.show) / rv.ttl;
      const a = (k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.92);
      const col = TIER_COLORS[rv.tier];
      ctx.strokeStyle = hexA(col, a * 0.22);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(rv.x - rv.tx * rv.len, rv.y - rv.ty * rv.len);
      ctx.lineTo(rv.x + rv.tx * rv.len, rv.y + rv.ty * rv.len);
      ctx.stroke();
      ctx.strokeStyle = hexA(col, a * 0.85);
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }

    // fronti d'onda eco (il colore comunica la potenza)
    for (const wv of Game.waves) {
      const R = (now - wv.t0) * CFG.ECHO_SPEED;
      if (R > wv.range || !inView(wv.x, wv.y, wv.range)) continue;
      const a = (1 - R / wv.range) * 0.8;
      const col = TIER_COLORS[wv.tier];
      ctx.strokeStyle = hexA(col, a * 0.55);
      ctx.lineWidth = 3 + wv.tier * 1.6;
      ctx.beginPath();
      ctx.arc(wv.x, wv.y, Math.max(R, 1), wv.dir - wv.half, wv.dir + wv.half);
      ctx.stroke();
      if (R > 26) {
        ctx.strokeStyle = hexA(col, a * 0.25);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wv.x, wv.y, R * 0.86, wv.dir - wv.half * 0.9, wv.dir + wv.half * 0.9);
        ctx.stroke();
      }
    }

    // fantasmi dei ritorni eco: posizioni vecchie, sfocate
    for (const gh of Game.ghosts) {
      const k = (now - gh.t) / gh.ttl;
      const a = (1 - k) * 0.6;
      const col = TIER_COLORS[gh.tier];
      const rr = gh.r * (1 + k * 0.4);
      const g = ctx.createRadialGradient(gh.x, gh.y, 0, gh.x, gh.y, rr * 2);
      g.addColorStop(0, hexA(col, a));
      g.addColorStop(0.5, hexA(col, a * 0.35));
      g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gh.x, gh.y, rr * 2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = hexA(col, a * 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(gh.x, gh.y, rr, 0, TAU);
      ctx.stroke();
    }

    // particelle
    for (const p of Game.particles) {
      const k = (now - p.t) / p.ttl;
      const a = 1 - k;
      if (p.type === 'dot') {
        ctx.fillStyle = hexA(p.color, a * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, TAU);
        ctx.fill();
      } else if (p.type === 'ring') {
        ctx.strokeStyle = hexA(p.color, a * 0.7);
        ctx.lineWidth = 3 * a + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, lerp(p.r0, p.r1, k), 0, TAU);
        ctx.stroke();
      } else if (p.type === 'arc') {
        ctx.strokeStyle = hexA(p.color, a * 0.85);
        ctx.lineWidth = (1 - k) * 9 + 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, lerp(p.r0, p.r1, k), p.dir - 0.6, p.dir + 0.6);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    // ---- blob ----
    for (const b of Game.blobs) {
      if (!b.alive || !inView(b.x, b.y, 120)) continue;
      const a = b === me ? 1 : blobAlpha(b, ox, oy);
      if (a <= 0.02) continue;
      // alone sul pavimento
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3);
      fg.addColorStop(0, hexA(b.skin.glow, 0.12 * a));
      fg.addColorStop(1, hexA(b.skin.glow, 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      drawBlob(ctx, b, a);
    }

    // anello hp attorno al proprio blob
    if (me && me.alive) {
      const frac = clamp(me.hp / me.maxHp, 0, 1);
      ctx.strokeStyle = `rgba(120,220,255,0.25)`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(me.x, me.y, me.r + 12, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = frac > 0.4 ? 'rgba(120,255,220,0.75)' : 'rgba(255,110,120,0.85)';
      ctx.beginPath();
      ctx.arc(me.x, me.y, me.r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
    }

    // ---- overlay in spazio schermo ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // vignetta: i bordi del mondo si chiudono nel buio
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(2,4,8,0)');
    vg.addColorStop(1, 'rgba(2,4,8,0.88)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // pericolo: percepito da eco nemica → bordi rossi
    if (me) {
      const dt = now - me.dangerT;
      if (dt >= 0 && dt < 0.9) {
        const a = (1 - dt / 0.9) * 0.4;
        const dg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.62);
        dg.addColorStop(0, 'rgba(255,40,60,0)');
        dg.addColorStop(1, `rgba(255,40,60,${a})`);
        ctx.fillStyle = dg;
        ctx.fillRect(0, 0, w, h);
      }
      // battito quando gli hp sono bassi
      if (me.alive && me.hp / me.maxHp < 0.3) {
        const a = (0.1 + 0.08 * Math.sin(now * 6)) * (1 - me.hp / me.maxHp / 0.3);
        const lg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.6);
        lg.addColorStop(0, 'rgba(200,20,40,0)');
        lg.addColorStop(1, `rgba(200,20,40,${a})`);
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // flash da colpo subito
    if (Game.redFlash > 0.01) {
      ctx.fillStyle = `rgba(255,50,70,${Game.redFlash * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  return { render, drawBlobShape };
})();
