'use strict';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function normAng(a) { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
function angDiff(a, b) { return normAng(a - b); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function vibrate(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* non supportato */ } }
}
