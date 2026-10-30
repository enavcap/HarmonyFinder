# Informe final · ampliación multicorpus (When in Rome + DCML)

## 1. Arquitectura inicial
El buscador leía únicamente When in Rome (RomanText) desde `indice.sqlite`. Las obras se agrupaban por carpeta, y la web estática (`web/`) tenía detectores en `buscar.py`, partituras MusicXML y cifrados dibujados con Verovio.

## 2. Cambios
- Nuevo paquete `multicorpus/` (ver README):
  - modelo común (obra → movimiento → análisis → anotaciones);
  - adaptadores WiR y DCML;
  - identificación de obras en 3 niveles con candidatos a duplicado;
  - importación idempotente con informes;
  - comandos `revisar` y `renormalizar`;
  - exportación a la web.
- `buscar.py` sigue en uso. Los detectores nuevos están en `buscar_mc.py`.
- Web:
  - filtros por fuente, época, tonalidad, modo y obra;
  - resultados agrupados por obra con distintivo de fuente;
  - búsqueda de progresiones (inversiones, acordes intermedios, mínimo);
  - selector y comparador de análisis;
  - ficha del ejemplo con criterio, contexto y procedencia;
  - colecciones personales sincronizadas: comentario, etiquetas, valoración y observaciones.
- Se conservan todas las funciones anteriores: autocompletar, conceptos, tipos de acorde, cifrados romano/interválico/funcional, copiar SVG/imagen, obras por compositor.

## 3. Subcorpus DCML importados (28, «repertorio nuevo»)
bach_en_fr_suites 89 · bach_solo 68 · bartok_bagatelles 14 · c_schumann_lieder 12 · couperin_clavecin 9 · couperin_concerts 84 · cpe_bach_keyboard 66 · frescobaldi_fiori_musicali 47 · handel_keyboard 6 · jc_bach_sonatas 29 · kleine_geistliche_konzerte 55 · kozeluh_sonatas 49 · mahler_kindertotenlieder 5 · mendelssohn_quartets 24 · monteverdi_madrigals 19 · pergolesi_stabat_mater 7 · peri_euridice 6 · pleyel_quartets 6 · poulenc_mouvements_perpetuels 3 · rachmaninoff_piano 22 · ravel_piano 3 · scarlatti_sonatas 69 · schubert_winterreise 24 · schulhoff_suite_dansante_en_jazz 6 · schumann_liederkreis 12 · sweelinck_keyboard 1 · wagner_overtures 2 · wf_bach_sonatas 9.

Cada subcorpus queda fijado a su commit, y la URL de cada análisis apunta a ese commit.

## 4. Cifras del catálogo
- Totales: 985 obras · 2201 movimientos (2060 con partitura).
- Análisis: 2580, de ellos 1834 WiR y 746 DCML, con 392 573 anotaciones.
- En la web: 890 obras · 2060 movimientos · 2395 análisis con partitura · 339 474 acordes.

## 5. Duplicados
- Obras con análisis de ambas fuentes: 8. Winterreise, Kindertotenlieder, Madrigales de Monteverdi libros 3–5, Partita BWV 1004, Clara Schumann Op. 13 y Op. 23.
- Candidatos: 1 confirmado (Clara Schumann Op. 23) y 17 descartados por ser obras distintas (WTC I/II, colecciones de Reichardt, ejemplos de manual A/B, misas de Frescobaldi). Ninguno pendiente.
- Correcciones tras la revisión de duplicados (30-10-2026):
  - **Ciclos partidos en obras sueltas**: el identificador de archivo del DCML («n10») se leía como número de opus, y Winterreise (23) y Liederkreis (4) quedaban troceados. Ahora la obra se agrupa por título y número de movimiento según los metadatos.
  - **Movimientos emparejados solo por número**: el madrigal «O primavera» quedaba unido a «Là tra 'l sangue». Ahora se exige que el título sea compatible, y una versión indicada en el título («Spätere Fassung») no se fusiona con un análisis sin versión.
  - **Identificador de colección**: las tres misas de Frescobaldi se fundían por el Wikidata de *Fiori musicali*; ya no se usa para identificar obras.
  - **Misma fuente, mismo título**: las dos colecciones «Zwölf Gesänge» de Reichardt se habían fundido. Si la fuente las distingue como obras, ya no se unen solo por el título.
  - **Títulos repetidos**: las obras distintas con el mismo título muestran el catálogo («Sonata, K.1», corales con BWV).
