"""Pasajes al unísono u octava (multicorpus/unisonos.py) y su efecto en la exportación."""
from multicorpus import unisonos
from multicorpus.exportar_mc import datos_analisis
from multicorpus.buscar_mc import conceptos
import buscar

def _conc():
    """Modulación y un V→I por regla simple (las cadencias del buscador necesitan rasgos de partitura)."""
    return {"modulacion": conceptos()["modulacion"], "v_i": (buscar.cadencia_autentica_perfecta, "", "derivado")}

STEP = {0: ("C", 0), 2: ("D", 0), 4: ("E", 0), 5: ("F", 0), 7: ("G", 0), 9: ("A", 0), 11: ("B", 0), 6: ("F", 1), 1: ("C", 1)}

def _nota(pc, oct_, dur=1, acorde=False):
    paso, alt = STEP[pc]
    return (f"<note>{'<chord/>' if acorde else ''}<pitch><step>{paso}</step>{f'<alter>{alt}</alter>' if alt else ''}"
            f"<octave>{oct_}</octave></pitch><duration>{dur}</duration></note>")

def _partitura(partes, transp=None):
    """partes: lista de partes; cada parte, lista de compases; cada compás, lista de negras
    (clase de altura, None = silencio, o tupla de clases = acorde). Compás de 4/4."""
    xml = ['<?xml version="1.0"?><score-partwise><part-list>']
    xml += [f'<score-part id="P{i}"><part-name>p{i}</part-name></score-part>' for i in range(len(partes))]
    xml.append("</part-list>")
    for i, parte in enumerate(partes):
        xml.append(f'<part id="P{i}">')
        for n, compas in enumerate(parte, 1):
            xml.append(f'<measure number="{n}">')
            if n == 1:
                t = f"<transpose><chromatic>{transp[i]}</chromatic></transpose>" if transp and transp[i] else ""
                xml.append(f"<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>{t}</attributes>")
            for x in compas:
                if x is None:
                    xml.append("<note><rest/><duration>1</duration></note>")
                elif isinstance(x, tuple):
                    xml.append("".join(_nota(pc, 4, acorde=k > 0) for k, pc in enumerate(x)))
                else:
                    xml.append(_nota(x, 4 - i))
            xml.append("</measure>")
        xml.append("</part>")
    xml.append("</score-partwise>")
    return "".join(xml).encode()

ESCALA = [[0, 2, 4, 5], [7, 9, 11, 0]]
ACORDES = [(1, 1.0), (1, 3.0), (2, 1.0), (2, 3.0)]

def test_dos_instrumentos_en_octavas_es_unisono():
    s = _partitura([ESCALA, ESCALA])
    assert unisonos.marcar(s, ACORDES) == [1, 1, 1, 1]

def test_una_sola_linea_no_es_unisono():
    assert unisonos.marcar(_partitura([ESCALA]), ACORDES) == [0, 0, 0, 0]

def test_con_acompanamiento_no_es_unisono():
    s = _partitura([ESCALA, ESCALA, [[(0, 4, 7)] * 4, [(7, 11, 2)] * 4]])
    assert unisonos.marcar(s, ACORDES) == [0, 0, 0, 0]

def test_acorde_aislado_al_unisono_se_conserva():
    s = _partitura([[[0, 2, 4, 5], [7, 9, 11, 0]], [[None, None, 4, 5], [(7, 11), (7, 11), (7, 11), (7, 11)]]])
    assert unisonos.marcar(s, ACORDES) == [0, 0, 0, 0]

def test_transpositor_se_lee_en_sonido_real():
    clarinete = [[(pc + 2) % 12 for pc in c] for c in ESCALA]   # escrito un tono arriba (Si♭)
    assert unisonos.marcar(_partitura([ESCALA, clarinete], transp=[0, -2]), ACORDES) == [1, 1, 1, 1]

