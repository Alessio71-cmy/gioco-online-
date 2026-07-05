'use strict';

// ===== UI: menu, HUD, schermata morte, toast =====
const UI = (() => {
  let selSkin = 0;
  let lbTimer = 0;
  let els = {};
  let skinCtxs = [];

  function init() {
    els = {
      menu: document.getElementById('menu'),
      death: document.getElementById('death'),
      hud: document.getElementById('hud'),
      name: document.getElementById('nameInput'),
      skins: document.getElementById('skins'),
      start: document.getElementById('startBtn'),
      kills: document.getElementById('kills'),
      lb: document.getElementById('lb'),
      batBar: document.getElementById('batBar'),
      ecoLabel: document.getElementById('ecoLabel'),
      hpBar: document.getElementById('hpBar'),
      deathBy: document.getElementById('deathBy'),
      deathStats: document.getElementById('deathStats'),
      respawn: document.getElementById('respawnBtn'),
      menuBtn: document.getElementById('menuBtn'),
      toasts: document.getElementById('toasts'),
      touchui: document.getElementById('touchui'),
    };

    // card delle skin
    SKINS.forEach((sk, i) => {
      const card = document.createElement('div');
      card.className = 'skinCard' + (i === selSkin ? ' sel' : '');
      const cv = document.createElement('canvas');
      cv.width = cv.height = 68;
      const nm = document.createElement('div');
      nm.className = 'skName';
      nm.textContent = sk.name;
      card.appendChild(cv);
      card.appendChild(nm);
      card.addEventListener('click', () => {
        selSkin = i;
        AudioSys.init(); AudioSys.resume(); AudioSys.uiClick();
        [...els.skins.children].forEach((c, j) => c.classList.toggle('sel', j === selSkin));
      });
      els.skins.appendChild(card);
      skinCtxs.push(cv.getContext('2d'));
    });

    els.start.addEventListener('click', () => startGame());
    els.name.addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });
    els.respawn.addEventListener('click', () => {
      AudioSys.uiClick();
      els.death.classList.add('hidden');
      respawnPlayer();
    });
    els.menuBtn.addEventListener('click', () => {
      AudioSys.uiClick();
      els.death.classList.add('hidden');
      els.hud.classList.add('hidden');
      els.menu.classList.remove('hidden');
      removePlayer();
      Game.state = 'menu';
    });

    const saved = localStorage.getItem('eco_name');
    if (saved) els.name.value = saved;
    const savedSkin = parseInt(localStorage.getItem('eco_skin'), 10);
    if (savedSkin >= 0 && savedSkin < SKINS.length) {
      selSkin = savedSkin;
      [...els.skins.children].forEach((c, j) => c.classList.toggle('sel', j === selSkin));
    }

    if ('ontouchstart' in window) els.touchui.classList.remove('hidden');
  }

  function startGame() {
    const name = (els.name.value.trim() || 'SENZA NOME').slice(0, 14);
    localStorage.setItem('eco_name', name);
    localStorage.setItem('eco_skin', String(selSkin));
    AudioSys.init(); AudioSys.resume(); AudioSys.ambient(); AudioSys.uiClick();
    els.menu.classList.add('hidden');
    els.hud.classList.remove('hidden');
    spawnPlayer(name, SKINS[selSkin]);
  }

  function showDeath(killer) {
    const me = Game.player;
    els.deathBy.textContent = killer && killer !== me ? `assorbito da ${killer.name.toUpperCase()}` : 'dissolto nel vuoto';
    const secs = Math.max(0, Game.now - me.spawnT) | 0;
    const mm = (secs / 60) | 0, ss = String(secs % 60).padStart(2, '0');
    els.deathStats.innerHTML =
      `<div class="st"><div class="v">${me.kills}</div><div class="k">KILL</div></div>` +
      `<div class="st"><div class="v">${Math.round(me.xp)}</div><div class="k">ENERGIA</div></div>` +
      `<div class="st"><div class="v">${mm}:${ss}</div><div class="k">TEMPO</div></div>`;
    els.death.classList.remove('hidden');
  }

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    els.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function update(dt) {
    const me = Game.player;

    // anteprime skin animate nel menu
    if (Game.state === 'menu' && !els.menu.classList.contains('hidden')) {
      skinCtxs.forEach((c, i) => {
        c.clearRect(0, 0, 68, 68);
        c.save();
        c.translate(34, 36);
        Renderer.drawBlobShape(c, SKINS[i], 19, Game.now + i * 1.7, i * 13, 1);
        c.restore();
      });
    }

    if (!me) return;

    els.kills.textContent = `☠ ${me.kills}`;
    // unico indicatore in basso: l'eco (il colore comunica l'Eco Power)
    els.batBar.style.width = `${me.battery}%`;
    els.batBar.style.background = me.battery < CFG.PING_COST ? '#ff5f7a' : TIER_COLORS[me.tier];
    els.ecoLabel.style.color = TIER_COLORS[me.tier];
    // vita in alto a sinistra
    const hpFrac = clamp(me.hp / me.maxHp, 0, 1);
    els.hpBar.style.width = `${hpFrac * 100}%`;
    els.hpBar.style.background = hpFrac > 0.4 ? '#4df5c8' : '#ff5f7a';

    lbTimer -= dt;
    if (lbTimer <= 0) {
      lbTimer = 0.5;
      const alive = Game.blobs.filter(b => b.alive).sort((a, b) => b.score - a.score);
      els.lb.innerHTML = alive.slice(0, 8).map((b, i) =>
        `<li class="${b === me ? 'me' : ''}"><span>${i + 1}. ${escapeHtml(b.name)}</span><span class="sc">${b.score}</span></li>`
      ).join('');
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { init, update, showDeath, toast };
})();
