# MathSound — funciones matemáticas → sonido

Se dibuja una función como en Desmos, un punto la recorre de izquierda a derecha y **la altura `y` de la
curva controla el tono** de un sintetizador. Todo se genera en el navegador: no hay samples, plugins ni
servidor. Además de la función, cada canción trae **beat, kit de batería, línea de bajo, instrumento,
efectos y, a veces, una progresión de acordes** que suenan sincronizados con la curva.

## Cómo abrirlo

Haz doble clic en `index.html` (Chrome, Edge o Firefox). No hace falta instalar nada.
Pulsa **Reproducir** (el navegador exige un clic antes de permitir sonido).

> La fórmula se dibuja con KaTeX desde un CDN; sin internet se muestra como texto plano y todo lo
> demás funciona igual.

| Tecla    | Acción                                                        |
|----------|---------------------------------------------------------------|
| Espacio  | reproducir / pausa                                            |
| F        | función, beat y sonido nuevos (sin salir del género)          |
| B        | solo un beat nuevo                                            |
| A        | canción nueva (todo al azar)                                  |
| D        | build-up y drop (empieza en el próximo compás)                |
| C        | acordes sí o no                                               |
| Inicio   | volver al principio                                           |

### La gráfica

Es también una pauta: las líneas horizontales son las notas de la escala elegida (con su nombre a la
izquierda) y las verticales marcan cada pulso, más fuertes cada compás de 4. La nota que suena se ilumina
con el color de la curva. Cada función tiene su color (rojo, verde, azul o violeta).

Si suenan acordes, cada voz es una línea en tinta que avanza con el cursor y termina en un punto, con
curvas en S en cada cambio de acorde; la escala vertical se amplía para que quepan todas. Debajo de la
gráfica se lee el acorde que suena.

En **Vista** hay dos opciones que cambian el dibujo:

- **Líneas de las notas de la escala**: se pueden ocultar (útil con la escala cromática).
- **Blanco y negro**: fondo blanco, trazo negro y sin pauta, como una hoja impresa.

Respeta el modo oscuro del sistema.

## Cómo funciona

Ejemplo de función (la primera de los ejemplos):

$$y = 3.2\,e^{-0.5\lfloor x \bmod 4\rfloor}\left(1-\left(2\,(x \bmod 1)-1\right)^2\right)-1.6$$

- `x mod 1` es una "fase" que va de 0 a 1 en cada unidad → `1 − (2p − 1)²` dibuja un **arco** por unidad.
- `⌊x mod 4⌋` vale 0, 1, 2, 3 y se repite → `e^{−0.5·k}` hace que cada arco sea **más bajo que el anterior**,
  y el patrón se repite cada 4 unidades (un compás de 4 pulsos).
- El `− 1.6` solo la centra sobre el eje.

**De la función al sonido:**

1. El tiempo avanza en pulsos al tempo elegido; cada pulso mueve el cursor 1 unidad en `x` (configurable).
2. Se evalúa `y = f(x)` continuamente (en el glissando, 2000 veces por segundo).
3. El rango de `y` de la curva visible se reparte en N semitonos (24 por defecto) alrededor de la tónica:
   `nota = tónica + (y normalizada − 0.5) · rango` → `frecuencia = 440 · 2^((nota − 69)/12)`.
   Donde la función tiende a infinito (asíntotas), el tono se hunde o se dispara un poco más antes de quedarse fijo.

**Modos de sonido:**

- **Glissando**: el tono sigue a la curva de forma continua.
- **Escala**: la nota se ajusta a la escala elegida y se toca una nota nueva cada vez que cambia
  (las subidas y bajadas suenan como un arpa).
- **Pasos**: una nota por subdivisión rítmica (negras, corcheas o semicorcheas).
- **Ritmo**: la melodía toca en las casillas de la fila **Melodía** del secuenciador. Cada estilo trae su
  ritmo (cencerro del phonk, tresillo, contratiempo…) y se puede editar con clics.
- **Arpegio**: en cada subdivisión, una nota del acorde (fundamental, tercera, quinta, octava…) sobre la
  nota que marca la función, como el arpegiador del trance. Si suenan acordes, recorre el acorde que suena.

Escalas: pentatónicas, mayor, menor natural y armónica, dórica, frigia, lidia, mixolidia, blues,
hirajoshi y cromática.

### El bajo

Toca la nota de la función llevada al grave (o, si suenan acordes, la fundamental del acorde). Cada estilo
trae su **línea de bajo**, y se puede fijar otra con el selector **Bajo**:

- **808 en cada bombo**: una nota larga en cada golpe de bombo; con los kits 808 y Phonk a veces se
  desliza desde la nota anterior.
