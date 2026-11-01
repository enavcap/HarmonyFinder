"""
Rasgos de partitura para las cadencias: lo que el cifrado no dice.

Para cada acorde anotado, a partir de la partitura (alturas reales):
  ini, dur     inicio y duración en negras (hasta el acorde siguiente)
  peso         peso métrico del ataque: 3 primera parte del compás · 2 mitad del compás (compases de
               4 partes o 6/8, 12/8…) · 1 otra parte · 0 fuera de parte
  tiple        clases de altura de la voz más aguda durante la primera parte del acorde
  bajo         clase de altura de la nota más grave al ataque (o la primera que suene)
  calderon     1 si alguna nota con calderón empieza dentro del acorde
  respiro      1 si la voz más aguda descansa (silencio) o se detiene (nota tenida hasta el final
               del acorde, que dura al menos una parte) — la melodía se para en la llegada
"""
from fractions import Fraction
from . import unisonos

def _peso(q, metro):
    b, bt = metro
    compuesto = b % 3 == 0 and (b > 3 or bt >= 8)
    pulso = Fraction(12, bt) if compuesto else Fraction(4, bt)
    partes = b // 3 if compuesto else b
    if q == 0:
        return 3
    if q % pulso:
        return 0
    if partes % 2 == 0 and partes >= 4 and q == pulso * partes / 2:
        return 2
    return 1

def rasgos(datos, acordes):
    """Lista de dicts de rasgos (o None) para los acordes anotados [(compás, parte)] en orden."""
    try:
        cald = set()
        notas, compases = unisonos.leer(datos, midi=True, calderones=cald)
    except Exception:
        return [None] * len(acordes)
    notas.sort()
    ini = unisonos.posiciones(compases, acordes)
    fin_obra = max((b for _, b, _ in notas), default=Fraction(0))
    # compás que contiene cada instante (para el peso métrico)
    starts = [c[1] for c in compases]
    import bisect
    out = []
    for i, s in enumerate(ini):
        if s is None:
            out.append(None); continue
        e = next((x for x in ini[i + 1:] if x is not None and x > s), fin_obra)
        if e <= s:
            out.append(None); continue
        k = max(0, bisect.bisect_right(starts, s) - 1)
        _, c0, _, metro = compases[k]
        b_, bt = metro
        compuesto = b_ % 3 == 0 and (b_ > 3 or bt >= 8)
        pulso = Fraction(12, bt) if compuesto else Fraction(4, bt)
        dentro = [(max(a, s), min(b, e), m) for a, b, m in notas if a < e and b > s]
        # tiple: nota más aguda en cada tramo de la primera parte del acorde
        lim = min(e, s + max(pulso, (e - s) / 2))
        cortes = sorted({s, lim} | {a for a, _, _ in dentro if s < a < lim} | {b for _, b, _ in dentro if s < b < lim})
        tiple, alto = [], []
        for x, y in zip(cortes, cortes[1:]):
            suenan = [m for a, b, m in dentro if a <= x and b >= y]
            if suenan:
                tiple.append(max(suenan) % 12); alto.append(max(suenan))
        al_ataque = [m for a, b, m in dentro if a <= s < b] or [m for a, b, m in dentro]
        # respiro: la voz aguda calla en algún momento del acorde, o su última nota se sostiene ≥1 parte
        cortes2 = sorted({s, e} | {a for a, _, _ in dentro} | {b for _, b, _ in dentro})
        top = []
        for x, y in zip(cortes2, cortes2[1:]):
            suenan = [(m, a) for a, b, m in dentro if a <= x and b >= y]
            top.append((x, y, max(suenan)[0] if suenan else None))
        hueco = any(m is None for _, _, m in top)
        if not hueco and alto:
            techo = max(alto) - 7                         # por debajo, otra voz: la melodía calla
            hueco = any(m is not None and m < techo for _, _, m in top)
        ult = [a for a, b, m in notas if s <= a < e and m >= (max(alto) - 2 if alto else 0)]
        sostiene = bool(alto) and (e - (max(ult) if ult else s)) >= pulso
        out.append({"ini": s, "dur": e - s, "peso": _peso(s - c0, metro), "pulso": pulso,
                    "tiple": tiple, "bajo": min(al_ataque) % 12 if al_ataque else None,
                    "calderon": int(any(s <= c < e for c in cald)), "respiro": int(hueco or sostiene)})
    return out


# ------------------------------------------------------------------ detectores
# Calibrados con las cadencias que anotan los analistas del DCML (subcorpus que las anotan):
# una cadencia es un final de frase, no cualquier V–I. Cada acorde necesita sus rasgos de
# partitura en a["r"] (si faltan, ese acorde no se considera).
from functools import lru_cache
import buscar

