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
import sqlite3, sys
from functools import lru_cache
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
import buscar                                            # detectores existentes
from . import cadencias                                  # cadencias con rasgos de partitura

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

NUEVOS = {
    "cadencia_autentica_perfecta": (cadencias.cadencia_autentica_perfecta, "V → I al final de frase, tónica en el tiple", "derivado"),
    "cadencia_autentica_imperfecta": (cadencias.cadencia_autentica_imperfecta, "V → I al final de frase, 3.º o 5.º en el tiple", "derivado"),
    "semicadencia": (cadencias.semicadencia, "llegada a V al final de frase", "derivado"),
    "cadencia_rota": (cadencias.cadencia_rota, "V → VI al final de frase", "derivado"),
    "cadencia_frigia": (cadencias.cadencia_frigia, "iv6 → V en menor, bajo 6.º → 5.º", "derivado"),
    "cadencia_plagal": (cadencias.cadencia_plagal, "IV → I al final de frase", "derivado"),
    "acorde_disminuido": (acorde_disminuido, "tríadas y séptimas disminuidas diatónicas", "derivado"),
    "quinta_aumentada": (quinta_aumentada, "acordes aumentados (III+, V+…)", "derivado"),
    "sexta_anadida": (sexta_anadida, "acorde con sexta añadida ([add6] / +6)", "derivado"),
    "secuencia_quintas": (secuencia_quintas, "≥4 fundamentales descendiendo por quintas", "derivado"),
}
SINONIMOS_NUEVOS = {
    "cadencia_autentica_imperfecta": ["cadencia imperfecta", "cadencia autentica imperfecta", "imperfecta"],
    "acorde_disminuido": ["acorde disminuido", "acordes disminuidos", "disminuido", "triada disminuida"],
    "quinta_aumentada": ["quinta aumentada", "acorde aumentado", "triada aumentada", "aumentado"],
    "sexta_anadida": ["sexta anadida", "sexta añadida", "sixte ajoutee", "add6"],
    "secuencia_quintas": ["secuencia", "secuencias", "secuencia de quintas", "circulo de quintas", "progresion de quintas", "quintas descendentes"],
}

def conceptos():
    """{clave: (detector, descripción, tipo)} — existentes (derivados) + nuevos."""
    d = {k: (f, desc, "derivado") for k, (f, desc) in buscar.CONCEPTOS.items()}
    d.update(NUEVOS)
    return d

def sinonimos():
    s = dict(buscar.SINONIMOS); s.update(SINONIMOS_NUEVOS); return s
