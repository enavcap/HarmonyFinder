"""Cadencias como finales de frase (multicorpus/cadencias.py)."""
from multicorpus import cadencias, buscar_mc

NOMBRE = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"]
ALTER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]

def _nota(midi, dur, acorde, calderon=False):
    return (f"<note>{'<chord/>' if acorde else ''}<pitch><step>{NOMBRE[midi % 12]}</step>"
            f"{'<alter>1</alter>' if ALTER[midi % 12] else ''}<octave>{midi // 12 - 1}</octave></pitch>"
            f"<duration>{dur}</duration>{'<notations><fermata/></notations>' if calderon else ''}</note>")

def partitura(compases):
    """compases: lista de compases de 4/4; cada compás, lista de (alturas MIDI, duración en negras)."""
    x = ['<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>p</part-name>'
         '</score-part></part-list><part id="P1">']
    for n, c in enumerate(compases, 1):
        x.append(f'<measure number="{n}">')
        if n == 1:
            x.append("<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>")
        for alturas, dur, *cal in c:                  # (alturas, duración[, calderón])
            if not alturas:
                x.append(f"<note><rest/><duration>{dur}</duration></note>")
            else:
                x.append("".join(_nota(m, dur, k > 0, bool(cal and cal[0])) for k, m in enumerate(alturas)))
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

def test_rota_sin_melodia_detenida_no_es_cadencia():
    # V–vi en parte fuerte pero la melodía sigue en corcheas por encima del vi: no cierra la frase
    vi = [45, 57, 64, 72]
    s = partitura([[(I_8, 2), (IV, 2)], [(V7, 2), (vi, 0.5), ([45, 57, 64, 74], 0.5), ([45, 57, 64, 76], 0.5), ([45, 57, 64, 77], 0.5)]])
    s = s.replace(b"<divisions>1</divisions>", b"<divisions>2</divisions>")
    s = s.replace(b"<duration>2</duration>", b"<duration>4</duration>").replace(b"<duration>0.5</duration>", b"<duration>1</duration>")
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("V7", 2, 1), _ac("vi", 2, 3)], s)
    assert not ac[3]["r"]["respiro"]
    assert not cadencias.cadencia_rota(ac)

def _coral(cald_en_vi):
    # coral en negras: el calderón marca los finales de frase (aquí, el I del c. 3 y, si cald_en_vi, el vi del c. 1)
    vi = [45, 57, 64, 72]
    s = partitura([[(I_8, 1), (V7, 1), (vi, 1, cald_en_vi), (IV, 1)], [(ii6, 1), (V, 1), (I_8, 2)], [(I_8, 4, True)]])
    return _con_rasgos([_ac("I", 1, 1), _ac("V7", 1, 2), _ac("vi", 1, 3), _ac("IV", 1, 4),
                        _ac("ii6", 2, 1), _ac("V", 2, 2), _ac("I", 2, 3), _ac("I", 3, 1)], s)

def test_coral_v_vi_de_paso_no_es_rota():
    ac = _coral(False)
    assert ac[2]["r"]["respiro"] and not ac[2]["r"]["calderon"]   # en negras el respiro no distingue nada
    assert not cadencias.cadencia_rota(ac)

def test_coral_rota_con_calderon():
    ac = _coral(True)
    assert ac[2]["r"]["calderon"] == 1
    assert [h[0] for h in cadencias.cadencia_rota(ac)] == [2]

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


# ---------------------------------------------------------------- 6/4 cadencial
I64 = [43, 60, 64, 72]       # do/sol: I en segunda inversión con el sol en el bajo
I6 = [52, 55, 60, 67]

def test_sexta_cuarta_cadencial_con_cadencia():
    # | I  IV | I64 V7 | I |: 6/4 en parte fuerte, V7, I de llegada en el compás siguiente
    s = partitura([[(I_3, 2), (IV, 2)], [(I64, 2), (V7, 2)], [(I_8, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("I64", 2, 1), _ac("V7", 2, 3), _ac("I", 3, 1)], s)
    h = cadencias.sexta_cuarta_cadencial(ac)
    assert [x[0] for x in h] == [2] and h[0][1] == "I64 → V7 → I"

def test_sexta_cuarta_de_paso_no_es_cadencial():
    # | I  V64  I6 | IV ...: el 6/4 de paso entre I e I6 no va seguido de V–I
    s = partitura([[(I_3, 1), (I64, 1), (I6, 2)], [(IV, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("I64", 1, 2), _ac("I6", 1, 3), _ac("IV", 2, 1)], s)
    assert not cadencias.sexta_cuarta_cadencial(ac)

def test_sexta_cuarta_sin_llegada_no_es_cadencial():
    # I64 → V → I con el I en parte débil y más corto: no hay final de frase
    s = partitura([[(I64, 2), (V, 1), (I_8, 1)], [(IV, 4)]])
    ac = _con_rasgos([_ac("I64", 1, 1), _ac("V", 1, 3), _ac("I", 1, 4), _ac("IV", 2, 1)], s)
    assert not cadencias.sexta_cuarta_cadencial(ac)
