# Especificación de grabado musical de Harmony Finder

Referencia técnica del motor de notación (`web/musica.js`, `web/notacion.js`, `web/notacion_svg.js`). Define **qué** debe
hacer el motor con cada partitura, **con qué fundamento** y **cómo se comprueba**. El código cita los identificadores de
esta especificación (`N-…` para reglas de grabado, `I-…` para integridad musical) y las pruebas fallan si el catálogo del
código (`Notacion.reglas`) y este documento no coinciden.

- Mediciones históricas y evolución de cada regla: [`docs/NOTACION.md`](NOTACION.md).
- Auditoría del sistema anterior (v0.8.7) y plan de reorganización: [`docs/AUDITORIA_MOTOR_NOTACION.md`](AUDITORIA_MOTOR_NOTACION.md).

Versión de la especificación: 1 (2026-11-06), escrita sobre la v0.8.7.

---

## 1. Fuentes y grado de autoridad

| Clave | Fuente | Qué aporta | Consultada |
|---|---|---|---|
| **MS** | Manual de MuseScore Studio 4 (`handbook.musescore.org`), páginas citadas abajo | Comportamiento **documentado** por defecto de MuseScore (voces, plicas, silencios, agrupación rítmica, colocación automática, dinámicas, ligaduras, cabezas compartidas) | 2026-11-06, versión Markdown de cada página (`…/página.md`) |
| **MS-código** | Código fuente de MuseScore Studio (`src/engraving/rendering/score/`, GPL-3.0) | Criterios internos leídos en la v0.8.6 (ver `NOTACION.md`); **solo como criterio, sin copiar código** | v0.8.6 |
| **LP** | *LilyPond Notation Reference* 2.24 (`lilypond.org/doc/v2.24/Documentation/notation-big-page`) | Reglas por defecto de grabado: voces, colisiones, barras automáticas, alteraciones, espaciado, dirección | 2026-11-06 |
| **DAISY** | *DAISY Engraving Guidelines* (`daisy.org/…/daisy-engraving-guidelines/`, act. 10-06-2025) | Criterios de **corrección estructural** del MusicXML (elementos anclados a su nota, sin notas ni silencios ocultos superfluos, alteraciones entre voces) | 2026-11-06 |
| **Gould** | Elaine Gould, *Behind Bars* (Faber, 2011) | Referencia temática histórica del proyecto. **Sin páginas verificadas**: no se usa como única fuente de ninguna regla nueva | — |
| **Ed-806** | J. S. Bach, Suite inglesa n.º 1, BWV 806, edición impresa (IMSLP 917223), *Allemande* cotejada compás a compás con la reconstrucción del DCML | **Evidencia de grabado profesional** para las reglas de voces de las reconstrucciones (`N-CRUCE-1/2`, `N-VOC-1/2/5/6`, `N-LIG-6`): qué hace una edición con el reparto de voces del DCML | 2026-11-07 |
| **Propia** | Decisión del proyecto | Umbrales numéricos, adaptaciones a ejemplos armónicos breves y a las limitaciones de Verovio | — |

Páginas de MuseScore citadas (todas bajo `https://handbook.musescore.org/`):
`basics/working-with-multiple-voices` (MS-voces), `notation/rhythm-meter-and-measures/stems-and-flags` (MS-plicas),
`notation/rhythm-meter-and-measures/beams` (MS-barras), `notation/rhythm-meter-and-measures/regroup-rhythms` (MS-reagrupar),
`notation/rhythm-meter-and-measures/tuplets` (MS-grupos), `notation/pitch/noteheads` (MS-cabezas),
`notation/expressive-markings/slurs-and-ties` (MS-ligaduras), `notation/expressive-markings/dynamics-and-hairpins`
(MS-dinámicas), `notation/expressive-markings/articulations` (MS-articulaciones), `formatting/positioning-of-elements`
(MS-colocación), `formatting/score-size-and-spacing` (MS-espaciado).

Secciones de LilyPond citadas: 1.1.1 «Automatic accidentals» (LP-alt), 1.2.2 «Rests» (LP-silencios), 1.2.1 «Ties»
(LP-ligaduras), 1.2.4 «Beams»: «Setting automatic beam behavior», «How automatic beaming works» (LP-barras),
1.5.2 «Single-staff polyphony»: «Voice order», «Identical rhythms», «Collision resolution» (LP-voces), 1.3 «Dynamics»
(LP-dinámicas), 5.4 «Direction and placement» (LP-dirección), 4.5.1 «Horizontal spacing overview» (LP-espaciado),
3.x «Stems» (LP-plicas).

**Principio.** Se extraen reglas documentadas y se implementan con código propio. Cuando las fuentes difieren se elige una
y se justifica (§ 6). Nada de lo marcado **Propia** se presenta como regla de MuseScore, LilyPond o DAISY.

Citas textuales clave (en inglés, tal como las publican):

- MS-voces: «When there is more than one voice, all music in voices 1 and 3 will have stems up, and all music in voices 2
  and 4 will have stems down.» · «in multiple voices, rests for voice 1 are moved up at least one space and rests for voice 2
  are moved down at least one space […] In practice, they are usually displaced further out to avoid colliding with notation
  in the other voice.» · «It is often necessary to remove redundant rests in secondary voices […] Voice 1 is the 'reference'
  voice and must remain rhythmically complete.»
- MS-plicas: «MuseScore aligns the stems of voice 1 notes according to the conventions of music theory. […] Voice 1 stems
  automatically flip upwards in the presence of voice 2 or 4 notes.»
- MS-cabezas: «Notes with stems in the same direction do not share noteheads. Dotted notes do not share noteheads with
  undotted notes. Black notes do not share noteheads with white notes. Whole notes never share noteheads.»
- MS-reagrupar: «sixteenth notes should be beamed in a way that clarifies each beat · eighth notes should be beamed in a way
  that clarifies each group of two beats · longer notes that start off the beat should be broken up with ties […]» y
  «The rhythm itself is not changed—only the notation of it.»
- MS-colocación: dinámicas por defecto «below the staff […] 2.5 sp», y la colocación automática evita colisiones moviendo
  en vertical con una «Minimum distance».
- MS-dinámicas: con «Based on voice»: «Voice 1 dynamics go below the staff if there is only one voice at that rhythmic
  position, and otherwise go above · Voice 3 dynamics go above the staff · Voice 2 and 4 dynamics go below the staff»;
  en voces cantadas, por encima.
- LP-voces: «Voice 1: highest · Voice 2: lowest · Voice 3: second highest · Voice 4: second lowest […] the odd-numbered
  voices are given upstems, and the even-numbered voices are given downstems.» · «The note heads of notes in different
  voices with the same pitch, same note head and opposite stem direction are automatically merged […] Rests opposite a
  stem in a different voice are shifted vertically.» · «Identical rhythms […] we can combine them into a single Voice
  context, thus forming chords.»
- LP-barras: «4/4 time tries to beam the measure in two if there are only eighth notes» · «eighth notes in 3/4 time are
  beamed as a full measure by default» · «the beam type is the duration of the shortest note in the beamed group».
- LP-alt (estilo por defecto): «accidentals are remembered to the end of the measure in which they occur and only in their
  own octave».