- Auditoría (`python -m multicorpus.auditar`): 0 obras duplicadas. Quedan 8 avisos de movimientos con el mismo número, todos piezas distintas: Bourrée I/II, variaciones de Händel, preludio y fuga, partes de madrigales.
- Integridad: 0 movimientos con dos análisis DCML; 0 movimientos WiR que mezclen piezas.

## 6. Identificación de obras
1. **Exacta**: Wikidata/MusicBrainz o catálogo (BWV, K, D, Hob, WoO, SV, S, L, H, Wq, F, B, Op.). Un opus sin número interno exige además el mismo título.
2. **Metadatos**: compositor canónico (tabla de alias) + título normalizado (traducciones, catálogo y puntuación eliminados; tonalidad conservada) + catálogos compatibles; incluye los títulos alternativos.
3. **Aproximada**: solo genera candidatos, en dos casos:
   - títulos parecidos (≥ 0,72) con los mismos números y catálogos compatibles;
   - el mismo opus con un título contenido en el otro.

Dos piezas distintas de una misma fuente nunca comparten movimiento. Al confirmar una fusión se conservan todos los análisis.

## 7. Funciones de búsqueda
- Conceptos derivados por regla y conceptos anotados por el corpus: cadencias del DCML (PAC, IAC, HC, DC, PC, EC). Cada uno muestra su tipo y su criterio.
- Detectores nuevos sobre el modelo común:
  - cadencia auténtica imperfecta;
  - acorde disminuido;
  - acorde aumentado;
  - sexta añadida;
  - secuencia de quintas.
- Búsquedas combinables:
  - tipos de acorde;
  - progresiones (exacta, por transposición en grados romanos, sin inversiones, con huecos, mínimo de acordes).
- Filtros:
  - fuente, compositor, obra, época, tonalidad, modo;
  - longitud del pasaje;
  - máximo de ejemplos por obra.
- Comparador de análisis: cuenta coincidencias y diferencias de cifrado, tonalidad y segmentación, sin decidir cuál es correcto.

## 8. Limitaciones
- **Detectores de contrapunto, imitación y esquemas**: no se implementan, porque el corpus no los anota.
- **Cadencias derivadas**: se definen solo por los acordes; no se comprueba la voz superior.
- **Contexto formal**: se limita a los finales de frase del DCML.
- **Partituras DCML**: se reconstruyen desde sus tablas de notas, sin dinámicas ni articulaciones.
- **Errores de importación (registrados en los informes)**:
  - 29 análisis WiR que music21 no puede leer (sintaxis de origen);
  - 5 partituras DCML que no se pudieron reconstruir (3 de CPE Bach / Rachmaninoff, 2 de Ravel), cuyos análisis no aparecen en la web.
- **Convenciones de cifrado DCML**:
  - sextas aumentadas desarrolladas (Ger6 = viio65(b3)/V): se traducen a Ger65/It6/Fr43;
  - «#vii» en menor: se trata como equivalente a «vii».
  - En ambos casos se conserva la etiqueta original.
- **Licencia**: el DCML es CC BY-NC-SA 4.0, así que la web solo admite uso no comercial y con atribución. When in Rome es CC BY-SA 4.0.

## 9. Pruebas
- `python -m pytest -q multicorpus/tests`: 27 superadas. Cubren identificación, duplicados, candidatos, idempotencia, procedencia, normalización DCML, sextas aumentadas y `revisar`.
- Pruebas de la web en navegador (`vtest/t_mc.js`): 18 superadas, incluida «ningún compositor muestra dos obras con el mismo título», sin errores de página. Cubren:
  - inicio vacío y autocompletar;
  - napolitana con partitura y ficha;
  - filtro DCML con partitura reconstruida;
  - cadencia rota anotada;
  - progresiones ii6–V7–I y ii–V–I sin inversiones;
  - comparador en Winterreise;
  - obras de Mahler.

## 10. Ejecución
Ver `multicorpus/README.md`. En resumen:

```
importar wir
importar dcml --sub …
revisar
duplicados
confirmar|descartar <id>
renormalizar dcml
exportar_mc
```

Después, publicar `web/`.
