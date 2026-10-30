"""Pruebas del sistema de identificación de obras y prevención de duplicados."""
import sqlite3
import pytest
from multicorpus.modelo import conectar
from multicorpus.identificacion import (compositor_canonico, extraer_catalogos, compatibles, titulo_norm,
                                        registrar_movimiento, confirmar, descartar, preparar)

@pytest.fixture
def con(tmp_path):
    c = conectar(tmp_path / "t.sqlite"); preparar(c)
    yield c
    c.close()

def reg(**k):
    base = {"compositor": None, "obra_titulo": None, "obra_catalogo": None, "movimiento_numero": None,
            "movimiento_titulo": None, "ids_externos": [], "fuente": "prueba"}
    base.update(k); return base

# ---- normalización
def test_alias_de_compositor():
    assert compositor_canonico("J.S. Bach")[0] == "bach-js"
    assert compositor_canonico("Bach,_Johann_Sebastian")[0] == "bach-js"
    assert compositor_canonico("Pyotr Tchaikovsky")[0] == compositor_canonico("Tchaikovski")[0]
    assert compositor_canonico("")[0] == "desconocido"
    assert compositor_canonico("Fulano de Tal")[5] is False

def test_catalogos():
    assert extraer_catalogos("BWV 1001") == ["bwv:1001"]
    assert extraer_catalogos("D. 911, Op. 89", "schubert") == ["d:911", "op:89"]
    assert extraer_catalogos("D. 911", "beethoven") == []           # D. solo vale para Schubert
    assert "op:2:1" in extraer_catalogos("Op002 No1")
    assert "k:279" in extraer_catalogos("K279", "mozart")
    assert not compatibles(["op:2:1"], ["op:2:3"])
    assert compatibles(["d:911"], ["d:911", "op:89"])

def test_titulos_traducidos_y_puntuacion():
    assert titulo_norm("Suites françaises") == titulo_norm("French Suites")
    assert titulo_norm("Winterreise,  D. 911") == titulo_norm("Winterreise")
    assert titulo_norm("Sonata No. 1") != titulo_norm("Sonata No. 2")

# ---- escenarios de importación (sección 15)
def test_misma_obra_por_catalogo(con):
    a = registrar_movimiento(con, reg(compositor="Schubert,_Franz", obra_titulo="Winterreise, D.911", movimiento_numero="3"), 1)
    b = registrar_movimiento(con, reg(compositor="Franz Schubert", obra_titulo="Winterreise", obra_catalogo="D. 911, Op. 89", movimiento_numero="3"), 2)
    assert a[2] == "nueva" and b[2] == "existente"
    assert a[0] == b[0] and a[1] == b[1]                           # misma obra y mismo movimiento

def test_titulo_alternativo_con_catalogo(con):
    a = registrar_movimiento(con, reg(compositor="Johann Sebastian Bach", obra_titulo="Sonata No. 1 in G minor", obra_catalogo="BWV 1001", movimiento_numero="1"), 1)
    b = registrar_movimiento(con, reg(compositor="J.S. Bach", obra_titulo="Violinsonate g-Moll", obra_catalogo="BWV 1001", movimiento_numero="2"), 2)
    assert b[2] == "existente" and a[0] == b[0] and a[1] != b[1]   # misma obra, distinto movimiento
    alt = [r[0] for r in con.execute("SELECT titulo FROM titulos_alternativos WHERE obra_id=?", (a[0],))]
    assert "Violinsonate g-Moll" in alt

def test_titulos_parecidos_pero_distintos(con):
    a = registrar_movimiento(con, reg(compositor="Beethoven", obra_titulo="Sonata para piano, Op. 2 No. 1", obra_catalogo="Op. 2 No. 1", movimiento_numero="1"), 1)
    b = registrar_movimiento(con, reg(compositor="Beethoven", obra_titulo="Sonata para piano, Op. 2 No. 2", obra_catalogo="Op. 2 No. 2", movimiento_numero="1"), 2)
    assert a[0] != b[0] and b[2] == "nueva"
    assert con.execute("SELECT COUNT(*) FROM candidatos_duplicado").fetchone()[0] == 0

