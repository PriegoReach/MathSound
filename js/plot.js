// Gráfica en canvas: la curva se va dibujando mientras suena y un punto marca la posición actual.
// El fondo es una pauta: líneas verticales en cada pulso (más marcadas cada compás de 4 pulsos)
// y líneas horizontales en las notas de la escala, para ver qué nota suena a cada altura.
// Si suenan acordes, sus voces se dibujan como líneas que avanzan con el cursor y la escala vertical se
// amplía para que quepan todas.
// Los colores se leen de las variables CSS --plot-* y --pen-* (ver css/styles.css).
(function (MS) {
  'use strict';

  const FONT_VAR = 'KaTeX_Math, "Cambria Math", "Times New Roman", serif';

  class Plot {
    constructor(canvas) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      this.fn = null;
      this.extra = null; // [y1, y2] que también tienen que verse (las voces de los acordes)
      this.m = { l: 48, r: 44, t: 34, b: 22 };
      this.readTheme();
      new ResizeObserver(() => this.resize()).observe(canvas);
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.readTheme());
      this.resize();
    }

    // Colores y fuentes del tema actual; hay que volver a llamarla cuando cambia el tema.
    readTheme() {
      const s = getComputedStyle(this.c);
      const v = (k) => {
        const x = s.getPropertyValue(k).trim();
        return x && x !== 'none' ? x : null;
      };
      this.th = {
        bg: v('--plot-bg') || '#ffffff',
        beat: v('--plot-beat'), bar: v('--plot-bar'),
        note: v('--plot-note'), tonic: v('--plot-tonic'), noteText: v('--plot-note-text'),
        axis: v('--plot-axis') || '#000000', text: v('--plot-text') || '#000000', dot: v('--plot-dot') || '#000000',
        curve: v('--plot-curve'),
        voice: v('--plot-voice') || v('--plot-axis') || '#000000',
        pens: ['--pen-1', '--pen-2', '--pen-3', '--pen-4'].map(v),
        ghost: parseFloat(v('--plot-ghost')) || 0.15,
        glow: v('--plot-glow') === '1',
        ui: v('--font-ui-narrow') || 'system-ui, sans-serif',
      };
    }

    // El tono (hue) de la función elige una de las cuatro plumas: rojo, verde, azul, violeta.
    pen(hue) {
      if (this.th.curve) return this.th.curve;
      const i = Math.floor((((hue % 360) + 360) % 360) / 90);
      return this.th.pens[i] || this.th.axis;
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = Math.max(10, r.width);
      this.h = Math.max(10, r.height);
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.fn) this.setFunction(this.fn, this.xMin, this.xMax, this.extra);
    }

    setFunction(fn, xMin, xMax, extra = null) {
      this.fn = fn; this.xMin = xMin; this.xMax = xMax; this.extra = extra;
      let lo = fn.lo, hi = fn.hi;
      if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
      if (extra) { lo = Math.min(lo, ...extra); hi = Math.max(hi, ...extra); }
      const span = hi - lo;
      if (lo > 0 && lo < span * 0.6) lo = 0;    // incluir el eje x si queda cerca
      if (hi < 0 && -hi < span * 0.6) hi = 0;
      const pad = (hi - lo) * 0.1;
      this.yLo = lo - pad; this.yHi = hi + pad;

      const n = Math.max(400, Math.round(this.w * 2));
      this.xs = new Float64Array(n + 1);
      this.ys = new Float64Array(n + 1);
      for (let i = 0; i <= n; i++) {
        const x = xMin + ((xMax - xMin) * i) / n;
        this.xs[i] = x;
        this.ys[i] = fn.f(x);
      }
    }

    X(x) { const m = this.m; return m.l + ((x - this.xMin) / (this.xMax - this.xMin)) * (this.w - m.l - m.r); }
    Y(y) {
      const m = this.m;
      const py = m.t + ((this.yHi - y) / (this.yHi - this.yLo)) * (this.h - m.t - m.b);
      return Math.max(-this.h, Math.min(2 * this.h, py));
    }

    // Traza la curva desde xMin hasta xEnd, cortando en discontinuidades grandes
    path(xEnd) {
      const g = this.g, jump = this.h * 0.4;
      g.beginPath();
      let pen = false, prev = 0;
      const seg = (x, y) => {
        if (!Number.isFinite(y)) { pen = false; return; }
        const px = this.X(x), py = this.Y(y);
        if (pen && Math.abs(py - prev) > jump) pen = false;
        if (pen) g.lineTo(px, py); else g.moveTo(px, py);
        pen = true; prev = py;
      };
      for (let i = 0; i < this.xs.length && this.xs[i] <= xEnd; i++) seg(this.xs[i], this.ys[i]);
      if (xEnd < this.xMax) seg(xEnd, this.fn.f(xEnd));
    }

    // Líneas verticales en cada pulso; la de cada compás (4 pulsos) más marcada
    drawBeats(xPerBeat, T, B) {
      const g = this.g, th = this.th;
      if (!th.beat || !(xPerBeat > 0)) return;
      const n = Math.floor((this.xMax - this.xMin) / xPerBeat + 1e-9);
      g.lineWidth = 1;
      for (const bar of [false, true]) {
        g.strokeStyle = bar ? th.bar || th.beat : th.beat;
        g.beginPath();
        for (let k = 0; k <= n; k++) {
          if ((k % 4 === 0) !== bar) continue;
          const px = Math.round(this.X(this.xMin + k * xPerBeat)) + 0.5;
          g.moveTo(px, T); g.lineTo(px, B);
        }
        g.stroke();
      }
    }

    // Líneas horizontales en las notas de la escala, con su nombre en el margen izquierdo.
    // Si no caben todos los nombres se escriben solo los de la tónica y el de la nota que suena.
    drawNotes(notes, noteNow, curve, L, R, T, B) {
      const g = this.g, th = this.th;
      if (!notes || !notes.length || !th.note) return;
      const ys = notes.map((n) => Math.round(this.Y(n.y)) + 0.5);
      let gap = Infinity;
      for (let i = 1; i < ys.length; i++) gap = Math.min(gap, Math.abs(ys[i] - ys[i - 1]));
      const now = notes.findIndex((n) => n.m === noteNow);
      const nowY = now >= 0 ? ys[now] : null;

      g.textAlign = 'right'; g.textBaseline = 'middle';
      notes.forEach((n, i) => {
        const py = ys[i];
        if (py < T - 4 || py > B + 4) return;
        const isNow = i === now;
        g.strokeStyle = isNow ? curve : n.tonic ? th.tonic : th.note;
        g.globalAlpha = isNow ? 0.55 : 1;
        g.lineWidth = isNow ? 2 : 1;
        g.beginPath(); g.moveTo(L, py); g.lineTo(R, py); g.stroke();
        g.globalAlpha = 1;

        const room = gap >= 13 || n.tonic;
        if (isNow || (room && (nowY === null || Math.abs(py - nowY) >= 12))) {
          g.font = `${isNow || n.tonic ? 600 : 500} 12px ${th.ui}`;
          g.fillStyle = isNow ? curve : n.tonic ? th.text : th.noteText;
          g.fillText(n.name, L - 8, py);
        }
      });
    }

    // Voces de los acordes. V = { lines, from, now, at, trace, spiral, xOf, yOf }: cada línea va del
    // principio de la vuelta (pulso `from`) al cursor (`now`) y acaba en un punto; durante la espiral, dos
    // puntos giran en un círculo que se cierra.
    drawVoices(V) {
      const g = this.g, th = this.th;
      const P = (b, p) => [this.X(V.xOf(b)), this.Y(V.yOf(p))];
      g.strokeStyle = th.voice; g.fillStyle = th.voice;
      g.lineWidth = 1.8;
      g.globalAlpha = 0.85;
      const dots = [];
      for (const L of V.lines) {
        let first = true;
        g.beginPath();
        const drawn = V.trace(L, V.from, V.now, (b, p) => {
          const [px, py] = P(b, p);
          if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py);
        });
        if (drawn) g.stroke();
        if (V.now >= L.b0 && V.now <= L.b1) dots.push(P(V.now, V.at(L, V.now)));
      }
      g.globalAlpha = 1;
      const S = V.spiral;
      if (S) {
        const [cx, cy] = P(V.now, S.center);
        const R = Math.abs(P(V.now, S.center + S.r)[1] - cy);
        g.lineWidth = 1.4;
        g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();
        dots.push([cx + R * Math.cos(S.phi), cy - R * Math.sin(S.phi)], [cx - R * Math.cos(S.phi), cy + R * Math.sin(S.phi)]);
      }
      for (const [px, py] of dots) {
        g.beginPath(); g.arc(px, py, 3.6, 0, Math.PI * 2); g.fill();
      }
    }

    draw(o) {
      const g = this.g, th = this.th, w = this.w, h = this.h, m = this.m;
      const L = m.l, R = w - m.r, T = m.t, B = h - m.b;
      const curve = this.pen(o.hue);
      g.fillStyle = th.bg;
      g.fillRect(0, 0, w, h);
      if (!this.fn) return;

      this.drawBeats(o.xPerBeat, T, B);
      this.drawNotes(o.notes, o.noteNow, curve, L, R, T, B);

      // ejes con flechas
      const ax = Math.max(T, Math.min(B, this.Y(0)));
      const ay = Math.max(L, Math.min(R, this.X(0)));
      g.strokeStyle = g.fillStyle = th.axis;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(L, ax); g.lineTo(R + 14, ax);
      g.moveTo(ay, B + 6); g.lineTo(ay, T - 12);
      g.stroke();
      g.beginPath();
      g.moveTo(R + 22, ax); g.lineTo(R + 10, ax - 5); g.lineTo(R + 10, ax + 5);
      g.moveTo(ay, T - 20); g.lineTo(ay - 5, T - 8); g.lineTo(ay + 5, T - 8);
      g.fill();
      g.fillStyle = th.text;
      g.font = `italic 20px ${FONT_VAR}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillText('x', R + 27, ax);
      g.fillText('y', ay + 10, T - 16);

      g.lineJoin = 'round'; g.lineCap = 'round';

      // curva completa en tenue
      if (o.ghost) {
        g.globalAlpha = th.ghost;
        g.strokeStyle = curve; g.lineWidth = 2;
        this.path(this.xMax); g.stroke();
        g.globalAlpha = 1;
      }

      if (o.voices) this.drawVoices(o.voices);

      // tramo ya recorrido
      g.strokeStyle = curve;
      g.lineWidth = 2.6 + o.pulse * 1.2;
      if (th.glow) { g.shadowColor = curve; g.shadowBlur = 8 + o.pulse * 14; }
      this.path(o.progressX); g.stroke();
      g.shadowBlur = 0;

      // punto actual, con un aro del color del fondo para separarlo de la curva
      if (o.dotX == null) return;
      const y = this.fn.f(o.dotX);
      if (!Number.isFinite(y)) return;
      const px = this.X(o.dotX), py = this.Y(y);
      const r = 6 + o.pulse * 3;
      if (th.glow) { g.shadowColor = curve; g.shadowBlur = 16 + o.pulse * 20; }
      g.fillStyle = th.dot;
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = th.bg; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, r + 1, 0, Math.PI * 2); g.stroke();

      // nombre de la nota encima del punto (debajo si no cabe arriba); pegado al margen
      // izquierdo no hace falta, ya se lee en la pauta
      if (o.label && !(o.notes && th.note && px - L < 36)) {
        const above = py - r - 26 > 0;
        g.font = `600 14px ${th.ui}`;
        g.textAlign = 'center';
        g.textBaseline = above ? 'bottom' : 'top';
        const ly = above ? py - r - 8 : py + r + 8;
        g.lineWidth = 4; g.strokeStyle = th.bg;
        g.strokeText(o.label, px, ly);
        g.fillStyle = th.text;
        g.fillText(o.label, px, ly);
      }
    }
  }

  MS.Plot = Plot;
})(globalThis.MS = globalThis.MS || {});
