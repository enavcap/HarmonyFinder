# Auditoría del motor de notación (v0.8.7) y reorganización

Estado inicial auditado: rama `ccr-dbc73e84-vgiszw` en el commit `c9547aa` («Merge branch 'auditoria-barras': versión
0.8.7»), versión `0.8.7`. Fecha: 2026-11-06. La especificación resultante está en
[`ESPECIFICACION_GRABADO_MUSICAL.md`](ESPECIFICACION_GRABADO_MUSICAL.md).

## 1. Arquitectura que había

```
index.html · xmlDe(o)          (una vez por obra, cacheado)
  ├─ decodificar bytes (.mxl / UTF-8 / UTF-16)
  ├─ regex: quitar <harmony>
  ├─ regex: quitar «dinámicas» vacías de Humdrum (<other-dynamics> con solo signos)
  ├─ quitarExpresion(x)          regex: <direction>, <dynamics>, <articulations>, <notations> vacías
  ├─ regex: ocultar <part-name> si hay un solo instrumento
  ├─ si reconstruida: ordenarVoces(x, inst)                 parse → DOM → serialize
  │     ├─ asignarClaves(doc)                                (try/catch: si falla, sigue con el DOM a medias)
  │     ├─ por compás: fusionarVocesIguales; renumerar voces; silencios (ocultar / subir); PLICAS por altura media
  │     └─ barrasAutomaticas(doc)                            (try/catch: ídem)
  │   + Notacion.alteracionesRedundantes(x)                  parse → DOM → serialize
  ├─ si no: corregirClaves(x) (apagado por defecto); si convertida: Notacion.alteracionesRedundantes(x)
  ├─ Notacion.plicasPorVoz(x)    PLICAS (N-PLICA-2) + ligaduras (N-LIG-3)   parse → DOM → serialize
  └─ alinearAnacrusa(x)          regex

index.html · mostrar(h)        (cada fragmento)
  ├─ conCasillas(xml)  (regex; depende del análisis)  ·  Notacion.compasInicio(xml, p0)  (N-INI-1)
  ├─ Verovio (Notacion.opciones)
  └─ SVG: quitar mNum internos · paréntesis de casillas · renumerar casillas · despejarSilencios (index.html)
          · Notacion.despejarLigaduras (N-LIG-2) · despejarNumeros (index.html, dos veces) · anotar · resaltarAcorde
```

`web/notacion.js` tenía el catálogo, `OPCIONES`, `CONFIG`, `compasInicio`, `alteracionesRedundantes`, `plicasPorVoz` y
`despejarLigaduras`; el resto de la lógica de notación (≈ 350 líneas: claves, voces, silencios, barras, expresión, anacrusa,
silencios y números en el SVG) vivía en `web/index.html`, y el catálogo la nombraba como «existente en otro punto».

## 2. Problemas detectados

| # | Problema | Consecuencia |
|---|---|---|
| P1 | **Dos fuentes de verdad para la dirección de plicas**: `ordenarVoces` (solo reconstrucciones, por altura media, aunque las voces no sonaran a la vez, intermedias por cercanía) y `Notacion.plicasPorVoz` (todas las fuentes, solo si suenan a la vez, intermedias sin tocar) | En las reconstrucciones, plicas forzadas hacia arriba o abajo en compases donde las voces se alternan sin coincidir (MuseScore y Verovio decidirían por la posición de las notas); criterio para voces intermedias sin respaldo documental |
| P2 | Limpieza de «dinámicas» vacías de Humdrum **duplicada**: `quitarExpresion` ya quita todas las dinámicas | Código muerto |
| P3 | Lógica de notación repartida entre `index.html` y `notacion.js` | Reglas sin registro común, difíciles de probar aisladas |
| P4 | **Sin verificación de integridad musical**; los `try/catch` de `ordenarVoces` seguían con el DOM a medio modificar | Un error en una transformación podía perder o mover notas sin aviso |
| P5 | Ediciones del MusicXML con **expresiones regulares** (`<harmony>`, `<direction>`, `<part-name>`, anacrusa) | Frágiles: p. ej. `<part-name/>` vacío no se reconocía; `<part-name\b` también casaría con `<part-name-display>` |
| P6 | Hasta 4 ciclos lectura/escritura del XML por obra | Coste y riesgo de divergencias |
| P7 | Barras automáticas: en 3/8 las corcheas quedaban **sueltas** (pulso = corchea → grupos de 1); 6/16, 9/16, 12/16 no se trataban como compuestos; 4/4 y 3/4 sin las excepciones por compás que documentan LilyPond y MuseScore | Corchetes donde debía haber barra; agrupación distinta de los grabadores de referencia |
| P8 | Silencios que pisan una nota de otra voz: **siempre se ocultaban** | MuseScore y LilyPond los desplazan; se perdía información rítmica visible |
| P9 | `prueba_notacion.js` con una condición de carrera (esperaba el SVG del caso anterior) | Fallo intermitente |
| P10 | Documentación basada en *Behind Bars* sin páginas verificables; manual de MuseScore sin citar | Reglas no contrastables |
| P11 | Ni pruebas de integridad ni regresión visual; la auditoría medía métricas, no comparaba imágenes | Regresiones visuales posibles sin detectar |

