// Géneros: ajustes predefinidos para que "Todo al azar" suene a algo concreto.
// Cada vez se elige al azar dentro de estas listas, así ninguna canción sale igual.
//   styles: estilos de beat (js/beats.js) · inst: instrumentos (js/instruments.js)
//   modes: glide | harp | steps | pattern | arp · sub: subdivisiones posibles (1 semicorcheas, 2 corcheas)
//   range/octave: cuánto se mueve y dónde suena la melodía
//   families: familias de funciones (js/generator.js) · classics: probabilidad de usar una de las
//   funciones clásicas de MathSound
//   chords (opcional): acordes de js/chords.js. p = probabilidad de que la canción los lleve; inst, prog,
//   rich (notas por acorde), voices, bars (compases por acorde), voicing, intro (espiral al empezar) y vol
//   (volumen de los acordes; si no se indica, entre 0,45 y 0,55)
//   drops: false en los géneros sin build-up ni drop: en modo canción tienen estribillos
// Un nombre repetido en una lista pesa más en el sorteo.
(function (MS) {
  'use strict';

  const DARK = ['Frigia', 'Menor natural', 'Menor armónica', 'Pentatónica menor'];
  const WARM = ['Dórica', 'Pentatónica mayor', 'Mayor', 'Menor natural'];
  const RHYTHMIC = ['Escalera melódica', 'Arpegio modular', 'Trino', 'Compuertas', 'Saltos de octava',
    'Caída 808', 'Contador binario', 'Llamada y respuesta', 'Escalones a trozos', 'Dados', 'Arpegio en zigzag',
    'Dos voces', 'Escala que sube', 'Latido'];
  const SMOOTH = ['Arcos decrecientes', 'Ondas', 'Rebotes', 'Pulsos de Gauss', 'Seno escalonado',
    'Raíz creciente', 'Batido', 'Escalera melódica', 'Polirritmo', 'Meseta', 'Eco que se apaga', 'Vibrato que crece', 'Ola'];
  const WILD = ['Senos anidados', 'Asíntotas', 'Pliegues triangulares', 'Trino, nota y sierra', 'Caída con vibrato',
    'Sierra rota', 'Escalones a trozos', 'Tangente recortada', 'Compuertas', 'Arcos decrecientes'];

  MS.GENRES = {
    phonk: {
      name: 'Phonk', styles: ['phonk'], inst: ['cowbell', 'cowbell', 'bell', 'softSaw', 'sub808'],
      scales: DARK, modes: ['pattern', 'pattern', 'steps', 'glide'], range: [19, 24, 31], octave: [0, 0, 1],
      drive: [0.1, 0.35], reverb: [0.1, 0.3], delay: [0, 0.25], families: [...RHYTHMIC, 'Caída con vibrato'], classics: 0.15,
    },
    drift: {
      name: 'Drift phonk', styles: ['drift'], inst: ['cowbell', 'cowbell', 'sub808', 'softSaw'],
      scales: DARK, modes: ['pattern', 'glide', 'steps'], range: [19, 24, 31], octave: [0, 1],
      drive: [0.2, 0.45], reverb: [0.15, 0.35], delay: [0.1, 0.3], families: RHYTHMIC, classics: 0.15,
    },
    funk: {
      name: 'Funk brasileño', styles: ['funk'], inst: ['cowbell', 'choir', 'lead', 'softSaw'],
      scales: ['Frigia', 'Menor natural', 'Dórica'], modes: ['pattern', 'steps'], range: [19, 24], octave: [0, 1],
      drive: [0.1, 0.3], reverb: [0.1, 0.3], delay: [0, 0.2], families: RHYTHMIC, classics: 0.1,
    },
    reggaeton: {
      name: 'Reggaetón', drops: false, styles: ['dembow'], inst: ['pluck', 'marimba', 'synth', 'bell', 'epiano'],
      scales: ['Menor natural', 'Frigia', 'Menor armónica', 'Dórica'], modes: ['pattern', 'pattern', 'steps', 'harp'],
      range: [12, 19, 24], octave: [0], drive: [0, 0.1], reverb: [0.15, 0.35], delay: [0.1, 0.3], families: RHYTHMIC, classics: 0.05,
    },
    trap: {
      name: 'Trap', styles: ['trap'], inst: ['bell', 'pluck', 'sub808', 'whistle', 'choir', 'softSaw'],
      scales: DARK, modes: ['pattern', 'harp', 'glide'], range: [19, 24, 31], octave: [0, 1],
      drive: [0, 0.15], reverb: [0.2, 0.4], delay: [0.1, 0.35], families: [...RHYTHMIC, ...SMOOTH], classics: 0.15,
    },
    drill: {
      name: 'Drill', styles: ['drill'], inst: ['bell', 'choir', 'pluck', 'sub808'],
      scales: ['Menor armónica', 'Menor natural', 'Frigia', 'Hirajoshi'], modes: ['pattern', 'harp', 'glide'],
      range: [19, 24], octave: [0, 1], drive: [0, 0.1], reverb: [0.2, 0.4], delay: [0.1, 0.3], families: RHYTHMIC, classics: 0.1,
    },
    jersey: {
      name: 'Jersey club', styles: ['jersey'], inst: ['pluck', 'choir', 'bell', 'chip'],
      scales: ['Menor natural', 'Dórica', 'Pentatónica menor'], modes: ['pattern', 'steps'], range: [12, 19, 24], octave: [0, 1],
      drive: [0, 0.1], reverb: [0.1, 0.3], delay: [0.1, 0.25], families: RHYTHMIC, classics: 0.05,
    },
    house: {
      name: 'House', styles: ['house', 'frenchhouse'], inst: ['organ', 'epiano', 'synth', 'marimba', 'pluck'],
      scales: WARM, modes: ['pattern', 'harp', 'steps'], range: [12, 19, 24], octave: [0],
      drive: [0, 0.1], reverb: [0.25, 0.5], delay: [0.15, 0.35], families: [...RHYTHMIC, ...SMOOTH], classics: 0.05,
      chords: { p: 0.35, inst: ['organ', 'pad', 'synth'], prog: ['jazz', 'pop', 'emotiva', 'funcion', 'quintas', 'vaiven'], rich: [4, 5], voices: [4, 6], bars: [1, 2] },
    },
    techno: {
      name: 'Techno', styles: ['techno'], inst: ['acid', 'acid', 'lead', 'softSaw'],
      scales: ['Frigia', 'Menor natural', 'Blues'], modes: ['glide', 'glide', 'steps', 'pattern'], range: [19, 24, 31, 41], octave: [-1, 0],
      drive: [0.1, 0.4], reverb: [0.1, 0.3], delay: [0.1, 0.35], families: [...RHYTHMIC, ...WILD], classics: 0.3,
    },
    dnb: {
      name: 'Drum & bass', styles: ['dnb', 'breakbeat'], inst: ['lead', 'choir', 'bell', 'acid', 'softSaw'],
      scales: ['Menor natural', 'Dórica', 'Menor armónica'], modes: ['glide', 'pattern', 'harp'], range: [19, 24, 31], octave: [0],
      drive: [0, 0.2], reverb: [0.2, 0.4], delay: [0.1, 0.3], families: [...SMOOTH, ...RHYTHMIC], classics: 0.15,
      chords: { p: 0.3, inst: ['pad', 'choir'], prog: ['emotiva', 'epica', 'escalera', 'batalla'], rich: [4, 5], voices: [4, 6], bars: [2] },
    },
    lofi: {
      name: 'Lo-fi', drops: false, styles: ['lofi', 'boombap'], inst: ['epiano', 'marimba', 'whistle', 'organ'],
      scales: ['Dórica', 'Pentatónica mayor', 'Mayor', 'Blues'], modes: ['harp', 'pattern', 'steps'], range: [12, 19], octave: [0],
      drive: [0, 0.1], reverb: [0.3, 0.55], delay: [0.1, 0.3], families: SMOOTH, classics: 0,
      chords: { p: 0.5, inst: ['pad', 'organ', 'synth'], prog: ['jazz', 'escalera', 'emotiva', 'funcion', 'quintas', 'sueno', 'anos50'], rich: [4, 5], voices: [4, 6], bars: [1, 2] },
    },
    chip: {
      name: 'Chiptune', drops: false, styles: ['chip', 'euclid'], inst: ['chip'],
      scales: ['Mayor', 'Pentatónica mayor', 'Blues', 'Menor natural'], modes: ['steps', 'pattern', 'glide'], range: [12, 19, 24], octave: [0, 1],
      drive: [0, 0], reverb: [0, 0.15], delay: [0, 0.2], families: [...RHYTHMIC, 'Contador binario', 'Seno escalonado'], classics: 0.1,
    },
    acid: {
      name: 'Acid house', styles: ['acidhouse'], inst: ['acid', 'lead', 'pluck', 'softSaw'],
      scales: ['Frigia', 'Menor natural', 'Dórica', 'Blues'], modes: ['steps', 'pattern', 'glide', 'arp'], range: [12, 19, 24], octave: [0],
      drive: [0.1, 0.3], reverb: [0.1, 0.3], delay: [0.15, 0.35], families: [...RHYTHMIC, 'Senos anidados', 'Tangente recortada'], classics: 0.15,
    },
    funky: {
      name: 'Funk y disco', drops: false, styles: ['funky', 'frenchhouse'], inst: ['epiano', 'organ', 'lead', 'synth', 'pluck'],
      scales: ['Dórica', 'Mixolidia', 'Pentatónica menor', 'Blues'], modes: ['pattern', 'harp', 'steps'], range: [12, 19], octave: [0],
      drive: [0, 0.15], reverb: [0.15, 0.35], delay: [0.1, 0.25], families: RHYTHMIC, classics: 0.05,
      chords: { p: 0.3, inst: ['organ', 'synth'], prog: ['jazz', 'funcion', 'vaiven', 'blues'], rich: [4], voices: [4], bars: [0.5, 1] },
    },
    hardstyle: {
      name: 'Hardstyle', styles: ['hardstyle'], inst: ['supersaw', 'supersaw', 'lead', 'softSaw'],
      scales: ['Menor natural', 'Menor armónica', 'Frigia'], modes: ['glide', 'pattern', 'arp', 'steps'], range: [19, 24, 31], octave: [0, 1],
      drive: [0.1, 0.3], reverb: [0.25, 0.45], delay: [0.1, 0.25], families: [...RHYTHMIC, ...SMOOTH], classics: 0.15,
      chords: { p: 0.4, inst: ['supersaw'], prog: ['epica', 'andaluza', 'emotiva', 'batalla'], rich: [3], voices: [4, 6], bars: [1, 2] },
    },
    hardtek: {
      name: 'Hardtek', styles: ['hardtek'], inst: ['acid', 'lead', 'pluck', 'softSaw', 'chip'],
      scales: ['Frigia', 'Menor natural', 'Blues'], modes: ['steps', 'pattern', 'glide'], range: [12, 19, 24], octave: [0],
      drive: [0.2, 0.45], reverb: [0.05, 0.2], delay: [0.1, 0.3], families: [...RHYTHMIC, ...WILD], classics: 0.25,
    },
    trance: {
      name: 'Trance', styles: ['trance'], inst: ['supersaw', 'supersaw', 'pluck', 'lead', 'bell'],
      scales: ['Menor natural', 'Menor armónica', 'Dórica', 'Mayor'], modes: ['arp', 'arp', 'arp', 'glide'], sub: [1, 1, 2],
      range: [12, 19], octave: [0, 1], drive: [0, 0.1], reverb: [0.35, 0.6], delay: [0.25, 0.45],
      families: [...SMOOTH, 'Arpegio modular'], classics: 0.05,
      chords: { p: 0.55, inst: ['supersaw', 'pad'], prog: ['epica', 'emotiva', 'pop', 'andaluza', 'batalla', 'canon'], rich: [3, 4], voices: [4, 6], bars: [1, 2] },
    },
    psytrance: {
      name: 'Psytrance', styles: ['psy'], inst: ['acid', 'acid', 'lead', 'supersaw', 'softSaw'],
      scales: ['Frigia', 'Menor armónica', 'Hirajoshi'], modes: ['glide', 'arp', 'steps'], sub: [1, 1, 2],
      range: [12, 19, 24, 31], octave: [0, 1], drive: [0.15, 0.4], reverb: [0.15, 0.35], delay: [0.25, 0.45],
      families: [...WILD, ...RHYTHMIC], classics: 0.25,
    },
    ambient: { // atmósfera tranquila de piano y pads, con composición propia
      name: 'Ambiental', drops: false, styles: ['ambient'], inst: ['piano', 'piano', 'pad', 'epiano', 'marimba'],
      scales: ['Mayor', 'Lidia', 'Pentatónica mayor', 'Dórica'], modes: ['harp', 'pattern', 'harp'], range: [12, 19], octave: [0, 1],
      drive: [0, 0], reverb: [0.55, 0.8], delay: [0.2, 0.45], families: SMOOTH, classics: 0,
      chords: { p: 0.75, inst: ['pad', 'pad', 'choir', 'sine'], prog: ['escalera', 'pop', 'emotiva', 'funcion', 'canon', 'royal', 'sueno'], rich: [4, 5], voices: [6, 9],
        bars: [1, 2], voicing: ['fijo', 'fijo', 'curva'], vol: [0.55, 0.7] },
    },
    acordes: { // nueve voces que se deslizan entre acordes y una espiral que se abre al empezar
      name: 'Acordes en movimiento', drops: false, styles: ['none', 'none', 'ambient', 'lofi', 'trance', 'house'],
      inst: ['piano', 'bell', 'epiano', 'pluck', 'marimba'], scales: ['Mayor', 'Mayor', 'Lidia', 'Menor natural', 'Dórica'],
      modes: ['harp', 'arp', 'arp', 'steps', 'pattern'], range: [12, 19], octave: [1], drive: [0, 0.05], reverb: [0.35, 0.6],
      delay: [0.15, 0.35], families: SMOOTH, classics: 0,
      chords: { p: 1, inst: ['softSaw', 'softSaw', 'pad', 'supersaw', 'choir'], prog: ['escalera', 'escalera', 'funcion', 'emotiva', 'pop', 'canon', 'royal', 'anos50'],
        rich: [5, 5, 4], voices: [9], bars: [1, 1, 0.5, 2], voicing: ['fijo', 'fijo', 'curva'], intro: true, vol: [0.75, 0.9] },
    },
    funciones: { // la curva sin ajustar a ninguna escala, en glissando, con las funciones más locas y beat
      name: 'Funciones puras',
      styles: ['phonk', 'trap', 'techno', 'drill', 'house', 'euclid', 'drift', 'dnb'], inst: ['softSaw', 'softSaw', 'softSaw', 'sine', 'lead'],
      scales: ['Cromática'], modes: ['glide'], range: [31, 41, 41], octave: [-1, -1, 0],
      drive: [0, 0.15], reverb: [0, 0.15], delay: [0, 0.15], families: WILD, classics: 0.5,
    },
  };
})(globalThis.MS = globalThis.MS || {});
