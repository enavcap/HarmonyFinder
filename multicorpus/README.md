# Buscador armónico · arquitectura multicorpus

## Estructura

```
multicorpus/
  modelo.py            esquema SQLite: compositores · obras · títulos alternativos · movimientos ·
                       análisis · anotaciones · candidatos a duplicado · importaciones
  identificacion.py    normalización de compositores, catálogos y títulos; identificación de obras
                       en tres niveles; confirmar / descartar candidatos
  adaptadores/
    wir.py             When in Rome (RomanText, analysis*.txt)
    dcml.py            Distant Listening Corpus (harmonies/measures/notes/metadata.tsv)
  importar.py          importación idempotente con informe por subcorpus
  buscar_mc.py         detectores sobre el modelo común (+ cadencias anotadas del DCML)
  exportar_mc.py       genera los datos estáticos de la web (web/data, web/scores)
  tests/               pruebas automáticas (pytest)
```

Catálogo: `datos/catalogo.sqlite`. Fuentes DCML: `datos/fuentes/dcml/<subcorpus>` (clones fijados a un commit).

## Uso

```bash
cd armonia
python -m multicorpus.importar wir                       # o --sub Piano_Sonatas,Quartets
python -m multicorpus.importar dcml --sub "$(paste -sd, datos/fuentes/dcml/subcorpus_nuevos.txt)"
python -m multicorpus.importar duplicados                # candidatos pendientes de revisión
python -m multicorpus.importar confirmar 12              # fusiona (conserva todos los análisis)
python -m multicorpus.importar descartar 13
python -m multicorpus.exportar_mc                        # regenera la web
python -m pytest -q multicorpus/tests
```

Volver a ejecutar una importación no duplica nada: un análisis con el mismo id y la misma huella SHA-1
se omite; si la fuente cambió, entra como versión nueva (`id@huella`) sin borrar la anterior.
No lances dos importaciones a la vez sobre el mismo catálogo.

## Para añadir otra fuente

Escribe un adaptador con `subcorpus_disponibles()` y `listar(sub)` que produzca registros con los
mismos campos que `adaptadores/dcml.py` (obra, procedencia, `anotaciones()` y `partitura()`).
El resto (identificación, importación, detectores, exportación) no cambia.

## Identificación de obras

1. **Exacta**: identificador externo (Wikidata, MusicBrainz) o número de catálogo (BWV, K, D, Hob, Op…).
   Un opus sin número interno solo identifica si además coincide el título.
2. **Por metadatos**: mismo compositor, título normalizado igual (traducciones, puntuación, catálogo
   eliminados; tonalidad conservada) y catálogos compatibles.
3. **Aproximada**: títulos parecidos → **candidato pendiente**, nunca fusión automática.

Dos piezas distintas de la misma fuente nunca comparten movimiento.

## Licencias

- When in Rome: CC BY-SA 4.0.
- DCML: CC BY-NC-SA 4.0 (uso no comercial). Cada análisis guarda archivo, URL al commit, anotadores,
  versión de anotación y referencia bibliográfica.
- Las partituras DCML se reconstruyen desde sus tablas de notas: no tienen dinámicas ni articulaciones.
