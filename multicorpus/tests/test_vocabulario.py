"""Vocabulario bilingüe: cada búsqueda debe llevar a la misma clave en español y en inglés."""
import unicodedata
from multicorpus import vocabulario as V, buscar_mc
import buscar

def _n(t):
    t = unicodedata.normalize("NFD", t.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")

def _interpretar(texto):
    """Misma regla que el buscador de la web (sinónimos de los dos idiomas, conceptos compuestos)."""
    t = _n(texto)
    puntos = {}
    for k, sins in buscar_mc.sinonimos().items():
        req = V.REQUIERE.get(k)
        if req and not all(any(_n(x) in t for x in g) for g in req):
            continue
        enc = {_n(s) for s in sins if _n(s) in f" {t} " or (len(s) > 3 and _n(s) in t)}
        if not enc:
            continue
        unicos = [s for s in enc if not any(s != o and s in o for o in enc)]
        puntos[k] = sum(len(s) for s in unicos)
    return max(puntos, key=puntos.get) if puntos else None

def test_cada_concepto_del_buscador_esta_en_el_vocabulario():
    assert set(buscar_mc.conceptos()) == set(V.CONCEPTOS)
    assert "acorde_vecino_cromatico" not in V.CONCEPTOS

def test_cada_termino_tiene_los_dos_idiomas():
    for tabla in (V.CONCEPTOS, V.FACETAS, V.GRUPOS, V.PERIODOS, V.FORMA):
        for k, v in tabla.items():
            assert v["es"] and v["en"], k

def test_nombre_en_cualquier_idioma_lleva_a_su_clave():
    for k, v in V.CONCEPTOS.items():
        assert _interpretar(v["es"]) == k, (k, v["es"])
        assert _interpretar(v["en"]) == k, (k, v["en"])

def test_decisiones_de_terminologia():
    rota = V.sinonimos_concepto("cadencia_rota")
    assert "cadencia evitada" not in rota and "cadencia evitada" not in buscar.SINONIMOS["cadencia_rota"]
    assert _interpretar("cadencia perfecta") == "cadencia_autentica_perfecta"
    assert _interpretar("cadencia imperfecta") == "cadencia_autentica_imperfecta"
    # falso amigo: en inglés británico «imperfect cadence» es la semicadencia
    assert _interpretar("imperfect cadence") == "semicadencia"
    assert V.FORMA["primer_grupo"]["es"] == "primer grupo temático"

def test_siglas_de_la_teoria_de_la_sonata():
    assert {V.FORMA[k]["siglas"][0] for k in ("primer_grupo", "transicion", "segundo_grupo", "zona_conclusiva")} == {"p", "tr", "s", "c"}
