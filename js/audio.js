'use strict';

// Audio interamente sintetizzato con WebAudio: nessun asset esterno.
const AudioSys = (() => {
  let ac = null, master = null, ambientOn = false, noiseB = null;
  let lastHeardT = 0, lastPickT = 0, lastWallT = 0;

  function init() {
    if (ac) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain();
    master.gain.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ac.destination);
  }

  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  function panOf(wx) {
    const p = Game.player;
    if (!p) return 0;
    return clamp((wx - p.x) / 700, -1, 1) * 0.7;
  }

  function out(node, pan) {
    if (ac.createStereoPanner) {
      const pn = ac.createStereoPanner();
      pn.pan.value = pan;
      node.connect(pn); pn.connect(master);
    } else node.connect(master);
  }

  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(type, f0, f1, dur, vol, pan = 0, a = 0.012) {
    if (!ac) return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(24, f1), t0 + dur);
    const g = ac.createGain();
    env(g, t0, a, vol, dur);
    o.connect(g); out(g, pan);
    o.start(t0); o.stop(t0 + a + dur + 0.08);
  }

  function noiseBuf() {
    if (noiseB) return noiseB;
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseB = b;
    return b;
  }

  function noise(dur, vol, fHi, fLo, pan = 0, q = 0.9) {
    if (!ac) return;
    const t0 = ac.currentTime;
    const n = ac.createBufferSource();
    n.buffer = noiseBuf();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(fHi, t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(30, fLo), t0 + dur);
    const g = ac.createGain();
    env(g, t0, 0.008, vol, dur);
    n.connect(bp); bp.connect(g); out(g, pan);
    n.start(t0); n.stop(t0 + dur + 0.1);
  }

  return {
    init, resume,

    // il proprio impulso: sweep discendente, più grave e lungo con la potenza
    ping(p) {
      tone('sine', 700 + p * 420, 300 - p * 80, 0.22 + p * 0.14, 0.14);
      tone('sine', 1400 + p * 500, 600, 0.1, 0.05);
    },

    // ritorno dai muri: blip morbido
    wallReturn(strength) {
      if (!ac || ac.currentTime - lastWallT < 0.09) return;
      lastWallT = ac.currentTime;
      noise(0.09, 0.06 * strength + 0.015, 2400, 700);
      tone('triangle', 520, 430, 0.07, 0.045 * strength + 0.01);
    },

    // ritorno da un player: bitonale, inconfondibile
    blobReturn(tier, pan) {
      const base = [620, 760, 920][tier];
      tone('sine', base, base, 0.09, 0.13, pan);
      tone('sine', base * 1.24, base * 1.24, 0.14, 0.11, pan, 0.05);
    },

    // ping altrui sentito nel buio
    heardPing(pan, vol) {
      if (!ac || ac.currentTime - lastHeardT < 0.12) return;
      lastHeardT = ac.currentTime;
      tone('sine', 460, 240, 0.3, 0.07 * vol + 0.01, pan);
    },

    // sei stato percepito
    danger() {
      tone('sawtooth', 96, 60, 0.5, 0.07);
      tone('sine', 48, 40, 0.55, 0.09);
    },

    attack(pan, vol) { noise(0.13, 0.09 * vol, 3200, 500, pan, 0.6); },

    hitDeal(pan, vol) {
      noise(0.09, 0.14 * vol, 1500, 250, pan);
      tone('sine', 150, 60, 0.13, 0.13 * vol, pan);
    },

    hurt() {
      tone('sine', 120, 50, 0.22, 0.16);
      noise(0.14, 0.1, 900, 180);
    },

    explosion(pan, vol) {
      noise(0.5, 0.2 * vol, 2000, 60, pan, 0.5);
      tone('sine', 90, 28, 0.55, 0.18 * vol, pan);
    },

    pickup(streak) {
      if (!ac || ac.currentTime - lastPickT < 0.05) return;
      lastPickT = ac.currentTime;
      const f = 640 * Math.pow(1.12, Math.min(streak, 10));
      tone('sine', f, f * 1.5, 0.1, 0.06);
    },

    kill() {
      tone('sine', 320, 680, 0.16, 0.14);
      tone('sine', 480, 960, 0.22, 0.11, 0, 0.05);
    },

    uiClick() { tone('sine', 900, 1300, 0.06, 0.06); },

    // rumore di fondo della nave: hum sub + battimenti lenti
    ambient() {
      if (!ac || ambientOn) return;
      ambientOn = true;
      const g = ac.createGain();
      g.gain.value = 0.026;
      const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = 52;
      const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = 52.4;
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
      const lg = ac.createGain(); lg.gain.value = 0.011;
      lfo.connect(lg); lg.connect(g.gain);
      o1.connect(g); o2.connect(g); g.connect(master);
      o1.start(); o2.start(); lfo.start();
    },
  };
})();
