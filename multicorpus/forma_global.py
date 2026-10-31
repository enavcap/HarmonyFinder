"""
Forma global de cada movimiento (forma sonata, rondó, minueto con trío, tema con variaciones…).

Solo se asigna una forma cuando hay una fuente que la diga; si no, el movimiento queda sin forma
(no se adivina). Por orden de prioridad:

  1. revisión   asignada a mano (multicorpus/formas_revisadas.tsv: movimiento → forma)
  2. Taking Form   deducida de sus secciones (exposición + desarrollo/reexposición → forma sonata, …)
  3. BPSD / MEPC   datasets de análisis experto:
       BPSD   estructura de los primeros movimientos de las 32 sonatas para piano de Beethoven
              (Zeitler et al., TISMIR 7, 2024, tabla 3; CC BY 4.0)
       MEPC   Mozart Expositional Punctuation Corpus: todos los movimientos instrumentales de Mozart en
              forma sonata-allegro, con el inicio y la longitud de la exposición (Rom, Raz y Chawin,
              Empirical Musicology Review 16, 2021; CC0; github.com/corpusTAU/The-Mozart-Expositional-Punctuation-Corpus).
              Deja fuera a propósito los movimientos lentos y los rondós-sonata: no estar en él no
              significa no ser forma sonata.
  4. título     el título del movimiento lo dice («Menuetto and Trio», «Rondo: Allegretto», «Fuga»…)
  5. colección  el género de la colección lo fija (corales de Bach, danzas de las suites, sonatas de Scarlatti)

También da la numeración tradicional de las sonatas para piano de Beethoven y Mozart y de los
cuartetos de Beethoven («Sonata n.º 8»), para buscarlas por número.
"""
import csv, re
from pathlib import Path

# ------------------------------------------------------------------ 2. Taking Form
def desde_secciones(secciones):
    """Forma global a partir de la sucesión de secciones de Taking Form (claves de vocabulario.FORMA)."""
    s = [x for x in secciones if x]
    if not s:
        return None
    if "exposicion" in s and ("desarrollo" in s or "reexposicion" in s):
        return "forma_sonata"
    if "tema" in s and "variacion" in s:
        return "tema_variaciones"
    if "trio" in s and "scherzo" in s:
        return "scherzo_trio"
    if "trio" in s and "minueto" in s:
        return "minueto_trio"
    letras = [x[-1] for x in s if x.startswith("seccion_")]
    seguidas = [l for i, l in enumerate(letras) if i == 0 or l != letras[i - 1]]
    if seguidas.count("a") >= 3 and len(set(seguidas)) >= 3:
        return "rondo"
    if seguidas[:3] == ["a", "b", "a"] and len(set(seguidas)) == 2:
        return "ternaria"
    if s == ["fuga"]:
        return "fuga"
    return None

# ------------------------------------------------------------------ 3. título del movimiento
REGLAS_TITULO = [
    (r"\brond[oòó]\b|\brondeaux?\b|\brondo\b", "rondo"),
    (r"\bvaria(t|z)|\bthema\b|\btema con\b|\bair\b.*vari", "tema_variaciones"),   # «Minuetto con variazione»
    (r"\bscherzo\b", "scherzo_trio"),          # no «scherzoso», «scherzando»
    (r"\b(menuetto|minuetto|minuet|menuet)\b(?!.*\btempo di)", "minueto_trio"),
    (r"\bfug(a|e|ue)\b|\bfughetta\b", "fuga"),
]
DANZAS = r"\b(allemande|allemanda|courante|corrente|sarabande|sarabanda|gigue|giga|gavotte|gavotta|bourr[ée]e|passepied|loure|menuet|minuet|polonaise|double)\b"

def desde_titulo(titulo):
    t = (titulo or "").lower()
    if re.search(r"tempo di m[ei]n?uett", t):
        return None                          # carácter de minueto, no forma
    for patron, forma in REGLAS_TITULO:
        if re.search(patron, t):
            return forma
    return None

# ------------------------------------------------------------------ 4. colección
def desde_coleccion(fuente, subcorpus, compositor, titulo):
    t = (titulo or "").lower()
    if subcorpus == "scarlatti_sonatas":
        return "binaria"                     # las sonatas de Scarlatti son bipartitas
    if subcorpus in ("bach_en_fr_suites", "bach_solo", "couperin_clavecin", "couperin_concerts", "handel_keyboard") \
       and re.search(DANZAS, t) and not re.search(r"prelud|fug|ouvert|chaconn|ciaccon", t):
        return "binaria"                     # danzas de suite
    if fuente == "wir" and subcorpus == "Early_Choral" and "Bach" in (compositor or ""):
        return "coral"
    return None

