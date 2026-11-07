# Reglas de notación de Harmony Finder

Conjunto único de criterios de grabado para todas las partituras del proyecto (corales de Bach, sonatas de Beethoven,
reconstrucciones del DCML, canciones…). Los criterios siguen las prácticas de grabado profesional que recoge Elaine Gould en
*Behind Bars* (Faber Music, 2011), aplicadas **por temas**. Dos aclaraciones de honestidad:

- Este documento no reproduce el libro ni cita páginas: quien lo mantiene debe contrastar cada regla con su ejemplar.
- Los valores numéricos (umbrales de la auditoría, márgenes) son criterios **del proyecto**, calibrados con la auditoría; no son
  cifras del libro.

El código está en [`web/notacion.js`](../web/notacion.js). Cada regla tiene un identificador estable (`N-TEMA-n`) que se cita
aquí, en el código (catálogo `Notacion.reglas`), en el CHANGELOG y en las pruebas.

## Arquitectura: tres capas

| Capa | Qué es | Coste | Ejemplo |
|---|---|---|---|
| `opciones` | Parámetros de grabado de Verovio (`Notacion.opciones`) | mínimo | margen de las ligaduras |
| `xml` | Correcciones del MusicXML antes de grabar | bajo | indicación de compás al inicio de un fragmento |
| `svg` | Retoques sobre el dibujo ya hecho | alto | apartar silencios que pisan notas |

Se prefiere siempre la capa más barata que resuelva el problema. **Primera lección medida:** la capa `opciones` está agotada
(ver «Lo que no se arregla con opciones»); lo que queda es estructural y vive en `xml` y `svg`.

## Cómo medir: `herramientas/auditoria_gould.js`

Dibuja una muestra de fragmentos (con semilla fija) y mide sobre el SVG de Verovio, por tipo de partitura (original /
reconstruida):

| Métrica | Qué cuenta |
|---|---|
| `sinClave`, `sinCompas` | pentagramas del primer compás sin clave; fragmento sin indicación de compás |
| `lineasAdic4`, `lineasAdic6` | cabezas con ≥ 4 / ≥ 6 líneas adicionales (cada nota se asigna al pentagrama donde se dibuja, también con cruce de pentagrama) |
| `barraEmpinada` | barras con pendiente > 10° (`PEND_MAX`). **Solo orientativa**: marca como «empinada» la inclinación normal de un espacio entre dos corcheas (16,4°); ver «Revisión de `N-BARRA-2`» |
| `barraSubida` | barras que suben más de 1,1 espacios de pentagrama (`SUBIDA_MAX`) de punta a punta; es la medida que usan los manuales de grabado |
| `plicaCorta`, `plicaNoLlega` | plicas de nota suelta de < 2 espacios; notas fuera del pentagrama cuya plica apunta a él sin llegar a la línea central |
| `lazoChoque` | ligaduras (de unión o de expresión) que atraviesan una cabeza, plica o barra ajena (muestreo del trazo) |
| `plicaCruza` | plicas que atraviesan la cabeza de una nota de otra voz |
| `alteracionChoque` | alteraciones que pisan otra alteración o una cabeza |
| `notaNota` | cabezas de voces distintas que se pisan sin ser unísono |
| `plicaVoz` / `pentVoces` | pentagramas con 2+ voces cuyas plicas no siguen la convención (aguda arriba, grave abajo) / total de pentagramas con 2+ voces |
| `unionChoque`, `expresionChoque` | como `lazoChoque`, separando las ligaduras de unión (prolongación) de las de expresión |
| `barraSilencio` | barras que pasan por encima de un silencio de su misma voz |
| `capas3` | pentagramas-compás con 3 o más capas (voces) con notas |

