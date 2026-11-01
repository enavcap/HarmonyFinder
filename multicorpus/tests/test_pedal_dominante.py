"""Pedal de dominante: debe sostenerse ≥2 compases y llevar armonías ajenas encima.
Un 6/4 cadencial con el bajo cambiando de octava no es una pedal."""
import pytest

pytest.importorskip("music21")
import buscar


def A(compas, parte, cifrado, bajo, grado, inversion=0, calidad="major", tono="f#", alteracion=0, secundaria=""):
    return dict(compas=compas, parte=parte, tono=tono, cifrado=cifrado, bajo=bajo, grado=grado,
                inversion=inversion, calidad=calidad, alteracion=alteracion, secundaria=secundaria)


def test_sexta_cuarta_cadencial_con_salto_de_octava_no_es_pedal():
    # cc. 133-134: Ger6 → I64 → V7 (bajo Do# baja la octava) → I
    ac = [
        A(133, 1, "Ger65", "D", 4, calidad="german-sixth", alteracion=1),
        A(133, 3, "i64", "C#", 1, inversion=2, calidad="minor"),
        A(133, 4, "V7", "C#", 5, calidad="dominant-seventh"),
        A(134, 1, "V7", "C#", 5, calidad="dominant-seventh"),
        A(134, 2, "I", "F#", 1, tono="F#"),
    ]
    assert buscar.pedal_de_dominante(ac) == []


def test_pedal_larga_con_armonias_ajenas():
    ac = [
        A(10, 1, "V", "C#", 5),
        A(10, 3, "i64", "C#", 1, inversion=2, calidad="minor"),
        A(11, 1, "iv64", "C#", 4, inversion=2, calidad="minor"),
        A(11, 3, "viio7/V", "C#", 7, calidad="diminished-seventh", secundaria="V"),
        A(12, 1, "V7", "C#", 5, calidad="dominant-seventh"),
        A(13, 1, "i", "F#", 1, calidad="minor"),
    ]
    hits = buscar.pedal_de_dominante(ac)
    assert len(hits) == 1 and hits[0][0] == 0 and hits[0][2] == 5


def test_pedal_corta_no_cuenta_aunque_tenga_armonias_ajenas():
    ac = [
        A(10, 1, "V", "C#", 5),
        A(10, 3, "iv64", "C#", 4, inversion=2, calidad="minor"),
        A(11, 1, "V7", "C#", 5, calidad="dominant-seventh"),
        A(11, 3, "i", "F#", 1, calidad="minor"),
    ]
    assert buscar.pedal_de_dominante(ac) == []


def test_dominante_prolongada_sin_armonias_ajenas_no_es_pedal():
    ac = [
        A(20, 1, "V", "C#", 5),
        A(21, 1, "V7", "C#", 5, calidad="dominant-seventh"),
        A(22, 1, "V", "C#", 5),
        A(23, 1, "i", "F#", 1, calidad="minor"),
    ]
    assert buscar.pedal_de_dominante(ac) == []


def _con_bajo_real(ac, bajos):
    for a, b in zip(ac, bajos):
        a["r"] = {"bajo": b}
    return ac


def test_tonicizacion_de_v_no_es_pedal():
    # Bach, Suite francesa n.º 5, Giga, cc. 4-6 (sol M): V – IV64/V – I/V. Suena V – I64 – V: sin armonías ajenas
    ac = [
        A(4, 1, "V", "D", 5, tono="G"),
        A(5, 1, "IV64/V", "D", 4, inversion=2, tono="G", secundaria="V"),
        A(5, 3, "I/V", "D", 1, tono="G", secundaria="V"),
        A(6, 1, "IV/V", "G", 4, tono="G", secundaria="V"),
    ]
    for a, p in zip(ac, ["2,6,9", "2,7,11", "2,6,9", "7,11,2"]):
        a["pcs"] = p
    assert buscar.pedal_de_dominante(ac) == []


def test_bajo_real_que_no_es_la_dominante_descarta_la_pedal():
    # el cifrado dice dominante en el bajo, pero en la partitura suena otra nota en casi todos los ataques
    base = lambda: [A(10, 1, "V", "C#", 5), A(10, 3, "i64", "C#", 1, inversion=2, calidad="minor"),
                    A(11, 1, "iv64", "C#", 4, inversion=2, calidad="minor"),
                    A(11, 3, "viio7/V", "C#", 7, calidad="diminished-seventh", secundaria="V"),
                    A(12, 1, "V7", "C#", 5, calidad="dominant-seventh"), A(13, 1, "i", "F#", 1, calidad="minor")]
    # partitura fiable (el bajo medido coincide con el cifrado en casi toda la obra) y pedal real: se detecta
    ok = _con_bajo_real(base(), [1, 1, 1, 1, 1, 6])
    assert len(buscar.pedal_de_dominante(ok)) == 1
    # bajo figurado: la dominante en 3 de 4 ataques de la pedal sigue contando
    fig = _con_bajo_real(base(), [1, 4, 1, 1, 1, 6])
    assert len(buscar.pedal_de_dominante(fig)) == 1
    # la dominante solo en 1 de 5 ataques: no hay pedal (aunque el cifrado la indique)
    contexto = [A(c, 1, "i", "F#", 1, calidad="minor") for c in range(-10, 10)]
    malo = _con_bajo_real(contexto + base(), [6] * 20 + [1, 8, 9, 4, 6, 6])
    assert buscar.pedal_de_dominante(malo) == []
