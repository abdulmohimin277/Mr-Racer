# 🏎️ NEON RUSH — 3D Highway Racer

A fully 3D highway car-racing game built with **vanilla JavaScript + Three.js** (procedural 3D models — no external 3D assets needed).

## ✅ Features

- **Cockpit view** — press `C` (or tap the **VIEW** button on phones) to sit inside the car: dashboard, blue
  speedometer with a live needle, a steering wheel that turns with your inputs, A-pillars, roof bar,
  a **working rear-view mirror** showing the traffic behind you, **turn-signal arrows** on the dash
  and **working windscreen wipers** that sweep when switched on
- **Horn** — press `H` (or tap **HORN** on phones) to blast a classic dual-tone horn
- **Headlights** — warm-white beams + visible light cones in front of the car (press `L` / **LIGHTS** button);
  they glow brightest at night and cut through the rain
- **Turn signals** — the 4 corner blinkers (front & rear) and the dash arrows blink amber while you steer
- **Rain weather** — pick **RAIN** in OPTIONS (or the LIVE in-game weather): falling rain streaks, tighter fog,
  darker sky and washed-out sun; wipers help you see from inside the cockpit
- **Start countdown** — every race kicks off with a 3·2·1·GO grid-style countdown while the engine revs
- **Combo multiplier** — near-misses and blaster kills build a COMBO meter; each chain multiplies your
  score (up to ×4). Keep it alive by staying aggressive!
- **3D cars** — procedurally modelled sport racer (player), sedans and cargo trucks (traffic) with real-time shadows
- **Designed highway** — 3-lane road with scrolling lane markings, rumble strips, guardrails with glowing blue strips,
  streetlights, trees, billboards, pylons, a lit skyline, mountains, clouds and a big retro sliced sun with rays over a bright blue day
- **Blue theme** — the whole world switched to a flat **blue** look: blue day sky, cyan neon strips &
  underglow, navy road and a blue HUD (no more orange)
- **Day theme + sun** — the game defaults to a bright **DAY** sky with a glowing sliced sun (and sun rays); a full
  day/night cycle (DAY → SUNSET → NIGHT → SUNRISE) or a locked **NIGHT** can still be picked from the menu
- **Coins** — collect golden coin lines for bonus score (with sparkles & sounds)
- **Guns** — twin nose blasters. Hold `SPACE` to fire; kills refund ammo; glowing **+AMMO** pickups refill it
- **Drifting** — hold `X` / `SHIFT` **while steering** to slide: sharper corners, drift points, tyre smoke +
  skid sound. The longer you drift, the bigger the **DRIFT BOOST** on release (speed burst + combo + score popup)
- **6 selectable cars + paint shop** — pick your ride (EMBER GT, BLAZE X, NIGHT FANG, GOLD RUSH, COMET RS,
  ONYX GT) and repaint it in the menu (red, orange, gold, sky blue, neon green, pearl white, midnight black); all saved
- **Single flat highway** — one straight highway (no tunnels, no flyovers). The camera view stays
  **fixed ahead** — it never turns or swings, in chase view or in the cockpit
- **Brake pedal** — press `↓` / `S` (or hold **BRAKE** on phones) to brake hard and slow down for the turns
- **Day / night cycle** — optional: the highway world can roll through DAY → SUNSET → NIGHT → SUNRISE on a loop (windows light up at night, neon strips burn brighter); DAY is the default theme
- **Busy traffic** — dense traffic with **convoys** (streams of cars in one lane) and side-by-side **wall formations** on harder difficulties
- **Main menu** — a clean hub with **5 options**: **PLAY**, **OPTIONS** (controls, difficulty, sound/music,
  time of day), **HOW TO PLAY**, **GARAGE** (6 cars + 8 paints), and an **ABOUT** page that credits the makers
  and lists everything the game can do
- **HUD** — live score, coins, best, speedometer, gun-charge bar and 3 lives
- **Game over & pause screens**, near-miss bonuses, crash damage vignette, floating score popups
- **WebAudio sound** — synth engine hum, laser shots, coins, explosions, crash, and a driving music loop
- **High score** saved in `localStorage`
- **Touch controls** — on-screen buttons appear automatically on phones/tablets

## 🎮 Controls

| Key               | Action                        |
| ----------------- | ----------------------------- |
| `←` / `→` (or `A` / `D`) | Steer              |
| `↑` / `W`         | Accelerate (hold)             |
| `↓` / `S`         | Brake (hold)                  |
| `SPACE`           | Fire blasters (hold)          |
| `X` / `SHIFT`     | Drift / slide (hold)          |
| `P` / `ESC`       | Pause / resume                |
| `R`               | Quick restart                 |
| `M`               | Mute sound                    |
| `N`               | Refill blaster charge         |
| `C`               | Cockpit view (in-car dashboard + steering wheel) |
| `H`               | Horn                          |
| `L`               | Headlights on / off           |
| `V`               | Wipers on / off               |

## 📱 Mobile / touch

The game is fully playable on phones & tablets — on-screen controls appear automatically:

- **◀ ▶** — steer between lanes (hold)
- **GAS** — cruise control: tap once to accelerate, tap again to release (glows when active)
- **BRAKE** — hold to slow down
- **DRIFT** — hold while steering; release for a speed-boost pop
- **FIRE** — fire the blasters (hold)
- **HORN** — tap to honk
- **LIGHTS / WIPERS** — tap to toggle headlights and wipers (glow when on)
- **PAUSE** — pause button in the HUD top row
- **VIEW** — toggle the in-car cockpit view (dashboard + steering wheel) on the HUD top row

Buttons are text-labelled (no emoji icons), scale with the screen size, and are pinned to the bottom
corners in two thumb clusters (HORN/DRIFT/arrows on the left, LIGHTS/WIPERS/FIRE/pedals on the right)
respecting notch/home-bar safe areas — buttons never overlap, and small phones and tablets both get
thumb-friendly controls.

On touch devices the game automatically lowers the render quality (shadows, pixel ratio,
antialiasing, scenery density, traffic shadows) and widens the camera FOV for portrait screens so you
can still see the road ahead. Safe-area insets (notch / home bar) are respected. To test on your phone,
run the server and open `http://<your-PC-LAN-IP>:8899` from the phone (same Wi-Fi) — or just use the live
GitHub Pages link above.

## 🚀 How to run

**Play it live on your phone** → https://abdulmohimin277.github.io/Mr-Racer/

Option 1 — just open **`index.html`** in a modern browser (needs internet for the Three.js CDN).

Option 2 — local server (recommended):

```bash
python -m http.server 8899
# then open http://127.0.0.1:8899
```

## 👨‍🎓 About

**NEON RUSH** is a school project game designed and developed by students:

- **Abdul-Mohimin**
- **Sahal Ashfaq**

It was built with vanilla JavaScript + Three.js (procedural 3D models, no external assets).

## 📁 Project structure

```
index.html          – page, menus, HUD markup
css/style.css       – dark blue theme (no gradients)
js/main.js          – screens, input, buttons, touch controls
js/game.js          – 3D world, highway, traffic, coins, blaster, game loop
js/car.js           – procedural 3D car models
js/effects.js       – bullets, explosions, particles, floating text
js/audio.js         – WebAudio engine + SFX + music
```

## 🧪 Tested

Validated headlessly with a V8 runtime (stubbed DOM/Three): boots cleanly, runs 100+ simulated
seconds per difficulty, pause/resume/restart, crash → game-over → restart all verified.