- LP-ligaduras: «When a tie is applied to a chord, all note heads whose pitches match are connected.»
- LP-dirección: «some directions are always up or always down (e.g., dynamics or fermata), while other things can alternate
  between up or down based on the stem direction (like slurs or accents).» · LP-dinámicas: «placed below the staff, but in
  choral music they are usually placed above».
- LP-espaciado: «Longer durations get more space, shorter durations get less […] doubling a duration adds spacing-increment
  of space to the note», con la duración más breve **más frecuente** como base.
- DAISY G2 (elementos anclados a su nota y voz), G8 (evitar notas, dinámicas o articulaciones ocultas superfluas), G10
  (reglas de alteración especiales), G14 (alternancia de manos en la misma voz), G15 (limpiar silencios ocultos), G16
  (alteraciones de la misma nota en voces distintas).

---

## 2. Arquitectura del motor

```
  paquete scores/*.json ──► 1 ADAPTACIÓN DE FUENTE  index.html · textoDe(o)            bytes → texto MusicXML (UTF-8/16)
                               │                     Notacion.fuenteDe(o)             'reconstruida' | 'convertida' | 'edicion'
                               ▼
                           2 MODELO NORMALIZADO       web/musica.js · Musica.leer      DOM de MusicXML + lectura normalizada
                               ▼                                                       (parte, compás, instante, voz, altura…)
                           3 TRANSFORMACIONES +       web/notacion.js · TRANSFORMACIONES (registro único, declarativo)
                           4 REGLAS DE GRABADO        Notacion.preparar(xml, ctx)      una lectura, N pasos, una escritura;
                               │                                                       integridad antes/después de cada paso
                               ▼
                           5 MusicXML                 XMLSerializer (una vez)          cacheado por obra (xmlCache)
                               ▼
                           6 RENDERIZADO              Verovio 6.3 (index.html · mostrar) con Notacion.opciones
                               │                      + Notacion.compasInicio (N-INI-1, depende del fragmento)
                               ▼
                           7 AJUSTES SVG              web/notacion_svg.js · Notacion.svg.aplicar   (N-SIL-2, N-LIG-2, N-NUM-2)
```

**Por qué no hay un formato intermedio propio.** MusicXML ya tiene partes, pentagramas, voces, compases, duraciones,
acordes, ligaduras y alteraciones, y Verovio lo lee directamente. Un modelo propio obligaría a escribir un conversor de ida y
vuelta (y sus errores). Se adopta **el DOM de MusicXML como modelo** y se añade una **lectura normalizada**
(`Musica.leer`) que resuelve lo que el DOM no da hecho: instante métrico de cada nota (con `<backup>`, `<forward>`,
`<chord>` y notas de adorno), armadura y compás vigentes, y la huella por propiedad musical (§ 3).

**Registro de transformaciones.** Cada operación sobre el MusicXML es una entrada de `Notacion.transformaciones`:

| Campo | Significado |
|---|---|
| `id` | identificador (`plicas-por-voz`, `fusionar-voces-iguales`…) |
| `regla` | regla de esta especificación que implementa |
| `tipo` | `presentacion` (qué se muestra en un ejemplo armónico), `estructural` (cambia la estructura musical a propósito), `notacion` (corrección de notación: cambia cómo se escribe, nunca qué suena) |
| `fuentes` | fuentes a las que se aplica |
| `modifica` | propiedades musicales (§ 3) que **puede** cambiar; todas las demás se verifican |
| `activa(ctx)` | interruptor (`Notacion.config`) o condición del contexto |

Orden de la canalización (el de `TRANSFORMACIONES`):

| # | id | regla | tipo | fuentes | modifica |
|---|---|---|---|---|---|
| 1 | `quitar-armonias` | N-PRES-1 | presentación | todas | armonias |
| 2 | `quitar-expresion` | N-PRES-2 | presentación | todas | dinamicas, textos, tempo, articulaciones |
| 3 | `ocultar-nombre-unico` | N-PRES-3 | presentación | todas | nombresInstrumento |
| 4 | `claves-por-tesitura` | N-CLAVE-1 | notación | reconstruida | claves |
| 5 | `claves-corregidas` | N-CLAVE-1 | notación | convertida, edición (solo con `clavesDeLaEdicion=false`) | claves |
| 6 | `fusionar-voces-iguales` | N-VOC-3 | **estructural** | reconstruida | voces, acordes, numeracionVoces, silencios, silenciosVisibles |
| 7 | `voces-por-altura` | N-VOC-4 | notación | reconstruida | numeracionVoces |
| 8 | `silencios-reconstruccion` | N-SIL-1 | notación | reconstruida | silenciosVisibles |
| 9 | `barras-automaticas` | N-BARRA-1/3 | notación | reconstruida | — |
| 10 | `alteraciones-una-vez` | N-ALT-2 | notación | reconstruida, convertida | alteracionesEscritas |
| 11 | `plicas-por-voz` | N-PLICA-2/3 | notación | todas | — |
| 12 | `ligaduras-por-voz` | N-LIG-3 | notación | todas | — |
| 13 | `alinear-anacrusa` | N-NUM-1 | presentación | todas (si el análisis numera la anacrusa 0) | numeracionCompases |

**Capas, de más a menos barata**: opciones de Verovio → MusicXML → SVG. Una regla se implementa en la capa más barata que la
resuelva; el SVG solo cuando no hay solución en las otras dos, y cada ajuste SVG deja una marca (`data-n-…`) y tiene prueba.

**Fuentes y sus particularidades** (`Notacion.fuentes`):

| Fuente | Procedencia | Particularidades relevantes |
|---|---|---|
| `reconstruida` | MusicXML generado desde las tablas de notas del DCML (`herramientas/dcml_a_mxl.py`) | sin plicas, barras parciales, una clave por pentagrama, alteración en cada nota, silencios añadidos por la reconstrucción, hasta 4 voces por pentagrama |
| `convertida` | Ediciones codificadas en Humdrum por Craig Sapp, convertidas con music21 (`herramientas/krn_beethoven_a_mxl.py`) | voces y claves de la edición; la conversión escribe la alteración en cada nota y deja «dinámicas» vacías |
| `edicion` | MusicXML de OpenScore, When in Rome, corpus de music21, corales | se respeta tal cual salvo las reglas comunes a todas las fuentes |

---

## 3. Integridad musical

Condición crítica: **ninguna mejora visual puede alterar la información musical sin declararlo**.

