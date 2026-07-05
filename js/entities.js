'use strict';

// ===== Blob: player e bot usano ESATTAMENTE le stesse regole =====
let BLOB_ID = 0;

class Blob {
  constructor(opts) {
    this.id = ++BLOB_ID;
    this.name = opts.name;
    this.skin = opts.skin;
    this.isBot = !!opts.isBot;
    this.x = opts.x; this.y = opts.y;
    this.dir = rand(TAU);
    this.targetDir = this.dir;
    this.xp = opts.xp || 0;
    this.kills = 0;
    this.hp = this.maxHp;
    this.battery = 100;
    this.alive = true;
    this.spawnT = Game.now;
    this.protT = Game.now + 2.5;   // protezione spawn
    this.echoHold = false;
    this.nextPingT = 0;
    this.attackCdT = 0;
    this.attackAnimT = -9;
    this.windupT = 0;
    this.pendingHit = false;
    this.hitT = -9;                // colpito (flash)
    this.squashT = -9;             // compressione quando colpisce
    this.dangerT = -9;             // percepito da eco nemica
    this.pingFlareT = -9;          // bagliore del proprio ping
    this.kx = 0; this.ky = 0;      // knockback
    this.lastDmgT = -9;
    this.wobSeed = rand(100);
    this.pickStreak = 0;
    this.lastPickT = -9;
    this.brain = null;
  }

  get power() { return Math.min(1, Math.pow(this.xp / CFG.XP_MAX, 0.6)); }
  get tier() { return tierOf(this.power); }
  get r() { return 20 + 22 * this.power; }
  get maxHp() { return 100 + 90 * this.power; }
  get speed() { return CFG.BASE_SPEED - 20 * this.power; }
  get dmg() { return 46 + 34 * this.power; }
  get atkRange() { return this.r + 52; }
  get score() { return Math.round(this.xp + this.kills * 100); }
  get protected() { return Game.now < this.protT; }

  update(dt) {
    const now = Game.now;

    // rotazione limitata: controlli solo la direzione
    const dd = angDiff(this.targetDir, this.dir);
    const mt = CFG.TURN_RATE * dt;
    this.dir = normAng(this.dir + clamp(dd, -mt, mt));

    // movimento continuo: non esiste "idle"
    const sp = this.speed;
    this.x += (Math.cos(this.dir) * sp + this.kx) * dt;
    this.y += (Math.sin(this.dir) * sp + this.ky) * dt;
    const kd = Math.exp(-6 * dt);
    this.kx *= kd; this.ky *= kd;
    resolveCircle(this, this.r);

    // batteria eco
    this.battery = Math.min(100, this.battery + CFG.BAT_REGEN * dt);

    // eco: tieni premuto → impulsi ripetuti
    if (this.echoHold && now >= this.nextPingT) {
      const iv = 0.5 - 0.08 * this.power;
      this.nextPingT = emitEcho(this) ? now + iv : now + 0.2;
    }

    // attacco: risoluzione dopo il windup
    if (this.pendingHit && now >= this.windupT) {
      this.pendingHit = false;
      this.resolveAttack();
    }

    // rigenerazione lenta fuori combattimento
    if (now - this.lastDmgT > 5) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);

