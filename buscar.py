#!/usr/bin/env python3
"""
Consulta el índice armónico por concepto o por texto libre.

    python buscar.py "cadencia rota"                 # texto libre
    python buscar.py napolitana --compositor Chopin  # filtro por compositor
    python buscar.py --lista                         # conceptos disponibles
    python buscar.py "sexta aumentada" --json        # salida para otra app

Cada detector trabaja sobre la secuencia de acordes de una obra
(lista de dicts con las columnas de la tabla `acordes`).
"""
import sys, sqlite3, json, argparse, unicodedata, re
from pathlib import Path
from collections import defaultdict

AQUI = Path(__file__).resolve().parent
DB = AQUI / "indice.sqlite"

# ---------------------------------------------------------------------------
# Detectores. Reciben la lista de acordes de una obra (en orden) y devuelven
# [(indice_del_acorde_clave, etiqueta_legible, longitud_en_acordes)].
# ---------------------------------------------------------------------------
def _misma_tonalidad(a, b):
    return a["tono"] == b["tono"]

def _es_V(a):
    return a["grado"] == 5 and not a["secundaria"] and a["calidad"] in ("major", "dominant-seventh", "dominant")

def _es_I(a):
    return a["grado"] == 1 and not a["secundaria"] and a["alteracion"] == 0

def _es_64_cadencial(a):
    return a["cifrado"].startswith("Cad64") or (_es_I(a) and a["inversion"] == 2)

def _es_viio(a):
    return a["grado"] == 7 and not a["secundaria"] and a["calidad"] in ("diminished", "diminished-seventh", "half-diminished-seventh")

def cadencia_rota(ac):
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if _misma_tonalidad(a, b) and _es_V(a) and b["grado"] == 6 and not b["secundaria"] \
           and b["inversion"] == 0 and b["alteracion"] in (0, -1):
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def cadencia_autentica_perfecta(ac):
    """V(7) en estado fundamental → I en estado fundamental (misma tonalidad)."""
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if _misma_tonalidad(a, b) and _es_V(a) and a["inversion"] == 0 and _es_I(b) and b["inversion"] == 0:
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def semicadencia(ac):
    """Llegada a V tras ii, IV, I6 o 64 cadencial, al final de frase (heurística: V en parte fuerte seguido de cambio)."""
    out = []
    for i in range(1, len(ac)):
        a, b = ac[i - 1], ac[i]
        if _misma_tonalidad(a, b) and _es_V(b) and b["inversion"] == 0 and b["parte"] == 1.0 \
           and a["grado"] in (2, 4) and not a["secundaria"]:
            out.append((i, f'{a["cifrado"]} → {b["cifrado"]} (semicadencia)', 2))
    return out

def cadencia_frigia(ac):
    """iv6 → V en modo menor (bajo desciende por semitono)."""
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if _misma_tonalidad(a, b) and a["modo"] == "minor" and a["grado"] == 4 and a["inversion"] == 1 \
           and a["calidad"] == "minor" and not a["secundaria"] and _es_V(b) and b["inversion"] == 0:
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def cadencia_plagal(ac):
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if _misma_tonalidad(a, b) and a["grado"] == 4 and not a["secundaria"] and a["inversion"] == 0 \
           and _es_I(b) and b["inversion"] == 0 and b["parte"] == 1.0:
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def napolitana(ac):
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac)
            if a["cifrado"].startswith("N") or (a["grado"] == 2 and a["alteracion"] == -1 and a["calidad"] == "major")]

def napolitana_a_dominante(ac):
    """bII6 → V o bII6 → I64 → V."""
    out = []
    nap = {i for i, _, _ in napolitana(ac)}
    for i in nap:
        for j in (i + 1, i + 2):
            if j < len(ac) and _misma_tonalidad(ac[i], ac[j]) and _es_V(ac[j]):
                out.append((i, " → ".join(x["cifrado"] for x in ac[i:j + 1]), j - i + 1)); break
    return out

def sexta_aumentada(ac):
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac) if a["cifrado"][:2] in ("It", "Fr", "Ge", "Sw")]

def sexta_aumentada_italiana(ac):  return [x for x in sexta_aumentada(ac) if x[1].startswith("It")]
def sexta_aumentada_francesa(ac):  return [x for x in sexta_aumentada(ac) if x[1].startswith("Fr")]
def sexta_aumentada_alemana(ac):   return [x for x in sexta_aumentada(ac) if x[1].startswith("Ge")]

def sexta_aumentada_a_64(ac):
    """Sexta aumentada alemana que resuelve en 64 cadencial (evita quintas paralelas)."""
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if a["cifrado"].startswith("Ger") and _misma_tonalidad(a, b) and _es_64_cadencial(b):
            out.append((i, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def dominante_secundaria(ac):
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac) if a["secundaria"] and a["grado"] == 5]