- **Ácido 303**: sierra por un filtro resonante que se cierra en cada nota, con acentos y notas ligadas
  que se deslizan (↗ en el secuenciador), una octava más aguda.
- **A contratiempo**: entre los bombos, como en el trance y el hardstyle.
- **Rodante (psytrance)**: tres semicorcheas después de cada bombo.
- **Funk**: síncopas con saltos de octava y notas fantasma.

Menos en el modo 808, la línea aparece como fila **Bajo** en el secuenciador y se puede editar con clics.

**Humanizar** (en *Beat*) mueve un poco el tiempo y la fuerza de cada golpe y cada nota, como al tocar
en vivo.

### Build-up y drop

El botón **Build-up y drop** (tecla D) hace dos compases de tensión desde el próximo compás: un redoble
de caja que se acelera, ruido que sube de tono y un filtro que va dejando el mix sin graves. En el
**drop** vuelve todo con un golpe grave y un platillo. En *Función*, **Con build-up y drop antes de cada
cambio** lo hace solo justo antes de cada cambio automático.

## Acordes (el video de la progresión)

Idea sacada de un video de referencia de una progresión de acordes: nueve voces sostenidas tocan
**I–ii–iii–IV–vi–V–I** en Re♭ mayor con acordes de novena (en el iii, la oncena en lugar de la novena) y,
en cada cambio, cada voz se desliza con una curva en S hasta la nota del acorde nuevo que menos la obliga a
moverse. Al principio dos voces giran en espiral cada vez más cerca y más deprisa hasta juntarse, y con un
golpe se abren en abanico hacia el primer acorde. El código está en [js/chords.js](js/chords.js).

En la sección **Acordes** del panel:

- **Progresión**: la del video, pop (I–V–vi–IV), emotiva (vi–IV–I–V), épica (i–VI–III–VII), jazz
  (ii–V–I), andaluza (i–VII–VI–V) o **la elige la función**: en cada cambio, el grado de la nota que suena.
  Los grados se toman de la escala elegida (las pentatónicas y el blues usan la escala de 7 notas que las
  contiene).
- **Notas**: tríadas, séptimas o novenas. **Voces**: 4, 6 o 9. **Cambio cada** ½, 1 o 2 compases.
- **Sonido**: pad, sierra suave, supersaw, sintetizador, órgano, coro, seno, lead o chiptune, y su volumen.
- **Las voces**: *quietas* (se mueven lo mínimo, como en el video) o *siguen a la curva* (en cada pulso se
  agrupan alrededor de la nota de la función).
- **Al empezar desde el principio**: dos compases de espiral, sin batería ni melodía, y el drop abre el
  primer acorde.

Con acordes, el bajo toca la fundamental de cada acorde, el modo Arpegio recorre el acorde que suena y el
**build-up** junta las voces en la espiral; el drop las abre y la progresión vuelve a empezar.

## Géneros y canciones

**Todo al azar** (tecla A) elige una canción nueva dentro de un género. Puede ser al azar (distinto del
anterior) o fijo, con el selector **Género**. Dentro del género se eligen:

- el **beat** y su **kit** de batería,
- el **instrumento** y el **modo** de la melodía,
- la **escala**, la tónica, el rango y los efectos (distorsión, reverb, delay),
- la **función**, con las familias propias del género.

Géneros disponibles ([js/genres.js](js/genres.js)): Phonk, Drift phonk, Funk brasileño, Reggaetón, Trap,
Drill, Jersey club, House (incluye French house), Techno, Drum & bass, Lo-fi, Chiptune, Acid house,
Funk y disco, Hardstyle, Hardtek, Trance, Psytrance, Ambiental (piano y pads tranquilos, composición
propia), **Acordes en movimiento (video)**, con nueve voces que se deslizan y la espiral al empezar, y
**Funciones (sonido de los videos)**, que usa las funciones de los videos de referencia y sonidos de
sierra.

Algunos géneros llevan acordes a veces: House, Drum & bass, Lo-fi, Funk y disco, Hardstyle y Trance (entre
el 30 y el 55 % de las canciones), Ambiental (75 %) y Acordes en movimiento (siempre).

**Cambios automáticos** (en *Función*): al empezar cada vuelta de la gráfica, se puede cambiar solo la
función, la función con su beat y sonido, o toda la canción. Se elige también cada cuántas vueltas
(1, 2 o 4). Con eso queda sonando como un generador infinito.

### Estructura de canción

En *Función*, **Estructura** elige entre *bucle* (todo suena siempre, como antes) y *canción*: la
canción pasa por secciones que meten y sacan capas ([js/form.js](js/form.js)), y debajo de la gráfica se
ve en cuál está.

