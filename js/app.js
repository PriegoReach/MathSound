// Aplicación: transporte (scheduler sobre el reloj de audio), dibujo e interfaz.
//
// Cómo suena una función:
//   el tiempo avanza en pulsos (beats) → cada pulso mueve el cursor `xPerBeat` unidades en x
//   → se evalúa y = f(x) → y se reparte en un rango de semitonos → frecuencia del sintetizador.
// La batería corre en paralelo sobre la misma línea de tiempo, en semicorcheas, y los acordes
// (js/chords.js) cambian cada compás o cada medio compás. En modo canción, cada vuelta pertenece a una
// sección (js/form.js) que decide qué capas suenan.
(function (MS) {
  'use strict';
  const { expr, gen, music, beats, CHORDS: CH, FORM } = MS;
  const $ = (id) => document.getElementById(id);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const setLabel = (id, text) => { $(id).querySelector('span').textContent = text; };

  // motor de audio y capa de acordes: al exportar a WAV se cambian un momento por unos sin altavoces
  let engine = new MS.Engine();
  const plot = new MS.Plot($('plot'));
  let chordLayer = new CH.ChordLayer(engine);
  const bank = new MS.SAMPLES.SampleBank(); // tus sonidos (js/samples.js)
  engine.samples = bank.slots;

  const state = {
    xMin: -8, xMax: 8, xPerBeat: 1,
    bpm: 110, swing: 0,
    fn: null, pattern: null, style: 'random',
    mode: 'glide', sub: 2,
    scale: 'Pentatónica menor', tonic: 9, octave: 0, range: 24, instrument: 'synth', kit: 'auto',
    arp: [0, 1, 2, 3],     // patrón del modo arpegio: índices de notas del acorde (ver music.chordTone)
    bass: true, bassMode: 'auto', beatTempo: true,
    humanize: false,      // pequeñas variaciones de tiempo y fuerza, como al tocar en vivo
    autoBuild: false,     // build-up y drop antes de cada cambio automático
    genre: 'random',  // género elegido para "Todo al azar" ('random' = uno distinto cada vez)
    songGenre: null,  // género de lo que suena ahora
    auto: '', autoEvery: 1, // qué cambia solo al empezar cada vuelta: '' | 'fn' | 'variation' | 'all'
    // acordes (ver js/chords.js): progresión, notas por acorde, voces, compases por acorde, sonido,
    // registro de las voces e intro en espiral al empezar desde el principio
    chords: false, chordProg: 'escalera', chordRich: 5, chordVoices: 9, chordBars: 1, chordInst: 'pad',
    chordVoicing: 'fijo', chordIntro: false,
    chordMel: true, // con acordes, la melodía cae en una nota del acorde en cada pulso
    form: 'loop', // estructura: 'loop' (todo suena siempre) o 'song' (intro, estrofa, drop… ver js/form.js)
    ghost: true, notes: true, bw: false,
  };

  // ======================= Transporte =======================
  const LOOKAHEAD = 0.15;   // segundos de audio que se programan por adelantado
  const DT = 0.008;         // resolución de la melodía continua (s)
  const sch = {
    playing: false, timer: null,
    anchorTime: 0, anchorBeat: 0, pausedBeat: 0, startBeat: 0,
    nextStep: 0, melT: 0,
    lastNote: null, lastNoteTime: -1, lastSlot: null,
    fnByPass: new Map(), startPass: 0,
    events: [], // eventos visuales (pasos de batería) ordenados por tiempo
    build: null, // build-up programado: { start, end, scheduled, intro } en pulsos; en `end` llega el drop
    chord: null, chordLog: [], // acorde que suena y los últimos cambios { b, chord } (para mostrarlos)
    chordFrom: null, // paso en el que empezó la progresión (al encender los acordes y en cada drop)
    melFrom: 0, // la melodía no suena antes de este instante (intro de los acordes)
    arr: FORM.arrangement(true), songStart: 0, // secciones de la canción y vuelta en la que empezó
    secKey: null, // sección cuya mezcla ya se aplicó
  };

  // Patrones del modo arpegio (índices de music.chordTone: 0 tónica, 1 tercera, 2 quinta, 3 octava…)
  const ARPS = [[0, 1, 2, 3], [0, 1, 2, 3, 2, 1], [3, 2, 1, 0], [0, 2, 1, 2, 3, 2, 1, 2], [0, 3, 2, 3, 1, 3, 2, 3], [0, 1, 2, 4, 3, 2]];

  // Humanizar: desfase al azar de hasta ±`sec` segundos y volumen entre 82 % y 112 %
  const hum = (sec) => (state.humanize ? (Math.random() * 2 - 1) * sec : 0);
  const humV = (v) => (state.humanize ? v * (0.82 + Math.random() * 0.3) : v);

  const beatsPerPass = () => (state.xMax - state.xMin) / state.xPerBeat;
  const beatAt = (t) => sch.anchorBeat + ((t - sch.anchorTime) * state.bpm) / 60;
  const timeAtBeat = (b) => sch.anchorTime + ((b - sch.anchorBeat) * 60) / state.bpm;
  const passOf = (b) => Math.floor(b / beatsPerPass() + 1e-9);
  const xOf = (b) => state.xMin + expr.mod(b, beatsPerPass()) * state.xPerBeat;

  // ======================= Estructura de canción =======================
  // Sección de la vuelta p (null en modo bucle, o antes de que empiece la canción)
  function sectionAt(p) {
    if (state.form !== 'song' || p < sch.songStart) return null;
    return FORM.sectionAt(sch.arr, p - sch.songStart, beatsPerPass());
  }

  // ¿Hay cambio automático al empezar la vuelta p? En modo canción, "todo" cambia al acabar la canción
  function changeAt(p) {
    if (!state.auto || p <= sch.startPass) return false;
    if (state.form === 'song' && state.auto === 'all') return p - sch.songStart >= FORM.totalPasses(sch.arr, beatsPerPass());
    return (p - sch.startPass) % state.autoEvery === 0;
  }

  // Capas que suenan en una sección; en el puente, con acordes, la melodía queda de fondo
  function mixOf(sec) {
    if (!sec) return FORM.FULL;
    return { ...sec, mel: state.chords && sec.melWithChords !== undefined ? sec.melWithChords : sec.mel };
  }

  // Al entrar en una sección, el motor cambia el volumen y el filtro de la melodía y los acordes
  function applySection(sec, t, sb) {
    const key = sec ? `${sch.songStart}:${sec.round}:${sec.index}:${state.chords}` : 'bucle';
    if (key === sch.secKey) return;
    sch.secKey = key;
    const end = sec ? (passOf(sb) - sec.offset + sec.passes) * beatsPerPass() : sb;
    engine.section(mixOf(sec), t, ((end - sb) * 60) / state.bpm);
  }

  // Bucle o canción. Al pasar a canción, empieza por la intro en la vuelta siguiente.
  function setForm(form) {
    state.form = form;
    sch.secKey = null;
    if (form === 'song') sch.songStart = sch.playing ? passOf(beatAt(engine.now)) + 1 : passOf(sch.pausedBeat);
    $('formSel').value = form;
  }

  // Función que suena en la vuelta p. Al entrar en una vuelta nueva se aplican los cambios automáticos.
  function fnForPass(p) {
    let fn = sch.fnByPass.get(p);
    if (fn) return fn;
    fn = state.fn;
    if (changeAt(p)) {
      const boundary = p * beatsPerPass();
      if (state.auto === 'all') fn = newSong(boundary);
      else if (state.auto === 'variation') { newBeatAndSound(boundary); fn = genreFunction(); }
      else fn = genreFunction();
      requestAnimationFrame(syncUI);
    }
    state.fn = fn;
    sch.fnByPass.set(p, fn);
    for (const k of sch.fnByPass.keys()) if (k < p - 4) sch.fnByPass.delete(k);
    return fn;
  }

  function scheduleStep(s, t, sb) {
    const fn = fnForPass(passOf(sb));
    const P = state.pattern;
    const i = s % 16;
    const stepDur = 60 / state.bpm / 4;

    const sec = sectionAt(passOf(sb));
    applySection(sec, t, sb);
    const mix = mixOf(sec);

    // el primer paso después de un build-up es el drop
    if (sch.build && sb >= sch.build.end - 1e-6) { engine.drop(t); sch.build = null; }
    const bu = buildFor(sb);
    const intro = !!bu?.intro; // intro de los acordes: solo suena la espiral

    if (bu) buildDrums(bu, sb, i, t, stepDur);
    else {
      for (const tr of beats.TRACKS) {
        const v = P.tracks[tr][i];
        if (!v || !mix.drums.includes(tr)) continue;
        const n = tr === 'hat' ? P.rolls[i] : 1; // redobles de hi-hat
        for (let k = 0; k < n; k++) engine.drum(tr, t + (k * stepDur) / n + hum(0.009), humV(v * (k ? 0.75 : 1)));
      }
    }

    const y = fn.f(xOf(sb));
    const m = Number.isFinite(y) ? music.yToMidi(y, fn, state) : null;
    const q = m === null ? null : music.quantize(m, state.tonic, state.scale);
    if (state.chords) scheduleChords(s, t, sb, m, q, bu);
    if (q !== null && !intro) {
      if (state.bass && !bu && mix.bass) scheduleBass(i, t, q, stepDur);
      const onSub = s % state.sub === 0;
      const tn = t + hum(0.005);
      if (state.mode === 'steps' && onSub) {
        engine.note(tn, music.mtof(melNote(q, sb, i % 4 === 0)), Math.max(0.18, stepDur * state.sub * 1.6), humV(0.8));
      } else if (state.mode === 'glide' && !engine.inst.sustain && onSub) {
        // un instrumento percusivo no puede sostener el tono: sigue la curva a golpes, sin ajustar a la escala
        engine.note(tn, music.mtof(m), Math.max(0.15, stepDur * state.sub * 1.4), humV(0.8));
      } else if (state.mode === 'pattern' && P.mel[i]) {
        let gap = 1; // la nota dura hasta la siguiente del patrón
        while (gap < 16 && !P.mel[(i + gap) % 16]) gap++;
        engine.note(tn, music.mtof(melNote(q, sb, i % 4 === 0)), Math.max(0.12, gap * stepDur * 0.95), humV(P.mel[i]));
      } else if (state.mode === 'arp' && onSub) {
        // arpegio: notas del acorde que suena (o, sin acordes, del acorde de la escala sobre la nota de
        // la función), a la altura que marca la función en ese momento
        const k = Math.floor(s / state.sub), idx = state.arp[k % state.arp.length];
        const n = state.chords && sch.chord ? CH.arpNote(sch.chord, q, idx) : music.chordTone(q, idx, state.tonic, state.scale);
        engine.note(tn, music.mtof(n), Math.max(0.1, stepDur * state.sub * 0.9), humV(i % 4 === 0 ? 0.85 : 0.68));
      }
    }
    const on = (tr) => !bu && mix.drums.includes(tr) && P.tracks[tr][i] > 0;
    sch.events.push({ t, step: i, kick: on('kick'), hit: on('snare') || on('clap') });
  }

  // ======================= Bajo =======================
  // Tipo de línea de bajo que suena: la del estilo del beat o la elegida a mano
  const bassModeNow = () => (state.bassMode === 'auto' ? state.pattern.bassMode : state.bassMode);

  // Pasos de la línea de bajo (null en modo 808, que sigue al bombo). Se crean una vez por beat y tipo.
  function bassSteps() {
    const P = state.pattern, mode = bassModeNow();
    if (mode === '808') return null;
    if (!P.bassLines[mode]) P.bassLines[mode] = beats.bassLine(mode);
    return P.bassLines[mode];
  }

  // En modo 808 el bajo toca en cada bombo; en los demás sigue su propia línea de 16 pasos.
  // Toca la nota de la función llevada al grave o, si suenan acordes, la fundamental del acorde.
  function scheduleBass(i, t, q, stepDur) {
    const P = state.pattern, mode = bassModeNow();
    const root = music.toBass(state.chords && sch.chord ? sch.chord.root : q, state.tonic);
    if (mode === '808') {
      if (!P.tracks.kick[i]) return;
      let gap = 1; // el bajo dura hasta el siguiente bombo (máx. 2 pulsos)
      while (gap < 8 && !P.tracks.kick[(i + gap) % 16]) gap++;
      engine.bass(t, music.mtof(root), gap * stepDur * 0.95);
      return;
    }
    const steps = bassSteps(), st = steps[i];
    if (!st) return;
    let gap = 1;
    while (gap < 16 && !steps[(i + gap) % 16]) gap++;
    const up = mode === 'acid' ? 12 : 0; // la 303 suena una octava por encima del 808
    const dur = mode === 'acid' ? stepDur * (steps[(i + 1) % 16]?.slide ? 1.1 : 0.75) // ligada: se encadena con la siguiente
      : mode === 'rolling' ? stepDur * 0.8
      : mode === 'log' ? stepDur * Math.min(gap, 3) * 0.95
      : stepDur * Math.min(gap, 2) * 0.85;
    engine.bassNote(mode, t + hum(0.004), music.mtof(root + up + (st.oct || 0)), dur, { ...st, v: humV(st.v) });
  }

  // ======================= Acordes =======================
  const chordSteps = () => Math.max(4, Math.round(state.chordBars * 16)); // semicorcheas por acorde
  const chordGain = () => 1.3 / Math.sqrt(state.chordVoices); // más voces, cada una más suave

  // Acorde número k de la progresión; en "la elige la función", el del grado de la nota q
  function chordFor(k, q) {
    const prog = CH.PROGRESSIONS[state.chordProg] || CH.PROGRESSIONS.escalera;
    let deg;
    if (prog.degrees) deg = prog.degrees[k % prog.degrees.length];
    else deg = q !== null ? CH.degreeOf(q, state) : sch.chord ? sch.chord.deg : 0;
    return CH.chordOf(deg, state.chordRich, state, !!prog.dominant);
  }

  function logChord(b, chord) {
    sch.chord = chord;
    sch.chordLog.push({ b, chord });
    if (sch.chordLog.length > 8) sch.chordLog.shift();
  }

  // En cada cambio de acorde las voces se deslizan a su nota nueva; con "siguen a la curva", también en
  // cada pulso. Durante un build-up suenan dos voces en espiral, y en el drop se abren en abanico.
  function scheduleChords(s, t, sb, m, q, bu) {
    const n = state.chordVoices, inst = state.chordInst, beatSec = 60 / state.bpm;
    if (bu) {
      if (!bu.spiral) {
        bu.spiral = true;
        const win = CH.register(state, n, state.chordRich, 'fijo');
        const center = Math.round((win.lo + win.hi) / 2);
        chordLayer.spiralStart(t, timeAtBeat(bu.end), sb, bu.end, center, Math.min(12, (win.hi - win.lo) / 2 + 2), inst, chordGain() * 1.8);
        logChord(sb, null);
      }
      return;
    }
    const per = chordSteps();
    const fan = !!chordLayer.spiral; // acaba de terminar una espiral: el drop empieza la progresión
    // al encender los acordes la progresión empieza en el compás que suena; en un drop, en el drop
    if (fan) sch.chordFrom = s;
    else if (sch.chordFrom === null || !chordLayer.on) sch.chordFrom = Math.floor(s / 16) * 16;
    const fresh = !chordLayer.on || chordLayer.voices.length !== n || chordLayer.inst !== inst;
    const change = (s - sch.chordFrom) % per === 0 || !sch.chord;
    const follow = state.chordVoicing === 'curva' && s % 4 === 0;
    if (!(fan || fresh || change || follow)) return;
    const chord = change || fan ? chordFor(Math.floor((s - sch.chordFrom) / per), q) : sch.chord;
    const win = CH.register(state, n, state.chordRich, state.chordVoicing, m);
    const notes = CH.voicing(chord, n, fan || fresh ? null : chordLayer.notes, win);
    if (fan) {
      const dur = Math.min(1.2, 2 * beatSec);
      chordLayer.fanOut(t, sb, notes, dur, dur / beatSec, inst, chordGain());
    } else if (fresh) chordLayer.start(t, sb, notes, inst, chordGain());
    else {
      // el deslizamiento dura menos que el acorde, así nunca se pisan dos
      const dur = change ? Math.min(0.5, beatSec, 0.3 * (per / 4) * beatSec) : Math.min(0.35, 0.45 * beatSec);
      chordLayer.glide(t, sb, notes, dur, dur / beatSec);
    }
    if (chord !== sch.chord) logChord(sb, chord);
    if (change) chordLayer.prune((passOf(sb) - 1) * beatsPerPass());
  }

  // Acorde que suena en el pulso b (el último cambio programado antes de b)
  function chordAtBeat(b) {
    for (let i = sch.chordLog.length - 1; i >= 0; i--) if (sch.chordLog[i].b <= b + 1e-6) return sch.chordLog[i].chord;
    return null;
  }

  // Nota que toca la melodía: la de la escala (q) o, si suenan acordes y es un pulso (`strong`), la nota
  // del acorde más cercana, para que la melodía no choque con la armonía
  function melNote(q, b, strong) {
    if (!(state.chords && state.chordMel && strong)) return q;
    const c = chordAtBeat(b);
    return c ? CH.snapToChord(q, c) : q;
  }

  // Activa o apaga los acordes; al apagarlos las voces se callan en el pulso `atBeat` (o ahora)
  function setChords(on, atBeat) {
    state.chords = on;
    $('chordsOn').checked = on;
    $('chordsSection').classList.toggle('is-off', !on);
    if (!on && sch.playing) {
      const b = atBeat ?? beatAt(engine.now);
      chordLayer.stop(timeAtBeat(b), b);
      sch.chord = null;
    }
    shownFn = null; // la gráfica cambia de escala para mostrar todas las voces
  }

  // Ajustes de acordes de un género: { p, inst, prog, rich, voices, bars, voicing, intro, vol }
  function pickChords(C) {
    engine.set('chordVol', between(C.vol || [0.45, 0.55]));
    state.chordProg = pick(C.prog);
    state.chordRich = pick(C.rich);
    state.chordVoices = pick(C.voices);
    state.chordBars = pick(C.bars);
    state.chordInst = pick(C.inst);
    state.chordVoicing = pick(C.voicing || ['fijo']);
    state.chordIntro = !!C.intro;
  }

  // ======================= Build-up y drop =======================
  // Devuelve el build-up que cubre el pulso b: el pedido con el botón o uno automático en los últimos
  // compases antes de la vuelta siguiente si esa vuelta trae un cambio automático (con "build-up antes de
  // cada cambio") o, en modo canción, si con ella empieza un drop.
  function buildFor(b) {
    if (sch.build && b >= sch.build.start - 1e-6 && b < sch.build.end - 1e-6) return sch.build;
    const bpp = beatsPerPass();
    const p = Math.floor(b / bpp + 1e-9) + 1; // la vuelta siguiente
    const B = p * bpp, L = Math.min(8, bpp / 2);
    if (b < B - L - 1e-6) return null;
    const next = sectionAt(p);
    const toDrop = !!next?.build && next.offset === 0 && sectionAt(p - 1)?.type !== next.type;
    if ((state.autoBuild && changeAt(p)) || toDrop) {
      if (!sch.build || sch.build.end !== B) sch.build = { start: B - L, end: B, scheduled: false };
      return sch.build;
    }
    return null;
  }

  // Durante el build-up la batería es un redoble de caja que se acelera y crece hasta el drop
  // (negras, corcheas, semicorcheas y fusas). La primera vez arranca el riser y el filtro.
  // En la intro de los acordes solo suena un riser suave bajo la espiral.
  function buildDrums(bu, sb, i, t, stepDur) {
    if (!bu.scheduled) {
      bu.scheduled = true;
      engine.buildUp(Math.max(engine.now, timeAtBeat(bu.start)), timeAtBeat(bu.end), bu.intro ? { filter: false, level: 0.2 } : undefined);
    }
    if (bu.intro) return;
    const p = Math.min(0.999, Math.max(0, (sb - bu.start) / (bu.end - bu.start)));
    const every = p < 0.25 ? 4 : p < 0.5 ? 2 : 1;
    if (i % every) return;
    const rolls = p >= 0.75 ? 2 : 1;
    for (let k = 0; k < rolls; k++) engine.drum('snare', t + (k * stepDur) / rolls, humV(0.3 + 0.6 * p));
    if (p < 0.5 && i % 4 === 0) engine.drum('kick', t, 0.8);
  }

  // Botón "Build-up y drop" (tecla D): dos compases de build-up desde el próximo compás
  function requestBuild() {
    if (!sch.playing) play();
    const b = beatAt(engine.now + LOOKAHEAD);
    let start = Math.ceil(b / 4 - 1e-9) * 4;
    if (start - b < 0.5) start += 4;
    sch.build = { start, end: start + 8, scheduled: false };
  }

  // Glissando: la frecuencia se calcula 2000 veces por segundo y se entrega como una curva,
  // así las funciones que oscilan muy rápido (senos anidados, fractales) suenan a FM.
  const CURVE_RATE = 2000;
  function scheduleGlide(t0, t1) {
    const n = Math.max(2, Math.ceil((t1 - t0) * CURVE_RATE) + 1);
    const freqs = new Float32Array(n);
    let f = sch.lastFreq || 220;
    for (let i = 0; i < n; i++) {
      const b = beatAt(t0 + ((t1 - t0) * i) / (n - 1));
      const fn = fnForPass(passOf(b));
      const y = fn.f(xOf(b));
      if (Number.isFinite(y)) f = music.mtof(music.yToMidi(y, fn, state)); // si no está definida, se queda la anterior
      freqs[i] = f;
    }
    sch.lastFreq = f;
    // si al empezar una vuelta cambió el instrumento o el modo, ya no hay glissando que alimentar
    // (crear aquí una voz la dejaría sonando para siempre)
    if (state.mode === 'glide' && engine.inst.sustain) engine.glideCurve(t0, freqs, t1 - t0);
  }

  function scheduleMelody(t) {
    if (state.mode !== 'harp') return;
    const b = beatAt(t);
    const fn = fnForPass(passOf(b));
    const y = fn.f(xOf(b));
    if (!Number.isFinite(y)) return;
    const m = music.yToMidi(y, fn, state);

    // Modo escala: nota nueva cada vez que la nota cuantizada cambia,
    // y si se queda quieta, se repite en cada corchea.
    const q = music.quantize(m, state.tonic, state.scale);
    const slot = Math.floor(b * 2);
    const newSlot = slot !== sch.lastSlot;
    sch.lastSlot = slot;
    const changed = q !== sch.lastNote;
    const since = t - sch.lastNoteTime;
    if ((changed && since > 0.04) || (newSlot && !changed && since > (30 / state.bpm) * 0.9)) {
      engine.note(t, music.mtof(melNote(q, b, b - Math.floor(b) < 0.15)), Math.min(0.9, 60 / state.bpm), 0.75);
      sch.lastNote = q;
      sch.lastNoteTime = t;
    }
  }

  function tick() {
    engine.sweep(); // libera los nodos de las notas que ya terminaron
    const now = engine.now;
    // en segundo plano el navegador frena los timers: programamos más adelante
    scheduleUntil(now + (document.hidden ? 1.5 : LOOKAHEAD), now);
  }

  // Programa los pasos y la melodía que suenan antes de `horizon` (segundos del reloj de audio)
  function scheduleUntil(horizon, now) {
    // tope de pasos por llamada: con un tempo inválido nunca debe colgar la página
    for (let guard = 0; guard < 64; guard++) {
      const s = sch.nextStep;
      const sb = s / 4 + (s % 2 ? state.swing / 4 : 0);
      const t = timeAtBeat(sb);
      if (!Number.isFinite(t) || t >= horizon) break;
      sch.nextStep++;
      if (t >= now - 0.01) scheduleStep(s, t, sb);
    }
    if (sch.melT < now) sch.melT = now;
    if (sch.melT < sch.melFrom) sch.melT = Math.min(horizon, sch.melFrom); // intro de los acordes
    if (state.mode === 'glide' && engine.inst.sustain) {
      if (horizon - sch.melT > 0.005) { scheduleGlide(sch.melT, horizon); sch.melT = horizon; }
    } else {
      while (sch.melT < horizon) { scheduleMelody(sch.melT); sch.melT += DT; }
    }
  }

  // Deja el transporte listo para que el pulso `fromBeat` suene en el instante `at`
  function resetTransport(fromBeat, at) {
    sch.anchorTime = at;
    sch.anchorBeat = sch.startBeat = fromBeat;
    sch.nextStep = Math.ceil(fromBeat * 4 - 1e-9);
    sch.melT = at;
    sch.startPass = passOf(fromBeat);
    sch.fnByPass.clear();
    sch.fnByPass.set(sch.startPass, state.fn);
    sch.lastNote = sch.lastSlot = null;
    sch.events = [];
    sch.build = null;
    sch.chord = null;
    sch.chordLog = [];
    sch.chordFrom = null;
    sch.melFrom = 0;
    sch.secKey = null;
    if (fromBeat === 0) { chordLayer.clear(); sch.songStart = 0; } // la canción vuelve a la intro
    // intro de los acordes: dos compases de espiral sin batería ni melodía y, en el drop, el primer acorde
    if (state.chords && state.chordIntro && fromBeat === 0) {
      sch.build = { start: 0, end: 8, scheduled: false, intro: true };
      sch.melFrom = timeAtBeat(8);
    }
  }

  function play() {
    engine.ensure();
    resetTransport(sch.pausedBeat, engine.now + 0.08);
    sch.playing = true;
    tick();
    sch.timer = setInterval(tick, 25);
    setPlayButton(true);
  }

  function setPlayButton(playing) {
    $('btnPlay').classList.toggle('is-playing', playing);
    setLabel('btnPlay', playing ? 'Pausar' : 'Reproducir');
  }

  function pause() {
    if (!sch.playing) return;
    sch.pausedBeat = Math.max(sch.startBeat, beatAt(engine.now));
    sch.playing = false;
    clearInterval(sch.timer);
    engine.stopGlide();
    engine.cancelBuild(); // si había un build-up a medias, el mix vuelve a sonar entero
    sch.build = null;
    chordLayer.stop(engine.now, sch.pausedBeat);
    sch.chord = null;
    setPlayButton(false);
  }

  const togglePlay = () => (sch.playing ? pause() : play());

  function restart() {
    const was = sch.playing;
    pause();
    sch.pausedBeat = 0;
    if (was) play();
  }

  // Cambia el tempo sin saltos: la línea de tiempo se re-ancla, con el tempo anterior, en `atBeat`
  // (un cambio automático entra justo al empezar la vuelta) o, si no se indica, en el instante actual.
  function setTempo(bpm, atBeat) {
    if (sch.playing) {
      const b = atBeat ?? Math.max(beatAt(engine.now), sch.startBeat);
      sch.anchorTime = timeAtBeat(b);
      sch.anchorBeat = b;
    }
    state.bpm = bpm;
    engine.set('bpm', bpm);
    $('bpm').value = bpm;
    $('bpmOut').textContent = bpm + ' bpm';
  }

  function setSwing(v) {
    state.swing = v;
    $('swing').value = v;
    $('swingOut').textContent = Math.round(v * 100) + '%';
  }

  // ======================= Funciones y beats =======================
  function setFunction(fn) {
    state.fn = fn;
    if (sch.playing) for (const k of sch.fnByPass.keys()) sch.fnByPass.set(k, fn);
    $('fxError').textContent = '';
    $('fxInput').classList.remove('bad');
  }

  // Tecla F: función nueva con beat y sonido nuevos, sin salir del género
  function randomFn() {
    newBeatAndSound();
    setFunction(genreFunction());
    $('presetSel').value = '';
    syncUI();
  }

  function applyTyped() {
    const input = $('fxInput');
    try {
      const fn = expr.makeFunction(expr.parse(input.value), { name: 'Personalizada' }, state.xMin, state.xMax);
      if (fn.finiteRatio < 0.05) throw new Error('La función no tiene valores finitos en este rango de x');
      fn.hue = Math.floor(Math.random() * 360);
      setFunction(fn);
      shownFn = null; // forzar redibujo aunque esté en pausa
      input.blur();
    } catch (err) {
      $('fxError').textContent = err.message;
      input.classList.add('bad');
    }
  }

  // Recalcula el rango de y (y por tanto el mapeo a notas) al cambiar la ventana de x
  function refit() {
    const old = state.fn;
    const fn = expr.makeFunction(old.ast, { name: old.name }, state.xMin, state.xMax);
    fn.hue = old.hue;
    setFunction(fn);
    shownFn = null;
    restart();
  }

  // ======================= Géneros y variedad =======================
  const genreOf = () => MS.GENRES[state.songGenre] || null;
  const between = ([a, b]) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
  // elige al azar evitando repetir lo que ya está sonando
  const pickNot = (arr, avoid) => { const rest = arr.filter((v) => v !== avoid); return pick(rest.length ? rest : arr); };

  // Función nueva con las familias del género que suena
  function genreFunction() {
    const G = genreOf();
    return gen.randomFunction(state.xMin, state.xMax, G ? { families: G.families, classics: G.classics } : { classics: 0.15 });
  }

  // Beat, instrumento y modo nuevos dentro del mismo género (escala y tónica se mantienen).
  // `atBeat`: pulso en el que entra el cambio (al empezar una vuelta); si no, ahora.
  function newBeatAndSound(atBeat) {
    const G = genreOf();
    const at = atBeat != null && sch.playing ? timeAtBeat(atBeat) : undefined;
    if (G) state.style = pick(G.styles);
    setInstrument(pickNot(G ? G.inst : Object.keys(MS.INSTRUMENTS), state.instrument), at);
    setMode(G ? pick(G.modes) : pick(['glide', 'harp', 'steps', 'pattern', 'arp']), at);
    state.arp = pick(ARPS);
    if (state.chords && G?.chords) { // los acordes también cambian de sonido y de progresión
      state.chordInst = pickNot(G.chords.inst, state.chordInst);
      state.chordProg = pick(G.chords.prog);
    }
    newBeat(atBeat);
  }

  // Canción nueva: otro género (si se eligió "al azar", distinto del anterior), escala, efectos,
  // beat, sonido y función. Devuelve la función.
  function newSong(atBeat) {
    state.songGenre = state.genre === 'random' ? pickNot(Object.keys(MS.GENRES), state.songGenre) : state.genre;
    const G = genreOf();
    state.scale = pick(G.scales);
    state.tonic = Math.floor(Math.random() * 12);
    state.range = pick(G.range);
    state.octave = pick(G.octave);
    state.sub = pick(G.sub || [1, 2, 2]);
    engine.set('drive', between(G.drive));
    engine.set('reverb', between(G.reverb));
    engine.set('delay', between(G.delay));
    // acordes: cada género los usa con cierta probabilidad (p) y con sus propios ajustes
    const withChords = !!G.chords && Math.random() < G.chords.p;
    if (withChords) pickChords(G.chords);
    else state.chordIntro = false;
    setChords(withChords, atBeat);
    sch.chord = sch.chordFrom = null; // la progresión de la canción nueva empieza por su primer acorde
    // la estructura de la canción nueva empieza por la intro (con drops si es un género de club)
    sch.arr = FORM.arrangement(G.drops !== false);
    sch.songStart = passOf(atBeat ?? (sch.playing ? beatAt(engine.now) : sch.pausedBeat));
    newBeatAndSound(atBeat);
    return genreFunction();
  }

  function newBeat(atBeat, style = state.style) {
    state.pattern = beats.randomBeat(style);
    if (state.beatTempo) {
      setTempo(state.pattern.bpm, atBeat);
      setSwing(state.pattern.swing);
    }
    applyKit();
  }

  // Kit de batería y línea de bajo: los que elige el estilo del beat, salvo que se haya fijado otro
  const kitKey = () => (state.kit === 'auto' ? state.pattern.kit : state.kit);
  function applyKit() {
    engine.setKit(kitKey());
    engine.setBassMode(bassModeNow());
    $('kitSel').options[0].textContent = `Kit del estilo (${MS.KITS[state.pattern.kit].name})`;
    $('bassSel').options[0].textContent = `Bajo del estilo (${beats.BASS_MODES[state.pattern.bassMode]})`;
    renderGrid();
  }

  // `at`: momento (reloj de audio) en que se corta el glissando anterior; si no, ahora
  function setMode(mode, at) {
    state.mode = mode;
    if (mode !== 'glide') engine.stopGlide(at);
    sch.lastNote = null;
    $('mode').value = mode;
    updateModeUI();
  }

  function setInstrument(key, at) {
    state.instrument = key;
    engine.setInstrument(key, at);
    $('instrument').value = key;
    updateModeUI();
  }

  // La subdivisión importa en los modos pasos y arpegio, y en glissando si el instrumento es
  // percusivo; la fila "Melodía" del secuenciador solo se usa en modo ritmo.
  function updateModeUI() {
    $('subWrap').hidden = !(state.mode === 'steps' || state.mode === 'arp' || (state.mode === 'glide' && !engine.inst.sustain));
    if (melRow) melRow.hidden = state.mode !== 'pattern';
  }

  // Tecla A: canción nueva (género, beat, sonido, escala, efectos y función)
  function randomAll() {
    setFunction(newSong());
    $('presetSel').value = '';
    syncUI();
  }

  // ======================= Secuenciador (UI) =======================
  const cellMap = {};
  const nameEls = {};
  const cellsByCol = [];
  let nowCol = -1, melRow = null, bassRow = null;
  const rowEls = {};
  const ROWS = [...beats.TRACKS, 'bass', 'mel']; // tras la batería: la línea de bajo y el ritmo de la melodía
  const ROW_NAMES = { bass: 'Bajo', mel: 'Melodía' };

  function buildGrid() {
    const grid = $('grid');
    for (const tr of ROWS) {
      const row = document.createElement('div');
      row.className = 'track';
      row.dataset.tr = tr;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = ROW_NAMES[tr] || beats.LABELS[tr];
      nameEls[tr] = name;
      row.append(name);
      cellMap[tr] = [];
      for (let i = 0; i < 16; i++) {
        const c = document.createElement('button');
        c.className = 'cell' + (i % 4 === 0 ? ' beat-start' : '');
        c.addEventListener('click', () => toggleCell(tr, i));
        row.append(c);
        cellMap[tr][i] = c;
        (cellsByCol[i] = cellsByCol[i] || []).push(c);
      }
      grid.append(row);
      rowEls[tr] = row;
      if (tr === 'mel') melRow = row;
      if (tr === 'bass') bassRow = row;
    }
  }

  function renderGrid() {
    const P = state.pattern;
    const names = MS.KITS[kitKey()].names || {};
    const bass = bassSteps(); // null en modo 808: el bajo sigue al bombo y la fila se oculta
    for (const tr of ROWS) {
      const vals = tr === 'mel' ? P.mel
        : tr === 'bass' ? (bass || []).map((st) => (st ? (st.accent ? 1 : st.v) : 0))
        : P.tracks[tr];
      for (let i = 0; i < 16; i++) {
        const c = cellMap[tr][i], v = vals[i] || 0;
        c.classList.toggle('on', v > 0);
        c.style.opacity = v > 0 ? 0.45 + 0.55 * v : '';
        c.textContent = tr === 'hat' && v > 0 && P.rolls[i] > 1 ? '×' + P.rolls[i]
          : tr === 'bass' && bass?.[i]?.slide ? '↗' : ''; // ↗: nota ligada que se desliza
      }
      if (!ROW_NAMES[tr]) nameEls[tr].textContent = names[tr] || beats.LABELS[tr];
    }
    if (bassRow) bassRow.hidden = !bass;
    $('beatName').textContent = P.name;
    updateModeUI();
  }

  function toggleCell(tr, i) {
    const P = state.pattern;
    if (tr === 'mel') P.mel[i] = P.mel[i] > 0 ? 0 : 0.85;
    else if (tr === 'bass') {
      const steps = bassSteps();
      if (steps) steps[i] = steps[i] ? null : { v: 0.8, accent: false, slide: false, oct: 0 };
    } else P.tracks[tr][i] = P.tracks[tr][i] > 0 ? 0 : tr === 'hat' || tr === 'open' ? 0.5 : 0.9;
    if (tr === 'hat') P.rolls[i] = 1;
    renderGrid();
  }

  function highlightCol(i) {
    if (i === nowCol) return;
    if (nowCol >= 0) cellsByCol[nowCol].forEach((c) => c.classList.remove('now'));
    cellsByCol[i].forEach((c) => c.classList.add('now'));
    nowCol = i;
  }

  // ======================= Dibujo =======================
  let shownFn = null, pulse = 0, lastReadout = '', lastBuilding = false, lastChord = null;
  const ro = { x: $('roX'), y: $('roY'), note: $('roNote'), hz: $('roHz'), chord: $('roChord') };
  const minus = (s) => s.replace('-', '−');

  // Alturas (en y) que ocupan las voces de los acordes, para que la gráfica las muestre todas
  function chordExtent(fn) {
    if (!state.chords) return null;
    const win = CH.register(state, state.chordVoices, state.chordRich, 'fijo');
    let hi = win.hi + 1;
    if (state.chordVoicing === 'curva') {
      hi = Math.max(hi, Math.min(97, 60 + state.tonic + 12 * state.octave + state.range * 0.6 + (win.hi - win.lo) / 2 + 1));
    }
    return [music.midiToY(win.bass - 14, fn, state), music.midiToY(hi, fn, state)];
  }

  function showFunction(fn) {
    shownFn = fn;
    plot.setFunction(fn, state.xMin, state.xMax, chordExtent(fn));
    const el = $('formula');
    if (window.katex) {
      el.classList.remove('plain');
      window.katex.render('y = ' + fn.latex, el, { displayMode: true, throwOnError: false });
    } else { // sin internet: texto plano
      el.classList.add('plain');
      el.textContent = 'y = ' + fn.text;
    }
    fitFormula();
    $('fname').textContent = fn.name;
    if (document.activeElement !== $('fxInput')) $('fxInput').value = fn.text;
  }

  // Reduce el tamaño de la fórmula si no cabe a lo ancho de la hoja
  function fitFormula() {
    const el = $('formula');
    el.style.fontSize = '';
    const ratio = el.clientWidth / el.scrollWidth;
    if (ratio < 1) el.style.fontSize = Math.max(11, parseFloat(getComputedStyle(el).fontSize) * ratio * 0.98) + 'px';
  }

  // Estructura: las secciones de la canción bajo la gráfica, con la que suena marcada, y las pistas que
  // la sección deja calladas atenuadas en el secuenciador
  let formShown = {};
  function showForm(sec) {
    const strip = $('formStrip');
    if (formShown.form !== state.form || formShown.arr !== sch.arr) {
      strip.hidden = state.form !== 'song';
      strip.replaceChildren(...sch.arr.map((s) => {
        const li = document.createElement('li');
        li.textContent = FORM.SECTIONS[s.type].name;
        return li;
      }));
      formShown = { form: state.form, arr: sch.arr, index: -2, mute: null };
    }
    const index = sec ? sec.index : -1;
    if (index !== formShown.index) {
      [...strip.children].forEach((li, i) => li.classList.toggle('now', i === index));
      formShown.index = index;
    }
    const mix = mixOf(sec), on = engine.audible; // calladas por la sección o silenciadas con M / S
    const muted = ROWS.filter((tr) => (tr === 'bass' ? !mix.bass || !on.bass : tr === 'mel' ? !mix.mel || !on.mel
      : !mix.drums.includes(tr) || !on.drums));
    const mute = muted.join();
    if (mute !== formShown.mute) {
      for (const tr of ROWS) rowEls[tr].classList.toggle('is-muted', muted.includes(tr));
      formShown.mute = mute;
    }
  }

  // Notas de la escala para la pauta de la gráfica (se recalculan solo si cambia algo)
  let ladder = { key: '' };
  function scaleLines(fn) {
    const key = [state.scale, state.tonic, state.octave, state.range].join('|');
    if (ladder.fn !== fn || ladder.key !== key) ladder = { fn, key, lines: music.scaleNotes(fn, state) };
    return ladder.lines;
  }

  function frame() {
    requestAnimationFrame(frame);
    let b, fn;
    if (sch.playing) {
      const ctx = engine.ctx;
      const vt = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
      while (sch.events.length && sch.events[0].t <= vt) {
        const e = sch.events.shift();
        highlightCol(e.step);
        if (e.kick) pulse = 1;
        else if (e.hit) pulse = Math.max(pulse, 0.6);
      }
      b = Math.max(sch.startBeat, beatAt(vt));
      fn = sch.fnByPass.get(passOf(b)) || state.fn;
    } else {
      b = sch.pausedBeat;
      fn = state.fn;
    }
    if (fn !== shownFn) showFunction(fn);
    pulse *= 0.86;

    showForm(sectionAt(passOf(b)));

    // el botón de build-up se marca mientras suena uno
    const building = !!(sch.playing && sch.build && b >= sch.build.start && b < sch.build.end);
    if (building !== lastBuilding) { $('btnDrop').classList.toggle('is-building', building); lastBuilding = building; }

    const atStart = !sch.playing && sch.pausedBeat === 0;
    const x = atStart ? state.xMin : xOf(b);
    const y = fn.f(x);
    let label = '', noteNow = null;
    if (Number.isFinite(y)) {
      const m = music.yToMidi(y, fn, state);
      const heard = state.mode === 'glide' ? m : music.quantize(m, state.tonic, state.scale); // lo que suena de verdad
      noteNow = Math.round(heard); // en glissando solo se marca la pauta al pasar por una nota de la escala
      label = music.noteName(heard);
      const hz = music.mtof(heard).toFixed(1);
      const txt = `${x.toFixed(2)}|${y.toFixed(3)}|${label}|${hz}`;
      if (txt !== lastReadout) {
        lastReadout = txt;
        ro.x.textContent = minus(x.toFixed(2));
        ro.y.textContent = minus(y.toFixed(3));
        ro.note.textContent = label;
        ro.hz.textContent = hz + ' Hz';
      }
    }

    // acorde que suena (el último cambio que ya se oye)
    let chord = '';
    if (state.chords) {
      chord = '–';
      for (const c of sch.chordLog) if (c.b <= b + 1e-6) chord = c.chord ? c.chord.name : 'espiral';
    }
    if (chord !== lastChord) {
      lastChord = chord;
      ro.chord.textContent = chord;
      ro.chord.parentElement.hidden = !chord;
    }

    // voces de los acordes: desde el principio de la vuelta hasta el cursor, como la curva
    const passStart = passOf(b) * beatsPerPass();
    const voices = state.chords && !atStart ? {
      lines: chordLayer.lines, from: passStart, now: b, at: CH.lineAt, trace: CH.trace,
      spiral: chordLayer.spiralAt(b),
      xOf: (bb) => state.xMin + (bb - passStart) * state.xPerBeat,
      yOf: (p) => music.midiToY(p, fn, state),
    } : null;

    plot.draw({
      progressX: atStart ? state.xMax : x,
      dotX: x,
      pulse,
      label,
      hue: fn.hue ?? 220,
      ghost: state.ghost,
      xPerBeat: state.xPerBeat,
      notes: state.notes ? scaleLines(fn) : null,
      noteNow,
      voices,
    });
  }

  // ======================= Grabación =======================
  let rec = null;
  function toggleRec() {
    if (rec) { rec.stop(); return; }
    if (!window.MediaRecorder) { alert('Tu navegador no permite grabar audio.'); return; }
    engine.ensure();
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find((t) => MediaRecorder.isTypeSupported(t));
    const chunks = [];
    const r = new MediaRecorder(engine.recDest.stream, mime ? { mimeType: mime } : undefined);
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mathsound-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      rec = null;
      setLabel('btnRec', 'Grabar');
      $('btnRec').classList.remove('is-recording');
    };
    r.start();
    rec = r;
    setLabel('btnRec', 'Detener y descargar');
    $('btnRec').classList.add('is-recording');
    if (!sch.playing) play();
  }

  // ======================= Guardar, compartir y exportar =======================
  // Lo que define una canción (la vista no: líneas, blanco y negro…)
  const SONG_KEYS = ['xMin', 'xMax', 'xPerBeat', 'bpm', 'swing', 'style', 'mode', 'sub', 'scale', 'tonic', 'octave', 'range',
    'instrument', 'kit', 'arp', 'bass', 'bassMode', 'beatTempo', 'humanize', 'songGenre', 'chords', 'chordProg', 'chordRich',
    'chordVoices', 'chordBars', 'chordInst', 'chordVoicing', 'chordIntro', 'chordMel', 'form'];

  function songData() {
    return {
      app: 'MathSound', v: MS.SONG.VERSION,
      fn: { text: state.fn.text, name: state.fn.name, hue: state.fn.hue },
      state: Object.fromEntries(SONG_KEYS.map((k) => [k, state[k]])),
      mix: Object.fromEntries(SLIDERS.map((k) => [k, engine.p[k]])),
      pattern: state.pattern,
      arr: sch.arr,
    };
  }

  // Carga una canción guardada (archivo o enlace). Los datos vienen de fuera: se comprueban y lo que no
  // es válido se ignora; si la función no se puede leer, no se cambia nada.
  function applySong(d) {
    if (!d || d.app !== 'MathSound' || typeof d.fn?.text !== 'string' || d.fn.text.length > 2000) throw new Error('No es una canción de MathSound');
    const st = MS.SONG.cleanState(d.state);
    const xMin = st.xMin ?? state.xMin, xMax = st.xMax ?? state.xMax;
    const fn = expr.makeFunction(expr.parse(d.fn.text), { name: typeof d.fn.name === 'string' ? d.fn.name.slice(0, 80) : 'Canción guardada' }, xMin, xMax);
    fn.hue = Number.isFinite(d.fn.hue) ? d.fn.hue : Math.floor(Math.random() * 360);
    const was = sch.playing;
    if (was) pause();
    Object.assign(state, st);
    const mix = MS.SONG.cleanMix(d.mix, SLIDERS);
    for (const k of Object.keys(mix)) engine.set(k, mix[k]);
    const P = MS.SONG.cleanPattern(d.pattern);
    state.pattern = P || beats.randomBeat(state.style);
    if (!P) state.bpm = st.bpm ?? state.pattern.bpm;
    sch.arr = MS.SONG.cleanArrangement(d.arr) || FORM.arrangement(genreOf()?.drops !== false);
    setTempo(state.bpm);
    setSwing(state.swing);
    setInstrument(state.instrument);
    setMode(state.mode);
    setChords(state.chords);
    applyKit();
    setFunction(fn);
    sch.pausedBeat = 0;
    setForm(state.form);
    shownFn = null;
    $('presetSel').value = '';
    syncUI();
    if (was) play();
  }

  const songMsg = (text) => { $('songMsg').textContent = text; };
  // Motivo de un error para el usuario: los nuestros ya vienen en español; los del navegador (JSON roto,
  // datos comprimidos dañados…) llegan en inglés y se resumen
  const why = (err) => (err?.constructor === Error ? err.message : 'el contenido está dañado o incompleto');

  function saveSong() {
    const blob = new Blob([JSON.stringify(songData(), null, 1)], { type: 'application/json' });
    MS.SONG.download(blob, MS.SONG.fileName(state.songGenre, 'json'));
    songMsg('Canción guardada en tus descargas.');
  }

  async function openSong(file) {
    try {
      if (file.size > MS.SONG.MAX_BYTES) throw new Error('El archivo es demasiado grande');
      applySong(JSON.parse(await file.text()));
      songMsg(`Abierta: ${file.name}`);
    } catch (err) {
      songMsg('No se pudo abrir: ' + why(err) + '.');
    }
  }

  // Enlace con la canción después de "#": al abrirlo, se carga sola
  async function copyLink() {
    const url = location.href.split('#')[0] + '#' + (await MS.SONG.toHash(songData()));
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      songMsg('Enlace copiado. Abre esta canción en esta copia de MathSound (o donde la publiques).');
    } catch {
      songMsg('El enlace con la canción está en la barra de direcciones: cópialo desde ahí.');
    }
  }

  async function loadHash() {
    if (!/^#[cz]=/.test(location.hash)) return;
    try {
      applySong(await MS.SONG.fromHash(location.hash));
      songMsg('Canción cargada desde el enlace.');
    } catch (err) {
      songMsg('El enlace no tiene una canción válida: ' + why(err) + '.');
    }
  }

  // Exportar a WAV: la canción se calcula sin altavoces (OfflineAudioContext), con el mismo programador
  // de pasos que al reproducir. En modo canción, la estructura entera; en bucle, unos 45 s con fundido.
  // Durante el cálculo no hay cambios automáticos: suena la canción que está puesta.
  // Como al reproducir, se programa poco a poco: el cálculo se detiene cada segundo (suspend), se programa
  // el tramo siguiente y se sueltan los nodos que ya sonaron. Programarlo todo de golpe dejaba miles de
  // nodos conectados desde el principio y el cálculo iba muy lento.
  let exporting = false;
  async function exportWav() {
    if (exporting) return;
    exporting = true;
    pause();
    setLabel('btnWav', 'Calculando…');
    $('btnWav').disabled = true;
    const SR = 44100, START = 0.1, TAIL = 3, AHEAD = 1.5, bpp = beatsPerPass(), passSec = (bpp * 60) / state.bpm;
    const song = state.form === 'song';
    const passes = song ? FORM.totalPasses(sch.arr, bpp) : Math.max(2, Math.min(16, Math.ceil(45 / passSec)));
    const length = Math.min(300, passes * passSec); // segundos de música (máximo 5 minutos)
    const end = START + length;
    const off = new OfflineAudioContext(2, Math.ceil(SR * (end + TAIL)), SR);
    const E = new MS.Engine();
    E.p = { ...engine.p };
    E.instrument = state.instrument;
    E.ensure(off);
    E.setKit(kitKey());
    E.setBassMode(bassModeNow());
    E.samples = engine.samples;
    for (const [p, on] of Object.entries(engine.audible)) E.setAudible(p, on); // lo silenciado tampoco sale en el WAV
    E.useSamples = engine.useSamples;
    E.setInstrument(state.instrument);

    // El programador usa `engine`, `chordLayer` y `sch`: en cada tramo se cambian por los de la exportación
    // y luego se devuelven, así lo que suene en vivo mientras tanto no se mezcla con lo exportado.
    const X = { engine: E, chordLayer: new CH.ChordLayer(E), sch: null };
    const copy = () => ({ ...sch, fnByPass: new Map(sch.fnByPass) });
    let done = START;
    const chunk = () => {
      const live = { engine, chordLayer, sch: copy(), auto: state.auto };
      try {
        engine = X.engine;
        chordLayer = X.chordLayer;
        state.auto = '';
        if (X.sch) Object.assign(sch, X.sch); else resetTransport(0, START);
        const to = Math.min(end, Math.max(done, E.now) + AHEAD);
        scheduleUntil(to, E.now);
        done = to;
        engine.sweep(); // suelta los nodos que ya sonaron
        if (to >= end && !X.ended) {
          X.ended = true;
          engine.stopGlide(end);
          chordLayer.stop(end, passes * bpp);
          if (!song) { // fundido final del bucle
            E.master.gain.setValueAtTime(0.9, Math.max(START, end - 2.5));
            E.master.gain.linearRampToValueAtTime(0, end);
          }
        }
        X.sch = copy();
      } finally {
        engine = live.engine;
        chordLayer = live.chordLayer;
        Object.assign(sch, live.sch);
        state.auto = live.auto;
      }
    };
    chunk();
    for (let t = START + 0.5; t < end; t += 1) {
      off.suspend(t).then(() => {
        try { chunk(); } finally { off.resume(); }
      });
    }
    try {
      const buf = await off.startRendering();
      MS.SONG.download(MS.SONG.wavBlob(buf), MS.SONG.fileName(state.songGenre, 'wav'));
      songMsg(`WAV exportado: ${Math.round(buf.duration)} s.`);
    } catch (err) {
      songMsg('No se pudo exportar: ' + why(err) + '.');
    } finally {
      exporting = false;
      setLabel('btnWav', 'Exportar WAV');
      $('btnWav').disabled = false;
    }
  }

  // ======================= Partes: silenciar y solo =======================
  // M silencia una parte; S deja sonar solo las partes marcadas con S (si hay alguna, las M no cuentan)
  const PARTS = ['drums', 'bass', 'mel', 'chords'];
  const parts = { mute: {}, solo: {} };

  function applyParts() {
    const anySolo = PARTS.some((p) => parts.solo[p]);
    for (const p of PARTS) {
      const on = anySolo ? !!parts.solo[p] : !parts.mute[p];
      engine.setAudible(p, on);
      const el = document.querySelector(`.part[data-part="${p}"]`);
      el.classList.toggle('is-silent', !on);
      for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', String(!!parts[b.dataset.act][p]));
    }
  }

  // ======================= Tus sonidos =======================
  const samplesMsg = (text) => { $('samplesMsg').textContent = text; };
  let pickSlot = null; // hueco al que va el archivo elegido con "Cargar"

  // El instrumento "sampler" solo existe mientras hay un sonido de melodía
  function updateSampler() {
    if (bank.slots.mel) MS.INSTRUMENTS.sampler = MS.SAMPLES.SAMPLER;
    else delete MS.INSTRUMENTS.sampler;
    fillInstruments($('instrument'));
    if (state.instrument === 'sampler' && !bank.slots.mel) setInstrument('synth');
    $('instrument').value = state.instrument;
  }

  async function loadSample(slot, file) {
    try {
      const S = await bank.load(slot, file);
      const label = MS.SAMPLES.SLOTS.find(([k]) => k === slot)[1];
      samplesMsg(`${label}: ${file.name}` + (slot === 'mel' ? ` (nota base ${music.noteName(S.root)}; elige "Tu sonido" en Instrumento)` : '')
        + (bank.saved ? '' : '. Este navegador no deja guardarlo: se perderá al cerrar la página.'));
    } catch (err) {
      samplesMsg(`No se pudo cargar ${file.name}: ${err.message}.`);
    }
    updateSampler();
    renderSamples();
  }

  async function removeSample(slot) {
    await bank.remove(slot);
    updateSampler();
    renderSamples();
  }

  function previewSample(slot) {
    const S = bank.slots[slot];
    if (!S) return;
    engine.ensure();
    engine.sample(S, engine.now + 0.03, 0.85, slot === 'mel' ? engine.melIn : engine.drumIn);
  }

  // Una fila por hueco: nombre, archivo, escuchar, nota base (melodía), quitar y cargar.
  // Cada fila acepta un archivo arrastrado encima.
  function renderSamples() {
    const button = (text, fn, label) => {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = text;
      if (label) { b.title = label; b.setAttribute('aria-label', label); }
      b.addEventListener('click', fn);
      return b;
    };
    $('samplesList').replaceChildren(...MS.SAMPLES.SLOTS.map(([slot, label]) => {
      const S = bank.slots[slot];
      const row = document.createElement('div');
      row.className = 'sample-row' + (S ? ' loaded' : '');
      const name = document.createElement('span');
      name.className = 'sample-name';
      name.textContent = label;
      const file = document.createElement('span');
      file.className = 'sample-file';
      file.textContent = S ? S.name : slot === 'mel' ? 'sin sonido' : 'el del kit';
      file.title = S ? S.name : '';
      row.append(name, file);
      if (S) {
        row.append(button('▶', () => previewSample(slot), 'Escuchar ' + label.toLowerCase()));
        if (slot === 'mel') {
          const sel = document.createElement('select');
          sel.setAttribute('aria-label', 'Nota base del sonido');
          sel.title = 'Nota base: la que suena sin transponer';
          for (let m = 36; m <= 84; m++) sel.append(new Option(music.noteName(m), m));
          sel.value = S.root;
          sel.addEventListener('change', () => bank.setRoot('mel', +sel.value));
          row.append(sel);
        }
        row.append(button('×', () => removeSample(slot), 'Quitar ' + label.toLowerCase()));
      }
      row.append(button('Cargar', () => { pickSlot = slot; $('sampleFile').click(); }, 'Cargar un archivo para ' + label.toLowerCase()));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('over'); });
      row.addEventListener('dragleave', () => row.classList.remove('over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove('over');
        if (e.dataTransfer.files[0]) loadSample(slot, e.dataTransfer.files[0]);
      });
      return row;
    }));
    // en el secuenciador, un punto en las pistas que suenan con tu sonido
    for (const tr of beats.TRACKS) rowEls[tr].classList.toggle('has-sample', !!bank.slots[tr] && engine.useSamples);
  }

  // Varios archivos soltados sobre la sección: se reparten por el nombre (kick, snare, hat…)
  async function dropSamples(files) {
    for (const f of files) await loadSample(MS.SAMPLES.guessSlot(f.name), f);
  }

  // ======================= Interfaz =======================
  function fillSelect(el, items) {
    el.innerHTML = '';
    for (const [value, label] of items) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      el.append(o);
    }
  }

  const SLIDERS = ['melVol', 'drive', 'reverb', 'delay', 'drumVol', 'bassVol', 'chordVol']; // controles del motor de audio

  // Ejemplos y funciones clásicas, en dos grupos
  function fillPresets(el) {
    fillSelect(el, [['', 'Ejemplos…']]);
    for (const [label, list, k] of [['Ejemplos', gen.PRESETS, 'p'], ['Clásicas de MathSound', gen.CLASSICS, 'c']]) {
      const g = document.createElement('optgroup');
      g.label = label;
      list.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = k + i;
        o.textContent = p.name;
        g.append(o);
      });
      el.append(g);
    }
  }

  // Instrumentos agrupados según puedan sostener el glissando o sean golpes
  function fillInstruments(el) {
    el.replaceChildren();
    const groups = [['Sostenidos: glissando continuo', true], ['Percusivos: suenan a golpes', false]];
    for (const [label, sustain] of groups) {
      const g = document.createElement('optgroup');
      g.label = label;
      for (const [k, I] of Object.entries(MS.INSTRUMENTS)) {
        if (!!I.sustain !== sustain) continue;
        const o = document.createElement('option');
        o.value = k;
        o.textContent = I.name;
        g.append(o);
      }
      el.append(g);
    }
  }

  function syncUI() {
    $('scale').value = state.scale;
    $('tonic').value = state.tonic;
    $('octave').value = state.octave;
    $('instrument').value = state.instrument;
    $('kitSel').value = state.kit;
    $('range').value = state.range;
    $('rangeOut').textContent = state.range + ' semitonos';
    $('sub').value = state.sub;
    $('mode').value = state.mode;
    updateModeUI();
    $('styleSel').value = state.style;
    $('genreSel').value = state.genre;
    $('autoSel').value = state.auto;
    $('autoEvery').value = state.autoEvery;
    $('autoBuild').checked = state.autoBuild;
    $('formSel').value = state.form;
    $('bassOn').checked = state.bass;
    $('bassSel').value = state.bassMode;
    $('humanize').checked = state.humanize;
    $('beatTempo').checked = state.beatTempo;
    $('xMin').value = state.xMin;
    $('xMax').value = state.xMax;
    $('xPerBeat').value = state.xPerBeat;
    $('chordsOn').checked = state.chords;
    $('chordsSection').classList.toggle('is-off', !state.chords);
    $('chordProg').value = state.chordProg;
    $('chordRich').value = state.chordRich;
    $('chordVoices').value = state.chordVoices;
    $('chordBars').value = state.chordBars;
    $('chordInst').value = state.chordInst;
    $('chordVoicing').value = state.chordVoicing;
    $('chordIntro').checked = state.chordIntro;
    $('chordMel').checked = state.chordMel;
    $('ghost').checked = state.ghost;
    $('notes').checked = state.notes;
    $('bw').checked = state.bw;
    for (const k of SLIDERS) $(k).value = engine.p[k];
    $('bpm').value = state.bpm;
    $('bpmOut').textContent = state.bpm + ' bpm';
    $('swing').value = state.swing;
    $('swingOut').textContent = Math.round(state.swing * 100) + '%';
  }

  // Pestañas del panel de ajustes: clic, flechas izquierda y derecha, Inicio y Fin. Se recuerda la última.
  function selectTab(tab, focus) {
    for (const t of document.querySelectorAll('.tab')) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    try { localStorage.setItem('mathsound.tab', tab.id); } catch { /* sin almacenamiento: no se recuerda */ }
  }

  function bindTabs() {
    const tabs = [...document.querySelectorAll('.tab')];
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectTab(t));
      t.addEventListener('keydown', (e) => {
        const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (j === undefined) return;
        e.preventDefault();
        e.stopPropagation(); // Inicio no debe volver la canción al principio
        selectTab(tabs[(j + tabs.length) % tabs.length], true);
      });
    });
    let saved = null;
    try { saved = localStorage.getItem('mathsound.tab'); } catch { /* sin almacenamiento */ }
    selectTab(tabs.find((t) => t.id === saved) || tabs[0]);
  }

  function bind() {
    bindTabs();
    fillSelect($('scale'), Object.keys(music.SCALES).map((s) => [s, s]));
    fillSelect($('tonic'), music.NOTE_NAMES.map((n, i) => [i, n]));
    fillSelect($('styleSel'), [['random', 'Estilo aleatorio'], ...Object.entries(beats.STYLES).map(([k, s]) => [k, s.name])]);
    fillSelect($('genreSel'), [['random', 'Género al azar'], ...Object.entries(MS.GENRES).map(([k, G]) => [k, G.name])]);
    fillPresets($('presetSel'));
    fillSelect($('kitSel'), [['auto', 'Kit del estilo'], ...Object.entries(MS.KITS).map(([k, K]) => [k, 'Kit ' + K.name])]);
    fillSelect($('bassSel'), [['auto', 'Bajo del estilo'], ...Object.entries(beats.BASS_MODES)]);
    fillInstruments($('instrument'));
    fillSelect($('chordProg'), Object.entries(CH.PROGRESSIONS).map(([k, p]) => [k, p.name]));
    fillSelect($('chordRich'), Object.entries(CH.RICHNESS));
    fillSelect($('chordVoicing'), Object.entries(CH.VOICINGS));
    fillSelect($('chordInst'), CH.INSTS.map((k) => [k, MS.INSTRUMENTS[k].name]));

    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    on('btnPlay', 'click', togglePlay);
    on('btnRestart', 'click', restart);
    on('btnAllRandom', 'click', randomAll);
    on('btnRec', 'click', toggleRec);
    on('btnWav', 'click', exportWav);
    on('btnSave', 'click', saveSong);
    on('btnOpen', 'click', () => $('songFile').click());
    on('songFile', 'change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openSong(f); });
    on('btnLink', 'click', copyLink);
    window.addEventListener('hashchange', loadHash);
    on('sampleFile', 'change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && pickSlot) loadSample(pickSlot, f); });
    on('samplesOn', 'change', (e) => { engine.useSamples = e.target.checked; renderSamples(); });
    for (const b of document.querySelectorAll('.part button')) {
      b.addEventListener('click', () => {
        const p = b.closest('.part').dataset.part, act = b.dataset.act;
        parts[act][p] = !parts[act][p];
        applyParts();
      });
    }
    on('samplesSection', 'dragover', (e) => e.preventDefault());
    on('samplesSection', 'drop', (e) => { e.preventDefault(); dropSamples([...e.dataTransfer.files]); });
    on('btnRandFn', 'click', randomFn);
    on('btnRandBeat', 'click', () => newBeat());
    on('btnApply', 'click', applyTyped);
    on('fxInput', 'keydown', (e) => { if (e.key === 'Enter') applyTyped(); });
    on('presetSel', 'change', (e) => {
      const v = e.target.value;
      if (!v) return;
      const make = v[0] === 'c' ? gen.classicFunction : gen.presetFunction;
      setFunction(make(+v.slice(1), state.xMin, state.xMax));
    });
    on('genreSel', 'change', (e) => { state.genre = e.target.value; randomAll(); });
    on('autoSel', 'change', (e) => { state.auto = e.target.value; });
    on('autoEvery', 'change', (e) => { state.autoEvery = +e.target.value; });
    on('autoBuild', 'change', (e) => { state.autoBuild = e.target.checked; });
    on('formSel', 'change', (e) => setForm(e.target.value));
    on('btnDrop', 'click', requestBuild);

    on('mode', 'change', (e) => setMode(e.target.value));
    on('sub', 'change', (e) => { state.sub = +e.target.value; });
    // tónica, octava y rango cambian dónde caen las voces de los acordes en la gráfica: se redibuja
    on('scale', 'change', (e) => { state.scale = e.target.value; });
    on('tonic', 'change', (e) => { state.tonic = +e.target.value; shownFn = null; });
    on('octave', 'change', (e) => { state.octave = +e.target.value; shownFn = null; });
    on('instrument', 'change', (e) => setInstrument(e.target.value));
    on('range', 'input', (e) => { state.range = +e.target.value; $('rangeOut').textContent = state.range + ' semitonos'; shownFn = null; });

    on('chordsOn', 'change', (e) => setChords(e.target.checked));
    on('chordProg', 'change', (e) => { state.chordProg = e.target.value; });
    on('chordRich', 'change', (e) => { state.chordRich = +e.target.value; shownFn = null; });
    on('chordVoices', 'change', (e) => { state.chordVoices = +e.target.value; shownFn = null; });
    on('chordBars', 'change', (e) => { state.chordBars = +e.target.value; });
    on('chordInst', 'change', (e) => { state.chordInst = e.target.value; });
    on('chordVoicing', 'change', (e) => { state.chordVoicing = e.target.value; shownFn = null; });
    on('chordIntro', 'change', (e) => { state.chordIntro = e.target.checked; });
    on('chordMel', 'change', (e) => { state.chordMel = e.target.checked; });
    for (const k of SLIDERS) on(k, 'input', (e) => engine.set(k, +e.target.value));

    on('styleSel', 'change', (e) => { state.style = e.target.value; newBeat(); });
    on('kitSel', 'change', (e) => { state.kit = e.target.value; applyKit(); });
    on('bpm', 'input', (e) => setTempo(+e.target.value));
    on('swing', 'input', (e) => setSwing(+e.target.value));
    on('bassOn', 'change', (e) => { state.bass = e.target.checked; });
    on('bassSel', 'change', (e) => { state.bassMode = e.target.value; engine.setBassMode(bassModeNow()); renderGrid(); });
    on('humanize', 'change', (e) => { state.humanize = e.target.checked; });
    on('beatTempo', 'change', (e) => { state.beatTempo = e.target.checked; });

    const onRange = () => {
      const a = +$('xMin').value, b = +$('xMax').value;
      if (!(b - a >= 1)) { $('xMin').value = state.xMin; $('xMax').value = state.xMax; return; }
      state.xMin = a; state.xMax = b;
      refit();
    };
    on('xMin', 'change', onRange);
    on('xMax', 'change', onRange);
    on('xPerBeat', 'change', (e) => { state.xPerBeat = +e.target.value; restart(); });
    on('ghost', 'change', (e) => { state.ghost = e.target.checked; });
    on('notes', 'change', (e) => { state.notes = e.target.checked; });
    on('bw', 'change', (e) => {
      state.bw = e.target.checked;
      $('stage').classList.toggle('bw', state.bw);
      plot.readTheme();
    });
    window.addEventListener('resize', () => requestAnimationFrame(fitFormula));
    document.fonts?.addEventListener('loadingdone', fitFormula); // KaTeX cambia el ancho al cargar sus fuentes

    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if ((tag === 'INPUT' && e.target.type !== 'range') || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'f': randomFn(); break;
        case 'b': newBeat(); break;
        case 'a': randomAll(); break;
        case 'd': requestBuild(); break;
        case 'c': setChords(!state.chords); break;
        case 'home': restart(); break;
      }
    });
    // evita que Espacio también "pulse" el botón que tenga el foco
    document.addEventListener('keyup', (e) => { if (e.key === ' ' && e.target.tagName === 'BUTTON') e.preventDefault(); });
  }

  // acceso desde la consola del navegador para experimentar / depurar
  MS.app = { state, sch, engine, plot, chordLayer, bank, parts, applyParts, loadSample, dropSamples, sectionAt, songData, applySong, exportWav, tick, play, pause, restart, setMode, setInstrument, setFunction, setChords, setForm,
    newBeat, newSong, randomFn, randomAll, requestBuild, bassSteps };

  // ======================= Inicio =======================
  state.fn = gen.presetFunction(0, state.xMin, state.xMax);
  state.pattern = beats.randomBeat('house');
  buildGrid();
  bind();
  setTempo(state.pattern.bpm);
  syncUI();
  applyKit();
  requestAnimationFrame(frame);
  renderSamples();
  // tus sonidos guardados en este navegador y, después, la canción del enlace (que puede usar el sampler)
  bank.restore().then(() => { updateSampler(); renderSamples(); }).finally(loadHash);
})(globalThis.MS = globalThis.MS || {});
