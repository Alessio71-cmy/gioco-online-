'use strict';

// ===== Minimappa radar =====
// Nessuna posizione precisa: solo aree sfumate ("qualcuno è stato qui"),
// una spazzata rotante e una tinta rossa quando sei stato percepito.
const Minimap = (() => {
  let cv, ctx;

  function init() {
    cv = document.getElementById('minimap');
    ctx = cv.getContext('2d');
  }

  function render() {
    if (!ctx) return;
    const S = cv.width, R = S / 2 - 8, cx = S / 2, cy = S / 2;
    const me = Game.player;
    const now = Game.now;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(cx, cy);

    // quadrante
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = 'rgba(6,11,19,0.9)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(90,200,255,0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, R * i / 3, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-R, 0); ctx.lineTo(R, 0);
    ctx.moveTo(0, -R); ctx.lineTo(0, R);
    ctx.strokeStyle = 'rgba(90,200,255,0.08)';
    ctx.stroke();

    // clip circolare per tutto ciò che segue
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();

    // spazzata rotante con scia
    const sw = (now * 1.8) % TAU;
    for (let i = 0; i < 22; i++) {
      const a = sw - i * 0.055;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.strokeStyle = `rgba(90,220,200,${0.10 * (1 - i / 22)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // aree sfumate dei contatti
    if (me) {
      const k = R / CFG.MM_RANGE;
      for (const s of Game.smudges) {
        let mx = (s.x - me.x) * k, my = (s.y - me.y) * k;
        const m = Math.hypot(mx, my);
        if (m > R - 6) { mx *= (R - 6) / m; my *= (R - 6) / m; } // al bordo se fuori portata
        const age = (now - s.t) / s.ttl;
        const alpha = (1 - age) * (s.strong ? 0.5 : 0.26);
        const rad = s.strong ? 20 : 14;
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, rad);
        g.addColorStop(0, `rgba(140,235,220,${alpha})`);
        g.addColorStop(1, 'rgba(140,235,220,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mx, my, rad, 0, TAU);
        ctx.fill();
      }

      // tinta di pericolo: sei stato percepito
      const dt = now - me.dangerT;
      if (dt < 1.3) {
        ctx.fillStyle = `rgba(255,60,70,${(1 - dt / 1.3) * 0.22})`;
        ctx.fillRect(-R, -R, 2 * R, 2 * R);
      }

      // tacca centrale: solo il tuo orientamento
      ctx.save();
      ctx.rotate(me.dir);
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(220,255,245,0.85)';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  return { init, render };
})();