```
node herramientas/auditoria_gould.js 120 salida.json 777 todos        # muestra aleatoria reproducible
CASOS=1 node herramientas/auditoria_gould.js 0 casos.json 1 todos     # solo los casos fijos
CFG='{"compasAlInicio":false}' …                                      # apaga una regla para medir su efecto
OPC='{"slurMargin":3}' …                                              # prueba una opción de Verovio sin tocar el código
POR_MOV=12 node herramientas/auditoria_gould.js 200 sonatas.json 1 todos "beethoven && sonata"   # 12 fragmentos repartidos por cada movimiento; «a && b» exige todos los términos
node herramientas/prueba_notacion.js                                  # pruebas de las reglas y del catálogo
```

Requisitos: la web servida en `http://localhost:8767/` (con cabecera `charset=utf-8` para los `.js`), `verovio-toolkit-wasm.js`
accesible (`VEROVIO_JS`), Playwright y Chrome (`CHROME`).

### Línea base (v0.8.1, 119 fragmentos, semilla 777)

| | Originales (62 frag., 5 060 notas) | Reconstruidas (57 frag., 5 210 notas) |
|---|---|---|
| Barras de más de 10° | 95 de 674 (33 fragmentos) | 297 de 933 (38 fragmentos) |
| Notas con ≥ 4 líneas adicionales | 13 (5 fragmentos) | 12 (6 fragmentos) |
| Ligaduras que chocan | 7 de 302 | 13 de 181 |
| Alteraciones que chocan | 2 | 12 |
| Plicas que cruzan una cabeza ajena | 0 | 4 |
| Plicas cortas / que no llegan a la línea central | 0 / 1 | 0 / 0 |
| Cabezas de voces distintas encimadas | 0 | 0 |
| Fragmentos sin indicación de compás | 49 de 62 | 50 de 57 |

Efecto de `N-INI-1` sobre esa muestra: fragmentos sin compás 99 → 0. Los demás indicadores no cambian.

### Sonatas de Beethoven (edición de Sapp): `N-PLICA-2` y `N-LIG-3`

Medición sobre las 58 sonatas completas, con 12 fragmentos de 4 compases repartidos por cada movimiento (689 fragmentos), y después
sobre los 262 que mostraban algún fallo, con las reglas apagadas y encendidas (`CFG='{"plicasPorVoz":false,"ligadurasPorVoz":false}'`):

| | Sin las reglas | Con las reglas |
|---|---|---|
| Pentagramas con 2+ voces cuyas plicas no siguen la convención (de 1 459) | 463 (32 %) | 29 |
| Ligaduras de unión que chocan con cabezas, plicas o barras (de 1 374) | 159 (11,6 %) | 87 |
| Plicas que cruzan la cabeza de otra voz (sin contar unísonos) | 10 | 6 |
| Alteraciones que chocan | 43 | 42 |
| Barras que pasan por encima de un silencio de su voz | 165 | 167 |

Quedan 12 fragmentos de 262 que empeoran en una o dos unidades en alguna métrica (p. ej. ligaduras de unión en el Op. 14 n.º 2, i, y
el Op. 10 n.º 3, i); la lista sale de comparar dos ejecuciones de `herramientas/auditoria_gould.js`. De las 21 384 combinaciones de pentagrama y compás de las 58 sonatas, 3 496 tienen
2 o más voces; solo 24 tienen voces que nunca suenan a la vez (fusionables) y solo 2 tienen 3 o más: las voces del archivo de Sapp
son las de la edición y no sobran.

> La métrica `lineasAdic4` **no es un error por sí misma**: las octavas graves de Schumann (*Dichterliebe* 7) llevan 4 líneas
> adicionales en la edición. Sirve para localizar candidatos, no para dar el visto bueno ni el rechazo.

### Revisión de `N-BARRA-2` (v0.8.6) y lo que queda realmente

La línea base de arriba (v0.8.1) contaba como defecto cualquier barra de más de 10°. Al mirar los polígonos del SVG el 16,4° casi
exacto de la mayoría resultó ser **un espacio de pentagrama de subida entre dos corcheas contiguas** (1905,2070 → 2517,2250 en
unidades de Verovio: 180 de subida en 612): la inclinación cuantizada habitual en el grabado. El ángulo depende de lo juntas que
estén las notas, no de lo empinada que sea la barra; por eso se añade `barraSubida` (subida en espacios, `SUBIDA_MAX=1,1`).

