// Estructura de canción: en vez de repetir siempre lo mismo, la canción pasa por secciones (intro,
// estrofa, build-up y drop, puente, final) que meten y sacan capas: batería, bajo, melodía y acordes.
// Cada sección dura vueltas enteras de la gráfica, así empieza con la curva desde el principio.
(function (MS) {
  'use strict';
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const ALL = ['kick', 'snare', 'clap', 'hat', 'open', 'perc'];

  // drums: pistas de la batería que suenan · bass: si suena el bajo · mel y chords: volumen de la melodía y
  // de los acordes (melWithChords: el de la melodía cuando hay acordes) · lp: filtro paso bajo de melodía y
  // acordes al empezar y al acabar la sección, en Hz · build: build-up al final de la sección anterior
  const SECTIONS = {
    intro: { name: 'Intro', drums: ['hat', 'open', 'perc'], bass: false, mel: 1, chords: 1, lp: [500, 16000] },
    verse: { name: 'Estrofa', drums: ['kick', 'snare', 'hat', 'perc'], bass: true, mel: 1, chords: 0.8, lp: [20000, 20000] },
    drop: { name: 'Drop', drums: ALL, bass: true, mel: 1, chords: 1, lp: [20000, 20000], build: true },
    chorus: { name: 'Estribillo', drums: ALL, bass: true, mel: 1, chords: 1, lp: [20000, 20000] },
    // sin batería ni bajo: la melodía sola o, si hay acordes, los acordes con la melodía de fondo
    break: { name: 'Puente', drums: [], bass: false, mel: 1, melWithChords: 0.3, chords: 1, lp: [20000, 20000] },
    outro: { name: 'Final', drums: ['kick', 'hat'], bass: true, mel: 1, chords: 1, lp: [16000, 600] },
  };
  const FULL = { drums: ALL, bass: true, mel: 1, chords: 1, lp: [20000, 20000] }; // modo bucle: todo suena

  // Secciones de una canción y su duración en compases. Con `drops` (géneros de club) los momentos fuertes
  // son drops con build-up; si no, estribillos.
  function arrangement(drops) {
    const big = drops ? 'drop' : 'chorus';
    const plan = [['intro', 4], ['verse', pick([4, 8])], [big, 8], ['break', pick([4, 8])], [big, 8], ['outro', 4]];
    if (Math.random() < 0.35) plan.splice(4, 0, ['verse', 4]); // a veces otra estrofa antes del segundo
    return plan.map(([type, bars]) => ({ type, bars }));
  }

  // Vueltas que dura cada sección con vueltas de `bpp` pulsos (al menos una)
  const passesOf = (s, bpp) => Math.max(1, Math.round((s.bars * 4) / bpp));
  const totalPasses = (arr, bpp) => arr.reduce((a, s) => a + passesOf(s, bpp), 0);

  // Sección de la vuelta número `rel` de la canción (la estructura se repite al acabar):
  // { type, name, index, offset (vueltas desde que empezó), passes, round (repetición), …mezcla }
  function sectionAt(arr, rel, bpp) {
    const total = totalPasses(arr, bpp);
    const round = Math.floor(rel / total);
    let r = rel - round * total;
    for (let index = 0; index < arr.length; index++) {
      const n = passesOf(arr[index], bpp);
      if (r < n) return { ...SECTIONS[arr[index].type], type: arr[index].type, index, offset: r, passes: n, round };
      r -= n;
    }
    return null;
  }

  MS.FORM = { SECTIONS, FULL, arrangement, sectionAt, totalPasses, passesOf };
})(globalThis.MS = globalThis.MS || {});
