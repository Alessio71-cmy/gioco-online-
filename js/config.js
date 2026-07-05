'use strict';

// ===== Costanti =====
const TAU = Math.PI * 2;

const CFG = {
  WORLD_W: 4200,
  WORLD_H: 4200,
  CELL: 600,          // cella della griglia della nave
  WALL_T: 22,         // spessore paratie
  BORDER: 70,         // muro perimetrale
  HASH: 300,          // cella spatial hash

  ECHO_SPEED: 1500,   // px/s — il ritorno impiega 2*d/v: informazioni sempre "vecchie"
  ECHO_RAYS: 44,      // raggi campionati nel cono
  PING_COST: 16,      // costo batteria per impulso
  BAT_REGEN: 15,      // ricarica batteria /s

  BASE_SPEED: 112,    // px/s — lenta, costante, mai fermi
  TURN_RATE: 4.6,     // rad/s

  ATK_CD: 0.78,
  ATK_HALF: 0.62,     // semi-arco attacco frontale
  ATK_WINDUP: 0.09,

  XP_MAX: 1400,       // xp a cui Eco Power = 1
  XP_MOTE: 6,
  XP_KILL: 50,

  BOT_COUNT: 13,
  MOTE_COUNT: 120,
  FRAG_CAP: 460,
  PART_CAP: 700,
  REVEAL_CAP: 1600,

  NEAR_LIGHT: 240,    // raggio in cui i blob si vedono "a occhio nudo"
  LIGHT_R: 330,       // raggio della bolla di luce attorno al player
  MM_RANGE: 2000,     // portata minimappa (px mondo)
};

// Colori per tier di Eco Power: verde/azzurro → blu → viola
const TIER_COLORS = ['#4df5c8', '#4aa3ff', '#c44dff'];
const TIER_NAMES  = ['ECO VERDE', 'ECO BLU', 'ECO VIOLA'];

const SKINS = [
  { id: 'neon',   name: 'NEON',   body: '#19e0b4', glow: '#3dffd9', dark: '#063f33', rim: '#b8fff0' },
  { id: 'glitch', name: 'GLITCH', body: '#7d6bff', glow: '#a89bff', dark: '#241d5e', rim: '#e0dcff' },
  { id: 'slime',  name: 'SLIME',  body: '#b44df0', glow: '#d67bff', dark: '#43195e', rim: '#f3d9ff' },
  { id: 'void',   name: 'VOID',   body: '#161c38', glow: '#6b7bff', dark: '#07091a', rim: '#93a1ff' },
];

// ===== Stato globale =====
const Game = {
  now: 0,
  state: 'menu',       // menu | play | dead
  world: null,
  blobs: [],
  fragments: [],
  motes: [],
  particles: [],
  reveals: [],         // segmenti di parete rivelati dall'eco
  waves: [],           // fronti d'onda eco attivi
  ghosts: [],          // ritorni eco dei player (posizioni "vecchie")
  smudges: [],         // aree sfumate sulla minimappa
  sched: [],           // eventi ritardati (ritorni eco ecc.)
  player: null,
  cam: { x: 2100, y: 2100, shake: 0, zoom: 1, zoomPulse: 0 },
  mouse: { x: 0, y: 0 },
  startT: 0,
  redFlash: 0,
};

function sched(t, fn) { Game.sched.push({ t, fn }); }
function tierOf(p) { return p < 0.34 ? 0 : p < 0.67 ? 1 : 2; }
