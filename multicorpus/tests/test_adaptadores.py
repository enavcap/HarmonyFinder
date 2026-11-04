"""Pruebas de los adaptadores de corpus (normalización sin pérdida, procedencia, idempotencia)."""
from pathlib import Path
import pytest
from multicorpus.adaptadores.dcml import normalizar_fila, tono_local, parte_de, nombre_de_tpc, tpc_de, AdaptadorDCML
from multicorpus.adaptadores.wir import obra_y_movimiento
from multicorpus.modelo import conectar
from multicorpus.importar import importar

RAIZ = Path(__file__).resolve().parents[2]
DCML = RAIZ / "datos" / "fuentes" / "dcml"

def fila(**k):
    base = {"numeral": "", "form": "", "figbass": "", "changes": "", "relativeroot": ""}
    base.update(k); return base

def test_cifrados_dcml_a_romantext():
    assert normalizar_fila(fila(numeral="Ger", figbass="65"))["cifrado"] == "Ger65"
    assert normalizar_fila(fila(numeral="V", changes="64"))["cifrado"] == "Cad64"
    n = normalizar_fila(fila(numeral="vii", form="%", figbass="7", relativeroot="V"))
    assert n["cifrado"] == "viiø7/V" and n["secundaria"] == "V" and n["septima"] == 1 and n["calidad"] == "diminished"
    n = normalizar_fila(fila(numeral="bII", figbass="6"))
    assert n["alteracion"] == -1 and n["inversion"] == 1 and n["grado"] == 2
    assert normalizar_fila(fila(numeral="")) is None

def test_tonalidades_locales():
    assert tono_local("C", "V") == "G"
    assert tono_local("a", "III") == "C"
    assert tono_local("C", "vi") == "a"
    assert tono_local("Eb", "V/V") == "F"
    assert tono_local("g", "i") == "g"

def test_clave_bien_temperado_indica_que_es_el_preludio():
    om = obra_y_movimiento("Keyboard_Other/Bach,_Johann_Sebastian/The_Well-Tempered_Clavier_I/01", {}, {})
    assert om["obra_titulo"] == "El clave bien temperado, libro I" and om["obra_catalogo"] == "BWV 846–869"
    assert om["movimiento_numero"] == "1" and om["movimiento_titulo"] == "Preludio"
    om = obra_y_movimiento("Keyboard_Other/Bach,_Johann_Sebastian/The_Well-Tempered_Clavier_I/14", {}, {})
    assert om["movimiento_numero"] == "14"

def test_posicion_metrica():
    assert parte_de("3/4", "4/4") == 4.0          # anacrusa en la cuarta parte
    assert parte_de("0", "3/4") == 1.0
    assert abs(parte_de("3/8", "6/8") - 2.0) < 1e-9

def test_grafia_por_quintas():
    for n in ("C", "F#", "B-", "E--", "G#"):
        assert nombre_de_tpc(tpc_de(n)) == n

def test_wir_movimientos():
    om = obra_y_movimiento("OpenScore-LiederCorpus/Schubert,_Franz/Winterreise,_D.911/03_Gefrorne_Tränen", {}, {})
    assert om["obra_titulo"].startswith("Winterreise") and om["movimiento_numero"] == "3"
    om = obra_y_movimiento("Piano_Sonatas/Beethoven,_Ludwig_van/Op002_No1/1", {}, {})
    assert "Op. 2 No. 1" in om["obra_titulo"] and om["movimiento_numero"] == "1"
    om = obra_y_movimiento("Early_Choral/Bach,_Johann_Sebastian/Chorales/153", {"Title": "Ach Gott, vom Himmel sieh' darein"}, {"remote_score_music21": "bach/bwv2.6.mxl"})
    assert om["obra_catalogo"] == "BWV 2/6"

@pytest.mark.skipif(not (DCML / "mahler_kindertotenlieder").exists(), reason="subcorpus no descargado")
def test_dcml_procedencia_e_idempotencia(tmp_path):
    con = conectar(tmp_path / "c.sqlite")
    r1 = importar(con, "dcml", ["mahler_kindertotenlieder"], log=lambda *a: None)[0]
    n_anot = con.execute("SELECT COUNT(*) FROM anotaciones").fetchone()[0]
    r2 = importar(con, "dcml", ["mahler_kindertotenlieder"], log=lambda *a: None)[0]
    assert r1["analisis_nuevos"] == 5 and r1["obras_nuevas"] == 1
    assert r2["analisis_nuevos"] == 0 and r2["omitidos"] == 5         # segunda importación: nada nuevo
    assert con.execute("SELECT COUNT(*) FROM anotaciones").fetchone()[0] == n_anot
    assert con.execute("SELECT COUNT(*) FROM obras").fetchone()[0] == 1
    a = con.execute("SELECT * FROM analisis LIMIT 1").fetchone()
    assert a["url"].startswith("https://github.com/DCMLab/mahler_kindertotenlieder/blob/")
    assert a["licencia"] and a["huella"] and a["version"] and a["autores"]
    # la etiqueta original se conserva tal cual
    et = con.execute("SELECT etiqueta_original, cifrado FROM anotaciones WHERE etiqueta_original LIKE '%{%' LIMIT 1").fetchone()
    assert "{" in et[0] and "{" not in et[1]

