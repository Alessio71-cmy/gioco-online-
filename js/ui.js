'use strict';

// ===== UI: menu, HUD, schermata morte, toast =====
const UI = (() => {
  let selSkin = 0;
  let lbTimer = 0;
  let els = {};
  let skinCtx = null;

  function init() {
    els = {
      menu: document.getElementById('menu'),
      death: document.getElementById('death'),
      hud: document.getElementById('hud'),
      name: document.getElementById('nameInput'),
      skinCanvas: document.getElementById('skinCanvas'),
      skinName: document.getElementById('skinName'),
      skinPrev: document.getElementById('skinPrev'),
      skinNext: document.getElementById('skinNext'),
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

    skinCtx = els.skinCanvas.getContext('2d');
    const setSkin = i => {
      selSkin = (i + SKINS.length) % SKINS.length;
      els.skinName.textContent = SKINS[selSkin].name;
      AudioSys.init(); AudioSys.resume(); AudioSys.uiClick();
    };
    els.skinPrev.addEventListener('click', () => setSkin(selSkin - 1));
    els.skinNext.addEventListener('click', () => setSkin(selSkin + 1));
    els.skinName.textContent = SKINS[selSkin].name;
    window.addEventListener('keydown', e => {
      if (Game.state !== 'menu' || document.activeElement === els.name) return;
      if (e.key === 'ArrowLeft') setSkin(selSkin - 1);
      else if (e.key === 'ArrowRight') setSkin(selSkin + 1);
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
      els.skinName.textContent = SKINS[selSkin].name;
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

    // anteprima animata dello skin selezionato
    if (Game.state === 'menu' && !els.menu.classList.contains('hidden')) {
      const c = skinCtx, S = els.skinCanvas.width;
      c.clearRect(0, 0, S, S);
      c.save();
      c.translate(S / 2, S / 2 + 4);
      Renderer.drawBlobShape(c, SKINS[selSkin], S * 0.29, Game.now, selSkin * 13, 1);
      c.restore();
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
