<h1 align="center">Buscador armónico</h1>

<p align="center">
  <b>Ejemplos reales de procedimientos armónicos, con su compás exacto y la partitura cifrada.</b><br>
  Para preparar clases de armonía, análisis y materiales de teoría.
</p>

<p align="center">
  <img src="docs/img/portada.png" alt="Búsqueda de «napolitana»: resumen por compositor, período y modo, ejemplos destacados y partitura de Beethoven con cifrado romano, interválico y funcional" width="100%">
</p>

<p align="center">
  <img alt="Obras" src="https://img.shields.io/badge/obras-890-1f5f6b">
  <img alt="Análisis" src="https://img.shields.io/badge/análisis-2.580-1f5f6b">
  <img alt="Acordes" src="https://img.shields.io/badge/acordes-≈390.000-1f5f6b">
  <img alt="Corpus" src="https://img.shields.io/badge/corpus-When%20in%20Rome%20%2B%20DCML-8a3b7a">
</p>

---

## Qué hace

Eliges un procedimiento armónico (una napolitana, una cadencia rota, una modulación enarmónica, una progresión `ii6 V7 I`…) y aparecen ejemplos del repertorio, de Monteverdi a Bartók, con la obra, el compás, la parte, la tonalidad y el cifrado. Al pulsar un ejemplo se dibuja la partitura con tres cifrados alineados bajo el pentagrama:

- **romano** (V⁶₅/V, ♭II⁶, Ger⁶₅…)
- **interválico** (cifrado de bajo continuo)
- **funcional** (T, S, D, DD, sN, Đ⁷…)

El fragmento se copia como **SVG** o imagen para pegarlo en un libro o una presentación.

## Cómo se busca

<img src="docs/img/inicio.png" alt="Caja de búsqueda con los desplegables Armonía, Compositor, Período y Tonalidad" width="100%">

- **Una sola caja con etiquetas.** Escribes y eliges: `napolitana` + `Mozart` + `modo menor`. Cada elección queda como etiqueta que se puede quitar.
- **Cuatro desplegables** para explorar sin conocer el vocabulario:
  - **Armonía**: cadencias, acordes alterados, dominantes secundarias, modulación, otros recursos, cadencias anotadas, tipos de acorde y progresiones.
  - **Compositor**: buscador y lista por período.
  - **Período**.
  - **Tonalidad**: nota + ♭ ♮ ♯ + mayor/menor.
- **Resultados que se leen de un vistazo**:
  - resumen con barras por compositor, período y modo (pulsar una barra filtra);
  - cuatro ejemplos destacados;
  - lista plegada compositor → obra → ejemplos.
- **Ficha de cada ejemplo**: criterio de detección, contexto armónico, fuente, analistas, versión y licencia.
- **Comparador de análisis** cuando una obra está analizada en los dos corpus (Winterreise, Kindertotenlieder, madrigales de Monteverdi…).
- **Colecciones personales** con comentario, etiquetas y valoración.

### Procedimientos detectados

| Familia | Conceptos |
|---|---|
| Cadencias | auténtica perfecta e imperfecta, rota, semicadencia, frigia, plagal, 6/4 cadencial; cadencias anotadas por los analistas del DCML (PAC, IAC, HC, DC, PC, EC) |
| Acordes alterados | napolitana (y → V), sextas aumentadas italiana / francesa / alemana (y → 6/4), intercambio modal, acorde vecino cromático |
| Dominantes secundarias | dominante secundaria (resuelta o no), dominante de la dominante, séptima disminuida secundaria |
| Modulación | diatónica, cromática, enarmónica (verificada con la grafía de la partitura), directa; a relativo, dominante, homónimo, tercera |
| Otros | secuencia de quintas, pedal de dominante, acorde disminuido, aumentado, sexta añadida |
| Pasajes por tipo de acorde | tríadas / cuatríadas, inversiones, prestados, secundarias, alterados, modulación — combinables |
| Progresiones | cualquier sucesión en cifrado romano, con o sin inversiones, con acordes intermedios |

## Grabado

Las partituras se dibujan en el navegador con [Verovio](https://www.verovio.org), con la fuente musical **Bravura** y el texto en **Academico** (las de Dorico, ambas con licencia SIL OFL) y grosores de línea al estilo de Dorico.

<img src="docs/img/grabado.png" alt="Comparación: grabado por defecto frente a Bravura + Academico" width="100%">

## Datos

| Corpus | Análisis | Licencia |
|---|---|---|
| [When in Rome](https://github.com/MarkGotham/When-in-Rome) (Gotham et al., RomanText) | 1834 | CC BY-SA 4.0 |
| [Distant Listening Corpus](https://github.com/DCMLab/distant_listening_corpus) (DCML, EPFL), 28 subcorpus | 746 | CC BY-NC-SA 4.0 |

- **Modelo común** obra → movimiento → análisis. Una obra puede tener análisis de las dos fuentes.
- **Identificación de obras en tres niveles**:
  1. catálogo o identificador externo;
  2. título normalizado;
  3. parecido, que solo genera candidatos para revisión manual, nunca fusiones automáticas.
- **Trazabilidad**:
  - se conserva la etiqueta original de cada analista;
  - los campos derivados están marcados;
  - cada análisis guarda archivo, commit, autores y licencia.
- **Partituras**:
  - las de When in Rome vienen de OpenScore y music21;
  - las del DCML se reconstruyen desde sus tablas de notas (sin dinámicas ni articulaciones).

## Estructura

```
multicorpus/          catálogo multicorpus (modelo, identificación, adaptadores, importación, exportación, pruebas)
  adaptadores/        When in Rome (RomanText) y DCML (TSV)
  tests/              pruebas automáticas (pytest)
  README.md           uso del catálogo · INFORME.md: informe técnico
buscar.py             detectores armónicos sobre la secuencia de acordes
indexar.py            lectura de RomanText con music21
herramientas/         conversión de tablas DCML y Humdrum a MusicXML
web/                  aplicación estática (index.html + data/ + scores/ + fonts/)
docs/img/             imágenes de esta portada
```

## Uso

**La web** es estática y funciona tal cual:

```bash
cd web && python3 -m http.server 8000      # http://localhost:8000
```

**Regenerar los datos** (necesita las fuentes; ver `multicorpus/README.md`):

```bash
pip install music21 pytest
python -m multicorpus.importar wir
python -m multicorpus.importar dcml
python -m multicorpus.auditar            # posibles duplicados
python -m multicorpus.exportar_mc        # genera web/data y web/scores
python -m pytest -q multicorpus/tests
```

## Limitaciones

- No hay detectores de contrapunto, imitación ni esquemas galantes: los corpus no los anotan.
- Las cadencias derivadas se definen por los acordes; no comprueban la voz superior.
- En pasajes muy polifónicos de las partituras reconstruidas del DCML (3–4 voces en un pentagrama) puede haber choques de notas.
- La fecha de composición solo consta en unas 190 obras; se filtra por período.

## Licencias y créditos

- Análisis: **When in Rome** (CC BY-SA 4.0) y **Distant Listening Corpus, DCML** (CC BY-NC-SA 4.0). Por la licencia del DCML, los datos de `web/` solo pueden usarse sin fines comerciales, con atribución y compartiendo igual.
- Partituras: OpenScore, corpus de music21 y reconstrucciones a partir de las tablas del DCML.
- Fuentes: Bravura y Academico (Steinberg, SIL Open Font License 1.1).
- Grabado: Verovio (LGPL).

---

<p align="center"><sub>Proyecto de Ezequiel · Conservatorio Profesional de Música de Baza</sub></p>
