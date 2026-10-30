"""
Identificación de obras y prevención de duplicados.

Niveles:
  1. Coincidencia exacta: identificadores externos del movimiento (Wikidata, MusicBrainz) o un
     número de catálogo compartido (BWV, K., D., Hob., WoO, SV, Op.+nº…) con el mismo compositor.
  2. Metadatos: mismo compositor + mismo título normalizado (+ opus compatible).
  3. Aproximada: títulos parecidos (ortografía, abreviaturas, traducciones, puntuación).
     NUNCA fusiona: crea la obra como provisional y registra un candidato pendiente de revisión.

Estados devueltos: 'nueva' | 'existente' | 'pendiente'.
"""
import difflib, re, unicodedata, json

# ---------------------------------------------------------------- compositores
# Fechas: tabla curada de la aplicación (dato bibliográfico general, no procede de los corpus).
COMPOSITORES = [
    # id, nombre, nombre_orden, nacimiento, muerte, alias
    ("aldwell-edward", "Edward Aldwell", "Aldwell, Edward", 1938, 2006, ["Schachter, and Cadwallader Aldwell"]),
    ("bach-cpe", "Carl Philipp Emanuel Bach", "Bach, Carl Philipp Emanuel", 1714, 1788, ["C.P.E. Bach", "C. P. E. Bach"]),
    ("bach-jc", "Johann Christian Bach", "Bach, Johann Christian", 1735, 1782, ["J.C. Bach", "J. C. Bach"]),
    ("bach-js", "Johann Sebastian Bach", "Bach, Johann Sebastian", 1685, 1750, ["J. S. Bach", "J.S. Bach", "Bach", "Bach, Johann Sebastian", "WTC", "wtc"]),
    ("bach-wf", "Wilhelm Friedemann Bach", "Bach, Wilhelm Friedemann", 1710, 1784, ["W.F. Bach"]),
    ("bartok", "Béla Bartók", "Bartók, Béla", 1881, 1945, ["Bela Bartok"]),
    ("beethoven", "Ludwig van Beethoven", "Beethoven, Ludwig van", 1770, 1827, ["Beethoven"]),
    ("bonis", "Mel Bonis", "Bonis, Mel", 1858, 1937, ["Mélanie Bonis (1858 - 1937)", "Mel Bonis"]),
    ("brahms", "Johannes Brahms", "Brahms, Johannes", 1833, 1897, ["Brahms"]),
    ("burleigh", "Harry Thacker Burleigh", "Burleigh, Harry Thacker", 1866, 1949, []),
    ("chaminade", "Cécile Chaminade", "Chaminade, Cécile", 1857, 1944, []),
    ("chausson", "Ernest Chausson", "Chausson, Ernest", 1855, 1899, []),
    ("chopin", "Frédéric Chopin", "Chopin, Frédéric", 1810, 1849, ["Frederic Chopin"]),
    ("coleridge-taylor", "Samuel Coleridge-Taylor", "Coleridge-Taylor, Samuel", 1875, 1912, ["S. Coleridge-Taylor"]),
    ("corelli", "Arcangelo Corelli", "Corelli, Arcangelo", 1653, 1713, []),
    ("couperin", "François Couperin", "Couperin, François", 1668, 1733, ["Francois Couperin"]),
    ("debussy", "Claude Debussy", "Debussy, Claude", 1862, 1918, []),
    ("dvorak", "Antonín Dvořák", "Dvořák, Antonín", 1841, 1904, ["Antonin Dvorak"]),
    ("franz-robert", "Robert Franz", "Franz, Robert", 1815, 1892, []),
    ("frescobaldi", "Girolamo Frescobaldi", "Frescobaldi, Girolamo", 1583, 1643, []),
    ("goudimel", "Claude Goudimel", "Goudimel, Claude", 1514, 1572, ["Goudimel"]),
    ("grieg", "Edvard Grieg", "Grieg, Edvard", 1843, 1907, []),
    ("handel", "Georg Friedrich Händel", "Händel, Georg Friedrich", 1685, 1759, ["George Frideric Handel", "Handel"]),
    ("haydn", "Franz Joseph Haydn", "Haydn, Franz Joseph", 1732, 1809, ["Haydn", "Joseph Haydn"]),
    ("hensel", "Fanny Hensel", "Hensel, Fanny", 1805, 1847, ["Fanny (Mendelssohn) Hensel", "Fanny Mendelssohn"]),
    ("holmes", "Augusta Holmès", "Holmès, Augusta", 1847, 1903, ["Augusta Mary Anne Holmès"]),
    ("jaell", "Marie Jaëll", "Jaëll, Marie", 1846, 1925, []),
    ("kinkel", "Johanna Kinkel", "Kinkel, Johanna", 1810, 1858, []),
    ("kostka-stefan", "Stefan Kostka", "Kostka, Stefan", 1939, None, ["Payne, and AlmÃ©n Kostka"]),
    ("kozeluch", "Leopold Koželuch", "Koželuch, Leopold", 1747, 1818, ["Leopold Kozeluch", "Leopold Kozeluh"]),
    ("kralik", "Mathilde Kralik", "Kralik, Mathilde", 1857, 1944, []),
    ("lang", "Josephine Lang", "Lang, Josephine", 1815, 1880, []),
    ("liszt", "Franz Liszt", "Liszt, Franz", 1811, 1886, []),
    ("mahler", "Gustav Mahler", "Mahler, Gustav", 1860, 1911, []),
    ("mayer", "Emilie Mayer", "Mayer, Emilie", 1812, 1883, []),
    ("medtner", "Nikolai Medtner", "Medtner, Nikolai", 1880, 1951, []),
    ("mendelssohn", "Felix Mendelssohn", "Mendelssohn, Felix", 1809, 1847, ["Felix Mendelssohn Bartholdy"]),
    ("monteverdi", "Claudio Monteverdi", "Monteverdi, Claudio", 1567, 1643, ["Monteverdi"]),
    ("mozart", "Wolfgang Amadeus Mozart", "Mozart, Wolfgang Amadeus", 1756, 1791, ["Mozart"]),
    ("paradis", "Maria Theresia von Paradis", "Paradis, Maria Theresia von", 1759, 1824, []),
    ("pergolesi", "Giovanni Battista Pergolesi", "Pergolesi, Giovanni Battista", 1710, 1736, []),
    ("peri", "Jacopo Peri", "Peri, Jacopo", 1561, 1633, []),
    ("pleyel", "Ignaz Pleyel", "Pleyel, Ignaz", 1757, 1831, []),
    ("poulenc", "Francis Poulenc", "Poulenc, Francis", 1899, 1963, []),
    ("purcell", "Henry Purcell", "Purcell, Henry", 1659, 1695, ["Purcell"]),
    ("rachmaninoff", "Serguéi Rajmáninov", "Rajmáninov, Serguéi", 1873, 1943, ["Sergei Rachmaninoff", "Sergei Rachmaninov"]),
    ("ravel", "Maurice Ravel", "Ravel, Maurice", 1875, 1937, []),
    ("reger", "Max Reger", "Reger, Max", 1873, 1916, []),
    ("reichardt", "Louise Reichardt", "Reichardt, Louise", 1779, 1826, []),
    ("rimsky-korsakov", "Nikolái Rimski-Kórsakov", "Rimski-Kórsakov, Nikolái", 1844, 1908, ["NikolaÃ¯ Rimsky Korsakov", "Nicolai Rimsky-Korsakov"]),
    ("scarlatti-d", "Domenico Scarlatti", "Scarlatti, Domenico", 1685, 1757, []),
    ("schubert", "Franz Schubert", "Schubert, Franz", 1797, 1828, ["Schubert"]),
    ("schulhoff", "Erwin Schulhoff", "Schulhoff, Erwin", 1894, 1942, []),
    ("schumann-clara", "Clara Schumann", "Schumann, Clara", 1819, 1896, []),
    ("schumann-robert", "Robert Schumann", "Schumann, Robert", 1810, 1856, []),
    ("schutz", "Heinrich Schütz", "Schütz, Heinrich", 1585, 1672, ["Heinrich Schutz"]),
    ("sweelinck", "Jan Pieterszoon Sweelinck", "Sweelinck, Jan Pieterszoon", 1562, 1621, ["Jan Sweelinck"]),
    ("tchaikovsky", "Piotr Ilich Chaikovski", "Chaikovski, Piotr Ilich", 1840, 1893, ["Pyotr Tchaikovsky", "Piotr Ilyich Tchaikovsky", "Pyotr Ilyich Tchaikovsky", "Tchaikovski", "Peter Tchaikovsky"]),
    ("viardot", "Pauline Viardot", "Viardot, Pauline", 1821, 1910, []),
    ("wagner", "Richard Wagner", "Wagner, Richard", 1813, 1883, []),
    ("white-maude", "Maude Valérie White", "White, Maude Valérie", 1855, 1937, []),
    ("wolf-hugo", "Hugo Wolf", "Wolf, Hugo", 1860, 1903, []),
    ("zumsteeg-emilie", "Emilie Zumsteeg", "Zumsteeg, Emilie", 1796, 1857, []),
]