    if (now - this.lastPickT > 1.6) this.pickStreak = 0;
  }

  tryAttack() {
    const now = Game.now;
    if (!this.alive || now < this.attackCdT) return false;
    this.attackCdT = now + CFG.ATK_CD;
    this.attackAnimT = now;
    this.pendingHit = true;
    this.windupT = now + CFG.ATK_WINDUP;
    spawnAttackFx(this);
    if (Game.player) {
      const d = dist(this.x, this.y, Game.player.x, Game.player.y);
      if (d < 900) AudioSys.attack(this === Game.player ? 0 : (this.x - Game.player.x) / 700, clamp(1 - d / 900, 0.2, 1));
    }
    // il colpo fa rumore: i bot vicini lo sentono
    for (const o of Game.blobs) {
      if (o === this || !o.alive || !o.brain) continue;
      if (dist(this.x, this.y, o.x, o.y) < 460) o.brain.addContact(this, this.x, this.y, 50, 'noise');
    }
    return true;
  }

  resolveAttack() {
    const range = this.atkRange, half = CFG.ATK_HALF;
    let hitAny = false;
    for (const o of Game.blobs) {
      if (o === this || !o.alive) continue;
      const dx = o.x - this.x, dy = o.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > range + o.r * 0.6) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), this.dir)) > half + Math.asin(Math.min(1, o.r / Math.max(d, 1))) * 0.5) continue;
      hitAny = true;
      o.kx += Math.cos(this.dir) * 170;
      o.ky += Math.sin(this.dir) * 170;
      o.takeDamage(this.dmg, this);
    }
    if (hitAny) {
      this.squashT = Game.now; // compressione del blob
      if (this === Game.player) { addShake(5); vibrate(30); }
    } else {
      spawnMissTrail(this); // scia visiva nel vuoto
    }
  }

  takeDamage(v, from) {
    if (!this.alive || this.protected) return;
    this.hp -= v;
    this.lastDmgT = Game.now;
    this.hitT = Game.now;
    if (this === Game.player) {
      Game.redFlash = 0.5;
      addShake(9);
      vibrate(80);
      AudioSys.hurt();
    } else if (from === Game.player) {
      AudioSys.hitDeal((this.x - Game.player.x) / 700, 1);
    }
    if (this.brain) this.brain.onAttacked(from);
    if (this.hp <= 0) this.die(from);
  }

  die(killer) {
    if (!this.alive) return;
    this.alive = false;
    this.echoHold = false;
    spawnExplosion(this);
    // esplosione in frammenti luminosi: l'energia si sparge nell'area
    spawnFragmentsBurst(this.x, this.y, 30 + this.xp * 0.55);
    if (killer && killer.alive && killer !== this) {
      killer.kills++;
      killer.gainXp(CFG.XP_KILL);
      if (killer === Game.player) {
        AudioSys.kill();
        addShake(11);
        Game.cam.zoomPulse = 0.1;
        UI.toast(`hai assorbito ${this.name}`);
      }
    }
    if (Game.player) {
      const d = dist(this.x, this.y, Game.player.x, Game.player.y);
      if (d < 1300) AudioSys.explosion((this.x - Game.player.x) / 700, clamp(1 - d / 1300, 0.15, 1));
    }
    // il botto attira gli avvoltoi
    for (const o of Game.blobs) {
      if (o.brain && o.alive && dist(this.x, this.y, o.x, o.y) < 1000) o.brain.onLoudEvent(this.x, this.y);
    }
    if (this === Game.player) {
      UI.showDeath(killer);
      Game.state = 'dead';
    } else {
      scheduleBotRespawn(this);
    }
  }

  gainXp(v) {
    const t0 = this.tier;
    this.xp += v;
    if (this === Game.player && this.tier !== t0) {
      UI.toast(`ECO POTENZIATO → ${TIER_NAMES[this.tier]}`);
      Game.cam.zoomPulse = 0.08;
    }
  }

  // === percezione ===

  // un'eco nemica ti ha toccato: sai solo che SEI stato percepito
  onPinged(by) {
    this.dangerT = Game.now;
    if (this === Game.player) {
      vibrate(150);
      AudioSys.danger();
    } else if (this.brain) {
      // il bersaglio intuisce la direzione grezza dell'emettitore
      const d = dist(this.x, this.y, by.x, by.y);
      this.brain.addContact(by, by.x, by.y, 60 + d * 0.15, 'pinger');
      this.brain.thinkT = 0;
    }
  }

  // il TUO impulso è tornato: posizione vecchia di 2*d/v, mai precisa al 100%
  onEchoReturn(o, sx, sy, sr, spow, d, ep) {
    const err = echoErr(d, ep.p);
    const gx = sx + rand(-err, err), gy = sy + rand(-err, err);
    if (this === Game.player) {
      Game.ghosts.push({ x: gx, y: gy, r: sr, t: Game.now, ttl: 1.3 + ep.p * 0.9, tier: tierOf(spow) });
      addSmudge(gx, gy, true);
      AudioSys.blobReturn(tierOf(spow), (sx - this.x) / 700);
      vibrate(40);
    } else if (this.brain) {
      this.brain.addContact(o, gx, gy, 0, 'echo');
      this.brain.thinkT = 0;
    }
  }

  // ping altrui sentito nel buio (fuori o dentro il cono)
  onHeardPing(by, sx, sy, d, ep) {
    if (this === Game.player) {
      AudioSys.heardPing((sx - this.x) / 700, clamp(1 - d / (ep.range * 1.7), 0, 1));
      addSmudge(sx + rand(-90, 90), sy + rand(-90, 90), false);
    } else if (this.brain) {
      this.brain.addContact(by, sx, sy, 40 + d * 0.12, 'heard');
    }
  }
}

// ===== Energia =====
function spawnFragmentsBurst(x, y, total) {
  const count = clamp(Math.round(total / 16), 5, 24);
  for (let i = 0; i < count; i++) {
    const a = rand(TAU), sp = rand(50, 230);
    Game.fragments.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      val: total / count,
      r: 4.5 + Math.sqrt(total / count) * 0.9,
      t: Game.now, ttl: 24,
      phase: rand(TAU),
    });
  }
  while (Game.fragments.length > CFG.FRAG_CAP) Game.fragments.shift();
}

