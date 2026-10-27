/* ==========================================================================
   BLOXNITE — procedural audio
   Every sound is synthesised with the WebAudio API at runtime: no external
   files, no licensing questions. Original sound design.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});

  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var vol = { master: 0.8, sfx: 0.7, music: 0.35 };
  var musicTimer = null, musicStep = 0, musicOn = false;
  var listenerReady = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = vol.master;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = vols.sfx;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.0001;
    musicBus.connect(master);
    // shared noise buffer
    var len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /* keep a local alias so the bus can be tweaked before it exists */
  var vols = vol;

  function now() { return ctx ? ctx.currentTime : 0; }

  function noise(dur, filterType, freq, q, gainVal, when, dest) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.value = freq || 1200;
    f.Q.value = q || 1;
    var g = ctx.createGain();
    var t = when === undefined ? now() : when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainVal, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gainVal, when, dest, glideTo) {
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    var g = ctx.createGain();
    var t = when === undefined ? now() : when;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainVal, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  var SFX = {
    uiHover: function (t) { tone(680, 0.05, 'sine', 0.035, t); },
    uiClick: function (t) { tone(520, 0.08, 'triangle', 0.09, t); tone(880, 0.07, 'sine', 0.05, t + 0.03); },
    uiBack: function (t) { tone(380, 0.09, 'triangle', 0.07, t); tone(260, 0.1, 'sine', 0.05, t + 0.03); },
    uiError: function (t) { tone(180, 0.16, 'square', 0.05, t); },
    equip: function (t) { tone(420, 0.1, 'triangle', 0.08, t); tone(620, 0.12, 'sine', 0.06, t + 0.06); tone(820, 0.14, 'sine', 0.04, t + 0.12); },

    rifle: function (t) {
      noise(0.11, 'bandpass', 1500, 0.9, 0.34, t);
      tone(180, 0.1, 'square', 0.16, t, null, 60);
      noise(0.22, 'highpass', 3200, 0.7, 0.1, t + 0.01);
    },
    smg: function (t) {
      noise(0.07, 'bandpass', 2100, 1.2, 0.22, t);
      tone(240, 0.06, 'square', 0.11, t, null, 90);
    },
    shotgun: function (t) {
      noise(0.26, 'lowpass', 900, 1.1, 0.42, t);
      tone(90, 0.24, 'square', 0.2, t, null, 40);
      noise(0.14, 'highpass', 2800, 0.6, 0.16, t);
    },
    pistol: function (t) {
      noise(0.09, 'bandpass', 1800, 1.1, 0.24, t);
      tone(300, 0.07, 'square', 0.1, t, null, 110);
    },
    sniper: function (t) {
      noise(0.34, 'bandpass', 1200, 0.8, 0.42, t);
      tone(120, 0.3, 'square', 0.2, t, null, 45);
      noise(0.5, 'lowpass', 500, 0.9, 0.14, t + 0.03);
    },
    cannon: function (t) {
      tone(70, 0.4, 'sawtooth', 0.2, t, null, 34);
      noise(0.4, 'lowpass', 700, 1.0, 0.4, t);
      tone(320, 0.3, 'sine', 0.12, t + 0.05, null, 90);
    },
    explosion: function (t) {
      noise(0.55, 'lowpass', 520, 0.9, 0.5, t);
      tone(58, 0.5, 'sine', 0.26, t, null, 26);
    },

    magReload: function (t) {
      noise(0.07, 'bandpass', 1400, 2, 0.14, t);
      noise(0.09, 'bandpass', 900, 2, 0.12, t + 0.24);
      noise(0.06, 'bandpass', 2000, 2, 0.12, t + 0.42);
    },
    pumpReload: function (t) {
      noise(0.1, 'bandpass', 700, 1.6, 0.16, t);
      noise(0.1, 'bandpass', 620, 1.6, 0.16, t + 0.3);
      noise(0.08, 'bandpass', 1200, 1.8, 0.13, t + 0.5);
    },
    boltReload: function (t) {
      noise(0.12, 'bandpass', 900, 1.8, 0.15, t);
      noise(0.1, 'bandpass', 1500, 2.2, 0.15, t + 0.36);
    },
    reloadDone: function (t) { tone(760, 0.07, 'triangle', 0.07, t); tone(1040, 0.09, 'triangle', 0.06, t + 0.05); },

    hit: function (t) { tone(1250, 0.05, 'square', 0.08, t); tone(900, 0.06, 'square', 0.05, t + 0.02); },
    headshot: function (t) { tone(1600, 0.08, 'square', 0.11, t); tone(2100, 0.1, 'sine', 0.07, t + 0.03); },
    hurt: function (t) { noise(0.16, 'lowpass', 420, 0.8, 0.24, t); tone(140, 0.16, 'sawtooth', 0.1, t, null, 70); },
    shieldBreak: function (t) { noise(0.3, 'highpass', 2600, 0.8, 0.2, t); tone(700, 0.25, 'sine', 0.1, t, null, 220); },

    pickup: function (t) { tone(700, 0.09, 'sine', 0.09, t); tone(1050, 0.1, 'sine', 0.07, t + 0.06); },
    pickupRare: function (t) { tone(700, 0.09, 'sine', 0.09, t); tone(1050, 0.1, 'sine', 0.07, t + 0.06); tone(1400, 0.14, 'sine', 0.06, t + 0.13); },
    drop: function (t) { tone(400, 0.1, 'triangle', 0.07, t, null, 220); },
    empty: function (t) { noise(0.04, 'bandpass', 2400, 3, 0.1, t); },

    elim: function (t) { tone(880, 0.1, 'triangle', 0.11, t); tone(1320, 0.12, 'triangle', 0.09, t + 0.08); tone(1760, 0.16, 'sine', 0.07, t + 0.17); },
    footstep: function (t, surf) {
      var f = surf === 'water' ? 900 : surf === 'road' ? 500 : 380;
      noise(0.07, 'bandpass', f, 1.4, surf === 'water' ? 0.09 : 0.055, t);
    },
    land: function (t) { noise(0.12, 'lowpass', 320, 1, 0.14, t); },
    jump: function (t) { noise(0.07, 'bandpass', 700, 1.2, 0.06, t); },
    storm: function (t) { tone(120, 0.9, 'sine', 0.1, t, null, 90); tone(182, 0.8, 'sine', 0.05, t + 0.05); },
    stormDamage: function (t) { noise(0.2, 'lowpass', 300, 0.7, 0.18, t); },
    victory: function (t) {
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.5, 'triangle', 0.1, t + i * 0.13); });
      tone(1318, 0.9, 'sine', 0.06, t + 0.55);
    },
    defeat: function (t) {
      [440, 392, 330, 262].forEach(function (f, i) { tone(f, 0.55, 'triangle', 0.09, t + i * 0.16); });
    },
    levelUp: function (t) {
      [660, 880, 1100, 1320].forEach(function (f, i) { tone(f, 0.3, 'sine', 0.08, t + i * 0.09); });
    }
  };

  var Audio = (BN.Audio = {
    init: function () {
      var c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      if (!listenerReady) { listenerReady = true; }
    },
    ready: function () { return !!ctx; },
    setVolumes: function (v) {
      if (v.master !== undefined) vol.master = v.master;
      if (v.sfx !== undefined) vol.sfx = v.sfx;
      if (v.music !== undefined) vol.music = v.music;
      if (ctx) {
        master.gain.value = vol.master;
        sfxBus.gain.value = vol.sfx;
        if (!musicOn) musicBus.gain.value = 0.0001;
      }
      if (musicOn) musicBus.gain.value = Math.max(0.0001, vol.music * 0.5);
    },
    sfx: function (name, opts) {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      var fn = SFX[name];
      if (!fn) return;
      var t = now() + (opts && opts.delay ? opts.delay : 0);
      fn(t, opts);
    },
    /* positional-ish: attenuate by distance from listener */
    sfxAt: function (name, dist, opts) {
      var d = dist || 0;
      if (d > 90) return;
      var gain = Math.max(0.06, 1 - d / 90);
      var o = opts || {};
      o.volume = gain;
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      var fn = SFX[name];
      if (!fn) return;
      var t = now();
      if (o.delay) t += o.delay;
      fn(t, o);
    },

    /* ------------------------------ music ------------------------------ */
    /* Slow minor arpeggio pad. Original composition, generated here.      */
    musicStart: function () {
      if (!ensure() || musicOn) return;
      musicOn = true;
      musicBus.gain.setTargetAtTime(Math.max(0.0001, vol.music * 0.5), now(), 1.2);
      var notes = [130.81, 155.56, 196.00, 233.08, 196.00, 155.56, 174.61, 207.65];
      var pad = [65.41, 98.00, 77.78, 87.31];
      var step = 0;
      function tick() {
        if (!musicOn) return;
        var t = now() + 0.05;
        var n = notes[step % notes.length];
        tone(n, 1.4, 'sine', 0.05, t, musicBus);
        tone(n * 2, 1.1, 'triangle', 0.02, t + 0.02, musicBus);
        if (step % 4 === 0) {
          tone(pad[(step / 4) % pad.length], 4.2, 'sine', 0.055, t, musicBus);
        }
        step++;
      }
      tick();
      musicTimer = setInterval(tick, 1100);
    },
    musicStop: function () {
      musicOn = false;
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (ctx) musicBus.gain.setTargetAtTime(0.0001, now(), 0.4);
    },
    isMusicOn: function () { return musicOn; }
  });
})();