def test_parecido_genera_candidato_y_no_fusiona(con):
    a = registrar_movimiento(con, reg(compositor="Robert Schumann", obra_titulo="Kinderszenen", movimiento_numero="7"), 1)
    b = registrar_movimiento(con, reg(compositor="Robert Schumann", obra_titulo="Kinderszenen (Scenes from childhood)", movimiento_numero="7"), 2)
    assert b[2] == "pendiente" and a[0] != b[0]
    cid = con.execute("SELECT id FROM candidatos_duplicado WHERE estado='pendiente'").fetchone()[0]
    # se cuelga un análisis del movimiento provisional y se confirma la fusión
    con.execute("INSERT INTO analisis (id, movimiento_id, fuente, archivo, huella) VALUES ('x', ?, 'p', 'f', 'h')", (b[1],))
    assert confirmar(con, cid)
    assert con.execute("SELECT movimiento_id FROM analisis WHERE id='x'").fetchone()[0] == a[1]
    assert con.execute("SELECT COUNT(*) FROM obras").fetchone()[0] == 1

def test_descartar_candidato(con):
    registrar_movimiento(con, reg(compositor="Robert Schumann", obra_titulo="Kinderszenen"), 1)
    registrar_movimiento(con, reg(compositor="Robert Schumann", obra_titulo="Kinderszenen (Scenes from childhood)"), 2)
    cid = con.execute("SELECT id FROM candidatos_duplicado").fetchone()[0]
    assert descartar(con, cid)
    assert con.execute("SELECT COUNT(*) FROM obras").fetchone()[0] == 2

def test_metadatos_incompletos(con):
    a = registrar_movimiento(con, reg(), 1)
    assert a[2] == "nueva"
    assert con.execute("SELECT compositor_id FROM obras WHERE id=?", (a[0],)).fetchone()[0] == "desconocido"

def test_identificador_externo(con):
    a = registrar_movimiento(con, reg(compositor="Mahler", obra_titulo="Kindertotenlieder", movimiento_numero="2", ids_externos=["https://www.wikidata.org/wiki/Q589396"]), 1)
    b = registrar_movimiento(con, reg(compositor="Gustav Mahler", obra_titulo="Kinder-Toten-Lieder", movimiento_numero="2", ids_externos=["https://www.wikidata.org/wiki/Q589396"]), 2)
    assert b[2] == "existente" and a[1] == b[1]

def test_tonalidad_en_el_titulo_distingue_obras(con):
    a = registrar_movimiento(con, reg(compositor="C.P.E. Bach", obra_titulo="Sonata in D minor", movimiento_numero="1"), 1)
    b = registrar_movimiento(con, reg(compositor="C.P.E. Bach", obra_titulo="Sonata in F major", movimiento_numero="1"), 2)
    assert a[0] != b[0]

def test_opus_de_conjunto_no_basta(con):
    a = registrar_movimiento(con, reg(compositor="J.C. Bach", obra_titulo="Sonata No. 1", obra_catalogo="Op. 17", movimiento_numero="1"), 1)
    b = registrar_movimiento(con, reg(compositor="J.C. Bach", obra_titulo="Sonata No. 2", obra_catalogo="Op. 17", movimiento_numero="1"), 2)
    assert a[0] != b[0]

def test_mismo_opus_y_titulo_contenido_da_candidato(con):
    a = registrar_movimiento(con, reg(compositor="Clara Schumann", obra_titulo="6 Lieder, Op.23", movimiento_numero="1"), 1)
    b = registrar_movimiento(con, reg(compositor="Schumann, Clara", obra_titulo="6 Lieder aus Jucunde, Op. 23", obra_catalogo="Op.23", movimiento_numero="1"), 2)
    assert b[2] == "pendiente" and a[0] != b[0]                    # candidato, sin fusión
    c = registrar_movimiento(con, reg(compositor="Clara Schumann", obra_titulo="6 Lieder, Op.13", movimiento_numero="1"), 3)
    assert c[2] == "nueva"                                         # otro opus: ni fusión ni candidato

def test_revisar_no_duplica_ni_reabre(con):
    from multicorpus.identificacion import revisar
    registrar_movimiento(con, reg(compositor="Robert Schumann", obra_titulo="Kinderszenen"), 1)
    registrar_movimiento(con, reg(compositor="Robert Schumann", obra_titulo="Kinderszenen (Scenes from childhood)"), 2)
    cid = con.execute("SELECT id FROM candidatos_duplicado").fetchone()[0]
    descartar(con, cid)
    assert revisar(con) == 0                                       # el descartado no vuelve a aparecer
    assert con.execute("SELECT COUNT(*) FROM obras").fetchone()[0] == 2

