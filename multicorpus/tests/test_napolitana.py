"""Sexta napolitana (♭II6) y ♭II en estado fundamental: conceptos separados, y su paso a la dominante."""
import pytest

pytest.importorskip("music21")
import buscar
from herramientas.recalcular_concepto import derivar


def seq(*cifs, tono="c"):
    return [derivar(i + 1, 1.0, tono, c, 0) for i, c in enumerate(cifs)]


@pytest.mark.parametrize("cif", ["N6", "bII6"])
def test_sexta_napolitana(cif):
    ac = seq("i", cif, "V")
    assert [i for i, _, _ in buscar.sexta_napolitana(ac)] == [1]
    assert buscar.bii_fundamental(ac) == []
    assert [i for i, _, _ in buscar.napolitana(ac)] == [1]


def test_bii_fundamental_no_es_sexta_napolitana():
    ac = seq("i", "bII", "V7", "i")
    assert [i for i, _, _ in buscar.bii_fundamental(ac)] == [1]
    assert buscar.sexta_napolitana(ac) == []
    assert [i for i, _, _ in buscar.napolitana(ac)] == [1]


def test_las_cuatriadas_y_las_segundas_inversiones_quedan_en_el_concepto_general():
    ac = seq("i", "bII7", "bII64", "V")
    assert buscar.sexta_napolitana(ac) == [] and buscar.bii_fundamental(ac) == []
    assert [i for i, _, _ in buscar.napolitana(ac)] == [1, 2]


def test_a_la_dominante_cada_origen_en_su_concepto():
    sexta = seq("i", "N6", "V", "i")
    fund = seq("i", "bII", "V7", "i")
    assert [i for i, _, _ in buscar.sexta_napolitana_a_dominante(sexta)] == [1]
    assert buscar.bii_fundamental_a_dominante(sexta) == []
    assert [i for i, _, _ in buscar.bii_fundamental_a_dominante(fund)] == [1]
    assert buscar.sexta_napolitana_a_dominante(fund) == []


def test_a_la_dominante_pasando_por_el_64_cadencial():
    ac = seq("i", "N6", "Cad64", "V", "i")
    assert [(i, n) for i, _, n in buscar.sexta_napolitana_a_dominante(ac)] == [(1, 3)]


def ctx(ac, i):
    return buscar.contexto_napolitana(ac, i)


def test_contexto_cadencial_si_prepara_la_dominante():
    assert ctx(seq("i", "N6", "V7", "i"), 1) == "c"
    assert ctx(seq("i", "N6", "Cad64", "V", "i"), 1) == "c"          # con el 6/4 cadencial entre medias
    assert ctx(seq("i", "bII", "V6", "i"), 1) == "c"
    assert ctx(seq("i", "N6", "V/V", "V"), 1) == "c"                 # también a través de la dominante de la dominante


def test_contexto_no_cadencial_si_no_llega_a_la_dominante():
    assert ctx(seq("i", "N6", "i"), 1) == "n"
    assert ctx(seq("i", "N6", "iv", "i", "V"), 1) == "n"            # la dominante queda lejos
    assert ctx(seq("i", "N6", "V/V", "i"), 1) == "n"


def test_la_napolitana_prolongada_se_mira_desde_su_ultimo_acorde():
    ac = seq("i", "N6", "N6", "N6", "V7", "i")
    assert [ctx(ac, i) for i in (1, 2, 3)] == ["c", "c", "c"]
    ac = seq("i", "N6", "N6", "i")
    assert [ctx(ac, i) for i in (1, 2)] == ["n", "n"]


def test_la_marca_va_en_el_octavo_campo_solo_si_el_concepto_la_tiene():
    from multicorpus import unisonos
    seg = [dict(compas=c, parte=1.0, tono="c") for c in (1, 2)]
    assert unisonos.fila_hit(7, seg, 1, "N6", 1, "c")[7] == "c"
    assert len(unisonos.fila_hit(7, seg, 1, "N6", 1)) == 7
    assert set(buscar.CONTEXTO) == {"napolitana", "sexta_napolitana", "bii_fundamental"}
