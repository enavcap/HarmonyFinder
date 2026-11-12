"""Desfases de numeración de compases entre un análisis y su partitura (desfases_compases.json)."""
import json
from multicorpus import correcciones
from multicorpus.adaptadores.wir import AdaptadorWiR

OP50 = "Keyboard_Other/Chopin,_Frédéric/Mazurkas/BI145-1/analysis_DT.txt"


def test_tabla_bien_formada():
    t = json.loads(correcciones.DESFASES.read_text(encoding="utf-8"))
    for k, v in t.items():
        if k.startswith("_"):
            continue
        assert isinstance(v[0], int) and v[0] != 0 and v[1], k


def test_desfase_de_un_analisis():
    assert correcciones.desfase(OP50) == -1
    assert correcciones.desfase("Keyboard_Other/Otro/analysis.txt") == 0


def test_el_adaptador_desplaza_los_compases():
    filas = [{"compas": 1, "cifrado": "V7"}, {"compas": 4, "cifrado": "#iio2"}, {"compas": None, "cifrado": "x"}]
    assert [f["compas"] for f in AdaptadorWiR._desplazar(filas, OP50)] == [0, 3, None]
    assert AdaptadorWiR._desplazar(filas, "Keyboard_Other/Otro/analysis.txt") is filas