Misma muestra (120 fragmentos, semilla 777, v0.8.6):

| | Originales (760 barras) | Reconstruidas (844 barras) |
|---|---|---|
| Barras de más de 10° (`barraEmpinada`) | 119 (16 %) | 276 (33 %) |
| Barras que suben más de 1,1 espacios (`barraSubida`) | 37 (4,9 %), 12 fragmentos | 44 (5,2 %), 14 fragmentos |

Máximo medido: 2 espacios. Revisadas a ojo (Op. 53 ii cc. 21-24, Corelli Op. 4 n.º 2) son escalas de fusas y pares de corcheas con
aspecto normal. Por qué `beamMaxSlope` no limita ese ángulo sigue sin investigarse. **Conclusión:** sin evidencia de defecto no se
toca el grabado de las barras.

Lo que sí se ve en capturas y no es una métrica de barras: acordes de fusas a dos voces con ligaduras de unión amontonadas (Op. 14
n.º 2, i, cc. 1-3), alteraciones o líneas adicionales sueltas entre pentagramas en figuras con cruce (Clara Schumann, Op. 23 n.º 6,
c. 34; `N-CRUCE-1`) y la maraña de 3+ voces de las reconstrucciones. Esta última es **rara**: solo 288 de 164 613 pentagramas-compás
del corpus (0,17 %) tienen 3 o más voces con notas (13 con 4 o más), concentrados en Schumann (R.), Bach y Lang, así que `N-VOC-1`
mejoraría pocos fragmentos aunque se hiciera bien.

### Reglas de MuseScore frente a las del proyecto (v0.8.6)

MuseScore Studio es de código abierto, pero con licencia **GPL-3.0**. Se leyeron sus reglas de grabado en
`src/engraving/rendering/score/` (`chordlayout.cpp`: `computeUp` y `calculateChordOffsets`; `slurtielayout.cpp`:
`calculateDirection`; `restlayout.cpp`: `resolveRestVSChord` y `resolveRestVSRest`) y se reescriben aquí como criterios, no como
código: este proyecto no declara licencia para su código y sus datos son CC BY-NC-SA, así que **no se pega código de MuseScore**.

| Regla de MuseScore | Equivalente en Harmony Finder |
|---|---|
| Plicas: con varias voces a la vez en el pentagrama manda el número de voz (1 y 3 arriba, 2 y 4 abajo); con una voz, la distancia de las notas a la línea central; con barra y con trémolo, casos propios | `N-PLICA-2` (la aguda arriba y la grave abajo, por altura media) y Verovio para una sola voz |
| Cabezas entre voces: si el acorde de plica abajo queda a una segunda del de plica arriba, se desplaza a la derecha el ancho de una cabeza (menos el grosor de la plica); un unísono comparte cabeza solo con la misma línea y grafía, el mismo tipo de cabeza, los mismos puntillos y las dos con plica; si no, la de plica abajo se aparta 0,15 espacios; se cuidan líneas adicionales y corchetes | Verovio lo resuelve: la auditoría mide **0** cabezas de voces distintas pisadas (`notaNota`) |
| Ligaduras de unión: con varias voces, del lado de la plica; con una sola nota, del lado contrario (y arriba si las plicas de salida y llegada difieren); en un acorde, las notas por debajo de un «pivote» (la segunda o el unísono) van abajo y las de encima arriba; separación entre ligaduras de 0,65 espacios en vertical y 0,35 en horizontal | `N-LIG-3` (varias voces; en un acorde, solo la nota exterior) y Verovio en el resto |
| Silencios: separación mínima de 0,35 espacios a un acorde (0,55 si es redonda o blanca) y de 0,55 entre silencios de voces distintas; se mueven en pasos de línea entera (de media línea fuera del pentagrama) | `N-SIL-1` (`despejarSilencios`) |

