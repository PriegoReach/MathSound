// Generador de patrones de batería aleatorios (16 pasos = 1 compás de semicorcheas).
// Cada estilo parte de una plantilla reconocible y le añade variaciones al azar.
// Además trae su kit de batería (js/drums.js), su línea de bajo y un ritmo para la melodía (modo "Ritmo").
(function (MS) {
  'use strict';

  const TRACKS = ['kick', 'snare', 'clap', 'hat', 'open', 'perc'];
  const LABELS = { kick: 'Bombo', snare: 'Caja', clap: 'Palmas', hat: 'Hi-hat', open: 'Hat abierto', perc: 'Perc' };

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const pickSome = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
  const range = (from, to, step = 1) => { const r = []; for (let i = from; i < to; i += step) r.push(i); return r; };

  // Ritmo euclidiano: k golpes repartidos lo más uniformemente posible en n pasos
  const euclid = (k, n = 16, rot = 0) => range(0, n).filter((i) => (i * k) % n < k).map((i) => (i + rot) % n);

  function blank() {
    const tracks = {};
    TRACKS.forEach((t) => { tracks[t] = new Array(16).fill(0); });
    return { tracks, rolls: new Array(16).fill(1), mel: null, swing: 0, bpm: 120 };
  }
  const put = (P, tr, steps, v = 1) => steps.forEach((s) => { P.tracks[tr][((s % 16) + 16) % 16] = v; });

  // Ritmos para la melodía: en qué semicorcheas suena una nota (con acento en cada pulso)
  const MEL_RHYTHMS = {
    corcheas: () => range(0, 16, 2),
    semicorcheas: () => range(0, 16),
    tresillo: () => [0, 3, 6, 8, 11, 14],                       // 3-3-2 dos veces
    tresilloLargo: () => [0, 3, 6, 10, 12, 14],
    cencerro: () => [0, 2, 3, 5, 6, 8, 10, 11, 13, 14],         // patrón típico de cencerro phonk
    galope: () => [0, 1, 3, 4, 6, 8, 9, 11, 12, 14],
    contratiempo: () => [2, 6, 10, 14, ...pickSome([0, 4, 8, 12], 2)],
    euclidiano: () => euclid(randInt(5, 9), 16, randInt(0, 3)),
    pregunta: () => [0, 2, 3, 6, 8, 10, 12],                     // frase y silencio al final
  };
  function melRhythm(names) {
    const steps = MEL_RHYTHMS[pick(names || Object.keys(MEL_RHYTHMS))]();
    const mel = new Array(16).fill(0);
    steps.forEach((s) => { mel[((s % 16) + 16) % 16] = s % 4 === 0 ? 1 : 0.75; });
    return mel;
  }

  // Líneas de bajo: en qué semicorcheas toca el bajo y cómo (v, acento, ligado, octava arriba).
  //   808: una nota en cada bombo (no necesita pasos) · acid: línea 303 con acentos y ligados
  //   offbeat: a contratiempo (trance, hardstyle) · rolling: tres semicorcheas tras cada bombo (psytrance)
  //   funk: síncopas con saltos de octava y notas fantasma
  const BASS_MODES = {
    '808': '808 en cada bombo', acid: 'Ácido 303', offbeat: 'A contratiempo', rolling: 'Rodante (psytrance)', funk: 'Funk',
  };
  function bassLine(mode) {
    const steps = new Array(16).fill(null);
    const on = (i, v = 0.8, extra = {}) => { steps[i] = { v, accent: false, slide: false, oct: 0, ...extra }; };
    switch (mode) {
      case 'acid': {
        const density = rand(0.5, 0.8);
        for (let i = 0; i < 16; i++) {
          if (i % 4 === 0 || chance(density)) on(i, 0.8, { accent: chance(0.3), slide: chance(0.25), oct: chance(0.2) ? 12 : 0 });
        }
        break;
      }
      case 'offbeat':
        [2, 6, 10, 14].forEach((i) => on(i, 0.9));
        if (chance(0.35)) [3, 7, 11, 15].forEach((i) => on(i, 0.55));
        break;
      case 'rolling':
        for (let i = 0; i < 16; i++) if (i % 4) on(i, i % 4 === 2 ? 0.85 : 0.7);
        break;
      case 'funk':
        pick([[0, 3, 6, 7, 10, 12, 14], [0, 2, 3, 7, 8, 10, 13, 14], [0, 3, 4, 6, 10, 11, 14]])
          .forEach((i) => on(i, i % 4 === 0 ? 0.9 : 0.72, { oct: chance(0.3) ? 12 : 0 }));
        for (let i = 1; i < 16; i += 2) if (!steps[i] && chance(0.2)) on(i, 0.35); // notas fantasma
        break;
      default:
        return null; // 808: sigue al bombo
    }
    return steps;
  }

  // Hi-hats en corcheas con acentos, y semicorcheas sueltas al azar
  function hats(P, p16 = 0.3, vOn = 0.55, vOff = 0.3) {
    range(0, 16, 2).forEach((s) => put(P, 'hat', [s], s % 4 === 0 ? vOn : vOn * 0.8));
    range(1, 16, 2).forEach((s) => { if (chance(p16)) put(P, 'hat', [s], vOff); });
  }

  const STYLES = {
    none: {
      name: 'Sin batería', random: false, mel: ['corcheas'],
      make(P) { P.bpm = randInt(84, 120); }, // solo la melodía (y el bajo, si está activado)
    },
    phonk: {
      name: 'Phonk', kit: 'phonk', mel: ['cencerro', 'semicorcheas', 'galope', 'tresillo'],
      make(P) { // Memphis: medio tiempo, cencerro y hats con redobles
        P.bpm = randInt(130, 145);
        put(P, 'kick', [0, ...pickSome([3, 6, 7, 10, 11, 14], randInt(2, 3))]);
        put(P, 'snare', [8], 0.9); put(P, 'clap', [8], 0.8);
        range(0, 16, 2).forEach((s) => put(P, 'hat', [s], s % 4 === 0 ? 0.55 : 0.4));
        pickSome([3, 7, 11, 13, 15], randInt(1, 3)).forEach((s) => { put(P, 'hat', [s], 0.45); P.rolls[s] = pick([2, 3]); });
        put(P, 'perc', pick([[0, 3, 6, 10, 12], [2, 6, 10, 14], euclid(5, 16, 2)]), 0.7);
        if (chance(0.4)) put(P, 'open', [pick([6, 14])], 0.4);
      },
    },
    drift: {
      name: 'Drift phonk', kit: 'phonk', mel: ['cencerro', 'semicorcheas', 'corcheas', 'galope'],
      make(P) { // cencerro al frente, bombo trap y palmas en 2 y 4
        P.bpm = randInt(118, 132);
        put(P, 'kick', [0, 10, ...pickSome([3, 6, 7, 11, 14], randInt(1, 3))]);
        put(P, 'clap', [4, 12]);
        if (chance(0.5)) put(P, 'snare', [4, 12], 0.5);
        range(0, 16).forEach((s) => put(P, 'hat', [s], s % 2 ? 0.25 : 0.42));
        if (chance(0.5)) pickSome([7, 15], 1).forEach((s) => { P.rolls[s] = 3; });
        if (chance(0.5)) put(P, 'perc', [2, 5, 10, 13], 0.5);
      },
    },
    funk: {
      name: 'Funk brasileño', kit: 'phonk', mel: ['tresillo', 'tresilloLargo', 'cencerro', 'galope'],
      make(P) { // tamborzão: bombo sincopado y percusión de atabaque
        P.bpm = randInt(125, 135);
        put(P, 'kick', [0, 3, 7, 10]);
        if (chance(0.5)) put(P, 'kick', [14], 0.7);
        put(P, 'clap', [4, 12], 0.85);
        put(P, 'snare', pickSome([6, 9, 14, 15], 2), 0.45);
        range(0, 16, 2).forEach((s) => put(P, 'hat', [s], 0.35));
        put(P, 'perc', [2, 5, 8, 11, 13], 0.55);
      },
    },
    drill: {
      name: 'Drill', kit: 'k808', mel: ['pregunta', 'tresillo', 'contratiempo', 'corcheas'],
      make(P) { // caja en el 3 y desplazada, hats en tresillo, 808 que se desliza
        P.bpm = randInt(138, 146);
        put(P, 'kick', [0, ...pickSome([6, 7, 10, 11, 13], randInt(1, 2))]);
        put(P, 'snare', [8, pick([13, 14, 15])]);
        if (chance(0.5)) put(P, 'clap', [8], 0.6);
        range(0, 16, 2).forEach((s) => put(P, 'hat', [s], 0.4));
        pickSome([2, 4, 6, 10, 12, 14], randInt(2, 4)).forEach((s) => { P.rolls[s] = 3; });
        if (chance(0.4)) put(P, 'perc', [3, 11], 0.35);
      },
    },
    jersey: {
      name: 'Jersey club', kit: 'k808', mel: ['contratiempo', 'tresillo', 'corcheas'],
      make(P) { // bombos en ráfaga al final del compás
        P.bpm = randInt(136, 145);
        put(P, 'kick', [0, 4, 8, 10, 12, 14]);
        if (chance(0.5)) put(P, 'kick', [11, 13], 0.7);
        put(P, 'clap', [4, 12]);
        range(0, 16, 2).forEach((s) => put(P, 'hat', [s], 0.3));
        put(P, 'perc', pickSome([2, 6, 7, 14, 15], 2), 0.4);
      },
    },
    lofi: {
      name: 'Lo-fi', kit: 'lofi', mel: ['pregunta', 'corcheas', 'contratiempo', 'tresilloLargo'],
      make(P) {
        P.bpm = randInt(72, 88); P.swing = rand(0.12, 0.28);
        put(P, 'kick', [0, ...pickSome([7, 9, 10, 11], randInt(1, 2))]);
        put(P, 'snare', [4, 12], 0.8);
        hats(P, 0.15, 0.4, 0.2);
        if (chance(0.5)) put(P, 'perc', pickSome([3, 6, 14], 1), 0.4);
      },
    },
    dnb: {
      name: 'Drum & bass', kit: 'clasica', mel: ['corcheas', 'contratiempo', 'euclidiano'],
      make(P) { // dos pasos a 170+ bpm
        P.bpm = randInt(170, 178);
        put(P, 'kick', [0, 10]);
        if (chance(0.4)) put(P, 'kick', [7], 0.7);
        put(P, 'snare', [4, 12]);
        put(P, 'snare', pickSome([7, 9, 14, 15], randInt(1, 2)), 0.3);
        range(0, 16, 2).forEach((s) => put(P, 'hat', [s], 0.4));
        range(1, 16, 2).forEach((s) => { if (chance(0.4)) put(P, 'hat', [s], 0.22); });
        if (chance(0.5)) put(P, 'open', [2, 10], 0.3);
      },
    },
    chip: {
      name: 'Chiptune', kit: 'chip', mel: ['semicorcheas', 'corcheas', 'galope', 'euclidiano'],
      make(P) {
        P.bpm = randInt(130, 160);
        put(P, 'kick', [0, 8, ...pickSome([6, 10, 14], 1)]);
        put(P, 'snare', [4, 12]);
        range(0, 16).forEach((s) => put(P, 'hat', [s], s % 2 ? 0.2 : 0.35));
        put(P, 'perc', euclid(randInt(3, 6), 16, randInt(0, 3)), 0.4);
      },
    },
    house: {
      name: 'House', mel: ['contratiempo', 'corcheas', 'tresillo'],
      make(P) {
        P.bpm = randInt(118, 126); P.swing = pick([0, 0, 0.08]);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, 'clap', [4, 12], 0.9);
        put(P, 'open', [2, 6, 10, 14], 0.55);
        range(0, 16).forEach((s) => { if (s % 2 && chance(0.6)) put(P, 'hat', [s], 0.35); });
        if (chance(0.6)) put(P, 'perc', pickSome([3, 7, 9, 11, 15], randInt(1, 2)), 0.5);
        if (chance(0.3)) put(P, 'snare', [15], 0.3);
      },
    },
    frenchhouse: {
      name: 'French house',
      kit: 'frenchhouse',
      bass: ['funk', 'funk', '808'], // bajo funky sobre el bombo a negras
      mel: ['contratiempo', 'corcheas', 'tresillo'],
      make(P) {
        P.bpm = randInt(118, 126); P.swing = pick([0, 0, 0.06]);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, 'clap', [4, 12], 0.85);
        put(P, 'open', [2, 6, 10, 14], 0.5);
        range(0, 16, 2).forEach((s) => put(P, 'hat', [s], s % 4 === 0 ? 0.48 : 0.36));
        if (chance(0.45)) put(P, 'snare', [15], 0.28);
        if (chance(0.5)) put(P, 'perc', pickSome([3, 7, 11, 15], 1), 0.42);
      },
    },
    techno: {
      name: 'Techno', mel: ['semicorcheas', 'euclidiano', 'contratiempo'],
      make(P) {
        P.bpm = randInt(126, 136);
        put(P, 'kick', [0, 4, 8, 12]);
        range(0, 16).forEach((s) => put(P, 'hat', [s], s % 4 === 2 ? 0.6 : 0.25));
        if (chance(0.5)) put(P, 'clap', [4, 12], 0.75);
        if (chance(0.6)) put(P, 'open', [2, 6, 10, 14], 0.4);
        put(P, 'perc', euclid(pick([3, 5]), 16, randInt(1, 3)), 0.45);
      },
    },
    trap: {
      name: 'Trap', kit: 'k808', mel: ['contratiempo', 'tresillo', 'pregunta'],
      make(P) {
        P.bpm = randInt(136, 150);
        put(P, 'kick', [0, ...pickSome([3, 6, 7, 10, 11, 13, 14], randInt(2, 3))]);
        put(P, 'clap', [8]); put(P, 'snare', [8], 0.7);
        const sixteenths = chance(0.4);
        range(0, 16, sixteenths ? 1 : 2).forEach((s) => put(P, 'hat', [s], s % 4 === 0 ? 0.55 : 0.38));
        pickSome([5, 7, 11, 13, 14, 15], randInt(1, 3)).forEach((s) => {
          put(P, 'hat', [s], 0.45); P.rolls[s] = pick([2, 3, 3, 4]); // redobles de hi-hat
        });
        if (chance(0.5)) put(P, 'open', [pick([6, 14])], 0.45);
        if (chance(0.4)) put(P, 'perc', [pick([3, 11])], 0.4);
      },
    },
    boombap: {
      name: 'Boom bap', kit: 'lofi', mel: ['pregunta', 'corcheas', 'tresilloLargo'],
      make(P) {
        P.bpm = randInt(84, 94); P.swing = rand(0.15, 0.32);
        put(P, 'kick', [0, 10, ...pickSome([3, 7, 13, 14], randInt(0, 2))]);
        put(P, 'snare', [4, 12]);
        if (chance(0.5)) put(P, 'clap', [4, 12], 0.4);
        [6, 9, 15].forEach((s) => { if (chance(0.35)) put(P, 'snare', [s], 0.22); }); // ghost notes
        hats(P, 0.25, 0.6, 0.28);
        if (chance(0.35)) put(P, 'open', [14], 0.4);
      },
    },
    breakbeat: {
      name: 'Breakbeat',
      make(P) {
        P.bpm = randInt(128, 140); P.swing = pick([0, 0.1]);
        put(P, 'kick', [0, 2, 10, ...(chance(0.6) ? [11] : [])]);
        put(P, 'snare', [4, 12]);
        put(P, 'snare', pickSome([7, 9, 14, 15], randInt(1, 3)), 0.55);
        hats(P, 0.2, 0.5, 0.25);
        if (chance(0.5)) put(P, 'open', [pick([6, 14])], 0.4);
      },
    },
    dembow: {
      name: 'Reggaetón (dembow)', kit: 'k808', mel: ['tresillo', 'tresilloLargo', 'contratiempo'],
      make(P) {
        P.bpm = randInt(88, 98);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, 'snare', [3, 6, 11, 14], 0.85);
        if (chance(0.5)) put(P, 'perc', [3, 6, 11, 14], 0.45);
        if (chance(0.4)) put(P, 'clap', [6, 14], 0.5);
        hats(P, chance(0.5) ? 0.8 : 0.1, 0.4, 0.25);
      },
    },
    acidhouse: {
      name: 'Acid house', kit: 'k909', bass: 'acid', mel: ['contratiempo', 'corcheas', 'euclidiano'],
      make(P) { // bombo a negras del 909 y una línea 303 que hace todo el trabajo
        P.bpm = randInt(120, 128);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, chance(0.6) ? 'clap' : 'snare', [4, 12], 0.85);
        put(P, 'open', [2, 6, 10, 14], 0.45);
        range(1, 16, 2).forEach((s) => { if (chance(0.5)) put(P, 'hat', [s], 0.3); });
        if (chance(0.4)) put(P, 'perc', range(0, 16, 4), 0.3); // ride
      },
    },
    funky: {
      name: 'Funk', kit: 'k909', bass: 'funk', mel: ['galope', 'tresillo', 'pregunta', 'contratiempo'],
      make(P) { // bombo sincopado, caja en 2 y 4 con notas fantasma y hats en semicorcheas con acentos
        P.bpm = randInt(96, 112); P.swing = pick([0, 0.06, 0.12]);
        put(P, 'kick', [0, ...pickSome([3, 7, 10, 11, 14], randInt(2, 3))]);
        put(P, 'snare', [4, 12], 0.9);
        put(P, 'snare', pickSome([2, 6, 9, 13, 15], randInt(2, 3)), 0.22); // notas fantasma
        range(0, 16).forEach((s) => put(P, 'hat', [s], s % 4 === 0 ? 0.55 : s % 2 ? 0.25 : 0.4));
        if (chance(0.5)) put(P, 'open', [pick([6, 14])], 0.4);
      },
    },
    hardstyle: {
      name: 'Hardstyle', kit: 'hardstyle', bass: 'offbeat', mel: ['corcheas', 'semicorcheas', 'tresillo'],
      make(P) { // bombo distorsionado a negras, palmas en 2 y 4 y hats a contratiempo
        P.bpm = randInt(148, 156);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, 'clap', [4, 12], 0.9);
        put(P, 'hat', [2, 6, 10, 14], 0.45);
        if (chance(0.4)) put(P, 'open', [2, 6, 10, 14], 0.35);
        if (chance(0.5)) put(P, 'perc', [0], 0.6); // platillo al empezar el compás
      },
    },
    hardtek: {
      name: 'Hardtek', kit: 'hardtek', bass: ['rolling', 'offbeat'], mel: ['semicorcheas', 'corcheas', 'euclidiano'],
      make(P) { // tekno libre: bombo saturado a negras muy rápido, hats a contratiempo y percusión ácida
        P.bpm = randInt(176, 190);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, 'hat', [2, 6, 10, 14], 0.5);
        range(1, 16, 2).forEach((s) => { if (chance(0.4)) put(P, 'hat', [s], 0.25); });
        if (chance(0.6)) put(P, 'clap', [4, 12], 0.7);
        put(P, 'perc', euclid(randInt(3, 7), 16, randInt(0, 3)), 0.4);
      },
    },
    trance: {
      name: 'Trance', kit: 'k909', bass: ['offbeat', 'offbeat', 'rolling'], mel: ['semicorcheas', 'corcheas'],
      make(P) { // bombo a negras, palmas en 2 y 4, hat abierto a contratiempo y ride
        P.bpm = randInt(136, 140);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, 'clap', [4, 12], 0.8);
        put(P, 'open', [2, 6, 10, 14], 0.5);
        put(P, 'hat', [0, 4, 8, 12], 0.2);
        if (chance(0.5)) put(P, 'perc', [2, 6, 10, 14], 0.3);
      },
    },
    psy: {
      name: 'Psytrance', kit: 'psy', bass: 'rolling', mel: ['semicorcheas', 'euclidiano', 'galope'],
      make(P) { // bombo seco a negras y el bajo rodante en las tres semicorcheas siguientes
        P.bpm = randInt(140, 148);
        put(P, 'kick', [0, 4, 8, 12]);
        put(P, 'open', [2, 6, 10, 14], 0.4);
        range(1, 16, 2).forEach((s) => { if (chance(0.4)) put(P, 'hat', [s], 0.22); });
        if (chance(0.6)) put(P, 'snare', [12], 0.6);
        if (chance(0.7)) put(P, 'perc', pickSome(range(0, 16), randInt(1, 3)), 0.5); // zaps
      },
    },
    ambient: {
      name: 'Ambiental', kit: 'lofi', mel: ['pregunta', 'corcheas', 'contratiempo'],
      make(P) { // casi sin batería: un bombo suave, algún aro y hats lejanos
        P.bpm = randInt(70, 86); P.swing = rand(0, 0.12);
        put(P, 'kick', [0, ...(chance(0.5) ? [10] : [])], 0.55);
        range(2, 16, 4).forEach((s) => { if (chance(0.5)) put(P, 'hat', [s], 0.18); });
        if (chance(0.5)) put(P, 'perc', pickSome([6, 14], 1), 0.3);
      },
    },
    euclid: {
      name: 'Euclidiano', kit: 'k808', mel: ['euclidiano'],
      make(P) {
        P.bpm = randInt(100, 130); P.swing = pick([0, 0, 0.12]);
        put(P, 'kick', euclid(randInt(3, 5)));
        put(P, 'snare', euclid(2, 16, 4));
        put(P, 'hat', euclid(randInt(5, 11), 16, randInt(0, 3)), 0.4);
        put(P, 'perc', euclid(randInt(3, 7), 16, randInt(0, 7)), 0.45);
        if (chance(0.5)) put(P, 'open', euclid(2, 16, 2), 0.4);
        if (chance(0.4)) put(P, 'clap', euclid(2, 16, 4), 0.6);
      },
    },
  };

  function randomBeat(styleKey = 'random') {
    const key = STYLES[styleKey] ? styleKey : pick(Object.keys(STYLES).filter((k) => STYLES[k].random !== false));
    const P = blank();
    STYLES[key].make(P);
    P.style = key;
    P.name = STYLES[key].name;
    P.kit = STYLES[key].kit || 'clasica';
    P.mel = P.mel || melRhythm(STYLES[key].mel);
    const b = STYLES[key].bass || '808';
    P.bassMode = Array.isArray(b) ? pick(b) : b;
    P.bassLines = {}; // líneas de bajo de este beat, por tipo (se crean al pedirlas)
    if (P.bassMode !== '808') P.bassLines[P.bassMode] = bassLine(P.bassMode);
    return P;
  }

  MS.beats = { TRACKS, LABELS, STYLES, BASS_MODES, randomBeat, melRhythm, bassLine };
})(globalThis.MS = globalThis.MS || {});
