// Kits de batería: cada kit sintetiza las mismas seis pistas del secuenciador con otro carácter.
//   drive: saturación de toda la batería · lowpass: filtro de toda la batería (lo-fi)
//   kickDrive / kickEq { f, gain, q }: saturación y realce grave del bombo, para los bombos que van
//     por su propia cadena (E.kickIn): 909, French house, hardstyle, hardtek, psytrance
//   bass: { drive, slide } → el bajo se satura y a veces se desliza desde la nota anterior (808)
//   pump: { level, release } → el bombo hace "bombear" la melodía y el bajo (sidechain)
//   names: nombres de las pistas que cambian en este kit
// E es el motor (js/audio.js): E.tone(), E.noiseHit(), E.square2() y E.metal() van a E.drumIn
// salvo que se indique otro destino. Son aproximaciones sintetizadas, no samples de las máquinas.
(function (MS) {
  'use strict';

  // Cencerro 808 de la batería (dos cuadradas fijas, 540 y 800 Hz)
  const cowbell808 = (E, t, v, decay, level) => E.square2(t, 540, 800, 2640, 1.2, decay, v * level);

  // Nivel de los hats metálicos (E.metal): el filtro deja pasar poca energía y hay que compensarlo
  const HAT = 3;

  const KITS = {
    clasica: {
      name: 'Clásica',
      kick(E, t, v) {
        E.tone(t, 'sine', 170, 46, 0.11, 0.5, v);
        E.noiseHit(t, 0.012, v * 0.3, 'highpass', 2500, 0.7); // "clic" de ataque
      },
      snare(E, t, v) {
        E.noiseHit(t, 0.2, v * 0.6, 'highpass', 1400, 0.7);
        E.tone(t, 'triangle', 210, 160, 0.08, 0.12, v * 0.45);
      },
      clap(E, t, v) {
        for (let k = 0; k < 3; k++) E.noiseHit(t + k * 0.011, 0.02, v * 1.1, 'bandpass', 1300, 1.2);
        E.noiseHit(t + 0.033, 0.22, v * 1, 'bandpass', 1200, 1);
      },
      hat: (E, t, v) => E.noiseHit(t, 0.045, v * 0.42, 'highpass', 7500, 0.8),
      open: (E, t, v) => E.noiseHit(t, 0.38, v * 0.36, 'highpass', 7000, 0.8),
      perc: (E, t, v) => E.square2(t, 560, 845, 2200, 1.5, 0.09, v * 0.3),
    },

    k808: {
      name: '808',
      bass: { slide: 0.35 },
      names: { perc: 'Cencerro' },
      kick(E, t, v) { // bombo largo que retumba
        E.tone(t, 'sine', 130, 44, 0.07, 0.95, v);
        E.noiseHit(t, 0.008, v * 0.25, 'highpass', 3000, 0.7);
      },
      snare(E, t, v) {
        E.noiseHit(t, 0.17, v * 0.9, 'bandpass', 2200, 0.8);
        E.tone(t, 'sine', 240, 180, 0.05, 0.1, v * 0.4);
      },
      clap(E, t, v) {
        for (let k = 0; k < 4; k++) E.noiseHit(t + k * 0.009, 0.018, v * 1.1, 'bandpass', 1500, 1.4);
        E.noiseHit(t + 0.036, 0.28, v * 1.1, 'bandpass', 1400, 1.1);
      },
      hat: (E, t, v) => E.noiseHit(t, 0.03, v * 0.45, 'highpass', 8500, 0.9),
      open: (E, t, v) => E.noiseHit(t, 0.32, v * 0.34, 'highpass', 8000, 0.9),
      perc: (E, t, v) => cowbell808(E, t, v, 0.22, 0.32),
    },

    frenchhouse: {
      name: 'French house (909 + 808)',
      drive: 0.08,
      kickDrive: 0.15,
      kickEq: { f: 55, gain: 4 }, // realce grave estrecho del bombo
      pump: { level: 0.58, release: 0.18 },
      names: { perc: 'Tom' },
      kick(E, t, v) {
        E.tone(t, 'sine', 160, 48, 0.055, 0.42, v * 0.75, E.kickIn);
        E.tone(t, 'triangle', 95, 55, 0.025, 0.09, v * 0.18, E.kickIn);
        E.noiseHit(t, 0.009, v * 0.2, 'highpass', 2800, 0.7, E.kickIn);
      },
      snare(E, t, v) {
        E.noiseHit(t, 0.17, v * 0.65, 'highpass', 1300, 0.75);
        E.tone(t, 'triangle', 205, 155, 0.035, 0.12, v * 0.32);
      },
      clap(E, t, v) {
        for (let k = 0; k < 4; k++) E.noiseHit(t + k * 0.009, 0.018, v * 0.75, 'bandpass', 1450, 1.1);
        E.noiseHit(t + 0.036, 0.2, v * 0.72, 'bandpass', 1250, 0.9);
      },
      hat: (E, t, v) => E.noiseHit(t, 0.04, v * 0.38, 'highpass', 7800, 0.8),
      open: (E, t, v) => E.noiseHit(t, 0.28, v * 0.34, 'highpass', 7200, 0.8),
      perc(E, t, v) {
        E.tone(t, 'triangle', 360, 190, 0.025, 0.14, v * 0.3);
        E.noiseHit(t, 0.035, v * 0.16, 'bandpass', 900, 1);
      },
    },

    k909: {
      name: '909',
      kickDrive: 0.12,
      kickEq: { f: 55, gain: 5, q: 1.1 },
      names: { perc: 'Ride' },
      kick(E, t, v) { // golpe con caída de tono rápida y un clic de ataque
        E.tone(t, 'sine', 190, 50, 0.035, 0.45, v * 0.8, E.kickIn);
        E.tone(t, 'triangle', 420, 90, 0.012, 0.03, v * 0.25, E.kickIn);
        E.noiseHit(t, 0.006, v * 0.25, 'highpass', 2500, 0.7, E.kickIn);
      },
      snare(E, t, v) { // dos tonos y ruido brillante
        E.tone(t, 'triangle', 190, 165, 0.02, 0.12, v * 0.38);
        E.tone(t, 'sine', 335, 300, 0.02, 0.07, v * 0.22);
        E.noiseHit(t, 0.22, v * 0.7, 'highpass', 1800, 0.7);
      },
      clap(E, t, v) {
        for (let k = 0; k < 4; k++) E.noiseHit(t + k * 0.01, 0.016, v * 1.05, 'bandpass', 1150, 1.1);
        E.noiseHit(t + 0.04, 0.26, v * 0.95, 'bandpass', 1100, 1);
      },
      hat: (E, t, v) => E.metal(t, 0.06, v * HAT, 7500),
      open: (E, t, v) => E.metal(t, 0.4, v * HAT * 0.85, 6800),
      perc: (E, t, v) => E.metal(t, 1.1, v * HAT * 0.45, 9000), // ride
    },

    hardstyle: {
      name: 'Hardstyle',
      drive: 0.05,
      kickDrive: 0.9, // el bombo es casi todo distorsión
      kickEq: { f: 60, gain: 1.5 },
      names: { perc: 'Crash' },
      kick(E, t, v) { // golpe y cola grave distorsionada que todavía tiene tono
        E.noiseHit(t, 0.008, v * 0.35, 'highpass', 3000, 0.7, E.kickIn);
        E.tone(t, 'sine', 300, 62, 0.05, 0.2, v * 0.8, E.kickIn);
        E.tone(t, 'sine', 64, 50, 0.38, 0.42, v * 0.72, E.kickIn);
      },
      snare(E, t, v) {
        E.noiseHit(t, 0.2, v * 0.7, 'highpass', 1300, 0.7);
        E.tone(t, 'triangle', 220, 180, 0.03, 0.1, v * 0.35);
      },
      clap(E, t, v) {
        for (let k = 0; k < 4; k++) E.noiseHit(t + k * 0.011, 0.02, v * 1.05, 'bandpass', 1300, 1.1);
        E.noiseHit(t + 0.044, 0.35, v * 1, 'bandpass', 1250, 0.9);
      },
      hat: (E, t, v) => E.metal(t, 0.045, v * HAT, 8000),
      open: (E, t, v) => E.metal(t, 0.25, v * HAT * 0.8, 7500),
      perc: (E, t, v) => E.metal(t, 1.4, v * HAT * 0.42, 4000), // platillo
    },

    hardtek: {
      name: 'Hardtek',
      drive: 0.1,
      kickDrive: 0.7,
      kickEq: { f: 50, gain: 2 },
      names: { perc: 'Blip' },
      kick(E, t, v) { // bombo largo y saturado del tekno libre
        E.noiseHit(t, 0.008, v * 0.3, 'highpass', 2500, 0.7, E.kickIn);
        E.tone(t, 'sine', 175, 44, 0.06, 0.55, v * 0.78, E.kickIn);
      },
      snare(E, t, v) {
        E.noiseHit(t, 0.15, v * 0.6, 'highpass', 1000, 0.6);
        E.tone(t, 'triangle', 200, 160, 0.04, 0.09, v * 0.4);
      },
      clap(E, t, v) {
        for (let k = 0; k < 3; k++) E.noiseHit(t + k * 0.012, 0.02, v * 1, 'bandpass', 1400, 1);
        E.noiseHit(t + 0.036, 0.22, v * 0.9, 'bandpass', 1300, 0.9);
      },
      hat: (E, t, v) => E.metal(t, 0.035, v * HAT, 8500),
      open: (E, t, v) => E.metal(t, 0.2, v * HAT * 0.8, 8000),
      perc: (E, t, v) => E.tone(t, 'square', 900, 600, 0.02, 0.06, v * 0.25),
    },

    psy: {
      name: 'Psytrance',
      kickDrive: 0.25,
      kickEq: { f: 60, gain: 3 },
      names: { perc: 'Zap' },
      kick(E, t, v) { // corto y seco, para dejar sitio al bajo rodante
        E.tone(t, 'sine', 230, 48, 0.03, 0.22, v, E.kickIn);
        E.noiseHit(t, 0.005, v * 0.3, 'highpass', 3000, 0.7, E.kickIn);
      },
      snare(E, t, v) {
        E.noiseHit(t, 0.15, v * 0.6, 'highpass', 1500, 0.7);
        E.tone(t, 'triangle', 210, 170, 0.03, 0.08, v * 0.35);
      },
      clap(E, t, v) {
        for (let k = 0; k < 3; k++) E.noiseHit(t + k * 0.01, 0.018, v * 1, 'bandpass', 1500, 1.1);
        E.noiseHit(t + 0.03, 0.18, v * 0.9, 'bandpass', 1400, 1);
      },
      hat: (E, t, v) => E.metal(t, 0.035, v * HAT, 9000),
      open: (E, t, v) => E.metal(t, 0.15, v * HAT * 0.8, 8000),
      perc: (E, t, v) => E.tone(t, 'sine', 2400, 180, 0.07, 0.09, v * 0.3), // "zap" que cae
    },

    phonk: {
      name: 'Phonk',
      drive: 0.2,
      bass: { drive: 0.6, slide: 0.5 },
      names: { perc: 'Cencerro' },
      kick(E, t, v) { // 808 saturado con mucha cola
        E.tone(t, 'sine', 160, 48, 0.06, 0.7, v);
        E.noiseHit(t, 0.01, v * 0.35, 'highpass', 2000, 0.7);
      },
      snare(E, t, v) { // caja sucia estilo Memphis
        E.noiseHit(t, 0.16, v * 0.5, 'highpass', 900, 0.6);
        E.tone(t, 'triangle', 230, 170, 0.04, 0.09, v * 0.5);
      },
      clap(E, t, v) {
        for (let k = 0; k < 3; k++) E.noiseHit(t + k * 0.013, 0.025, v * 0.7, 'bandpass', 1600, 1);
        E.noiseHit(t + 0.039, 0.3, v * 0.6, 'bandpass', 1500, 0.9);
      },
      hat: (E, t, v) => E.noiseHit(t, 0.028, v * 0.28, 'highpass', 9000, 1),
      open: (E, t, v) => E.noiseHit(t, 0.26, v * 0.22, 'highpass', 8500, 1),
      perc: (E, t, v) => cowbell808(E, t, v, 0.35, 0.42),
    },

    lofi: {
      name: 'Lo-fi',
      drive: 0.15,
      lowpass: 4200,
      names: { perc: 'Aro' },
      kick(E, t, v) { // suave, sin clic
        E.tone(t, 'sine', 115, 50, 0.08, 0.38, v * 0.95);
      },
      snare(E, t, v) {
        E.noiseHit(t, 0.17, v * 0.5, 'bandpass', 1500, 0.7);
        E.tone(t, 'triangle', 190, 150, 0.06, 0.1, v * 0.35);
      },
      clap(E, t, v) {
        for (let k = 0; k < 2; k++) E.noiseHit(t + k * 0.014, 0.025, v * 0.65, 'bandpass', 1100, 1);
        E.noiseHit(t + 0.03, 0.18, v * 0.55, 'bandpass', 1000, 0.9);
      },
      hat: (E, t, v) => E.noiseHit(t, 0.05, v * 0.3, 'highpass', 6000, 0.7),
      open: (E, t, v) => E.noiseHit(t, 0.24, v * 0.26, 'highpass', 5500, 0.7),
      perc(E, t, v) { // golpe de aro
        E.tone(t, 'triangle', 1700, 1600, 0.01, 0.04, v * 0.4);
        E.noiseHit(t, 0.02, v * 0.3, 'bandpass', 3000, 2);
      },
    },

    percu: {
      name: 'Percusión (afro y latina)',
      names: { snare: 'Aro', hat: 'Shaker', open: 'Shaker largo', perc: 'Conga' },
      kick(E, t, v) { // redondo y corto, sin clic
        E.tone(t, 'sine', 125, 52, 0.07, 0.32, v * 0.95);
        E.noiseHit(t, 0.006, v * 0.12, 'highpass', 2500, 0.7);
      },
      snare(E, t, v) { // golpe de aro: un tono agudo muy corto y un clic de madera
        E.tone(t, 'triangle', 820, 760, 0.01, 0.06, v * 0.8);
        E.noiseHit(t, 0.03, v * 0.65, 'bandpass', 2500, 1.5);
      },
      clap(E, t, v) {
        for (let k = 0; k < 3; k++) E.noiseHit(t + k * 0.01, 0.02, v * 1.4, 'bandpass', 1400, 1.1);
        E.noiseHit(t + 0.03, 0.17, v * 1.25, 'bandpass', 1300, 0.9);
      },
      hat: (E, t, v) => E.noiseHit(t, 0.06, v * 0.68, 'bandpass', 6500, 1.2),   // shaker
      open: (E, t, v) => E.noiseHit(t, 0.16, v * 0.62, 'bandpass', 6000, 1), // shaker largo
      perc(E, t, v) { // conga: tono que baja un poco y el golpe de la piel
        E.tone(t, 'sine', 330, 290, 0.03, 0.22, v * 0.6);
        E.noiseHit(t, 0.015, v * 0.25, 'bandpass', 1500, 1.2);
      },
    },

    chip: {
      name: 'Chip (8 bits)',
      names: { perc: 'Blip' },
      kick: (E, t, v) => E.tone(t, 'square', 220, 45, 0.06, 0.14, v * 0.9),
      snare: (E, t, v) => E.noiseHit(t, 0.11, v * 0.5, 'highpass', 1200, 0.5),
      clap(E, t, v) {
        E.noiseHit(t, 0.03, v * 0.9, 'bandpass', 1800, 0.8);
        E.noiseHit(t + 0.03, 0.08, v * 0.9, 'bandpass', 1800, 0.8);
      },
      hat: (E, t, v) => E.noiseHit(t, 0.022, v * 0.35, 'highpass', 9500, 0.5),
      open: (E, t, v) => E.noiseHit(t, 0.13, v * 0.3, 'highpass', 9000, 0.5),
      perc: (E, t, v) => E.tone(t, 'square', 1320, 1300, 0.01, 0.05, v * 0.25),
    },
  };

  MS.KITS = KITS;
})(globalThis.MS = globalThis.MS || {});