Hallazgo posterior, gracias a la nueva comprobación de integridad `I-5` (lectura de alturas):

| P12 | `N-ALT-2` quitaba alteraciones **necesarias** en dos casos: (a) una nota ligada desde el compás anterior contaba como alteración escrita para el resto del compás; (b) una nota alterada **sin** alteración impresa en la fuente actualizaba el estado con su altura real, y se quitaba la alteración de la nota siguiente | Notas que se leían mal en ediciones convertidas de Beethoven (p. ej. Op. 53/iii, c. 239: re♭ sin bemol tras una ligadura; Op. 31 n.º 2/iii, c. 170) |

## 3. Riesgos de corrupción musical (y cómo quedan)

| Operación | Riesgo | Ahora |
|---|---|---|
| `fusionarVocesIguales` (estructural) | perder o duplicar notas al mover acordes entre voces; quitar silencios | declarada `estructural`; se verifica que notas, alturas, duraciones, posiciones y ligaduras no cambian |
| `alteracionesRedundantes` (N-ALT-2) | quitar una alteración necesaria | `I-5` (lectura de alturas); se corrigieron P12 (a) y (b) |
| `asignarClaves` / `corregirClaves` | ninguno sobre las alturas (solo claves), pero un fallo a medias dejaba claves incoherentes | un fallo deshace el paso (`I-4`) |
| `quitarExpresion` | quitar algo más que la expresión | declara dinámicas, textos, tempo y articulaciones; el resto (octavas, calderones, ligaduras) se verifica |
| `alinearAnacrusa` | renumerar mal | declara solo la numeración de compases |
| `despejarSilencios` (SVG) | ocultar silencios | ahora los aparta primero (`N-SIL-2`) y marca lo que toca |

## 4. Reglas que no estaban cubiertas

Voces intermedias con criterio documentado (`N-PLICA-3`), excepciones de agrupación por compás (`N-BARRA-3`), desplazamiento
de silencios (`N-SIL-2`), lectura de alturas tras quitar alteraciones (`I-5`), integridad de todas las transformaciones
(`I-1`…`I-4`, `I-6`). Siguen pendientes y documentadas: `N-ALT-1`, `N-VOC-1`, `N-VOC-2`, `N-OCT-1`, `N-CRUCE-1`,
`N-SIL-3`, `N-BARRA-2`, `N-EXP-1`.

## 5. Reorganización realizada

| Antes | Ahora |
|---|---|
| `index.html` · `xmlDe` con 9 pasos en línea | `textoDe` (adaptación de fuente) + `Notacion.preparar(x, {fuente, inst, anacrusa})` |
| `ordenarVoces` (claves + fusión + renumeración + silencios + plicas + barras) | cinco transformaciones registradas: `claves-por-tesitura`, `fusionar-voces-iguales`, `voces-por-altura`, `silencios-reconstruccion`, `barras-automaticas`; **las plicas salen de aquí** |
| `ordenarVoces` (plicas) + `Notacion.plicasPorVoz` | **una sola** transformación, `plicas-por-voz` (`N-PLICA-2/3`) |
| limpieza de `<other-dynamics>` + `quitarExpresion` | `quitar-expresion` (DOM) |
| regex `<harmony>`, `<part-name>`, anacrusa | `quitar-armonias`, `ocultar-nombre-unico`, `alinear-anacrusa` (DOM) |
| `asignarClaves`, `clavesDeInstrumento`, `corregirClaves`, `barrasAutomaticas`, `fusionarVocesIguales`, `quitarExpresion`, `alinearAnacrusa` en `index.html` | en `web/notacion.js` |
| `despejarSilencios`, `despejarNumeros`, limpieza de `mNum` y casillas en `index.html`; `despejarLigaduras` en `notacion.js` | `web/notacion_svg.js` (`Notacion.svg.aplicar`, `Notacion.limpiarNumeros`) |
| — | `web/musica.js`: lectura normalizada, huella por propiedad, `ErrorIntegridad` |