| Sección    | Qué suena                                                                     |
|------------|-------------------------------------------------------------------------------|
| Intro      | hats y percusión, sin bajo; la melodía y los acordes empiezan filtrados y se abren |
| Estrofa    | bombo, caja, hats y bajo, sin palmas ni hat abierto                            |
| Drop       | todo; llega después de un build-up automático                                 |
| Estribillo | todo, sin build-up (en lo-fi, ambiental, reggaetón, chiptune, funk y disco y acordes en movimiento) |
| Puente     | sin batería ni bajo: la melodía sola o, si hay acordes, los acordes con la melodía de fondo |
| Final      | bombo, hats y bajo; la melodía y los acordes se van cerrando                  |

El orden es intro, estrofa, drop, puente, (a veces otra estrofa), drop y final, y cada sección dura 4 u 8
compases redondeados a vueltas enteras de la gráfica. Con el cambio automático *todo (otra canción)*, la
canción nueva empieza al terminar el final; si no, la estructura vuelve a empezar. En el secuenciador se
atenúan las pistas que la sección deja calladas.

## Instrumentos

Todo es síntesis, sin samples ([js/instruments.js](js/instruments.js)):

- **Sostenidos** (pueden hacer el glissando continuo): sintetizador suave, seno puro, sierra suave,
  lead sierra, chiptune de 8 bits, órgano, coro (voz "a" con formantes), silbido, ácido 303 (filtro que
  barre cada semicorchea), 808 deslizante, supersaw (siete sierras desafinadas, trance y hardstyle) y pad
  cálido.
- **Percusivos**: cencerro phonk (cencerro 808 afinado), campana y piano eléctrico (síntesis FM), pluck,
  marimba y piano suave. En modo glissando siguen la curva a golpes, uno por subdivisión.

**Distorsión** satura la melodía; algunos instrumentos (cencerro, 808, ácido) ya traen un poco.

**Estéreo**: bombo, caja, bajo y melodía van al centro. Las sierras desafinadas del supersaw, el pad, el
lead y el coro se abren a los lados; los hats van un poco a la derecha y la percusión a la izquierda; el
delay rebota entre izquierda y derecha, y las voces de los acordes se reparten por todo el estéreo (en el
abanico salen del centro hacia su lado, y en la espiral las dos voces giran también entre los altavoces).

## Funciones aleatorias

No son árboles de operaciones al azar (sonarían a ruido), sino combinaciones de "familias" con estructura
rítmica, con parámetros al azar ([js/generator.js](js/generator.js)):

| Familia            | Idea                                                         |
|--------------------|--------------------------------------------------------------|
| Arcos decrecientes | arcos que bajan en cada compás: `A·e^{−c⌊x mod n⌋}·forma(x mod 1)` |
| Escalera melódica  | `sin(c·⌊x⌋)` da una nota distinta por pulso, como una melodía |
| Arpegio modular    | `(m·⌊kx⌋) mod n` repite una secuencia cada n pasos             |
| Ondas              | sumas y productos de senos                                    |
| Rebotes            | `|sin(πx)|·e^{−c(x mod n)}`, como una pelota que rebota        |
| Subida en sierra   | rampa que sube durante n pulsos                               |
| Saltos de octava   | `⌊2(x mod 1)⌋` alterna entre dos alturas                       |
| Polirritmo         | dos ciclos con periodos distintos (1 y 0.75…)                 |
| Batido             | una forma rápida multiplicada por otra lenta                  |
| Contador binario   | suma de los bits de `⌊x⌋`: una secuencia que se repite cada 8 pasos |
| Raíz creciente     | `√(x mod n)` sube rápido y se frena, como un *riser*           |
| Trino              | escalera melódica más `⌊2(kx mod 1)⌋`, un trino rápido        |
| Llamada y respuesta| `sign(sin(…))` invierte la frase: unos compases suben, otros bajan |
| Tangente recortada | `min(L, max(−L, c·tan(…)))`: glissandos que suben y se quedan arriba |
| Pulsos de Gauss    | una campana `e^{−k(x mod 1 − ½)²}` por pulso, cada una más alta |
| Seno escalonado    | `round(q·sin(…))`: la onda redondeada a escalones              |
| Caída 808          | cada pulso mantiene una nota y al final se desliza hacia abajo |
| Trino, nota y sierra | a trozos: un trino, una nota quieta y una sierra             |
| Compuertas         | encendido/apagado con duraciones distintas en cada pulso      |
| Senos anidados     | `sin(5 sin(4 sin(3 sin(2 sin x))))`, suena a FM                |
| Asíntotas          | `tan(x²/3)`, `1/x`…: el tono se hunde o se dispara              |
| Pliegues triangulares | ondas triangulares unas dentro de otras: suena a ruido      |
| Caída con vibrato  | `6e^{−3(x mod 4)} + 0.4 sin(20(x mod 6))`                      |
| Sierra rota, Escalones a trozos | funciones a trozos con `floor`, `frac` y `mod`         |

