"""
Motor de búsqueda sobre el catálogo multicorpus.

Reutiliza los detectores de `buscar.py` (que trabajan sobre una lista de acordes con campos
normalizados) y añade:
  · cadencias como finales de frase (cadencias.py): además del cifrado miran la partitura
    (parte fuerte, duración, tiple, bajo); sustituyen a las de buscar.py
  · acordes disminuidos, quinta aumentada, sexta añadida,
    secuencia de quintas descendentes — reglas sobre el cifrado (derivadas)

Cada concepto declara su `tipo` ('derivado') y su `criterio`.
"""
import re, sqlite3, sys
from functools import lru_cache
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
import buscar                                            # detectores existentes
from . import cadencias                                  # cadencias con rasgos de partitura
from . import vocabulario                                # nombres y sinónimos en español e inglés

DB = RAIZ / "datos" / "catalogo.sqlite"
DATOS = RAIZ / "datos"

def conectar(db=DB):
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    return con

# --- partituras: los detectores que miran la grafía real usan el movimiento del análisis
_CON = None
def _con():
    global _CON
    if _CON is None:
        _CON = conectar()
    return _CON

@lru_cache(maxsize=512)
def _partitura_analisis(aid):
    r = _con().execute("SELECT m.partitura FROM analisis a JOIN movimientos m ON m.id=a.movimiento_id WHERE a.id=?", (aid,)).fetchone()
    if not r or not r[0] or not (DATOS / r[0]).exists():
        return None
    from music21 import converter
    try:
        return converter.parse(str(DATOS / r[0]))
    except Exception:
        return None
buscar._partitura = _partitura_analisis

def acordes(con, aid):
    """Acordes del análisis en el formato de los detectores; las marcas de cadencia sin acorde
    se asignan al acorde anterior."""
    return acordes_de_filas(con.execute("SELECT * FROM anotaciones WHERE analisis_id=? ORDER BY pos", (aid,)), aid)

def acordes_de_filas(filas, aid):
    """Igual que `acordes`, a partir de las filas de anotación (de la base o de un adaptador)."""
    out = []
    for r in filas:
        if r["tipo"] == "marca":
            if out and r["cadencia"] and not out[-1]["cadencia"]:
                out[-1]["cadencia"] = r["cadencia"]
            continue
        if not r["cifrado"] or not r["tono"]:
            continue
        d = dict(r)
        d["obra"] = aid
        d["cambio_tono"] = 1 if out and out[-1]["tono"] != d["tono"] else 0
        out.append(d)
    return out

# ---------------------------------------------------------------- detectores nuevos
def acorde_disminuido(ac):
    """Tríada o cuatríada disminuida diatónica (no secundaria) según el cifrado."""
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac) if a["calidad"] == "diminished" and not a["secundaria"]]

def quinta_aumentada(ac):
    """Acorde aumentado (calidad «+» en el cifrado)."""
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac) if a["calidad"] == "augmented" or "+" in a["cifrado"].split("/")[0][:5]]

def sexta_anadida(ac):
    """Sexta añadida explícita en el cifrado ([add6] en RomanText, +6 en los cambios del DCML)."""
    return [(i, a["cifrado"] + (f' ({a["cambios"]})' if a.get("cambios") else ""), 1) for i, a in enumerate(ac)
            if "[add6]" in a["cifrado"] or "+6" in (a.get("cambios") or "")]

@lru_cache(maxsize=None)
def _raiz(cif, tono):
    try:
        return buscar._rn(cif, tono).root().pitchClass
    except Exception:
        return None

def secuencia_quintas(ac):
    """≥4 acordes seguidos cuyas fundamentales descienden por quintas (círculo de quintas)."""
    out, i = [], 0
    while i < len(ac) - 3:
        j = i
        while j + 1 < len(ac):
            r1, r2 = _raiz(ac[j]["cifrado"], ac[j]["tono"]), _raiz(ac[j + 1]["cifrado"], ac[j + 1]["tono"])
            if r1 is None or r2 is None or (r1 - r2) % 12 != 7:
                break
            j += 1
        if j - i + 1 >= 4:
            out.append((i, " → ".join(x["cifrado"] for x in ac[i:j + 1]), j - i + 1)); i = j
        else:
            i += 1
    return out

# --- tipos de cuatríada: intervalos sobre la fundamental (clases de altura) de los acordes de séptima
CUATRIADAS = {
    (0, 4, 7, 10): "septima_de_dominante",      # mayor con 7ª menor
    (0, 3, 6, 9): "septima_disminuida",         # tres terceras menores
    (0, 3, 6, 10): "septima_semidisminuida",    # disminuida con 7ª menor
    (0, 3, 7, 10): "septima_menor",             # menor con 7ª menor
    (0, 4, 7, 11): "septima_mayor",             # mayor con 7ª mayor
}

