# Changelog

Todos los cambios relevantes de Harmony Finder se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto se adhiere a [Semantic Versioning 2.0.0](https://semver.org/lang/es/). Mientras el proyecto esté en fase experimental las versiones son `0.x.y`; la primera versión estable será la `1.0.0`.

La versión vigente está en el archivo [`VERSION`](VERSION), que es la única fuente de referencia.

## [Unreleased]

### Fixed
- Partituras reconstruidas desde el DCML con varias voces por pentagrama, según cómo las escribe una edición profesional (cotejado compás a compás con una edición impresa de la *Allemande* de la Suite inglesa n.º 1 de Bach):
  - Regla `N-CRUCE-1`: una voz que su mano no puede tocar (más de una décima con otra voz a la vez) pasa al pentagrama de la otra mano. En la *Allemande*, c. 1, el arpegio la3-do#4-mi4 pasa a la mano izquierda, y en el c. 5 el sol#2 ya no queda en clave de sol con seis líneas adicionales. Se apaga con `Notacion.config.vocesPorRegistro = false`.
  - Regla `N-VOC-1`: como mucho dos capas por pentagrama cuando la tercera es un arpegio sostenido (*style brisé*), que se escribe como acordes con ligaduras de unión (c. 2: de 4 voces encimadas a 2). Una línea melódica real se deja en su capa, como en la edición. En 60 fragmentos con 3+ voces, los pentagramas con 3+ capas bajan de 45 a 13. Se apaga con `Notacion.config.dosCapas = false`.
  - Regla `N-VOC-2`: una nota atacada a la vez en las dos manos se escribe una sola vez. Se apaga con `Notacion.config.unisonosUnaVez = false`.
  - La mano izquierda del teclado ya no pasa a clave de sol por un pasaje de tenor (la *Allemande* empezaba en sol), y la clave se elige después de repartir las voces.
  - En los acordes que se agrupan con barra automática, la barra va solo en la primera nota; antes Verovio avisaba y la descartaba.

### Changed
- `herramientas/auditoria_gould.js`: nueva métrica `capas3` (pentagramas-compás con 3 o más capas con notas). `herramientas/notacion_casos.json`: cuatro casos nuevos de voces múltiples; `herramientas/prueba_notacion.js`: pruebas de las tres reglas.

## [0.8.7] - 2026-11-06

### Fixed
- Regla `N-LIG-2`: las ligaduras de unión que atravesaban plicas, corchetes, barras o cabezas de nota (sobre todo entre notas cortas con corchete de la voz grave, p. ej. la mano izquierda del Op. 14 n.º 2, i, cc. 1-3) se acortan por los extremos y/o se hacen más profundas hasta librarlos; si ninguna variante los libra, no se tocan. Choques de ligaduras de unión en la auditoría: de 2 a 0 en originales, de 13 a 2 en reconstrucciones y de 17 a 6 en las 174 muestras de las sonatas de Beethoven; ninguna otra métrica cambia. Se apaga con `Notacion.config.ligadurasDespejadas = false`.

### Changed
- `herramientas/auditoria_gould.js`: nueva métrica `barraSubida` (barras que suben más de `SUBIDA_MAX`=1,1 espacios de pentagrama). La métrica por ángulo (`barraEmpinada`) contaba como defecto la inclinación normal de un espacio entre dos corcheas (16,4°): con la subida en espacios queda un 5 % de las barras (antes 16-33 %), sin defecto visible. `N-BARRA-2` queda replanteada en `docs/NOTACION.md`, que además recoge la incidencia real de las voces múltiples en las reconstrucciones (0,17 % de los pentagramas-compás con 3+ voces). No cambia el grabado de las partituras.
- `herramientas/auditoria_gould.js`: las ligaduras (de unión y de expresión) se muestrean solo por el interior de cada curva; antes se medía entero el extremo de destino, donde la ligadura toca su nota. Se documenta además la comparación con las reglas de MuseScore (GPL-3.0; solo como criterios, sin copiar código) y que aumentar el espaciado horizontal no reduce de forma apreciable los choques.

## [0.8.6] - 2026-11-06

### Changed
- Notación de las partituras con varias voces, para **todas** las fuentes (Sapp, OpenScore y reconstrucciones del DCML): regla `N-PLICA-2`, con dos o más voces simultáneas en un pentagrama la más aguda lleva la plica hacia arriba y la más grave hacia abajo en todo el compás; antes la dirección dependía del orden en que el archivo escribía las voces y en muchas ediciones convertidas las plicas de una voz atravesaban las cabezas de la otra (p. ej. la mano izquierda del Op. 2 n.º 2, ii). En las 58 sonatas de Beethoven pasa de 463 de 1 459 pentagramas con las plicas al revés a 29. Se apaga con `Notacion.config.plicasPorVoz = false`.
- Regla `N-LIG-3`: las ligaduras de unión de la voz aguda se dibujan por arriba y las de la grave por abajo (en un acorde, solo la nota exterior), para que no atraviesen las notas de la otra voz (p. ej. Op. 31 n.º 1, iii, cc. 44-46). Los choques de ligaduras de unión en las sonatas bajan de 159 a 87 de 1 374. Se apaga con `Notacion.config.ligadurasPorVoz = false`.

### Added
- `herramientas/auditoria_gould.js`: métricas `plicaVoz` (plicas contra la convención por voz), `unionChoque` y `expresionChoque` (ligaduras de unión y de expresión por separado) y `barraSilencio`; `POR_MOV=k` mide k fragmentos repartidos por cada movimiento (antes solo uno al azar), el filtro admite varios términos (`beethoven && sonata`) y `CASOS=ruta.json` admite otra lista de fragmentos. `plicaCruza` ya no cuenta los unísonos con plicas opuestas.
- `herramientas/notacion_casos.json`: cuatro casos de regresión de Beethoven (Op. 2 n.º 1 i y ii, Op. 2 n.º 2 ii, Op. 31 n.º 1 iii).

## [0.8.5] - 2026-11-06

### Fixed
- `N-ALT-2` también en las ediciones de Beethoven convertidas desde Humdrum (Sapp): la conversión escribía la alteración en cada nota alterada (p. ej. Op. 53 i, cc. 5-6, con un bemol en cada acorde de si♭) y ahora sale una vez por compás y pentagrama. Se quitan 12 846 alteraciones repetidas en esos 58 movimientos; los becuadros y las alteraciones necesarias se conservan, y las demás ediciones (OpenScore, etc.) no cambian.

## [0.8.4] - 2026-11-06

### Fixed
- Claves de las partituras con edición profesional (Sapp, OpenScore…): se respetan tal cual, también los cambios de clave a mitad de compás. Antes `corregirClaves` leía una sola clave por compás, daba por «lejanos» los bajos escritos en clave de fa y descartaba las claves del editor para recolocarlas por compás; p. ej. en la *Waldstein* (Op. 53, III) la mano izquierda perdía el cambio fa→sol dentro de los cc. 1, 4, 5… y el do grave salía en clave de sol con 8 líneas adicionales (`CONFIG.clavesDeLaEdicion`, regla `N-CLAVE-1`). Se comprobó sobre la partitura de Op. 53/iii: 91 de 91 claves conservadas, en su sitio.

## [0.8.3] - 2026-11-06

### Changed
- Regla `N-ALT-2` (*Behind Bars*): en las partituras reconstruidas desde el DCML, una alteración se escribe una sola vez por compás y pentagrama (rige para las notas de la misma altura del resto del compás, sea cual sea la voz) y solo se repite si cambia; antes llevaban la alteración cada nota alterada (p. ej. un compás de acordes de si♭ con un bemol en cada uno). Se quitan 44 993 de 142 589 alteraciones en las 999 reconstrucciones; las ediciones (Sapp, OpenScore…) no cambian. No toca las de precaución, las editoriales ni las de notas ligadas. Se apaga con `Notacion.config.alteracionesUnaVez = false`.

## [0.8.2] - 2026-11-06

### Added
- Reglas de notación del proyecto (`web/notacion.js`, `docs/NOTACION.md`), basadas por temas en *Behind Bars* (Elaine Gould): catálogo de reglas con identificador estable (`N-…`), separado en tres capas (opciones de Verovio, correcciones del MusicXML y retoques del SVG). Las opciones de grabado de Verovio, antes en `index.html`, pasan a `Notacion.opciones`.
- `herramientas/auditoria_gould.js`: auditoría de notación sobre una muestra reproducible o sobre los casos fijos de `herramientas/notacion_casos.json` (barras empinadas, líneas adicionales, ligaduras y alteraciones que chocan, plicas que cruzan cabezas ajenas, compás y clave al inicio). `herramientas/prueba_notacion.js` comprueba las reglas y que el catálogo coincide con la documentación.

### Changed
- Otros 14 movimientos de las sonatas de Beethoven (Op. 2 n.º 2 i, iii; 2 n.º 3 ii; 10 n.º 1 iii; 13 i; 14 n.º 1 i; 31 n.º 2 i, ii; 31 n.º 3 i; 53 ii; 78 i; 81a ii; 109 i y 111 i; 31 análisis) pasan de la reconstrucción DCML a la edición codificada por Craig Sapp (Durand 1915, P. Dukas). Se comprobó con la propia web que ningún acorde del análisis queda fuera de compás, y el Op. 53 ii y el Op. 109 i se cotejaron con el escaneo de la edición de referencia (claves, armadura, agrupación de barras, silencios y número de compases). Ya son 58 movimientos (131 análisis) los que usan esa edición. En el Op. 109 i la edición impresa tiene tres compases del patrón de bajo de los cc. 44-46 donde el análisis del DCML cuenta cinco: los 4 acordes de sus compases 42 y 43 (8 en los dos análisis, el 1,7 %) no se dibujan, porque la edición no tiene esos compases.
- Beethoven (edición de Sapp): se dibujan las líneas de octava («8va», con su trazo discontinuo y las notas escritas una octava más abajo, como en la edición impresa) que music21 descartaba al convertir el Humdrum (`*8va` … `*X8va`, también 15ma, 8ba y 15mb). 14 movimientos las traen (Op. 109 i, 111 i, 57 i, 81a i-iii, 110 i…). `krn_beethoven_a_mxl.py --octavas` las añade a un paquete ya convertido.
- `krn_beethoven_a_mxl.py`: ya no se pierde una mano cuando el Humdrum divide o fusiona columnas (`*^`, `*v`) de forma que music21 no entiende (p. ej. Op. 2 n.º 2 i desde el c. 54): se reescriben las operaciones una por línea y con un árbol de columnas coherente (`solo_kern`). La alineación de compases con la numeración del DCML usa ahora también el ritmo (alturas por pulso), no solo las clases de altura, y distingue pasajes repetitivos.
- Regla `N-INI-1`: un fragmento que empieza a mitad de obra muestra ahora la indicación de compás vigente (antes salía sin ella en 99 de 119 fragmentos de la muestra).

## [0.8.1] - 2026-11-05

### Changed
- Partituras reconstruidas (DCML): las figuras de corchea o menos sin barra (tresillos de fusas, grupos sueltos; p. ej. la cadenza del Op. 109 de Beethoven) se agrupan automáticamente por pulso, en lugar de quedar con corchetes.
- Otros 14 movimientos de las sonatas de Beethoven (Op. 2 n.º 3, Op. 10 n.º 2 y 3, Op. 13 no, Op. 14 n.º 1, Op. 31 n.º 1 y 3, Op. 53, Op. 57…) pasan de la reconstrucción DCML a la edición codificada por Craig Sapp, conservando la numeración de compases del análisis (alineada por contenido).
- El conversor `krn_beethoven_a_mxl.py` admite `--etiquetas-de` para copiar la numeración DCML.

## [0.8.0] - 2026-11-05

### Changed
- 30 movimientos de las sonatas para piano de Beethoven (68 análisis) se dibujan ahora con la codificación Humdrum de Craig Sapp, hecha de una edición impresa (Durand 1915, P. Dukas), en lugar de la reconstrucción desde las tablas del DCML. Traen las voces, los silencios, las barras y las ligaduras de la edición (p. ej. Op. 2 n.º 2, 2.º mov.: fusas staccato con sus silencios, silencios agrupados por pulsos). Solo se adoptan los movimientos cuyo contenido coincide con la reconstrucción compás a compás (≥ 97 %, misma longitud ±1) y en los que los cifrados siguen cayendo sobre notas (≥ 97 %); en los otros 28 (repeticiones sin desplegar, casillas) se mantiene la reconstrucción. Conversión con `herramientas/krn_beethoven_a_mxl.py`. La licencia del repositorio de origen no está declarada: pendiente de confirmar antes de publicar.
- Grabado de la partitura: más distancia de seguridad entre las ligaduras y las plicas, barras y notas de otras voces (`slurMargin`, `slurCurveFactor`, `slurSymmetry`), más aire a los lados de alteraciones y silencios, y ligaduras de unión con una longitud mínima. Mejora los roces típicos del piano a varias voces (p. ej. Mozart, K. 333/ii, cc. 59-61). No elimina los choques entre voces con cabezas de nota encimadas ni los cruces entre pentagramas, que siguen pendientes.

## [0.7.2] - 2026-11-05

### Changed
- Las partituras de los ejemplos conservan ahora las fermatas (calderones), que antes se quitaban junto con la expresión: marcan el final de frase y ayudan a leer las cadencias. Siguen sin mostrarse dinámicas, reguladores, pedales, textos de expresión, metrónomos ni articulaciones.

## [0.7.1] - 2026-11-05

### Fixed
- Al buscar un acorde suelto no aparecían los botones ◀ ▶ para recorrer la partitura (solo salían al abrir una obra o un fragmento). Ahora salen siempre, y desde un acorde desplazan la ventana de compases sin perder el resalte del acorde; se desactivan al llegar al principio o al final de la obra.

## [0.7.0] - 2026-11-05

### Changed
- «Para empezar» elige ahora ejemplos canónicos y claros del procedimiento buscado, en lugar de los más cortos de los compositores con más resultados. Cada ejemplo se puntúa por la claridad del procedimiento (su cifrado es el habitual en esa búsqueda, la etiqueta no lleva notas añadidas ni omitidas, la longitud es la típica, cae en tiempo fuerte, es cadencial donde el concepto lo distingue); por su fiabilidad (nada al unísono, partitura no reconstruida; plus pequeño para los manuales); y, de forma secundaria, por la tonalidad (desempatan las de menos alteraciones, pero nunca ganan a la claridad).
- En las búsquedas de cadencias pesa sobre todo la claridad de la cadencia: la marca del analista (PAC, IAC, HC, PC, DC…) cuando el corpus las anota, la llegada en tiempo fuerte, una predominante o un 6/4 previo, y que el modo del cifrado coincida con el de la tonalidad (una «I» en tonalidad menor es una tercera de Picardía, no la cadencia típica). En los acordes de predominante (sexta aumentada, napolitana) se premia que resuelvan en la dominante, y en el pedal de dominante que el pasaje sea sobre todo dominante.
- Los cuatro ejemplos son de compositores distintos, con variedad de épocas y de tonalidades, e incluyen uno de J. S. Bach si lo hay y no es claramente peor que los demás.

### Added
- `web/canonicos.js` (la puntuación y la elección) y `herramientas/prueba_canonicos.js` (26 pruebas sobre los datos reales).

## [0.6.2] - 2026-11-05

### Fixed
- Partitura: los silencios que pisan una nota, una plica, una barra, un corchete o una alteración de otra voz del mismo pentagrama se ocultan (esa otra voz suena en ese instante, y el silencio no aporta nada al ejemplo). Antes solo se apartaban de las cabezas de nota, y la plica de un acorde de la segunda voz atravesaba el silencio de la primera (p. ej. Beethoven, Op. 31 n.º 2, 1.er mov., c. 191). Si el silencio pisa el de otra voz, se sigue apartando. En una muestra de 250 fragmentos, 7 tenían silencios sobre plicas; ahora no queda ningún choque y ya no hay silencios desplazados lejos de su sitio.
- Cifrados mal alineados con los acordes: cuando el análisis cuenta las partes en blancas (partes 1, 1.5, 2, 2.5 en un compás de 4/4) los cifrados se dibujaban apelmazados en la mitad izquierda del compás. Ahora, si ningún acorde pasa de la mitad del compás y a escala doble caen claramente más acordes sobre ataques de nota, las partes se cuentan en blancas. Afecta a cinco obras: los análisis de When in Rome de la Op. 31 n.º 2 de Beethoven (1.er mov.) y de la K. 570 de Mozart (3.er mov.), y el madrigal «O dolc' anima mia» de Monteverdi.

### Added
- `herramientas/prueba_alineacion.js`: comprueba la escala de las partes, que cada cifrado caiga sobre una nota y que ningún silencio pise una plica.
- `herramientas/auditoria_notacion.js` mide también los silencios que pisan plicas, barras, corchetes o alteraciones de otra voz (`silPlica`).

## [0.6.1] - 2026-11-05

### Changed
- Los ejemplos se muestran solo con notas, ritmos y ligaduras: la web quita de la partitura las dinámicas, los reguladores, los pedales, los textos de expresión («smorz.»…), los metrónomos, las articulaciones (acentos, picados…) y las fermatas, que chocaban con los cifrados y con las demás voces. Se conservan las ligaduras y los cambios de octava (8va). Los datos no cambian: el filtro se aplica al cargar cada partitura.

## [0.6.0] - 2026-11-04

### Added
- Sexta napolitana y II rebajado en estado fundamental, como procedimientos distintos. La sexta napolitana (♭II en primera inversión, N6) y el ♭II fundamental son funcionalmente lo mismo (subdominante alterada que prepara la dominante), pero la sexta napolitana no nació como inversión del ♭II, que no se usó en estado fundamental hasta el siglo XIX. Conceptos nuevos: «sexta napolitana» (664 coincidencias), «II rebajado en estado fundamental» (467), «sexta napolitana → dominante» (274) y «II rebajado fundamental → dominante» (106). Solo cuentan tríadas; las cuatríadas y las segundas inversiones siguen solo en el concepto general.
- Prueba `multicorpus/tests/test_napolitana.py`.
- Marca «cadencial» / «no cadencial» en los ejemplos de «napolitana (♭II)», «sexta napolitana» y «II rebajado en estado fundamental». Es cadencial el ♭II que prepara la dominante de su tonalidad, directamente o a través de un solo acorde (I64, V/V…); una napolitana prolongada se mira desde su último acorde. Los ejemplos cadenciales salen antes en la lista y en «Para empezar», porque son el uso típico del acorde. Del total de 1.358 ejemplos, 488 son cadenciales y 870 no lo son. Los datos llevan la marca en un 8.º campo de cada coincidencia (`c` o `n`); la web ignora los campos que no conoce.

### Changed
- «napolitana» pasa a llamarse «napolitana (♭II)» y sigue reuniendo el ♭II en cualquier posición (1.358 coincidencias, sin cambios). «sexta napolitana» y «N6» ya no llevan a ella, sino al concepto nuevo.
- `herramientas/recalcular_concepto.py` también actualiza los conceptos compuestos (`requiere`) de `web/data/meta.json`. Los datos de estos conceptos se han recalculado con él, sin regenerar el corpus.

### Removed
- «napolitana → dominante» (`napolitana_a_dominante`): decía «♭II6 → (I64) → V», pero reunía también el ♭II fundamental. La sustituyen los dos conceptos nuevos.

## [0.5.3] - 2026-11-04

### Fixed
- *El clave bien temperado* (Bach, libro I): los 24 ejemplos aparecían como «The Well-Tempered Clavier I · 1» sin decir que son solo los preludios (When in Rome no analiza las fugas). Ahora se titulan «El clave bien temperado, libro I · 1. Preludio» (en inglés, «The Well-Tempered Clavier, Book I · 1. Prelude») y llevan el catálogo BWV 846–869. La regla está en el adaptador de When in Rome; los datos ya generados (`web/data/obras.json`) se han actualizado sin regenerar el corpus.

## [0.5.2] - 2026-11-04

### Added
- `herramientas/auditoria_notacion.js`: dibuja una muestra de fragmentos y mide silencios que pisan notas de otras voces, silencios que se pisan entre sí y cabezas de nota solapadas, además de los efectos secundarios de moverlos (cifrados, números de compás, salirse del dibujo). Termina con error si queda algún choque.

### Fixed
- Partitura: los silencios que pisaban una nota de otra voz en el mismo pentagrama se apartan ahora, en múltiplos de media línea y alejándose de lo que pisan, hasta quedar libres. Eran sobre todo las partituras reconstruidas desde el DCML (suites de Bach, Couperin, Scarlatti, Rachmaninoff…), donde el silencio de la voz aguda se fijaba siempre en la misma altura sin mirar a las demás voces, pero también ocurría en originales (p. ej. Schubert, *Winterreise* n.º 9). En tres muestras de unos 1.100 fragmentos, 60 fragmentos (127 silencios) tenían el choque; ahora no queda ninguno, y los silencios movidos no invaden cifrados ni números de compás.

## [0.5.1] - 2026-11-04

### Changed
- Ficha del ejemplo: los datos técnicos (estándar, versión, archivo, partitura, referencia, procedencia) van plegados bajo «Datos técnicos». El campo «Análisis» muestra solo los analistas (sin la licencia ni la nota de conversión pegadas) y la licencia es la del análisis original: CC BY-NC-SA 4.0 en los análisis de When in Rome convertidos del DCML. La fuente de la forma se explica con palabras («según Taking Form, anotación formal de las sonatas»). El catálogo no se repite si ya está en el título («Op. 127 (Op. 127)»).
- Compositores que comparten apellido con sus iniciales («J. S. Bach», «C. P. E. Bach», «W. F. Bach») en el resumen, las tarjetas y las sugerencias de obra.
- Selector de análisis: el nombre del analista completo y limpio, y la marca WiR/DCML visible también en el botón pulsado.
- Partituras originales con cruces de manos escritos sin cambiar de clave: en los pentagramas donde varias notas quedan a 4 o más líneas adicionales, se cambia la clave solo en esos pasajes y se respetan las del editor en el resto (p. ej. Mozart, K. 457/iii, cc. 289-309).

### Fixed
- Textos: la parte del compás con fracciones («parte 1⅔» en vez de «1.6666666666666667»), «c. 288» en vez de «cc. 288–288», el singular en el resumen («1 ejemplo», «1 movimiento») y el criterio de las progresiones sin «hasta 0 acordes intermedios».
- Buzón: faltaba un espacio entre la obra y el compositor en los datos del ejemplo abierto.
- Tablet: el botón de idioma ya no queda solo en una línea; móvil: el cifrado de la tabla de resultados se parte en líneas en vez de salirse de la tabla.
- Consola: se quita la opción `svgFontFaceInclude`, que Verovio 6.3 ya no admite y solo producía un aviso.

## [0.5.0] - 2026-11-03

### Changed
- Cifrado interválico completo, según la tradición española: la sensible con «+» (V7 → «7+», V43 → «+6», V42 → «+4», también la de la tonalidad tonicalizada en las dominantes secundarias), los intervalos disminuidos tachados (V65 → «6/5̸», vii°7 → «7̸») y las notas alteradas respecto a la armadura (napolitana → «♭6», sexta alemana → «♯6/♭5» en mayor). Las cifras se calculan a partir de las notas reales del acorde en su tonalidad, con las mismas reglas que music21. En inglés la sensible no lleva «+», sino la alteración que tenga respecto a la armadura (V7 en do menor → «7/♮»). En la partitura, en las tarjetas, en la tabla y en el contexto; la búsqueda de progresiones no cambia.

## [0.4.2] - 2026-11-03

### Fixed
- Casillas de repetición: en las partituras que no las escriben (las convertidas desde Humdrum, sobre todo las mazurcas de Chopin) se dibujan ahora los corchetes de 1.ª y 2.ª casilla en los compases que el análisis numera como casillas (23 análisis).
- Signos sueltos «(», «)», «[» y «]» bajo el pentagrama: eran restos de la conversión desde Humdrum guardados como dinámicas y ya no se dibujan (31 partituras, 28 de ellas mazurcas de Chopin). Las dinámicas de verdad se conservan.

## [0.4.1] - 2026-11-03

### Fixed
- Casillas de repetición: el análisis da a la 2.ª casilla el mismo número de compás que a la 1.ª, pero las partituras que no escriben las casillas la numeran como el compás siguiente, y desde ahí los cifrados salían un compás antes de su sitio y el acorde de la 2.ª casilla no se dibujaba (Chopin, Mazurka Op. 7 n.º 2, cc. 32-34: «La M: V7/IV – IV – ii°6» aparecía bajo el acorde de La mayor de la 2.ª casilla). Ahora la partitura toma la numeración del análisis tras la barra de repetición y muestra esos mismos números. Afecta a 23 análisis (sobre todo mazurcas de Chopin; también Beethoven, Op. 130/vi y Op. 59 n.º 2, Mozart, K. 533/iii, y lieder de Lang, Reichardt y C. Schumann).

## [0.4.0] - 2026-11-01

### Added
- La dirección de la página guarda la búsqueda, los filtros y el ejemplo abierto (`?c=…&compositor=…&ej=…`): recargar no pierde nada, el botón atrás del navegador (y del móvil) vuelve a la búsqueda anterior y un enlace lleva a otra persona al mismo ejemplo.
- Tercera de picardía: V → I mayor como acorde final en tonalidad menor (al final de la obra o con calderón). 330 ejemplos, sobre todo finales de corales de Bach.
- Búsqueda de un acorde suelto escrito en cifrado: `V7`, `ii7`, `IV7`, `V65/V`.
- Progresiones: opción «sin cifra = estado fundamental» (con ella, «I6/4 V7 I» ya no acaba en I64).
- Sinónimos: Ger+6, Gr+6, It+6, Fr+6 y +6 (también dentro de una progresión: `It+6 V`), «napolitano», «acorde napolitano», «N», °7, vii°7, ø7, viiø7.
- Aviso en vez de «sin coincidencias» para lo que el corpus no anota: MC, EEC/ESC y estructura de frase (periodo, oración), con la búsqueda que más se acerca.

### Changed
- Un pasaje analizado por dos analistas (When in Rome y DCML, o dos análisis del mismo corpus) es un solo ejemplo, con la marca «2 análisis»; la partitura deja cambiar de análisis y compararlos. Los recuentos (resumen, sugerencias, menús) cuentan pasajes distintos.
- Los números de los menús Compositor, Período y Forma son lo que daría elegir esa opción, en la misma unidad que el resumen (ejemplos al buscar un procedimiento, movimientos al listar obras).
- Cifrados más legibles en tarjetas, tabla y contexto: sin las notas añadidas u omitidas (`[no3][add4]`) ni la sintaxis interna del DCML (`|PAC`, `{`, `}`, prefijos de tonalidad local); el original queda en el texto emergente.
- Mazurcas de Chopin con opus y tonalidad («Mazurka in F♯ minor, Op. 6 No. 1») en lugar del número del catálogo Brown suelto (`multicorpus/titulos_chopin.json`, a partir de los metadatos del DCML).
- Partituras que no caben a un tamaño legible (pasajes densos, tablet) se muestran a tamaño legible con desplazamiento horizontal, también en pantallas anchas.
- Progresiones en menor: «bVI»/«bVII» escritos por el analista equivalen a VI/VII (mismo acorde): «VI V» los encuentra y «bVI V» queda para el préstamo en mayor.

### Fixed
- El filtro de obra (p. ej. «K. 310») se perdía al refrescar los menús y no filtraba.
- Cambiar de idioma cerraba el ejemplo abierto.
- Progresiones: la partitura no marcaba el pasaje encontrado y el contexto de la ficha resaltaba todos los acordes de los compases en vez de solo los de la progresión.
- Semicadencia: un pasaje al unísono justo después de V cortaba el análisis y la dominante que continuaba se tomaba como llegada (Beethoven, Op. 2 n.º 3/i, c. 90).
- Al limpiar la búsqueda quedaban en pantalla el resumen y los ejemplos destacados anteriores.
- El bemol de los rótulos de tonalidad en la partitura se veía como una «b» en cursiva.

## [0.3.4] - 2026-11-01

### Changed
- Pedal de dominante: se mira lo que suena, no solo cómo está cifrado. Un acorde con las notas de V(7) escrito como tonicización (`I/V`) es la propia dominante y un acorde con las notas de la tónica sobre la pedal (`IV64/V` = I64) es un 6/4 cadencial: ninguno cuenta como armonía ajena. Además, cuando la partitura es fiable (su nota más grave coincide con el bajo del cifrado en el 75 % de la obra), la dominante tiene que sonar de verdad en el bajo en dos tercios de los acordes del tramo (se admite un bajo figurado). De 427 a 377 ejemplos; desaparecen p. ej. Bach, Suite francesa n.º 5, Giga, c. 4 (la mano izquierda aún no ha entrado) y n.º 6, Menuett, c. 8 (bajo en movimiento y 6/4 cadencial); se conservan la Waldstein (Op. 53/iii, cc. 151-166), el WTC I/2 (cc. 22-26) y la Tempestad.

### Fixed
- Corelli, Op. 1 n.º 10/i: una errata del análisis de When in Rome (`6 Bb:` en lugar de `m6 Bb:`) hacía que se perdiera el c. 6 y que los cc. 6-8 se leyeran en sol menor. La cadencia del c. 8 es perfecta en si♭ mayor (antes, imperfecta en sol menor) y la modulación del c. 9 es diatónica (antes, cromática).

### Added
- Correcciones de erratas de las fuentes (`multicorpus/correcciones_fuentes.json`): se aplican al texto del análisis antes de interpretarlo, con su motivo, sin tocar el corpus original.

## [0.3.3] - 2026-11-01

### Changed
- Cadencia rota y cadencia plagal: ahora se exige el final de frase, no solo la llegada en parte fuerte. En las piezas que marcan sus finales con calderones (corales, recitativos) el acorde de llegada debe llevar calderón; en el resto, la melodía debe detenerse (el mismo criterio que la semicadencia). En la cadencia rota, una llegada cifrada sin tercera (apoyatura sobre el bajo del vi) tampoco cuenta. Cadencias rotas: de 879 a 421 ejemplos (en los corales de Bach, de 170 a 64); plagales: de 916 a 592. Desaparecen los V–vi de paso que se daban como cadencias (p. ej. BWV 153/1, c. 3; Mozart K. 330/ii, c. 2).

### Fixed
- Búsqueda: Enter ya no descarta parte de lo escrito. Los trozos que son exactamente un compositor, una tonalidad, una época o un modo se aplican como etiquetas y el resto se busca como procedimiento: «sexta napolitana mozart», «septima disminuida chopin», «forma sonata Mozart la menor» (→ K. 310), «ii6 V7 I mozart».
- Búsqueda: el nombre o un sinónimo escrito tal cual gana a una subclase que solo empieza igual («napolitana» → sexta napolitana, no napolitana → dominante; «septima disminuida» → acorde de séptima disminuida, no la secundaria). Una subclase baja en las sugerencias si no se escribe lo que la distingue.
- Búsqueda: un apellido compartido elige al compositor con más obras («bach» → J. S. Bach).
- Rangos de compases que cruzaban una repetición desplegada por el analista (el compás final quedaba antes que el inicial y la partitura mostraba otro pasaje): 49 ejemplos corregidos, p. ej. Bach, Suite inglesa n.º 4, Menuett I, c. 14. Se quitan además 142 ejemplos repetidos (la segunda vuelta de esas repeticiones).
- Móvil y tablet: al elegir un ejemplo la página baja hasta la partitura, que antes se dibujaba debajo de toda la lista.
- Partitura más ancha que su caja (móvil, portátil): se centra en el acorde resaltado en vez de dejarlo fuera de la vista. El aviso «desliza para ver más» se traduce al inglés.

## [0.3.2] - 2026-11-01

### Fixed
- Modulación enarmónica: ya no se marca como enarmónica una modulación cuyo pivote es un acorde diatónico común a las dos tonalidades aunque vaya precedido de una séptima disminuida o un V7 de la tonalidad de partida (p. ej. Mozart K. 280/i, c. 82: re m VII⁴₃ = fa M V⁴₃). Cuatro pasajes pasan de enarmónica a diatónica.

## [0.3.1] - 2026-11-01

### Added
- Progresiones: sugerencia «¿Querías decir…?» cuando la caja del cifrado deja la búsqueda con pocos resultados (p. ej. `ii – v – i` propone `ii – V – I` y `ii – V – i`, con su número de pasajes). La búsqueda escrita no cambia: mayúscula = acorde mayor, minúscula = menor.

## [0.3.0] - 2026-11-01

### Added
- Filtro por tipo de cuatríada (acorde de séptima) en el menú Armonía.
- Buzón de errores y sugerencias dentro de la propia web (pestaña «Buzón»), con las respuestas recogidas en una hoja de cálculo.
- Botón de modo diurno / nocturno en el pie de página; el tema elegido se recuerda.
- Sistema de versionado: archivos `VERSION` y `CHANGELOG.md`; la versión aparece en el pie de página, leída de `web/version.js` (generado desde `VERSION`).

### Changed
- Pedal de dominante: criterio nuevo (≥ 2 compases y armonías ajenas encima; un 6/4 cadencial no es pedal). Los ejemplos pasan de 4335 a 427.
- Menús del buscador reordenados: Armonía, Tonalidad, Forma, Secciones, Compositor, Período.
- Progresiones: comparación por propiedades del cifrado (`ii V I` encuentra `ii7 V43 I`).
- Al abrir un ejemplo se resalta solo el acorde buscado, no el compás entero; en las cadencias se resaltan todos sus acordes en la partitura y en la tira de cifrados.
- El pie de página muestra el número de versión en lugar del texto «versión alfa» (la chapa «alfa» del encabezado se mantiene).

### Fixed
- Plicas y barras por voz también con la web en inglés.

### Removed
- Línea de créditos de fuentes en el pie de página (las licencias pasan a la pestaña «El proyecto»).

## [0.2.0] - 2026-10-31

### Added
- Web en español e inglés con exactamente los mismos resultados en ambos idiomas.
- Búsqueda por forma global del movimiento (forma sonata, rondó, minueto con trío, fuga, coral…) y por secciones y zonas (exposición, desarrollo, transición, segundo grupo temático…), combinables con cualquier procedimiento. Fuentes de forma: Taking Form, BPSD (Beethoven) y Mozart Expositional Punctuation Corpus; mapa de la tabla de revisión.
- Cadencias detectadas como finales de frase, con la partitura.
- Detección de pasajes al unísono u octava, que no cuentan en las búsquedas.
- Etiquetas dinámicas: menús y sugerencias solo ofrecen opciones que dan resultados con lo ya elegido.
- Portada, pestaña «El proyecto» y pie con autor.
- Partituras del DCML con claves según las normas de notación (por instrumento y compás).

### Changed
- El proyecto pasa a llamarse Harmony Finder (antes HarmoFind); icono nuevo de lupa con corchea; enlaces al repositorio renombrado (`enavcap/HarmonyFinder`).
- 6/4 cadencial solo en cadencia: I64 → V(7) → I al final de frase.
- El filtro de secciones pasa a llamarse «Secciones».

### Fixed
- Cifrados: cada acorde en su pasada y su compás aunque la partitura numere distinto; compás vigente en cada pasaje; etiquetas que no caben se separan; unidad de parte en compases ternarios según encaje con la partitura.
- Números de compás: no chocan con las notas, esquivan las ligaduras y se recolocan cuando la partitura ya está maquetada.
- Modulación enarmónica: una séptima ya resuelta en la tonalidad de partida no se toma como pivote.

### Removed
- Categoría «cadencias anotadas».

## [0.1.0] - 2026-10-30

### Added
- Buscador armónico con catálogo multicorpus (When in Rome + DCML) y web con partitura cifrada (cifrado romano, interválico y funcional).
- Modulaciones con acorde pivote en dos líneas (tonalidad de partida y nueva).
- Partitura legible y desplazable en móvil; voces ordenadas en partituras reconstruidas.
- Partituras: UTF-16 (Monteverdi), anacrusa numerada 1, numeración desplegada; auditoría visual.
- Portada con nombre, autor y enlace a la versión en línea.
- Publicación en GitHub Pages: la raíz abre la aplicación (`web/`) y script `herramientas/publicar_pages.sh`.

[Unreleased]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.7...HEAD
[0.8.7]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.6...v0.8.7
[0.8.6]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.5...v0.8.6
[0.8.5]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/enavcap/HarmonyFinder/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/enavcap/HarmonyFinder/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/enavcap/HarmonyFinder/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/enavcap/HarmonyFinder/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/enavcap/HarmonyFinder/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/enavcap/HarmonyFinder/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/enavcap/harmonyfinder/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/enavcap/HarmonyFinder/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/enavcap/HarmonyFinder/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/enavcap/HarmonyFinder/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/enavcap/HarmonyFinder/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/enavcap/HarmonyFinder/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/enavcap/HarmonyFinder/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/enavcap/HarmonyFinder/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/enavcap/HarmonyFinder/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/enavcap/HarmonyFinder/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/enavcap/HarmonyFinder/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/enavcap/HarmonyFinder/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/enavcap/HarmonyFinder/compare/6e5e592...v0.3.1
[0.3.0]: https://github.com/enavcap/HarmonyFinder/releases/tag/v0.3.0
[0.2.0]: https://github.com/enavcap/HarmonyFinder/compare/5aee7e5...13f2a9b
[0.1.0]: https://github.com/enavcap/HarmonyFinder/commits/5aee7e5
