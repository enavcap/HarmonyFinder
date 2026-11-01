# Changelog

Todos los cambios relevantes de Harmony Finder se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto se adhiere a [Semantic Versioning 2.0.0](https://semver.org/lang/es/). Mientras el proyecto esté en fase experimental las versiones son `0.x.y`; la primera versión estable será la `1.0.0`.

La versión vigente está en el archivo [`VERSION`](VERSION), que es la única fuente de referencia.

## [Unreleased]

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

[Unreleased]: https://github.com/enavcap/HarmonyFinder/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/enavcap/HarmonyFinder/compare/6e5e592...v0.3.1
[0.3.0]: https://github.com/enavcap/HarmonyFinder/releases/tag/v0.3.0
[0.2.0]: https://github.com/enavcap/HarmonyFinder/compare/5aee7e5...13f2a9b
[0.1.0]: https://github.com/enavcap/HarmonyFinder/commits/5aee7e5