GRADO = {0: "1.º", 1: "♭2.º", 2: "2.º", 3: "3.º", 4: "3.º", 5: "4.º", 6: "♯4.º", 7: "5.º", 8: "6.º", 9: "6.º", 10: "7.º", 11: "7.º"}

def _grado_tiple(b):
    """Grado del tiple en la llegada: su primera nota que pertenece al acorde de tónica (tras una apoyatura)."""
    t = _tonica(b["tono"]); acorde = {0, 3 if b["modo"] == "minor" else 4, 7}
    tp = b["r"]["tiple"]
    x = next((m for m in tp if (m - t) % 12 in acorde), tp[0])
    return GRADO[(x - t) % 12]

@lru_cache(maxsize=None)
def _tonica(tono):
    return buscar._key(tono).tonic.pitchClass

def _predominante(x):
    """ii, IV (y sus inversiones), 6/4 cadencial, dominante de la dominante, sextas aumentadas, napolitana."""
    if x is None:
        return False
    c = x["cifrado"]
    return (c.startswith(("Cad64", "It", "Fr", "Ger", "N")) or (x["grado"] in (2, 4) and not x["secundaria"])
            or (x["grado"] == 1 and x["inversion"] == 2 and not x["secundaria"])
            or ((x["secundaria"] or "").lstrip("#b") in ("V", "V7") and x["grado"] in (5, 7)))

def _antecedente(ac, i):
    """El V (en i) viene preparado: predominante justo antes, o V–V con predominante antes."""
    p = ac[i - 1] if i > 0 else None
    if _predominante(p):
        return True
    return p is not None and buscar._es_V(p) and p["tono"] == ac[i]["tono"] and _predominante(ac[i - 2] if i > 1 else None)

def _llegada(a, b):
    """Final de frase: el acorde de llegada cae en parte fuerte (primera o mitad del compás), en una parte
    más fuerte que el anterior (o tras un acorde largo), y dura al menos lo mismo que el anterior."""
    ra, rb = a.get("r"), b.get("r")
    if not ra or not rb:
        return False
    fuerte = rb["peso"] >= 2 and (rb["peso"] > ra["peso"] or ra["dur"] >= 2 * ra["pulso"])
    return fuerte and rb["dur"] >= ra["dur"]

def _tiple_tonica(b):
    """La voz más aguda está en la tónica al llegar (o llega a ella por grado conjunto desde una apoyatura)."""
    t, tp = _tonica(b["tono"]), b["r"]["tiple"]
    return tp[:1] == [t] or (len(tp) > 1 and tp[1] == t and (tp[0] - t) % 12 in (1, 2, 10, 11))

def _autenticas(ac):
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if a["tono"] == b["tono"] and buscar._es_V(a) and a["inversion"] == 0 and buscar._es_I(b) \
           and b["inversion"] == 0 and _antecedente(ac, i) and _llegada(a, b):
            yield i + 1, a, b

def cadencia_autentica_perfecta(ac):
    """V–I en estado fundamental al final de frase (parte fuerte, preparada por un predominante), con la tónica en el tiple."""
    return [(j, f'{a["cifrado"]} → {b["cifrado"]} · tiple en el 1.º grado', 2)
            for j, a, b in _autenticas(ac) if _tiple_tonica(b)]

def cadencia_autentica_imperfecta(ac):
    """V–I en estado fundamental al final de frase, con la 3.ª o la 5.ª del acorde en el tiple."""
    return [(j, f'{a["cifrado"]} → {b["cifrado"]} · tiple en el {_grado_tiple(b)} grado', 2)
            for j, a, b in _autenticas(ac) if not _tiple_tonica(b) and b["r"]["tiple"]]

