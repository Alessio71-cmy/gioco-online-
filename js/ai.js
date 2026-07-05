'use strict';

// ===== Cervello dei bot =====
// I bot NON barano: percepiscono solo tramite il proprio eco, i suoni
// (ping altrui, attacchi, esplosioni) e la vista ravvicinata — le stesse
// informazioni parziali e ritardate di un giocatore umano. Su quelle
// costruiscono una memoria di contatti, stimano velocità, predicono,
// tendono agguati e scappano dai più forti.

class Brain {
  constructor(blob) {
    this.b = blob;
    // profilo "umano": ogni bot ha riflessi e indole diversi
    this.reaction = rand(0.16, 0.4);     // ritardo di reazione (s)
    this.aimErr = rand(0.04, 0.2);       // errore di mira (rad)
    this.aggro = rand(0.35, 0.9);        // propensione all'attacco
    this.caution = rand(0.3, 0.9);       // distanza di sicurezza
    this.pingCdT = Game.now + rand(0.5, 3);
    this.thinkT = 0;
    this.state = 'wander';
    this.wp = null;
    this.wpT = 0;
    this.contacts = new Map();           // id → ultimo contatto percepito
    this.target = null;
    this.threat = null;
    this.energyPt = null;
    this.energyGoal = null;              // esplosione sentita da lontano
    this.atkReadyT = 0;
    this.weavePhase = rand(TAU);
  }

  // registra un contatto con errore; stima la velocità da due rilevamenti
  addContact(o, x, y, err, kind) {
    const now = Game.now;
    const ox = x + rand(-err, err), oy = y + rand(-err, err);
    const prev = this.contacts.get(o.id);
    let vx = 0, vy = 0;
    if (prev) {
      const dt = now - prev.t;
      if (dt > 0.15 && dt < 3) {
        vx = (ox - prev.x) / dt;
        vy = (oy - prev.y) / dt;
        const m = Math.hypot(vx, vy);
        if (m > 140) { vx *= 140 / m; vy *= 140 / m; } // nessuno va più veloce di così
      } else { vx = prev.vx; vy = prev.vy; }
    }
    this.contacts.set(o.id, {
      id: o.id, ref: o, x: ox, y: oy, vx, vy, t: now,
      str: o.power * rand(0.85, 1.15), kind,
    });
  }

  onAttacked(from) {
    if (from && from.alive) this.addContact(from, from.x, from.y, 25, 'pain');
    this.thinkT = 0;
  }

  onLoudEvent(x, y) {
    this.energyGoal = { x, y, t: Game.now };
  }

  update(dt) {
    const now = Game.now;
    for (const [id, c] of this.contacts) {
      if (now - c.t > 7 || !c.ref.alive) this.contacts.delete(id);
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.think();
      this.thinkT = rand(0.14, 0.26);
    }
    this.steer(dt);
  }

  think() {
    const b = this.b, now = Game.now;
    const myStr = b.power, hpFrac = b.hp / b.maxHp;

    let bestPrey = null, bestScore = -1;
    let worstThreat = null, threatD = 1e9;

    for (const c of this.contacts.values()) {
      const age = now - c.t;
      const ex = c.x + c.vx * age, ey = c.y + c.vy * age;
      const d = dist(b.x, b.y, ex, ey);
      const scary = c.str > myStr + 0.13 || (c.str > myStr - 0.05 && hpFrac < 0.45);
      if (scary) {
        if (d < threatD) { threatD = d; worstThreat = c; }
      } else {
        const score = (myStr - c.str) * 2 + this.aggro - d / 1200 - age * 0.15;
        if (score > bestScore) { bestScore = score; bestPrey = c; }
      }
    }

    this.threat = (worstThreat && threatD < 640 * (0.55 + this.caution * 0.7)) ? worstThreat : null;
    if (this.threat) { this.state = 'flee'; this.target = null; return; }

    if (bestPrey && bestScore > 0.15) { this.state = 'hunt'; this.target = bestPrey; return; }

    // energia visibile nei paraggi
    const e = this.findEnergy();
    if (e) { this.state = 'energy'; this.energyPt = e; return; }

    // qualcosa è esploso non lontano: vai a raccogliere i resti
    if (this.energyGoal && now - this.energyGoal.t < 7) {
      const d = dist(b.x, b.y, this.energyGoal.x, this.energyGoal.y);
      if (d > 130 && d < 1200) {
        this.state = 'energy';
        this.energyPt = this.energyGoal;
        return;
      }
      this.energyGoal = null;
    }

    this.state = 'wander';
  }

