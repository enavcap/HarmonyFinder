"""
Modelo interno normalizado (SQLite) para varios corpus de análisis armónico.

Separa:
  compositores · obras · titulos_alternativos · movimientos · analisis · anotaciones
  candidatos_duplicado (identificación dudosa, para revisión manual) · importaciones (informes)

Cada análisis guarda su procedencia (fuente, subcorpus, archivo original, URL, versión/commit,
licencia, autores, huella SHA-1 del archivo original). Cada anotación guarda la etiqueta original
tal como aparece en la fuente y, aparte, los campos normalizados; `derivado` indica qué campos se
calcularon automáticamente.
"""
import sqlite3
from pathlib import Path

ESQUEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS compositores (
    id TEXT PRIMARY KEY,            -- slug estable: 'bach-johann-sebastian'
    nombre TEXT NOT NULL,           -- 'Johann Sebastian Bach'
    nombre_orden TEXT NOT NULL,     -- 'Bach, Johann Sebastian'
    nacimiento INTEGER, muerte INTEGER,
    fuente_fechas TEXT              -- de dónde salen las fechas
);

CREATE TABLE IF NOT EXISTS obras (
    id TEXT PRIMARY KEY,            -- 'obra:<compositor>:<clave>'
    compositor_id TEXT NOT NULL REFERENCES compositores(id),
    titulo TEXT NOT NULL,           -- título original preferente
    titulo_norm TEXT NOT NULL,      -- para comparar
    catalogo TEXT,                  -- 'BWV 1001', 'D. 911', 'K. 279', 'Op. 13'
    catalogo_norm TEXT,             -- 'bwv:1001' (sin espacios ni puntos)
    opus_norm TEXT,                 -- 'op:13' / 'op:2:1'
    genero TEXT, instrumentacion TEXT,
    anio INTEGER, periodo TEXT,
    wikidata TEXT, musicbrainz TEXT, imslp TEXT,
    creada_por TEXT                 -- importación que la creó
);
CREATE INDEX IF NOT EXISTS i_obra_comp ON obras(compositor_id, titulo_norm);
CREATE INDEX IF NOT EXISTS i_obra_cat ON obras(compositor_id, catalogo_norm);

CREATE TABLE IF NOT EXISTS titulos_alternativos (
    obra_id TEXT NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL, fuente TEXT NOT NULL,
    PRIMARY KEY (obra_id, titulo, fuente)
);

CREATE TABLE IF NOT EXISTS movimientos (
    id TEXT PRIMARY KEY,            -- '<obra_id>#<numero o clave>'
    obra_id TEXT NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    numero TEXT,                    -- '1', '2', 'Ia'…
    titulo TEXT,
    partitura TEXT,                 -- ruta a MusicXML (original o reconstruida)
    partitura_origen TEXT           -- 'original' | 'reconstruida-dcml-notes' | …
);
CREATE INDEX IF NOT EXISTS i_mov_obra ON movimientos(obra_id);

CREATE TABLE IF NOT EXISTS analisis (
    id TEXT PRIMARY KEY,            -- 'wir:<ruta>' | 'dcml:<subcorpus>:<pieza>'
    movimiento_id TEXT NOT NULL REFERENCES movimientos(id),
    fuente TEXT NOT NULL,           -- 'wir' | 'dcml'
    subcorpus TEXT,
    archivo TEXT NOT NULL,          -- ruta dentro de la fuente
    url TEXT,                       -- URL del archivo original
    version TEXT,                   -- commit / versión del corpus
    version_anotacion TEXT,         -- p. ej. estándar DCML 2.3.0
    licencia TEXT,
    autores TEXT,                   -- analistas / anotadores
    referencia TEXT,                -- cita bibliográfica
    origen_declarado TEXT,          -- p. ej. WiR indica que procede de DCML
    automatico INTEGER DEFAULT 0,   -- 1 si el análisis es automático
    huella TEXT NOT NULL,           -- SHA-1 del archivo original
    metadatos_originales TEXT,      -- JSON con todo lo leído de la fuente
    importacion_id INTEGER
);
CREATE INDEX IF NOT EXISTS i_an_mov ON analisis(movimiento_id);

CREATE TABLE IF NOT EXISTS anotaciones (
    analisis_id TEXT NOT NULL REFERENCES analisis(id) ON DELETE CASCADE,
    pos INTEGER NOT NULL,
    tipo TEXT NOT NULL,             -- 'acorde' | 'marca' (cadencia/frase sin acorde)
    linea_original INTEGER,         -- fila/línea en el archivo original
    etiqueta_original TEXT,         -- tal cual en la fuente
    compas INTEGER, parte REAL,     -- número de compás (mn) y parte métrica (1 = primera)
    onset_q REAL,                   -- posición en negras desde el inicio del compás
    duracion_q REAL,
    tono TEXT, modo TEXT,           -- tonalidad local (notación music21: 'E-', 'c#')
    tono_global TEXT,
    cifrado TEXT,                   -- cifrado romano normalizado (sintaxis RomanText)
    grado INTEGER, alteracion INTEGER, calidad TEXT, inversion INTEGER,
    secundaria TEXT, septima INTEGER,
    pcs TEXT, bajo TEXT,
    cadencia TEXT,                  -- PAC, IAC, HC, DC, EC, PC (solo si la fuente lo anota)
    fin_frase TEXT,                 -- '{', '}', '}{' … (fuente)
    pedal TEXT, cambios TEXT,
    derivado TEXT,                  -- campos calculados automáticamente (lista separada por comas)
    PRIMARY KEY (analisis_id, pos)
);
CREATE INDEX IF NOT EXISTS i_anot_cif ON anotaciones(cifrado);

CREATE TABLE IF NOT EXISTS candidatos_duplicado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    obra_id TEXT NOT NULL,          -- obra creada (provisional)
    obra_candidata TEXT NOT NULL,   -- obra existente con la que podría coincidir
    nivel INTEGER NOT NULL,         -- 3 = coincidencia aproximada
    puntuacion REAL, motivo TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente | confirmado | descartado
    resuelto_en TEXT,
    UNIQUE (obra_id, obra_candidata)
);

CREATE TABLE IF NOT EXISTS importaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fuente TEXT, subcorpus TEXT, version TEXT, fecha TEXT,
    obras_nuevas INTEGER, obras_existentes INTEGER, analisis_nuevos INTEGER,
    candidatos INTEGER, omitidos INTEGER, errores INTEGER,
    detalle TEXT
);
"""

def conectar(ruta):
    con = sqlite3.connect(ruta, timeout=120)    # espera en vez de fallar si otra importación escribe
    con.row_factory = sqlite3.Row
    con.executescript(ESQUEMA)
    return con