def semicadencia(ac):
    """Llegada a V en estado fundamental al final de frase: desde un predominante o desde I, en parte fuerte, con la melodía detenida, sin prolongar un V anterior ni seguir en V."""
    es_v = lambda x: x is not None and (buscar._es_V(x) or x["cifrado"].startswith("Cad64"))
    out = []
    for i in range(1, len(ac)):
        a, b = ac[i - 1], ac[i]
        n = ac[i + 1] if i + 1 < len(ac) else None
        if i > 1 and es_v(ac[i - 2]) and ac[i - 2]["tono"] == b["tono"] and (a["secundaria"] or a["grado"] == 1):
            continue                                      # V – V/V – V o V – I – V: prolongación del V, no llegada
        v = (buscar._es_V(b) and b["inversion"] == 0) or b["cifrado"].startswith("Cad64")
        prep = _predominante(a) or (a["grado"] == 1 and not a["secundaria"] and not a["cifrado"].startswith("Cad64"))
        if v and prep and a["tono"] == b["tono"] and _llegada(a, b) and b["r"]["respiro"] \
           and not es_v(n):
            out.append((i, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def _con_calderones(ac):
    """La pieza marca sus finales de frase con calderones (corales, recitativos…)."""
    return any(x.get("r") and x["r"]["calderon"] for x in ac)

def _fin_de_frase(ac, b, cald=None):
    """El acorde de llegada cierra una frase: con calderón si la pieza los usa para eso; si no, con la
    melodía detenida (respiro). En un coral cada acorde dura lo mismo que la nota del tiple, así que el
    respiro solo no distingue un V–vi de paso de uno cadencial."""
    if cald is None:
        cald = _con_calderones(ac)
    return bool(b["r"]["calderon"]) if cald else bool(b["r"]["respiro"])

def cadencia_rota(ac):
    """V en estado fundamental → VI al final de frase (en parte fuerte, sin acortar la llegada, con la melodía detenida o calderón)."""
    out, cald = [], _con_calderones(ac)
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if a["tono"] == b["tono"] and buscar._es_V(a) and a["inversion"] == 0 and b["grado"] == 6 \
           and not b["secundaria"] and b["inversion"] == 0 and b["alteracion"] in (0, -1) and _llegada(a, b) \
           and _fin_de_frase(ac, b, cald):
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def cadencia_frigia(ac):
    """iv6 → V en menor al final de frase, con el bajo descendiendo por semitono (6.º → 5.º grado, comprobado en la partitura)."""
    out = []
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if not (a["tono"] == b["tono"] and a["modo"] == "minor" and a["grado"] == 4 and a["inversion"] == 1
                and a["calidad"] == "minor" and not a["secundaria"] and buscar._es_V(b) and b["inversion"] == 0
                and _llegada(a, b)):
            continue
        t = _tonica(b["tono"])
        if a["r"]["bajo"] is not None and b["r"]["bajo"] is not None and \
           (a["r"]["bajo"] != (t + 8) % 12 or b["r"]["bajo"] != (t + 7) % 12):
            continue
        out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def cadencia_plagal(ac):
    """IV → I en estado fundamental al final de frase (en parte fuerte, sin acortar la llegada, con la melodía detenida o calderón)."""
    out, cald = [], _con_calderones(ac)
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if a["tono"] == b["tono"] and a["grado"] == 4 and not a["secundaria"] and a["inversion"] == 0 \
           and buscar._es_I(b) and b["inversion"] == 0 and _llegada(a, b) and _fin_de_frase(ac, b, cald):
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def sexta_cuarta_cadencial(ac):
    """6/4 cadencial: I en segunda inversión → V(7) → I, con el I de llegada al final de frase.
    El 6/4 está acentuado (en una parte al menos tan fuerte como el V que lo resuelve, o más largo que él)
    y el 5.º grado está en el bajo. Un I64 de paso, de bordadura o arpegiado, sin cadencia detrás, no cuenta."""
    out = []
    for i in range(len(ac) - 2):
        a = ac[i]
        if a["secundaria"] or not buscar._es_64_cadencial(a):
            continue
        j = i + 1                                        # V, V7… (en estado fundamental) que siguen al 6/4
        while j < len(ac) and ac[j]["tono"] == a["tono"] and buscar._es_V(ac[j]) and ac[j]["inversion"] == 0:
            j += 1
        if j == i + 1 or j >= len(ac):
            continue
        v, b = ac[j - 1], ac[j]
        if b["tono"] != a["tono"] or not buscar._es_I(b) or b["inversion"] != 0 or not _llegada(v, b):
            continue
        ra, rv = a.get("r"), ac[i + 1].get("r")
        if ra and rv:
            if ra["peso"] < rv["peso"] and ra["dur"] <= rv["dur"]:
                continue                                  # 6/4 sin acento (ni métrico ni de duración) y V acentuado
            t5 = (_tonica(a["tono"]) + 7) % 12
            if ra["bajo"] is not None and rv["bajo"] is not None and t5 not in (ra["bajo"], rv["bajo"]):
                continue                                  # el 5.º grado tiene que estar en el bajo (del 6/4 o del V)
        out.append((i, " → ".join(x["cifrado"] for x in ac[i:j + 1]), j - i + 1))
    return out

DETECTORES = {
    "cadencia_autentica_perfecta": cadencia_autentica_perfecta,
    "cadencia_autentica_imperfecta": cadencia_autentica_imperfecta,
    "semicadencia": semicadencia,
    "cadencia_rota": cadencia_rota,
    "cadencia_frigia": cadencia_frigia,
    "cadencia_plagal": cadencia_plagal,
}
