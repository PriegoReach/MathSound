// Generador de funciones aleatorias "musicales".
// En lugar de árboles de expresión totalmente aleatorios (que suenan a ruido), combina
// familias con estructura rítmica: fases periódicas (x mod 1), escalones (⌊x⌋),
// envolventes que decaen por compás, aritmética modular para arpegios, etc.
(function (MS) {
  'use strict';
  const { B, makeFunction, parse } = MS.expr;
  const { num, x, pi, neg, add, sub, mul, div, pow, fn, mod } = B;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  // (k·x) mod 1  → fase en [0, 1)
  const phase = (k = 1) => mod(k === 1 ? x() : mul(num(k), x()), num(1));
  // ⌊k·x⌋
  const steps = (k = 1) => fn('floor', k === 1 ? x() : mul(num(k), x()));

  // Formas de onda sobre una fase p ∈ [0,1), todas con valores en [0,1]
  const SHAPES = [
    (p) => sub(num(1), pow(sub(mul(num(2), p), num(1)), num(2))),   // arco: 1-(2p-1)²
    (p) => sub(num(1), fn('abs', sub(mul(num(2), p), num(1)))),     // triángulo
    (p) => fn('sin', mul(pi(), p)),                                  // medio seno
    (p) => p,                                                        // sierra
    (p) => sub(num(1), p),                                           // sierra invertida
    (p) => fn('exp', neg(mul(num(pick([3, 4, 5])), p))),             // golpe con caída
  ];
  const shape = (p) => pick(SHAPES)(p);

  // Funciones a trozos: if(condición, a, b)
  const cmp = (op, a, b) => ({ t: 'cmp', op, a, b });
  const iff = (c, a, b) => fn('if', c, a, b);
  // Onda triangular de periodo 1 en [-1, 1]: 4|u − ⌊u + ¾⌋ + ¼| − 1
  const tri = (u) => sub(mul(num(4), fn('abs', add(sub(u, fn('floor', add(u, num(0.75)))), num(0.25)))), num(1));
  // ±A alternando k veces por unidad: un trino entre los dos extremos
  const trill = (A, k) => mul(num(A), sub(num(1), mul(num(2), fn('floor', mul(num(2), phase(k))))));

  const FAMILIES = [
    {
      name: 'Arcos decrecientes', w: 3,
      make() { // A·e^{-c⌊x mod n⌋}·forma(x mod 1) − A/2  (como el video)
        const A = r1(rand(2, 4)), c = r2(rand(0.3, 0.9)), n = pick([2, 3, 4, 4, 8]);
        const env = fn('exp', neg(mul(num(c), fn('floor', mod(x(), num(n))))));
        return sub(mul(mul(num(A), env), shape(phase(pick([1, 1, 1, 2])))), num(r1(A / 2)));
      },
    },
    {
      name: 'Escalera melódica', w: 3,
      make() { // A·sin(c⌊kx⌋) + B·forma(x mod 1): una "melodía" pseudoaleatoria por pulso
        const A = r1(rand(1, 2.5)), c = r2(rand(0.6, 2.9)), Bv = r1(rand(0.2, 0.8));
        return add(mul(num(A), fn('sin', mul(num(c), steps(pick([1, 2]))))),
          mul(num(Bv), shape(phase(pick([1, 2])))));
      },
    },
    {
      name: 'Arpegio modular', w: 3,
      make() { // A·((m⌊kx⌋) mod n) − offset: secuencias que se repiten cada n pasos
        const m = pick([2, 3, 3, 5, 7]), n = pick([4, 5, 6, 7, 8]), A = r1(rand(0.4, 0.8));
        const seq = mod(mul(num(m), steps(pick([1, 2, 2, 4]))), num(n));
        return sub(mul(num(A), seq), num(r1((A * (n - 1)) / 2)));
      },
    },
    {
      name: 'Ondas', w: 2,
      make() {
        const a = pick([0.25, 0.5, 1, 1.5]), b = pick([1, 2, 3, 4]);
        const A = r1(rand(1, 2)), Bv = r1(rand(0.3, 1));
        const s1 = fn('sin', mul(mul(num(a), pi()), x()));
        const s2 = fn('cos', mul(mul(num(b), pi()), x()));
        return Math.random() < 0.5
          ? add(mul(num(A), s1), mul(num(Bv), s2))
          : mul(mul(num(A + Bv), s1), s2);
      },
    },
    {
      name: 'Rebotes', w: 2,
      make() { // A·|sin(πkx)|·e^{-c(x mod n)} − A/2
        const k = pick([1, 2]), n = pick([2, 4]), c = r2(rand(0.4, 1.2)), A = r1(rand(2.5, 4));
        const bounce = fn('abs', fn('sin', mul(k === 1 ? pi() : mul(num(k), pi()), x())));
        const env = fn('exp', neg(mul(num(c), mod(x(), num(n)))));
        return sub(mul(mul(num(A), bounce), env), num(r1(A / 2)));
      },
    },
    {
      name: 'Subida en sierra', w: 2,
      make() { // rampa que sube durante n pulsos + ondulación rápida
        const n = pick([2, 4, 8]), A = r1(rand(2, 3.5)), Bv = r1(rand(0.3, 0.8));
        const ramp = mul(num(A), div(mod(x(), num(n)), num(n)));
        return sub(add(ramp, mul(num(Bv), SHAPES[1](phase(pick([2, 4]))))), num(r1(A / 2)));
      },
    },
    {
      name: 'Saltos de octava', w: 2,
      make() { // ⌊2·(kx mod 1)⌋ alterna 0/1 (salto de octava) sobre una escalera
        const A = r1(rand(1, 2)), Bv = r1(rand(0.8, 1.6)), c = r2(rand(0.7, 2.5));
        return add(mul(num(A), fn('floor', mul(num(2), phase(pick([1, 2]))))),
          mul(num(Bv), fn('sin', mul(num(c), steps(1)))));
      },
    },
    {
      name: 'Polirritmo', w: 2,
      make() { // dos ciclos con periodos distintos (1 y 3/4, 2/3, 1.5…)
        const per = pick([0.75, 1.5, 0.5, 1.25, 2 / 3]), A = r1(rand(1, 2)), Bv = r1(rand(1, 2));
        const P = r2(per);
        return sub(add(mul(num(A), shape(phase(1))), mul(num(Bv), div(mod(x(), num(P)), num(P)))),
          num(r1((A + Bv) / 2)));
      },
    },
    {
      name: 'Batido', w: 2,
      make() { // producto de una forma rápida y otra lenta (modulación de amplitud)
        const A = r1(rand(2, 3.5));
        return sub(mul(mul(num(A), shape(phase(pick([1, 2])))), shape(phase(pick([0.25, 0.5])))),
          num(r1(A / 4)));
      },
    },
    {
      name: 'Contador binario', w: 2,
      make() { // suma de bits de ⌊kx⌋: una secuencia que se repite cada 8 pasos
        const k = pick([1, 2]), w = [r1(rand(0.6, 1.2)), r1(rand(0.9, 1.6)), r1(rand(1.2, 2.2))];
        const bit = (d) => mod(fn('floor', mul(num(k / d), x())), num(2));
        const sum = add(add(mul(num(w[0]), bit(1)), mul(num(w[1]), bit(2))), mul(num(w[2]), bit(4)));
        return sub(sum, num(r1((w[0] + w[1] + w[2]) / 2)));
      },
    },
    {
      name: 'Raíz creciente', w: 2,
      make() { // √(x mod n): sube rápido y se frena, como un "riser"
        const n = pick([1, 2, 4]), A = r1(rand(2, 3.5));
        const root = fn('sqrt', mod(x(), num(n)));
        const norm = n === 1 ? root : div(root, num(r2(Math.sqrt(n))));
        const melody = mul(num(r1(rand(0.3, 0.8))), fn('sin', mul(num(r2(rand(0.7, 2.5))), steps(1))));
        return sub(add(mul(num(A), norm), melody), num(r1(A / 2)));
      },
    },
    {
      name: 'Trino', w: 2,
      make() { // escalera melódica con un trino rápido entre dos notas
        const A = r1(rand(1, 2.2)), c = r2(rand(0.7, 2.6)), T = r1(rand(0.3, 0.6)), k = pick([4, 6, 8]);
        return add(mul(num(A), fn('sin', mul(num(c), steps(1)))), mul(num(T), fn('floor', mul(num(2), phase(k)))));
      },
    },
    {
      name: 'Llamada y respuesta', w: 2,
      make() { // sign(sin(…)) da la vuelta a la frase: unos compases sube, otros baja
        const A = r1(rand(1.5, 3)), per = pick([0.5, 0.25]);
        const call = fn('sign', fn('sin', mul(mul(num(per), pi()), x())));
        const melody = mul(num(r1(rand(0.3, 0.7))), fn('sin', mul(num(r2(rand(0.8, 2.4))), steps(1))));
        return add(mul(mul(num(A), call), shape(phase(pick([1, 2])))), melody);
      },
    },
    {
      name: 'Tangente recortada', w: 1,
      make() { // tan recortada con min/max: glissandos que suben y se quedan arriba
        const L = r1(rand(1.5, 2.5)), c = r2(rand(0.4, 1)), k = pick([1, 0.5]);
        const tg = fn('tan', sub(mul(pi(), phase(k)), mul(num(0.5), pi())));
        return fn('min', num(L), fn('max', num(-L), mul(num(c), tg)));
      },
    },
    {
      name: 'Pulsos de Gauss', w: 2,
      make() { // una campana de Gauss por pulso, cada una más alta: arpegio que crece
        const n = pick([3, 4, 4, 6]), A = r1(rand(0.6, 1)), k = pick([12, 20, 30]);
        const bump = fn('exp', neg(mul(num(k), pow(sub(phase(1), num(0.5)), num(2)))));
        const height = add(num(1), mod(steps(1), num(n)));
        return sub(mul(mul(num(A), height), bump), num(r1((A * n) / 3)));
      },
    },
    {
      name: 'Seno escalonado', w: 2,
      make() { // round(q·sin(…)): la onda redondeada a 2q+1 escalones
        const q = pick([2, 3, 4]), a = pick([0.25, 0.5, 0.75, 1]), A = r1(rand(1.2, 2) / q);
        return mul(num(A), fn('round', mul(num(q), fn('sin', mul(mul(num(a), pi()), x())))));
      },
    },
    {
      name: 'Caída 808', w: 2,
      make() { // cada pulso mantiene una nota y al final se desliza hacia abajo, como un 808
        const A = r1(rand(1.2, 2.4)), c = r2(rand(0.7, 2.7)), D = r1(rand(1, 2)), p = pick([2, 3, 4]);
        return sub(mul(num(A), fn('sin', mul(num(c), steps(1)))), mul(num(D), pow(phase(pick([1, 2])), num(p))));
      },
    },
    // ----- Inspiradas en el video de referencia de funciones convertidas en tono -----
    {
      name: 'Trino, nota y sierra', w: 2,
      make() { // a trozos: trino rápido, una nota quieta y una sierra, repetidos cada P unidades
        const P = pick([2, 4]), a1 = r2(P * rand(0.2, 0.35)), a2 = r2(a1 + P * rand(0.2, 0.35));
        const ph = mod(x(), num(P));
        const saw = mul(num(r1(rand(3, 5))), sub(mul(num(2), x()), fn('floor', add(mul(num(2), x()), num(0.5)))));
        return iff(cmp('<', ph, num(a1)), trill(r1(rand(2, 3)), pick([4, 6, 8])),
          iff(cmp('<', ph, num(a2)), num(r1(rand(-1.5, 1.5))), saw));
      },
    },
    {
      name: 'Compuertas', w: 2,
      make() { // encendido/apagado con duraciones que cambian en cada pulso: salta entre dos notas
        const A = r1(rand(1.2, 1.8)), n = pick([2, 3, 4]);
        const len = add(num(r2(rand(0.1, 0.25))), mul(num(r2(rand(0.15, 0.3))), mod(steps(1), num(n))));
        const gate = sub(num(1), fn('min', num(1), fn('floor', div(phase(1), len))));
        const g = sub(mul(num(2 * A), gate), num(A));
        return Math.random() < 0.5 ? g : add(g, mul(num(r1(rand(0.4, 0.8))), fn('sin', mul(num(r2(rand(0.8, 2.5))), steps(1)))));
      },
    },
    {
      name: 'Senos anidados', w: 2,
      make() { // sin(5 sin(4 sin(3 sin(2 sin x)))): oscila tan rápido que suena a FM
        let inner = fn('sin', mul(num(pick([0.5, 1, 1, 1.5])), x()));
        for (const k of [2, 3, 4, 5].slice(0, pick([2, 3, 4]))) inner = fn('sin', mul(num(k), inner));
        return mul(num(r1(rand(2, 3))), inner);
      },
    },
    {
      name: 'Asíntotas', w: 1,
      make() { // el tono se hunde o se dispara cerca de cada asíntota
        return pick([
          () => fn('tan', div(pow(x(), num(2)), num(pick([3, 4, 6])))),
          () => div(num(pick([1, 2, 3])), x()),
          () => fn('tan', mul(num(r2(rand(0.3, 0.8))), x())),
          () => div(add(pow(x(), num(2)), num(1)), mul(num(3), x())),
          () => div(num(r1(rand(0.3, 0.6))), sub(phase(pick([0.5, 0.25])), num(0.5))),
        ])();
      },
    },
    {
      name: 'Pliegues triangulares', w: 1,
      make() { // ondas triangulares compuestas unas dentro de otras: un fractal que suena a ruido
        let v = tri(x());
        for (let i = 1; i < pick([2, 3]); i++) v = tri(mul(num(pick([1.5, 2, 3])), v));
        return mul(num(r1(rand(2, 2.8))), v);
      },
    },
    {
      name: 'Caída con vibrato', w: 2,
      make() { // golpe exponencial que cae y un vibrato rápido encima
        const A = r1(rand(4, 6.5)), c = pick([2, 3, 4]), n = pick([2, 4]);
        const hit = sub(mul(num(A), fn('exp', neg(mul(num(c), mod(x(), num(n)))))), num(r1(A / 2)));
        return add(hit, mul(num(r1(rand(0.2, 0.5))), fn('sin', mul(num(pick([12, 16, 20, 25])), mod(x(), num(pick([3, 6])))))));
      },
    },
    {
      name: 'Sierra rota', w: 2,
      make() { // a trozos: cada n unidades una sierra escalonada distinta
        const n = pick([8, 16]), ph = mod(x(), num(2));
        const odd = sub(mul(num(r2(rand(1.4, 2))), fn('floor', mul(num(1.5), ph))), mul(num(r1(rand(1.8, 2.6))), ph));
        return iff(cmp('<', mod(x(), num(n)), num(2)), odd, sub(num(r1(rand(0.4, 0.9))), mul(num(2), ph)));
      },
    },
    {
      name: 'Escalones a trozos', w: 2,
      make() { // según ⌊x⌋: un trino, una sierra rápida o una rampa que baja
        const n = pick([8, 16]), C = r1(rand(0.7, 1.1)), B = r1(rand(1.2, 1.9));
        const fastSaw = mul(num(2 * B), sub(mul(num(4), x()), fn('floor', add(mul(num(4), x()), num(0.5)))));
        return iff(cmp('==', mod(steps(1), num(n)), num(0)), trill(r1(rand(2, 2.8)), pick([6, 9, 12])),
          iff(cmp('==', mod(steps(1), num(4)), num(0)), fastSaw, sub(num(C), mul(num(2 * C), fn('frac', x())))));
      },
    },
  ];

  function weightedPick(list) {
    const total = list.reduce((s, f) => s + f.w, 0);
    let r = Math.random() * total;
    for (const f of list) { if ((r -= f.w) <= 0) return f; }
    return list[list.length - 1];
  }

  // opts.families: nombres de las familias permitidas (las de un género) · opts.refs: probabilidad
  // de usar una de las funciones de los videos de referencia. Nunca repite la familia anterior.
  let lastFamily = null;
  function randomFunction(xMin, xMax, opts = {}) {
    if (opts.refs && Math.random() < opts.refs) return referenceFunction(Math.floor(Math.random() * REFS.length), xMin, xMax);
    let pool = opts.families ? FAMILIES.filter((f) => opts.families.includes(f.name)) : FAMILIES;
    if (!pool.length) pool = FAMILIES;
    if (pool.length > 1) pool = pool.filter((f) => f.name !== lastFamily);
    for (let tries = 0; tries < 40; tries++) {
      const fam = weightedPick(pool);
      let ast = fam.make();
      let name = fam.name;
      if (Math.random() < 0.3 && pool.length > 1) { // a veces se suma una segunda familia, más suave
        const fam2 = weightedPick(pool.filter((f) => f !== fam));
        ast = add(ast, mul(num(r1(rand(0.2, 0.5))), fam2.make()));
        name += ' + ' + fam2.name.toLowerCase();
      }
      const F = makeFunction(ast, { name }, xMin, xMax);
      if (F.finiteRatio > 0.95 && F.hi - F.lo > 0.2) {
        F.hue = Math.floor(rand(0, 360));
        lastFamily = fam.name;
        return F;
      }
    }
    return presetFunction(0, xMin, xMax);
  }

  const PRESETS = [
    { name: 'Original del video', text: '3.2*exp(-0.5*floor(mod(x, 4)))*(1 - (2*mod(x, 1) - 1)^2) - 1.6' },
    { name: 'Escalera senoidal', text: '2*sin(1.7*floor(2x)) + 0.5*(1 - abs(2*mod(x, 1) - 1))' },
    { name: 'Arpegio 3·⌊2x⌋ mod 7', text: '0.6*mod(3*floor(2x), 7) - 1.8' },
    { name: 'Pelota rebotando', text: '3.5*abs(sin(pi*x))*exp(-0.8*mod(x, 2)) - 1.7' },
    { name: 'Ondas', text: '1.5*sin(0.5*pi*x) + 0.7*cos(3*pi*x)' },
    { name: 'Sierra polirrítmica', text: 'mod(x, 1) + mod(x, 0.75)/0.75 - 1' },
    { name: 'Saltos de octava', text: '1.5*floor(2*mod(2x, 1)) + 1.2*sin(2.3*floor(x))' },
    { name: 'Contador binario', text: '0.8*mod(floor(x), 2) + 1.2*mod(floor(0.5x), 2) + 1.8*mod(floor(0.25x), 2) - 1.9' },
    { name: 'Trino sobre escalera', text: '1.6*sin(1.3*floor(x)) + 0.4*floor(2*mod(6x, 1))' },
    { name: 'Caída 808', text: '1.8*sin(2.1*floor(x)) - 1.5*mod(x, 1)^3' },
    { name: 'Seno escalonado', text: '0.5*round(3*sin(0.5*pi*x))' },
  ];

  // Las 12 funciones de los videos de referencia, copiadas de las fórmulas que mostraban
  const triText = (u) => `(4*abs(${u} - floor(${u} + 0.75) + 0.25) - 1)`;
  const REFS = [
    { name: 'Arcos decrecientes', text: '3.2*exp(-0.5*floor(mod(x, 4)))*(1 - (2*mod(x, 1) - 1)^2) - 1.6' },
    { name: 'Caída con vibrato', text: '6*exp(-3*mod(x, 4)) - 3 + 0.4*sin(20*mod(x, 6))' },
    { name: 'Trino, nota y sierra', text: 'if(mod(x, 2) < 0.5, 3*(1 - 2*floor(2*mod(6x, 1))), if(mod(x, 2) < 1.2, -1.2, 2.2*2*(2x - floor(2x + 0.5))))' },
    { name: 'Tangente de x²', text: 'tan(x^2/3)' },
    { name: 'Raíz y asíntota', text: 'if(mod(x, 4) < 2, sqrt(abs(x))/2 - 1, (x^2 + 1)/(3x))' },
    { name: 'Senos anidados', text: '2.8*sin(5*sin(4*sin(3*sin(2*sin(x)))))' },
    { name: 'Sierra rota', text: 'if(mod(x, 16) < 2, 1.73*floor(1.5*mod(x, 2)) - 2.3*mod(x, 2), 0.6 - 2*mod(x, 2))' },
    { name: 'Hipérbola 1/x', text: '1/x' },
    { name: 'Compuertas', text: '3*(1 - min(1, floor(mod(x, 1)/(0.15 + 0.25*mod(floor(x), 3))))) - 1.5' },
    { name: 'Rebotes que se apagan', text: '5*exp(-mod(x, 4))*abs(sin(2.2*mod(x, 5))) - 2' },
    { name: 'Escalones a trozos', text: 'if(mod(floor(x), 16) = 0, 2.6*(1 - 2*floor(2*mod(9x, 1))), if(mod(floor(x), 4) = 0, 1.7*2*(4x - floor(4x + 0.5)), 0.9 - 1.8*frac(x)))' },
    { name: 'Pliegues triangulares', text: `2.7*${triText(`3*${triText(`2*${triText('x')}`)}`)}` },
  ];

  function presetFunction(i, xMin, xMax) {
    const p = PRESETS[i];
    const F = makeFunction(parse(p.text), { name: p.name }, xMin, xMax);
    F.hue = 220; // pluma azul
    return F;
  }

  function referenceFunction(i, xMin, xMax) {
    const r = REFS[((i % REFS.length) + REFS.length) % REFS.length];
    const F = makeFunction(parse(r.text), { name: r.name }, xMin, xMax);
    F.hue = Math.floor(rand(0, 360));
    return F;
  }

  MS.gen = { randomFunction, presetFunction, referenceFunction, PRESETS, REFS, FAMILIES };
})(globalThis.MS = globalThis.MS || {});
