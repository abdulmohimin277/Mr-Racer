/* ============================================================
   NeonRush — core 3D game engine (world, traffic, coins, blaster)
   ============================================================ */
'use strict';

const Game = (() => {
  /* ---------------- config ---------------- */
  const DIFFS = {
    easy:   { trafMax: 7,  maxSpeed: 56, spawnGap: [95, 150], coinGap: [26, 60],  barrelChance: 0.30 },
    medium: { trafMax: 11, maxSpeed: 74, spawnGap: [70, 118], coinGap: [22, 50],  barrelChance: 0.34 },
    hard:   { trafMax: 15, maxSpeed: 88, spawnGap: [52, 96],  coinGap: [18, 42],  barrelChance: 0.38 },
  };

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
  let input = { left: false, right: false, throttle: false, fire: false };

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

  /* ---------------- sky + fog ---------------- */
  function makeSky() {
    // flat solid orange dusk — no gradient colors
    scene.background = canvasTex(2, 512, (ctx, w, h) => {
      ctx.fillStyle = '#ff8c1f';
      ctx.fillRect(0, 0, w, h);

      // retro sliced sun — flat colors only
      const sunX = w / 2, sunH = h * 0.30, sunY = h * 0.60, sunW = w * 0.62;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(sunX - sunW / 2, sunY - sunH, sunW, sunH * 2);
      ctx.fillStyle = '#e8790f';
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 7; i++) {
        const yy = sunY - sunH + (i + 0.4) * (sunH * 2 / 8);
        ctx.fillRect(sunX - sunW / 2, yy, sunW, sunH * 0.16);
      }
      ctx.globalAlpha = 1;
    });
    scene.fog = new THREE.Fog(0xef7a12, 80, 300);
  }

  /* ---------------- lights ---------------- */
  function makeLights() {
    const hemi = new THREE.HemisphereLight(0xffb066, 0x331a05, 0.75);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffcaa0, 1.25);
    sun.position.set(60, 90, -140);
    sun.castShadow = true;
    sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    const fill = new THREE.DirectionalLight(0xff9e45, 0.35);
    fill.position.set(-50, 40, 60);
    scene.add(fill);

    // neon under-glow that follows the player
    neonLight = new THREE.PointLight(0xff7a1a, 22, 14, 2);
    neonLight.position.set(0, 1.4, PLAYER_Z);
    scene.add(neonLight);
  }

  /* ---------------- road ---------------- */
  function makeRoad() {
    roadTex = canvasTex(256, 1024, (ctx, w, h) => {
      ctx.fillStyle = '#241d12';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 34; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.10 + Math.random() * 0.16})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 20 + Math.random() * 70);
      }
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = `rgba(150,105,55,${0.05 + Math.random() * 0.07})`;
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

    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x241608, roughness: 0.95 });
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(6, 450), shoulderMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(sx * (ROAD_W / 2 + 3), 0.005, -185);
      sh.receiveShadow = true;
      scene.add(sh);
    }

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 620),
      new THREE.MeshStandardMaterial({ color: 0x1a0f04, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -180);
    ground.receiveShadow = true;
    scene.add(ground);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x8790a8, metalness: 0.85, roughness: 0.35 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5d6478, metalness: 0.6, roughness: 0.5 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0xff8c1f, transparent: true, opacity: 0.9 });
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
      ctx.fillStyle = '#160d04';
      ctx.fillRect(0, 0, w, h);
      for (let x = 4; x < w - 4; x += 11) {
        for (let y = 6; y < h - 6; y += 13) {
          ctx.fillStyle = Math.random() < 0.3
            ? (Math.random() < 0.5 ? 'rgba(255,214,110,0.85)' : 'rgba(255,170,60,0.9)')
            : 'rgba(44,28,12,0.9)';
          ctx.fillRect(x, y, 5, 7);
        }
      }
    });
  }

  function makeBillboardTex(idx) {
    const msgs = ['NEON RUSH', 'TURBO COLA', 'HYPER MART', 'BLASTER OIL', 'FUTURE CITY', 'GAS ★ MAXX'];
    return canvasTex(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#2a1a06';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff8c1f';
      ctx.fillRect(0, h - 10, w, 10);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(0, 0, w, 6);
      ctx.fillStyle = '#fff';
      ctx.font = '900 34px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff8c1f';
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
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
      lamp.position.set(1.65, 5.35, 0);
      g.add(lamp);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex(), color: 0xffe9a8, transparent: true, opacity: 0.55,
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
    for (let i = 0; i < 42; i++) {
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
    for (let i = 0; i < 22; i++) {
      const h = 14 + Math.random() * 50;
      const w = 9 + Math.random() * 13;
      const mat = new THREE.MeshStandardMaterial({
        map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.85, roughness: 0.8,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      b.position.set((Math.random() < 0.5 ? -1 : 1) * (46 + Math.random() * 60), h / 2, 20 - Math.random() * 270);
      scene.add(b);
      skySlots.push(b);
    }
  }

  function makeMountains() {
    const mMat = new THREE.MeshStandardMaterial({ color: 0x1f1406, roughness: 1, flatShading: true });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const h = 30 + Math.random() * 55;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(26 + Math.random() * 22, h, 6), mMat);
        cone.position.set(side * (85 + Math.random() * 70), h / 2 - 1.5, -(30 + i * 34) - Math.random() * 14);
        scene.add(cone);
      }
    }
  }

  function makeClouds() {
    const tex = cloudTex();
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.42, depthWrite: false, color: 0xffb9d8,
      }));
      sp.position.set((Math.random() - 0.5) * 460, 60 + Math.random() * 55, -(Math.random() * 280));
      sp.scale.set(40 + Math.random() * 70, 14 + Math.random() * 20, 1);
      scene.add(sp);
      cloudSlots.push({ sprite: sp, drift: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2) });
    }
  }

  function makeStreaks() {
    const colors = [0xffb347, 0xff8c1f, 0xffd23d];
    for (let i = 0; i < 16; i++) {
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
      new THREE.MeshStandardMaterial({ color: 0xf7b731, emissive: 0xffa200, emissiveIntensity: 1.1, metalness: 0.9, roughness: 0.25 })
    );
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.2, 18),
      new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffcf3d, emissiveIntensity: 0.9, metalness: 0.85, roughness: 0.3 })
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
      new THREE.MeshStandardMaterial({ color: 0xff9a2e, emissive: 0xff7a1a, emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.3 })
    );
    m.visible = false;
    scene.add(m);
    return { mesh: m, active: false, phase: Math.random() * 3 };
  }

  function makeConeTex() {
    return canvasTex(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f97316';
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

  const obstacleTypes = {
    car:    { halfW: 1.0,  halfL: 2.4, value: 150, vc: true },
    truck:  { halfW: 1.15, halfL: 3.2, value: 250, vc: true },
    barrel: { halfW: 0.8,  halfL: 0.8, value: 100, vc: false },
    cone:   { halfW: 0.55, halfL: 0.55, value: 50, vc: false },
  };

  function spawnObstacle() {
    // pick a lane whose spawn cooldown has elapsed
    const ready = [0, 1, 2].filter((L) => laneCooldown[L] <= 0);
    if (ready.length === 0) return;
    const lane = ready[(Math.random() * ready.length) | 0];

    const x = LANES[lane] + (Math.random() - 0.5) * 0.6;
    let type, mesh;
    if (Math.random() < diff.barrelChance) {
      type = Math.random() < 0.6 ? 'barrel' : 'cone';
      mesh = type === 'barrel' ? makeBarrel(x, SPAWN_Z) : makeCone(x, SPAWN_Z);
    } else {
      if (Math.random() < 0.18) {
        type = 'truck';
        mesh = CarBuilder.buildTruck(new THREE.Color().setHSL(Math.random(), 0.5, 0.35).getHex());
      } else {
        type = 'car';
        mesh = CarBuilder.buildTraffic();
      }
      mesh.rotation.y = Math.PI;      // nose points forward (-z)
      mesh.position.set(x, 0, SPAWN_Z);
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(mesh);
    }
    const info = obstacleTypes[type];
    const ent = {
      type, mesh, x, z: SPAWN_Z,
      halfW: info.halfW, halfL: info.halfL, value: info.value,
      vc: info.vc ? 9 + Math.random() * 10 : 0,
      alive: true, passed: false,
    };
    obstacles.push(ent);
    laneCooldown[lane] = 220 + Math.random() * 190;
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
    const g = CarBuilder.buildSport(0xffc219, { underglow: 0xff6a00 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x2a1a06, metalness: 0.85, roughness: 0.3 });
    for (const bx of [-0.55, 0.55]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 10), barMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(bx, 0.62, 2.62);
      g.add(b);
    }
    g.position.set(0, 0, PLAYER_Z);
    g.rotation.y = Math.PI;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    player = { group: g, x: 0, vx: 0, steer: 0 };
  }

  /* ---------------- HUD ---------------- */
  function cacheHud() {
    const $ = (id) => document.getElementById(id);
    hud = {
      score: $('hud-score'), coins: $('hud-coins'), best: $('hud-best'),
      speed: $('hud-speed'), speedFill: $('speedo-fill'), cooldownFill: $('cooldown-fill'),
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
    score = 0; coins = 0; kills = 0;
    lives = GAME_LIVES; invuln = 1.2; shake = 0; dyingTimer = 0;
    ammo = MAX_AMMO; fireCooldown = 0;
    nextSpawn = 10; nextCoinSpawn = 4;
    laneCooldown = [0, 0, 0];

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
      ? [0xff7d3d, 0xffd23d, 0xffffff]
      : [0xff3d4e, 0xff8a3d, 0xffffff, ent.type === 'truck' ? 0xbfd0ff : 0xffb347];
    Particles.burst(pos.setY(0.8), colors, 24, 4, 1);
    Smoke.emit(pos.clone().setY(0.8), new THREE.Vector3(0, 3, 2), 6);
    AudioFX.sfx.explosion();

    if (!isCrash) {
      kills++;
      ammo = Math.min(MAX_AMMO, ammo + 2);
      score += ent.value;
      FloatTexts.show('+' + ent.value, '#ffb347', pos.clone().setY(3), camera);
    }
    scene.remove(ent.mesh);
  }

  function crash(ent) {
    if (invuln > 0 || state !== 'playing') return;
    lives--;
    shake = 0.85;
    invuln = 2.4;
    speed = Math.max(16, speed * 0.55);
    const p = ent.mesh.position.clone().setY(0.8);
    Particles.burst(p, [0xff5e3d, 0xffd23d, 0xffffff], 30, 4.5, 1);
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
    Particles.burst(new THREE.Vector3(px, 0.75, PLAYER_Z - 2.8), [0xffe0b0, 0xff9a2e, 0xffffff], 4, 2.5, 0);
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

    elapsed += dt;
    distance += speed * dt;
    score += speed * dt * 3 + dt * 8;

    /* --- speed --- */
    const rampMax = Math.min(diff.maxSpeed, 30 + elapsed * (diff.maxSpeed - 30) / 45);
    const effMax = input.throttle ? rampMax : rampMax * 0.46;
    speed = speed < effMax
      ? Math.min(effMax, speed + 26 * dt)
      : Math.max(effMax, speed - 22 * dt);

    /* --- steering --- */
    const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const steerSpeed = Math.min(21, 11.5 + speed * 0.055);
    player.x += steerInput * steerSpeed * dt;
    const lim = ROAD_W / 2 - 1.05;
    player.x = Math.max(-lim, Math.min(lim, player.x));
    player.steer += (steerInput * 0.22 - player.steer) * Math.min(1, dt * 8);
    player.vx += (steerInput * steerSpeed - player.vx) * Math.min(1, dt * 5);

    /* --- player visuals --- */
    const bob = Math.sin(sceneT * 26) * 0.02 * (speed / diff.maxSpeed);
    player.group.position.x = player.x;
    player.group.position.y = bob;
    player.group.position.z = PLAYER_Z;
    player.group.rotation.z = -player.steer - player.vx * 0.004;
    player.group.rotation.x = -0.015 - (speed / diff.maxSpeed) * 0.05;
    if (neonLight) {
      neonLight.position.x = player.x * 0.6;
      neonLight.position.z = PLAYER_Z - 2;
      neonLight.intensity = 14 + speed * 0.25;
    }

    /* --- invulnerability blink --- */
    invuln = Math.max(0, invuln - dt);
    if (invuln > 0) {
      player.group.visible = Math.floor(sceneT * 12) % 2 === 0;
    } else {
      player.group.visible = true;
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
          score += 25;
          FloatTexts.show('NEAR MISS +25', '#ffd23d', o.mesh.position.clone().setY(3.5), camera);
        }
      }
      if (collidesPlayer(o)) {
        crash(o);
        if (!o.alive) {
          obstacles.splice(i, 1);   // the crash destroyed it
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
        score += 50;
        AudioFX.sfx.coin();
        FloatTexts.show('+50', '#ffd23d', c.group.position.clone(), camera);
        Particles.burst(c.group.position.clone().setY(1.2), [0xffd23d, 0xfff3b0], 6, 2, 0);
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
        FloatTexts.show('+AMMO', '#ffb347', p.mesh.position.clone(), camera);
      }
    }

    /* --- blaster --- */
    ammo = Math.min(MAX_AMMO, ammo + 0.35 * dt);
    tryFire(dt);
    Bolts.update(dt, speed);
    for (const b of Bolts.allActive()) {
      for (const o of obstacles) {
        if (!o.alive) continue;
        if (Math.abs(o.x - b.x) < o.halfW + 0.5 && Math.abs(o.z - b.z) < 2.8) {
          Bolts.hit(b);
          destroyObstacle(o, false);
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
    for (const b of skySlots) {
      b.position.z += scroll * 0.55;
      if (b.position.z > 24) b.position.z -= 296;
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

    /* --- camera --- */
    const k = 1 - Math.exp(-dt * 5.2);
    const lookX = player.x * 0.42;
    camera.position.x += (player.x * 0.66 - camera.position.x) * k;
    camera.position.y += (camBase.y + speed * 0.012 + shake - camera.position.y) * k;
    camera.position.z += (camBase.z + speed * 0.012 - camera.position.z) * k;
    camera.lookAt(lookX, 1.15, -3);

    const targetFov = camBase.fov + (speed / diff.maxSpeed) * 12;
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

    if (state === 'playing' || state === 'dying') {
      update(dt);
      AudioFX.engineUpdate(Math.min(1, speed / diff.maxSpeed));
    } else if (state === 'idle') {
      updateIdle(dt);
    } else if (state === 'paused' || state === 'gameover') {
      Particles.update(dt);
      Smoke.update(dt);
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

    makeSky();
    makeLights();
    makeRoad();
    makeSideSlots();
    makeSkyline();
    makeMountains();
    makeClouds();
    makeStreaks();
    makePlayer();

    Bolts.init(scene);
    Particles.init(scene);
    Smoke.init(scene);

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

  return {
    init,
    startRacing,
    pause,
    resume,
    toMenu,
    saveBest,
    bestScore,
    setInput,
    refillAmmo,
    get state() { return state; },
    set onGameOver(fn) { onGameOverCb = fn; },
    set onFirstFrame(fn) { onFirstFrameCb = fn; },
  };
})();