def dominante_secundaria_resuelta(ac):
    """V/x seguido efectivamente de x."""
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if a["secundaria"] and a["grado"] == 5 and _misma_tonalidad(a, b) and not b["secundaria"]:
            objetivo = a["secundaria"]
            if re.sub(r"[^ivIV]", "", objetivo).upper() == re.sub(r"[^ivIV]", "", b["cifrado"]).upper():
                out.append((i, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def dominante_de_la_dominante(ac):
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac) if a["secundaria"] in ("V", "v") and a["grado"] == 5]

def septima_disminuida_secundaria(ac):
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac)
            if a["secundaria"] and a["grado"] == 7 and a["septima"] and a["calidad"] == "diminished" and "ø" not in a["cifrado"]]

def sexta_cuarta_cadencial(ac):
    """I64 → V(7) en la misma tonalidad."""
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if _misma_tonalidad(a, b) and _es_64_cadencial(a) and _es_V(b):
            out.append((i, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def intercambio_modal(ac):
    """Acordes prestados del modo paralelo en tonalidad mayor: iv, bVI, bIII, iiø, bVII, i."""
    out = []
    for i, a in enumerate(ac):
        if a["modo"] != "major" or a["secundaria"]:
            continue
        c = a["cifrado"]
        if (a["grado"] == 4 and a["calidad"] == "minor") or c.startswith(("bVI", "bIII", "bVII", "iiø", "iio")) \
           or (a["grado"] == 1 and a["calidad"] == "minor"):
            out.append((i, c, 1))
    return out

# ---------------------------------------------------------------------------
# Clasificación de la modulación: diatónica, cromática, enarmónica o directa.
#
# Se miran los dos acordes de la frontera: el último en la tonalidad de
# partida (A, escrito en k1) y el primero en la de llegada (B, escrito en k2).
#   enarmónica: A o B es una séptima disminuida o un acorde de séptima de
#               dominante / sexta alemana que, en la otra tonalidad, solo tiene
#               sentido funcional reescrito enarmónicamente (Ger65 = V7, viio7 = viio7
#               de otra fundamental).
#   diatónica:  A pertenece también a k2, o B también a k1 (acorde pivote común),
#               comparando nombres de nota, no clases de altura.
#   cromática:  hay un semitono cromático entre A y B (misma letra, otra
#               alteración: re → re♭), o el pivote es alterado en una tonalidad y
#               diatónico en la otra.
#   directa:    nada de lo anterior; cambio de tono sin preparación.
# ---------------------------------------------------------------------------
from functools import lru_cache

@lru_cache(maxsize=None)
def _key(tono):
    from music21 import key as mkey
    return mkey.Key(tono)

def _rn(fig, tono):
    # Mismo convenio que el lector de RomanText: en menor, #vi / #vii = 6º y 7º elevados
    from music21 import roman
    M = roman.Minor67Default.CAUTIONARY
    return roman.RomanNumeral(fig, _key(tono), sixthMinor=M, seventhMinor=M)

@lru_cache(maxsize=None)
def _acorde(cifrado, tono):
    """(nombres de nota ordenados, alturas con octava en orden de voces) o None."""
    try:
        ps = _rn(cifrado, tono).pitches
    except Exception:
        return None
    return tuple(sorted({p.name for p in ps})), tuple(p.nameWithOctave for p in ps)

def _notas(cifrado, tono):
    a = _acorde(cifrado, tono)
    return a[0] if a else None

@lru_cache(maxsize=None)
def _escala(tono):
    k = _key(tono)
    nombres = {p.name for p in k.getPitches()}
    if k.mode == "minor":  # natural + 6º y 7º elevados (armónica / melódica)
        for g in (6, 7):
            nombres.add(k.pitchFromDegree(g).transpose("A1").name)
    return frozenset(nombres)

def _diatonico(notas, tono):
    return notas is not None and set(notas) <= _escala(tono)

def _cifrar_en(cifrado, tono_origen, tono_destino):
    """Cifrado del mismo acorde (con su inversión) en otra tonalidad."""
    from music21 import roman, chord
    a = _acorde(cifrado, tono_origen)
    if not a:
        return "?"
    try:
        fig = roman.romanNumeralFromChord(chord.Chord(list(a[1])), _key(tono_destino)).figure
    except Exception:
        return "?"
    if _key(tono_destino).mode == "minor":  # music21 llama bVI / bVII / bIII a los grados naturales
        for g in ("VII", "VI", "III", "vii", "vi", "iii"):
            if fig.startswith("b" + g):
                fig = fig[1:]; break
    return fig

_DESTINOS = {"major": ("ii", "iii", "IV", "V", "vi"), "minor": ("III", "iv", "v", "V", "VI", "VII")}

@lru_cache(maxsize=None)
def _funcionales(tono):
    """{clases de altura: [(cifrado, nombres)]} para V7, viio7, Ger6 y dominantes secundarias."""
    k = _key(tono); d = {}
    figs = ["V7", "viio7", "Ger65"] + [f"{f}/{g}" for f in ("V7", "viio7") for g in _DESTINOS[k.mode]]
    for f in figs:
        try:
            rn = _rn(f, tono)
        except Exception:
            continue
        pcs = frozenset(p.pitchClass for p in rn.pitches)
        d.setdefault(pcs, []).append((f, frozenset(p.name for p in rn.pitches)))
    return d

def _tipo_sonoridad(notas):
    """'dim7' (séptima disminuida), 'mm7' (séptima de dominante / sexta alemana) o None.
    Se comparan los intervalos en orden cíclico, para no confundir con ø7 ni con m7."""
    from music21 import pitch
    if not notas:
        return None
    pcs = sorted({pitch.Pitch(n).pitchClass for n in notas})
    if len(pcs) != 4:
        return None
    ints = [(pcs[(j + 1) % 4] - pcs[j]) % 12 for j in range(4)]
    rot = [tuple(ints[j:] + ints[:j]) for j in range(4)]
    if (3, 3, 3, 3) in rot:
        return "dim7"
    if (4, 3, 3, 2) in rot:
        return "mm7"
    return None

def _es_ambigua(notas):
    return _tipo_sonoridad(notas) is not None

def _info(cifrado, tono):
    """(raíz, inversión, clases de altura, tipo de sonoridad) o None."""
    try:
        r = _rn(cifrado, tono)
    except Exception:
        return None
    pcs = frozenset(p.pitchClass for p in r.pitches)
    return r.root().pitchClass, r.inversion(), pcs, _tipo_sonoridad(tuple(p.name for p in r.pitches)), r

def _es_resolucion(info):
    """Acorde que puede ser destino de una resolución: tríada mayor/menor o séptima de dominante."""
    if not info:
        return False
    r = info[4]
    cif = r.figure
    import re as _re
    if info[3] == "dim7" or cif.startswith(("Ger", "Fr", "It", "Sw")) or _re.match(r"^[b#-]*[ivIV]+[oø]", cif):
        return False
    return r.quality not in ("diminished", "half-diminished", "augmented")

def _nombre_grado(pc, tono):
    k = _key(tono)
    d = (pc - k.tonic.pitchClass) % 12
    if k.mode == "minor":
        return ["I", "bII", "II", "III", "#III", "IV", "#IV", "V", "VI", "#VI", "VII", "#VII"][d]
    return ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"][d]

def _enarmonica_por_resolucion(A, k1, B, k2):
    """A (escrito en k1) es 7ª disminuida o V7/Ger6 y B resuelve según la lectura enarmónica.
    Devuelve (detalle, cifrado de la reinterpretación en k2) o None."""
    iA, iB = _info(A["cifrado"], k1), _info(B["cifrado"], k2)
    if not iA or not iB or not iA[3] or not _es_resolucion(iB):
        return None
    rA, _, pcsA, tipo, rnA = iA
    rB, invB = iB[0], iB[1]
    destino = "" if rB == _key(k2).tonic.pitchClass else "/" + _nombre_grado(rB, k2)
    if tipo == "dim7":
        if rB == (rA + 1) % 12 or rB not in {(p + 1) % 12 for p in pcsA}:
            return None
        fig = "viio7" + destino
    elif A["cifrado"].startswith(("Ger", "Fr", "It", "Sw")):
        b6 = (_key(k1).tonic.pitchClass + 8) % 12
        if rB != (b6 + 5) % 12:
            return None                      # resuelve como sexta aumentada: lectura normal
        fig = "V7" + destino
    else:
        if rB == (rA - 1) % 12 and _key(k2).pitchFromDegree(5).pitchClass == rB:
            fig = "Ger65"                    # V7 que resuelve medio tono abajo, sobre la dominante de k2
        elif rB == (rA + 4) % 12 and invB == 2 and rB == _key(k2).tonic.pitchClass:
            fig = "Ger65"                    # … o al 6/4 cadencial de k2
        else:
            return None
    return f'{A["cifrado"]} en {k1} = {fig} en {k2}', fig

def _resuelve_en(X, A, k1):
    """True si A es la resolución normal, en k1, del acorde ambiguo X.
    Si la sonoridad ya ha resuelto en la tonalidad de partida, no puede ser el pivote
    de la modulación (p. ej. F: viio7 → I, d: viio7 → i es una secuencia, no una enarmonía)."""
    iX, iA = _info(X["cifrado"], k1), _info(A["cifrado"], k1)
    if not iX or not iA or not iX[3] or not _es_resolucion(iA):
        return False
    rX, rA = iX[0], iA[0]
    if iX[3] == "dim7":
        return rA == (rX + 1) % 12                     # vii°7 → acorde medio tono arriba
    if X["cifrado"].startswith(("Ger", "Fr", "It", "Sw")):
        k = _key(k1)                                   # +6 → V, o → 6/4 cadencial
        return rA == k.pitchFromDegree(5).pitchClass or (rA == k.tonic.pitchClass and iA[1] == 2)
    return rA == (rX + 5) % 12                         # V7 → I

def _enarmonica_por_doble_cifrado(X, kx, B, k2):
    """El analista cifra la misma sonoridad ambigua en las dos tonalidades con distinta grafía."""
    iX, iB = _info(X["cifrado"], kx), _info(B["cifrado"], k2)
    if not iX or not iB or not iX[3] or iX[2] != iB[2]:
        return None
    nX, nB = _notas(X["cifrado"], kx), _notas(B["cifrado"], k2)
    if nX and nB and set(nX) != set(nB):
        return f'{X["cifrado"]} en {kx} = {B["cifrado"]} en {k2}', B["cifrado"]
    return None

# ---- comprobación con la grafía real de la partitura ----
import os
CORPUS = Path(os.environ.get("CORPUS", "/tmp/wir/Corpus"))

@lru_cache(maxsize=512)
def _partitura(obra):
    row = sqlite3.connect(DB).execute("SELECT partitura FROM obras WHERE id=?", (obra,)).fetchone()
    if not row or not row[0] or not (CORPUS / row[0]).exists():
        return None
    from music21 import converter
    try:
        return converter.parse(str(CORPUS / row[0]))
    except Exception:
        return None

def _grafia(obra, compas, parte):
    """Nombres de nota escritos en la partitura que suenan en ese compás y parte (None sin partitura)."""
    s = _partitura(obra)
    if s is None:
        return None
    nombres = set()
    for part in s.parts:
        try:
            m = part.measure(compas)
        except Exception:
            m = None
        if m is None:
            continue
        ts = m.getContextByClass("TimeSignature")
        bd = ts.beatDuration.quarterLength if ts else 1.0
        off = (parte - 1) * bd - (m.paddingLeft or 0)
        for n in m.recurse().notes:
            o = n.getOffsetInHierarchy(m)
            if o - 1e-6 <= off < o + n.quarterLength - 1e-6:
                nombres.update(p.name for p in n.pitches)
    return nombres

def _grafia_confirma(X, kx, fig2, k2):
    """True si el compositor escribe el acorde con la grafía de la tonalidad de partida.
    Una 7ª disminuida sin partitura que lo confirme no se acepta; un V7/Ger6 sí (su cambio de
    función ya lo prueba la resolución)."""
    n1 = set(_notas(X["cifrado"], kx) or ())
    n2 = set(_notas(fig2, k2) or ())
    tipo = _tipo_sonoridad(tuple(n1))
    escrito = _grafia(X["obra"], X["compas"], X["parte"]) if "obra" in X else None
    if not escrito or not n1 or not n2:
        return tipo == "mm7"
    propias1, propias2 = n1 - n2, n2 - n1
    if escrito & propias1 and not escrito & propias2:
        return True                          # escrito como en la tonalidad de partida
    if escrito & propias2 and not escrito & propias1:
        return False                         # ya escrito como en la tonalidad nueva
    if escrito & propias1 and escrito & propias2:
        return True                          # reescrito dentro del mismo acorde
    return tipo == "mm7"

def _semitono_cromatico(n1, n2):
    if not n1 or not n2:
        return None
    from music21 import pitch
    for a in n1:
        pa = pitch.Pitch(a)
        for b in n2:
            pb = pitch.Pitch(b)
            if pa.step == pb.step and pa.name != pb.name and (pa.pitchClass - pb.pitchClass) % 12 in (1, 11):
                return f"{_es_nota(a)} → {_es_nota(b)}"
    return None

_ES = {"C": "do", "D": "re", "E": "mi", "F": "fa", "G": "sol", "A": "la", "B": "si"}
def _es_nota(n):
    return _ES[n[0]] + n[1:].replace("--", "𝄫").replace("-", "♭").replace("##", "𝄪").replace("#", "♯")

def clasificar_modulacion(ac, i):
    """(tipo, detalle) para el cambio de tono entre ac[i-1] y ac[i]."""
    A, B = ac[i - 1], ac[i]
    k1, k2 = A["tono"], B["tono"]
    nA, nB = _notas(A["cifrado"], k1), _notas(B["cifrado"], k2)
    A2 = ac[i - 2] if i >= 2 and ac[i - 2]["tono"] == k1 else None
    nA2 = _notas(A2["cifrado"], k1) if A2 else None

    # 1. enarmónica: una 7ª disminuida o un V7/Ger6 escrito en k1 resuelve según su lectura
    #    enarmónica en k2, o el analista cifra la misma sonoridad en las dos tonalidades
    #    Si A2 ya resolvió en k1 (A es su resolución), A2 no es pivote: la sonoridad vuelve
    #    en B, y solo hay enarmonía si B está escrito con la grafía de k1 (se comprueba en B).
    X2 = A2
    if A2 and _resuelve_en(A2, A, k1):
        X2 = dict(B, cifrado=A2["cifrado"])
    for X, r in ((A, _enarmonica_por_resolucion(A, k1, B, k2)),
                 (A, _enarmonica_por_doble_cifrado(A, k1, B, k2)),
                 (X2, A2 and _enarmonica_por_doble_cifrado(A2, k1, B, k2))):
        if r and _grafia_confirma(X, k1, r[1], k2):
            return "enarmonica", r[0]

    # 2. diatónica: un acorde diatónico en las dos tonalidades (último o penúltimo de k1, o primero de k2)
    for X, nX, kx, ky in ((A, nA, k1, k2), (B, nB, k2, k1), (A2, nA2, k1, k2)):
        if X and _diatonico(nX, kx) and _diatonico(nX, ky):
            otro = _cifrar_en(X["cifrado"], kx, ky)
            izq, der = (X["cifrado"], otro) if kx == k1 else (otro, X["cifrado"])
            return "diatonica", f"pivote: {izq} en {k1} = {der} en {k2}"

    # 3. cromática: semitono cromático en la frontera o acorde alterado en una tonalidad y diatónico en la otra
    s = _semitono_cromatico(nA, nB) or (A2 and not _diatonico(nA, k1) and _semitono_cromatico(nA2, nA))
    if s:
        return "cromatica", f"semitono cromático {s}"
    if nA and not _diatonico(nA, k1) and _diatonico(nA, k2):
        return "cromatica", f'pivote alterado: {A["cifrado"]} en {k1} = {_cifrar_en(A["cifrado"], k1, k2)} en {k2}'
    if nB and not _diatonico(nB, k2) and _diatonico(nB, k1):
        return "cromatica", f'pivote alterado: {_cifrar_en(B["cifrado"], k2, k1)} en {k1} = {B["cifrado"]} en {k2}'

    # acorde cromático común: la misma sonoridad, con la misma escritura, es dominante
    # secundaria / séptima disminuida / sexta alemana en las dos tonalidades
    for X, nX, kx, ky in ((A, nA, k1, k2), (B, nB, k2, k1)):
        if nX:
            from music21 import pitch
            pcs = frozenset(pitch.Pitch(n).pitchClass for n in nX)
            iguales = [c for c in _funcionales(ky).get(pcs, []) if c[1] == frozenset(nX)]
            if iguales:
                izq, der = (X["cifrado"], iguales[0][0]) if kx == k1 else (iguales[0][0], X["cifrado"])
                return "cromatica", f"acorde alterado común: {izq} en {k1} = {der} en {k2}"

    # 4. directa (se indica la nota común si la hay, escrita o enarmónica)
    if nA and nB:
        from music21 import pitch
        comunes = [(a, b) for a in nA for b in nB if pitch.Pitch(a).pitchClass == pitch.Pitch(b).pitchClass]
        if comunes:
            a, b = comunes[0]
            nota = _es_nota(a) if a == b else f"{_es_nota(a)} = {_es_nota(b)}"
            return "directa", f"sin acorde pivote; nota común {nota}"
    return "directa", "sin acorde pivote ni nota común"

TIPO_ES = {"diatonica": "diatónica", "cromatica": "cromática", "enarmonica": "enarmónica", "directa": "directa"}

def modulacion(ac):
    """Cualquier cambio de tonalidad marcado por el analista, con su tipo."""
    out = []
    for i in range(1, len(ac)):
        if ac[i]["tono"] != ac[i - 1]["tono"]:
            tipo, det = clasificar_modulacion(ac, i)
            out.append((i, f'{ac[i-1]["tono"]} → {ac[i]["tono"]} · {TIPO_ES[tipo]} · {det}', 2))
    return out

def _modulacion_tipo(tipo):
    def det(ac):
        return [(i, et, n) for i, et, n in modulacion(ac) if f"· {TIPO_ES[tipo]} ·" in et]
    det.__doc__ = f"Modulación {TIPO_ES[tipo]}"
    return det

modulacion_diatonica = _modulacion_tipo("diatonica")
modulacion_cromatica = _modulacion_tipo("cromatica")
modulacion_enarmonica = _modulacion_tipo("enarmonica")
modulacion_directa = _modulacion_tipo("directa")

def modulacion_a_relativo(ac):
    """Modulación entre relativos (mayor ↔ relativo menor)."""
    from music21 import key as mkey
    out = []
    for i, et, n in modulacion(ac):
        k1 = mkey.Key(ac[i - 1]["tono"]); k2 = mkey.Key(ac[i]["tono"])
        if k1.relative.tonicPitchNameWithCase == k2.tonicPitchNameWithCase:
            out.append((i, et, n))
    return out

def modulacion_a_dominante(ac):
    from music21 import key as mkey
    out = []
    for i, et, n in modulacion(ac):
        k1 = mkey.Key(ac[i - 1]["tono"]); k2 = mkey.Key(ac[i]["tono"])
        if k2.tonic.pitchClass == (k1.tonic.pitchClass + 7) % 12:
            out.append((i, et, n))
    return out

def modulacion_a_homonimo(ac):
    out = []
    for i, et, n in modulacion(ac):
        if ac[i]["tono"].lower() == ac[i - 1]["tono"].lower():
            out.append((i, et, n))
    return out

def modulacion_a_tercera(ac):
    """Modulación por terceras (mediante / submediante cromática)."""
    from music21 import key as mkey
    out = []
    for i, et, n in modulacion(ac):
        k1 = mkey.Key(ac[i - 1]["tono"]); k2 = mkey.Key(ac[i]["tono"])
        d = (k2.tonic.pitchClass - k1.tonic.pitchClass) % 12
        if d in (3, 4, 8, 9) and ac[i]["tono"].lower() != ac[i - 1]["tono"].lower():
            out.append((i, et, n))
    return out

PEDAL_MIN_COMPASES = 2

def _pedal_dura_bastante(ac, i, j, minimo=PEDAL_MIN_COMPASES):
    """¿La dominante se mantiene en el bajo al menos `minimo` compases completos?
    Se mide desde el primer acorde de la pedal hasta el primer acorde que la
    abandona (o hasta el final del último compás si la obra acaba en ella)."""
    c0, p0 = ac[i]["compas"], ac[i]["parte"] or 1
    if j < len(ac):
        c1, p1 = ac[j]["compas"], ac[j]["parte"] or 1
    else:
        c1, p1 = ac[-1]["compas"] + 1, 1
    if c0 is None or c1 is None:
        return False
    return (c1 - c0) > minimo or ((c1 - c0) == minimo and p1 >= p0)

def _ajeno_a_la_dominante(a):
    """Acorde que, sobre la nota pedal, no es la propia dominante ni su 6/4 cadencial."""
    return not _es_V(a) and not _es_64_cadencial(a)

def pedal_de_dominante(ac):
    """Dominante sostenida en el bajo ≥2 compases completos, con ≥2 cambios de acorde encima y al menos uno ajeno a V y al 6/4 cadencial.

    La dominante puede estar ligada, repetida o cambiar de octava. Un simple
    I64 → V(7), aunque el bajo salte de octava, es una cadencia 6/4 y no una pedal."""
    from music21 import key as mkey
    out, i = [], 0
    while i < len(ac):
        if not ac[i]["bajo"]:
            i += 1; continue
        k = mkey.Key(ac[i]["tono"]); dom = k.pitchFromDegree(5).name
        j = i
        while j < len(ac) and ac[j]["tono"] == ac[i]["tono"] and ac[j]["bajo"] == dom:
            j += 1
        tramo = ac[i:j]
        cambios = sum(1 for a, b in zip(tramo, tramo[1:]) if a["cifrado"] != b["cifrado"])
        if cambios >= 2 and any(_ajeno_a_la_dominante(a) for a in tramo) \
           and _pedal_dura_bastante(ac, i, j):
            out.append((i, " ".join(x["cifrado"] for x in tramo), j - i))
        i = max(j, i + 1)
    return out

def acorde_vecino_cromatico(ac):
    """Acordes con alteración (#, b) que no son napolitana ni sexta aumentada ni secundarios."""
    return [(i, a["cifrado"], 1) for i, a in enumerate(ac)
            if a["alteracion"] != 0 and not a["secundaria"] and not a["cifrado"].startswith(("N", "bII"))
            and a["cifrado"][:2] not in ("It", "Fr", "Ge")]

CONCEPTOS = {
    "cadencia_rota": (cadencia_rota, "V → vi / VI"),
    "cadencia_autentica_perfecta": (cadencia_autentica_perfecta, "V → I ambos en fundamental"),
    "semicadencia": (semicadencia, "ii/IV → V en parte fuerte"),
    "cadencia_frigia": (cadencia_frigia, "iv6 → V en menor"),
    "cadencia_plagal": (cadencia_plagal, "IV → I"),
    "napolitana": (napolitana, "acorde de II rebajado"),
    "napolitana_a_dominante": (napolitana_a_dominante, "bII6 → (I64) → V"),
    "sexta_aumentada": (sexta_aumentada, "It / Fr / Ger"),
    "sexta_aumentada_italiana": (sexta_aumentada_italiana, "It6"),
    "sexta_aumentada_francesa": (sexta_aumentada_francesa, "Fr43"),
    "sexta_aumentada_alemana": (sexta_aumentada_alemana, "Ger65"),
    "sexta_aumentada_a_64": (sexta_aumentada_a_64, "Ger65 → I64"),
    "dominante_secundaria": (dominante_secundaria, "V/x"),
    "dominante_secundaria_resuelta": (dominante_secundaria_resuelta, "V/x → x"),
    "dominante_de_la_dominante": (dominante_de_la_dominante, "V/V"),
    "septima_disminuida_secundaria": (septima_disminuida_secundaria, "viio7/x"),
    "sexta_cuarta_cadencial": (sexta_cuarta_cadencial, "I64 → V"),
    "intercambio_modal": (intercambio_modal, "iv, bVI, bIII, iiø… en mayor"),
    "modulacion": (modulacion, "cualquier cambio de tonalidad"),
    "modulacion_diatonica": (modulacion_diatonica, "por acorde común a las dos tonalidades"),
    "modulacion_cromatica": (modulacion_cromatica, "por semitono cromático o pivote alterado"),
    "modulacion_enarmonica": (modulacion_enarmonica, "7ª disminuida o V7 / sexta alemana reinterpretada; comprobado con la grafía de la partitura"),
    "modulacion_directa": (modulacion_directa, "sin acorde común ni enlace cromático"),
    "modulacion_a_relativo": (modulacion_a_relativo, "mayor ↔ relativo menor"),
    "modulacion_a_dominante": (modulacion_a_dominante, "a la tonalidad de la dominante"),
    "modulacion_a_homonimo": (modulacion_a_homonimo, "mayor ↔ menor homónimo"),
    "modulacion_a_tercera": (modulacion_a_tercera, "a mediante / submediante"),
    "pedal_de_dominante": (pedal_de_dominante, "dominante sostenida en el bajo ≥2 compases con armonías ajenas encima"),
    "acorde_vecino_cromatico": (acorde_vecino_cromatico, "otros acordes alterados"),
}

# ---------------------------------------------------------------------------
# Capa de lenguaje natural: sinónimos en español → concepto.
# Sustituible por una llamada a un LLM que devuelva uno de los nombres de CONCEPTOS.
# ---------------------------------------------------------------------------
SINONIMOS = {
    "cadencia_rota": ["cadencia rota", "cadencia interrumpida", "rota", "v vi", "quinto sexto"],
    "cadencia_autentica_perfecta": ["cadencia perfecta", "cadencia autentica", "cadencia conclusiva", "v i"],
    "semicadencia": ["semicadencia", "cadencia suspensiva", "media cadencia"],
    "cadencia_frigia": ["frigia", "cadencia frigia", "iv6 v"],
    "cadencia_plagal": ["plagal", "cadencia plagal", "iv i", "amen"],
    "napolitana_a_dominante": ["napolitana", "sexta napolitana", "dominante", "a la dominante", "resuel", "resolv", "64"],
    "napolitana": ["napolitana", "sexta napolitana", "segundo rebajado", "ii rebajado", "bii", "neapolitan"],
    "sexta_aumentada_a_64": ["alemana", "sexta aumentada", "64 cadencial", "sexta y cuarta cadencial", "cuarta y sexta", "i64", "64", "resolviendo en 64", "cadencial"],
    "sexta_aumentada_italiana": ["italiana", "sexta italiana"],
    "sexta_aumentada_francesa": ["francesa", "sexta francesa"],
    "sexta_aumentada_alemana": ["alemana", "sexta alemana"],
    "sexta_aumentada": ["sexta aumentada", "sextas aumentadas", "aumentada"],
    "dominante_de_la_dominante": ["dominante de la dominante", "v/v", "v de v", "doble dominante"],
    "dominante_secundaria_resuelta": ["dominante secundaria", "dominantes secundarias", "resuel", "resolv"],
    "dominante_secundaria": ["dominante secundaria", "dominantes secundarias", "dominante auxiliar", "v/", "tonicizacion", "tonicización"],
    "septima_disminuida_secundaria": ["septima disminuida secundaria", "disminuida secundaria", "viio7/", "septima disminuida como dominante"],
    "sexta_cuarta_cadencial": ["sexta y cuarta cadencial", "64 cadencial", "cuarta y sexta cadencial", "i64 v", "sexta cuarta"],
    "intercambio_modal": ["intercambio modal", "prestamo modal", "préstamo modal", "acorde prestado", "mixtura", "cuarto grado menor en mayor", "sexto rebajado"],
    "modulacion_a_relativo": ["modulacion al relativo", "modulación al relativo", "relativo menor", "relativo mayor", "al relativo"],
    "modulacion_a_dominante": ["modulacion a la dominante", "modulación a la dominante", "a la dominante", "tono de la dominante"],
    "modulacion_a_homonimo": ["homonimo", "homónimo", "mayor menor homonimo", "cambio de modo"],
    "modulacion_a_tercera": ["modulacion por terceras", "mediante cromatica", "tercera cromatica", "relacion de tercera", "por terceras"],
    "modulacion": ["modulacion", "modulación", "cambio de tonalidad", "modula"],
    "modulacion_diatonica": ["modulacion diatonica", "diatonica", "acorde pivote", "acorde comun", "pivote diatonico", "acorde de enlace"],
    "modulacion_cromatica": ["modulacion cromatica", "cromatica", "semitono cromatico", "pivote cromatico", "alteracion cromatica"],
    "modulacion_enarmonica": ["modulacion enarmonica", "enarmonica", "enarmonico", "enarmonia", "reinterpretacion enarmonica"],
    "modulacion_directa": ["modulacion directa", "directa", "brusca", "sin pivote", "sin preparacion", "modulacion de frase"],
    "pedal_de_dominante": ["pedal de dominante", "pedal", "nota pedal", "bajo pedal", "pedal dominante"],
    "acorde_vecino_cromatico": ["acorde alterado", "cromatico", "cromático", "alterado"],
}

# Conceptos compuestos: todos los grupos deben aparecer en la consulta.
REQUIERE = {
    "sexta_aumentada_a_64": [["alemana", "sexta aumentada", "aumentada"], ["64", "cadencial", "sexta y cuarta", "cuarta y sexta"]],
    "napolitana_a_dominante": [["napolitana", "bii", "segundo rebajado", "ii rebajado"], ["dominante", "resuel", "resolv", "64"]],
    "dominante_secundaria_resuelta": [["dominante secundaria", "dominantes secundarias"], ["resuel", "resolv"]],
}

def _norm(t):
    t = unicodedata.normalize("NFD", t.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")

def interpretar(texto):
    """Devuelve el concepto cuyos sinónimos cubren más texto de la consulta.
    Un concepto compuesto (p. ej. alemana + 64 cadencial) gana a sus partes
    porque suma la longitud de todos sus sinónimos presentes."""
    t = _norm(texto)
    if t in CONCEPTOS:
        return t
    puntos = {}
    for concepto, sins in SINONIMOS.items():
        if concepto in REQUIERE and not all(any(_norm(x) in t for x in grupo) for grupo in REQUIERE[concepto]):
            continue
        encontrados = sorted({_norm(s) for s in sins if _norm(s) in t})
        if not encontrados:
            continue
        # evita contar "sexta aumentada" y "aumentada" dos veces: quita los contenidos en otros
        unicos = [s for s in encontrados if not any(s != o and s in o for o in encontrados)]
        puntos[concepto] = sum(len(s) for s in unicos)
    return max(puntos, key=puntos.get) if puntos else None

# ---------------------------------------------------------------------------
def cargar_obras(con, compositor=None, coleccion=None):
    q, p = "SELECT * FROM obras WHERE 1=1", []
    if compositor:
        q += " AND compositor LIKE ?"; p.append(f"%{compositor}%")
    if coleccion:
        q += " AND coleccion LIKE ?"; p.append(f"%{coleccion}%")
    con.row_factory = sqlite3.Row
    return [dict(r) for r in con.execute(q, p)]

def acordes_de(con, obra_id):
    con.row_factory = sqlite3.Row
    return [dict(r) for r in con.execute("SELECT * FROM acordes WHERE obra=? ORDER BY pos", (obra_id,))]

def buscar(concepto, compositor=None, coleccion=None, maximo=None, por_obra=None, db=DB):
    detector = CONCEPTOS[concepto][0]
    con = sqlite3.connect(db)
    res = []
    for obra in cargar_obras(con, compositor, coleccion):
        ac = acordes_de(con, obra["id"])
        hits = detector(ac)
        if por_obra:
            hits = hits[:por_obra]
        for i, etiqueta, n in hits:
            a = ac[i]
            res.append({
                "concepto": concepto, "obra_id": obra["id"], "compositor": obra["compositor"],
                "titulo": obra["titulo"], "coleccion": obra["coleccion"],
                "compas": a["compas"], "parte": a["parte"], "tono": a["tono"],
                "etiqueta": etiqueta, "n_acordes": n, "pos": i,
                "compas_inicio": ac[max(0, i - 1)]["compas"] if n > 1 and i > 0 else a["compas"],
                "compas_fin": ac[min(len(ac) - 1, i + n - 1)]["compas"],
                "partitura": obra["partitura"], "analisis": obra["analisis"],
            })
            if maximo and len(res) >= maximo:
                return res
    return res

def resumen_por_obra(res):
    d = defaultdict(list)
    for r in res:
        d[(r["compositor"], r["titulo"])].append(r)
    return d

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("consulta", nargs="?", help="concepto o texto libre")
    ap.add_argument("--compositor"); ap.add_argument("--coleccion")
    ap.add_argument("--max", type=int, default=40)
    ap.add_argument("--por-obra", type=int, default=2, help="máx. coincidencias por obra (0 = todas)")
    ap.add_argument("--json", action="store_true"); ap.add_argument("--lista", action="store_true")
    a = ap.parse_args()
    if a.lista or not a.consulta:
        for k, (_, d) in CONCEPTOS.items():
            print(f"{k:34} {d}")
        sys.exit()
    concepto = interpretar(a.consulta)
    if not concepto:
        print(f"No reconozco «{a.consulta}». Conceptos: {', '.join(CONCEPTOS)}"); sys.exit(1)
    res = buscar(concepto, a.compositor, a.coleccion, a.max, a.por_obra or None)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=1)); sys.exit()
    print(f'\n«{a.consulta}» → {concepto}: {len(res)} coincidencias' + (" (recortado)" if len(res) >= a.max else "") + "\n")
    for r in res:
        print(f'{r["compositor"][:22]:22} | {r["titulo"][:48]:48} | c.{r["compas"]:>3} p.{r["parte"]:<4} | {r["tono"]:>3}: {r["etiqueta"]}')