Es decir: lo central de MuseScore ya está cubierto, y copiarlo mejoraría poco. Dos comprobaciones medidas:

- **La métrica de ligaduras tenía un sesgo.** El trazo de Verovio es una forma cerrada (curva exterior de ida y curva interior de
  vuelta), y el muestreo del 12-88 % de su longitud cubría entero el extremo de destino, donde la ligadura debe tocar su nota y su
  plica, y se saltaba el de origen. Ahora solo se muestrea el interior de cada curva (0,12-0,38 y 0,62-0,88). El efecto es pequeño
  (sonatas de Beethoven: 17 choques de ligaduras de unión antes y después, en 6 de 174 fragmentos; muestra estándar: 14 → 13 en
  reconstrucciones y 4 → 3 en originales), así que los choques que quedan son reales.
- **Más espaciado no lo arregla.** Sobre los 15 fragmentos con más choques (12 alteraciones y 17 ligaduras): `spacingLinear` 0,4 → 16 y 11;
  0,5 → 15 y 11; `spacingLinear` 0,4 con `spacingNonLinear` 0,7 → 15 y 11. No justifica cambiar el valor (0,3).

El patrón real que quedaba: ligaduras de unión **del lado de la plica entre notas cortas con corchete de la voz grave** (Op. 14
n.º 2, i, cc. 1-3; Op. 31 n.º 1, i; Op. 10 n.º 1, ii), en las que el arco cruzaba las plicas y los corchetes de sus propias notas.
MuseScore también las pone del lado de la plica, así que su regla de dirección no lo resuelve; se corrige con `N-LIG-2`.

#### Efecto de `N-LIG-2` (misma muestra y semilla, regla apagada → encendida)

| Ligaduras de unión que chocan | Antes | Después |
|---|---|---|
| Originales, muestra estándar (124 ligaduras) | 2 | 0 |
| Reconstruidas, muestra estándar (157) | 13 | 2 |
| Sonatas de Beethoven, 174 fragmentos (295) | 17 | 6 |

Ninguna otra métrica cambia (alteraciones, plicas, cabezas, silencios y barras iguales). La regla se evalúa con su propio muestreo
(denso, 0,1 espacios) y la auditoría la mide con otro (0,35), de modo que el resultado no es circular. Comprobado a ojo en el
Op. 14 n.º 2, i (la ligadura de la mano izquierda ya no atraviesa el corchete ni la plica de la nota anterior) y en Couperin.
Se apaga con `Notacion.config.ligadurasDespejadas = false`.

### Voces de las reconstrucciones: lo que hace una edición profesional (v0.8.8)

Se cotejó la Allemande de la Suite inglesa n.º 1 (BWV 806) en una edición impresa (IMSLP 917223) con el MusicXML
reconstruido desde las tablas del DCML, compás a compás. Las tablas guardan una voz por cada línea que MuseScore tenía en el
pentagrama y el pentagrama de origen de cada nota, pero no los cruces de pentagrama. De ahí salen tres defectos, que se repiten en
todo el corpus (817 pentagramas-compás con 3+ voces en las 645 reconstrucciones de teclado: Bach 283, Grieg 70, Medtner 70,
Scarlatti 56, C. P. E. Bach 54, Couperin 51…):

| Compás | Reconstrucción | Edición |
|---|---|---|
| 1 | la3-do#4-mi4 (voz interior) en la mano derecha, en clave de sol, mientras la derecha toca la5 | En la mano izquierda, en clave de fa; el do#4 duplicado en las dos manos se escribe una vez |
| 2, 25, 29, 30 | Un arpegio sostenido escrito como 3 voces (una por nota) | **Una voz**: el arpegio en semicorcheas, con una ligadura de cada nota al acorde (*style brisé*) |
| 6, 7 | Tres voces, la intermedia una línea de semicorcheas | **Tres voces**: una línea melódica real no se convierte en acordes |
| 0-2 | Mano izquierda en clave de sol | Clave de fa en toda la pieza |
| 5 | sol#2 en el pentagrama de la derecha | En la mano izquierda |