| Id | Regla | Implementación | Prueba |
|---|---|---|---|
| `I-1` | Cada transformación declara su tipo y las propiedades que puede modificar | `transformacion({tipo, modifica})` | `prueba_motor.js` (catálogo y registro) |
| `I-2` | Antes y después de cada paso se compara la huella de todas las propiedades no declaradas | `Notacion.preparar` + `Musica.huella`/`Musica.comparar` | `prueba_motor.js` (transformación fraudulenta) |
| `I-3` | Si una transformación altera algo no declarado: error identificable `HF-INTEGRIDAD` (`Musica.ErrorIntegridad`, con la transformación y la lista de diferencias). Modo `estricto` (pruebas): se lanza y se detiene. Modo `revertir` (por defecto en la web): se deshace ese paso, se registra en `Notacion.incidencias` y en la consola, y se sigue con los demás. Nunca continúa en silencio | `Notacion.config.integridad` | `prueba_motor.js` |
| `I-4` | Una excepción dentro de una transformación deshace ese paso (antes quedaba el DOM a medio modificar) | copia del documento antes de cada paso | `prueba_motor.js` |
| `I-5` | Lectura de alturas: ninguna transformación puede hacer que una nota pase a leerse mal (armadura + alteraciones impresas del compás, en su octava y pentagrama, frente a la altura real; las notas ligadas desde antes no cuentan) | propiedad `lecturaAlturas` (solo se vigilan los aumentos) | `prueba_motor.js` (becuadro necesario quitado) |
| `I-6` | Corpus completo, todas las fuentes, en modo estricto: comparación global original → preparado | `herramientas/prueba_integridad.js` | ídem |

Propiedades vigiladas (`Musica.PROPIEDADES`): notas (número, instante y altura con octava y alteración sonora), duraciones,
silencios, silencios visibles, pentagrama de cada nota, reparto de voces (qué notas van juntas, sin mirar el número),
numeración de voces, acordes, ligaduras de prolongación, ligaduras de expresión, alteraciones impresas, instrumentos y
pentagramas, nombres de instrumento, número de compases, numeración de compases, compás, armadura, claves, líneas de octava,
tempo, dinámicas, textos de expresión, articulaciones, adornos y calderones, cifrados del archivo, letra y lectura de alturas.

**No se vigilan** (son lo que el motor tiene derecho a decidir): dirección de plicas, barras, orientación de ligaduras,
posición vertical de silencios, desplazamiento de cabezas.

**Correcciones de notación frente a transformaciones musicales.** Las del tipo `notacion` no pueden declarar notas,
duraciones, voces, acordes, ligaduras, compases, armadura ni instrumentos (lo comprueba `prueba_motor.js`). La única
transformación estructural es `N-VOC-3` (voces de ritmo idéntico unidas en acordes, solo reconstrucciones), y declara
exactamente lo que cambia: notas, alturas, duraciones y posiciones siguen intactas.

---

## 4. Reglas de grabado

Formato de cada regla: **Descripción** · **Referencia** · **Comportamiento esperado** · **Casos especiales** ·
**Excepciones** · **Implementación** · **Prueba** · **Estado / prioridad**. Estados: **aplicada** (código del motor),
**verovio** (la resuelve Verovio; el motor no actúa y la auditoría la mide), **pendiente**. Prioridad: P1 (alta) a P3.

### A. Plicas

#### `N-PLICA-1` — Dirección y longitud con una sola voz
- **Descripción.** Con una sola voz en el pentagrama, la plica sigue la posición de las notas.
- **Referencia.** MS-plicas («according to the conventions of music theory»); LP-plicas (dirección neutra en la línea
  central configurable, `neutral-direction`).
- **Comportamiento esperado.** Notas por encima de la línea central: plica abajo; por debajo: arriba; en acordes, la nota
  más alejada de la línea central decide; plica de una octava aprox., y fuera del pentagrama hasta la línea central.
- **Casos especiales.** Nota en la línea central (Verovio: abajo); grupos con barra: dirección común del grupo.
- **Excepciones.** Con varias voces simultáneas manda `N-PLICA-2`.
- **Implementación.** Verovio (el motor no escribe `<stem>` con una sola voz).
- **Prueba.** `prueba_motor.js` («una sola voz: no se toca»); auditoría `plicaCorta`, `plicaNoLlega` (0 casos).
- **Estado.** verovio.

#### `N-PLICA-2` — Una dirección por voz con varias voces
- **Descripción.** Con dos o más voces que suenan a la vez en un pentagrama, la más aguda lleva plica arriba y la más grave
  abajo, en todo el compás.
- **Referencia.** MS-voces (voces 1 y 3 arriba, 2 y 4 abajo), MS-plicas («Voice 1 stems automatically flip upwards in the
  presence of voice 2 or 4 notes»), LP-voces («Voice order»).
- **Comportamiento esperado.** Igual para todas las fuentes; corrige la plica errónea del archivo.
- **Casos especiales.** El número de voz del archivo no siempre sigue la convención (ediciones convertidas que escriben
  antes la voz grave): se decide por **altura media** de la voz en el compás (§ 6, D1). Una voz que calla un momento conserva
  su dirección en todo el compás.
- **Excepciones.** Voces que nunca suenan a la vez en el compás: no se tocan (Verovio decide por posición; MS-código mira
  si hay otras voces en el tramo de la nota).
- **Implementación.** `plicas-por-voz` (`plicasPorVozDoc`, `analizarVoces`). **Única fuente de verdad** de las plicas con
  varias voces (antes, en las reconstrucciones también las fijaba `ordenarVoces`).
- **Prueba.** `prueba_motor.js` (A. Plicas), `prueba_notacion.js`; auditoría `plicaVoz`.
- **Estado.** aplicada.

#### `N-PLICA-3` — Voces intermedias
- **Descripción.** Con 3+ voces simultáneas, las intermedias se orientan por su **rango** de altura.
- **Referencia.** LP-voces (voz 3 = segunda más aguda, plica arriba; voz 4 = segunda más grave, abajo); MS-voces (voz 3
  arriba, voz 4 abajo).
- **Comportamiento esperado.** Ordenadas de aguda a grave, las de la mitad superior arriba y las de la inferior abajo; con un
  número impar, la central arriba.
- **Casos especiales.** Si la edición ya trae `<stem>` en esa voz, se respeta.
- **Excepciones.** Voces que no suenan con ninguna otra.
- **Implementación.** `plicas-por-voz`.
- **Prueba.** `prueba_motor.js` («cuatro voces…», «la plica que la edición ya trae…»); `prueba_notacion.js` (tres voces).
- **Estado.** aplicada. Antes (v0.8.7) las reconstrucciones usaban la cercanía a la voz aguda o grave, sin respaldo documental.
  Medido sobre 126 fragmentos con 3+ voces simultáneas (83 reconstruidos), con `Notacion.config.vocesIntermedias`:
  plicas que atraviesan una cabeza de otra voz 7 (v0.8.7) → **2 con «rango»** / 7 con «cercanía»; ligaduras de unión que
  chocan 18 → 14 / 14. Limitación: LilyPond acompaña esta convención de un desplazamiento horizontal de la voz 3
  (`\shiftOn`) que Verovio no hace, así que algunos compases quedan más apretados (Allemande de la Suite inglesa n.º 1,
  c. 6, regresión visual).

#### `N-PLICA-4` — Longitud de plica en acordes amplios, con barra y con cabeza desplazada
- **Descripción.** Plicas alargadas para alcanzar la barra o la nota extrema del acorde; plica compartida en acordes de
  segunda con la cabeza desplazada al lado correcto.
- **Referencia.** MS-plicas (longitud editable; no documenta números); LP-plicas.
- **Implementación.** Verovio. **Prueba.** auditoría `plicaCorta`. **Estado.** verovio, P3.

### B. Cabezas de nota