def test_piezas_distintas_de_la_misma_fuente_no_se_fusionan(con):
    con.execute("ALTER TABLE analisis ADD COLUMN pieza TEXT") if "pieza" not in {r[1] for r in con.execute("PRAGMA table_info(analisis)")} else None
    a = registrar_movimiento(con, reg(compositor="Frescobaldi", obra_titulo="Fiori musicali", obra_catalogo="Op. 12", movimiento_numero="1", pieza="12.01", fuente_id="dcml"), 1)
    con.execute("INSERT INTO analisis (id, movimiento_id, fuente, archivo, huella, pieza) VALUES ('a1', ?, 'dcml', 'f', 'h', '12.01')", (a[1],))
    b = registrar_movimiento(con, reg(compositor="Frescobaldi", obra_titulo="Fiori musicali", obra_catalogo="Op. 12", movimiento_numero="1", pieza="12.18", fuente_id="dcml"), 2)
    assert a[0] == b[0] and a[1] != b[1]
    # la misma pieza vista desde OTRA fuente sí comparte movimiento
    c = registrar_movimiento(con, reg(compositor="Frescobaldi", obra_titulo="Fiori musicali", obra_catalogo="Op. 12", movimiento_numero="1", pieza="x/1", fuente_id="wir"), 3)
    assert c[1] == a[1]

def test_mismo_numero_titulo_distinto_no_comparte_movimiento(con):
    a = registrar_movimiento(con, reg(compositor="Monteverdi", obra_titulo="Madrigali, libro 3", movimiento_numero="9",
                                      movimiento_titulo="La tra 'l sangue e le morti egro giacente"), 1)
    registrar_movimiento(con, reg(compositor="Monteverdi", obra_titulo="Madrigali, libro 3", movimiento_numero="11",
                                  movimiento_titulo="O Primavera, Gioventù de l'Anno"), 1)
    b = registrar_movimiento(con, reg(compositor="Claudio Monteverdi", obra_titulo="Madrigali, libro 3", movimiento_numero="9",
                                      movimiento_titulo="O primavera gioventù del anno"), 2)
    assert b[0] == a[0] and b[1] != a[1]
    assert b[1] == con.execute("SELECT id FROM movimientos WHERE numero='11'").fetchone()[0]   # va al n.º 11 por título

def test_versiones_distintas_no_comparten_movimiento(con):
    a = registrar_movimiento(con, reg(compositor="Schubert", obra_titulo="Winterreise, D.911", movimiento_numero="10",
                                      movimiento_titulo="Rast (Spätere Fassung)"), 1)
    b = registrar_movimiento(con, reg(compositor="Franz Schubert", obra_titulo="Winterreise", obra_catalogo="D. 911",
                                      movimiento_numero="10", movimiento_titulo="Rast"), 2)
    assert a[0] == b[0] and a[1] != b[1]                         # misma obra, versión distinta
    c = registrar_movimiento(con, reg(compositor="Schubert", obra_titulo="Winterreise", obra_catalogo="D. 911",
                                      movimiento_numero="11", movimiento_titulo="Frühlingstraum"), 2)
    d = registrar_movimiento(con, reg(compositor="Schubert", obra_titulo="Winterreise, D.911", movimiento_numero="11",
                                      movimiento_titulo="Frühlingstraum"), 1)
    assert c[1] == d[1]

def test_misma_fuente_obras_distintas_mismo_titulo_no_se_fusionan(con):
    con.execute("ALTER TABLE analisis ADD COLUMN obra_fuente TEXT") if "obra_fuente" not in {r[1] for r in con.execute("PRAGMA table_info(analisis)")} else None
    a = registrar_movimiento(con, reg(compositor="Louise Reichardt", obra_titulo="Zwölf Gesänge", movimiento_numero="1",
                                      movimiento_titulo="Erinnrung zum Bach", fuente_id="wir", obra_fuente="R/Zwölf_Gesänge"), 1)
    con.execute("INSERT INTO analisis (id, movimiento_id, fuente, archivo, huella, obra_fuente) VALUES ('r1', ?, 'wir', 'f', 'h', 'R/Zwölf_Gesänge')", (a[1],))
    b = registrar_movimiento(con, reg(compositor="Louise Reichardt", obra_titulo="Zwölf Gesänge, Op.3", movimiento_numero="1",
                                      movimiento_titulo="Frühlingsblumen", fuente_id="wir", obra_fuente="R/Zwölf_Gesänge,_Op.3"), 1)
    assert a[0] != b[0] and b[2] == "pendiente"                  # candidato para revisión, no fusión
    # la misma colección de OTRA fuente sí se identifica por título
    c = registrar_movimiento(con, reg(compositor="Reichardt", obra_titulo="Zwölf Gesänge", movimiento_numero="2",
                                      fuente_id="dcml", obra_fuente="x|Zwölf Gesänge|"), 2)
    assert c[0] == a[0]