Conclusiones aplicables a otras partituras:

1. **Cada voz va con la mano que puede tocarla.** El criterio que distingue los casos de la edición no es la altura media (el
   tenor la3-do#4 bajo un si2 se queda en la izquierda, c. 4) sino la extensión: una mano no toca a la vez notas a más de una
   décima. → `N-CRUCE-1`.
2. **Un arpegio sostenido es una sola voz** con ligaduras al acorde; **una línea melódica intermedia es una voz propia**. La
   diferencia práctica es cuántas ligaduras haría falta añadir: el *brisé* necesita pocas y la línea, una por nota. → `N-VOC-1`.
3. **Un unísono entre las manos se escribe una vez.** → `N-VOC-2`.
4. **La mano izquierda no cambia de clave por un pasaje de tenor**, y la clave se decide con las voces ya repartidas. → `N-CLAVE-1`.

Medición (reglas apagadas → encendidas, `CFG='{"vocesPorRegistro":false,"dosCapas":false,"unisonosUnaVez":false}'`):

| | 60 fragmentos con 3+ voces (5 540 notas) | Muestra estándar, reconstruidas (53 frag.) |
|---|---|---|
| Pentagramas-compás con 3+ capas (`capas3`) | 45 → 13 | 5 → 1 |
| Ligaduras de unión que chocan | 9 → 5 | 2 → 1 |
| Plicas contra la convención por voz | 5 → 1 | 0 → 0 |
| Plicas que no llegan a la línea central | 3 → 0 | 0 → 1 |
| Notas con ≥ 4 líneas adicionales | 19 → 24 | 9 → 9 |
| Ligaduras de unión dibujadas | 281 → 367 | 157 → 170 |

Las originales de la muestra estándar no cambian en ninguna métrica. Las 5 líneas adicionales de más salen de dos fragmentos
(Liszt, *Sposalizio*, c. 60; Medtner, Op. 26 n.º 4, c. 39) que, comparados en captura, se dibujan prácticamente igual. El lío de
claves de Medtner en el c. 40 ya estaba antes. Las 13 capas que quedan son líneas reales o fusiones rechazadas por exceso de
ligaduras.

Limitación: la edición escribe el *brisé* con cada nota sostenida una sola vez y con su duración real (corchea con puntillo,
corchea…), en capas que comparten la barra. Aquí la nota se repite ligada en cada acorde: es correcto, pero más cargado.

## Catálogo de reglas

Estado: **aplicada** (código en `notacion.js`), **existente** (ya la aplica el proyecto en otro punto, se nombra aquí para
poder medirla) o **pendiente**.

| Id | Tema (Gould) | Capa | Estado | Resumen y dónde está |
|---|---|---|---|---|
| `N-INI-1` | Indicaciones al inicio del sistema | xml | **aplicada** | Un fragmento que empieza a mitad de obra muestra el compás vigente (`CONFIG.compasAlInicio`). Claves y armadura ya las resuelve Verovio (0 pentagramas sin clave en la muestra). |
| `N-CLAVE-1` | Elección y cambio de clave | xml | existente | Reconstrucciones (DCML): `asignarClaves` (`web/index.html`), clave por tesitura penalizando líneas adicionales y cambios breves; la mano izquierda del teclado se resiste más a dejar la clave de fa (sesgo 2 en vez de 0,6) y la clave se elige después de repartir las voces entre las manos. Ediciones profesionales (Sapp, OpenScore…): se mantienen sus claves, también los cambios a mitad de compás (`CONFIG.clavesDeLaEdicion`; con `false` actúa `corregirClaves`). |
| `N-LIG-3` | Ligaduras de unión: por arriba en la voz aguda, por abajo en la grave | xml | **aplicada** | Con dos o más voces simultáneas en un pentagrama, la ligadura de unión de la voz aguda se dibuja por arriba y la de la grave por abajo (`placement`/`orientation` de `<tied>`), para que no atraviese las notas de la otra voz; en un acorde, solo la nota exterior. Todas las fuentes (`CONFIG.ligadurasPorVoz`). |
| `N-PLICA-2` | Plicas: una dirección por voz | xml | **aplicada** | Con dos o más voces simultáneas en un pentagrama, la más aguda lleva la plica hacia arriba y la más grave hacia abajo en todo el compás; las voces intermedias, como las resuelva Verovio. Solo si las voces coinciden en el tiempo. Se aplica a **todas** las fuentes (`CONFIG.plicasPorVoz`). |
| `N-PLICA-1` | Plicas: dirección y longitud | opciones | existente | Verovio. Medido: 0 plicas de < 2 espacios. |
| `N-BARRA-1` | Barras: agrupación por pulso | xml | existente | `barrasAutomaticas` (`web/index.html`), solo reconstrucciones. En un acorde, la barra va solo en su primera nota (Verovio rechaza las demás). |
| `N-SIL-1` | Silencios con varias voces | svg | existente | `ordenarVoces`, `despejarSilencios` (`web/index.html`). |
| `N-LIG-1` | Ligaduras: distancia de seguridad | opciones | existente | `slurMargin`, `tieMinLength`… en `OPCIONES`. |
| `N-BARRA-2` | Barras: pendiente máxima | svg | pendiente | **Replanteada**: el criterio es la subida en espacios, no el ángulo. Con `barraSubida` solo el 5 % de las barras sube más de 1,1 espacios y no se ve defecto en las capturas; sin evidencia, no se actúa (ver «Revisión de `N-BARRA-2`»). |
| `N-VOC-1` | Tres o más voces en un pentagrama | xml | **aplicada** | Reconstrucciones: una voz interior se intercala en la vecina si no suenan a la vez, o se escribe como acordes de la vecina con ligaduras de unión donde se sostiene (*style brisé*); se rechaza si añade de media más de una ligadura por pulso o más de dos en un pulso, y entonces la voz queda en su capa (`CONFIG.dosCapas`, `vocesReconstruidas` en `notacion.js`). Ver «Voces de las reconstrucciones». |
| `N-VOC-2` | Unísonos entre voces | xml | **aplicada** | Reconstrucciones: la misma nota atacada a la vez en las dos manos se escribe una vez (la más larga o, si duran igual, la del pentagrama de su registro). Dentro de un pentagrama se deja una cabeza con dos plicas, como la dibuja Verovio (`CONFIG.unisonosUnaVez`). |
| `N-LIG-2` | Ligaduras que atraviesan notas, plicas o barras | svg | **aplicada** | Una ligadura de unión cuyo interior cruza una cabeza, plica, corchete o barra se acorta por los extremos y/o se hace más profunda (hasta 0,8 espacios) hasta librarlos; si ninguna variante lo logra, no se toca (`CONFIG.ligadurasDespejadas`, `despejarLigaduras` en `notacion.js`). No toca las ligaduras de expresión. |
| `N-ALT-1` | Alteraciones que chocan | svg | pendiente | 12 casos en reconstrucciones. |
| `N-ALT-2` | Alteraciones: una vez por compás | xml | **aplicada** | Una alteración rige para las notas de la misma altura del resto del compás en ese pentagrama (sea cual sea la voz); las repetidas de las reconstrucciones del DCML y de las ediciones convertidas desde Humdrum (Sapp), donde la conversión las escribe en cada nota, se quitan (`CONFIG.alteracionesUnaVez`). No toca precauciones, editoriales ni notas ligadas; las demás ediciones (OpenScore…) conservan las suyas. |
| `N-OCT-1` | 8va frente a muchas líneas adicionales | xml | pendiente | Hay que fijar el umbral. |
| `N-CRUCE-1` | Notas que cruzan de pentagrama | xml | **aplicada** | Reconstrucciones: una voz no exterior pasa al pentagrama de la otra mano en ese compás si su mano no puede tocarla (más de una décima con otra voz a la vez, y en la otra mano cabe) o si lleva de media 3+ líneas adicionales que en el otro pentagrama no lleva (`CONFIG.vocesPorRegistro`). |

## Lo que no se arregla con opciones de Verovio

Probado en la misma muestra, cambiando solo la opción (`OPC=…`):

- `beamMaxSlope` de 1 a 20: **sin ningún efecto** en las pendientes medidas (máximo 37°); solo el valor 0 cambia algo, y es
  aplanar todas las barras. No se ha investigado la causa dentro de Verovio (hipótesis sin comprobar: el ajuste posterior a la
  longitud mínima de las plicas supera el tope). La vía que queda es recalcular barras y plicas en el SVG o en MEI (`@stem.len`).
- `slurMargin` 3, `slurCurveFactor` 1,6, `slurSymmetry` 0,2: las ligaduras que chocan **suben** (7 → 12 en originales).
- `leftMarginAccid` 3,2 / `rightMarginAccid` 1,2: las alteraciones que chocan pasan de 2 a 1 en originales y no cambian en
  reconstrucciones (12); `leftMarginChord` 2: sin efecto. Es una mejora demasiado pequeña para cambiar el valor por defecto.
- `ledgerLineExtension` 0,3: sin diferencia apreciable en las líneas adicionales de notas contiguas.

## Causas de fondo observadas (casos de regresión)

[`herramientas/notacion_casos.json`](../herramientas/notacion_casos.json) fija los fragmentos con los que comparar antes y
después de cada regla (`CASOS=1`).

- **Bach, Suite inglesa n.º 1, Allemande (id 206, cc. 0-7):** la reconstrucción ponía 4 voces en la mano derecha del c. 2, la voz
  interior del c. 1 en clave de sol y un sol#2 de la mano izquierda en el pentagrama de la derecha (c. 5, la «escalera» de líneas
  adicionales entre pentagramas). Resuelto con `N-CRUCE-1`, `N-VOC-1` y `N-VOC-2` (ver «Voces de las reconstrucciones»).