def test_sextas_aumentadas_desarrolladas_del_dcml():
    from multicorpus.adaptadores.dcml import normalizar_fila
    f = lambda **k: normalizar_fila({"numeral": "vii", "form": "o", "figbass": "65", "changes": "b3", "relativeroot": "V", **k})
    assert f(chord="Ger6", chord_type="Ger")["cifrado"] == "Ger65"
    assert f(chord="It6", chord_type="It", figbass="6")["cifrado"] == "It6"
    assert normalizar_fila({"numeral": "V", "form": "", "figbass": "43", "changes": "b5", "relativeroot": "V",
                            "chord": "Fr6", "chord_type": "Fr"})["cifrado"] == "Fr43"
    g = f(chord="Ger2/iv", chord_type="Ger", figbass="2", relativeroot="V/iv")
    assert g["cifrado"] == "Ger2/iv" and g["secundaria"] == "iv"
    assert f(chord="viio65/V", chord_type="o7")["cifrado"] == "viio65/V"     # séptima disminuida normal intacta

def test_agrupar_obras_dcml():
    from multicorpus.adaptadores.dcml import agrupar_obras
    M = lambda p, t, n, mv, **k: {"piece": p, "workTitle": t, "workNumber": n, "movementNumber": mv, **k}
    # ciclo: una obra, aunque el archivo se llame n10 (no es «Op. 89 n.º 10»)
    g = agrupar_obras([M(f"n{i:02}", "Winterreise", "D. 911, Op. 89", str(i)) for i in range(1, 25)])
    assert {v for v in g.values()} == {("Winterreise", "D. 911, Op. 89", False)}
    # colección con catálogo por pieza: una obra, catálogo común
    g = agrupar_obras([M("a", "KGK I", "Op. 8, SWV 282", "1"), M("b", "KGK I", "Op. 8, SWV 283", "2")])
    assert g["a"][:2] == ("KGK I", "Op. 8") and g["a"][2] is True
    # mismo título, obras distintas (se repite el número de movimiento)
    g = agrupar_obras([M("x1", "Sonata No. 2 in C", "Op. 15, No. 2", "1"), M("x2", "Sonata No. 2 in C", "Op. 15, No. 2", "2"),
                       M("y1", "Sonata No. 2 in C", "Op. 20, No. 2", "1")])
    assert g["x1"][1] != g["y1"][1] and g["x1"][0] != g["y1"][0]          # títulos visibles distintos
    # obras sueltas con el mismo título: el catálogo va al título visible
    g = agrupar_obras([M("K001", "Sonata", "K.1", ""), M("K002", "Sonata", "K.2", "")])
    assert g["K001"][0] == "Sonata, K.1" and g["K002"][0] == "Sonata, K.2"
    # partes a/c de un mismo madrigal no rompen el libro
    g = agrupar_obras([M("5-01", "Libro V", "SV 94", "1"), M("5-04a", "Libro V", "SV 97a", "4"), M("5-04c", "Libro V", "SV 97c", "4")])
    assert len({v for v in g.values()}) == 1

def test_id_de_coleccion_no_identifica_obra(tmp_path):
    import csv
    from multicorpus.adaptadores.dcml import AdaptadorDCML
    sub = tmp_path / "fiori"; (sub / "harmonies").mkdir(parents=True)
    filas = [{"piece": "a", "workTitle": "La Messa della Domenica", "workNumber": "Op.12", "movementNumber": "1", "wikidata": "https://www.wikidata.org/wiki/Q1"},
             {"piece": "b", "workTitle": "La Messa degli Apostoli", "workNumber": "Op.12", "movementNumber": "1", "wikidata": "https://www.wikidata.org/wiki/Q1"}]
    with open(sub / "metadata.tsv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]), delimiter="\t"); w.writeheader(); w.writerows(filas)
    for p in "ab":
        (sub / "harmonies" / f"{p}.harmonies.tsv").write_text("mn\tlabel\n")
    regs = list(AdaptadorDCML(tmp_path, tmp_path / "out").listar("fiori"))
    assert all(r["obra"]["ids_externos"] == [] and r["obra"]["wikidata"] is None for r in regs)
    assert all(r["metadatos_originales"]["wikidata"] for r in regs)          # se conserva para la trazabilidad
