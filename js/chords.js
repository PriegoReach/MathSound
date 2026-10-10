// Capa de acordes: varias voces sostenidas tocan una progresión y, en cada cambio de acorde, cada voz se
// desliza con una curva en S hasta una nota del acorde nuevo, la que menos la obliga a moverse (conducción
// de voces). Con nueve voces y acordes de novena suena como un coro de sintetizadores; antes de un drop,
// dos voces giran en espiral hasta juntarse en una nota y, con el golpe, se abren en abanico hacia el
// acorde.
// Las líneas de las voces se guardan en pulsos (no en segundos) para dibujarlas en la gráfica.
(function (MS) {
  'use strict';
  const { music } = MS;
  const pc = (m) => ((m % 12) + 12) % 12;
  const smooth = (u) => u * u * (3 - 2 * u); // curva en S (smoothstep)

  // Grados de la escala (0 = primero). Los nombres usan los números romanos de una escala mayor o menor;
  // con otra escala, los mismos grados dan otros acordes.
  const PROGRESSIONS = {
    escalera: { name: 'Escalera: I–ii–iii–IV–vi–V–I', degrees: [0, 1, 2, 3, 5, 4] }, // y vuelve a empezar en I
    pop: { name: 'Pop: I–V–vi–IV', degrees: [0, 4, 5, 3] },
    emotiva: { name: 'Emotiva: vi–IV–I–V', degrees: [5, 3, 0, 4] },
    epica: { name: 'Épica (en menor): i–VI–III–VII', degrees: [0, 5, 2, 6] },
    jazz: { name: 'Jazz: ii–V–I', degrees: [1, 4, 0, 0] },
    andaluza: { name: 'Andaluza (en menor): i–VII–VI–V', degrees: [0, 6, 5, 4] },
    funcion: { name: 'La elige la función: el grado de la nota que suena', degrees: null },
  };
  const RICHNESS = { 3: 'Tríadas', 4: 'Séptimas', 5: 'Novenas' };
  const VOICINGS = {
    fijo: 'Quietas: se mueven lo mínimo',
    curva: 'Siguen a la curva de la función',
  };
  // Instrumentos sostenidos que suenan bien como acordes, y cuánto se bajan los que como acorde
  // suenan más fuertes que el resto (medido en RMS con varias voces)
  const INSTS = ['pad', 'softSaw', 'supersaw', 'synth', 'organ', 'choir', 'sine', 'lead', 'chip'];
  const TRIM = { pad: 0.85, supersaw: 0.85, synth: 0.55, organ: 0.65, choir: 0.7, sine: 0.5, lead: 0.8 };

  // Las escalas de 5 o 6 notas no forman acordes por terceras: se usa una de 7 notas que las contiene
  const PARENT = { 'Pentatónica menor': 'Menor natural', 'Pentatónica mayor': 'Mayor', 'Blues': 'Menor natural',
    'Hirajoshi': 'Menor natural', 'Cromática': 'Mayor' };
  const chordScale = (name) => music.SCALES[PARENT[name] || name] || music.SCALES['Mayor'];

  // Acorde sobre el grado `deg` de la escala: `tones` notas apiladas por terceras (3, 4 o 5).
  // Si la novena queda a un semitono de la fundamental (♭9, áspera) se pone la oncena en su lugar (el iii
  // de Re♭ mayor queda Fa, La♭, Do, Mi♭ y Si♭); si la oncena tampoco es justa, se queda en cuatriada.
  function chordOf(deg, tones, st) {
    const sc = chordScale(st.scale), L = sc.length, d = ((deg % L) + L) % L;
    const pcs = [];
    for (let k = 0; k < tones; k++) pcs.push(pc(st.tonic + sc[(d + 2 * k) % L]));
    if (tones >= 5 && pc(pcs[4] - pcs[0]) === 1) {
      const eleventh = pc(st.tonic + sc[(d + 10) % L]);
      if (pc(eleventh - pcs[0]) === 5) pcs[4] = eleventh; else pcs.pop();
    }
    const chord = { deg: d, root: pcs[0], pcs };
    chord.name = chordName(chord);
    return chord;
  }

  // Grado de la escala más cercano a la nota m (para "la elige la función")
  function degreeOf(m, st) {
    const sc = chordScale(st.scale), rel = pc(m - st.tonic);
    const dist = (s) => Math.min(Math.abs(s - rel), 12 - Math.abs(s - rel));
    let best = 0;
    sc.forEach((s, i) => { if (dist(s) < dist(sc[best])) best = i; });
    return best;
  }

  // Nombre del acorde: Do♯maj9, Re♯m9, Fam7(11), Sol9, Sim7♭5(11)…
  function chordName({ root, pcs }) {
    const iv = new Set(pcs.map((p) => pc(p - root))), has = (x) => iv.has(x);
    const minor = has(3) && !has(4), dim = minor && has(6) && !has(7), aug = has(4) && has(8) && !has(7);
    const n7 = has(11) ? 'maj7' : has(10) ? '7' : has(9) && dim ? '°7' : '';
    let s;
    if (dim) s = n7 === '7' ? 'm7♭5' : n7 === '°7' ? '°7' : n7 === 'maj7' ? '°(maj7)' : '°';
    else if (minor) s = n7 === 'maj7' ? 'm(maj7)' : 'm' + n7;
    else s = (aug ? '+' : '') + n7;
    if (pcs.length >= 5) {
      if (n7 && has(2)) s = s.replace('7', '9');
      else if (has(5)) s += '(11)';
      else if (has(2)) s += 'add9';
    }
    return music.NOTE_NAMES[root] + s;
  }

  // Dónde suenan las voces: las de arriba en [lo, hi] y la grave una octava por debajo de `bass`.
  // "fijo": siempre el mismo registro, de La2–Sol♯3 hacia arriba según la tónica (no depende de la
  // octava de la melodía); "curva": la ventana se centra en la nota m de la función.
  function register(st, n, tones, mode, m) {
    const span = Math.min(36, 12 * Math.ceil((n - 1) / tones) + 5); // cabe una nota distinta por voz
    const base = 45 + pc(st.tonic - 9);
    if (mode === 'curva' && Number.isFinite(m)) {
      const lo = Math.round(Math.min(96 - span, Math.max(base, m - span / 2)));
      return { lo, hi: lo + span, bass: base };
    }
    return { lo: base, hi: base + span, bass: base };
  }

  // Cuánto pesa que falte cada nota del acorde (por su lugar: fundamental, 3.ª, 5.ª, 7.ª, 9.ª):
  // sin tercera o sin séptima el acorde cambia de carácter; la quinta es la que menos se echa en falta
  const MISSING = [0, 10, 2, 8, 4];

  // Notas de las n voces para un acorde, de grave a agudo. La grave es la fundamental, la más cercana a la
  // grave anterior. Para las demás se prueban los repartos posibles entre las notas del acorde de la
  // ventana y se elige el que menos mueve las voces (sin cruzarlas) dejando sonar todas las notas del
  // acorde; si no hay voces anteriores, el más repartido por la ventana.
  function voicing(chord, n, prev, win) {
    const keep = prev && prev.length === n;
    const roots = []; // siempre por debajo de las voces de arriba
    for (let m = win.bass - 13; m < win.bass; m++) if (pc(m) === chord.root) roots.push(m);
    const bass = keep
      ? roots.reduce((a, c) => (Math.abs(c - prev[0]) < Math.abs(a - prev[0]) ? c : a))
      : roots.find((m) => m >= win.bass - 12 && m < win.bass);

    const k = n - 1;
    let cand = [];
    for (let hi = win.hi; cand.length < k && hi <= 120; hi += 12) {
      cand = [];
      for (let m = win.lo; m <= hi; m++) if (chord.pcs.includes(pc(m))) cand.push(m);
    }
    const targets = keep ? prev.slice(1).sort((a, b) => a - b)
      : Array.from({ length: k }, (_, i) => win.lo + ((win.hi - win.lo) * (i + 0.5)) / k);
    const need = chord.pcs.map((p, i) => [p, MISSING[i] ?? 2]).slice(1); // la fundamental ya está en el bajo

    let best = null, bestCost = Infinity;
    const take = new Array(k);
    const search = (i, j, cost) => {
      if (cost >= bestCost) return;
      if (i === k) {
        let c = cost;
        for (const [p, w] of need) if (!take.some((m) => pc(m) === p)) c += w;
        if (c < bestCost) { bestCost = c; best = take.slice(); }
        return;
      }
      for (let jj = j; jj <= cand.length - (k - i); jj++) {
        take[i] = cand[jj];
        search(i + 1, jj + 1, cost + Math.abs(cand[jj] - targets[i]));
      }
    };
    search(0, 0, 0);
    return [bass, ...(best || cand.slice(0, k))];
  }

  // Nota del arpegio sobre el acorde que suena: 0 fundamental, 1 tercera, 2 quinta, 3 octava, 4 décima…,
  // desde la fundamental más cercana por debajo de q (la nota de la función)
  function arpNote(chord, q, idx) {
    const base = q - pc(q - chord.root);
    const iv = chord.pcs.slice(0, 3).map((p) => pc(p - chord.root));
    return base + iv[idx % 3] + 12 * Math.floor(idx / 3);
  }

  // Lugar de cada voz en el estéreo: la grave al centro; las demás alternan izquierda y derecha, cada vez
  // más abiertas hacia el agudo
  function panSpread(n) {
    const k = n - 1;
    return [0, ...Array.from({ length: k }, (_, j) => (j % 2 ? 1 : -1) * (0.2 + (0.55 * j) / Math.max(1, k - 1)))];
  }

  // Nota del acorde más cercana a q (si hay dos igual de cerca, la de abajo): la melodía cae en ella en
  // los pulsos para no chocar con el acorde
  function snapToChord(q, chord) {
    for (let d = 0; d <= 6; d++) {
      if (chord.pcs.includes(pc(q - d))) return q - d;
      if (chord.pcs.includes(pc(q + d))) return q + d;
    }
    return q;
  }

  // Espiral: progreso u de 0 a 1. Empieza separada `A` semitonos del centro, gira cada vez más deprisa
  // (de 1,5 a 7,5 vueltas por espiral) y el radio se cierra hasta cero.
  const spiralPhase = (u) => Math.PI / 2 + 2 * Math.PI * (1.5 * u + 3 * u * u);
  const spiralRadius = (A, u) => A * Math.pow(1 - u, 1.3);

  // Línea de una voz: { b0, b1, segs: [{ b0, b1, p0, p1 }] } en pulsos y notas MIDI; b1 = Infinity
  // mientras suena. Entre tramos la nota se queda quieta.
  function lineAt(L, b) {
    if (b < L.b0 || b > L.b1) return null;
    let p = L.segs[0].p0;
    for (const s of L.segs) {
      if (b < s.b0) break;
      if (b >= s.b1) { p = s.p1; continue; }
      return s.p0 + (s.p1 - s.p0) * smooth((b - s.b0) / (s.b1 - s.b0));
    }
    return p;
  }

  // Recorre la línea entre los pulsos a y z llamando a emit(b, p) en los puntos que hacen falta para
  // dibujarla: los tramos quietos son rectas y cada curva en S lleva 16 puntos. false si no hay nada.
  function trace(L, a, z, emit) {
    a = Math.max(a, L.b0); z = Math.min(z, L.b1);
    if (!(z > a)) return false;
    emit(a, lineAt(L, a));
    for (const s of L.segs) {
      if (s.b1 <= a || s.b1 === s.b0) continue;
      if (s.b0 >= z) break;
      for (let k = 0; k <= 16; k++) {
        const b = s.b0 + ((s.b1 - s.b0) * k) / 16;
        if (b > a && b < z) emit(b, s.p0 + (s.p1 - s.p0) * smooth(k / 16));
      }
    }
    emit(z, lineAt(L, z));
    return true;
  }

  class ChordLayer {
    constructor(engine) {
      this.E = engine;
      this.voices = [];   // voces del motor (de grave a aguda)
      this.notes = [];    // nota a la que va cada voz
      this.vlines = [];   // línea de cada voz que suena
      this.lines = [];    // líneas para dibujar, también las de voces ya apagadas
      this.inst = null;
      this.pans = [];     // paneo de cada voz (ver panSpread)
      this.spiral = null; // espiral programada (hasta el abanico)
      this.drawn = null;  // última espiral, para dibujarla
    }

    get on() { return this.voices.length > 0; }

    voice(t, m, inst, gain, pan = 0) {
      const I = MS.INSTRUMENTS[inst]?.voice ? MS.INSTRUMENTS[inst] : MS.INSTRUMENTS.pad;
      return I.voice(this.E, t, music.mtof(m), { dest: this.E.chordIn, gain: gain * (TRIM[inst] ?? 1), pan });
    }

    line(b, m) {
      const L = { b0: b, b1: Infinity, segs: [{ b0: b, b1: b, p0: m, p1: m }] };
      this.lines.push(L);
      return L;
    }

    // Voces nuevas desde t (pulso b) en las notas `notes`; las que sonaban se apagan.
    // `pan0`: si se indica, todas empiezan en ese paneo (el abanico las abre luego)
    start(t, b, notes, inst, gain, pan0) {
      this.stop(t, b);
      this.inst = inst;
      this.pans = panSpread(notes.length);
      this.voices = notes.map((m, i) => this.voice(t, m, inst, gain, pan0 ?? this.pans[i]));
      this.notes = [...notes];
      this.vlines = notes.map((m) => this.line(b, m));
    }

    // Cada voz va a su nota nueva con una curva en S entre t y t + dur (del pulso b al b + db).
    // Son puntos con rampa lineal, como el glissando: setValueCurveAtTime bloqueaba Chrome.
    glide(t, b, targets, dur, db) {
      const K = Math.max(8, Math.round(dur * 40));
      targets.forEach((p1, i) => {
        const v = this.voices[i], L = this.vlines[i], p0 = this.notes[i];
        if (!v || p0 === p1) return;
        v.set(t, music.mtof(p0)); // la nota se mantiene hasta que empieza a moverse
        for (let k = 1; k <= K; k++) v.set(t + (dur * k) / K, music.mtof(p0 + (p1 - p0) * smooth(k / K)));
        L.segs.push({ b0: b, b1: b + db, p0, p1 });
        this.notes[i] = p1;
      });
    }

    // Espiral entre t0 y t1 (pulsos b0 … b1): dos voces giran alrededor de `center` cada vez más cerca
    // y más deprisa hasta juntarse. Las voces que sonaban se apagan.
    spiralStart(t0, t1, b0, b1, center, A, inst, gain) {
      this.stop(t0, b0);
      const D = t1 - t0, K = Math.max(40, Math.round(D * 60));
      const S = { t0, t1, b0, b1, center, A, voices: [] };
      // las dos voces son los dos puntos opuestos del círculo: la altura es el seno del ángulo y el
      // paneo, el coseno, así que también giran entre izquierda y derecha
      for (const sg of [1, -1]) {
        const at = (u) => center + sg * spiralRadius(A, u) * Math.sin(spiralPhase(u));
        const side = (u) => (0.85 * sg * spiralRadius(A, u) * Math.cos(spiralPhase(u))) / A;
        const v = this.voice(t0, at(0), inst, gain, side(0));
        for (let k = 1; k <= K; k++) {
          v.set(t0 + (D * k) / K, music.mtof(at(k / K)));
          v.pan.linearRampToValueAtTime(side(k / K), t0 + (D * k) / K);
        }
        v.stop(t1 + 0.04, 0.12);
        S.voices.push(v);
      }
      this.spiral = this.drawn = S;
    }

    // Dónde están las dos voces de la espiral en el pulso b (para dibujarlas), o null
    spiralAt(b) {
      const S = this.drawn;
      if (!S || b < S.b0 || b >= Math.min(S.b1, S.cut ?? Infinity)) return null;
      const u = (b - S.b0) / (S.b1 - S.b0);
      return { center: S.center, r: spiralRadius(S.A, u), phi: spiralPhase(u) };
    }

    // Abanico: en t (pulso b) las voces salen juntas del centro de la espiral hacia `targets`, y del
    // centro del estéreo hacia su lado
    fanOut(t, b, targets, dur, db, inst, gain) {
      const c = this.spiral ? this.spiral.center : targets[targets.length >> 1];
      this.spiral = null;
      this.start(t, b, targets.map(() => c), inst, gain, 0);
      this.voices.forEach((v, i) => { v.pan.setValueAtTime(0, t); v.pan.linearRampToValueAtTime(this.pans[i], t + dur); });
      this.glide(t, b, targets, dur, db);
    }

    // Apaga las voces en t (pulso b); si había una espiral a medias, también
    stop(t, b) {
      const at = Math.max(t ?? 0, this.E.now);
      for (const v of this.voices) v.stop(at, 0.35);
      const S = this.spiral;
      if (S && at < S.t1 - 1e-3) {
        for (const v of S.voices) v.stop(at, 0.15);
        S.cut = b;
      }
      for (const L of this.vlines) L.b1 = b;
      this.voices = [];
      this.vlines = [];
      this.notes = [];
      this.spiral = null;
    }

    // Olvida lo que ya no se dibuja (todo lo que acabó antes del pulso minBeat)
    prune(minBeat) {
      this.lines = this.lines.filter((L) => L.b1 >= minBeat);
      for (const L of this.lines) while (L.segs.length > 1 && L.segs[1].b0 < minBeat) L.segs.shift();
      if (this.drawn && this.drawn.b1 < minBeat) this.drawn = null;
    }

    clear() { this.lines = []; this.drawn = null; }
  }

  MS.CHORDS = { PROGRESSIONS, RICHNESS, VOICINGS, INSTS, chordOf, degreeOf, chordName, register, voicing, arpNote, snapToChord,
    lineAt, trace, ChordLayer };
})(globalThis.MS = globalThis.MS || {});
