# 🏎️ NEON RUSH — 3D Highway Racer

A fully 3D highway car-racing game built with **vanilla JavaScript + Three.js** (procedural 3D models — no external 3D assets needed).

## ✅ Features

- **3D cars** — procedurally modelled sport racer (player), sedans and cargo trucks (traffic) with real-time shadows
- **Designed highway** — 3-lane road with scrolling lane markings, rumble strips, guardrails with glowing orange strips,
  streetlights, trees, billboards, pylons, a lit skyline, mountains, clouds and a retro sliced sun over an orange dusk
- **Obstacles** — traffic cars, trucks, striped barrels and cones. Avoid them… or blast them
- **Coins** — collect golden coin lines for bonus score (with sparkles & sounds)
- **Guns** — twin nose blasters. Hold `SPACE` to fire; kills refund ammo; orange **+AMMO** pickups refill it
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
| `P` / `ESC`       | Pause / resume                |
| `R`               | Quick restart                 |
| `M`               | Mute sound                    |
| `N`               | Refill blaster charge         |

## 🚀 How to run

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