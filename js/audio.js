/* ============================================================
   AudioFX — WebAudio synthesised sound: engine, SFX, music loop
   ============================================================ */
'use strict';

const AudioFX = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let enabled = true;

  // Engine
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;

  // Music scheduler
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let musicOn = false;

  // Noise buffer (shared for whoosh / explosions)
  let noiseBuffer = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.9;
      sfxGain.connect(master);

      // Pre-build 1s white noise buffer
      const len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ---------- master controls ---------- */
  function toggle() {
    enabled = !enabled;
    if (!enabled && engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    if (enabled) ensure();
    return enabled;
  }

  /* ---------- engine ---------- */
  function engineStart() {
    if (!ensure() || !enabled || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc2 = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 240;

    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 27.5;

    engineGain.gain.value = 0;
    engineFilter.connect(engineGain);
    engineGain.connect(sfxGain);
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineOsc.start();
    engineOsc2.start();
  }

  function engineUpdate(rpm /* 0..1 */) {
    if (!engineOsc || !ctx) return;
    const t = ctx.currentTime;
    const f = 40 + rpm * 260;
    engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    engineFilter.frequency.setTargetAtTime(180 + rpm * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(enabled ? 0.035 + rpm * 0.06 : 0, t, 0.12);
  }

  function engineStop() {
    if (engineOsc) {
      try {
        engineOsc.stop(); engineOsc2.stop();
        engineOsc.disconnect(); engineOsc2.disconnect();
        engineFilter.disconnect(); engineGain.disconnect();
      } catch (e) {}
      engineOsc = engineOsc2 = engineFilter = engineGain = null;
    }
  }

  /* ---------- one-shot blips ---------- */
  function blip(opts) {
    if (!ensure() || !enabled) return;
    const { freq = 880, endFreq = freq, dur = 0.12, type = 'sine', vol = 0.25, when = 0, slide = true } = opts;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  /* ---------- public SFX ---------- */
  const sfx = {
    shoot() {
      noise(0.12, 0.35, 4000, 'highpass');
      blip({ freq: 200, endFreq: 60, dur: 0.14, type: 'sawtooth', vol: 0.22 });
    },
    coin() {
      blip({ freq: 990, dur: 0.09, type: 'square', vol: 0.16 });
      blip({ freq: 1480, dur: 0.18, type: 'square', vol: 0.16, when: 0.07 });
    },
    explosion() {
      noise(0.5, 0.5, 500);
      blip({ freq: 120, endFreq: 30, dur: 0.5, type: 'triangle', vol: 0.45 });
    },
    crash() {
      noise(0.4, 0.5, 900);
      blip({ freq: 90, endFreq: 25, dur: 0.45, type: 'sawtooth', vol: 0.4 });
    },
    scrape() {
      noise(0.25, 0.18, 2200, 'highpass');
    },
    hit() {
      noise(0.2, 0.3, 1200);
      blip({ freq: 220, endFreq: 70, dur: 0.2, type: 'square', vol: 0.2 });
    },
    skid() {
      noise(0.22, 0.16, 2600, 'highpass');
    },
    horn() {
      // classic dual-tone horn blast (two short honks)
      blip({ freq: 233, endFreq: 200, dur: 0.42, type: 'square', vol: 0.30 });
      blip({ freq: 349, endFreq: 300, dur: 0.42, type: 'square', vol: 0.22 });
      blip({ freq: 233, endFreq: 200, dur: 0.42, type: 'square', vol: 0.30, when: 0.55 });
      blip({ freq: 349, endFreq: 300, dur: 0.42, type: 'square', vol: 0.22, when: 0.55 });
      noise(0.5, 0.12, 2200, 'highpass');
    },
    oil() {
      noise(0.3, 0.35, 350);
      blip({ freq: 140, endFreq: 38, dur: 0.3, type: 'triangle', vol: 0.3 });
    },
    ui() {
      blip({ freq: 700, endFreq: 1000, dur: 0.08, type: 'sine', vol: 0.15 });
    },
    gameover() {
      blip({ freq: 520, endFreq: 520, dur: 0.25, type: 'square', vol: 0.2 });
      blip({ freq: 390, endFreq: 390, dur: 0.25, type: 'square', vol: 0.2, when: 0.22 });
      blip({ freq: 260, endFreq: 260, dur: 0.6, type: 'square', vol: 0.2, when: 0.44 });
    },
    start() {
      blip({ freq: 392, dur: 0.1, type: 'square', vol: 0.18 });
      blip({ freq: 523, dur: 0.1, type: 'square', vol: 0.18, when: 0.12 });
      blip({ freq: 784, dur: 0.28, type: 'square', vol: 0.2, when: 0.24 });
    },
    powerup() {
      blip({ freq: 660, endFreq: 1320, dur: 0.25, type: 'sine', vol: 0.22 });
    },
  };

  /* ---------- music: driving synth arp loop ---------- */
  const CHORDS = [
    [55, 82.4, 130.8, 220],   // Am
    [49, 73.4, 110, 196],     // G
    [43.65, 65.4, 98, 174.6], // F
    [55, 82.4, 130.8, 246.9], // Am (up)
  ];

  function musicSchedule() {
    if (!ctx || !musicOn) return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const stepDur = 60 / 138 / 4; // 138 bpm, 16th notes
      const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
      const inChord = step % 16;
      const beat = inChord % 4;

      // Bass on each beat
      if (beat === 0) {
        const b = ctx.createOscillator();
        const g = ctx.createGain();
        b.type = 'triangle';
        b.frequency.value = chord[0];
        g.gain.setValueAtTime(0.0001, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.16, nextNoteTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + stepDur * 3.6);
        b.connect(g); g.connect(musicGain);
        b.start(nextNoteTime); b.stop(nextNoteTime + stepDur * 4);
      }
      // Arp notes
      if (inChord % 2 === 0 || inChord === 7) {
        const noteIdx = (inChord % 4);
        const f = chord[1 + (noteIdx % 3)];
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 2200;
        g.gain.setValueAtTime(0.0001, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.06, nextNoteTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + stepDur * 1.8);
        o.connect(flt); flt.connect(g); g.connect(musicGain);
        o.start(nextNoteTime); o.stop(nextNoteTime + stepDur * 2);
      }
      // Hat
      if (inChord % 2 === 1) {
        const h = ctx.createBufferSource();
        h.buffer = noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, nextNoteTime);
        g.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + 0.05);
        h.connect(hp); hp.connect(g); g.connect(musicGain);
        h.start(nextNoteTime); h.stop(nextNoteTime + 0.06);
      }
      nextNoteTime += stepDur;
      step++;
    }
  }

  function musicStart() {
    if (!ensure() || musicOn) return;
    musicOn = true;
    nextNoteTime = ctx.currentTime + 0.06;
    step = 0;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(enabled ? 0.5 : 0, ctx.currentTime, 0.8);
    musicTimer = setInterval(musicSchedule, 90);
  }

  function musicStop() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (ctx && musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  function setMuted(muteState) {
    if (muteState !== undefined) enabled = !muteState;
    else enabled = !enabled;
    if (ctx && master) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.05);
    return enabled;
  }

  return {
    ensure,
    sfx,
    engineStart,
    engineUpdate,
    engineStop,
    musicStart,
    musicStop,
    toggle,
    setMuted,
    get enabled() { return enabled; },
  };
})();