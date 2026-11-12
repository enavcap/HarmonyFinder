"""Supertónica elevada (#ii) y superdominante elevada (#vi): acordes alterados sobre grados elevados."""
import pytest

pytest.importorskip("music21")
import buscar
from herramientas.recalcular_concepto import derivar


def seq(*cifs, tono="C"):
    return [derivar(i + 1, 1.0, tono, c, 0) for i, c in enumerate(cifs)]


def idx(det, ac):
    return [i for i, _, _ in det(ac)]


@pytest.mark.parametrize("cif", ["#iio7", "#iio65", "#ii", "#iio"])
def test_supertonica_elevada_en_mayor(cif):
    assert idx(buscar.supertonica_elevada, seq("I", cif, "I6")) == [1]


def test_supertonica_elevada_en_menor():
    assert idx(buscar.supertonica_elevada, seq("i", "#iio7", "i6", tono="a")) == [1]


@pytest.mark.parametrize("cif", ["#vio7", "#vio", "#vio65"])
def test_superdominante_elevada_en_mayor(cif):
    assert idx(buscar.superdominante_elevada, seq("I", cif, "V7")) == [1]


def test_en_menor_el_vi_elevado_es_diatonico():
    """En menor, #vi es el 6.º grado ascendente (escala melódica), no un acorde alterado."""
    assert buscar.superdominante_elevada(seq("i", "#vio", "V", tono="a")) == []
    assert buscar.superdominante_elevada(seq("i", "#viø7", "V", tono="a")) == []


def test_no_incluye_secundarias_ni_grados_diatonicos():
    ac = seq("I", "#iio7/V", "ii", "vi", "#viio7/iii", "iii")
    assert buscar.supertonica_elevada(ac) == []
    assert buscar.superdominante_elevada(ac) == []
