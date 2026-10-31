"""Tipos de cuatríada a partir del cifrado (buscar_mc.tipo_cuatriada)."""
import pytest

pytest.importorskip("music21")
from multicorpus.buscar_mc import tipo_cuatriada


@pytest.mark.parametrize("cif, tono, tipo", [
    ("V7", "C", "septima_de_dominante"),
    ("V65/V", "C", "septima_de_dominante"),
    ("V7[no5]", "C", "septima_de_dominante"),       # incompleta: sigue siendo de dominante
    ("viio7", "a", "septima_disminuida"),
    ("viio43/V", "C", "septima_disminuida"),
    ("viiø7", "C", "septima_semidisminuida"),
    ("iiø65", "a", "septima_semidisminuida"),
    ("ii7", "C", "septima_menor"),
    ("vi7", "C", "septima_menor"),
    ("IM7", "C", "septima_mayor"),
    ("IV7", "C", "septima_mayor"),                  # IV7 en mayor suena con 7ª mayor
])
def test_tipos(cif, tono, tipo):
    assert tipo_cuatriada(cif, tono) == tipo


@pytest.mark.parametrize("cif, tono", [
    ("V", "C"), ("ii6", "C"),                       # tríadas
    ("Ger65", "a"), ("Fr43", "a"), ("It6", "a"),    # sextas aumentadas
    ("V7[no3][add4]", "C"),                         # retardo
    ("V9", "C"),                                    # cinco sonidos
    ("V+7", "C"),                                   # aumentada con 7ª menor: no es ninguno de los cinco
])
def test_fuera(cif, tono):
    assert tipo_cuatriada(cif, tono) is None
