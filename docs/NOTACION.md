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
| `barraEmpinada` | barras con pendiente > 10° (`PEND_MAX`) |
| `plicaCorta`, `plicaNoLlega` | plicas de nota suelta de < 2 espacios; notas fuera del pentagrama cuya plica apunta a él sin llegar a la línea central |
| `lazoChoque` | ligaduras (de unión o de expresión) que atraviesan una cabeza, plica o barra ajena (muestreo del trazo) |
| `plicaCruza` | plicas que atraviesan la cabeza de una nota de otra voz |
| `alteracionChoque` | alteraciones que pisan otra alteración o una cabeza |
| `notaNota` | cabezas de voces distintas que se pisan sin ser unísono |

```
node herramientas/auditoria_gould.js 120 salida.json 777 todos        # muestra aleatoria reproducible
CASOS=1 node herramientas/auditoria_gould.js 0 casos.json 1 todos     # solo los casos fijos
CFG='{"compasAlInicio":false}' …                                      # apaga una regla para medir su efecto
OPC='{"slurMargin":3}' …                                              # prueba una opción de Verovio sin tocar el código
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

> La métrica `lineasAdic4` **no es un error por sí misma**: las octavas graves de Schumann (*Dichterliebe* 7) llevan 4 líneas
> adicionales en la edición. Sirve para localizar candidatos, no para dar el visto bueno ni el rechazo.

## Catálogo de reglas

Estado: **aplicada** (código en `notacion.js`), **existente** (ya la aplica el proyecto en otro punto, se nombra aquí para
poder medirla) o **pendiente**.

| Id | Tema (Gould) | Capa | Estado | Resumen y dónde está |
|---|---|---|---|---|
| `N-INI-1` | Indicaciones al inicio del sistema | xml | **aplicada** | Un fragmento que empieza a mitad de obra muestra el compás vigente (`CONFIG.compasAlInicio`). Claves y armadura ya las resuelve Verovio (0 pentagramas sin clave en la muestra). |
| `N-CLAVE-1` | Elección y cambio de clave | xml | existente | Reconstrucciones (DCML): `asignarClaves` (`web/index.html`), clave por tesitura penalizando líneas adicionales y cambios breves. Ediciones profesionales (Sapp, OpenScore…): se mantienen sus claves, también los cambios a mitad de compás (`CONFIG.clavesDeLaEdicion`; con `false` actúa `corregirClaves`). |
| `N-PLICA-1` | Plicas: dirección y longitud | opciones | existente | Verovio. Medido: 0 plicas de < 2 espacios. |
| `N-BARRA-1` | Barras: agrupación por pulso | xml | existente | `barrasAutomaticas` (`web/index.html`), solo reconstrucciones. |
| `N-SIL-1` | Silencios con varias voces | svg | existente | `ordenarVoces`, `despejarSilencios` (`web/index.html`). |
| `N-LIG-1` | Ligaduras: distancia de seguridad | opciones | existente | `slurMargin`, `tieMinLength`… en `OPCIONES`. |
| `N-BARRA-2` | Barras: pendiente máxima | svg | pendiente | Ver «Lo que no se arregla con opciones». |
| `N-VOC-1` | Tres o más voces en un pentagrama | xml | pendiente | Causa de la maraña de la mano derecha en la *Allemande* (c. 2). |
| `N-VOC-2` | Unísonos con duraciones distintas | xml | pendiente | Cabeza compartida o dos cabezas. |
| `N-LIG-2` | Ligaduras que atraviesan notas, plicas o barras | svg | pendiente | 2 % (originales) y 7 % (reconstruidas) de las ligaduras. |
| `N-ALT-1` | Alteraciones que chocan | svg | pendiente | 12 casos en reconstrucciones. |
| `N-ALT-2` | Alteraciones: una vez por compás | xml | **aplicada** | Una alteración rige para las notas de la misma altura del resto del compás en ese pentagrama (sea cual sea la voz); las repetidas de las reconstrucciones del DCML y de las ediciones convertidas desde Humdrum (Sapp), donde la conversión las escribe en cada nota, se quitan (`CONFIG.alteracionesUnaVez`). No toca precauciones, editoriales ni notas ligadas; las demás ediciones (OpenScore…) conservan las suyas. |
| `N-OCT-1` | 8va frente a muchas líneas adicionales | xml | pendiente | Hay que fijar el umbral. |
| `N-CRUCE-1` | Notas que cruzan de pentagrama | xml | pendiente | Ligado a `N-OCT-1`. |

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

- **Bach, Suite inglesa n.º 1, Allemande (id 206, cc. 0-7):** la reconstrucción pone 4 voces en la mano derecha del c. 2; tres de
  ellas con la plica hacia abajo y sus cabezas encimadas, con ligaduras de unión cruzadas. En el c. 5 la mano izquierda escribe un
  re5 en clave de fa (6 líneas adicionales). → `N-VOC-1`, `N-OCT-1`, `N-CRUCE-1`.
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
- **Pendiente máxima de las barras** (`N-BARRA-2`): hay que decidir el umbral y si se recalcula en el SVG.
- **Muchas líneas adicionales** (`N-OCT-1`): cambio de clave, 8va o pasar de pentagrama; y a partir de cuántas líneas.
- **Reparto de voces de las reconstrucciones** (`N-VOC-1`): es el cambio con mayor efecto visible y también el más grande.
