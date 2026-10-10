// Expresiones matemáticas: AST, parser, compilador y conversión a texto / LaTeX.
// Todas las funciones (aleatorias, presets o escritas a mano) pasan por aquí,
// así que la fórmula que se muestra es exactamente la que suena.
(function (MS) {
  'use strict';

  const mod = (a, b) => a - b * Math.floor(a / b); // módulo matemático (siempre >= 0 si b > 0)

  const FUNCS = {
    sin: { n: 1, fn: Math.sin },
    cos: { n: 1, fn: Math.cos },
    tan: { n: 1, fn: Math.tan },
    abs: { n: 1, fn: Math.abs },
    floor: { n: 1, fn: Math.floor },
    ceil: { n: 1, fn: Math.ceil },
    round: { n: 1, fn: Math.round },
    exp: { n: 1, fn: Math.exp },
    sqrt: { n: 1, fn: Math.sqrt },
    log: { n: 1, fn: Math.log },
    ln: { n: 1, fn: Math.log },
    sign: { n: 1, fn: Math.sign },
    frac: { n: 1, fn: (v) => v - Math.floor(v) },
    mod: { n: 2, fn: mod },
    if: { n: 3 }, // if(condición, valor si se cumple, valor si no): funciones a trozos
    min: { n: 2, fn: Math.min },
    max: { n: 2, fn: Math.max },
  };

  // ---------- Constructores de nodos ----------
  const B = {
    num: (v) => ({ t: 'num', v: +(+v).toFixed(4) }),
    x: () => ({ t: 'x' }),
    pi: () => ({ t: 'const', name: 'pi' }),
    e: () => ({ t: 'const', name: 'e' }),
    neg: (a) => ({ t: 'neg', a }),
    add: (a, b) => (isNegNum(b) ? { t: 'sub', a, b: B.num(-b.v) } : { t: 'add', a, b }),
    sub: (a, b) => (isNegNum(b) ? { t: 'add', a, b: B.num(-b.v) } : { t: 'sub', a, b }),
    mul: (a, b) => {
      if (a.t === 'num' && a.v === 1) return b;
      if (b.t === 'num' && b.v === 1) return a;
      if (a.t === 'num') { const r = absorb(a.v, b); if (r) return r; }
      if (isNegNum(a)) return B.neg(B.mul(B.num(-a.v), b));
      return { t: 'mul', a, b };
    },
    div: (a, b) => ({ t: 'div', a, b }),
    pow: (a, b) => ({ t: 'pow', a, b }),
    fn: (name, ...args) => ({ t: 'fn', name, args }),
  };
  B.mod = (a, b) => B.fn('mod', a, b);
  function isNegNum(n) { return n.t === 'num' && n.v < 0; }
  // k · (c · resto) → (k·c) · resto, para no generar cosas como 0.4·1.6·sin(x)
  function absorb(k, n) {
    if (n.t === 'num') return B.num(k * n.v);
    if (n.t === 'mul') { const a = absorb(k, n.a); return a && { t: 'mul', a, b: n.b }; }
    return null;
  }

  // ---------- Parser (descenso recursivo) ----------
  // Sintaxis: + - * / ^ ( ) , números, x, pi, e, funciones de FUNCS,
  // "a mod b" o "a % b" infijo, y multiplicación implícita (2x, 3(x+1), 2sin(x)).
  // Funciones a trozos: if(x mod 2 < 0.5, 3, -1.2) con < > <= >= = en la condición.
  const CMP = ['<=', '>=', '==', '<', '>', '='];
  function tokenize(src) {
    const toks = [];
    const s = src.replace(/π/g, 'pi').replace(/·|×/g, '*').replace(/−/g, '-')
      .replace(/≤/g, '<=').replace(/≥/g, '>=');
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
        if (!m) throw new Error(`Número inválido en posición ${i + 1}`);
        toks.push({ k: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[a-z_]/i.test(c)) {
        const m = /^[a-z_][a-z0-9_]*/i.exec(s.slice(i));
        toks.push({ k: 'id', v: m[0].toLowerCase() });
        i += m[0].length;
        continue;
      }
      if ('+-*/^(),%'.includes(c)) { toks.push({ k: c }); i++; continue; }
      const op = CMP.find((o) => s.startsWith(o, i));
      if (op) { toks.push({ k: 'cmp', v: op === '=' ? '==' : op }); i += op.length; continue; }
      throw new Error(`Carácter no reconocido: "${c}"`);
    }
    toks.push({ k: 'end' });
    return toks;
  }

  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const expect = (k) => {
      if (peek().k !== k) throw new Error(`Se esperaba "${k}"`);
      return next();
    };

    function expr() {
      let n = term();
      while (peek().k === '+' || peek().k === '-') {
        const op = next().k;
        n = op === '+' ? { t: 'add', a: n, b: term() } : { t: 'sub', a: n, b: term() };
      }
      return n;
    }
    function startsFactor(t) {
      return t.k === 'num' || t.k === '(' || (t.k === 'id' && t.v !== 'mod');
    }
    function term() {
      let n = unary();
      for (;;) {
        const t = peek();
        if (t.k === '*') { next(); n = { t: 'mul', a: n, b: unary() }; }
        else if (t.k === '/') { next(); n = { t: 'div', a: n, b: unary() }; }
        else if (t.k === '%' || (t.k === 'id' && t.v === 'mod')) { next(); n = B.mod(n, unary()); }
        else if (startsFactor(t)) { n = { t: 'mul', a: n, b: power() }; } // implícita
        else return n;
      }
    }
    function unary() {
      if (peek().k === '-') { next(); return { t: 'neg', a: unary() }; }
      if (peek().k === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const base = primary();
      if (peek().k === '^') { next(); return { t: 'pow', a: base, b: unary() }; }
      return base;
    }
    function primary() {
      const t = next();
      if (t.k === 'num') return { t: 'num', v: t.v };
      if (t.k === '(') { const n = expr(); expect(')'); return n; }
      if (t.k === 'id') {
        if (t.v === 'x') return B.x();
        if (t.v === 'pi') return B.pi();
        if (t.v === 'e') return B.e();
        const f = FUNCS[t.v];
        if (!f) throw new Error(`Función desconocida: "${t.v}"`);
        expect('(');
        const args = [t.v === 'if' ? condition() : expr()];
        while (peek().k === ',') { next(); args.push(expr()); }
        expect(')');
        if (args.length !== f.n) throw new Error(`${t.v}() necesita ${f.n} argumento(s)`);
        return { t: 'fn', name: t.v, args };
      }
      if (t.k === 'end') throw new Error('La expresión termina de forma inesperada');
      throw new Error(`Símbolo inesperado: "${t.k}"`);
    }

    // Condición de if(): una comparación entre dos expresiones
    function condition() {
      const a = expr();
      if (peek().k !== 'cmp') throw new Error('if() necesita una condición, por ejemplo x mod 2 < 0.5');
      const op = next().v;
      return { t: 'cmp', op, a, b: expr() };
    }

    const tree = expr();
    if (peek().k === 'cmp') throw new Error('Las comparaciones solo van dentro de if(condición, a, b)');
    if (peek().k !== 'end') throw new Error('Sobra algo al final de la expresión');
    return tree;
  }

  // ---------- Compilador a función JS ----------
  function compile(n) {
    switch (n.t) {
      case 'num': { const v = n.v; return () => v; }
      case 'x': return (x) => x;
      case 'const': { const v = n.name === 'pi' ? Math.PI : Math.E; return () => v; }
      case 'neg': { const a = compile(n.a); return (x) => -a(x); }
      case 'add': { const a = compile(n.a), b = compile(n.b); return (x) => a(x) + b(x); }
      case 'sub': { const a = compile(n.a), b = compile(n.b); return (x) => a(x) - b(x); }
      case 'mul': { const a = compile(n.a), b = compile(n.b); return (x) => a(x) * b(x); }
      case 'div': { const a = compile(n.a), b = compile(n.b); return (x) => a(x) / b(x); }
      case 'pow': { const a = compile(n.a), b = compile(n.b); return (x) => Math.pow(a(x), b(x)); }
      case 'cmp': {
        const a = compile(n.a), b = compile(n.b);
        switch (n.op) {
          case '<': return (x) => a(x) < b(x);
          case '>': return (x) => a(x) > b(x);
          case '<=': return (x) => a(x) <= b(x);
          case '>=': return (x) => a(x) >= b(x);
          default: return (x) => Math.abs(a(x) - b(x)) < 1e-9;
        }
      }
      case 'fn': {
        if (n.name === 'if') {
          const [c, a, b] = n.args.map(compile);
          return (x) => (c(x) ? a(x) : b(x));
        }
        const f = FUNCS[n.name].fn;
        const args = n.args.map(compile);
        if (args.length === 1) { const a = args[0]; return (x) => f(a(x)); }
        const [a, b] = args;
        return (x) => f(a(x), b(x));
      }
    }
    throw new Error('Nodo desconocido: ' + n.t);
  }

  // ---------- Formato de números ----------
  function fmt(v) {
    if (Number.isInteger(v)) return String(v);
    return String(+v.toFixed(3));
  }

  // ---------- Texto editable ----------
  const TP = { add: 4, sub: 4, mul: 5, div: 5, neg: 6, pow: 7 };
  const tprec = (n) => (n.t === 'num' && n.v < 0 ? 6 : TP[n.t] || 10);

  function toText(n) {
    const w = (c, cond) => (cond ? `(${toText(c)})` : toText(c));
    switch (n.t) {
      case 'num': return fmt(n.v);
      case 'x': return 'x';
      case 'const': return n.name;
      case 'neg': return '-' + w(n.a, tprec(n.a) <= 4);
      case 'add':
        if (n.b.t === 'neg') return `${w(n.a, tprec(n.a) < 4)} - ${w(n.b.a, tprec(n.b.a) <= 4)}`;
        return `${w(n.a, tprec(n.a) < 4)} + ${w(n.b, tprec(n.b) < 4)}`;
      case 'sub': return `${w(n.a, tprec(n.a) < 4)} - ${w(n.b, tprec(n.b) <= 4 || n.b.t === 'neg')}`;
      case 'mul': return `${w(n.a, tprec(n.a) < 5)}*${w(n.b, tprec(n.b) <= 5 && n.b.t !== 'mul' || n.b.t === 'neg')}`;
      case 'div': return `${w(n.a, tprec(n.a) < 5)}/${w(n.b, tprec(n.b) <= 5)}`;
      case 'pow': return `${w(n.a, tprec(n.a) <= 7)}^${w(n.b, tprec(n.b) < 7)}`;
      case 'cmp': return `${toText(n.a)} ${n.op === '==' ? '=' : n.op} ${toText(n.b)}`;
      case 'fn': return `${n.name}(${n.args.map(toText).join(', ')})`;
    }
  }

  // ---------- LaTeX (para mostrar la fórmula como en un libro) ----------
  // "mod" tiene precedencia baja para que cualquier operador binario lo rodee de paréntesis,
  // mientras que dentro de ⌊ ⌋, | |, exponentes o funciones se escribe sin ellos.
  const LP = { add: 4, sub: 4, mul: 5, neg: 6, pow: 8 };
  function lprec(n) {
    if (n.t === 'num' && n.v < 0) return 6;
    if (n.t === 'fn' && n.name === 'mod') return 3;
    if (n.t === 'fn' && n.name === 'exp') return 8;
    return LP[n.t] || 10;
  }
  const paren = (s) => `\\left(${s}\\right)`;

  function toLatex(n) {
    const w = (c, cond) => (cond ? paren(toLatex(c)) : toLatex(c));
    switch (n.t) {
      case 'num': return fmt(n.v);
      case 'x': return 'x';
      case 'const': return n.name === 'pi' ? '\\pi' : 'e';
      case 'neg': return '-' + w(n.a, lprec(n.a) <= 4);
      case 'add':
        if (n.b.t === 'neg') return `${w(n.a, lprec(n.a) < 4)} - ${w(n.b.a, lprec(n.b.a) <= 4)}`;
        return `${w(n.a, lprec(n.a) < 4)} + ${w(n.b, lprec(n.b) < 4)}`;
      case 'sub': return `${w(n.a, lprec(n.a) < 4)} - ${w(n.b, lprec(n.b) <= 4 || n.b.t === 'neg')}`;
      case 'mul': {
        const l = w(n.a, lprec(n.a) < 5);
        const rWrap = (lprec(n.b) < 5) || n.b.t === 'neg';
        const r = w(n.b, rWrap);
        let sep;
        if (/^[0-9.]/.test(r)) sep = ' \\cdot ';            // 2 · 3
        else if (/^-?[0-9.]+$/.test(l)) sep = '';          // 3.2e^{…}, 2x, -0.5⌊…⌋
        else if (r.startsWith('\\left')) sep = '\\,';      // e^{…} (…)
        else sep = ' ';                                    // \pi x, \sin(…) \cos(…)
        return l + sep + r;
      }
      case 'div': return `\\frac{${toLatex(n.a)}}{${toLatex(n.b)}}`;
      case 'pow': return `${w(n.a, lprec(n.a) < 10)}^{${toLatex(n.b)}}`;
      case 'cmp': {
        const OPS = { '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge', '==': '=' };
        return `${toLatex(n.a)} ${OPS[n.op]} ${toLatex(n.b)}`;
      }
      case 'fn': {
        if (n.name === 'if') { // if anidados → una sola llave con todos los casos
          const rows = [];
          let node = n;
          while (node.t === 'fn' && node.name === 'if') {
            rows.push(`${toLatex(node.args[1])} & \\text{si } ${toLatex(node.args[0])}`);
            node = node.args[2];
          }
          rows.push(`${toLatex(node)} & \\text{en otro caso}`);
          return `\\begin{cases} ${rows.join(' \\\\ ')} \\end{cases}`;
        }
        const a = n.args.map(toLatex);
        switch (n.name) {
          case 'mod': return `${w(n.args[0], lprec(n.args[0]) <= 4)} \\bmod ${w(n.args[1], lprec(n.args[1]) < 10)}`;
          case 'exp': return `e^{${a[0]}}`;
          case 'floor': return `\\left\\lfloor ${a[0]} \\right\\rfloor`;
          case 'ceil': return `\\left\\lceil ${a[0]} \\right\\rceil`;
          case 'abs': return `\\left| ${a[0]} \\right|`;
          case 'sqrt': return `\\sqrt{${a[0]}}`;
          case 'sin': case 'cos': case 'tan': case 'log': case 'ln': case 'min': case 'max':
            return `\\${n.name}${paren(a.join(', '))}`;
          default: return `\\operatorname{${n.name}}${paren(a.join(', '))}`;
        }
      }
    }
  }

  // ---------- Objeto "función" listo para usar ----------
  // Calcula también el rango de y en la ventana visible (para la gráfica y el mapeo a tono).
  function makeFunction(ast, meta = {}, xMin = -8, xMax = 8) {
    const f = compile(ast);
    const vals = [];
    const N = 2000;
    for (let i = 0; i <= N; i++) {
      const y = f(xMin + ((xMax - xMin) * i) / N);
      if (Number.isFinite(y) && Math.abs(y) < 1e6) vals.push(y);
    }
    vals.sort((a, b) => a - b);
    const q = (p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
    let lo = vals.length ? q(0.003) : -1;
    let hi = vals.length ? q(0.997) : 1;
    // Asíntotas (tan, 1/x…): unos pocos valores enormes estirarían la escala y el resto de la curva
    // quedaría plana. La ventana se queda en ±4.5 alrededor de la mediana.
    const core = vals.length ? q(0.9) - q(0.1) : 0;
    if (core > 0 && hi - lo > 8 * core) {
      const med = q(0.5);
      lo = Math.max(lo, med - 4.5);
      hi = Math.min(hi, med + 4.5);
    }
    return {
      ast, f,
      text: toText(ast),
      latex: toLatex(ast),
      name: meta.name || 'Personalizada',
      lo, hi,
      finiteRatio: vals.length / (N + 1),
    };
  }

  MS.expr = { parse, compile, toText, toLatex, makeFunction, mod, FUNCS, B };
})(globalThis.MS = globalThis.MS || {});
