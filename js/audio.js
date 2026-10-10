// Motor de audio con Web Audio API: todo es síntesis, no se usan samples.
//   melodía → melIn → distorsión → melBus → duck ─┬───→ master → paso alto (build-up) → compresor → salida
//                                                 ├→ reverb
//                                                 └→ delay
//   batería → drumIn → distorsión → filtro → drumBus → master (+ un poco de reverb)
//   bombo   → kickIn → distorsión → realce grave (EQ) → filtro → drumBus   (kits con bombo propio)
//   bajo    → bassIn → distorsión → bassBus → duck → master
//   acordes → chordIn (chordBus) → duck ─┬→ master                              (voces de js/chords.js)
//                                        └→ reverb
// Los timbres de la melodía están en js/instruments.js y los kits de batería en js/drums.js.
(function (MS) {
  'use strict';

  // Curva de saturación suave: amount 0 = lineal, 1 = muy distorsionado
  function driveCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = k ? ((1 + k) * x) / (1 + k * Math.abs(x)) : x;
    }
    return c;
  }

  class Engine {
    constructor() {
      this.ctx = null;
      this.glide = null;
      this.openHat = null;
      this.lastBass = 0;
      this.lastAcid = 0;
      this.bassMode = '808';
      this.metalSum = null;  // seis osciladores cuadrados siempre en marcha para hats y platillos
      this.building = null;  // build-up en curso: { s (ruido), until }
      this.instrument = 'synth';
      this.kit = 'clasica';
      this.waves = {};
      this.poles = new Map(); // filtros de un polo compartidos por salida (ver onePole)
      this.kept = []; // nodos de notas ya programadas: { end, nodes } (ver keep / sweep)
      this.p = { melVol: 0.5, drive: 0, reverb: 0.35, delay: 0.25, drumVol: 0.8, bassVol: 0.6, chordVol: 0.5, bpm: 110 };
    }

    get inst() { return MS.INSTRUMENTS[this.instrument] || MS.INSTRUMENTS.synth; }
    get kitDef() { return MS.KITS[this.kit] || MS.KITS.clasica; }

    // `ctx` opcional: permite renderizar sin altavoces (OfflineAudioContext) para pruebas
    ensure(ctx) {
      if (this.ctx) {
        if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
        return this.ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = this.ctx = ctx || new AC({ latencyHint: 'interactive' });
      const gain = (v, dest) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };

      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 8;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.2;
      this.comp.connect(ctx.destination);
      if (ctx.createMediaStreamDestination) {
        this.recDest = ctx.createMediaStreamDestination();
        this.comp.connect(this.recDest);
      }
      // paso alto de todo el mix: transparente (10 Hz) salvo durante un build-up
      this.buildHP = ctx.createBiquadFilter();
      this.buildHP.type = 'highpass'; this.buildHP.frequency.value = 10; this.buildHP.Q.value = 0.7;
      this.buildHP.connect(this.comp);
      this.master = gain(0.9, this.buildHP);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.6, 3.2);
      this.reverb.connect(this.master);

      this.delay = ctx.createDelay(2);
      const fb = gain(0.38);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2800;
      this.delay.connect(tone); tone.connect(fb); fb.connect(this.delay);
      tone.connect(this.master);

      this.melBus = gain(0);
      this.melDuck = gain(1, this.master);
      this.melBus.connect(this.melDuck);
      this.melRev = gain(0, this.reverb); this.melDuck.connect(this.melRev);
      this.melDel = gain(0, this.delay); this.melDuck.connect(this.melDel);
      this.melDrive = this.driveStage(this.melBus);
      this.melIn = this.melDrive.input;

      this.drumBus = gain(0, this.master);
      this.drumBus.connect(gain(0.07, this.reverb));
      this.drumTone = ctx.createBiquadFilter();
      this.drumTone.type = 'lowpass';
      this.drumTone.frequency.value = 20000;
      this.drumTone.connect(this.drumBus);
      this.drumDrive = this.driveStage(this.drumTone);
      this.drumIn = this.drumDrive.input;

      // bombo con cadena propia: saturación y realce grave (≈55 Hz) según el kit
      this.kickEq = ctx.createBiquadFilter();
      this.kickEq.type = 'peaking'; this.kickEq.frequency.value = 55; this.kickEq.Q.value = 1; this.kickEq.gain.value = 0;
      this.kickEq.connect(this.drumTone);
      this.kickDrive = this.driveStage(this.kickEq);
      this.kickIn = this.kickDrive.input;

      this.bassBus = gain(0);
      this.bassDuck = gain(1, this.master);
      this.bassBus.connect(this.bassDuck);
      this.bassDrive = this.driveStage(this.bassBus);
      this.bassIn = this.bassDrive.input;

      // acordes: sin distorsión, con su propia reverb y el mismo bombeo del sidechain que la melodía
      this.chordBus = gain(0);
      this.chordDuck = gain(1, this.master);
      this.chordBus.connect(this.chordDuck);
      this.chordDuck.connect(gain(0.3, this.reverb));
      this.chordIn = this.chordBus;

      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      for (const k of Object.keys(this.p)) this.set(k, this.p[k]);
      this.setKit(this.kit);
      return ctx;
    }

    // Saturador: entra bajado ×¼ para que la parte lineal tenga margen, y sale compensado
    // para que subir la distorsión no suba el volumen.
    driveStage(dest) {
      const ctx = this.ctx;
      const input = ctx.createGain(); input.gain.value = 0.25;
      const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
      const output = ctx.createGain();
      input.connect(shaper).connect(output).connect(dest);
      const stage = {
        input,
        set(amount) {
          const k = Math.min(1, Math.max(0, amount)) * 60;
          shaper.curve = driveCurve(k);
          output.gain.value = 4 / ((1 + k) / (1 + 0.25 * k));
        },
      };
      stage.set(0);
      return stage;
    }

    get now() { return this.ctx ? this.ctx.currentTime : 0; }

    // Registra los nodos de una nota: se desconectan cuando termina, si no el grafo de audio
    // crece sin fin (cada golpe dejaba filtros y ganancias conectados para siempre).
    // También acepta funciones, para soltar una conexión concreta de un nodo que sigue vivo.
    keep(end, ...nodes) { this.kept.push({ end, nodes }); }

    sweep() {
      if (!this.kept.length) return;
      const now = this.now;
      this.kept = this.kept.filter((k) => {
        if (k.end > now) return true;
        for (const n of k.nodes) {
          try { if (typeof n === 'function') n(); else n.disconnect(); } catch { /* ya estaba desconectado */ }
        }
        return false;
      });
    }

    set(name, v) {
      this.p[name] = v;
      if (!this.ctx) return;
      const t = this.now;
      const smooth = (param, val) => param.setTargetAtTime(val, t, 0.03);
      switch (name) {
        case 'melVol': smooth(this.melBus.gain, v * 0.6); break;
        case 'drive': this.melDrive.set(v + (this.inst.drive || 0)); break;
        case 'reverb': smooth(this.melRev.gain, v); break;
        case 'delay': smooth(this.melDel.gain, v * 0.7); break;
        case 'drumVol': smooth(this.drumBus.gain, v); break;
        case 'bassVol': smooth(this.bassBus.gain, v * 0.8); break;
        case 'chordVol': smooth(this.chordBus.gain, v * 0.55); break;
        case 'bpm': smooth(this.delay.delayTime, (60 / v) * 0.75); break; // corchea con puntillo
      }
    }

    // `at`: cuándo se corta el glissando del instrumento anterior (por defecto, ahora)
    setInstrument(key, at) {
      this.instrument = MS.INSTRUMENTS[key] ? key : 'synth';
      this.stopGlide(at);
      if (this.ctx) this.melDrive.set(this.p.drive + (this.inst.drive || 0));
    }

    setKit(key) {
      this.kit = MS.KITS[key] ? key : 'clasica';
      if (!this.ctx) return;
      const K = this.kitDef;
      this.drumDrive.set(K.drive || 0);
      this.kickDrive.set(K.kickDrive ?? K.drive ?? 0);
      this.kickEq.frequency.value = K.kickEq?.f ?? 55;
      this.kickEq.Q.value = K.kickEq?.q ?? 1;
      this.kickEq.gain.setTargetAtTime(K.kickEq?.gain ?? 0, this.now, 0.02);
      this.drumTone.frequency.setTargetAtTime(K.lowpass || 20000, this.now, 0.02);
      this.updateBassDrive();
    }

    // Línea de bajo que suena (808, acid, offbeat, rolling, funk): la 303 suena con distorsión
    setBassMode(mode) {
      this.bassMode = mode;
      if (this.ctx) this.updateBassDrive();
    }

    updateBassDrive() {
      this.bassDrive.set(Math.max(this.kitDef.bass?.drive || 0, this.bassMode === 'acid' ? 0.4 : 0));
    }

    // Paso bajo de un polo (6 dB por octava) hacia `dest`, uno por salida y frecuencia, creado una sola
    // vez: Chrome tarda de 16 a 100 ms en crear cada IIRFilter, y con uno por voz los acordes de nueve
    // voces dejaban la página parada casi un segundo. Como el filtro es lineal, da igual ponerlo antes o
    // después del volumen de cada voz, así que todas las voces comparten el mismo.
    onePole(dest, f) {
      if (!this.poles.has(dest)) this.poles.set(dest, new Map());
      const byF = this.poles.get(dest);
      if (!byF.has(f)) {
        const a = Math.exp((-2 * Math.PI * f) / this.ctx.sampleRate);
        const fl = this.ctx.createIIRFilter([1 - a], [1, -a]);
        fl.connect(dest);
        byF.set(f, fl);
      }
      return byF.get(f);
    }

    // Formas de onda a medida, creadas una sola vez
    periodicWave(name, build) {
      if (!this.waves[name]) {
        const [re, im] = build(64);
        this.waves[name] = this.ctx.createPeriodicWave(re, im);
      }
      return this.waves[name];
    }

    impulse(seconds, decay) {
      const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    // ---------- Melodía ----------
    // Glissando continuo (solo instrumentos sostenidos), a velocidad de audio:
    // `freqs` reparte la frecuencia entre t y t + dur
    glideCurve(t, freqs, dur) {
      if (!this.inst.voice) return; // los percusivos no sostienen el tono
      if (!this.glide) this.glide = this.inst.voice(this, t, freqs[0]);
      try {
        this.glide.curve(t, freqs, dur);
      } catch {
        this.glide.set(t + dur, freqs[freqs.length - 1]); // si choca con otra automatización
      }
    }

    stopGlide(at) {
      const G = this.glide;
      if (!G) return;
      this.glide = null;
      G.stop(Math.max(at || 0, this.now));
    }

    // Nota suelta con el instrumento actual
    note(t, freq, dur, v = 0.8) {
      this.inst.hit(this, t, freq, dur, v);
    }

    // ---------- Bajo tipo 808 ----------
    bass(t, freq, dur) {
      const ctx = this.ctx, B = this.kitDef.bass || {};
      const prev = this.lastBass;
      this.lastBass = freq;
      const o = ctx.createOscillator();
      o.type = 'sine';
      if (B.slide && prev && prev !== freq && Math.random() < B.slide) {
        o.frequency.setValueAtTime(prev, t); // se desliza desde la nota anterior
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
      } else {
        o.frequency.setValueAtTime(freq * 2, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
      }
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 700;
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.006);
      g.gain.setValueAtTime(0.9, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g2).connect(f).connect(g); g.connect(this.bassIn);
      o.start(t); o2.start(t);
      o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      this.keep(t + dur + 0.1, o, o2, f, g2, g);
    }

    // Una nota de la línea de bajo según su tipo; `st` = { v, accent, slide } del paso
    bassNote(mode, t, freq, dur, st = {}) {
      if (mode === 'acid') this.acidBass(t, freq, dur, st);
      else if (mode === 'funk') this.pluckBass(t, freq, dur, st.v ?? 0.8, 9);
      else this.pluckBass(t, freq, dur, st.v ?? 0.8, mode === 'rolling' ? 4 : 6);
    }

    // Bajo ácido (estilo TB-303): sierra por un paso bajo resonante que se cierra en cada nota.
    // Los acentos abren más el filtro y suenan más fuerte; las notas ligadas se deslizan desde la anterior.
    acidBass(t, freq, dur, { v = 0.8, accent = false, slide = false } = {}) {
      const ctx = this.ctx;
      const prev = this.lastAcid;
      this.lastAcid = freq;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      if (slide && prev) {
        o.frequency.setValueAtTime(prev, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      } else o.frequency.setValueAtTime(freq, t);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = accent ? 15 : 10;
      f.frequency.setValueAtTime(Math.min(freq * (accent ? 24 : 12), 7000), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.3, 120), t + (accent ? 0.13 : 0.2));
      const g = ctx.createGain();
      const level = (accent ? 0.7 : 0.45) * v;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.004);
      g.gain.setValueAtTime(level, t + Math.max(0.01, dur * 0.8));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
      o.connect(f).connect(g).connect(this.bassIn);
      o.start(t); o.stop(t + dur + 0.05);
      this.keep(t + dur + 0.1, o, f, g);
    }

    // Bajo corto con filtro que se cierra (sierra + seno grave): a contratiempo, rodante y funk.
    // `bright`: cuánto se abre el filtro al principio de la nota
    pluckBass(t, freq, dur, v = 0.8, bright = 6) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(freq, t);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(Math.min(freq * bright * 3, 6000), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 90), t + Math.min(0.14, dur));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, dur));
      const sg = ctx.createGain(); sg.gain.value = 0.7;
      o.connect(f).connect(g);
      sub.connect(sg).connect(g);
      g.connect(this.bassIn);
      o.start(t); sub.start(t);
      o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
      this.keep(t + dur + 0.1, o, sub, f, g, sg);
    }

    // ---------- Batería ----------
    drum(type, t, v) {
      const K = this.kitDef;
      if (type === 'kick' && K.pump) this.pump(t, K.pump);
      if (type === 'hat') {
        // un hat cerrado corta al abierto que esté sonando ("choke")
        const oh = this.openHat;
        if (oh && t > oh.t && t < oh.end) {
          const p = oh.g.gain;
          if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
          p.setTargetAtTime(0.0001, t, 0.008);
          this.openHat = null;
        }
      }
      const g = K[type] && K[type](this, t, v);
      if (type === 'open' && g) this.openHat = { g, t, end: t + 0.4 };
    }

    pump(t, { level, release }) {
      for (const gain of [this.melDuck.gain, this.bassDuck.gain, this.chordDuck.gain]) {
        if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(t);
        else {
          gain.cancelScheduledValues(t);
          gain.setValueAtTime(1, t);
        }
        gain.linearRampToValueAtTime(level, t + 0.012);
        gain.linearRampToValueAtTime(1, t + release);
      }
    }

    // `dest`: por defecto la batería; los kits con bombo propio mandan el bombo a E.kickIn
    noiseHit(t, dur, v, ftype, ffreq, q, dest = this.drumIn) {
      const ctx = this.ctx;
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = ftype; f.frequency.value = ffreq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(dest);
      s.start(t, Math.random() * 1.5);
      s.stop(t + dur + 0.02);
      this.keep(t + dur + 0.05, s, f, g);
      return g;
    }

    tone(t, type, f0, f1, sweep, dur, v, dest = this.drumIn) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dur + 0.02);
      this.keep(t + dur + 0.05, o, g);
    }

    // Dos ondas cuadradas por un paso banda: cencerros y percusiones metálicas
    square2(t, f1, f2, band, q, dur, v) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = band; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const nodes = [f, g];
      for (const fr of [f1, f2]) {
        const o = ctx.createOscillator();
        o.type = 'square'; o.frequency.value = fr;
        o.connect(f);
        o.start(t); o.stop(t + dur + 0.02);
        nodes.push(o);
      }
      f.connect(g).connect(this.drumIn);
      this.keep(t + dur + 0.05, ...nodes);
    }

    // Hats y platillos metálicos al estilo 808/909: seis ondas cuadradas de frecuencias inarmónicas
    // suenan siempre, y cada golpe abre sobre ellas un filtro y una envolvente.
    metal(t, dur, v, hp = 7000, dest = this.drumIn) {
      const ctx = this.ctx;
      if (!this.metalSum) {
        this.metalSum = ctx.createGain();
        this.metalSum.gain.value = 1 / 6;
        for (const fr of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
          const o = ctx.createOscillator();
          o.type = 'square'; o.frequency.value = fr;
          o.connect(this.metalSum);
          o.start();
        }
      }
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 0.7;
      const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      this.metalSum.connect(bp);
      bp.connect(h).connect(g).connect(dest);
      this.keep(t + dur + 0.05, () => this.metalSum.disconnect(bp), bp, h, g);
      return g;
    }

    // ---------- Build-up y drop ----------
    // Build-up de t0 a t1: ruido que sube de tono (riser) y un paso alto en todo el mix que se va
    // abriendo; en t1 (el drop) el filtro vuelve a dejar pasar todo. La intro de los acordes lo usa
    // sin filtro y con el riser más bajo, para que la espiral se oiga entera.
    buildUp(t0, t1, { filter = true, level = 0.4 } = {}) {
      const ctx = this.ctx;
      t1 = Math.max(t1, t0 + 0.2);
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(300, t0);
      bp.frequency.exponentialRampToValueAtTime(9000, t1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(level, t1 - 0.02);
      g.gain.linearRampToValueAtTime(0, t1 + 0.02);
      const send = ctx.createGain(); send.gain.value = 0.12; // la reverb ya alarga mucho el ruido
      s.connect(bp).connect(g).connect(this.master);
      g.connect(send).connect(this.reverb);
      s.start(t0); s.stop(t1 + 0.05);
      this.keep(t1 + 0.1, s, bp, g, send);
      this.building = { s, until: t1 };
      if (!filter) return;
      // el paso alto sube durante el build-up y baja en los últimos 30 ms: un salto brusco
      // del filtro con el golpe del drop sonando provocaba un pico muy fuerte
      const hp = this.buildHP.frequency;
      hp.cancelScheduledValues(t0);
      hp.setValueAtTime(20, t0);
      hp.exponentialRampToValueAtTime(650, t1 - 0.03);
      hp.exponentialRampToValueAtTime(10, t1);
    }

    // Corta un build-up a medias (pausa, reinicio): el mix vuelve a sonar entero
    cancelBuild() {
      if (!this.ctx) return;
      const now = this.now, hp = this.buildHP.frequency;
      hp.cancelScheduledValues(now);
      hp.setValueAtTime(10, now);
      if (this.building && this.building.until > now) {
        try { this.building.s.stop(now + 0.01); } catch { /* ya estaba parado */ }
      }
      this.building = null;
    }

    // Drop: golpe grave que cae y platillo largo
    drop(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 1.5);
      this.keep(t + 1.6, o, g);
      this.metal(t, 1.8, 0.6, 4500, this.master);
      this.building = null;
    }
  }

  MS.Engine = Engine;
})(globalThis.MS = globalThis.MS || {});