Compatibilidad: `__prueba.ordenarVoces` y `__prueba.despejarSilencios` siguen existiendo (las usan las herramientas) y
`Notacion.plicasPorVoz`, `Notacion.alteracionesRedundantes`, `Notacion.compasInicio` y `Notacion.despejarLigaduras`
conservan su firma (texto → texto). El formato de los datos (`web/data`, `web/scores`) no cambia.

## 6. Verificación de la refactorización

Huella SHA-1 del MusicXML preparado por `xmlDe` para las **2 060 partituras** del corpus, versión inicial frente a la nueva
(con `N-BARRA-3` apagada para aislar la refactorización):

| Fuente | Idénticas | Solo cambian plicas | Solo plicas y `<part-name/>` vacío | Otras diferencias |
|---|---|---|---|---|
| Ediciones (956) | 951 | 5 (voces intermedias o voces que se alternan, `N-PLICA-2/3`) | — | 0 |
| Convertidas (105) | 103 | 2 | — | 0 |
| Reconstrucciones (999) | 264 | 21 | 712 (la regex antigua no ocultaba `<part-name/>`; sin efecto visible) | 2 (orientación de una ligadura con 3 voces, `N-LIG-3`; una alteración restituida, P12) |

Con `N-BARRA-3` encendida cambian además las barras de 47 reconstrucciones (comprobado en tres de ellas que no cambia nada
más que `<beam>`).

## 7. Resultados finales

**Integridad (I-6), todo el corpus en modo estricto:** 2 060 de 2 060 partituras íntegras (956 ediciones, 999
reconstrucciones, 105 convertidas; 1 816 625 notas comprobadas). En 120 reconstrucciones `N-VOC-3` une voces de ritmo
idéntico en acordes sin perder, duplicar ni mover ninguna nota.

**Métricas (`auditoria_gould.js`, 120 fragmentos, semilla 777), v0.8.7 → nueva:** todas iguales en las ediciones
(66 fragmentos, 5 522 notas). En las reconstrucciones (53 fragmentos), iguales salvo `lineasAdic4` 9 → 4 en un fragmento de
Couperin (cambio de plicas de una voz intermedia). Un fragmento de C. P. E. Bach dibujaba 3 notas menos con `N-BARRA-3`:
la barra se escribía también en las notas secundarias de un acorde y Verovio las dejaba de dibujar; corregido (la barra va
solo en la primera nota del acorde) y fijado con una prueba.

**Fragmentos con 3+ voces simultáneas (126, uno de cada tres de los 378 del corpus):** ediciones sin cambios. Reconstrucciones:
plicas que cruzan una cabeza de otra voz 7 → 2, ligaduras de unión que chocan 18 → 14, cabezas encimadas 0 → 1, notas con 4+
líneas adicionales 61 → 59. `plicaVoz` (pentagramas cuya voz aguda no lleva plica arriba o la grave abajo) 7 → 14: la métrica
cuenta todos los pentagramas con 2+ voces, también aquellos donde las voces se alternan sin sonar a la vez, en los que ahora
la plica sigue la posición de las notas (comportamiento de MuseScore y Verovio).

**Regresión visual (23 fragmentos):** 21 idénticos a la v0.8.7 (todas las ediciones, convertidas y la mayoría de las
reconstrucciones). Distintos: Allemande de la Suite inglesa n.º 1 (plicas de voces intermedias, silencios apartados en vez de
ocultos) y Couperin, *L'Art de toucher*, 8.ª (ídem). Revisados a ojo: legibles, con la limitación citada en `N-PLICA-3`.
En Medtner y Op. 31 n.º 1/iii hay silencios apartados (< 0,05 % de píxeles).
