"""Correcciones de erratas de las fuentes (multicorpus/correcciones_fuentes.json)."""
import pytest
from multicorpus import correcciones

REL = "Chamber_Other/Corelli,_Arcangelo/Op1No10/1/analysis_DT.txt"
ORIGINAL = "m5 iv6 b3 V\n6 Bb: I b2 vi6 b3 V6\nm7 vi b2 ii7 b3 V7 b4 vi\n"

def test_corelli_recupera_el_compas_6():
    assert "\nm6 Bb: I b2 vi6 b3 V6\n" in correcciones.aplicar(ORIGINAL, REL)

def test_sin_correcciones_no_cambia_nada():
    assert correcciones.aplicar(ORIGINAL, "otra/obra.txt") == ORIGINAL
    assert correcciones.huella("otra/obra.txt") == ""

def test_la_cache_cambia_con_las_correcciones():
    assert correcciones.huella(REL).startswith("-c")

def test_una_correccion_que_ya_no_encaja_falla():
    with pytest.raises(ValueError):
        correcciones.aplicar("m6 Bb: I b2 vi6 b3 V6\n", REL)

@pytest.mark.skipif(pytest.importorskip("music21") is None, reason="music21")
def test_corelli_se_lee_en_si_bemol(tmp_path):
    import indexar
    carpeta = tmp_path / "Chamber_Other" / "Corelli,_Arcangelo" / "Op1No10" / "1"
    carpeta.mkdir(parents=True)
    (carpeta / "analysis_DT.txt").write_text("Composer: Corelli\nTime Signature: 4/4\n\nm1 g: i\n" + ORIGINAL + "m8 ii6/5 b2 V b3 I\n", encoding="utf-8")
    res, err = indexar.procesar((str(carpeta / "analysis_DT.txt"), str(tmp_path)))
    assert err is None
    c8 = [(f[1], f[4], f[6]) for f in res[1] if f[1] in (6, 8)]
    assert (6, "B-", "I") in c8 and (8, "B-", "I") in c8