# ------------------------------------------------------------------ numeración tradicional
BEETHOVEN_SONATAS = ["Op. 2 No. 1", "Op. 2 No. 2", "Op. 2 No. 3", "Op. 7", "Op. 10 No. 1", "Op. 10 No. 2", "Op. 10 No. 3",
                     "Op. 13", "Op. 14 No. 1", "Op. 14 No. 2", "Op. 22", "Op. 26", "Op. 27 No. 1", "Op. 27 No. 2", "Op. 28",
                     "Op. 31 No. 1", "Op. 31 No. 2", "Op. 31 No. 3", "Op. 49 No. 1", "Op. 49 No. 2", "Op. 53", "Op. 54",
                     "Op. 57", "Op. 78", "Op. 79", "Op. 81a", "Op. 90", "Op. 101", "Op. 106", "Op. 109", "Op. 110", "Op. 111"]
BEETHOVEN_CUARTETOS = {"Op. 18 No. 1": 1, "Op. 18 No. 2": 2, "Op. 18 No. 3": 3, "Op. 18 No. 4": 4, "Op. 18 No. 5": 5,
                       "Op. 18 No. 6": 6, "Op. 59 No. 1": 7, "Op. 59 No. 2": 8, "Op. 59 No. 3": 9, "Op. 74": 10, "Op. 95": 11,
                       "Op. 127": 12, "Op. 130": 13, "Op. 131": 14, "Op. 132": 15, "Op. 135": 16}
MOZART_SONATAS = {279: 1, 280: 2, 281: 3, 282: 4, 283: 5, 284: 6, 309: 7, 310: 8, 311: 9, 330: 10, 331: 11, 332: 12,
                  333: 13, 457: 14, 533: 15, 545: 16, 570: 17, 576: 18}

def _op(cat):
    m = re.match(r"Op\.\s*(\d+a?)(?:\s*No\.\s*(\d+))?", cat or "")
    return f"Op. {m.group(1)}" + (f" No. {m.group(2)}" if m.group(2) else "") if m else None

def numero(compositor, titulo_obra, catalogo):
    """Número tradicional de la obra (sonata o cuarteto), o None."""
    t = titulo_obra or ""
    if "Beethoven" in (compositor or ""):
        op = _op(catalogo)
        if op and "Sonata para piano" in t and op in BEETHOVEN_SONATAS:
            return BEETHOVEN_SONATAS.index(op) + 1
        if op and "Cuarteto de cuerda" in t:
            return BEETHOVEN_CUARTETOS.get(op)
    if "Mozart" in (compositor or "") and "Sonata para piano" in t:
        m = re.search(r"K\.?\s*(\d+)", catalogo or t)
        return MOZART_SONATAS.get(int(m.group(1))) if m else None
    return None

# ------------------------------------------------------------------ 3. datasets de análisis experto
# BPSD, tabla 3: estructura del primer movimiento de cada sonata, en el orden de BEETHOVEN_SONATAS.
# E exposición, D desarrollo, R reexposición, C coda, I introducción, T tema, V variación; las demás
# (Op. 27, Op. 54) no son formas de la lista y se quedan sin forma.
BPSD_PRIMEROS = ["E-E-D-R", "E-E-D-R", "E-E-D-R-C", "E-E-D-R-C", "E-E-D-R", "E-E-D-R", "E-E-D-R-C", "I-E-E-D-R-C",
                 "E-E-D-R-C", "E-E-D-R-C", "E-E-D-R", "T-V1-V2-V3-V4-V5", "An-Al-T1", "P1-P2-P3-C", "E-E-D-R-C",
                 "E-E-D-R-C", "E-E-D-R-C", "E-E-D-R-C", "E-E-D-R-C", "E-E-D-R", "E-E-D-R-C", "M1-Tr1-M2-Tr2-M3-C",
                 "E-D-R-C", "I-E-E-D-R-D-R", "E-E-D-R-D-R-C", "I-E-E-D-R-C", "E-D-R-C", "E-D-R-C", "E-E-D-R-C",
                 "E-D-R-C", "E-D-R-C", "I-E-E-D-R-C"]

