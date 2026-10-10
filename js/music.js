// Teoría musical mínima: escalas, cuantización y conversión y → nota.
(function (MS) {
  'use strict';

  const NOTE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

  const SCALES = {
    'Pentatónica menor': [0, 3, 5, 7, 10],
    'Pentatónica mayor': [0, 2, 4, 7, 9],
    'Mayor': [0, 2, 4, 5, 7, 9, 11],
    'Menor natural': [0, 2, 3, 5, 7, 8, 10],
    'Menor armónica': [0, 2, 3, 5, 7, 8, 11],
    'Dórica': [0, 2, 3, 5, 7, 9, 10],
    'Frigia': [0, 1, 3, 5, 7, 8, 10],
    'Lidia': [0, 2, 4, 6, 7, 9, 11],
    'Mixolidia': [0, 2, 4, 5, 7, 9, 10],
    'Blues': [0, 3, 5, 6, 7, 10],
    'Hirajoshi': [0, 2, 3, 7, 8],
    'Cromática': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pc = (m) => ((m % 12) + 12) % 12;
  const noteName = (m) => NOTE_NAMES[pc(Math.round(m))] + (Math.floor(Math.round(m) / 12) - 1);

  // y → nota MIDI (con decimales). El rango [lo, hi] de la función se reparte en
  // `range` semitonos centrados en la tónica de la octava elegida. Fuera de ese rango
  // (asíntotas) el tono sigue subiendo o hundiéndose un poco más antes de quedarse fijo.
  function yToMidi(y, fn, st) {
    const span = fn.hi - fn.lo || 1;
    const n = Math.min(1.6, Math.max(-0.6, (y - fn.lo) / span));
    return 60 + st.tonic + st.octave * 12 + (n - 0.5) * st.range;
  }

  // Inverso de yToMidi: altura y a la que suena la nota m
  function midiToY(m, fn, st) {
    const span = fn.hi - fn.lo || 1;
    return fn.lo + span * ((m - 60 - st.tonic - st.octave * 12) / st.range + 0.5);
  }

  // Notas de la escala dentro del rango de la función, de grave a aguda (para dibujar la pauta)
  function scaleNotes(fn, st) {
    const sc = SCALES[st.scale] || SCALES['Cromática'];
    const mid = 60 + st.tonic + st.octave * 12;
    const out = [];
    for (let m = Math.ceil(mid - st.range / 2); m <= Math.floor(mid + st.range / 2); m++) {
      const deg = pc(m - st.tonic);
      if (sc.includes(deg)) out.push({ m, y: midiToY(m, fn, st), name: noteName(m), tonic: deg === 0 });
    }
    return out;
  }

  // Nota de la escala más cercana
  function quantize(m, tonic, scaleName) {
    const sc = SCALES[scaleName] || SCALES['Cromática'];
    let best = Math.round(m), bestD = Infinity;
    for (let k = Math.floor(m) - 6; k <= Math.floor(m) + 7; k++) {
      if (!sc.includes(pc(k - tonic))) continue;
      const d = Math.abs(k - m);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  // Lleva una nota a la octava del bajo (tónica en octava 2), sin pasar de la quinta
  function toBass(m, tonic) {
    const deg = pc(m - tonic);
    return 36 + tonic + (deg > 7 ? deg - 12 : deg);
  }

  // Sube (o baja) `steps` grados de la escala desde la nota m, que ya está en la escala
  function degreeShift(m, steps, tonic, scaleName) {
    const sc = SCALES[scaleName] || SCALES['Cromática'];
    const L = sc.length, rel = m - tonic;
    let i = sc.indexOf(pc(rel));
    if (i < 0) i = 0;
    const k = i + steps;
    return tonic + 12 * (Math.floor(rel / 12) + Math.floor(k / L)) + sc[((k % L) + L) % L];
  }

  // Nota del acorde para el arpegio, contada desde m: 0 tónica, 1 tercera, 2 quinta, 3 octava,
  // 4 décima y 5 quinta una octava arriba (en grados de la escala elegida)
  function chordTone(m, idx, tonic, scaleName) {
    const L = (SCALES[scaleName] || SCALES['Cromática']).length;
    return degreeShift(m, [0, 2, 4, L, L + 2, L + 4][idx] ?? 0, tonic, scaleName);
  }

  MS.music = { NOTE_NAMES, SCALES, mtof, noteName, yToMidi, midiToY, scaleNotes, quantize, toBass, degreeShift, chordTone };
})(globalThis.MS = globalThis.MS || {});