def sin_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def slug(s):
    s = sin_acentos(str(s)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

_IDX_COMP = {}
for cid, nombre, orden, n, m, alias in COMPOSITORES:
    for a in [nombre, orden, *alias]:
        _IDX_COMP[slug(a)] = cid

def compositor_canonico(texto):
    """Devuelve (id, nombre, nombre_orden, nacimiento, muerte, conocido)."""
    if not texto or not str(texto).strip():
        return ("desconocido", "Compositor desconocido", "Desconocido", None, None, False)
    t = str(texto).replace("_", " ").strip().rstrip(",")
    cand = [t]
    if "," in t:                                   # 'Bach, Johann Sebastian'
        ape, nom = [x.strip() for x in t.split(",", 1)]
        cand.append(f"{nom} {ape}")
    for c in cand:
        cid = _IDX_COMP.get(slug(c))
        if cid:
            fila = next(x for x in COMPOSITORES if x[0] == cid)
            return (cid, fila[1], fila[2], fila[3], fila[4], True)
    nombre = cand[-1]
    partes = nombre.split()
    orden = f"{partes[-1]}, {' '.join(partes[:-1])}" if len(partes) > 1 else nombre
    return (slug(nombre), nombre, orden, None, None, False)

def periodo(anio):
    if anio is None:
        return None
    if anio < 1600: return "Renacimiento"
    if anio < 1750: return "Barroco"
    if anio < 1820: return "Clasicismo"
    if anio < 1900: return "Romanticismo"
    return "Siglo XX"

def anio_estimado(comp_id):
    """Año aproximado de actividad (nacimiento + 35) cuando la obra no trae fecha."""
    fila = next((x for x in COMPOSITORES if x[0] == comp_id), None)
    if not fila or not fila[3]:
        return None
    return min(fila[3] + 35, fila[4] or fila[3] + 35)

# ---------------------------------------------------------------- catálogos
_SISTEMAS = [
    ("bwv", r"\bBWV\.?\s*(\d+[a-z]?)(?:[./](\d+))?"),
    ("hob", r"\bHob\.?\s*([IVXL]+[a-z]?)\s*[:.]?\s*(\w+)"),
    ("woo", r"\bWoO\.?\s*(\d+)"),
    ("sv", r"\bSV\.?\s*(\d+)"),
    ("d", r"(?<![A-Za-z])D\.?\s*(\d{2,4})(?!\d)"),
    ("k", r"(?<![A-Za-z])K(?:V)?\.?\s*(\d+[a-z]?)(?!\d)"),
    ("s", r"(?<![A-Za-z])S\.?\s*(\d{2,3})(?!\d)"),
    ("l", r"(?<![A-Za-z])L\.?\s*(\d{1,3})(?!\d)"),
    ("wq", r"\b[Ww]q\.?\s*(\d+)(?:\s*[./n]\s*(\d+))?"),
    ("f", r"(?<![A-Za-z])F\.?\s*(\d{1,3})(?!\d)"),
    ("h", r"(?<![A-Za-z])H\.?\s*(\d{2,3})(?!\d)"),
    ("b", r"\bBI?\.?\s*(\d{1,3})(?:-(\d+))?(?!\d)"),
]
_OPUS = r"(?:\b|(?<=\d))[Oo]p(?:us)?\.?\s*(\d+)(?:\s*[,_]?\s*(?:[Nn]o|[Nn]r|[Nn]º|n)\.?\s*(\d+)|-(\d+))?"

def extraer_catalogos(texto, compositor_id=None):
    """Lista de claves normalizadas: ['bwv:1001', 'd:911', 'op:89', 'op:2:1'].
    Los sistemas ambiguos (D., K., S., L., H., B.) solo se aceptan con compositores que los usan."""
    if not texto:
        return []
    t = str(texto).replace("_", " ")
    permitidos = {
        "d": {"schubert"}, "k": {"mozart", "scarlatti-d"}, "s": {"liszt"}, "l": {"scarlatti-d"},
        "h": {"bach-cpe"}, "b": {"chopin"}, "wq": {"bach-cpe"}, "f": {"bach-wf"},
    }
    claves = []
    for sist, rx in _SISTEMAS:
        if sist in permitidos and compositor_id not in permitidos[sist]:
            continue
        for m in re.finditer(rx, t):
            partes = [g for g in m.groups() if g]
            claves.append(sist + ":" + ":".join(p.lower().lstrip("0") or "0" for p in partes))
    for m in re.finditer(_OPUS, t):
        claves.append("op:" + ":".join(g.lstrip("0") or "0" for g in m.groups() if g))
    vistos, out = set(), []
    for c in claves:
        if c not in vistos:
            vistos.add(c); out.append(c)
    return out

def opus_de(claves):
    return next((c for c in claves if c.startswith("op:")), None)

def compatibles(claves_a, claves_b):
    """False si comparten sistema de catálogo con números distintos (no pueden ser la misma obra)."""
    sa = {c.split(":")[0]: c for c in claves_a}
    sb = {c.split(":")[0]: c for c in claves_b}
    for s in set(sa) & set(sb):
        a, b = sa[s], sb[s]
        if s == "op":
            if a.split(":")[:2] != b.split(":")[:2]:
                return False
            if len(a.split(":")) == 3 and len(b.split(":")) == 3 and a != b:
                return False
        elif a != b:
            return False
    return True

# ---------------------------------------------------------------- títulos
TRADUCCIONES = {
    "sonate": "sonata", "sonaten": "sonata", "sonatas": "sonata", "suites": "suite",
    "francaise": "french", "francaises": "french", "franzosische": "french", "francesa": "french",
    "anglaise": "english", "anglaises": "english", "englische": "english", "inglesa": "english",
    "lieder": "lied", "songs": "song", "canciones": "song", "nummer": "no", "numero": "no", "nr": "no",
    "libro": "book", "livre": "book", "buch": "book", "madrigali": "madrigal", "madrigals": "madrigal",
    "quartett": "quartet", "streichquartett": "quartet", "cuarteto": "quartet", "string": "",
    "mazurka": "mazurka", "mazurkas": "mazurka", "and": "", "und": "", "et": "", "y": "",
    "in": "", "en": "", "the": "", "moll": "minor", "dur": "major", "menor": "minor", "mayor": "major", "der": "", "die": "", "das": "", "de": "", "di": "", "il": "",
    "le": "", "la": "", "for": "", "fur": "",
    "mit": "", "begleitung": "", "des": "", "pianoforte": "", "piano": "", "klavier": "",
    "primo": "1", "secondo": "2", "terzo": "3", "quarto": "4", "quinto": "5", "sesto": "6",
    "settimo": "7", "ottavo": "8", "first": "1", "second": "2", "third": "3", "fourth": "4", "fifth": "5",
}

def titulo_norm(t):
    if not t:
        return ""
    t = sin_acentos(str(t)).lower().replace("_", " ")
    t = re.sub(r"\b(bwv|hob|woo|sv|op|opus|kv?|d|wq)\.?\s*\d[\w:./]*", " ", t)   # catálogos fuera
    t = re.sub(r"\b(no|nr|n)\.?\s*(\d+)", r"no \2", t)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    pal = [TRADUCCIONES.get(w, w) for w in t.split()]
    pal = [w for w in pal if w]
    return " ".join(sorted(pal))          # el orden de las palabras no cuenta («Suites françaises» = «French Suites»)

def parecido(a, b):
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    jac = len(ta & tb) / max(1, len(ta | tb))
    # un título contenido en el otro (subtítulo, traducción añadida): parecido alto, nunca igualdad
    contenido = 0.8 if (ta <= tb or tb <= ta) and any(len(w) >= 5 for w in ta & tb) else 0.0
    return max(r, jac, contenido)

VERSION = re.compile(r"(fassung|urspr[uü]e?nglich|version|versi[oó]n|original|ossia|erste\b|zweite\b|sp[aä]te?re?\b|fr[uü]here?\b)", re.I)
def version_de(titulo):
    """Indicación de versión en un título de movimiento («Rast (Spätere Fassung)» -> «spatere fassung»), o ''."""
    m = re.search(r"\(([^)]*)\)", titulo or "")
    texto = m.group(1) if m and VERSION.search(m.group(1)) else ("" if not VERSION.search(titulo or "") else titulo)
    return titulo_norm(texto) if texto else ""

def numeros(t):
    return re.findall(r"\d+", t or "")

# ---------------------------------------------------------------- registro
def asegurar_compositor(con, texto):
    cid, nombre, orden, n, m, conocido = compositor_canonico(texto)
    con.execute("INSERT OR IGNORE INTO compositores (id, nombre, nombre_orden, nacimiento, muerte, fuente_fechas) VALUES (?,?,?,?,?,?)",
                (cid, nombre, orden, n, m, "tabla curada de la aplicación" if n else None))
    return cid

def _claves_obra(con, obra_id):
    return [r[0] for r in con.execute("SELECT clave FROM catalogos WHERE obra_id=?", (obra_id,))]

def preparar(con):
    con.execute("CREATE TABLE IF NOT EXISTS catalogos (obra_id TEXT NOT NULL REFERENCES obras(id) ON DELETE CASCADE, clave TEXT NOT NULL, PRIMARY KEY (obra_id, clave))")
    con.execute("CREATE INDEX IF NOT EXISTS i_cat_clave ON catalogos(clave)")
    cols = {r[1] for r in con.execute("PRAGMA table_info(movimientos)")}
    if "ids_externos" not in cols:
        con.execute("ALTER TABLE movimientos ADD COLUMN ids_externos TEXT")
    cols = {r[1] for r in con.execute("PRAGMA table_info(analisis)")}
    if "pieza" not in cols:
        con.execute("ALTER TABLE analisis ADD COLUMN pieza TEXT")      # pieza/carpeta de origen dentro de la fuente
    if "obra_fuente" not in cols:
        con.execute("ALTER TABLE analisis ADD COLUMN obra_fuente TEXT")  # obra tal como la delimita la fuente

def _otra_obra_de_la_fuente(con, obra_id, fuente_id, obra_fuente):
    """¿La obra ya contiene análisis de esta misma fuente que la fuente considera otra obra?"""
    if not fuente_id or not obra_fuente:
        return False
    return con.execute("""SELECT 1 FROM analisis a JOIN movimientos m ON m.id=a.movimiento_id
                          WHERE m.obra_id=? AND a.fuente=? AND a.obra_fuente IS NOT NULL AND a.obra_fuente<>? LIMIT 1""",
                       (obra_id, fuente_id, obra_fuente)).fetchone() is not None

def identificar_obra(con, comp_id, titulo, claves, ids_externos_mov=None, fuente_id=None, obra_fuente=None):
    """Busca la obra existente. Devuelve (obra_id | None, nivel, candidatos[(obra_id, puntuación, motivo)]).
    Por título (nivel 2) no se une a una obra en la que la misma fuente ya distingue otra obra
    («Zwölf Gesänge» y «Zwölf Gesänge, Op. 3» de Reichardt): eso queda como candidato."""
    # Nivel 1a: identificador externo del movimiento
    for idx in (ids_externos_mov or []):
        for (mid, oid, ext) in con.execute("SELECT m.id, m.obra_id, m.ids_externos FROM movimientos m JOIN obras o ON o.id=m.obra_id WHERE o.compositor_id=? AND m.ids_externos LIKE ?", (comp_id, f"%{idx}%")):
            return oid, 1, []
    # Nivel 1b: catálogo compartido (no se usa el opus solo si hay números de obra dentro del opus)
    tn0 = titulo_norm(titulo)
    for c in claves:
        if c.startswith("op:") and c.count(":") == 1:
            continue                                  # «Op. 17» puede ser un conjunto de varias obras
        filas = con.execute("SELECT c.obra_id FROM catalogos c JOIN obras o ON o.id=c.obra_id WHERE o.compositor_id=? AND c.clave=?", (comp_id, c)).fetchall()
        for (oid,) in filas:
            if compatibles(claves, _claves_obra(con, oid)):
                return oid, 1, []
    # opus sin número interno: solo con el mismo título
    for c in [c for c in claves if c.startswith("op:") and c.count(":") == 1]:
        for (oid, tn) in con.execute("SELECT o.id, o.titulo_norm FROM catalogos c JOIN obras o ON o.id=c.obra_id WHERE o.compositor_id=? AND c.clave=?", (comp_id, c)):
            if tn == tn0 and compatibles(claves, _claves_obra(con, oid)):
                return oid, 1, []
    tn = titulo_norm(titulo)
    if not tn:                                     # sin título comparable: solo vale el nivel 1
        return None, 0, []
    # Nivel 2: compositor + título normalizado (+ catálogo compatible)
    for r in con.execute("SELECT id FROM obras WHERE compositor_id=? AND titulo_norm=?", (comp_id, tn)):
        if compatibles(claves, _claves_obra(con, r[0])) and not _otra_obra_de_la_fuente(con, r[0], fuente_id, obra_fuente):
            return r[0], 2, []
    alt = con.execute("SELECT t.obra_id, t.titulo FROM titulos_alternativos t JOIN obras o ON o.id=t.obra_id WHERE o.compositor_id=?", (comp_id,)).fetchall()
    for oid, t in alt:
        if titulo_norm(t) == tn and compatibles(claves, _claves_obra(con, oid)) and not _otra_obra_de_la_fuente(con, oid, fuente_id, obra_fuente):
            return oid, 2, []
    # Nivel 3: aproximada -> solo candidatos
    cands = candidatos_aproximados(con, comp_id, titulo, tn, claves)
    return None, 3 if cands else 0, cands

def candidatos_aproximados(con, comp_id, titulo, tn, claves, excluir=None):
    cands = []
    opus = {c for c in claves if c.startswith("op:") and c.count(":") == 1}
    for r in con.execute("SELECT id, titulo, titulo_norm FROM obras WHERE compositor_id=?", (comp_id,)):
        if r["id"] == excluir:
            continue
        p = parecido(tn, r["titulo_norm"])
        otras = _claves_obra(con, r["id"])
        if not compatibles(claves, otras) or numeros(tn) != numeros(r["titulo_norm"]):
            continue
        if p >= 0.72:
            cands.append((r["id"], round(p, 3), f"títulos parecidos: «{titulo}» / «{r['titulo']}»"))
        else:
            # mismo opus y un título contenido en el otro («6 Lieder» / «6 Lieder aus Jucunde»): candidato
            ta, tb = set(tn.split()), set((r["titulo_norm"] or "").split())
            if opus & set(otras) and ta and tb and (ta <= tb or tb <= ta):
                cands.append((r["id"], 0.75, f"mismo opus ({', '.join(sorted(opus & set(otras)))}) y título contenido: «{titulo}» / «{r['titulo']}»"))
    cands.sort(key=lambda x: -x[1])
    return cands[:3]

def revisar(con):
    """Vuelve a aplicar el nivel 3 a las obras ya catalogadas (tras mejorar las reglas).
    Solo añade candidatos nuevos; nunca fusiona ni reabre los ya confirmados o descartados."""
    preparar(con)
    nuevos = 0
    for o in con.execute("SELECT id, compositor_id, titulo, titulo_norm FROM obras").fetchall():
        for (cid, p, motivo) in candidatos_aproximados(con, o["compositor_id"], o["titulo"], o["titulo_norm"],
                                                       _claves_obra(con, o["id"]), excluir=o["id"]):
            ya = con.execute("""SELECT 1 FROM candidatos_duplicado WHERE (obra_id=? AND obra_candidata=?)
                                OR (obra_id=? AND obra_candidata=?)""", (o["id"], cid, cid, o["id"])).fetchone()
            if not ya:
                con.execute("INSERT INTO candidatos_duplicado (obra_id, obra_candidata, nivel, puntuacion, motivo) VALUES (?,?,?,?,?)",
                            (o["id"], cid, 3, p, motivo)); nuevos += 1
    con.commit()
    return nuevos

def registrar_movimiento(con, registro, importacion):
    """
    registro: dict con compositor, obra_titulo, obra_catalogo, movimiento_numero, movimiento_titulo,
              ids_externos (lista, nivel movimiento), anio, genero, instrumentacion, wikidata, musicbrainz, imslp,
              fuente (para títulos alternativos)
    Devuelve (obra_id, movimiento_id, estado, candidatos)
    """
    preparar(con)
    comp_id = asegurar_compositor(con, registro.get("compositor"))
    titulo = (registro.get("obra_titulo") or "").strip() or "(sin título)"
    claves = extraer_catalogos(" ".join(filter(None, [registro.get("obra_catalogo"), titulo])), comp_id)
    obra_id, nivel, cands = identificar_obra(con, comp_id, titulo, claves, registro.get("ids_externos"),
                                             registro.get("fuente_id"), registro.get("obra_fuente"))
    estado = "existente" if obra_id else ("pendiente" if cands else "nueva")
    if not obra_id:
        base = f"obra:{comp_id}:{slug(claves[0] if claves else titulo)[:60]}"
        obra_id, k = base, 1
        while con.execute("SELECT 1 FROM obras WHERE id=?", (obra_id,)).fetchone():
            k += 1; obra_id = f"{base}-{k}"
        anio = registro.get("anio") or anio_estimado(comp_id)
        con.execute("""INSERT INTO obras (id, compositor_id, titulo, titulo_norm, catalogo, catalogo_norm, opus_norm, genero,
                       instrumentacion, anio, periodo, wikidata, musicbrainz, imslp, creada_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (obra_id, comp_id, titulo, titulo_norm(titulo) or slug(titulo), registro.get("obra_catalogo"),
                     claves[0] if claves else None, opus_de(claves), registro.get("genero"), registro.get("instrumentacion"),
                     registro.get("anio"), periodo(anio), registro.get("wikidata"), registro.get("musicbrainz"),
                     registro.get("imslp"), importacion))
        for (cid, p, motivo) in cands:
            con.execute("INSERT OR IGNORE INTO candidatos_duplicado (obra_id, obra_candidata, nivel, puntuacion, motivo) VALUES (?,?,?,?,?)",
                        (obra_id, cid, 3, p, motivo))
    else:
        # completar metadatos ausentes sin sobrescribir los existentes
        for campo in ("wikidata", "musicbrainz", "imslp", "genero", "instrumentacion", "anio"):
            if registro.get(campo):
                con.execute(f"UPDATE obras SET {campo}=COALESCE({campo}, ?) WHERE id=?", (registro[campo], obra_id))
        actual = con.execute("SELECT titulo FROM obras WHERE id=?", (obra_id,)).fetchone()[0]
        if titulo_norm(actual) != titulo_norm(titulo) or actual != titulo:
            con.execute("INSERT OR IGNORE INTO titulos_alternativos VALUES (?,?,?)", (obra_id, titulo, registro.get("fuente", "")))
    for c in claves:
        con.execute("INSERT OR IGNORE INTO catalogos VALUES (?,?)", (obra_id, c))
    # movimiento
    num = str(registro.get("movimiento_numero") or "").strip().lstrip("0") or None
    mtit = (registro.get("movimiento_titulo") or "").strip() or None
    mov = None
    if num:
        mov = con.execute("SELECT id, titulo FROM movimientos WHERE obra_id=? AND numero=?", (obra_id, num)).fetchone()
        # mismo número pero título claramente distinto: las fuentes numeran distinto (p. ej. libros de madrigales)
        if mov and mtit and mov["titulo"] and (parecido(titulo_norm(mtit), titulo_norm(mov["titulo"])) < 0.5
                                               or version_de(mtit) != version_de(mov["titulo"])):
            mov = None
    if not mov and mtit:
        mejor = 0.0
        for r in con.execute("SELECT id, titulo FROM movimientos WHERE obra_id=? AND titulo IS NOT NULL", (obra_id,)):
            p = parecido(titulo_norm(r["titulo"]), titulo_norm(mtit))
            if p >= 0.75 and p > mejor and version_de(r["titulo"]) == version_de(mtit):
                mov, mejor = r, p
    if not mov and not num and not mtit:
        mov = con.execute("SELECT id FROM movimientos WHERE obra_id=? AND numero IS NULL AND titulo IS NULL", (obra_id,)).fetchone()
    pieza = registro.get("pieza")
    if mov and pieza:
        mid = mov["id"] if hasattr(mov, "keys") else mov[0]
        otra = con.execute("SELECT 1 FROM analisis WHERE movimiento_id=? AND fuente=? AND pieza IS NOT NULL AND pieza<>?",
                           (mid, registro.get("fuente_id"), pieza)).fetchone()
        if otra:
            mov = None                                # misma numeración, pero otra pieza de la misma fuente
    if mov:
        mov_id = mov["id"] if hasattr(mov, "keys") else mov[0]
        if mtit:
            con.execute("UPDATE movimientos SET titulo=COALESCE(titulo, ?) WHERE id=?", (mtit, mov_id))
    else:
        mov_id = f"{obra_id}#{num or slug(mtit or 'unico')[:40]}"
        if con.execute("SELECT 1 FROM movimientos WHERE id=?", (mov_id,)).fetchone() and pieza:
            mov_id = f"{obra_id}#{num or ''}-{slug(pieza)[:40]}".replace("#-", "#")
        k = 1
        while con.execute("SELECT 1 FROM movimientos WHERE id=?", (mov_id,)).fetchone():
            k += 1; mov_id = f"{obra_id}#{num or slug(mtit or 'unico')[:40]}-{k}"
        con.execute("INSERT INTO movimientos (id, obra_id, numero, titulo) VALUES (?,?,?,?)", (mov_id, obra_id, num, mtit))
    if registro.get("ids_externos"):
        prev = con.execute("SELECT ids_externos FROM movimientos WHERE id=?", (mov_id,)).fetchone()[0]
        s = set(json.loads(prev)) if prev else set()
        s.update(registro["ids_externos"])
        con.execute("UPDATE movimientos SET ids_externos=? WHERE id=?", (json.dumps(sorted(s)), mov_id))
    return obra_id, mov_id, estado, cands

# ---------------------------------------------------------------- revisión manual
def confirmar(con, cand_id):
    """Fusiona la obra provisional con la candidata. Los análisis se conservan íntegros."""
    c = con.execute("SELECT * FROM candidatos_duplicado WHERE id=?", (cand_id,)).fetchone()
    if not c or c["estado"] != "pendiente":
        return False
    origen, destino = c["obra_id"], c["obra_candidata"]
    for m in con.execute("SELECT * FROM movimientos WHERE obra_id=?", (origen,)).fetchall():
        igual = None
        if m["numero"]:
            igual = con.execute("SELECT id FROM movimientos WHERE obra_id=? AND numero=?", (destino, m["numero"])).fetchone()
        if igual:
            con.execute("UPDATE analisis SET movimiento_id=? WHERE movimiento_id=?", (igual[0], m["id"]))
            con.execute("UPDATE movimientos SET partitura=COALESCE(partitura, ?), partitura_origen=COALESCE(partitura_origen, ?) WHERE id=?",
                        (m["partitura"], m["partitura_origen"], igual[0]))
            con.execute("DELETE FROM movimientos WHERE id=?", (m["id"],))
        else:
            con.execute("UPDATE movimientos SET obra_id=? WHERE id=?", (destino, m["id"]))
    t = con.execute("SELECT titulo FROM obras WHERE id=?", (origen,)).fetchone()[0]
    con.execute("INSERT OR IGNORE INTO titulos_alternativos VALUES (?,?,?)", (destino, t, "fusión manual"))
    for (k,) in con.execute("SELECT clave FROM catalogos WHERE obra_id=?", (origen,)).fetchall():
        con.execute("INSERT OR IGNORE INTO catalogos VALUES (?,?)", (destino, k))
    con.execute("UPDATE candidatos_duplicado SET estado='confirmado', resuelto_en=datetime('now') WHERE id=?", (cand_id,))
    con.execute("UPDATE candidatos_duplicado SET estado='descartado', resuelto_en=datetime('now') WHERE obra_id=? AND id<>? AND estado='pendiente'", (origen, cand_id))
    con.execute("DELETE FROM obras WHERE id=?", (origen,))
    return True

def descartar(con, cand_id):
    return con.execute("UPDATE candidatos_duplicado SET estado='descartado', resuelto_en=datetime('now') WHERE id=? AND estado='pendiente'", (cand_id,)).rowcount > 0