def desde_bpsd(estructura):
    p = (estructura or "").split("-")
    if "E" in p and "D" in p and "R" in p:
        return "forma_sonata"
    if p and p[0] == "T" and all(re.fullmatch(r"V\d+", x) for x in p[1:]) and len(p) > 1:
        return "tema_variaciones"
    return None

def mepc(ruta):
    """{(número Köchel, movimiento): (compás inicial, compases) de la exposición} del Mozart Expositional
    Punctuation Corpus (dataset.tsv)."""
    out = {}
    if not ruta or not Path(ruta).exists():
        return out
    romanos = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}
    for r in csv.DictReader(open(ruta, encoding="latin-1"), delimiter="\t"):   # el TSV mezcla codificaciones
        k = re.match(r"\d+", r.get("k") or "")
        mv = romanos.get((r.get("mov") or "").strip())
        if k and mv and r.get("exp_beg", "").isdigit() and r.get("exp_len", "").isdigit():
            out.setdefault((int(k.group()), mv), (int(r["exp_beg"]), int(r["exp_len"])))
    return out

def secciones_mepc(ini, longitud):
    """Secciones (formato de forma.json) que se saben por el MEPC: solo la exposición."""
    return [[0 if ini == 1 else ini, 0.0 if ini == 1 else 1.0, "exposicion", None], [ini + longitud, 1.0, None, None]]

def experta(compositor, titulo_obra, catalogo, mv, datos_mepc=None):
    """(forma, fuente) según BPSD o MEPC, o (None, None)."""
    t = titulo_obra or ""
    if "Sonata para piano" not in t or not mv:
        return None, None
    if "Beethoven" in (compositor or "") and mv == 1:
        op = _op(catalogo)
        if op in BEETHOVEN_SONATAS:
            f = desde_bpsd(BPSD_PRIMEROS[BEETHOVEN_SONATAS.index(op)])
            if f:
                return f, "BPSD"
    if "Mozart" in (compositor or "") and datos_mepc:
        m = re.search(r"K\.?\s*(\d+)", catalogo or t)
        if m and (int(m.group(1)), mv) in datos_mepc:
            return "forma_sonata", "MEPC"
    return None, None

# ------------------------------------------------------------------ títulos de movimiento del DCML (Beethoven y Mozart)
def titulos_dcml(meta_beethoven=None, meta_mozart=None):
    """Títulos de movimiento del DCML («Menuetto and Trio: Allegretto», «Rondo. Allegro»…), por
    (compositor, número de sonata, movimiento), a partir de sus metadata.tsv."""
    out = {}
    for ruta, comp, patron in ((meta_beethoven, "Beethoven", r"(\d+)-(\d+)$"), (meta_mozart, "Mozart", r"K(\d+)-(\d+)$")):
        if not ruta or not Path(ruta).exists():
            continue
        for r in csv.DictReader(open(ruta, encoding="utf-8"), delimiter="\t"):
            m = re.match(patron, r["piece"])
            if not m:
                continue
            n = int(m.group(1)) if comp == "Beethoven" else MOZART_SONATAS.get(int(m.group(1)))
            if n:
                out[(comp, n, int(m.group(2)))] = r.get("movementTitle") or ""
    return out

def revisadas(ruta):
    """{clave de movimiento: forma} de la revisión manual (TSV: movimiento, forma)."""
    out = {}
    if ruta and Path(ruta).exists():
        for r in csv.reader(open(ruta, encoding="utf-8"), delimiter="\t"):
            if len(r) >= 2 and r[0] and not r[0].startswith("#"):
                out[r[0].strip()] = r[1].strip() or None
    return out

def asignar(mov, secciones_tf=None, titulo_extra=None, revision=None, experto=None):
    """(forma, fuente) de un movimiento. mov: dict con fuente, subcorpus, compositor, titulo (de la entrada),
    clave (para la revisión). experto: (forma, fuente) de experta()."""
    if revision and mov.get("clave") in revision:
        return revision[mov["clave"]], "revisión"
    if secciones_tf:
        f = desde_secciones(secciones_tf)
        if f:
            return f, "Taking Form"
    if experto and experto[0]:
        return tuple(experto)
    col = desde_coleccion(mov.get("fuente"), mov.get("subcorpus"), mov.get("compositor"), mov.get("titulo"))
    for t in (titulo_extra, mov.get("titulo")):
        f = desde_titulo(t)
        if f and not (col == "binaria" and f == "minueto_trio"):   # en una suite, el minueto es una danza binaria
            return f, "título"
    if col:
        return col, "colección"
    return None, None
