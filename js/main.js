/* ============================================================
   main.js — screens, input, buttons, touch controls, glue code
   ============================================================ */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
    AudioFX.sfx.ui();
  };

  // ---------- shared input state ----------
  const input = { left: false, right: false, throttle: false, fire: false };
  Game.setInput(input);

  let currentDiff = 'medium';
  let touchMode = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  /* ================= THREE.js boot ================= */
  function boot() {
    if (typeof THREE === 'undefined') {
      document.getElementById('screen-loading').innerHTML =
        '<div class="menu-card"><h2 class="screen-title">CANNOT LOAD 3D ENGINE</h2>' +
        '<p style="color:var(--text-dim);margin-bottom:16px">Three.js failed to load from the CDN. ' +
        'Check your internet connection and refresh.</p></div>';
      return;
    }
    try {
      Game.onGameOver = (stats) => onGameOver(stats);
      Game.onFirstFrame = () => {
        updateBestBadge();
        setTimeout(() => showScreen('screen-menu'), 350);
      };
      Game.init($('game-root'));
    } catch (err) {
      document.getElementById('screen-loading').innerHTML =
        '<div class="menu-card"><h2 class="screen-title">ERROR</h2>' +
        '<p style="color:var(--text-dim)">' + String(err && err.message || err) + '</p></div>';
    }
  }

  /* ================= menu helpers ================= */
  function updateBestBadge() {
    const best = Game.bestScore();
    $('menu-best').textContent = best.toLocaleString();
    $('hud-best').textContent = best;
  }

  function startGame(diffKey) {
    currentDiff = diffKey || currentDiff;
    $('hud').classList.remove('hidden');
    showScreenHide();               // hide any screen; keep hud
    Game.startRacing(currentDiff);
  }
  function showScreenHide() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  }

  function goMenu() {
    Game.toMenu();
    $('hud').classList.add('hidden');
    updateBestBadge();
    showScreen('screen-menu');
  }

  function onGameOver(stats) {
    const isNewBest = Game.saveBest(stats.score);
    $('go-score').textContent = stats.score.toLocaleString();
    $('go-coins').textContent = stats.coins;
    $('go-distance').textContent = stats.distance.toLocaleString() + ' m';
    $('go-kills').textContent = stats.kills;
    $('new-best-badge').classList.toggle('hidden', !isNewBest);
    updateBestBadge();
    setTimeout(() => showScreen('screen-gameover'), 250);
  }

  /* ================= buttons ================= */
  function wireButtons() {
    $('btn-play').addEventListener('click', () => startGame(currentDiff));

    $('btn-howto').addEventListener('click', () => showScreen('screen-howto'));
    $('btn-howto-back').addEventListener('click', () => showScreen('screen-menu'));

    $('btn-resume').addEventListener('click', () => {
      showScreenHide();
      $('hud').classList.remove('hidden');
      Game.resume();
    });
    $('btn-restart').addEventListener('click', () => {
      showScreenHide();
      $('hud').classList.remove('hidden');
      Game.startRacing(currentDiff);
    });
    $('btn-menu').addEventListener('click', goMenu);

    $('btn-retry').addEventListener('click', () => startGame(currentDiff));
    $('btn-gomenu').addEventListener('click', goMenu);

    // difficulty segmented control
    document.querySelectorAll('#diff-seg .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#diff-seg .seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentDiff = btn.dataset.diff;
        AudioFX.sfx.ui();
      });
    });

    // sound toggle
    const soundBtn = $('btn-sound');
    soundBtn.addEventListener('click', () => {
      const on = AudioFX.toggle();
      soundBtn.textContent = on ? '🔊 ON' : '🔇 OFF';
      soundBtn.classList.toggle('active', on);
    });
  }

  /* ================= keyboard ================= */
  function wireKeys() {
    const setKey = (code, key) => {
      if (code === 'ArrowLeft' || code === 'KeyA') input.left = key;
      if (code === 'ArrowRight' || code === 'KeyD') input.right = key;
      if (code === 'ArrowUp' || code === 'KeyW') input.throttle = key;
      if (code === 'Space') { input.fire = key; if (key) AudioFX.ensure(); }
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { setKey(e.code, true); return; }
      setKey(e.code, true);

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          // Space starts the race from the menu
          if (!Game.state || Game.state !== 'playing' && Game.state !== 'paused' && Game.state !== 'dying') {
            if (!$('screen-menu').classList.contains('hidden')) startGame(currentDiff);
          }
          break;
        case 'KeyP':
        case 'Escape':
          if (Game.state === 'playing') {
            Game.pause();
            showScreen('screen-pause');
          } else if (Game.state === 'paused') {
            showScreenHide();
            $('hud').classList.remove('hidden');
            Game.resume();
          }
          break;
        case 'KeyR':
          if (Game.state === 'playing' || Game.state === 'paused') {
            showScreenHide();
            $('hud').classList.remove('hidden');
            Game.startRacing(currentDiff);
          }
          break;
        case 'KeyM':
          const on = AudioFX.toggle();
          $('btn-sound').textContent = on ? '🔊 ON' : '🔇 OFF';
          $('btn-sound').classList.toggle('active', on);
          break;
        case 'KeyN':
          Game.refillAmmo();
          break;
        case 'Enter':
          if (Game.state !== 'playing' && Game.state !== 'dying') {
            if (!$('screen-menu').classList.contains('hidden')) startGame(currentDiff);
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => setKey(e.code, false));
    window.addEventListener('blur', () => {
      input.left = input.right = input.throttle = input.fire = false;
    });
  }

  /* ================= touch controls ================= */
  function wireTouch() {
    const wrap = $('touch-controls');
    if (!touchMode) return;
    wrap.classList.remove('hidden');

    const bind = (el, key) => {
      const press = (e) => { e.preventDefault(); input[key] = true; AudioFX.ensure(); };
      const release = (e) => { e.preventDefault(); input[key] = false; };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    document.querySelectorAll('.tbtn').forEach((b) => bind(b, b.dataset.touch));
  }

  /* ================= misc ================= */
  function wireMisc() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // auto-pause when the tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && Game.state === 'playing') {
        Game.pause();
        showScreen('screen-pause');
      }
    });
  }

  // ---------- go ----------
  wireButtons();
  wireKeys();
  wireTouch();
  wireMisc();
  window.addEventListener('load', boot);
})();