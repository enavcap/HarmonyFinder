"""Cadencias como finales de frase (multicorpus/cadencias.py)."""
from multicorpus import cadencias, buscar_mc

NOMBRE = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"]
ALTER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]

def _nota(midi, dur, acorde, calderon=False):
    return (f"<note>{'<chord/>' if acorde else ''}<pitch><step>{NOMBRE[midi % 12]}</step>"
            f"{'<alter>1</alter>' if ALTER[midi % 12] else ''}<octave>{midi // 12 - 1}</octave></pitch>"
            f"<duration>{dur}</duration>{'<notations><fermata/></notations>' if calderon else ''}</note>")

def partitura(compases, barras=()):
    """compases: lista de compases de 4/4; cada compás, lista de (alturas MIDI, duración en negras[, calderón]).
    barras: números de los compases que terminan con doble barra."""
    x = ['<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>p</part-name>'
         '</score-part></part-list><part id="P1">']
    for n, c in enumerate(compases, 1):
        x.append(f'<measure number="{n}">')
        if n == 1:
            x.append("<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>")
        for alturas, dur, *cal in c:
            d = int(dur * 4)
            if not alturas:
                x.append(f"<note><rest/><duration>{d}</duration></note>")
            else:
                x.append("".join(_nota(m, d, k > 0, bool(cal and cal[0])) for k, m in enumerate(alturas)))
        if n in barras:
            x.append('<barline location="right"><bar-style>light-light</bar-style></barline>')
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
    s = partitura([[(I_8, 2), (IV, 2)], [(V7, 2), (vi, 0.5), ([45, 57, 64, 74], 0.5), ([45, 57, 64, 76], 0.5), ([45, 57, 64, 77], 0.5)],
                   [(IV, 2), (V, 2)], [(I_8, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("V7", 2, 1), _ac("vi", 2, 3), _ac("IV", 3, 1), _ac("V", 3, 3), _ac("I", 4, 1)], s)
    assert not ac[3]["r"]["reposo"] and not ac[3]["r"]["marca"]
    assert not cadencias.cadencia_rota(ac)

def _coral(cald_en_vi):
    # coral en negras: el calderón marca los finales de frase (aquí, el I del c. 3 y, si cald_en_vi, el vi del c. 1)
    vi = [45, 57, 64, 72]
    s = partitura([[(I_8, 1), (V7, 1), (vi, 1, cald_en_vi), (IV, 1)], [(ii6, 1), (V, 1), (I_8, 2)], [(I_8, 4, True)]])
    return _con_rasgos([_ac("I", 1, 1), _ac("V7", 1, 2), _ac("vi", 1, 3), _ac("IV", 1, 4),
                        _ac("ii6", 2, 1), _ac("V", 2, 2), _ac("I", 2, 3), _ac("I", 3, 1)], s)

def test_coral_v_vi_de_paso_no_es_rota():
    ac = _coral(False)
    assert not ac[2]["r"]["calderon"]                  # en un coral solo el calderón marca el final de frase
    assert not cadencias.cadencia_rota(ac)

def test_coral_rota_con_calderon():
    ac = _coral(True)
    assert ac[2]["r"]["calderon"] == 1
    assert [h[0] for h in cadencias.cadencia_rota(ac)] == [2]

# ------------------------------------------------- final de frase: reposo, freno, marca
EN_MARCHA = [(I_8, 0.5), ([48, 55, 64, 74], 0.5), ([48, 55, 64, 76], 0.5), ([48, 55, 64, 77], 0.5)]   # I con el tiple en corcheas

def test_perfecta_en_mitad_de_frase_no_es_cadencia():
    # | I IV | ii6 V7 I· · · | IV V | I |: el primer V–I llega con la tónica en el tiple, pero la melodía
    # sigue en corcheas y la armonía al mismo paso: es un acorde de la frase, no su final
    s = partitura([[(I_3, 2), (IV, 2)], [(ii6, 1), (V7, 1)] + EN_MARCHA, [(IV, 2), (V7, 2)], [(I_8, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("ii6", 2, 1), _ac("V7", 2, 2), _ac("I", 2, 3),
                      _ac("IV", 3, 1), _ac("V7", 3, 3), _ac("I", 4, 1)], s)
    assert ac[4]["r"]["tiple"][0] == 0 and not ac[4]["r"]["reposo"] and not ac[4]["r"]["marca"]
    assert [h[0] for h in cadencias.cadencia_autentica_perfecta(ac)] == [7]     # solo el final

def test_doble_barra_marca_el_final_de_seccion():
    # el mismo V–I en marcha, pero con doble barra al final del compás: cierra la sección
    s = partitura([[(I_3, 2), (IV, 2)], [(ii6, 1), (V7, 1)] + EN_MARCHA, [(IV, 2), (V7, 2)], [(I_8, 4)]], barras={2})
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("ii6", 2, 1), _ac("V7", 2, 2), _ac("I", 2, 3),
                      _ac("IV", 3, 1), _ac("V7", 3, 3), _ac("I", 4, 1)], s)
    assert ac[4]["r"]["marca"]
    assert [h[0] for h in cadencias.cadencia_autentica_perfecta(ac)] == [4, 7]

def test_semicadencia_en_marcha_no_es_cadencia():
    # | I IV | V (la melodía sigue en corcheas) I | ...: llegar a V en parte fuerte no basta
    Vm = [([43, 55, 62, 71], 0.5), ([43, 55, 62, 74], 0.5), ([43, 55, 62, 71], 0.5), ([43, 55, 62, 67], 0.5)]
    s = partitura([[(I_8, 2), (IV, 2)], Vm + [(I_8, 2)], [(IV, 2), (V7, 2)], [(I_8, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("V", 2, 1), _ac("I", 2, 3), _ac("IV", 3, 1), _ac("V7", 3, 3), _ac("I", 4, 1)], s)
    assert not ac[2]["r"]["reposo"]
    assert not cadencias.semicadencia(ac)

def test_imperfecta_necesita_freno_armonico():
    # V–I con el 3.º en el tiple y nota larga, pero la armonía no se frena (todo en blancas): no es final
    s = partitura([[(I_8, 2), (IV, 2)], [(ii6, 2), (V7, 2)], [(I_3, 2), (IV, 2)], [(V7, 2), (I_8, 2)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("ii6", 2, 1), _ac("V7", 2, 3), _ac("I", 3, 1),
                      _ac("IV", 3, 3), _ac("V7", 4, 1), _ac("I", 4, 3)], s)
    assert not cadencias.cadencia_autentica_imperfecta(ac)
    # con la llegada larga (redonda tras blancas) sí cierra
    s = partitura([[(I_8, 2), (IV, 2)], [(ii6, 2), (V7, 2)], [(I_3, 4)], [(IV, 2), (V7, 2)], [(I_8, 4)]])
    ac = _con_rasgos([_ac("I", 1, 1), _ac("IV", 1, 3), _ac("ii6", 2, 1), _ac("V7", 2, 3), _ac("I", 3, 1),
                      _ac("IV", 4, 1), _ac("V7", 4, 3), _ac("I", 5, 1)], s)
    assert ac[4]["r"]["reposo"]
    assert [h[0] for h in cadencias.cadencia_autentica_imperfecta(ac)] == [4]

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