  findEnergy() {
    const b = this.b;
    let best = null, bd = 330;
    for (const f of Game.fragments) {
      const d = dist(b.x, b.y, f.x, f.y);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) {
      bd = 260;
      for (const m of Game.motes) {
        const d = dist(b.x, b.y, m.x, m.y);
        if (d < bd) { bd = d; best = m; }
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  steer(dt) {
    const b = this.b, now = Game.now;
    let want = b.dir;

    switch (this.state) {
      case 'wander': {
        if (!this.wp || now > this.wpT || dist(b.x, b.y, this.wp.x, this.wp.y) < 90) {
          this.wp = randomOpenPos(50, b.x, b.y, 500, 1500);
          this.wpT = now + 9;
        }
        want = Math.atan2(this.wp.y - b.y, this.wp.x - b.x);
        // interroga il buio ogni tanto
        if (now > this.pingCdT && b.battery > 60) {
          emitEcho(b);
          this.pingCdT = now + rand(2.4, 5.8);
        }
        break;
      }

      case 'energy': {
        if (!this.energyPt) { this.state = 'wander'; break; }
        want = Math.atan2(this.energyPt.y - b.y, this.energyPt.x - b.x);
        if (dist(b.x, b.y, this.energyPt.x, this.energyPt.y) < 60) this.energyPt = null;
        if (now > this.pingCdT && b.battery > 70) {
          emitEcho(b);
          this.pingCdT = now + rand(3, 6);
        }
        break;
      }

      case 'hunt': {
        const c = this.target;
        if (!c || !c.ref.alive) { this.state = 'wander'; this.target = null; break; }
        const age = now - c.t;
        // estrapola la posizione dal contatto vecchio + anticipo sull'intercetta
        let ex = c.x + c.vx * Math.min(age, 2.2);
        let ey = c.y + c.vy * Math.min(age, 2.2);
        const d = dist(b.x, b.y, ex, ey);
        const eta = Math.min(d / Math.max(60, b.speed), 1.2);
        ex += c.vx * eta * 0.6;
        ey += c.vy * eta * 0.6;
        want = Math.atan2(ey - b.y, ex - b.x) + Math.sin(now * 2.3 + this.weavePhase) * 0.1;

        // il contatto è vecchio: ri-ping per riagganciare (e farsi sentire…)
        if (age > 1.15 && now > this.pingCdT && b.battery > 35) {
          emitEcho(b);
          this.pingCdT = now + rand(1.0, 1.6);
        }

        // a distanza ravvicinata lo vede davvero (stessa near-light del player)
        const t = c.ref;
        const dr = dist(b.x, b.y, t.x, t.y);
        if (dr < CFG.NEAR_LIGHT) {
          this.addContact(t, t.x, t.y, 6, 'sight');
          want = Math.atan2(t.y - b.y, t.x - b.x) + rand(-this.aimErr, this.aimErr);
          if (dr < b.atkRange * 0.95 && Math.abs(angDiff(want, b.dir)) < 0.5) {
            if (!this.atkReadyT) this.atkReadyT = now + this.reaction * rand(0.6, 1.4);
            if (now >= this.atkReadyT) { b.tryAttack(); this.atkReadyT = 0; }
          } else this.atkReadyT = 0;
        } else this.atkReadyT = 0;

        if (age > 4.5) { this.target = null; this.state = 'wander'; }
        break;
      }

      case 'flee': {
        const c = this.threat;
        if (!c) { this.state = 'wander'; break; }
        const age = now - c.t;
        const ex = c.x + c.vx * age, ey = c.y + c.vy * age;
        // scappa serpeggiando, in silenzio: pingare adesso ti farebbe trovare
        want = Math.atan2(b.y - ey, b.x - ex) + Math.sin(now * 3 + this.weavePhase) * 0.45;
        if (age > 3.5) { this.threat = null; this.state = 'wander'; }
        break;
      }
    }

    b.targetDir = this.avoidWalls(want);
  }

  // whisker a 3 raggi + repulsione dai bordi mappa
  avoidWalls(want) {
    const b = this.b;
    const L = 110 + b.r;
    const f = castRay(b.x, b.y, Math.cos(b.dir), Math.sin(b.dir), L);
    const lA = b.dir - 0.65, rA = b.dir + 0.65;
    const l = castRay(b.x, b.y, Math.cos(lA), Math.sin(lA), L * 0.8);
    const r = castRay(b.x, b.y, Math.cos(rA), Math.sin(rA), L * 0.8);
    let steer = want;
    if (f) {
      const dl = l ? l.d : L, dr = r ? r.d : L;
      steer = b.dir + (dl > dr ? -1 : 1) * (2.0 - (f.d / L) * 1.4);
    } else if (l && l.d < 40 + b.r) {
      steer = want + 0.8 * (1 - l.d / (40 + b.r));
    } else if (r && r.d < 40 + b.r) {
      steer = want - 0.8 * (1 - r.d / (40 + b.r));
    }
    const M = 220;
    if (b.x < M || b.y < M || b.x > CFG.WORLD_W - M || b.y > CFG.WORLD_H - M) {
      const toC = Math.atan2(CFG.WORLD_H / 2 - b.y, CFG.WORLD_W / 2 - b.x);
      steer = normAng(steer + angDiff(toC, steer) * 0.5);
    }
    return steer;
  }
}