#### `N-CAB-1` — Segundas, unísonos y colisiones entre voces
- **Descripción.** Cabezas a distancia de segunda dentro de un acorde: una a cada lado de la plica. Entre voces: unísono con
  plicas opuestas, misma figura y mismos puntillos → cabeza compartida; si no, se desplaza una de ellas.
- **Referencia.** MS-cabezas (reglas de cabeza compartida citadas en § 1); LP-voces («Collision resolution»: unísono con
  plicas opuestas y misma cabeza se funde; negra y blanca no).
- **Casos especiales.** Puntillos distintos, blanca frente a negra, redondas: dos cabezas.
- **Implementación.** Verovio. **Prueba.** auditoría `notaNota` (0 cabezas encimadas en la muestra).
- **Estado.** verovio.

#### `N-VOC-2` — Unísonos entre las dos manos
- **Descripción.** Reconstrucciones: la misma nota (altura y grafía) atacada a la vez en las dos manos se escribe una vez: la
  más larga o, si duran igual, la del pentagrama de su registro. Dentro de un pentagrama no se quita: una cabeza y dos plicas
  (`N-VOC-5`).
- **Referencia.** Ed-806 (c. 1: el do#4 duplicado en las dos manos se escribe una vez); MS-cabezas.
- **Excepciones.** Notas que llegan ligadas (forman parte de otra nota).
- **Implementación.** `unisono-entre-manos` (estructural; declara notas, duraciones, voces, pentagramas, acordes, ligaduras).
- **Prueba.** `prueba_notacion.js` («un unísono entre manos se escribe una vez»). **Estado.** aplicada.

#### `N-VOC-5` — Unísonos entre capas: una cabeza y dos plicas
- **Descripción.** Dos voces que atacan a la vez la misma nota (el *style brisé*: un arpegio en semicorcheas y, en otras
  voces, cada nota sostenida con su duración) llevan plicas opuestas y comparten la cabeza, cada una con su figura y puntillo.
- **Referencia.** Ed-806 (cc. 1-2, 25, 29, 30: mi5 con puntillo y do#5 en corchea sobre las semicorcheas mi5-do#5-la4);
  MS-cabezas (unísono con plicas opuestas); LP-voces («Collision resolution»).
- **Comportamiento esperado.** Verovio solo comparte la cabeza si figura y puntillo coinciden; si no, desplaza una a un lado.
  En el SVG se lleva la nota que no está bajo una barra sobre la otra (cabeza, plica, corchete, puntillos y alteración) y se
  corren los extremos de sus ligaduras (`data-startid`/`data-endid`, opción `svgAdditionalAttribute`).
- **Excepciones.** Cabezas distintas (blanca y negra) van una junto a otra (MS-cabezas, LP-voces); notas bajo una barra en
  las dos capas no se mueven.
- **Implementación.** Plicas: dentro de `plicas-por-voz`, tras `N-PLICA-2/3`, solo reconstrucciones (`plicasUnisonoDoc`).
  Cabezas: `cabezasCompartidas` (`notacion_svg.js`), con el instante de cada nota del *timemap* de Verovio.
- **Prueba.** `prueba_notacion.js` (plicas opuestas; Allemande, cc. 0-3); auditoría `unisonoSeparado`. **Estado.** aplicada.

### C. Barras y agrupaciones rítmicas

#### `N-BARRA-1` — Agrupación por pulso
- **Descripción.** Las figuras de corchea o menos sin barra se agrupan por pulso, en cada pentagrama y voz.
- **Referencia.** LP-barras («How automatic beaming works»: los grupos terminan al final de cada pulso de `beatStructure`);
  MS-reagrupar («sixteenth notes should be beamed in a way that clarifies each beat»); MS-barras (la agrupación por defecto
  la fija el compás).
- **Comportamiento esperado.** Pulso: la unidad del compás; en compases compuestos (6/8, 9/8, 12/8, 6/16…), tres unidades.
  Un silencio, una nota de adorno o una figura de negra o mayor cortan el grupo. Barras secundarias: se continúan entre
  notas del mismo nivel; una nota aislada de nivel 2+ lleva gancho (hacia delante al principio del grupo, hacia atrás en el
  resto).
- **Casos especiales.** Acordes: la barra se escribe solo en la primera nota del acorde (convención de MusicXML; si las
  demás notas también la llevan, Verovio deja de dibujar notas del acorde: Op. 53 de C. P. E. Bach, c. 91, al unir dos
  corcheas con `N-BARRA-3`). Tresillos: se agrupan por pulso como las demás figuras.
- **Excepciones.** No se tocan las figuras que ya traen `<beam>` (la edición o la reconstrucción las agrupó). Solo
  reconstrucciones: las ediciones traen sus barras.
- **Implementación.** `barras-automaticas` (`barrasAutomaticas`, `estructuraMetrica`).
- **Prueba.** `prueba_motor.js` (C. Barras); auditoría `barraSilencio`.
- **Estado.** aplicada.

#### `N-BARRA-3` — Excepciones por compás
- **Descripción.** Los grupos formados **solo por corcheas** pueden abarcar más de un pulso.
- **Referencia.** LP-barras («4/4 time tries to beam the measure in two if there are only eighth notes», «eighth notes in 3/4
  time are beamed as a full measure by default», «the beam type is the duration of the shortest note in the beamed group»);
  MS-reagrupar («eighth notes should be beamed in a way that clarifies each group of two beats»).
- **Comportamiento esperado.** 4/4: corcheas por medio compás (nunca a través de la mitad). 3/4: compás entero. 3/8 y 3/16:
  el pulso es el compás (tres corcheas juntas; antes quedaban sueltas, con corchete). Los grupos con semicorcheas o menos
  siguen cortándose por pulso; los tresillos no se unen.
- **Casos especiales.** Dos grupos solo se unen si son contiguos (sin silencio ni hueco entre ellos). Una corchea que comparte cabeza con la nota de otra voz (`N-VOC-5`) no se une con el pulso vecino: en Ed-806 (c. 2) lleva su propio corchete.
- **Excepciones.** 2/4 y 2/2 no cambian (2/2 ya agrupa por blanca). LP documenta además `beamHalfMeasure` para 3/4 (evitar
  empezar una barra a mitad de compás, citando a Gould): no se implementa (§ 7, pendiente).
- **Implementación.** `estructuraMetrica` + unión de grupos en `barrasAutomaticas`; `Notacion.config.barrasPorCompas`.
- **Prueba.** `prueba_motor.js` (4/4, 3/4, 3/8, 6/8, 2/4, silencios, tresillos, regla apagada).
- **Estado.** aplicada (nueva).

#### `N-BARRA-2` — Inclinación de las barras
- **Descripción.** Pendiente máxima de las barras.
- **Referencia.** MS-barras (ángulo editable, «Force horizontal», «Flatten all beams»; no documenta umbrales); LP-barras
  (no se consultó la sección de pendiente).
- **Estado.** pendiente (sin evidencia de defecto: el 5 % de las barras sube más de 1,1 espacios y no se ve un error; ver
  `NOTACION.md`). `beamMaxSlope` de Verovio no tiene efecto medible.

#### `N-BARRA-4` — Grupos irregulares
- **Descripción.** Cifra del tresillo del lado de la barra; corchete solo si no hay una barra que abarque el grupo.
- **Referencia.** MS-grupos («no bracket is drawn if there is a continuous beam matching the length of the tuplet»; la
  dirección, como la de las ligaduras, depende de las plicas).
- **Implementación.** Verovio (`tuplet` del MusicXML). **Estado.** verovio.

### D. Alteraciones

#### `N-ALT-2` — Una alteración por compás
- **Descripción.** Una alteración rige para las notas de la misma altura (nombre y octava) del resto del compás en ese
  pentagrama, sea cual sea la voz; solo se repite si cambia.
- **Referencia.** LP-alt (estilo «default»: hasta el final del compás y solo en su octava; en el pentagrama, no por voz);
  DAISY G10 y G16.
- **Comportamiento esperado.** Al empezar el compás rige la armadura. Se quitan las repetidas en reconstrucciones y
  convertidas (la conversión las escribe en cada nota).
- **Casos especiales.** Becuadro necesario: se conserva. Otra octava: se conserva. Otro pentagrama: se conserva. El estado
  sigue lo **escrito**: una nota alterada sin alteración impresa (descuido de la fuente) no autoriza a quitar la de la
  siguiente. Una nota ligada desde el compás anterior se lee por la ligadura y su alteración no rige para el resto del
  compás (la siguiente nota igual conserva la suya); y si la siguiente nota igual lleva otra alteración (el becuadro tras un
  sol♯ ligado), esa alteración se conserva como de precaución, como la imprime la práctica editorial. Estos dos casos estaban mal hasta la v0.8.7 (se quitaban alteraciones
  necesarias en 21 movimientos de las ediciones convertidas de Beethoven, p. ej. Op. 53/iii c. 239, Op. 31 n.º 2/iii c. 170);
  los detectó la comprobación `I-5`.
- **Excepciones.** No toca alteraciones de precaución, editoriales o entre paréntesis, ni las de notas ligadas. Las
  ediciones (OpenScore…) conservan las suyas.
- **Implementación.** `alteraciones-una-vez`; `Notacion.config.alteracionesUnaVez`. Verificada por `I-5`.
- **Prueba.** `prueba_motor.js` (D. Alteraciones), `prueba_notacion.js`.
- **Estado.** aplicada.

#### `N-ALT-1` — Alteraciones que chocan
- **Descripción.** Separación horizontal de alteraciones en acordes (orden en columnas, de la más aguda a la más grave
  alternando) y frente a cabezas de otra voz.
- **Referencia.** No documentado en MS ni en LP con criterios concretos en las páginas consultadas.
- **Implementación.** Verovio (márgenes `leftMarginAccid`/`rightMarginAccid`: probado que ampliarlos apenas mejora).
- **Prueba.** auditoría `alteracionChoque` (12 casos en 57 fragmentos reconstruidos).
- **Estado.** pendiente, P2. Vía: investigar `accid@place`/colocación en MEI antes de tocar el SVG.

#### `N-ALT-3` — Alteraciones simultáneas en distintas voces
- **Descripción.** La misma nota alterada en dos voces del mismo pentagrama: la alteración vale para ambas (estilo por
  pentagrama) y se imprime una sola vez si las cabezas se comparten.
- **Referencia.** DAISY G16; LP-alt (estilo «voice» como alternativa no adoptada).
- **Implementación.** `N-ALT-2` (estado por pentagrama) + Verovio. **Estado.** aplicada parcialmente.

### E. Silencios

#### `N-SIL-1` — Silencios de la reconstrucción con varias voces
- **Descripción.** En las reconstrucciones, los silencios de las voces secundarias se ocultan y los de la voz aguda suben a
  la línea superior del pentagrama.
- **Referencia.** MS-voces («remove redundant rests in secondary voices», «Voice 1 […] must remain rhythmically complete»,
  «rests for voice 1 are moved up at least one space»); DAISY G15 (limpiar silencios ocultos: aquí no se borran del
  MusicXML, se marcan `print-object="no"`, para no alterar la duración de la voz).
- **Casos especiales.** Los silencios de la reconstrucción no existen en las tablas del DCML: los añadió la reconstrucción.
- **Excepciones.** Solo reconstrucciones; las ediciones conservan sus silencios.
- **Implementación.** `silencios-reconstruccion` (tras `N-VOC-4`, la voz aguda es la de número más bajo).
- **Prueba.** `prueba_motor.js` (E).
- **Estado.** aplicada.

#### `N-SIL-2` — Silencios que pisan notas de otra voz
- **Descripción.** Un silencio que pisa una cabeza, plica, barra, corchete o alteración de otra voz se aparta en vertical,
  hacia fuera (arriba en la voz aguda, abajo en las demás), en pasos de media línea hasta 3 espacios y dejando al menos
  0,35 espacios libres; solo si no cabe se oculta.
- **Referencia.** MS-voces («usually displaced further out to avoid colliding»); LP-voces («Rests opposite a stem in a
  different voice are shifted vertically»); separación mínima de 0,35 espacios a un acorde: MS-código (`restlayout`,
  leído en la v0.8.6). El tope de 3 espacios y el ocultar como último recurso son **Propia**.
- **Casos especiales.** Silencio que pisa el silencio de otra voz: se desplaza en el sentido que más lo aleja (como antes).
- **Excepciones.** No toca silencios de una sola voz.
- **Implementación.** `despejarSilencios` en `notacion_svg.js` (capa SVG: Verovio no siempre mira las otras capas y la
  altura final solo se conoce tras dibujar); marca `data-n-sil2`; `Notacion.config.silenciosApartados`.
- **Prueba.** `prueba_motor.js` (SVG sintético); `regresion_visual.js` cuenta silencios apartados y ocultos.
- **Estado.** aplicada (antes se ocultaban siempre).

#### `N-SIL-3` — Silencios coincidentes
- **Descripción.** Silencios de igual duración simultáneos en dos voces: se pueden fundir en uno.
- **Referencia.** MS-voces («Merge matching rests», opción de estilo).
- **Estado.** pendiente, P3 (en las reconstrucciones ya se ocultan los de las voces secundarias).

### F. Ligaduras

#### `N-LIG-1` — Distancia de seguridad
- **Referencia.** MS-ligaduras («Autoplace min. distance», «Minimum tie length»).
- **Implementación.** `OPCIONES` (`slurMargin`, `tieMinLength`…). **Estado.** aplicada.

#### `N-LIG-3` — Ligaduras de prolongación por voz
- **Descripción.** Con varias voces simultáneas, la ligadura de la voz aguda va por arriba y la de la grave por abajo; en un
  acorde, solo la nota exterior lleva la orientación.
- **Referencia.** LP-dirección (las ligaduras alternan con la dirección de la plica); MS-código (`slurtielayout`: con varias
  voces, del lado de la plica). MS-ligaduras solo documenta que la posición es editable.
- **Implementación.** `ligaduras-por-voz` (`placement`/`orientation` de `<tied>`). Aguda y grave se eligen entre las voces que suenan a la vez que alguna otra (como `N-PLICA-2`).
- **Prueba.** `prueba_motor.js` (F), `prueba_notacion.js`. **Estado.** aplicada.

#### `N-LIG-2` — Ligaduras que atraviesan notas, plicas o barras
- **Descripción.** Una ligadura de unión cuyo interior cruza una cabeza, plica, corchete o barra se acorta por los extremos
  y/o se hace más profunda (hasta 0,8 espacios) hasta librarlos; si ninguna variante lo logra, no se toca.
- **Referencia.** MS-ligaduras («Autoplace min. distance»); LP-ligaduras. Los pasos y topes son **Propia**.
- **Casos especiales.** Una ligadura que sale de una cabeza compartida (`N-VOC-5`) solo se recorta por obstáculos a menos de
  1,5 espacios de sus extremos: recortarla por lo de en medio la hacía empezar lejos de su nota (Ed-806, cc. 1-2). Las
  ligaduras de más de 3 espacios prueban además arcos de hasta 2 espacios y el arco por el lado contrario.
- **Implementación.** `despejarLigaduras` (SVG; Verovio no ofrece una opción equivalente); marca `data-n-lig2`.
- **Prueba.** `prueba_notacion.js`; auditoría `unionChoque`. **Estado.** aplicada.

#### `N-LIG-6` — Ligaduras de unión entre capas
- **Descripción.** Una ligadura de unión cuya nota de llegada está en otra voz (al condensar voces, `N-VOC-6`) se dibuja igual
  que las demás.
- **Referencia.** Ed-806 (c. 2: el do#5 en corchea de una voz llega ligado al acorde de corcheas de otra).
- **Comportamiento esperado.** Verovio solo une las de MusicXML dentro de una voz; las demás quedan abiertas o se enganchan a
  otra nota de la misma altura de su capa. En MEI una ligadura une dos notas cualesquiera por su `xml:id`, y Verovio conserva
  los `id` del MusicXML. Se quita la ligadura de `<tied>` (se conserva `<tie>`, lo que suena), se anota el par (`id`,
  `data-hf-tie`) y al dibujar se añade como `<tie>` de MEI (`ligadurasPendientes`, `ligadurasMEI`, `index.html`).
- **Implementación.** `ligaduras-entre-capas` (presentación: dónde se dibuja la ligadura; declara `ligadurasUnion`).
- **Prueba.** `prueba_notacion.js`. **Estado.** aplicada.

#### `N-LIG-4` — Ligaduras entre sistemas y en acordes
- **Descripción.** Ligadura partida al cambiar de sistema; en acordes, una ligadura por nota con pareja.
- **Referencia.** LP-ligaduras («all note heads whose pitches match are connected»); MS-ligaduras («Minimum hanging tie
  length»).
- **Implementación.** Verovio. Los fragmentos se dibujan en un solo sistema (`breaks: none`). **Estado.** verovio.

#### `N-LIG-5` — Ligaduras de expresión
- **Descripción.** Del lado de las cabezas con una voz; del lado de la plica con varias voces.
- **Referencia.** LP-dirección; MS-ligaduras.
- **Implementación.** Verovio. **Prueba.** auditoría `expresionChoque`. **Estado.** verovio.

### G. Espaciado

#### `N-ESP-1` — Aire alrededor de alteraciones y silencios
- **Implementación.** `OPCIONES` (`leftMarginAccid` 2, `rightMarginAccid` 0,8, `leftMarginRest` 2, `rightMarginRest` 1).
  Hasta la v0.8.9 `leftMarginAccid` valía 2,2, fuera del rango de Verovio (0-2): lo rechazaba y usaba su valor por defecto
  (1). `prueba_notacion.js` comprueba ahora el rango de todas las opciones. **Estado.** aplicada.

#### `N-ESP-2` — Espaciado horizontal proporcional
- **Descripción.** Más espacio para las duraciones largas, con la duración breve más frecuente como base.
- **Referencia.** LP-espaciado; MS-espaciado (anchura mínima de cada compás y justificación).
- **Implementación.** Verovio (`spacingLinear` 0,3, `spacingNonLinear` 0,62). La web ensancha la página si los cifrados no
  caben (`mostrar`). **Prueba.** Medido en `NOTACION.md`: ampliar el espaciado no reduce los choques. **Estado.** verovio.

#### `N-ESP-3` — Espaciado vertical entre pentagramas
- **Referencia.** MS-espaciado (distancias mínimas y factores entre pentagramas y sistemas).
- **Implementación.** Verovio (`adjustPageHeight`). **Estado.** verovio, P3.

#### `N-NUM-2` — Números de compás sin choques
- **Descripción.** El número de compás que choca con notas, plicas, ligaduras o indicaciones sube por encima; los números
  internos de la reconstrucción («8X1») no se muestran; una casilla que empieza en el fragmento va sin paréntesis.
- **Referencia.** MS-colocación (evitar colisiones en vertical con distancia mínima). **Propia** el margen.
- **Implementación.** `despejarNumeros`, `limpiarNumeros` (SVG). **Estado.** aplicada.

#### `N-INI-1` — Indicaciones al inicio del fragmento
- **Descripción.** Un fragmento que empieza a mitad de obra muestra el compás vigente.
- **Referencia.** MS-compases (la indicación se muestra en todos los pentagramas por defecto). **Propia**: escribirla en el
  primer compás del fragmento.
- **Implementación.** `Notacion.compasInicio` al grabar cada fragmento. **Prueba.** `prueba_notacion.js`. **Estado.** aplicada.

#### `N-CLAVE-1` — Elección y cambio de clave
- **Descripción.** Reconstrucciones: clave por tesitura e instrumento (programación dinámica que penaliza líneas adicionales
  y cambios breves). Ediciones: sus claves, también los cambios a mitad de compás.
- **Referencia.** MS (claves propias de cada instrumento al crear la partitura). Los costes son **Propia**.
- **Casos especiales.** En el pentagrama inferior del teclado, en los compases que caben en fa con 2 líneas adicionales o menos,
  el cambio a clave de sol cuesta más (sesgo 2 en vez de 0,6): la izquierda no cambia de clave por un pasaje de tenor (Ed-806:
  clave de fa en toda la *Allemande*); una izquierda aguda de verdad pasa a sol (Bartók, Bagatela n.º 1). `CONFIG.izquierdaEnFa`. La clave se elige después de
  repartir las voces (`N-CRUCE-1/2`, `N-VOC-1/2/6`).
- **Implementación.** `claves-por-tesitura`, `claves-corregidas`. **Prueba.** `prueba_motor.js`, `auditoria_claves.js`.
- **Estado.** aplicada.

#### `N-OCT-1` — Muchas líneas adicionales
- **Referencia.** DAISY G14 (alternancia de manos en la misma voz). **Estado.** pendiente, P2 (ver `NOTACION.md`).

#### `N-CRUCE-1` — Una voz que su mano no alcanza pasa a la otra
- **Descripción.** Reconstrucciones: una voz que no es la exterior de su mano (la más aguda de la derecha, la más grave de la
  izquierda) pasa al pentagrama de la otra mano en ese compás si, a la vez que alguna de sus notas, otra voz de su pentagrama
  está a más de una décima, y en la otra mano cabe (y allí no pasa de 3 líneas adicionales).
- **Referencia.** Ed-806 (c. 1: la3-do#4-mi4 mientras la derecha toca la5 → mano izquierda; c. 5: sol#2 bajo sol#4; c. 4: un
  tenor la3-do#4 sobre si2 se queda abajo). El umbral (décima, 9 pasos diatónicos) es **Propia**.
- **Excepciones.** No se decide por líneas adicionales: los cruces de manos de la fuente se conservan (Medtner, Op. 26 n.º 4,
  cc. 38-39; Liszt, *Sposalizio*, c. 58).
- **Casos especiales.** Al reescribir un compás, cada nota con altura lleva su alteración explícita (las que sobran las quita
  `N-ALT-2`): mover una nota a otro pentagrama no puede hacer que se lea mal (I-5). Vale para todas las reglas de voces.
- **Implementación.** `voces-a-su-mano` (estructural), antes de `N-CLAVE-1`. **Prueba.** `prueba_notacion.js`. **Estado.** aplicada.

#### `N-CRUCE-2` — Notas sueltas al otro pentagrama, con barra que cruza
- **Descripción.** En una voz interior, una nota con 3+ líneas adicionales en su pentagrama y como mucho 1 en el otro se dibuja
  en el otro pentagrama, con lo que le sigue en ese pulso y las notas a las que va ligada, si queda por debajo (o por encima)
  de todo lo que suena allí. Sigue en su voz (`data-hf-casa` guarda el pentagrama de origen), apunta con la plica hacia él y
  la barra cruza de pentagrama.
- **Referencia.** Ed-806 (c. 2: sol#4-la4-si4-mi4-fa#4 de la izquierda en el pentagrama de la derecha; el fa#4 con puntillo
  queda abajo, unido al sol#4 por una barra que cruza); DAISY G14.
- **Implementación.** `notas-al-otro-pentagrama` (estructural). `voces-por-altura` no renumera esos compases; las demás
  reglas de voces, barras y plicas agrupan por el pentagrama de origen. **Prueba.** `prueba_notacion.js`. **Estado.** aplicada.

#### `N-VOC-1` — Tres o más voces en un pentagrama
- **Descripción.** Reconstrucciones: mientras un pentagrama tenga más de dos voces con notas, una voz se intercala en una
  vecina si no suenan a la vez, o se escribe como acordes de la vecina, partida en trozos ligados, si la vecina suena durante
  todas sus notas.
- **Referencia.** Ed-806 (c. 2: el arpegio sostenido, de 4 voces encimadas a 2 capas; cc. 6-7: una línea melódica intermedia
  se deja como voz propia); LP-voces («Identical rhythms»).
- **Excepciones.** No se funden las voces de un *brisé* (`N-VOC-5`). Se rechaza si añade de media más de una ligadura por pulso
  o más de dos en un pulso (línea real; **Propia**), o si un trozo no se puede escribir con figuras.
- **Implementación.** `dos-capas` (estructural; declara notas y duraciones porque parte notas en trozos ligados: lo que suena
  no cambia). **Prueba.** `prueba_notacion.js`. **Estado.** aplicada.

#### `N-VOC-6` — Voces que coinciden en ritmo: un acorde con una plica
- **Descripción.** Con 3+ voces sonando en un pentagrama, la nota de una voz interior que coincide en instante y duración con la
  de una vecina pasa a su acorde, también si llega ligada; dos acordes condensados seguidos en un pulso van en la misma voz (y
  bajo una barra). Dos voces con el mismo ritmo en todo el compás van en acordes de una voz; si coinciden solo en parte se
  dejan separadas.
- **Referencia.** Ed-806 (c. 3: do#5 y la4 en un acorde; c. 4: fa#4 y re#4; cc. 1-2: notas sostenidas que llegan ligadas a un
  acorde; cc. 6-7: dos voces que coinciden a ratos, separadas); LP-voces («Identical rhythms»).
- **Excepciones.** Unísonos (`N-VOC-5`), voces que se cruzarían, notas a más de una décima.
- **Implementación.** `voces-condensadas` (estructural). **Prueba.** `prueba_notacion.js`. **Estado.** aplicada.

#### `N-VOC-3` — Voces de ritmo idéntico en acordes (estructural)
- **Descripción.** En las reconstrucciones, con 3+ voces en un pentagrama, una voz cuyas notas coinciden todas en inicio y
  duración con las de otra pasa a formar acordes con ella; su hueco se conserva como `<forward>` y sus silencios se quitan.
- **Referencia.** LP-voces («Identical rhythms»: «combine them into a single Voice context, thus forming chords»).
- **Implementación.** `fusionar-voces-iguales` (estructural; declara voces, acordes, numeración de voces y silencios).
- **Prueba.** `prueba_motor.js` (E); `prueba_integridad.js` (notas, duraciones y posiciones intactas). **Estado.** aplicada.

#### `N-VOC-4` — Numeración de voces por altura
- **Referencia.** LP-voces («Voice 1: highest»); MS-voces (voz 1 de referencia, plica arriba).
- **Implementación.** `voces-por-altura` (solo cambia `<voice>`). **Estado.** aplicada.

### H. Elementos expresivos y presentación

#### `N-PRES-1`, `N-PRES-2`, `N-PRES-3` — Ejemplos armónicos sin elementos ajenos
- **Descripción.** Se quitan los cifrados del archivo (la web graba los suyos), las dinámicas, reguladores, textos,
  metrónomos y articulaciones (chocan con los cifrados), y el nombre de un instrumento único. Se conservan ligaduras, líneas
  de octava y calderones (marcan la frase y la cadencia).
- **Referencia.** **Propia** (decisión de producto, anterior a esta especificación). DAISY G8 desaconseja elementos ocultos
  superfluos: aquí se eliminan del MusicXML de la vista, no se ocultan.
- **Implementación.** `quitar-armonias`, `quitar-expresion`, `ocultar-nombre-unico` (tipo `presentacion`, declaradas).
- **Prueba.** `prueba_motor.js`. **Estado.** aplicada.

#### `N-EXP-1` — Colocación de dinámicas y articulaciones (si se muestran)
- **Descripción.** Dinámicas bajo el pentagrama (por encima en voces cantadas; con varias voces, según la voz);
  articulaciones del lado de la cabeza (contrario a la plica); calderón siempre arriba.
- **Referencia.** MS-colocación (dinámica a 2,5 sp bajo el pentagrama), MS-dinámicas («Based on voice»), LP-dinámicas,
  LP-dirección.
- **Estado.** pendiente, P3: hoy no se muestran (`N-PRES-2`). Si se activan, Verovio ya aplica estas posiciones por defecto
  y habría que auditarlas.

#### `N-NUM-1` — Numeración de la anacrusa
- **Descripción.** Si el análisis numera la anacrusa 0 y la partitura 1, se renumeran los compases de la partitura.
- **Referencia.** **Propia** (alineación con el análisis). **Implementación.** `alinear-anacrusa`. **Estado.** aplicada.

---

## 5. Prioridades

| Prioridad | Reglas |
|---|---|
| Hecho en esta versión | `I-1`…`I-6`, `N-PLICA-2`/`N-PLICA-3` unificadas, `N-BARRA-3`, `N-SIL-2`, `N-VOC-3`/`N-VOC-4` declaradas, `N-PRES-*` sin expresiones regulares |
| P1 | — (sin defectos graves abiertos medidos) |
| P2 | `N-ALT-1` (choques de alteraciones en reconstrucciones), `N-VOC-1` (3+ voces), `N-OCT-1`/`N-CRUCE-1` |
| P3 | `N-VOC-2`, `N-SIL-3`, `N-BARRA-2`, `N-EXP-1`, `N-ESP-3`, `beamHalfMeasure` en 3/4 |

---

## 6. Diferencias entre criterios y decisión adoptada

| # | Tema | MuseScore | LilyPond | Decisión |
|---|---|---|---|---|
| D1 | Qué voz va arriba | Por **número** de voz (1 y 3 arriba) | Por número, con la convención de que la voz 1 es la más aguda | Por **altura media** en el compás: los archivos del corpus no siguen siempre la numeración (ediciones convertidas con la voz grave primero). Equivale a las dos fuentes cuando el archivo sigue la convención. |
| D2 | Cuándo se fuerza la dirección | En el tramo de cada nota, si hay otras voces | Por voz, siempre | En **todo el compás**, si las voces coinciden en algún momento (estabilidad visual de la voz en el compás; ver `N-PLICA-2`). |
| D3 | Voces intermedias | Voz 3 arriba, voz 4 abajo | Voz 3 (segunda más aguda) arriba, voz 4 (segunda más grave) abajo | Por **rango**: mitad superior arriba; con número impar, la central arriba (= voz 3). |
| D4 | Silencios que chocan | Se desplazan hacia fuera | Se desplazan en vertical | Se desplazan (hasta 3 espacios); ocultar solo como último recurso (**Propia**, por ser ejemplos armónicos). |
| D5 | Silencios de voces secundarias | Ocultar o borrar los redundantes (manual) | `\voiceTwo` con silencios espaciadores | En reconstrucciones se ocultan (`print-object="no"`) porque los añadió la reconstrucción; no se borran para no alterar la duración de la voz. |
| D6 | Corcheas en 4/4 | Por grupos de dos pulsos (MS-reagrupar) | Medio compás si solo hay corcheas | Medio compás si solo hay corcheas (coinciden). |
| D7 | Alcance de una alteración | (No documentado en las páginas leídas) | Hasta final de compás, en su octava, por pentagrama | LilyPond «default». |

---

## 7. Limitaciones de Verovio y MusicXML encontradas

- **Verovio decide las capas por número de voz**: por eso `N-VOC-4` renumera las voces de las reconstrucciones y `N-PLICA-2`
  escribe `<stem>` explícito en lugar de depender del orden del archivo.
- **`beamMaxSlope` sin efecto medible** sobre la pendiente de las barras (1 a 20); solo 0 aplana todas (`NOTACION.md`).
- **Márgenes de alteraciones** (`leftMarginAccid`…): su máximo es 2; con 2 (en vez del 1 efectivo hasta la v0.8.9) los choques
  de alteraciones de la muestra estándar no cambian (1 y 1); `N-ALT-1` necesita otra vía.
- **Opciones fuera de rango**: Verovio las rechaza con un aviso en la consola y sigue con el valor por defecto.
- **Unísonos entre capas**: Verovio solo comparte la cabeza si las dos notas son iguales de figura y puntillo → `N-VOC-5` en SVG.
- **Ligaduras entre capas**: desde MusicXML Verovio solo une ligaduras dentro de una voz; en MEI, entre dos notas cualesquiera →
  `N-LIG-6` las añade al MEI al dibujar. Verovio dibuja las ligaduras a partir de `<tied>`, no de `<tie>`.
- **Barras que cruzan de pentagrama**: Verovio las dibuja si las notas siguen en la misma voz y solo cambian de `<staff>` →
  `N-CRUCE-2`.
- **Ligaduras**: Verovio no aparta las ligaduras de unión de plicas y corchetes de notas muy juntas; no hay opción
  equivalente → `N-LIG-2` en SVG.
- **Silencios entre capas**: Verovio no siempre evita las notas de otra capa → `N-SIL-2` en SVG.
- **MusicXML no tiene «beamHalfMeasure» ni reglas de agrupación por compás**: las barras se escriben explícitas
  (`<beam>`) en `N-BARRA-1/3`.
- **MusicXML no distingue «silencio redundante» de «silencio necesario»**: `N-SIL-1` usa la procedencia (reconstrucción).
- **Un fragmento empieza a mitad de obra**: Verovio solo dibuja la indicación de compás donde la escribe el archivo →
  `N-INI-1` la añade al grabar.

---

## 8. Pruebas

| Nivel | Herramienta | Qué comprueba | Requisitos |
|---|---|---|---|
| 1 · unitarias | `node herramientas/prueba_motor.js` | Una o más pruebas por regla (plicas, barras, alteraciones, silencios, voces, claves, presentación, SVG) y el registro | Playwright y Chromium (sin servidor ni Verovio) |
| 1 · reglas en la web | `node herramientas/prueba_notacion.js` | `N-INI-1` dibujado, `N-ALT-2`, `N-PLICA-2/3`, `N-LIG-3`, `N-LIG-2`, catálogo ↔ especificación | web servida en `http://localhost:8767/` + `VEROVIO_JS` |
| 2 · integridad | `node herramientas/prueba_motor.js` (I-1…I-5) y `node herramientas/prueba_integridad.js [límite] [filtro]` (I-6) | notas perdidas o duplicadas, alteraciones, duraciones, posiciones métricas, voces fusionadas, ligaduras, armadura, compás, pentagramas, lectura de alturas; todo el corpus en modo estricto | ídem |
| 3 · regresión visual | `node herramientas/regresion_visual.js` (comparar) / `--referencia` (regenerar) | 23 fragmentos de `herramientas/regresion_visual/casos.json` (monodia y textos didácticos, corales, piano, voz y piano, orquesta, cuarteto con clave de do, madrigal, Bartók, polifonía de teclado, pasajes densos, 3/4, 2/4, 4/4, 6/8…, las tres fuentes) contra las PNG de `herramientas/regresion_visual/ref/`; informe HTML con referencia, nueva y diferencias | ídem |
| métricas | `node herramientas/auditoria_gould.js …` | choques de ligaduras, alteraciones, plicas, cabezas; barras; líneas adicionales (`NOTACION.md`) | ídem |

Las referencias visuales se regeneran **solo después de revisar el informe** y comprobar que cada diferencia es una mejora
explicada por una regla.

## 9. Cómo añadir o cambiar una regla

1. Buscar la regla en las fuentes del § 1 y citarla (o marcarla **Propia**).
2. Darle un identificador `N-TEMA-n` libre y escribir su ficha en el § 4 (con prueba y estado).
3. Escribir antes la prueba (nivel 1) y, si es visible, un caso en `regresion_visual/casos.json`.
4. Implementarla en la capa más barata; si toca el MusicXML, registrarla con `transformacion({...})` declarando su tipo y
   lo que modifica; si toca el SVG, en `notacion_svg.js` con marca `data-n-…`.
5. Registrarla en el catálogo (`regla(...)`): `prueba_notacion.js` falla si catálogo y especificación no coinciden.
6. Pasar los tres niveles de pruebas; revisar el informe visual; anotar la regla en `[Unreleased]` del CHANGELOG.
