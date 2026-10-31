"""Cadencias como finales de frase (multicorpus/cadencias.py)."""
from multicorpus import cadencias, buscar_mc

NOMBRE = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"]
ALTER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]

def _nota(midi, dur, acorde):
    return (f"<note>{'<chord/>' if acorde else ''}<pitch><step>{NOMBRE[midi % 12]}</step>"
            f"{'<alter>1</alter>' if ALTER[midi % 12] else ''}<octave>{midi // 12 - 1}</octave></pitch>"
            f"<duration>{dur}</duration></note>")

def partitura(compases):
    """compases: lista de compases de 4/4; cada compás, lista de (alturas MIDI, duración en negras)."""
    x = ['<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>p</part-name>'
         '</score-part></part-list><part id="P1">']
    for n, c in enumerate(compases, 1):
        x.append(f'<measure number="{n}">')
        if n == 1:
            x.append("<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>")
        for alturas, dur in c:
            if not alturas:
                x.append(f"<note><rest/><duration>{dur}</duration></note>")
            else:
                x.append("".join(_nota(m, dur, k > 0) for k, m in enumerate(alturas)))
        x.append("</measure>")
    x.append("</part></score-partwise>")
    return "".join(x).encode()

# do mayor, a cuatro voces (bajo, tenor, contralto, tiple)
I_8 = [48, 55, 64, 72]       # tiple en do
I_3 = [48, 55, 60, 64]       # tiple en mi
IV = [53, 57, 65, 72]
ii6 = [53, 57, 62, 69]
V = [43, 55, 62, 71]
V7 = [43, 53, 62, 71]

def _ac(cif, compas, parte, tono="C"):
    r = buscar_mc.buscar._rn(cif, tono)
    return {"compas": compas, "parte": parte, "tono": tono, "modo": "major" if tono[0].isupper() else "minor",
            "cifrado": cif, "grado": r.scaleDegree, "secundaria": None, "calidad": r.quality,
            "inversion": r.inversion(), "alteracion": 0, "septima": int(r.isSeventh()), "cadencia": None}

def _con_rasgos(ac, datos):
    for a, r in zip(ac, cadencias.rasgos(datos, [(a["compas"], a["parte"]) for a in ac])):
        a["r"] = r
    return ac

def test_perfecta_al_final_de_frase():
    s = partitura([[(I_3, 2), (IV, 2)], [(ii6, 1), (V7, 1), (I_8, 2)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("ii6", 2, 1), _ac("V7", 2, 2), _ac("I", 2, 3)], s)
    assert ac[4]["r"]["peso"] == 2 and ac[4]["r"]["tiple"][0] == 0
    assert [h[0] for h in cadencias.cadencia_autentica_perfecta(ac)] == [4]
    assert not cadencias.cadencia_autentica_imperfecta(ac)

def test_imperfecta_por_el_tiple():
    s = partitura([[(I_8, 2), (IV, 2)], [(ii6, 1), (V7, 1), (I_3, 2)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("ii6", 2, 1), _ac("V7", 2, 2), _ac("I", 2, 3)], s)
    assert not cadencias.cadencia_autentica_perfecta(ac)
    h = cadencias.cadencia_autentica_imperfecta(ac)
    assert [x[0] for x in h] == [4] and "3.º grado" in h[0][1]

def test_v_i_de_paso_no_es_cadencia():
    # V–I en parte débil, sin predominante y con la llegada más corta que el V
    s = partitura([[(I_8, 1), (V, 2), (I_8, 1)], [(IV, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("V", 1, 2), _ac("I", 1, 4), _ac("IV", 2, 1)], s)
    assert not cadencias.cadencia_autentica_perfecta(ac) and not cadencias.cadencia_autentica_imperfecta(ac)

def test_semicadencia_con_la_melodia_detenida():
    s = partitura([[(I_8, 2), (IV, 2)], [(V, 3), ([], 1)], [(I_8, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("V", 2, 1), _ac("I", 3, 1)], s)
    assert [h[0] for h in cadencias.semicadencia(ac)] == [2]

def test_rota():
    vi = [45, 57, 64, 72]
    s = partitura([[(I_8, 2), (IV, 2)], [(V7, 2), (vi, 2)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("V7", 2, 1), _ac("vi", 2, 3)], s)
    assert [h[0] for h in cadencias.cadencia_rota(ac)] == [3]

def test_frigia_comprueba_el_bajo():
    iv6 = [41, 50, 57, 62]                    # fa (6.º de la menor) en el bajo
    Vm = [40, 52, 56, 59]                     # mi en el bajo
    s = partitura([[(iv6, 2), (Vm, 2)]])
    ac = _con_rasgos([_ac("iv6", 1, 1, "a"), _ac("V", 1, 3, "a")], s)
    assert [h[0] for h in cadencias.cadencia_frigia(ac)] == [1]
    malo = partitura([[([45, 50, 57, 62], 2), (Vm, 2)]])  # bajo en la: no desciende por semitono
    ac = _con_rasgos([_ac("iv6", 1, 1, "a"), _ac("V", 1, 3, "a")], malo)
    assert not cadencias.cadencia_frigia(ac)

def test_sin_rasgos_no_detecta():
    ac = [_ac("ii6", 1, 1), _ac("V7", 1, 3), _ac("I", 2, 1)]
    for a in ac:
        a["r"] = None
    assert not cadencias.cadencia_autentica_perfecta(ac)

def test_conceptos_usan_las_cadencias_nuevas():
    c = buscar_mc.conceptos()
    for k, f in cadencias.DETECTORES.items():
        assert c[k][0] is f