A veces se suman dos familias. También puedes escribir tu propia fórmula en el cuadro de texto, con
`x`, `+ - * / ^`, `mod(a, b)` o `a mod b`, `floor`, `ceil`, `abs`, `sin`, `cos`, `tan`, `exp`, `sqrt`,
`log`, `min`, `max`, `round`, `sign`, `frac`, `pi`, `e` y multiplicación implícita (`2x`, `3(x+1)`).

Las funciones **a trozos** se escriben con `if(condición, valor, si no)` y se pueden anidar:
`if(x mod 2 < 0.5, 3, if(x mod 2 < 1.2, -1.2, 2x - floor(2x + 0.5)))` se dibuja con una llave.
En la condición valen `<`, `>`, `<=`, `>=` y `=`.

En **Ejemplos** hay funciones de muestra, y en *De los videos de referencia* las 12 funciones que
mostraban los videos de funciones convertidas en tono que sirvieron de modelo.

## Beats y kits de batería

Patrones de 16 pasos con estilos Phonk (Memphis, medio tiempo con cencerro), Drift phonk, Funk brasileño
(tamborzão), Drill, Jersey club, Lo-fi, Drum & bass, Chiptune, House, French house, Techno, Trap, Boom bap,
Breakbeat, Reggaetón (dembow), Acid house, Funk, Hardstyle, Hardtek, Trance, Psytrance, Ambiental,
Euclidiano y **Sin batería** (solo la melodía). Puedes editar el patrón haciendo clic en las casillas.

Cada estilo suena con su **kit** ([js/drums.js](js/drums.js)):

- **Clásica**: sonido general de cajas de ritmo, sin intentar imitar una máquina concreta.
- **808**: bombo largo que retumba, cencerro.
- **Phonk**: todo saturado, cencerro al frente, bajo 808 que se desliza.
- **French house (909 + 808)**: bombo de capas graves y de ataque; el bombo hace un **bombeo tipo
  sidechain** sobre la melodía y el bajo, como el de la música house francesa.
- **909**: bombo con clic, caja de tono y ruido, hats y ride metálicos (seis ondas cuadradas
  inarmónicas, como en las cajas de ritmo de los 80).
- **Hardstyle**: bombo muy saturado con cola afinada que cae.
- **Hardtek**: bombo largo y distorsionado a más de 170 bpm.
- **Psytrance**: bombo corto y seco para dejar sitio al bajo rodante, con zaps.
- **Lo-fi**: filtrado y suave.
- **Chip**: sonido de 8 bits.

Los kits con bombo propio (French house, 909, Hardstyle, Hardtek, Psytrance) lo pasan por su propia
saturación y un realce de graves entre 50 y 60 Hz.

Puedes fijar un kit para cualquier estilo con el selector **Kit de batería**.

Son aproximaciones sintetizadas: los nombres describen el carácter del sonido, no emulaciones exactas de
las máquinas originales (ni de otros grupos). Toda la batería es síntesis con Web Audio, sin samples.

## Estructura

```
index.html        interfaz
css/styles.css    estilos
js/expr.js        parser de fórmulas, evaluación y conversión a LaTeX
js/generator.js   funciones aleatorias, ejemplos y funciones de los videos
js/genres.js      géneros: estilos, instrumentos, escalas y familias de cada uno
js/music.js       escalas, mapeo y → nota y notas de acorde de la escala
js/beats.js       patrones de batería, ritmos de la melodía y líneas de bajo
js/instruments.js instrumentos de la melodía
js/drums.js       kits de batería
js/audio.js       motor de audio (buses, distorsión, bombeo, bajos, build-up y drop, reverb, delay)
js/chords.js      acordes: progresiones, reparto de voces, deslizamientos y espiral
js/form.js        estructura de canción: secciones y qué suena en cada una
js/plot.js        gráfica en canvas
js/app.js         transporte sincronizado con el reloj de audio + interfaz
```

Desde la consola del navegador tienes `MS.app` para experimentar, por ejemplo
`MS.app.setFunction(MS.expr.makeFunction(MS.expr.parse('sin(pi*x)*floor(x mod 3)'), {}, -8, 8))`.