def test_arpegio_en_octavas_expone_el_acorde():
    arpegio = [[0, 4, 7, 0], [7, 11, 2, 7]]
    s = _partitura([arpegio, arpegio])
    por_compas = [(1, 1.0), (2, 1.0)]                            # un acorde por compás: I y V arpegiados
    pcs = [frozenset({0, 4, 7}), frozenset({7, 11, 2})]
    assert unisonos.marcar(s, por_compas, pcs) == [0, 0]
    assert unisonos.marcar(s, por_compas) == [1, 1]              # sin cifrados, sigue siendo unísono
    assert unisonos.marcar(s, por_compas, [frozenset({0, 4, 7}), frozenset({0, 4, 7})]) == [0, 0]  # V no es I: aislado

def test_continuo_sin_realizar():
    assert unisonos.continuo_sin_realizar("kleine_geistliche_konzerte", [], "Schütz")
    assert unisonos.continuo_sin_realizar("x", ["Soprano", "Continuo"], "")
    assert unisonos.continuo_sin_realizar("x", ["Tenor", "Bass", "Harpsichord"], "")
    assert not unisonos.continuo_sin_realizar("couperin_clavecin", ["Harpsichord", "Harpsichord"], "Couperin")

def _ac(cif, tono, grado, compas, unisono=0):
    return {"compas": compas, "parte": 1.0, "tono": tono, "modo": "major" if tono[0].isupper() else "minor",
            "cifrado": cif, "etiqueta_original": cif, "grado": grado, "alteracion": 0,
            "calidad": "major" if cif[0].isupper() else "minor", "inversion": 0, "secundaria": None,
            "septima": 0, "pcs": None, "cadencia": None, "cambios": None, "obra": 1, "unisono": unisono}

def test_no_hay_modulacion_ni_cadencia_a_traves_del_unisono():
    ac = [_ac("I", "C", 1, 1), _ac("V", "C", 5, 2), _ac("I", "G", 1, 3, 1), _ac("V", "G", 5, 4, 1),
          _ac("I", "C", 1, 5), _ac("V", "C", 5, 6), _ac("I", "C", 1, 7)]
    tonos = []
    ti = lambda t: tonos.index(t) if t in tonos else (tonos.append(t) or len(tonos) - 1)
    fila, comp, hits = datos_analisis(ac, 1, ti, _conc())
    assert [len(x) for x in fila] == [6, 6, 7, 7, 6, 6, 6]       # 7.º campo = unísono
    assert not hits["modulacion"]
    assert [h[1] for h in hits["v_i"]] == [7]   # V→I de c. 2-3 cruzaría el pasaje
    assert [c[0] for c in comp] == [1, 2, 5, 6, 7] and not any(c[13] for c in comp)
    for a in ac:
        a["unisono"] = 0
    _, comp, hits = datos_analisis(ac, 1, ti, _conc())
    assert len(hits["modulacion"]) == 2 and any(c[13] for c in comp)

def test_rango_no_cruza_una_repeticion_desplegada():
    # análisis en orden de interpretación: … 15 16 | 1 2 … (repetición desplegada)
    seg = [{"compas": c, "parte": 1.0, "tono": "C"} for c in (14, 15, 16, 1, 2)]
    # progresión de 5 acordes desde el c. 14 que, sin el arreglo, terminaba en el c. 1 (fin < inicio)
    assert unisonos.fila_hit(7, seg, 0, "x", 5) == [7, 14, 1.0, "C", "x", 14, 16]
    # cadencia (n = 2) cuyo acorde anterior está antes del salto: el rango empieza en el propio acorde
    assert unisonos.fila_hit(7, seg, 3, "y", 2)[5:] == [1, 2]
    # sin salto, igual que antes: del acorde anterior al último
    assert unisonos.fila_hit(7, seg, 1, "z", 2)[5:] == [14, 16]

def test_sin_repetidos():
    assert unisonos.sin_repetidos([[1, 2], [1, 2], [1, 3]]) == [[1, 2], [1, 3]]
