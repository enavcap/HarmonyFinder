"""Forma de Taking Form: lectura, atajos de repetición y alineación con la partitura."""
from multicorpus import forma

CSV = """1,1,Exposition,First Subject,X,X
2,1,,,,
9,1,,Transition,X,
13,3,,Second Subject Group,Theme b,
20,1,,Codetta,,
22,1,Development,X,X,
30,1,,Re-transition,,
34-37=1-4,,Recapitulation,,,
38,1,,Transition,,
44,1,Coda,X,,
"""

def _ruta(tmp_path, texto=CSV, nombre="K279-mvt1.csv"):
    p = tmp_path / nombre; p.write_text(texto); return p

def test_secciones_y_zonas(tmp_path):
    F = forma.leer(_ruta(tmp_path))
    assert F[0] == (0, 0.0, "exposicion", "primer_grupo")
    assert (9, 1.0, "exposicion", "transicion") in F and (13, 3.0, "exposicion", "segundo_grupo") in F
    assert (20, 1.0, "exposicion", "zona_conclusiva") in F
    assert (22, 1.0, "desarrollo", None) in F and (30, 1.0, "desarrollo", "retransicion") in F
    # «34-37=1-4»: la reexposición repite el primer grupo de 1-4
    assert (34, 1.0, "reexposicion", "primer_grupo") in F
    assert (44, 1.0, "coda", None) in F

def test_posicion(tmp_path):
    F = forma.leer(_ruta(tmp_path))
    assert forma.en(F, 0, 3.5) == ("exposicion", "primer_grupo")
    assert forma.en(F, 13, 2) == ("exposicion", "transicion")
    assert forma.en(F, 13, 3) == ("exposicion", "segundo_grupo")
    assert forma.en(F, 25, 1) == ("desarrollo", None)

def test_identifica_la_carpeta_de_when_in_rome():
    assert forma.carpeta_wir("K457-mvt1.csv") == "Piano_Sonatas/Mozart,_Wolfgang_Amadeus/K457/1"
    assert forma.carpeta_wir("sonata14op27no2(Moonlight)movt3.csv") == "Piano_Sonatas/Beethoven,_Ludwig_van/Op027_No2/3"
    assert forma.carpeta_wir("sonata21op53movt1.csv") == "Piano_Sonatas/Beethoven,_Ludwig_van/Op053/1"

def test_alineacion(tmp_path):
    r = _ruta(tmp_path)
    nums = [str(i) for i in range(1, 47)]
    acordes = [(1, 1.0, "C", "I"), (34, 1.0, "C", "I")]
    assert forma.alinear(r, [str(i) for i in range(1, 45)], []) is not None     # acaba donde la partitura
    F = forma.alinear(r, nums, acordes)                                           # acaba antes, pero la reexposición cuadra
    assert F and F[-1] == (45, 1.0, None, None)
    assert forma.alinear(r, nums, [(1, 1.0, "C", "I"), (34, 1.0, "G", "V")]) is None   # no se puede comprobar: fuera

# ------------------------------------------------------------------ forma global
from multicorpus import forma_global as G

def test_forma_global_desde_las_secciones():
    assert G.desde_secciones(["exposicion", "desarrollo", "reexposicion", "coda"]) == "forma_sonata"
    assert G.desde_secciones(["minueto", "trio", "minueto"]) == "minueto_trio"
    assert G.desde_secciones(["seccion_a", "seccion_b", "seccion_a", "seccion_c", "seccion_a", "coda"]) == "rondo"
    assert G.desde_secciones(["seccion_a", "seccion_b", "seccion_a"]) == "ternaria"
    assert G.desde_secciones(["tema", "variacion", "variacion"]) == "tema_variaciones"
    assert G.desde_secciones([None]) is None

def test_forma_global_desde_el_titulo():
    assert G.desde_titulo("Menuetto and Trio: Allegretto") == "minueto_trio"
    assert G.desde_titulo("Rondo: Allegretto") == "rondo"
    assert G.desde_titulo("Andante scherzoso quasi Allegretto") is None        # carácter, no forma
    assert G.desde_titulo("Tempo di minuetto") is None
    assert G.desde_titulo("Andantino con Variazioni") == "tema_variaciones"
    assert G.desde_titulo("Allegro") is None

def test_prioridad_y_suites():
    suite = {"fuente": "dcml", "subcorpus": "bach_solo", "compositor": "Bach", "titulo": "Suite No. 1 · 5. Minuet I"}
    assert G.asignar(suite) == ("binaria", "colección")                       # en una suite, danza binaria
    son = {"fuente": "wir", "subcorpus": "Piano_Sonatas", "compositor": "Mozart", "titulo": "Sonata · 1", "clave": "x"}
    assert G.asignar(son, ["exposicion", "desarrollo"]) == ("forma_sonata", "Taking Form")
    assert G.asignar(son, ["exposicion", "desarrollo"], revision={"x": "rondo"}) == ("rondo", "revisión")
    assert G.asignar(son) == (None, None)                                     # sin fuente, sin forma

def test_numeracion_tradicional():
    assert G.numero("Wolfgang Amadeus Mozart", "Sonata para piano, K. 310", "K. 310") == 8
    assert G.numero("Ludwig van Beethoven", "Sonata para piano, Op. 13(Pathetique)", "Op. 13(Pathetique)") == 8
    assert G.numero("Ludwig van Beethoven", "Cuarteto de cuerda, Op. 131", "Op. 131") == 14

def test_tempo_di_menuetto_no_es_forma():
    assert G.desde_titulo("Tempo di Menuetto") is None

def test_rondeaux_y_minueto_con_variaciones():
    assert G.desde_titulo("Rondeaux") == "rondo"
    assert G.desde_titulo("Minuetto con variazione") == "tema_variaciones"
