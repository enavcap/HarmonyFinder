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