- **Beethoven, Op. 10 n.º 3 (iv), Op. 53 (ii):** el fragmento no mostraba el compás (→ `N-INI-1`); en la reconstrucción de
  Op. 53 hay alteraciones que chocan (→ `N-ALT-1`).
- **Couperin y Frescobaldi (DCML):** plicas que cruzan cabezas de otra voz, alteraciones y ligaduras encimadas.

## Cómo añadir una regla

1. Elegir el tema de *Behind Bars* y un identificador libre `N-TEMA-n`.
2. Escribir antes una métrica (o un caso fijo) que muestre el fallo en `auditoria_gould.js` / `notacion_casos.json`.
3. Implementarla en la capa más barata posible dentro de `web/notacion.js` y registrarla con `regla(...)`.
4. Medir con y sin la regla (`CFG`/`OPC`) sobre la muestra y sobre los casos fijos; no dar por buena una regla que no mueve una
   métrica ni mejora la captura a simple vista.
5. Documentarla en este archivo (la prueba `prueba_notacion.js` falla si el catálogo y el documento no coinciden).
6. Anotarla en `[Unreleased]` del CHANGELOG.

## Decisiones abiertas

- **Compás al inicio de un fragmento** (`N-INI-1`): activado. Se apaga con `Notacion.config.compasAlInicio = false`.
- **Pendiente máxima de las barras** (`N-BARRA-2`): replanteada (ver «Revisión»); no actuar sin un caso concreto que contrastar con la edición.
- **Muchas líneas adicionales** (`N-OCT-1`): cambio de clave, 8va o pasar de pentagrama; y a partir de cuántas líneas.
- **Reparto de voces de las reconstrucciones** (`N-VOC-1`): aplicado. Queda abierto escribir el *brisé* como la edición (cada nota
  sostenida una sola vez, con su duración, y una barra compartida entre capas), que Verovio no admite desde MusicXML.
