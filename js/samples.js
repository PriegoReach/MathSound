// Tus sonidos: archivos de audio propios (WAV, MP3, OGG…) para la batería y para la melodía (sampler).
// Se normalizan, se recortan y se guardan en este navegador (IndexedDB); no viajan en los archivos ni en
// los enlaces de canción. El motor los toca en E.drum (batería) y con el instrumento "sampler" (melodía).
(function (MS) {
  'use strict';
  const SLOTS = [['kick', 'Bombo'], ['snare', 'Caja'], ['clap', 'Palmas'], ['hat', 'Hi-hat'], ['open', 'Hat abierto'],
    ['perc', 'Perc'], ['mel', 'Melodía']];
  const MAX_FILE = 20 * 1024 * 1024;          // 20 MB por archivo
  const MAX_SEC = { drum: 8, mel: 20 };       // lo que pase de aquí se recorta
  const STORE = 'samples';

  // Reparto por el nombre del archivo al soltar varios a la vez
  const GUESS = [['open', /open|abierto|\boh\b/i], ['hat', /hat|\bhh\b|hihat/i], ['kick', /kick|bombo|\bbd\b/i],
    ['snare', /snare|caja|\bsd\b/i], ['clap', /clap|palma/i], ['perc', /perc|tom|rim|cow|cencerro|shaker|conga|bongo/i]];
  const guessSlot = (name) => (GUESS.find(([, re]) => re.test(name)) || ['mel'])[0];

  // ---------- Guardado en el navegador ----------
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('mathsound', 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function store(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }

  // ---------- Decodificar, recortar, normalizar y buscar la nota ----------
  async function decode(bytes, slot) {
    // decodeAudioData se queda con el ArrayBuffer: se le pasa una copia
    const raw = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.slice(0));
    const max = Math.min(raw.length, Math.floor(raw.sampleRate * (slot === 'mel' ? MAX_SEC.mel : MAX_SEC.drum)));
    const buf = new AudioBuffer({ length: max, numberOfChannels: Math.min(2, raw.numberOfChannels), sampleRate: raw.sampleRate });
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = raw.getChannelData(c).subarray(0, max);
      buf.copyToChannel(d, c);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (!(peak > 1e-4)) throw new Error('el archivo está en silencio');
    return { buf, gain: Math.min(8, 0.9 / peak) }; // todos al mismo pico, sin subir más de ×8 los muy bajos
  }

  // Nota MIDI de un sonido con altura: autocorrelación de 4096 muestras después del ataque (60 si no se
  // encuentra una altura clara)
  function detectRoot(buf) {
    const sr = buf.sampleRate, N = 4096, start = Math.min(Math.floor(sr * 0.05), Math.max(0, buf.length - N));
    if (buf.length < N) return 60;
    const x = new Float32Array(N);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < N; i++) x[i] += d[start + i]; }
    let e0 = 0;
    for (let i = 0; i < N; i++) e0 += x[i] * x[i];
    if (!(e0 > 1e-6)) return 60;
    let best = 0, bestLag = 0;
    for (let lag = Math.floor(sr / 1000); lag <= Math.floor(sr / 50); lag++) {
      let s = 0, e = 0;
      for (let i = 0; i < N - lag; i++) { s += x[i] * x[i + lag]; e += x[i + lag] * x[i + lag]; }
      const r = s / Math.sqrt(e0 * e + 1e-12);
      if (r > best) { best = r; bestLag = lag; }
    }
    if (best < 0.5) return 60;
    return Math.max(24, Math.min(96, Math.round(69 + 12 * Math.log2(sr / bestLag / 440))));
  }

  class SampleBank {
    constructor() {
      this.slots = {}; // slot → { buf, gain, name, root }
      this.saved = true; // false si el navegador no deja guardarlos
    }

    async load(slot, file) {
      if (!SLOTS.some(([k]) => k === slot)) throw new Error('hueco desconocido');
      if (file.size > MAX_FILE) throw new Error('el archivo pasa de 20 MB');
      const bytes = await file.arrayBuffer();
      let dec;
      try { dec = await decode(bytes, slot); } catch (err) {
        throw new Error(err?.constructor === Error ? err.message : 'no es un archivo de audio que el navegador sepa leer');
      }
      const root = slot === 'mel' ? detectRoot(dec.buf) : 60;
      this.slots[slot] = { ...dec, name: file.name.slice(0, 120), root };
      try { await store('readwrite', (s) => s.put({ slot, name: file.name.slice(0, 120), bytes, root }, slot)); this.saved = true; } catch { this.saved = false; }
      return this.slots[slot];
    }

    async remove(slot) {
      delete this.slots[slot];
      try { await store('readwrite', (s) => s.delete(slot)); } catch { /* no estaba guardado */ }
    }

    async setRoot(slot, root) {
      const S = this.slots[slot];
      if (!S) return;
      S.root = root;
      try {
        const row = await store('readonly', (s) => s.get(slot));
        if (row) await store('readwrite', (s) => s.put({ ...row, root }, slot));
      } catch { /* sin guardado */ }
    }

    // Recupera los sonidos guardados en este navegador
    async restore() {
      let rows = [];
      try { rows = await store('readonly', (s) => s.getAll()); } catch { this.saved = false; return; }
      for (const r of rows) {
        if (!r || !SLOTS.some(([k]) => k === r.slot) || !(r.bytes instanceof ArrayBuffer)) continue;
        try { this.slots[r.slot] = { ...(await decode(r.bytes, r.slot)), name: String(r.name).slice(0, 120), root: Number.isInteger(r.root) ? r.root : 60 }; } catch { /* dañado: se ignora */ }
      }
    }
  }

  // Instrumento de la melodía con tu sonido: cada nota lo transpone desde su nota base (percusivo: en
  // glissando sigue la curva a golpes). Solo aparece en la lista cuando hay un sonido de melodía.
  const SAMPLER = {
    name: 'Tu sonido (sampler)', sustain: false,
    hit(E, t, f, dur, v) {
      const S = E.samples.mel;
      if (S) E.sample(S, t, v * 0.85, E.melIn, f / MS.music.mtof(S.root), Math.max(0.12, dur * 1.1));
    },
  };

  MS.SAMPLES = { SLOTS, SampleBank, SAMPLER, guessSlot, detectRoot };
})(globalThis.MS = globalThis.MS || {});