function updateFragments(dt) {
  const fr = Math.exp(-2.2 * dt);
  Game.fragments = Game.fragments.filter(f => {
    if (Game.now - f.t > f.ttl) return false;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.vx *= fr; f.vy *= fr;
    resolveCircle(f, 5);
    // magnete + raccolta
    for (const b of Game.blobs) {
      if (!b.alive) continue;
      const dx = b.x - f.x, dy = b.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d < b.r + 14) {
        b.gainXp(f.val);
        if (b === Game.player) {
          b.pickStreak++; b.lastPickT = Game.now;
          AudioSys.pickup(b.pickStreak);
        }
        return false;
      }
      if (d < b.r + 75) {
        f.vx += dx / d * 900 * dt;
        f.vy += dy / d * 900 * dt;
      }
    }
    return true;
  });
}

function updateMotes(dt) {
  Game.motes = Game.motes.filter(m => {
    for (const b of Game.blobs) {
      if (!b.alive) continue;
      if (dist(b.x, b.y, m.x, m.y) < b.r + 11) {
        b.gainXp(CFG.XP_MOTE);
        if (b === Game.player) {
          b.pickStreak++; b.lastPickT = Game.now;
          AudioSys.pickup(b.pickStreak);
        }
        sched(Game.now + rand(8, 16), spawnMote);
        return false;
      }
    }
    return true;
  });
}

// ===== Particelle / FX =====
function addShake(a) { Game.cam.shake = Math.min(26, Game.cam.shake + a); }

function pushPart(p) {
  if (Game.particles.length >= CFG.PART_CAP) Game.particles.shift();
  Game.particles.push(p);
}

function spawnAttackFx(b) {
  pushPart({
    type: 'arc', x: b.x, y: b.y, dir: b.dir,
    r0: b.r * 0.75, r1: b.atkRange,
    t: Game.now, ttl: 0.17, color: b.skin.glow,
  });
}

function spawnMissTrail(b) {
  for (let i = 0; i < 7; i++) {
    const a = b.dir + rand(-0.45, 0.45);
    const sp = rand(90, 260);
    pushPart({
      type: 'dot', x: b.x + Math.cos(b.dir) * b.r, y: b.y + Math.sin(b.dir) * b.r,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: rand(1.5, 3.5), t: Game.now, ttl: rand(0.35, 0.7),
      color: b.skin.glow,
    });
  }
}

function spawnExplosion(b) {
  const c = TIER_COLORS[b.tier];
  pushPart({ type: 'ring', x: b.x, y: b.y, r0: b.r, r1: b.r + 130, t: Game.now, ttl: 0.5, color: c });
  for (let i = 0; i < 30; i++) {
    const a = rand(TAU), sp = rand(60, 380);
    pushPart({
      type: 'dot', x: b.x, y: b.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: rand(1.5, 5), t: Game.now, ttl: rand(0.4, 1.1),
      color: Math.random() < 0.5 ? c : b.skin.glow,
    });
  }
}

function updateParticles(dt) {
  const fr = Math.exp(-2.6 * dt);
  Game.particles = Game.particles.filter(p => {
    if (Game.now - p.t > p.ttl) return false;
    if (p.type === 'dot') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= fr; p.vy *= fr;
    }
    return true;
  });
}

// ===== Bot roster =====
const BOT_NAMES = [
  'Nova', 'Kraken', 'Lampo', 'Ombra', 'Vortex', 'Nyx', 'Blip', 'Synth',
  'Zero', 'Eco-7', 'Murk', 'Falco', 'Quark', 'Vesper', 'Brivido', 'Twitch',
  'Glimmer', 'Skiff', 'Puls', 'Abisso',
];

function freeBotName() {
  const used = new Set(Game.blobs.map(b => b.name));
  const avail = BOT_NAMES.filter(n => !used.has(n));
  return avail.length ? pick(avail) : 'Bot-' + ((Math.random() * 900 + 100) | 0);
}

function makeBot() {
  const p = randomOpenPos(45);
  const b = new Blob({
    name: freeBotName(),
    skin: pick(SKINS),
    isBot: true,
    x: p.x, y: p.y,
    xp: rand(0, 280),
  });
  b.brain = new Brain(b);
  return b;
}

function scheduleBotRespawn(deadBot) {
  sched(Game.now + rand(4, 9), () => {
    const i = Game.blobs.indexOf(deadBot);
    if (i >= 0) Game.blobs.splice(i, 1);
    Game.blobs.push(makeBot());
  });
}
