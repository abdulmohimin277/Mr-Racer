# 🏎️ NEON RUSH — 3D Highway Racer

A fully 3D highway car-racing game built with **vanilla JavaScript + Three.js** (procedural 3D models — no external 3D assets needed).

## ✅ Features

- **Cockpit view** — press `C` (or tap 📷 VIEW on phones) to sit inside the car: dashboard, orange
  speedometer with a live needle, a steering wheel that turns with your inputs, A-pillars and roof bar
- **3D cars** — procedurally modelled sport racer (player), sedans and cargo trucks (traffic) with real-time shadows
- **Designed highway** — 3-lane road with scrolling lane markings, rumble strips, guardrails with glowing orange strips,
  streetlights, trees, billboards, pylons, a lit skyline, mountains, clouds and a big retro sliced sun with rays over a warm orange day
- **Day theme + sun** — the game defaults to a bright **DAY** sky with a glowing sliced sun (and sun rays); a full
  day/night cycle (DAY → SUNSET → NIGHT → SUNRISE) or a locked **NIGHT** can still be picked from the menu
- **Coins** — collect golden coin lines for bonus score (with sparkles & sounds)
- **Guns** — twin nose blasters. Hold `SPACE` to fire; kills refund ammo; orange **+AMMO** pickups refill it
- **Drifting** — hold `X` / `SHIFT` to slide, tighten corners and earn drift points (tyre smoke + skid sound)
- **4 selectable cars** — pick your ride (EMBER GT, BLAZE X, NIGHT FANG, GOLD RUSH) in the main menu; choice is saved
- **Day / night cycle** — optional: the highway world can roll through DAY → SUNSET → NIGHT → SUNRISE on a loop (windows light up at night, neon strips burn brighter); DAY is the default theme
- **Busy traffic** — dense traffic with **convoys** (streams of cars in one lane) and side-by-side **wall formations** on harder difficulties
- **Main menu** — START / HOW TO PLAY / difficulty selector (Easy, Medium, Hard) / sound toggle / best score
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
| `SPACE`           | Fire blasters (hold)          |
| `X` / `SHIFT`     | Drift / slide (hold)          |
| `P` / `ESC`       | Pause / resume                |
| `R`               | Quick restart                 |
| `M`               | Mute sound                    |
| `N`               | Refill blaster charge         |
| `C`               | Cockpit view (in-car dashboard + steering wheel) |

## 📱 Mobile / touch

The game is fully playable on phones & tablets — on-screen controls appear automatically:

- **◀ ▶** — steer between lanes (hold)
- **▲** — cruise control: tap once to accelerate, tap again to release (glows when active)
- **🌀** — drift (hold)
- **🎯** — fire the blasters (hold)
- **⏸ PAUSE** — pause button in the HUD top row
- **📷 VIEW** — toggle the in-car cockpit view (dashboard + steering wheel) on the HUD top row

On touch devices the game automatically lowers the render quality (shadows, pixel ratio,
antialiasing) and widens the camera FOV for portrait screens so you can still see the road ahead.
Safe-area insets (notch / home bar) are respected. To test on your phone, run the server and open
`http://<your-PC-LAN-IP>:8899` from the phone (same Wi-Fi).

## 🚀 How to run

**Play it live on your phone** → https://abdulmohimin277.github.io/Mr-Racer/

Option 1 — just open **`index.html`** in a modern browser (needs internet for the Three.js CDN).

Option 2 — local server (recommended):

```bash
python -m http.server 8899
# then open http://127.0.0.1:8899
```

## 📁 Project structure

```
index.html          – page, menus, HUD markup
css/style.css       – dark orange theme (no gradients)
js/main.js          – screens, input, buttons, touch controls
js/game.js          – 3D world, highway, traffic, coins, blaster, game loop
js/car.js           – procedural 3D car models
js/effects.js       – bullets, explosions, particles, floating text
js/audio.js         – WebAudio engine + SFX + music
```

## 🧪 Tested

Validated headlessly with a V8 runtime (stubbed DOM/Three): boots cleanly, runs 100+ simulated
seconds per difficulty, pause/resume/restart, crash → game-over → restart all verified.