@lru_cache(maxsize=None)
def tipo_cuatriada(cif, tono):
    """Tipo de cuatríada del acorde según el cifrado, o None.

    Cuenta lo que suena: un IV7 en menor melódico es de dominante. Quedan fuera las sextas aumentadas
    (It/Fr/Ger, aunque la alemana suene como una séptima de dominante), los acordes con notas añadidas
    ([add…]: retardos, apoyaturas, novenas) y los que no tienen cuatro sonidos distintos. Las notas
    omitidas ([no5], [no3]) no cambian el tipo: un V7 sin quinta sigue siendo séptima de dominante."""
    if not cif or "[add" in cif or cif.lstrip("#b")[:2] in ("It", "Fr", "Ge"):
        return None
    base = re.sub(r"\[no\d+\]", "", cif)
    try:
        rn = buscar._rn(base, tono)
        r = rn.root().pitchClass
        s = tuple(sorted({(p.pitchClass - r) % 12 for p in rn.pitches}))
    except Exception:
        return None
    return CUATRIADAS.get(s)

def _cuatriada(clave, doc):
    def det(ac):
        return [(i, a["cifrado"], 1) for i, a in enumerate(ac) if tipo_cuatriada(a["cifrado"], a["tono"]) == clave]
    det.__doc__ = doc
    det.__name__ = clave
    return det

septima_de_dominante = _cuatriada("septima_de_dominante", "Cuatríada mayor con 7ª menor según el cifrado: V7 y V7/x, y cualquier grado con ese sonido (sin sextas aumentadas ni notas añadidas).")
septima_disminuida = _cuatriada("septima_disminuida", "Cuatríada de tres terceras menores según el cifrado: viiº7 diatónica o secundaria (viiº7/x).")
septima_semidisminuida = _cuatriada("septima_semidisminuida", "Cuatríada disminuida con 7ª menor según el cifrado: viiø7, iiø7 (también secundaria).")
septima_menor = _cuatriada("septima_menor", "Cuatríada menor con 7ª menor según el cifrado: ii7, vi7, iv7, i7…")
septima_mayor = _cuatriada("septima_mayor", "Cuatríada mayor con 7ª mayor según el cifrado: IM7, IVM7, VIM7…")

NUEVOS = {
    "cadencia_autentica_perfecta": (cadencias.cadencia_autentica_perfecta, "V → I al final de frase, tónica en el tiple", "derivado"),
    "cadencia_autentica_imperfecta": (cadencias.cadencia_autentica_imperfecta, "V → I al final de frase, 3.º o 5.º en el tiple", "derivado"),
    "semicadencia": (cadencias.semicadencia, "llegada a V al final de frase", "derivado"),
    "cadencia_rota": (cadencias.cadencia_rota, "V → VI al final de frase", "derivado"),
    "cadencia_frigia": (cadencias.cadencia_frigia, "iv6 → V en menor, bajo 6.º → 5.º", "derivado"),
    "cadencia_plagal": (cadencias.cadencia_plagal, "IV → I al final de frase", "derivado"),
    "sexta_cuarta_cadencial": (cadencias.sexta_cuarta_cadencial, "I64 → V → I al final de frase", "derivado"),
    "tercera_picardia": (cadencias.tercera_picardia, "V → I mayor final en tonalidad menor", "derivado"),
    "acorde_disminuido": (acorde_disminuido, "tríadas y séptimas disminuidas diatónicas", "derivado"),
    "quinta_aumentada": (quinta_aumentada, "acordes aumentados (III+, V+…)", "derivado"),
    "sexta_anadida": (sexta_anadida, "acorde con sexta añadida ([add6] / +6)", "derivado"),
    "secuencia_quintas": (secuencia_quintas, "≥4 fundamentales descendiendo por quintas", "derivado"),
    "septima_de_dominante": (septima_de_dominante, "mayor con 7ª menor: V7, V7/x…", "derivado"),
    "septima_disminuida": (septima_disminuida, "tres terceras menores: viiº7, viiº7/x", "derivado"),
    "septima_semidisminuida": (septima_semidisminuida, "disminuida con 7ª menor: viiø7, iiø7…", "derivado"),
    "septima_menor": (septima_menor, "menor con 7ª menor: ii7, vi7, iv7…", "derivado"),
    "septima_mayor": (septima_mayor, "mayor con 7ª mayor: IM7, IVM7, VIM7…", "derivado"),
}
SINONIMOS_NUEVOS = {
    "cadencia_autentica_imperfecta": ["cadencia imperfecta", "cadencia autentica imperfecta", "imperfecta"],
    "acorde_disminuido": ["acorde disminuido", "acordes disminuidos", "disminuido", "triada disminuida"],
    "quinta_aumentada": ["quinta aumentada", "acorde aumentado", "triada aumentada", "aumentado"],
    "sexta_anadida": ["sexta anadida", "sexta añadida", "sixte ajoutee", "add6"],
    "secuencia_quintas": ["secuencia", "secuencias", "secuencia de quintas", "circulo de quintas", "progresion de quintas", "quintas descendentes"],
}

def conceptos():
    """{clave: (detector, descripción, tipo)} — existentes (derivados) + nuevos, solo los del vocabulario
    canónico (vocabulario.py), con su descripción en español."""
    d = {k: (f, desc, "derivado") for k, (f, desc) in buscar.CONCEPTOS.items()}
    d.update(NUEVOS)
    return {k: (f, vocabulario.CONCEPTOS[k]["desc_es"], t) for k, (f, _, t) in d.items() if k in vocabulario.CONCEPTOS}

def sinonimos():
    """Sinónimos de cada concepto en español e inglés (el buscador acepta los dos idiomas)."""
    return {k: vocabulario.sinonimos_concepto(k) for k in vocabulario.CONCEPTOS}
