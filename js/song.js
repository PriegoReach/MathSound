// Guardar, compartir y exportar: la canción como datos (archivo .json o enlace #z=…) y el audio como WAV.
// Lo que llega de un archivo o de un enlace viene de fuera: cada valor se comprueba antes de usarlo.
(function (MS) {
  'use strict';
  const VERSION = 1;
  const MAX_BYTES = 1 << 20; // un enlace o archivo de canción nunca debería pasar de 1 MB

  // ---------- Enlace: JSON → (deflate) → base64url ----------
  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(text) {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  // Pasa los bytes por un CompressionStream/DecompressionStream, sin dejar que crezcan más de MAX_BYTES
  async function through(bytes, stream) {
    const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    const parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > MAX_BYTES) { reader.cancel(); throw new Error('El enlace es demasiado grande'); }
      parts.push(value);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // Datos de la canción → texto para después de "#" (z = comprimido, c = sin comprimir)
  async function toHash(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    if (window.CompressionStream) return 'z=' + b64url(await through(bytes, new CompressionStream('deflate-raw')));
    return 'c=' + b64url(bytes);
  }

  // Texto de después de "#" → datos (null si no es un enlace de canción)
  async function fromHash(hash) {
    const m = /^#?([cz])=([A-Za-z0-9_-]+)$/.exec(hash || '');
    if (!m) return null;
    let bytes = unb64url(m[2]);
    if (bytes.length > MAX_BYTES) throw new Error('El enlace es demasiado grande');
    if (m[1] === 'z') {
      if (!window.DecompressionStream) throw new Error('Este navegador no sabe abrir enlaces comprimidos');
      bytes = await through(bytes, new DecompressionStream('deflate-raw'));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ---------- Comprobación de los datos ----------
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
  const oneOf = (v, list) => (list.includes(v) ? v : undefined);
  const bool = (v) => (typeof v === 'boolean' ? v : undefined);
  const has = (obj) => (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(obj, v) ? v : undefined);

  // Ajustes de la canción que se pueden cargar; lo que no es válido se descarta
  function cleanState(st) {
    if (!st || typeof st !== 'object') return {};
    const { music, beats, CHORDS, INSTRUMENTS, KITS, GENRES } = MS;
    const out = {
      xMin: num(st.xMin, -1000, 1000), xMax: num(st.xMax, -1000, 1000), xPerBeat: oneOf(st.xPerBeat, [0.5, 1, 2]),
      bpm: num(st.bpm, 60, 200), swing: num(st.swing, 0, 0.5),
      style: st.style === 'random' ? 'random' : has(beats.STYLES)(st.style),
      mode: oneOf(st.mode, ['glide', 'harp', 'steps', 'pattern', 'arp']), sub: oneOf(st.sub, [1, 2, 4]),
      scale: has(music.SCALES)(st.scale), tonic: int(st.tonic, 0, 11), octave: oneOf(st.octave, [-1, 0, 1]),
      range: int(st.range, 5, 48), instrument: has(INSTRUMENTS)(st.instrument),
      kit: st.kit === 'auto' ? 'auto' : has(KITS)(st.kit),
      arp: Array.isArray(st.arp) && st.arp.length >= 1 && st.arp.length <= 16 && st.arp.every((i) => int(i, 0, 5) !== undefined) ? st.arp : undefined,
      bass: bool(st.bass), bassMode: st.bassMode === 'auto' ? 'auto' : has(beats.BASS_MODES)(st.bassMode),
      beatTempo: bool(st.beatTempo), humanize: bool(st.humanize), songGenre: has(GENRES)(st.songGenre),
      chords: bool(st.chords), chordProg: has(CHORDS.PROGRESSIONS)(st.chordProg), chordRich: oneOf(st.chordRich, [3, 4, 5]),
      chordVoices: oneOf(st.chordVoices, [4, 6, 9]), chordBars: oneOf(st.chordBars, [0.5, 1, 2]),
      chordInst: oneOf(st.chordInst, CHORDS.INSTS), chordVoicing: has(CHORDS.VOICINGS)(st.chordVoicing),
      chordIntro: bool(st.chordIntro), chordMel: bool(st.chordMel), form: oneOf(st.form, ['loop', 'song']),
    };
    if (out.xMin !== undefined && out.xMax !== undefined && !(out.xMax - out.xMin >= 1)) out.xMin = out.xMax = undefined;
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  }

  // Volúmenes y efectos (0 a 1)
  function cleanMix(mix, keys) {
    const out = {};
    for (const k of keys) { const v = num(mix?.[k], 0, 1); if (v !== undefined) out[k] = v; }
    return out;
  }

  // Beat guardado: 16 pasos por pista con valores de 0 a 1; null si no sirve
  function cleanPattern(P) {
    const { beats, KITS } = MS;
    const steps = (a) => Array.isArray(a) && a.length === 16 && a.every((v) => num(v, 0, 1) !== undefined);
    if (!P || typeof P !== 'object' || !P.tracks || !beats.TRACKS.every((t) => steps(P.tracks[t])) || !steps(P.mel)) return null;
    const style = has(beats.STYLES)(P.style) || 'none';
    const out = {
      tracks: Object.fromEntries(beats.TRACKS.map((t) => [t, [...P.tracks[t]]])),
      rolls: Array.isArray(P.rolls) && P.rolls.length === 16 && P.rolls.every((r) => int(r, 1, 4) !== undefined) ? [...P.rolls] : new Array(16).fill(1),
      mel: [...P.mel],
      swing: num(P.swing, 0, 0.5) ?? 0, bpm: num(P.bpm, 60, 200) ?? 110,
      style, name: beats.STYLES[style].name, kit: has(KITS)(P.kit) || 'clasica',
      bassMode: has(beats.BASS_MODES)(P.bassMode) || '808', bassLines: {},
    };
    for (const [mode, line] of Object.entries(P.bassLines || {})) {
      if (!has(beats.BASS_MODES)(mode) || !Array.isArray(line) || line.length !== 16) continue;
      if (!line.every((s) => s === null || (s && num(s.v, 0, 1) !== undefined))) continue;
      out.bassLines[mode] = line.map((s) => (s ? { v: s.v, accent: !!s.accent, slide: !!s.slide, oct: s.oct === 12 ? 12 : 0 } : null));
    }
    return out;
  }

  // Estructura guardada: secciones conocidas con 1 a 32 compases
  function cleanArrangement(arr) {
    if (!Array.isArray(arr) || !arr.length || arr.length > 32) return null;
    if (!arr.every((s) => s && has(MS.FORM.SECTIONS)(s.type) && int(s.bars, 1, 32) !== undefined)) return null;
    return arr.map((s) => ({ type: s.type, bars: s.bars }));
  }

  // ---------- WAV ----------
  // AudioBuffer → WAV de 16 bits
  function wavBlob(buf) {
    const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate, bytes = n * ch * 2;
    const v = new DataView(new ArrayBuffer(44 + bytes));
    const text = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); text(8, 'WAVE');
    text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    text(36, 'data'); v.setUint32(40, bytes, true);
    const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const x = Math.max(-1, Math.min(1, data[c][i]));
        v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([v], { type: 'audio/wav' });
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // Nombre de archivo: mathsound-<género>-<fecha>.<ext>
  const fileName = (genre, ext) => `mathsound-${genre || 'cancion'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;

  MS.SONG = { VERSION, MAX_BYTES, toHash, fromHash, cleanState, cleanMix, cleanPattern, cleanArrangement, wavBlob, download, fileName };
})(globalThis.MS = globalThis.MS || {});
