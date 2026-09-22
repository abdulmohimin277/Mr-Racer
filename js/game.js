/* ============================================================
   NeonRush — core 3D game engine (world, traffic, coins, blaster)
   ============================================================ */
'use strict';

const Game = (() => {
  /* ---------------- config ---------------- */
  const DIFFS = {
    easy:   { trafMax: 11, maxSpeed: 62,  spawnGap: [58, 100], coinGap: [24, 52], laneGap: 170, duoChance: 0.15, convoyChance: 0.15, weights: [0.50, 0.12, 0.16, 0.12, 0.04, 0.03, 0.03] },
    medium: { trafMax: 18, maxSpeed: 86,  spawnGap: [38, 72],  coinGap: [18, 42], laneGap: 120, duoChance: 0.40, convoyChance: 0.35, weights: [0.48, 0.14, 0.14, 0.10, 0.06, 0.04, 0.04] },
    hard:   { trafMax: 26, maxSpeed: 106, spawnGap: [24, 44],  coinGap: [13, 32], laneGap: 85,  duoChance: 0.70, convoyChance: 0.50, weights: [0.46, 0.16, 0.12, 0.08, 0.06, 0.06, 0.06] },
  };

  const CAR_OPTIONS = [
    { id: 'ember',  name: 'EMBER GT',   color: 0xffc219, glow: 0x2f8fff },
    { id: 'blaze',  name: 'BLAZE X',    color: 0xff3b10, glow: 0x3fb8ff },
    { id: 'shadow', name: 'NIGHT FANG', color: 0x39404f, glow: 0x2fa8ff },
    { id: 'gold',   name: 'GOLD RUSH',  color: 0xe8c05a, glow: 0x6ad6ff },
    { id: 'comet',  name: 'COMET RS',   color: 0xff5e3d, glow: 0x6ad6ff },
    { id: 'onyx',   name: 'ONYX GT',    color: 0x2a2e37, glow: 0x3fb8ff },
  ];

  const LANES = [-4.666, 0, 4.666];
  const ROAD_W = 14;
  const PLAYER_Z = 4;
  const SPAWN_Z = -315;
  const DESPAWN_Z = 26;
  const MAX_AMMO = 12;
  const GAME_LIVES = 3;
  const IS_MOBILE = (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

  /* ---------------- state ---------------- */
  let state = 'idle';            // idle | playing | dying | gameover | paused
  let diff = DIFFS.medium;
  let renderer, scene, camera;
  let player = null;
  let neonLight = null;
  let input = { left: false, right: false, throttle: false, fire: false, drift: false, brake: false };

  // day / night cycle
  let timeSetting = 'day';            // day | cycle | night (day is the default theme)
  let timeClock = 0;
  let nightMixG = 0;
  let skyPhase = -1;
  let sunLight = null, hemiLight = null, fillLight = null;
  let mountainMat = null;
  const DAY_CYCLE = 96;               // seconds for one full day→night→day loop

  // run stats
  let speed = 0, elapsed = 0, distance = 0;
  let score = 0, coins = 0, kills = 0, lives = GAME_LIVES;
  let ammo = MAX_AMMO, fireCooldown = 0;
  let invuln = 0, shake = 0, dyingTimer = 0;

  // world
  let roadTex = null;
  let obstacles = [], coinPool = [], ammoPool = [];
  let nextSpawn = 0, nextCoinSpawn = 0;
  let laneCooldown = [0, 0, 0];
  let sceneT = 0;
  // camera base per viewport/aspect (set by fitViewport)
  let camBase = { fov: 70, y: 6.6, z: 13.5 };
  let carOpt = CAR_OPTIONS[0];
  let oilT = 0, driftTime = 0, driftSmokeT = 0, driftScoreClock = 0;
  let driftPrev = false, driftBoost = 0;   // drift-release boost charge

  // car extras: headlights, wipers, rain, indicators
  let lightsOn = true, wipersOn = false, rainOn = false;
  let hlLightL = null, hlLightR = null, hlConeL = null, hlConeR = null;
  let rainDrops = null, rainPos = null, rainCount = 0;
  let blinkerT = 0, blinkL = [], blinkR = [];
  let dashIndL = null, dashIndR = null;
  let wiperL = null, wiperR = null, wiperPhase = 0;

  // cockpit (in-car) view
  let camMode = 'chase';                  // chase | cockpit
  let cockpit = null, cockpitWheel = null, cockpitNeedlePivot = null;
  let mirrorCanvas = null, mirrorCtx = null, mirrorTex = null;

  // start countdown + combo scoring
  let countingDown = false, countdownT = 0, goPlayed = false;
  let combo = 0, comboT = 0;

  // paint override (6-hex string like 'ff5e3d', or null for the stock factory paint)
  let paintOverride = null;

  // scenery
  let sideSlots = [], skySlots = [], cloudSlots = [], streakSlots = [];

  // hud
  let hud = {};

  // events
  let onGameOverCb = null;
  let onFirstFrameCb = null;

  let rafId = 0, lastTime = 0;

  /* ---------------- canvas texture helpers ---------------- */
  function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (repeatX > 1 || repeatY > 1) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    return tex;
  }

  function cloudTex() {
    return canvasTex(128, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  /* ---------------- sky + fog (day/night cycle, flat colors only) ---------------- */
  const SKY_PHASES = [
    // 0 day   — bright blue day, big pale sun with rays
    { sky: '#4aa3ff', sun: '#f2f8ff', rays: '#d6ecff', moon: false, cloud: 0xffffff, cloudOp: 0.65, mount: 0x2a68a8 },
    // 1 dusk  — electric indigo sunset
    { sky: '#5f7dff', sun: '#cfe7ff', rays: null,      moon: false, cloud: 0xffd9f0, cloudOp: 0.42, mount: 0x1b2a5c },
    // 2 night — deep navy, small moon + flat stars
    { sky: '#0a1030', sun: null,      rays: null,      moon: true,  cloud: 0x2a3566, cloudOp: 0.18, mount: 0x0e1330 },
    // 3 dawn  — pale blue dawn
    { sky: '#82b6ff', sun: '#f2f8ff', rays: null,      moon: false, cloud: 0xfff0e8, cloudOp: 0.52, mount: 0x3f6fb0 },
  ];
  const FOG_DAY = 0x6db0ff, FOG_NIGHT = 0x101c42;

  function drawSky(phase) {
    const p = SKY_PHASES[phase];
    return (ctx, w, h) => {
      ctx.fillStyle = p.sky;
      ctx.fillRect(0, 0, w, h);
      if (p.moon) {
        // small moon disc (night)
        ctx.fillStyle = '#e8ecff';
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.26, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
        // flat stars — solid dots, no gradients
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 80; i++) {
          ctx.globalAlpha = 0.3 + Math.random() * 0.7;
          ctx.fillRect(Math.random() * w, Math.random() * h * 0.72, 1, 1);
        }
        ctx.globalAlpha = 1;
      } else if (p.sun) {
        // retro sliced sun — flat colors only
        const sunX = w / 2, sunH = h * 0.36, sunY = h * 0.58, sunW = w * 0.74;
        // flat sun rays (day only)
        if (p.rays) {
          ctx.fillStyle = p.rays;
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            ctx.save();
            ctx.translate(sunX, sunY);
            ctx.rotate(a);
            ctx.beginPath();
            ctx.moveTo(sunW * 0.52, 0);
            ctx.lineTo(sunW * 0.82, -sunW * 0.10);
            ctx.lineTo(sunW * 0.82, sunW * 0.10);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.fillStyle = p.sun;
        ctx.fillRect(sunX - sunW / 2, sunY - sunH, sunW, sunH * 2);
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 0.15;
        for (let i = 0; i < 7; i++) {
          const yy = sunY - sunH + (i + 0.4) * (sunH * 2 / 8);
          ctx.fillRect(sunX - sunW / 2, yy, sunW, sunH * 0.16);
        }
        ctx.globalAlpha = 1;
      }
    };
  }

  function updateDayNight() {
    const cyc = timeSetting === 'day' ? 0
      : timeSetting === 'night' ? 0.5
      : (timeClock % DAY_CYCLE) / DAY_CYCLE;
    const ang = cyc * Math.PI * 2;
    const alt = Math.cos(ang);                                  // 1 = noon, -1 = midnight
    const dayness = Math.max(0, Math.min(1, (alt + 0.35) / 0.7)); // smooth 1 (day) → 0 (night)
    const nightMix = 1 - dayness;
    nightMixG = nightMix;

    // discrete sky look (rebuilt only when the phase changes)
    let phase = timeSetting === 'day' ? 0
      : timeSetting === 'night' ? 2
      : alt > 0.3 ? 0 : alt < -0.3 ? 2 : (Math.sin(ang) < 0 ? 3 : 1);
    if (phase !== skyPhase) {
      skyPhase = phase;
      scene.background = canvasTex(2, 512, drawSky(phase));
      if (mountainMat) mountainMat.color = new THREE.Color(SKY_PHASES[phase].mount);
    }

    // smooth fog colour/density every frame (one tiny object)
    const fR = (FOG_DAY >> 16) & 255, fG = (FOG_DAY >> 8) & 255, fB = FOG_DAY & 255;
    const nR = (FOG_NIGHT >> 16) & 255, nG = (FOG_NIGHT >> 8) & 255, nB = FOG_NIGHT & 255;
    const r = Math.round(fR + (nR - fR) * nightMix);
    const g = Math.round(fG + (nG - fG) * nightMix);
    const b = Math.round(fB + (nB - fB) * nightMix);
    const rainMix = rainOn ? 1 : 0;
    scene.fog = new THREE.Fog((r << 16) | (g << 8) | b, 120 - 70 * nightMix - 55 * rainMix, 420 - 170 * nightMix - 190 * rainMix);

    // lights
    if (sunLight) {
      const dim = 0.62 + 0.38 * (1 - rainMix);
      sunLight.intensity = (0.18 + dayness * 1.7) * dim;
      hemiLight.intensity = (0.34 + dayness * 0.6) * dim;
      fillLight.intensity = (0.1 + dayness * 0.34) * dim;
    }

    // windows glow at night, fade by day
    for (const s of skySlots) s.mat.emissiveIntensity = 0.12 + 0.85 * nightMix;
    // clouds lighten by day, darken at night
    for (const c of cloudSlots) {
      c.sprite.material.opacity = 0.14 + 0.4 * dayness;
      c.sprite.material.color = new THREE.Color(SKY_PHASES[phase].cloud);
    }
    // neon road streaks burn bright at night, barely visible by day
    for (const s of streakSlots) s.mesh.material.opacity = 0.04 + 0.26 * nightMix;
  }

  /* ---------------- lights ---------------- */
  function makeLights() {
    hemiLight = new THREE.HemisphereLight(0xa8ccff, 0x15233f, 0.75);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xdbeaff, 1.25);
    sunLight.position.set(60, 90, -140);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 90;
    sunLight.shadow.camera.bottom = -90;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 320;
    sunLight.shadow.bias = -0.0006;
    scene.add(sunLight);
    scene.add(sunLight.target);

    fillLight = new THREE.DirectionalLight(0x66c8ff, 0.35);
    fillLight.position.set(-50, 40, 60);
    scene.add(fillLight);

    // neon under-glow that follows the player
    neonLight = new THREE.PointLight(0x2fa8ff, 22, 14, 2);
    neonLight.position.set(0, 1.4, PLAYER_Z);
    scene.add(neonLight);

    // headlights — two warm-white point lights + visible beam cones
    hlLightL = new THREE.PointLight(0xdff2ff, 0, 20, 2);
    hlLightR = new THREE.PointLight(0xdff2ff, 0, 20, 2);
    scene.add(hlLightL);
    scene.add(hlLightR);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xbcdcff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    hlConeL = new THREE.Mesh(new THREE.ConeGeometry(1.0, 8, 14, 1, true), coneMat.clone());
    hlConeL.rotation.x = -Math.PI / 2;          // point the beam forward (-z)
    hlConeL.position.set(-0.62, 0.75, PLAYER_Z - 1);
    scene.add(hlConeL);
    hlConeR = new THREE.Mesh(new THREE.ConeGeometry(1.0, 8, 14, 1, true), coneMat.clone());
    hlConeR.rotation.x = -Math.PI / 2;
    hlConeR.position.set(0.62, 0.75, PLAYER_Z - 1);
    scene.add(hlConeR);
  }

  /* ---------------- rain (particle streaks) ---------------- */
  function makeRain() {
    rainCount = IS_MOBILE ? 240 : 480;
    rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainPos.length; i += 3) {
      rainPos[i] = (Math.random() * 2 - 1) * 26;
      rainPos[i + 1] = Math.random() * 26 - 4;
      rainPos[i + 2] = -Math.random() * 130;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainDrops = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xbfd9ff, size: IS_MOBILE ? 0.16 : 0.2,
      transparent: true, opacity: 0.8, depthWrite: false,
    }));
    rainDrops.frustumCulled = false;
    rainDrops.visible = false;
    scene.add(rainDrops);
  }

  function updateRain(dt) {
    if (!rainDrops) return;
    if (!rainOn) {
      rainDrops.visible = false;
      return;
    }
    rainDrops.visible = true;
    const fall = (34 + speed * 1.1) * dt;
    const arr = rainPos;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += (Math.random() - 0.5) * dt * 7;
      arr[i + 1] -= fall;
      arr[i + 2] += (Math.random() - 0.5) * dt * 2;
      if (arr[i + 1] < cy - 15) {
        arr[i] = cx + (Math.random() * 2 - 1) * 17;
        arr[i + 1] = cy + 15;
        arr[i + 2] = cz - Math.random() * 100;
      }
    }
    rainDrops.geometry.attributes.position.needsUpdate = true;
  }

  /* headlights, indicators + wipers react every frame */
  function updateCarExtras(dt) {
    // headlight beams follow the car and glow brighter at night / in rain
    if (hlLightL) {
      const target = lightsOn ? (2.0 + 1.4 * nightMixG + (rainOn ? 1.0 : 0)) : 0;
      hlLightL.intensity += (target - hlLightL.intensity) * Math.min(1, dt * 6);
      hlLightR.intensity += (target - hlLightR.intensity) * Math.min(1, dt * 6);
      const px = player.x;
      hlLightL.position.x = px - 0.62;
      hlLightR.position.x = px + 0.62;
      hlConeL.position.x = px - 0.62;
      hlConeR.position.x = px + 0.62;
      const op = lightsOn ? (rainOn ? 0.22 : 0.14) : 0;
      hlConeL.material.opacity = op;
      hlConeR.material.opacity = op;
    }
    // turn signals: blink while steering, amber glow on the corners + dash arrows
    blinkerT += dt;
    const bln = (blinkerT % 0.8) < 0.4;
    const showL = Boolean(input.left), showR = Boolean(input.right);
    const blinkPow = bln ? 2.4 : 0.06;
    for (const m of blinkL) m.emissiveIntensity = showL ? blinkPow : 0;
    for (const m of blinkR) m.emissiveIntensity = showR ? blinkPow : 0;
    if (dashIndL) {
      dashIndL.material.opacity = showL ? (bln ? 1 : 0.2) : 0.14;
      dashIndL.material.color.setHex(bln && showL ? 0xffd23d : 0x3fb8ff);
      dashIndR.material.opacity = showR ? (bln ? 1 : 0.2) : 0.14;
      dashIndR.material.color.setHex(bln && showR ? 0xffd23d : 0x3fb8ff);
    }
    // wipers sweep across the windshield while switched on
    if (wiperL) {
      if (wipersOn) {
        wiperPhase += dt;
        let t = (wiperPhase % 1.4) / 0.75;
        if (t > 1) t = 1;
        const angle = Math.sin(t * Math.PI) * 0.95;
        wiperR.rotation.z = -angle;
        wiperL.rotation.z = angle;
      } else {
        wiperR.rotation.z = 0;
        wiperL.rotation.z = 0;
      }
    }
  }

  /* ---------------- road ---------------- */
  function makeRoad() {
    roadTex = canvasTex(256, 1024, (ctx, w, h) => {
      ctx.fillStyle = '#101a2e';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 34; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.10 + Math.random() * 0.16})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 20 + Math.random() * 70);
      }
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = `rgba(95,145,215,${0.05 + Math.random() * 0.07})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 30 + Math.random() * 90);
      }
      for (let band = 0; band < 2; band++) {
        const bx = band === 0 ? 0 : w - 16;
        for (let y = 0; y < h; y += 32) {
          ctx.fillStyle = y % 64 === 0 ? '#e4483f' : '#f2f4f8';
          ctx.fillRect(bx, y, 16, 20);
        }
      }
      ctx.fillStyle = '#f2f4f8';
      ctx.fillRect(24, 0, 6, h);
      ctx.fillRect(w - 30, 0, 6, h);
      for (const lx of [w * 1 / 3, w * 2 / 3]) {
        ctx.fillStyle = '#e6e9f2';
        for (let y = 0; y < h; y += 96) {
          ctx.fillRect(lx, y, 4, 48);
        }
      }
    }, 1, 60);

    roadTex.anisotropy = IS_MOBILE ? 1 : 4;
    const roadMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W, 450, 1, 1),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0.05 })
    );
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.01, -185);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x0d162c, roughness: 0.95 });
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(6, 450), shoulderMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(sx * (ROAD_W / 2 + 3), 0.005, -185);
      sh.receiveShadow = true;
      scene.add(sh);
    }

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 620),
      new THREE.MeshStandardMaterial({ color: 0x0a1226, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -180);
    ground.receiveShadow = true;
    scene.add(ground);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x8790a8, metalness: 0.85, roughness: 0.35 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5d6478, metalness: 0.6, roughness: 0.5 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x3fb8ff, transparent: true, opacity: 0.9 });
    for (const sx of [-1, 1]) {
      const x = sx * (ROAD_W / 2 + 0.85);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 450), railMat);
      rail.position.set(x, 0.85, -185);
      rail.castShadow = true;
      scene.add(rail);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 450), neonMat.clone());
      strip.position.set(x, 1.02, -185);
      scene.add(strip);

      for (let z = 20; z > -440; z -= 7) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.1, 6), postMat);
        p.position.set(x - sx * 0.45, 0.5, z);
        p.castShadow = true;
        scene.add(p);
        sideSlots.push({ type: 'railpost', mesh: p, x: p.position.x, z });
      }
    }
  }

  /* ---------------- scenery ---------------- */
  function makeWindowTex() {
    return canvasTex(64, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0a1020';
      ctx.fillRect(0, 0, w, h);
      for (let x = 4; x < w - 4; x += 11) {
        for (let y = 6; y < h - 6; y += 13) {
          ctx.fillStyle = Math.random() < 0.3
            ? (Math.random() < 0.5 ? 'rgba(150,220,255,0.85)' : 'rgba(110,195,255,0.9)')
            : 'rgba(20,36,72,0.9)';
          ctx.fillRect(x, y, 5, 7);
        }
      }
    });
  }

  function makeBillboardTex(idx) {
    const msgs = ['NEON RUSH', 'TURBO COLA', 'HYPER MART', 'BLASTER OIL', 'FUTURE CITY', 'GAS ★ MAXX'];
    return canvasTex(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0e1830';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3fb8ff';
      ctx.fillRect(0, h - 10, w, 10);
      ctx.fillStyle = '#6ad6ff';
      ctx.fillRect(0, 0, w, 6);
      ctx.fillStyle = '#fff';
      ctx.font = '900 34px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#3fb8ff';
      ctx.shadowBlur = 14;
      ctx.fillText(msgs[idx % msgs.length], w / 2, h / 2 - 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '600 14px Rajdhani, sans-serif';
      ctx.fillText('HIGHWAY 77', w / 2, h - 26);
    });
  }

  function buildProp(type) {
    const g = new THREE.Group();
    if (type === 'tree') {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.4, 2.2, 7),
        new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.95 })
      );
      trunk.position.y = 1.1;
      trunk.castShadow = true;
      g.add(trunk);
      const folMat = new THREE.MeshStandardMaterial({ color: 0x1d5c34, roughness: 0.85 });
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.4, 1.7, 8), folMat);
        cone.position.y = 2.5 + i * 1.15;
        cone.castShadow = true;
        g.add(cone);
      }
    } else if (type === 'light') {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4050, metalness: 0.7, roughness: 0.4 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 8), poleMat);
      pole.position.y = 2.7;
      g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.12), poleMat);
      arm.position.set(0.85, 5.4, 0);
      arm.rotation.z = 0.12;
      g.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lamp.position.set(1.65, 5.35, 0);
      g.add(lamp);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex(), color: 0xd8ecff, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.position.set(1.65, 5.2, 0);
      halo.scale.setScalar(4.5);
      g.add(halo);
    } else if (type === 'billboard') {
      const mat = new THREE.MeshStandardMaterial({ map: null, emissiveIntensity: 0.35 });
      const t = makeBillboardTex((Math.random() * 6) | 0);
      mat.map = t;
      mat.emissive = 0xffffff;
      mat.emissiveMap = t;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), mat);
      panel.position.y = 3.4;
      panel.castShadow = true;
      g.add(panel);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.5, roughness: 0.6 });
      for (const px of [-2.6, 2.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.4, 6), postMat);
        post.position.set(px, 2.2, 0);
        post.castShadow = true;
        g.add(post);
      }
    } else if (type === 'pylon') {
      const towerMat = new THREE.MeshStandardMaterial({ color: 0x4a5268, metalness: 0.6, roughness: 0.5 });
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 11, 5), towerMat);
        leg.position.set(i % 2 === 0 ? -0.7 : 0.7, 5.5, i < 2 ? -0.7 : 0.7);
        g.add(leg);
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5252 }));
      tip.position.y = 11.4;
      g.add(tip);
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex(), color: 0xff5252, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      beacon.position.y = 11.8;
      beacon.scale.setScalar(3.4);
      g.add(beacon);
    }
    return g;
  }

  function makeSideSlots() {
    const types = ['tree', 'tree', 'tree', 'tree', 'light', 'light', 'light', 'billboard', 'pylon', 'tree'];
    const n = IS_MOBILE ? 26 : 42;
    for (let i = 0; i < n; i++) {
      const t = types[(Math.random() * types.length) | 0];
      const g = buildProp(t);
      const slot = { type: t, group: g, z: 20 - Math.random() * 460 };
      const side = Math.random() < 0.5 ? -1 : 1;
      g.position.set(side * (14 + Math.random() * 16), 0, slot.z);
      g.rotation.y = Math.random() * 0.6 - 0.3;
      const s = 0.85 + Math.random() * 0.5;
      g.scale.set(s, s, s);
      scene.add(g);
      sideSlots.push(slot);
    }
  }

  function wrapProp(slot) {
    slot.z = slot.z - 460;
    const side = Math.random() < 0.5 ? -1 : 1;
    slot.group.position.x = side * (14 + Math.random() * 16);
    slot.group.rotation.y = Math.random() * 0.6 - 0.3;
    const s = 0.85 + Math.random() * 0.5;
    slot.group.scale.set(s, s, s);
  }

  function makeSkyline() {
    const winTex = makeWindowTex();
    for (let i = 0; i < (IS_MOBILE ? 14 : 22); i++) {
      const h = 14 + Math.random() * 50;
      const w = 9 + Math.random() * 13;
      const mat = new THREE.MeshStandardMaterial({
        map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.85, roughness: 0.8,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      b.position.set((Math.random() < 0.5 ? -1 : 1) * (46 + Math.random() * 60), h / 2, 20 - Math.random() * 270);
      scene.add(b);
      skySlots.push({ mesh: b, mat });
    }
  }

  function makeMountains() {
    mountainMat = new THREE.MeshStandardMaterial({ color: 0x1f1406, roughness: 1, flatShading: true });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const h = 30 + Math.random() * 55;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(26 + Math.random() * 22, h, 6), mountainMat);
        cone.position.set(side * (85 + Math.random() * 70), h / 2 - 1.5, -(30 + i * 34) - Math.random() * 14);
        scene.add(cone);
      }
    }
  }

  function makeClouds() {
    const tex = cloudTex();
    for (let i = 0; i < (IS_MOBILE ? 6 : 9); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.42, depthWrite: false, color: 0xffffff,
      }));
      sp.position.set((Math.random() - 0.5) * 460, 60 + Math.random() * 55, -(Math.random() * 280));
      sp.scale.set(40 + Math.random() * 70, 14 + Math.random() * 20, 1);
      scene.add(sp);
      cloudSlots.push({ sprite: sp, drift: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2) });
    }
  }

  function makeStreaks() {
    const colors = [0x6ad6ff, 0x3fb8ff, 0x8ef0ff];
    for (let i = 0; i < (IS_MOBILE ? 10 : 16); i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 4),
        new THREE.MeshBasicMaterial({
          color: colors[i % colors.length], transparent: true, opacity: 0.28,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(LANES[(Math.random() * 3) | 0] + (Math.random() - 0.5) * 2.6, 0.03, 20 - Math.random() * 420);
      scene.add(m);
      streakSlots.push({ mesh: m });
    }
  }

  /* ---------------- pools ---------------- */
  function makeCoinMesh() {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.16, 24),
      new THREE.MeshStandardMaterial({ color: 0x35c8ff, emissive: 0x3fb8ff, emissiveIntensity: 1.1, metalness: 0.9, roughness: 0.25 })
    );
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.2, 18),
      new THREE.MeshStandardMaterial({ color: 0x8ef0ff, emissive: 0x8ef0ff, emissiveIntensity: 0.9, metalness: 0.85, roughness: 0.3 })
    );
    inner.rotation.x = Math.PI / 2;
    g.add(inner);
    g.visible = false;
    scene.add(g);
    return { group: g, active: false, spin: Math.random() * 3, phase: Math.random() * Math.PI * 2 };
  }

  function makeAmmoMesh() {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.6, 0),
      new THREE.MeshStandardMaterial({ color: 0x4dc9ff, emissive: 0x2fa8ff, emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.3 })
    );
    m.visible = false;
    scene.add(m);
    return { mesh: m, active: false, phase: Math.random() * 3 };
  }

  function makeConeTex() {
    return canvasTex(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#e4483f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f6f7fb';
      ctx.fillRect(0, h * 0.45, w, h * 0.22);
    });
  }

  function makeBarrel(x, z) {
    const tex = canvasTex(64, 96, (ctx, w, h) => {
      ctx.fillStyle = '#e6503f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f6f7fb';
      for (let y = 0; y < h; y += 24) ctx.fillRect(0, y, w, 9);
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.5, 16),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 })
    );
    body.position.y = 0.75;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.42, 0.35, 14),
      new THREE.MeshStandardMaterial({ color: 0x2d313d, roughness: 0.7 })
    );
    cap.position.y = 1.68;
    g.add(cap);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function makeCone(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.95, 14),
      new THREE.MeshStandardMaterial({ map: makeConeTex(), roughness: 0.55 })
    );
    base.position.y = 0.46;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function makeOilSlick(x, z) {
    const tex = canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(20,14,8,0)';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(28,20,12,${0.16 + Math.random() * 0.22})`;
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 22, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    scene.add(m);
    return m;
  }

  function makeBarrier(x, z) {
    const g = new THREE.Group();
    const panelTex = canvasTex(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#e4483f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f6f7fb';
      for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 8);
    });
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 1.0, 0.22),
      new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.6, metalness: 0.2 })
    );
    panel.position.y = 0.7;
    panel.castShadow = true; panel.receiveShadow = true;
    g.add(panel);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.5, roughness: 0.6 });
    for (const lx of [-1.15, 1.15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), legMat);
      leg.position.set(lx, 0.42, 0);
      leg.castShadow = true;
      g.add(leg);
    }
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.14, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x8ef0ff })
    );
    lamp.position.y = 1.34;
    g.add(lamp);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function makeRock(x, z) {
    const g = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4340, roughness: 0.95, flatShading: true });
    const r1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), rockMat);
    r1.scale.set(1.2, 0.8, 1);
    r1.position.y = 0.45;
    r1.rotation.x = 0.3; r1.rotation.y = 0.7; r1.rotation.z = 0.2;
    r1.castShadow = true; r1.receiveShadow = true;
    const r2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), rockMat);
    r2.position.set(0.9, 0.35, -0.35);
    r2.rotation.x = 0.9; r2.rotation.y = 0.2; r2.rotation.z = 0.5;
    r2.castShadow = true; r2.receiveShadow = true;
    const r3 = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), rockMat);
    r3.position.set(-0.75, 0.3, 0.4);
    r3.rotation.x = 0.4; r3.rotation.y = 1.2; r3.rotation.z = 0.1;
    r3.castShadow = true; r3.receiveShadow = true;
    g.add(r1, r2, r3);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  const obstacleTypes = {
    car:     { halfW: 1.0,  halfL: 2.4, value: 150, vc: true,  hp: 1 },
    truck:   { halfW: 1.15, halfL: 3.2, value: 250, vc: true,  hp: 2 },
    barrel:  { halfW: 0.8,  halfL: 0.8, value: 100, vc: false, hp: 1 },
    cone:    { halfW: 0.55, halfL: 0.55, value: 50, vc: false, hp: 1 },
    barrier: { halfW: 1.52, halfL: 0.9, value: 200, vc: false, hp: 2 },
    rock:    { halfW: 0.95, halfL: 0.95, value: 80, vc: false, hp: 1 },
    oil:     { halfW: 0.95, halfL: 1.0,  value: 0,  vc: false, hp: 0, solid: false },
  };

  const OBSTACLE_TYPES = ['car', 'truck', 'barrel', 'cone', 'rock', 'barrier', 'oil'];

  function pickObstacleType() {
    const w = diff.weights || [0.40, 0.10, 0.22, 0.14, 0.06, 0.04, 0.04];
    let r = Math.random();
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return OBSTACLE_TYPES[i]; }
    return 'car';
  }

  function makeObstacleEnt(type, x) {
    let mesh;
    if (type === 'barrel') {
      mesh = makeBarrel(x, SPAWN_Z);
    } else if (type === 'cone') {
      mesh = makeCone(x, SPAWN_Z);
    } else if (type === 'barrier') {
      mesh = makeBarrier(x, SPAWN_Z);
    } else if (type === 'rock') {
      mesh = makeRock(x, SPAWN_Z);
    } else if (type === 'oil') {
      mesh = makeOilSlick(x, SPAWN_Z);
    } else {
      mesh = type === 'truck'
        ? CarBuilder.buildTruck(new THREE.Color().setHSL(Math.random(), 0.5, 0.35).getHex())
        : CarBuilder.buildTraffic();
      mesh.rotation.y = Math.PI;      // nose points forward (-z)
      mesh.position.set(x, 0, SPAWN_Z);
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = !IS_MOBILE; });   // no traffic shadows on phones
      scene.add(mesh);
    }
    const info = obstacleTypes[type];
    return {
      type, mesh, x, z: SPAWN_Z,
      halfW: info.halfW, halfL: info.halfL, value: info.value,
      vc: info.vc ? 9 + Math.random() * 10 : 0,
      hp: info.hp,
      solid: info.solid !== false,
      alive: true, passed: false,
    };
  }

  function spawnObstacle() {
    // difficulty caps how much can pile up on the road at once
    if (obstacles.length >= diff.trafMax) return;
    const ready = [0, 1, 2].filter((L) => laneCooldown[L] <= 0);
    if (ready.length === 0) return;

    const addAt = (L, zOffset, forceType) => {
      if (obstacles.length >= diff.trafMax) return null;
      const x = LANES[L] + (Math.random() - 0.5) * 0.6;
      const ent = makeObstacleEnt(forceType || pickObstacleType(), x);
      if (zOffset) {
        ent.z = SPAWN_Z - zOffset;
        ent.mesh.position.z = ent.z;
      }
      obstacles.push(ent);
      return ent;
    };

    const lane = ready[(Math.random() * ready.length) | 0];
    const first = addAt(lane, 0);
    laneCooldown[lane] = diff.laneGap + Math.random() * 120;

    // convoy: a stream of extra vehicles right behind in the SAME lane — busy highway
    if (first && (first.type === 'car' || first.type === 'truck') && Math.random() < diff.convoyChance) {
      const n = 1 + ((Math.random() * 2) | 0);          // 1-2 extra cars
      const followType = Math.random() < 0.8 ? 'car' : 'truck';
      let zOff = 13 + Math.random() * 9;
      for (let k = 0; k < n; k++) {
        addAt(lane, zOff, followType);
        zOff += 11 + Math.random() * 8;
      }
    }

    // wall formation in a different lane
    if (Math.random() < diff.duoChance) {
      const others = [0, 1, 2].filter((L) => L !== lane && laneCooldown[L] <= 0);
      if (others.length) {
        const lane2 = others[(Math.random() * others.length) | 0];
        addAt(lane2, 0, Math.random() < 0.72 ? 'car' : 'truck');
        laneCooldown[lane2] = diff.laneGap + Math.random() * 120;
      }
    }
  }

  function spawnCoinLine() {
    const lane = (Math.random() * 3) | 0;
    const x = LANES[lane] + (Math.random() - 0.5) * 1.2;
    const n = 2 + ((Math.random() * 3) | 0);
    let z = SPAWN_Z;
    for (let i = 0; i < n; i++) {
      const c = coinPool.find((c) => !c.active);
      if (!c) break;
      c.active = true;
      c.group.visible = true;
      c.group.position.set(x, 1.05, z);
      c.phase = Math.random() * Math.PI * 2;
      z -= 3.4;
    }
  }

  function spawnAmmo() {
    const p = ammoPool.find((p) => !p.active);
    if (!p) return;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.set(LANES[(Math.random() * 3) | 0], 1.3, SPAWN_Z);
  }

  /* ---------------- player ---------------- */
  function makePlayer() {
    const bodyColor = paintOverride !== null ? parseInt(paintOverride, 16) : carOpt.color;
    const g = CarBuilder.buildSport(bodyColor, { underglow: carOpt.glow });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x2a1a06, metalness: 0.85, roughness: 0.3 });
    for (const bx of [-0.55, 0.55]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 10), barMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(bx, 0.62, 2.62);
      g.add(b);
    }
    // amber indicator blinkers on all four corners (turn signals)
    blinkL = []; blinkR = [];
    const mkInd = (x, z, arr) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.12, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x1a0f00, emissive: 0xffa012, emissiveIntensity: 0 })
      );
      m.position.set(x, 0.6, z);
      g.add(m);
      arr.push(m.material);
    };
    mkInd(-0.56, 2.3, blinkL);      // front-left
    mkInd(0.56, 2.3, blinkR);       // front-right
    mkInd(-0.5, -2.72, blinkL);     // rear-left
    mkInd(0.5, -2.72, blinkR);      // rear-right
    g.position.set(0, 0, PLAYER_Z);
    g.rotation.y = Math.PI;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    player = { group: g, x: 0, vx: 0, steer: 0, skid: 0 };
  }

  function rebuildPlayer() {
    if (!player) return;
    scene.remove(player.group);
    makePlayer();
    player.x = 0;
  }

  function setCar(id) {
    const opt = CAR_OPTIONS.find((c) => c.id === id) || CAR_OPTIONS[0];
    if (opt === carOpt) return;
    carOpt = opt;
    rebuildPlayer();
  }

  /* ---------------- cockpit interior (dashboard + steering wheel) ---------------- */
  function makeCockpit() {
    const c = new THREE.Group();
    const dashMat = new THREE.MeshStandardMaterial({ color: 0x191208, roughness: 0.85, metalness: 0.15 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a1a06, metalness: 0.6, roughness: 0.4 });

    // dash shelf + knee panel
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.34, 0.4), dashMat);
    dash.position.set(0, -0.62, -1.55);
    dash.rotation.x = -0.18;
    c.add(dash);
    const knee = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.42, 0.26), dashMat);
    knee.position.set(0, -0.96, -1.02);
    c.add(knee);

    // windshield frame: A-pillars + roof bar
    const pillarGeo = new THREE.BoxGeometry(0.13, 1.2, 0.14);
    for (const px of [-1.55, 1.55]) {
      const p = new THREE.Mesh(pillarGeo, dashMat);
      p.position.set(px, -0.08, -1.52);
      c.add(p);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 0.16), dashMat);
    roof.position.set(0, 0.62, -1.52);
    c.add(roof);

    // steering wheel (right-hand drive)
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0.46, -0.3, -1.12);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 10), trimMat);
    col.rotation.x = 1.25;
    col.position.z = 0.22;
    wheelGroup.add(col);
    const wheelTex = canvasTex(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0d0a05';
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3fb8ff';
      ctx.lineWidth = w * 0.07;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#2f7fb8';
      ctx.lineWidth = w * 0.05;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(i * Math.PI * 2 / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h * 0.42); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#8ef0ff';
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.1, 0, Math.PI * 2); ctx.fill();
    });
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.045, 26),
      new THREE.MeshBasicMaterial({ map: wheelTex })
    );
    wheel.rotation.x = -1.15;
    wheelGroup.add(wheel);
    c.add(wheelGroup);
    cockpitWheel = wheel;

    // speedometer gauge (blue flat dial)
    const gaugeTex = canvasTex(160, 160, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2, R = w * 0.44;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#101827';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff3b10';
      ctx.lineWidth = w * 0.05;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, Math.PI * 0.32, Math.PI * 0.75); ctx.stroke();   // redline
      ctx.strokeStyle = '#3fb8ff';
      ctx.lineWidth = w * 0.022;
      for (let i = 0; i <= 48; i++) {
        const a = -Math.PI * 0.75 + (i / 48) * (Math.PI * 1.5);
        const r1 = R * 0.86, r2 = (i % 6 === 0) ? R * 0.7 : R * 0.79;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.fillStyle = '#8ef0ff';
      ctx.font = 'bold ' + Math.round(w * 0.11) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 8; i++) {
        const a = -Math.PI * 0.75 + (i / 8) * (Math.PI * 1.5);
        ctx.fillText(String(i * 30), cx + Math.cos(a) * R * 0.63, cy + Math.sin(a) * R * 0.63);
      }
      ctx.fillStyle = '#6ad6ff';
      ctx.font = 'bold ' + Math.round(w * 0.07) + 'px monospace';
      ctx.fillText('KM/H', cx, cy + R * 0.34);
    });
    const gaugePivot = new THREE.Group();
    gaugePivot.position.set(0.12, -0.05, -1.53);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.66),
      new THREE.MeshBasicMaterial({ map: gaugeTex, transparent: true, opacity: 0.96 })
    );
    gaugePivot.add(face);
    c.add(gaugePivot);

    // needle spins on its own pivot so the dial stays still
    const needlePivot = new THREE.Group();
    needlePivot.position.copy(gaugePivot.position);
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.18, 0.012),
      new THREE.MeshBasicMaterial({ color: 0x3fb8ff })
    );
    needle.position.y = 0.085;
    needlePivot.add(needle);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10),
      new THREE.MeshBasicMaterial({ color: 0x8ef0ff })
    );
    cap.rotation.x = Math.PI / 2;
    needlePivot.add(cap);
    c.add(needlePivot);
    cockpitNeedlePivot = needlePivot;

    // turn-signal indicator arrows on the dash (left / right of the gauge)
    const indTex = canvasTex(64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(w * 0.16, h * 0.5);
      ctx.lineTo(w * 0.86, h * 0.16);
      ctx.lineTo(w * 0.86, h * 0.84);
      ctx.closePath();
      ctx.fill();
    });
    const indMat = new THREE.MeshBasicMaterial({ map: indTex, transparent: true, opacity: 0.16, depthWrite: false });
    dashIndL = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), indMat);
    dashIndL.position.set(-0.34, -0.05, -1.52);
    c.add(dashIndL);
    dashIndR = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), indMat.clone());
    dashIndR.scale.x = -1;
    dashIndR.position.set(0.62, -0.05, -1.52);
    c.add(dashIndR);

    // windscreen wipers — two arms sweeping across the windshield
    const makeWiperArm = (side) => {
      const a = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 1.15), trimMat);
      arm.position.y = 0.55;                      // pivot at the bottom
      a.add(arm);
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x0c0c12 })
      );
      blade.position.y = 0.92;
      a.add(blade);
      a.position.set(side, 0.24, -1.44);          // in front of the windshield pillars
      return a;
    };
    wiperR = makeWiperArm(0.66);
    wiperL = makeWiperArm(-0.66);
    c.add(wiperR);
    c.add(wiperL);
    wiperR.rotation.z = 0;
    wiperL.rotation.z = 0;

    // rear-view mirror (top centre of the windshield) — a live "fake" mirror canvas
    mirrorCanvas = document.createElement('canvas');
    mirrorCanvas.width = 128; mirrorCanvas.height = 64;
    mirrorCtx = mirrorCanvas.getContext('2d');
    mirrorTex = new THREE.CanvasTexture(mirrorCanvas);
    mirrorTex.colorSpace = THREE.SRGBColorSpace;
    const mirrorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.30, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x0d0a05 })
    );
    mirrorFrame.position.set(0, 0.42, -0.98);
    c.add(mirrorFrame);
    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.24),
      new THREE.MeshBasicMaterial({ map: mirrorTex })
    );
    mirror.rotation.y = Math.PI;         // face the driver
    mirror.rotation.x = 0.05;
    mirror.position.copy(mirrorFrame.position);
    c.add(mirror);
    drawMirrorBack(0);                   // paint the initial frame

    cockpit = c;
    camera.add(c);
    c.visible = false;
  }

  function toggleCam() {
    camMode = camMode === 'chase' ? 'cockpit' : 'chase';
    AudioFX.sfx.ui();
  }

  /* combo multiplier: near-misses + kills stack a multiplier (up to ×4) */
  function comboMult() { return Math.min(4, 1 + combo * 0.2); }

  /* fake rear-view mirror drawn every frame while in cockpit view */
  function drawMirrorBack(speed) {
    if (!mirrorCtx) return;
    const w = mirrorCanvas.width, h = mirrorCanvas.height;
    const ctx = mirrorCtx;
    ctx.fillStyle = '#0e1626';
    ctx.fillRect(0, 0, w, h);
    // glass shading
    ctx.fillStyle = 'rgba(64,178,255,0.12)';
    ctx.fillRect(0, 0, w, h);
    // road + shoulder
    ctx.fillStyle = '#14223a';
    ctx.fillRect(0, h * 0.46, w, h * 0.54);
    ctx.fillStyle = '#0c1426';
    ctx.fillRect(0, h * 0.46, w, 2);
    // our lane centre shifts with the car's lateral position
    const cx = w / 2 - (player ? player.x * 4 : 0);
    ctx.fillStyle = '#3a5f9e';
    ctx.fillRect(cx - w * 0.18, h * 0.46, 2, h * 0.54);
    ctx.fillRect(cx + w * 0.18, h * 0.46, 2, h * 0.54);
    ctx.fillStyle = '#6ad6ff';
    ctx.fillRect(cx - 1, h * 0.46, 2, 2);
    // lane dashes rushing away behind us
    if (speed) {
      const off = ((speed * 34) % 14);
      ctx.fillStyle = '#9fc9ff';
      for (let y = h * 0.46 - 12 + off; y > 2; y -= 14) ctx.fillRect(cx - 1.5, y, 3, 6);
    }
    // traffic behind the player, closest = lowest + biggest
    if (obstacles && player) {
      for (const o of obstacles) {
        if (!o.alive || o.type === 'oil') continue;
        const dz = PLAYER_Z - o.z;
        if (dz < 2 || dz > 70) continue;
        const y = h * 0.48 + (dz / 70) * (h * 0.5);
        const s = 0.6 + (dz / 70) * 2.4;
        const ox = cx + (o.x - player.x) * 4;
        const rw = s * 3 + (o.type === 'truck' ? 2.5 : 0);
        const rh = s * 4.5;
        ctx.fillStyle = o.type === 'truck' ? '#b9c9ff' : (o.type === 'barrier' || o.type === 'barrel') ? '#e6503f' : '#ff6a72';
        ctx.fillRect(ox - rw / 2, y, rw, rh);
      }
    }
    if (mirrorTex) mirrorTex.needsUpdate = true;
  }

  function setPaint(hex) {
    paintOverride = (hex && /^[0-9a-fA-F]{6}$/.test(hex)) ? hex.toLowerCase() : null;
    if (player) rebuildPlayer();
  }

  /* ---------------- HUD ---------------- */
  function cacheHud() {
    const $ = (id) => document.getElementById(id);
    hud = {
      score: $('hud-score'), coins: $('hud-coins'), best: $('hud-best'),
      speed: $('hud-speed'), speedFill: $('speedo-fill'), cooldownFill: $('cooldown-fill'),
      combo: $('combo'), comboLabel: $('combo-label'), comboFill: $('combo-fill'),
      lives: Array.from(document.querySelectorAll('#hud-lives .life')),
    };
  }

  function updateHud() {
    hud.speed.textContent = Math.round(speed * 3.6);
    hud.score.textContent = Math.floor(score).toLocaleString();
    hud.coins.textContent = coins;
    hud.best.textContent = bestScore();
    hud.speedFill.style.width = Math.min(100, (speed / diff.maxSpeed) * 100) + '%';
    hud.cooldownFill.style.width = (ammo / MAX_AMMO) * 100 + '%';
    if (hud.combo) {
      if (combo > 0) {
        hud.combo.style.opacity = 1;
        hud.comboLabel.textContent = 'COMBO ×' + comboMult().toFixed(1);
        hud.comboFill.style.width = Math.min(100, (comboT / 3.5) * 100) + '%';
      } else {
        hud.combo.style.opacity = 0;
      }
    }
    hud.lives.forEach((el, i) => el.classList.toggle('lost', i >= lives));
  }

  /* ---------------- collisions ---------------- */
  function collidesPlayer(ent) {
    return Math.abs(ent.z - PLAYER_Z) < ent.halfL + 2.2 &&
           Math.abs(ent.x - player.x) < ent.halfW + 1.05;
  }

  /* ---------------- race flow ---------------- */
  function startRacing(diffKey) {
    diff = DIFFS[diffKey] || DIFFS.medium;
    state = 'playing';
    speed = 24; elapsed = 0; distance = 0;
    timeClock = 0;                       // every race starts at bright day, then the cycle rolls on
    skyPhase = -1;
    score = 0; coins = 0; kills = 0;
    lives = GAME_LIVES; invuln = 1.2; shake = 0; dyingTimer = 0;
    oilT = 0; driftTime = 0; driftSmokeT = 0; driftScoreClock = 0;
    driftPrev = false; driftBoost = 0;
    ammo = MAX_AMMO; fireCooldown = 0;
    nextSpawn = 10; nextCoinSpawn = 4;
    laneCooldown = [0, 0, 0];

    // fresh start: countdown + combo reset
    countingDown = true; countdownT = 3.6; goPlayed = false;
    combo = 0; comboT = 0;
    const cdEl = document.getElementById('countdown');
    if (cdEl) { cdEl.textContent = '3'; cdEl.style.opacity = 0; }

    for (const o of obstacles) scene.remove(o.mesh);
    obstacles.length = 0;
    for (const c of coinPool) { c.active = false; c.group.visible = false; }
    for (const p of ammoPool) { p.active = false; p.mesh.visible = false; }
    for (const b of Bolts.allActive()) Bolts.hit(b);

    player.group.visible = true;
    player.group.position.set(0, 0, PLAYER_Z);
    player.x = 0; player.vx = 0; player.steer = 0;

    document.getElementById('damage-vignette').style.opacity = 0;
    document.getElementById('low-hp-bar').style.opacity = 0;

    AudioFX.engineStart();
    AudioFX.engineUpdate(0.35);
    AudioFX.musicStart();
    AudioFX.sfx.start();

    lastTime = performance.now();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    AudioFX.engineStop();
    AudioFX.musicStop();
    AudioFX.sfx.ui();
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    AudioFX.engineStart();
    AudioFX.musicStart();
    lastTime = performance.now();
  }

  function toMenu() {
    state = 'idle';
    AudioFX.engineStop();
    AudioFX.musicStop();
  }

  function destroyObstacle(ent, isCrash) {
    if (!ent.alive) return;
    ent.alive = false;
    const pos = ent.mesh.position.clone();
    const colors = (ent.type === 'barrel' || ent.type === 'cone')
      ? [0x6ad6ff, 0x8ef0ff, 0xffffff]
      : [0xff4d5e, 0x4dc9ff, 0xffffff, ent.type === 'truck' ? 0xbfd0ff : 0x6ad6ff];
    Particles.burst(pos.setY(0.8), colors, 24, 4, 1);
    Smoke.emit(pos.clone().setY(0.8), new THREE.Vector3(0, 3, 2), 6);
    AudioFX.sfx.explosion();

    if (!isCrash) {
      kills++;
      combo++; comboT = 3.5;
      ammo = Math.min(MAX_AMMO, ammo + 2);
      const gain = Math.round(ent.value * comboMult());
      score += gain;
      FloatTexts.show('+' + gain, '#6ad6ff', pos.clone().setY(3), camera);
    }
    scene.remove(ent.mesh);
  }

  /* solid obstacles with HP take multiple shots; non-mortal hits chip points off */
  function hitObstacle(ent) {
    ent.hp = (ent.hp || 1) - 1;
    if (ent.hp > 0) {
      const p = ent.mesh.position.clone().setY(0.8);
      Particles.burst(p, [0xcfe7ff, 0x4dc9ff, 0xffffff], 8, 2.2, 0);
      AudioFX.sfx.hit();
      score += Math.round(ent.value * 0.1);
      FloatTexts.show('+' + Math.round(ent.value * 0.1), '#8ef0ff', p.setY(3), camera);
    } else {
      destroyObstacle(ent, false);
    }
  }

  /* oil slick — no crash, just a nasty loss of grip */
  function triggerOilSlick(ent) {
    ent.alive = false;
    ent.mesh.visible = false;
    oilT = 1.15;
    shake = Math.max(shake, 0.4);
    speed = Math.max(12, speed * 0.62);
    const p = ent.mesh.position.clone().setY(0.3);
    Particles.burst(p, [0x8ef0ff, 0xff6a72, 0xffffff], 10, 2.5, 0);
    Smoke.emit(ent.mesh.position.clone().setY(0.2), new THREE.Vector3(0, 1.5, 3), 6);
    AudioFX.sfx.oil();
    FloatTexts.show('SLICK!', '#8ef0ff', ent.mesh.position.clone().setY(3), camera);
  }

  function crash(ent) {
    if (invuln > 0 || state !== 'playing') return;
    lives--;
    shake = 0.85;
    invuln = 2.4;
    speed = Math.max(16, speed * 0.55);
    const p = ent.mesh.position.clone().setY(0.8);
    Particles.burst(p, [0xff6a72, 0x8ef0ff, 0xffffff], 30, 4.5, 1);
    Smoke.emit(p, new THREE.Vector3(0, 3, 4), 10);
    AudioFX.sfx.crash();
    document.getElementById('damage-vignette').style.opacity = 1;
    destroyObstacle(ent, true);

    if (lives <= 0) {
      dyingSequence();
    } else if (lives === 1) {
      document.getElementById('low-hp-bar').style.opacity = 1;
    }
    updateHud();
  }

  function dyingSequence() {
    state = 'dying';
    dyingTimer = 1.35;
    AudioFX.engineStop();
    AudioFX.sfx.gameover();
    const p = player.group.position;
    Particles.burst(p, [0xffc219, 0xff6a3d, 0xffe08a, 0xffffff], 46, 5, 1);
    Smoke.emit(p, new THREE.Vector3(0, 6, 0), 14);
    player.group.visible = false;
    shake = 1.4;
  }

  /* ---------------- blaster ---------------- */
  function tryFire(dt) {
    fireCooldown -= dt;
    if (!input.fire || fireCooldown > 0 || ammo <= 0) return;
    fireCooldown = 0.16;
    ammo--;
    const charge = 1 - (ammo / MAX_AMMO) * 0.55;
    const px = player.x;
    // gun barrels sit at the front of the car (~world z 1.4)
    Bolts.fire(px - 0.55, 0.75, PLAYER_Z - 2.3, charge);
    Bolts.fire(px + 0.55, 0.75, PLAYER_Z - 2.3, charge);
    Particles.burst(new THREE.Vector3(px, 0.75, PLAYER_Z - 2.8), [0xcfe7ff, 0x4dc9ff, 0xffffff], 4, 2.5, 0);
    AudioFX.sfx.shoot();
  }

  /* ---------------- main update ---------------- */
  function update(dt) {
    sceneT += dt;

    // ---- dying sequence runs independently ----
    if (state === 'dying') {
      dyingTimer -= dt;
      Particles.update(dt);
      Smoke.update(dt);
      if (shake > 0) {
        shake = Math.max(0, shake - dt * 1.6);
        camera.position.x += (Math.random() - 0.5) * shake * 0.5;
        camera.position.y += (Math.random() - 0.5) * shake * 0.4;
      }
      if (dyingTimer <= 0) {
        state = 'gameover';
        AudioFX.musicStop();
        if (onGameOverCb) onGameOverCb({
          score: Math.floor(score),
          coins,
          distance: Math.floor(distance),
          kills,
        });
      }
      return;
    }
    if (state !== 'playing') return;

    /* --- start countdown 3·2·1·GO --- */
    if (countingDown) {
      countdownT -= dt;
      const el = document.getElementById('countdown');
      if (countdownT > 0.2) {
        el.style.opacity = 1;
        const d = countdownT > 2.6 ? 3 : countdownT > 1.6 ? 2 : countdownT > 0.6 ? 1 : 0;
        const txt = d === 0 ? 'GO!' : String(d);
        if (el.textContent !== txt) {
          el.textContent = txt;
          if (d === 0) { if (!goPlayed) { goPlayed = true; AudioFX.sfx.start(); } }
          else AudioFX.sfx.ui();
        }
      } else {
        countingDown = false;
        el.style.opacity = 0;
      }
      // hold the car steady while the camera settles into the chase position
      speed = 0;
      player.steer += (0 - player.steer) * Math.min(1, dt * 8);
      player.vx += (0 - player.vx) * Math.min(1, dt * 5);
      player.group.position.x = player.x;
      player.group.position.y = Math.sin(sceneT * 26) * 0.02;
      player.group.position.z = PLAYER_Z;
      player.group.rotation.z = -player.steer - player.vx * 0.004;
      player.group.rotation.x = -0.015;
      const kd = 1 - Math.exp(-dt * 5.2);
      camera.position.x += (player.x * 0.66 - camera.position.x) * kd;
      camera.position.y += (camBase.y - camera.position.y) * kd;
      camera.position.z += (camBase.z - camera.position.z) * kd;
      camera.lookAt(player.x * 0.42, 1.15, -3);
      AudioFX.engineUpdate(0.1 + Math.sin(sceneT * 9) * 0.04);
      updateHud();
      return;
    }

    elapsed += dt;
    distance += speed * dt;
    score += speed * dt * 3 + dt * 8;

    /* --- combo multiplier decay --- */
    if (combo > 0) {
      comboT -= dt;
      if (comboT <= 0) combo = 0;
    }

    /* --- drift state --- */
    const steerReq = (input.left ? -1 : 0) + (input.right ? 1 : 0);   // raw steering request
    const drifting = Boolean(input.drift) && speed > 18 && steerReq !== 0;
    if (drifting) {
      driftTime += dt;
      driftBoost = Math.min(36, driftBoost + 16 * dt);                 // charge the release boost
      driftScoreClock += dt;
      while (driftScoreClock > 0.25) { driftScoreClock -= 0.25; score += 6 * comboMult(); }
      // tyre smoke angles away from the turn
      driftSmokeT -= dt;
      if (driftSmokeT <= 0) {
        driftSmokeT = 0.06;
        const dir = steerReq > 0 ? -1 : 1;
        Smoke.emit(new THREE.Vector3(player.x - 0.75, 0.35, PLAYER_Z - 1.8), new THREE.Vector3(dir * 1.2, 0.9, 2), 1);
        Smoke.emit(new THREE.Vector3(player.x + 0.75, 0.35, PLAYER_Z - 1.8), new THREE.Vector3(dir * 1.2, 0.9, 2), 1);
        AudioFX.sfx.skid();
      }
    } else {
      // drift release: the stored charge pops as a speed boost + combo
      if (driftPrev && driftBoost >= 8) {
        const boost = driftBoost;
        speed = Math.min(diff.maxSpeed, speed + boost);
        score += Math.round(boost * comboMult());
        combo++; comboT = 3.5;
        FloatTexts.show('DRIFT +' + Math.round(boost * 3.6) + ' KM/H', '#8ef0ff', new THREE.Vector3(player.x, 2, PLAYER_Z - 1), camera);
        Smoke.emit(new THREE.Vector3(player.x, 0.4, PLAYER_Z - 1.4), new THREE.Vector3(0, 4, 0), 8);
        AudioFX.sfx.skid();
      }
      driftTime = 0; driftBoost = 0;
    }
    driftPrev = drifting;

    /* --- speed --- */
    const rampMax = Math.min(diff.maxSpeed, 30 + elapsed * (diff.maxSpeed - 30) / 45);
    let effMax = input.throttle ? rampMax : rampMax * 0.46;
    if (drifting) effMax = Math.min(rampMax, effMax + 10);   // drift boost
    if (input.brake) {                      // brake pedal — hard deceleration
      effMax = Math.min(effMax, 4);
      speed = Math.max(2, speed - 62 * dt);
    }
    speed = speed < effMax
      ? Math.min(effMax, speed + 26 * dt)
      : Math.max(effMax, speed - 22 * dt);
    if (oilT > 0) {                     // oil slick bleeds speed
      oilT -= dt;
      speed = Math.max(12, speed * (1 - 0.62 * dt));
    }

    /* --- steering --- */
    const slickGrip = oilT > 0 ? 0.35 : 1;   // slippery when oily
    const steerInput = ((input.left ? -1 : 0) + (input.right ? 1 : 0)) * slickGrip;
    const driftF = drifting ? 1.9 : 1;       // drifting turns sharper
    const steerSpeed = Math.min(drifting ? 25 : 21, (11.5 + speed * 0.055) * driftF);
    player.x += steerInput * steerSpeed * dt;
    if (drifting) {
      // rear wheels lose grip — extra lateral slide
      player.x += steerInput * 6.5 * dt;
      player.skid += (steerInput * 3.5 - player.skid) * Math.min(1, dt * 9);
    } else {
      player.skid += (0 - player.skid) * Math.min(1, dt * 9);
    }
    const lim = ROAD_W / 2 - 1.05;
    player.x = Math.max(-lim, Math.min(lim, player.x));
    player.steer += (steerInput * 0.22 - player.steer) * Math.min(1, dt * 8);
    player.vx += (steerInput * steerSpeed - player.vx) * Math.min(1, dt * 5);

    /* --- player visuals --- */
    const bob = Math.sin(sceneT * 26) * 0.02 * (speed / diff.maxSpeed);
    player.group.position.x = player.x;
    player.group.position.y = bob;
    player.group.position.z = PLAYER_Z;
    player.group.rotation.z = -player.steer - player.vx * 0.004 - player.skid * 0.09;
    player.group.rotation.x = -0.015 - (speed / diff.maxSpeed) * 0.05;
    if (neonLight) {
      neonLight.position.x = player.x * 0.6;
      neonLight.position.z = PLAYER_Z - 2;
      neonLight.intensity = (6 + 16 * nightMixG) + speed * 0.25 * (0.5 + 0.5 * nightMixG);
    }

    /* --- invulnerability blink --- */
    invuln = Math.max(0, invuln - dt);
    if (invuln > 0) {
      if (camMode !== 'cockpit') player.group.visible = Math.floor(sceneT * 12) % 2 === 0;
    } else {
      if (camMode !== 'cockpit') player.group.visible = true;
      document.getElementById('damage-vignette').style.opacity = 0;
    }

    /* --- road scroll --- */
    roadTex.offset.y = (roadTex.offset.y + speed * dt / 8) % 1;

    /* --- spawn --- */
    for (let i = 0; i < 3; i++) laneCooldown[i] -= speed * dt;
    nextSpawn -= speed * dt;
    if (nextSpawn <= 0) {
      spawnObstacle();
      nextSpawn = speed * dt + randRange(diff.spawnGap[0], diff.spawnGap[1]);
    }
    nextCoinSpawn -= speed * dt;
    if (nextCoinSpawn <= 0) {
      spawnCoinLine();
      if (Math.random() < 0.16) spawnAmmo();
      nextCoinSpawn = speed * dt + randRange(diff.coinGap[0], diff.coinGap[1]);
    }

    /* --- obstacles: move, cull, collide --- */
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      if (!o.alive || o.z > DESPAWN_Z) {
        obstacles.splice(i, 1);
        continue;
      }
      o.z += (speed - o.vc) * dt;
      o.mesh.position.x = o.x;
      o.mesh.position.z = o.z;

      if (!o.passed && o.z > PLAYER_Z) {
        o.passed = true;
        if (Math.abs(o.x - player.x) < 2.5 && o.z - PLAYER_Z < 5) {
          combo++; comboT = 3.5;
          const gain = Math.round(25 * comboMult());
          score += gain;
          FloatTexts.show('NEAR MISS +' + gain, '#8ef0ff', o.mesh.position.clone().setY(3.5), camera);
        }
      }
      if (collidesPlayer(o)) {
        if (o.type === 'oil' && !o.solid) {
          triggerOilSlick(o);
          obstacles.splice(i, 1);
        } else {
          crash(o);
          if (!o.alive) {
            obstacles.splice(i, 1);   // the crash destroyed it
          }
        }
      }
    }

    /* --- coins --- */
    for (const c of coinPool) {
      if (!c.active) continue;
      c.group.position.z += speed * dt;
      if (c.group.position.z > DESPAWN_Z) { c.active = false; c.group.visible = false; continue; }
      c.spin += dt * 4;
      c.group.rotation.y = Math.sin(c.spin) * 0.5;
      c.group.rotation.z = c.phase + sceneT * 1.5;
      c.group.position.y = 1.0 + Math.sin(sceneT * 3 + c.phase) * 0.18;
      if (Math.abs(c.group.position.z - PLAYER_Z) < 2.1 && Math.abs(c.group.position.x - player.x) < 1.5) {
        c.active = false; c.group.visible = false;
        coins++;
        score += Math.round(50 * comboMult());
        AudioFX.sfx.coin();
        FloatTexts.show('+50', '#8ef0ff', c.group.position.clone(), camera);
        Particles.burst(c.group.position.clone().setY(1.2), [0x8ef0ff, 0xcfe7ff], 6, 2, 0);
      }
    }

    /* --- ammo pickups --- */
    for (const p of ammoPool) {
      if (!p.active) continue;
      p.mesh.position.z += speed * dt;
      if (p.mesh.position.z > DESPAWN_Z) { p.active = false; p.mesh.visible = false; continue; }
      p.mesh.position.y = 1.3 + Math.sin(sceneT * 3 + p.phase) * 0.25;
      p.mesh.rotation.y += dt * 3;
      if (Math.abs(p.mesh.position.z - PLAYER_Z) < 2.2 && Math.abs(p.mesh.position.x - player.x) < 1.6) {
        p.active = false; p.mesh.visible = false;
        ammo = Math.min(MAX_AMMO, ammo + 4);
        AudioFX.sfx.powerup();
        FloatTexts.show('+AMMO', '#6ad6ff', p.mesh.position.clone(), camera);
      }
    }

    /* --- blaster --- */
    ammo = Math.min(MAX_AMMO, ammo + 0.35 * dt);
    tryFire(dt);
    Bolts.update(dt, speed);
    for (const b of Bolts.allActive()) {
      for (const o of obstacles) {
        if (!o.alive || !o.solid) continue;
        if (Math.abs(o.x - b.x) < o.halfW + 0.5 && Math.abs(o.z - b.z) < 2.8) {
          Bolts.hit(b);
          hitObstacle(o);
          break;
        }
      }
    }

    Particles.update(dt);
    Smoke.update(dt);

    /* --- scenery scroll --- */
    const scroll = speed * dt;
    for (const s of sideSlots) {
      if (s.type === 'railpost') {
        s.z += scroll;
        if (s.z > 20) s.z -= 460;
        s.mesh.position.z = s.z;
      } else {
        s.z += scroll;
        s.group.position.z = s.z;
        if (s.z > 24) wrapProp(s);
      }
    }
    for (const s of skySlots) {
      s.mesh.position.z += scroll * 0.55;
      if (s.mesh.position.z > 24) s.mesh.position.z -= 296;
    }
    for (const c of cloudSlots) {
      c.sprite.position.x += c.drift * dt;
      if (Math.abs(c.sprite.position.x) > 250) c.drift = -c.drift;
    }
    for (const s of streakSlots) {
      s.mesh.position.z += scroll * (1.6 + Math.random() * 0.3);
      if (s.mesh.position.z > 26) {
        s.mesh.position.z -= 440;
        s.mesh.position.x = LANES[(Math.random() * 3) | 0] + (Math.random() - 0.5) * 2.6;
      }
    }

    /* --- car extras (headlights, indicators, wipers) + rain --- */
    updateCarExtras(dt);
    updateRain(dt);

    /* --- camera --- */
    const k = 1 - Math.exp(-dt * 5.2);
    if (camMode === 'cockpit') {
      // inside the car: frame the dashboard + steering wheel, nose through the windshield
      const lookX = player.x + player.steer * 3.4;
      camera.position.x += (player.x - camera.position.x) * k;
      camera.position.y += (1.06 + shake - camera.position.y) * k;
      camera.position.z += (PLAYER_Z - camera.position.z) * k;
      camera.lookAt(lookX, 1.06, -70);
    } else {
      const lookX = player.x * 0.42;
      camera.position.x += (player.x * 0.66 - camera.position.x) * k;
      camera.position.y += (camBase.y + speed * 0.012 + shake - camera.position.y) * k;
      camera.position.z += (camBase.z + speed * 0.012 - camera.position.z) * k;
      camera.lookAt(lookX, 1.15, -3);
    }

    // cockpit interior reacts to the driver
    if (cockpitWheel) {
      cockpitWheel.rotation.z = -player.steer * 7 - player.skid * 0.12;
    }
    if (cockpitNeedlePivot) {
      cockpitNeedlePivot.rotation.z = -Math.PI * 0.75 + Math.min(1, speed * 3.6 / 240) * Math.PI * 1.5;
    }
    if (camMode === 'cockpit') drawMirrorBack(speed);

    const targetFov = (camMode === 'cockpit'
      ? camBase.fov + 12 + (speed / diff.maxSpeed) * 6
      : camBase.fov + (speed / diff.maxSpeed) * 12)
      + (drifting ? 3.5 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.6);
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.4;
    }

    updateHud();
  }

  function updateIdle(dt) {
    // gentle cinematic drift behind the menus
    const t = performance.now() * 0.00006;
    camera.position.x = Math.sin(t) * 2.4;
    camera.position.y = camBase.y + 0.7;
    camera.position.z = camBase.z + 4;
    camera.lookAt(Math.sin(t) * 1.2, 1.15, -3);
  }

  /* ---------------- main loop ---------------- */
  function loop() {
    rafId = requestAnimationFrame(loop);
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    if (state === 'playing' || state === 'dying' || state === 'idle') {
      timeClock += dt;
      updateDayNight();
    }

    if (state === 'playing' || state === 'dying') {
      update(dt);
      AudioFX.engineUpdate(Math.min(1, speed / diff.maxSpeed));
    } else if (state === 'idle') {
      updateIdle(dt);
    } else if (state === 'paused' || state === 'gameover') {
      Particles.update(dt);
      Smoke.update(dt);
    }
    if (cockpit) {
      cockpit.visible = camMode === 'cockpit' && (state === 'playing' || state === 'dying');
      if (camMode === 'cockpit') player.group.visible = false;  // we are inside the car — don't render its body
    }
    renderer.render(scene, camera);
  }

  function randRange(a, b) { return a + Math.random() * (b - a); }

  /* Adapt the camera to phone (portrait) vs desktop (landscape) screens */
  function fitViewport() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect < 0.75) {              // narrow portrait phone
      camBase = { fov: 84, y: 8.6, z: 17 };
    } else if (aspect < 1.05) {       // portrait tablet / squarish
      camBase = { fov: 78, y: 7.8, z: 15.5 };
    } else if (aspect < 1.6) {        // small landscape
      camBase = { fov: 72, y: 7.0, z: 14.2 };
    } else {                          // desktop / wide
      camBase = { fov: 70, y: 6.6, z: 13.5 };
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  /* ---------------- init ---------------- */
  function init(rootEl) {
    renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.25 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = IS_MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rootEl.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900);
    fitViewport();
    camera.position.set(0, camBase.y, camBase.z);
    camera.lookAt(0, 1.15, -3);

    updateDayNight();                  // paint sky + fog first (lights not ready yet)
    makeLights();
    makeRoad();
    makeSideSlots();
    makeSkyline();
    makeMountains();
    makeClouds();
    makeStreaks();
    updateDayNight();                  // re-paint with lights + scenery for the current time of day
    makePlayer();
    makeCockpit();

    Bolts.init(scene);
    Particles.init(scene);
    Smoke.init(scene);
    makeRain();

    for (let i = 0; i < 36; i++) coinPool.push(makeCoinMesh());
    for (let i = 0; i < 5; i++) ammoPool.push(makeAmmoMesh());

    cacheHud();
    updateHud();

    window.addEventListener('resize', () => {
      fitViewport();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    lastTime = performance.now();
    loop();
    if (onFirstFrameCb) onFirstFrameCb();
  }

  function bestScore() {
    try { return parseInt(localStorage.getItem('neonrush_best') || '0', 10); }
    catch (e) { return 0; }
  }

  function saveBest(score) {
    const old = parseInt(localStorage.getItem('neonrush_best') || '0', 10);
    if (score <= old) return false;
    try { localStorage.setItem('neonrush_best', String(score)); } catch (e) {}
    return true;
  }

  function setInput(obj) { input = obj; }
  function refillAmmo() { ammo = MAX_AMMO; }
  function setLights(on) { lightsOn = !!on; }
  function setWipers(on) { wipersOn = !!on; }
  function setRain(on) {
    rainOn = !!on;
    if (rainDrops) rainDrops.visible = rainOn;
  }
  function setTime(setting) {
    if (setting === 'day' || setting === 'night' || setting === 'cycle') {
      timeSetting = setting;
      skyPhase = -1;            // repaint the sky on the next frame
    }
  }

  return {
    init,
    startRacing,
    pause,
    resume,
    toMenu,
    saveBest,
    bestScore,
    setInput,
    setCar,
    setPaint,
    setTime,
    setLights,
    setWipers,
    setRain,
    toggleCam,
    refillAmmo,
    CAR_OPTIONS,
    get state() { return state; },
    set onGameOver(fn) { onGameOverCb = fn; },
    set onFirstFrame(fn) { onFirstFrameCb = fn; },
  };
})();