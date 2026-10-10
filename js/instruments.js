// Instrumentos de la melodía: cada uno es una pequeña receta de síntesis (Web Audio, sin samples).
//   sustain: true  → puede sonar como glissando continuo: voice(E, t, f, o) → { set(t, f), curve(…), stop(t) }
//                    o (opcional) = { dest: nodo de salida (por defecto E.melIn), gain: volumen relativo,
//                                     pan: paneo de la voz entera, de −1 a 1 }
//   En las capas, `pan` abre en estéreo los osciladores desafinados (supersaw, pad, lead, coro).
//   sustain: false → percusivo: en modo glissando se repite en cada subdivisión
//   hit(E, t, f, dur, v) toca una nota suelta (modos escala, pasos y ritmo)
//   drive: distorsión propia del instrumento (se suma a la del control "Distorsión")
// E es el motor (js/audio.js): todo se conecta a E.melIn.
(function (MS) {
  'use strict';

  const BASIC = ['sine', 'square', 'sawtooth', 'triangle'];

  // Formas de onda a medida (series de Fourier) para PeriodicWave
  const CUSTOM_WAVES = {
    pulse25(n) { // pulso con ciclo de trabajo del 25 % (sonido de consola de 8 bits)
      const re = new Float32Array(n), im = new Float32Array(n), d = 0.25;
      for (let k = 1; k < n; k++) {
        re[k] = Math.sin(2 * Math.PI * k * d) / (Math.PI * k);
        im[k] = (1 - Math.cos(2 * Math.PI * k * d)) / (Math.PI * k);
      }
      return [re, im];
    },
    organ(n) { // registros de un órgano: fundamental, octava, quinta, doble octava…
      const re = new Float32Array(n), im = new Float32Array(n);
      const bars = { 1: 1, 2: 0.75, 3: 0.5, 4: 0.45, 6: 0.3, 8: 0.25 };
      for (const k in bars) if (k < n) im[k] = bars[k];
      return [re, im];
    },
  };

  function makeOsc(E, type, f, t, detune = 0) {
    const o = E.ctx.createOscillator();
    if (BASIC.includes(type)) o.type = type;
    else o.setPeriodicWave(E.periodicWave(type, CUSTOM_WAVES[type]));
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    o.start(t);
    return o;
  }

  // Ganancia con ataque y caída exponenciales, conectada a la salida de la melodía
  function env(E, t, peak, attack, decay) {
    const g = E.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(E.melIn);
    E.keep(t + decay + 0.1, g);
    return g;
  }

  // Voz sostenida hecha de capas de osciladores: { type, ratio, detune, gain, pan }.
  // Sirve para el glissando, para las voces de los acordes (o.dest, o.pan) y, con stop programado, para
  // notas sueltas.
  function layered(E, t, f, spec, o = {}) {
    const ctx = E.ctx, level = spec.level * (o.gain ?? 1), attack = spec.attack ?? 0.05;
    const aux = []; // resto de nodos de la voz (paneos, formantes, LFO): se liberan al apagarla
    const panned = (pan, to, mono) => { const P = E.stereo(pan, to, mono); aux.push(...P.nodes); return P; };
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(level, t + attack);
    const onepole = spec.filter?.type === 'onepole'; // paso bajo suave de 6 dB por octava, compartido
    let target = onepole ? E.onePole(o.dest || E.melIn, spec.filter.f) : o.dest || E.melIn;
    let pan = null;
    if (o.pan !== undefined) { // si alguna capa ya va paneada, la voz llega en estéreo
      const P = panned(o.pan, target, !spec.layers.some((L) => L.pan));
      target = P.input;
      pan = P.pan;
    }
    out.connect(target);

    let dest = out;
    const filters = [];
    if (spec.filter && !onepole) {
      const fl = ctx.createBiquadFilter();
      fl.type = spec.filter.type; fl.frequency.value = spec.filter.f; fl.Q.value = spec.filter.q ?? 0.7;
      fl.connect(out);
      dest = fl;
      filters.push(fl);
    }
    if (spec.formants) { // filtros paso banda en paralelo: vocal "a"
      const sum = ctx.createGain();
      for (const [ff, gg, q] of spec.formants) {
        const b = ctx.createBiquadFilter();
        b.type = 'bandpass'; b.frequency.value = ff; b.Q.value = q;
        const g = ctx.createGain(); g.gain.value = gg;
        sum.connect(b).connect(g).connect(dest);
        aux.push(b, g);
      }
      aux.push(sum);
      dest = sum;
    }

    const oscs = spec.layers.map((L) => {
      const o = makeOsc(E, L.type, f * (L.ratio || 1), t, L.detune || 0);
      const g = ctx.createGain(); g.gain.value = L.gain ?? 1;
      o.connect(g).connect(L.pan ? panned(L.pan, dest).input : dest);
      return { o, ratio: L.ratio || 1, g };
    });
    const extra = [];
    if (spec.vibrato) { // vibrato en cents
      const lfo = makeOsc(E, 'sine', spec.vibratoRate || 5.5, t);
      const lg = ctx.createGain(); lg.gain.value = spec.vibrato;
      lfo.connect(lg);
      oscs.forEach((x) => lg.connect(x.o.detune));
      extra.push(lfo);
      aux.push(lg);
    }
    if (spec.wah && filters[0]) { // barrido del filtro en cada semicorchea (ácido)
      const lfo = makeOsc(E, 'sawtooth', (E.p.bpm / 60) * 4, t);
      const lg = ctx.createGain(); lg.gain.value = -spec.wah;
      lfo.connect(lg).connect(filters[0].frequency);
      extra.push(lfo);
      aux.push(lg);
    }

    return {
      pan, // AudioParam del paneo de la voz (null si no se paneó)
      set(t1, f1) { for (const x of oscs) x.o.frequency.linearRampToValueAtTime(f1 * x.ratio, t1); },
      // tono a velocidad de audio: una curva de frecuencias muy densa entre t1 y t1 + dur
      // Se usan puntos con rampa lineal (unos 300 por segundo) y no setValueCurveAtTime:
      // con esa llamada, Chrome dejaba bloqueado el hilo principal durante la reproducción.
      curve(t1, freqs, dur) {
        const n = freqs.length, stride = Math.max(1, Math.floor((n - 1) / Math.max(2, dur * 300)));
        const idx = [];
        for (let i = 0; i < n - 1; i += stride) idx.push(i);
        idx.push(n - 1);
        for (const x of oscs) {
          for (const i of idx) x.o.frequency.linearRampToValueAtTime(freqs[i] * x.ratio, t1 + (dur * i) / (n - 1));
        }
      },
      // apaga la voz en `at`: si es ahora, parte del volumen actual
      stop(at, rel = 0.08) {
        const g = out.gain;
        if (at <= E.now + 0.01) { g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); }
        else g.setValueAtTime(level, Math.max(at, t + attack));
        g.linearRampToValueAtTime(0, Math.max(at, t + attack) + rel);
        const end = Math.max(at, t + attack) + rel + 0.03;
        oscs.forEach((x) => x.o.stop(end));
        extra.forEach((o) => o.stop(end));
        E.keep(end + 0.05, out, ...filters, ...aux, ...oscs.map((x) => x.o), ...oscs.map((x) => x.g), ...extra);
      },
    };
  }

  // Nota suelta de un instrumento sostenido: suena `dur` y se apaga (spec.release: cola más larga)
  function held(spec) {
    return (E, t, f, dur, v) => {
      const vo = layered(E, t, f, { ...spec, level: spec.level * v, attack: Math.min(spec.attack ?? 0.02, dur * 0.3) });
      vo.stop(t + Math.max(0.05, dur * 0.85), spec.release ?? Math.min(0.12, dur * 0.4 + 0.02));
    };
  }

  // Nota con ataque rápido y filtro que se cierra (pluck sustractivo)
  function pluck(spec) {
    return (E, t, f, dur, v) => {
      const ctx = E.ctx;
      const d = Math.min(spec.maxDecay ?? 9, Math.max(0.12, dur));
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.Q.value = spec.q ?? 2;
      fl.frequency.setValueAtTime(Math.min(f * (spec.bright ?? 10), 16000), t);
      fl.frequency.exponentialRampToValueAtTime(Math.max(f * 1.3, 250), t + d * (spec.sweep ?? 1));
      fl.connect(env(E, t, v * spec.level, 0.004, d));
      const nodes = [fl];
      for (const L of spec.layers) {
        const o = makeOsc(E, L.type, f * (L.ratio || 1), t, L.detune || 0);
        if (L.pan) { const P = E.stereo(L.pan, fl); nodes.push(...P.nodes); o.connect(P.input); } else o.connect(fl);
        o.stop(t + d + 0.05);
        nodes.push(o);
      }
      E.keep(t + d + 0.1, ...nodes);
    };
  }

  // Síntesis FM: un modulador cambia la frecuencia de la portadora (campanas, pianos eléctricos)
  function fm(spec) {
    return (E, t, f, dur, v) => {
      const ctx = E.ctx;
      const d = Math.min(spec.decay, Math.max(0.35, dur * 3));
      const car = makeOsc(E, 'sine', f, t);
      const mod = makeOsc(E, 'sine', f * spec.ratio, t);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * spec.index, t);
      mg.gain.exponentialRampToValueAtTime(Math.max(1, f * spec.index * 0.04), t + Math.min(d, spec.indexDecay));
      mod.connect(mg).connect(car.frequency);
      car.connect(env(E, t, v * spec.level, 0.003, d));
      car.stop(t + d + 0.05); mod.stop(t + d + 0.05);
      E.keep(t + d + 0.1, car, mod, mg);
      if (spec.tine) { // "clic" metálico del piano eléctrico
        const tine = makeOsc(E, 'sine', f * spec.tine, t);
        tine.connect(env(E, t, v * spec.level * 0.12, 0.002, 0.06));
        tine.stop(t + 0.1);
        E.keep(t + 0.12, tine);
      }
    };
  }

  // Cencerro 808 afinado: dos ondas cuadradas en relación 1 : 1.48 por un paso banda
  function cowbell(E, t, f, dur, v) {
    const ctx = E.ctx;
    const d = Math.min(0.55, Math.max(0.18, dur * 1.6));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = Math.min(f * 2.6, 9000); bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.7, t + 0.002);
    g.gain.exponentialRampToValueAtTime(v * 0.24, t + 0.035); // golpe inicial y luego la cola
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    bp.connect(g).connect(E.melIn);
    const nodes = [bp, g];
    for (const r of [1, 1.4815]) {
      const o = makeOsc(E, 'square', f * r, t);
      o.connect(bp);
      o.stop(t + d + 0.05);
      nodes.push(o);
    }
    E.keep(t + d + 0.1, ...nodes);
  }

  // Nota de 808: empieza una octava arriba y cae enseguida (el "punch")
  function hit808(E, t, f, dur, v) {
    const d = Math.min(1.2, Math.max(0.3, dur * 1.3));
    const o = makeOsc(E, 'sine', f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.04);
    o.connect(env(E, t, v * 0.55, 0.004, d));
    o.stop(t + d + 0.05);
    E.keep(t + d + 0.1, o);
  }

  function marimba(E, t, f, dur, v) {
    const d = Math.min(0.9, Math.max(0.25, dur * 2));
    const parts = [[1, 0.55, d], [4, 0.14, 0.08], [10, 0.03, 0.03]];
    for (const [r, a, dd] of parts) {
      const o = makeOsc(E, 'sine', f * r, t);
      o.connect(env(E, t, v * a, 0.002, dd));
      o.stop(t + dd + 0.05);
      E.keep(t + dd + 0.1, o);
    }
  }

  // Piano suave: parciales casi armónicos (un poco estirados, como las cuerdas reales) que se apagan
  // antes cuanto más agudos son
  function piano(E, t, f, dur, v) {
    const d = Math.min(3, Math.max(0.6, 2.2 * Math.pow(440 / f, 0.3)));
    for (const [n, a] of [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1], [5, 0.05]]) {
      const o = makeOsc(E, 'sine', f * n * (1 + 0.0004 * n * n), t);
      const dd = d / (1 + 0.6 * (n - 1));
      o.connect(env(E, t, v * a * 0.42, 0.003, dd));
      o.stop(t + dd + 0.05);
      E.keep(t + dd + 0.1, o);
    }
  }

  // Siete sierras desafinadas entre sí: el sonido ancho del trance y el hardstyle. Cuanto más
  // desafinada, más hacia un lado
  const SAWS = (cents, side) => cents.map((d) => ({ type: 'sawtooth', detune: d, gain: d ? side : 1, pan: d / 32 }));

  const VOWEL_A = [[730, 4, 9], [1090, 2.2, 11], [2440, 1.2, 13]]; // [frecuencia, ganancia, Q]

  const SPEC = {
    // medido en el video de referencia: sierra sin desafinar con los agudos suavizados
    // por un paso bajo de un polo (6 dB/octava) a 1.2 kHz
    videoSaw: { layers: [{ type: 'sawtooth' }], filter: { type: 'onepole', f: 1200 }, level: 0.45, attack: 0.01 },
    synth: { layers: [{ type: 'triangle' }, { type: 'triangle', detune: 7, gain: 0.5 }], filter: { type: 'lowpass', f: 4500 }, level: 0.5 },
    sine: { layers: [{ type: 'sine' }], level: 0.55 },
    lead: { layers: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 9, gain: 0.7, pan: 0.4 }, { type: 'sawtooth', detune: -9, gain: 0.7, pan: -0.4 }], filter: { type: 'lowpass', f: 3200, q: 1 }, level: 0.34 },
    chip: { layers: [{ type: 'pulse25' }], level: 0.4, attack: 0.004 },
    organ: { layers: [{ type: 'organ' }], vibrato: 6, vibratoRate: 6.5, level: 0.5, attack: 0.015 },
    choir: { layers: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 12, pan: 0.45 }, { type: 'sawtooth', detune: -12, pan: -0.45 }], formants: VOWEL_A, vibrato: 14, vibratoRate: 5, level: 0.27, attack: 0.09 },
    whistle: { layers: [{ type: 'sine' }, { type: 'sine', ratio: 2, gain: 0.04 }], vibrato: 22, vibratoRate: 5.2, level: 0.42, attack: 0.07 },
    acid: { layers: [{ type: 'sawtooth' }], filter: { type: 'lowpass', f: 1300, q: 13 }, wah: 1000, level: 0.2, attack: 0.01 },
    sub808: { layers: [{ type: 'sine', ratio: 0.5 }, { type: 'triangle', ratio: 0.5, gain: 0.25 }], level: 0.33, attack: 0.01 },
    supersaw: { layers: SAWS([-28, -17, -8, 0, 8, 17, 28], 0.6), filter: { type: 'lowpass', f: 5500, q: 0.6 }, level: 0.2, attack: 0.01 },
    pad: { layers: [{ type: 'sawtooth', detune: -7, pan: -0.5 }, { type: 'sawtooth', detune: 7, pan: 0.5 }, { type: 'triangle', ratio: 0.5, gain: 0.6 }],
      filter: { type: 'lowpass', f: 1400, q: 0.5 }, vibrato: 4, vibratoRate: 4.2, level: 0.26, attack: 0.35, release: 0.9 },
  };

  const INSTRUMENTS = {
    videoSaw: { name: 'Sierra suave (de los videos)', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.videoSaw, o),
      hit: pluck({ layers: [{ type: 'sawtooth' }], level: 0.45, bright: 6 }) },
    synth: { name: 'Sintetizador suave', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.synth, o),
      hit: pluck({ layers: [{ type: 'triangle' }, { type: 'triangle', detune: -6 }], level: 0.34 }) },
    sine: { name: 'Seno puro', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.sine, o),
      hit: pluck({ layers: [{ type: 'sine' }], level: 0.7, bright: 40 }) },
    lead: { name: 'Lead sierra', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.lead, o),
      hit: pluck({ layers: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 9 }], level: 0.3, bright: 8 }) },
    chip: { name: 'Chiptune (8 bits)', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.chip, o), hit: held(SPEC.chip) },
    organ: { name: 'Órgano', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.organ, o), hit: held(SPEC.organ) },
    choir: { name: 'Coro (voz "a")', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.choir, o), hit: held(SPEC.choir) },
    whistle: { name: 'Silbido', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.whistle, o), hit: held(SPEC.whistle) },
    acid: { name: 'Ácido 303', sustain: true, drive: 0.25, voice: (E, t, f, o) => layered(E, t, f, SPEC.acid, o),
      hit: pluck({ layers: [{ type: 'sawtooth' }], level: 0.24, bright: 9, q: 12, sweep: 0.5 }) },
    sub808: { name: '808 deslizante', sustain: true, drive: 0.3, voice: (E, t, f, o) => layered(E, t, f, SPEC.sub808, o), hit: hit808 },
    supersaw: { name: 'Supersaw (trance, hardstyle)', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.supersaw, o),
      hit: pluck({ layers: SAWS([-20, -8, 0, 8, 20], 1), level: 0.13, bright: 12, sweep: 0.6, maxDecay: 0.9 }) },
    pad: { name: 'Pad cálido (ambiental)', sustain: true, voice: (E, t, f, o) => layered(E, t, f, SPEC.pad, o), hit: held(SPEC.pad) },
    cowbell: { name: 'Cencerro phonk', sustain: false, drive: 0.35, hit: cowbell },
    bell: { name: 'Campana', sustain: false, hit: fm({ ratio: 3.5, index: 4, indexDecay: 1.2, decay: 2.2, level: 0.6 }) },
    epiano: { name: 'Piano eléctrico', sustain: false, hit: fm({ ratio: 1, index: 1.8, indexDecay: 0.5, decay: 1.5, level: 0.63, tine: 14 }) },
    pluck: { name: 'Pluck', sustain: false, hit: pluck({ layers: [{ type: 'sawtooth' }, { type: 'square', detune: 5 }], level: 0.32, bright: 14, sweep: 0.35, maxDecay: 0.45 }) },
    marimba: { name: 'Marimba', sustain: false, hit: marimba },
    piano: { name: 'Piano suave', sustain: false, hit: piano },
  };

  MS.INSTRUMENTS = INSTRUMENTS;
})(globalThis.MS = globalThis.MS || {});
