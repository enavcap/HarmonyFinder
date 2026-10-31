"""Regresión: una secuencia de tonicizaciones con séptimas disminuidas enarmónicamente
iguales (F: viio7 → I, d: viio7 → i) no es una modulación enarmónica."""
import pytest

pytest.importorskip("music21")
import buscar

GRAFIA = {
    (89, 2): {"F#", "A", "C", "E-"},
    (89, 4): {"E", "G", "B-", "D-"},
    (90, 2): {"C#", "E", "G", "B-"},
    (90, 4): {"F#", "A", "C", "E-"},
}

AC = [
    dict(obra=1, compas=89, parte=1, tono="a", cifrado="I"),
    dict(obra=1, compas=89, parte=2, tono="G", cifrado="viio7"),
    dict(obra=1, compas=89, parte=3, tono="G", cifrado="I"),
    dict(obra=1, compas=89, parte=4, tono="F", cifrado="viio7"),
    dict(obra=1, compas=90, parte=1, tono="F", cifrado="I"),
    dict(obra=1, compas=90, parte=2, tono="d", cifrado="viio7"),
    dict(obra=1, compas=90, parte=3, tono="d", cifrado="i"),
    dict(obra=1, compas=90, parte=4, tono="g", cifrado="viio65"),
    dict(obra=1, compas=91, parte=1, tono="g", cifrado="i6"),
    dict(obra=1, compas=91, parte=4, tono="F", cifrado="V65/V"),
]


def test_secuencia_de_septimas_disminuidas_no_es_enarmonica(monkeypatch):
    monkeypatch.setattr(buscar, "_grafia", lambda obra, c, p: GRAFIA.get((c, p)))
    assert buscar.modulacion_enarmonica(AC) == []


def test_resuelve_en():
    assert buscar._resuelve_en(dict(cifrado="viio7"), dict(cifrado="I"), "F")
    assert not buscar._resuelve_en(dict(cifrado="viio7"), dict(cifrado="viio65"), "F")
    assert buscar._resuelve_en(dict(cifrado="V7"), dict(cifrado="I"), "C")
