"""
Rasgos de partitura para las cadencias: lo que el cifrado no dice.

Para cada acorde anotado, a partir de la partitura (alturas reales):
  ini, dur     inicio y duración en negras (hasta el acorde siguiente)
  peso         peso métrico del ataque: 3 primera parte del compás · 2 mitad del compás (compases de
               4 partes o 6/8, 12/8…) · 1 otra parte · 0 fuera de parte
  tiple        clases de altura de la voz más aguda durante la primera parte del acorde
  bajo         clase de altura de la nota más grave al ataque (o la primera que suene)
  calderon     1 si alguna nota con calderón empieza dentro del acorde
  reposo       1 si la melodía se detiene en la llegada: en la voz superior escrita (pentagrama 1,
               voz 1) de la primera parte que suena en la llegada, la nota que llega dura al menos el
               doble que el movimiento de esa voz justo antes, o la voz calla (silencio) tras ella,
               antes de que acabe el acorde
  marca        1 si la partitura marca un final: calderón, barra doble/final/de repetición, silencio
               de todas las voces o final de la obra (hasta una parte después del acorde)

Una cadencia es un punto de reposo de la forma, no cualquier V–I: además del cifrado, la partitura
tiene que mostrar que la música se detiene (ver `_cierre`).
"""
import bisect, statistics
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

class _Voz:
    """Voz superior escrita de una parte: notas [(inicio, fin)] ordenadas y los inicios de sus silencios."""
    def __init__(self, eventos):
        eventos = sorted(eventos, key=lambda x: (x[0], x[2] is None))
        self.notas = [(a, b) for a, b, m in eventos if m is not None]
        self.inicios = [a for a, _ in self.notas]
        self.pausas = sorted(a for a, _, m in eventos if m is None)

    def llegada(self, s, pulso):
        """Índice de la nota de llegada (la que empieza en la primera parte del acorde, o la que suena
        desde antes: retardo, síncopa) o None si la voz no participa en la llegada."""
        k = bisect.bisect_left(self.inicios, s)
        if k < len(self.notas) and self.notas[k][0] < s + pulso:
            return k
        if k > 0 and self.notas[k - 1][1] > s:
            return k - 1
        return None

    def reposo(self, k, s, e, pulso):
        i = bisect.bisect_left(self.pausas, s)
        if i < len(self.pausas) and self.pausas[i] < e + pulso:
            return True                               # tras la llegada la voz calla: respiración de final de frase
        notas, inicios = self.notas, self.inicios
        # cuánto dura la nota de llegada: hasta la nota siguiente de la voz (o el final del acorde)
        larga = (notas[k + 1][0] if k + 1 < len(notas) else max(e, notas[k][1])) - notas[k][0]
        antes = [notas[i + 1][0] - notas[i][0] for i in range(bisect.bisect_left(inicios, s - 4 * pulso), k)]
        if not antes:
            return larga >= pulso
        return larga >= 2 * statistics.median(antes)

def _reposo(voces, s, e, pulso):
    """La melodía se detiene en la llegada (ver la cabecera): se mira la primera parte que suena."""
    for v in voces:
        k = v.llegada(s, pulso)
        if k is not None:
            return v.reposo(k, s, e, pulso)
    return False

def rasgos(datos, acordes):
    """Lista de dicts de rasgos (o None) para los acordes anotados [(compás, parte)] en orden."""
    try:
        cald, barras, tiple = set(), set(), []
        notas, compases = unisonos.leer(datos, midi=True, calderones=cald, barras=barras, tiple=tiple)
    except Exception:
        return [None] * len(acordes)
    notas.sort()
    voces = [_Voz(t) for t in tiple if any(m is not None for _, _, m in t)]
    ini = unisonos.posiciones(compases, acordes)
    fin_obra = max((b for _, b, _ in notas), default=Fraction(0))
    barras.add(fin_obra)
    # silencios de todas las voces: [(inicio, fin)] disjuntos y en orden
    silencios, sonando = [], Fraction(0)
    for a, b, _ in notas:
        if a > sonando:
            silencios.append((sonando, a))
        sonando = max(sonando, b)
    fin_silencio = [b for _, b in silencios]
    barras = sorted(barras)
    # compás que contiene cada instante (para el peso métrico)
    starts = [c[1] for c in compases]
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
        tp = []
        for x, y in zip(cortes, cortes[1:]):
            suenan = [m for a, b, m in dentro if a <= x and b >= y]
            if suenan:
                tp.append(max(suenan) % 12)
        al_ataque = [m for a, b, m in dentro if a <= s < b] or [m for a, b, m in dentro]
        cald_i = any(s <= c < e for c in cald)
        kb = bisect.bisect_right(barras, s)                   # primera barra después del ataque
        ks = bisect.bisect_right(fin_silencio, s)             # primer silencio que acaba después del ataque
        marca = cald_i or (kb < len(barras) and barras[kb] <= e + pulso) \
            or (ks < len(silencios) and silencios[ks][0] < e + pulso)
        out.append({"ini": s, "dur": e - s, "peso": _peso(s - c0, metro), "pulso": pulso,
                    "tiple": tp, "bajo": min(al_ataque) % 12 if al_ataque else None,
                    "calderon": int(cald_i), "reposo": int(_reposo(voces, s, e, pulso)), "marca": int(marca)})
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

def _armonia(ac, i, paso):
    """(inicio, fin) del acorde i junto con sus repeticiones seguidas (mismo cifrado y tono) en la
    dirección `paso` (+1 hacia delante, -1 hacia atrás), y el índice siguiente en esa dirección."""
    j = i
    while 0 <= j + paso < len(ac) and ac[j + paso].get("r") and ac[j + paso]["cifrado"] == ac[i]["cifrado"] \
          and ac[j + paso]["tono"] == ac[i]["tono"]:
        j += paso
    a, b = (ac[i], ac[j]) if paso > 0 else (ac[j], ac[i])
    return a["r"]["ini"], b["r"]["ini"] + b["r"]["dur"], j + paso

def _freno(ac, i, n=4, factor=1.5):
    """El ritmo armónico se frena en la llegada: el acorde (con sus repeticiones) dura al menos `factor`
    veces la duración media de las `n` armonías anteriores. En mitad de frase la armonía sigue al mismo paso."""
    s, e, _ = _armonia(ac, i, 1)
    durs, j = [], i - 1
    while j >= 0 and len(durs) < n and ac[j].get("r"):
        a, b, j = _armonia(ac, j, -1)
        durs.append(b - a)
    return not durs or (e - s) >= factor * sum(durs) / len(durs)

def _con_calderones(ac):
    """La pieza marca sus finales de frase con calderones (corales, recitativos…)."""
    return any(x.get("r") and x["r"]["calderon"] for x in ac)

def _cierre(ac, i, cald=None, fuerte=True):
    """El acorde i es un punto de reposo de la forma, no un acorde de paso dentro de la frase.
    · Si la pieza marca sus finales de frase con calderones (corales), solo cuenta el calderón: en un
      coral cada acorde dura lo mismo que la nota del tiple, y la melodía «se para» en cada uno.
    · Si no, basta una marca de la partitura (calderón, barra doble o de repetición, silencio de todas
      las voces, final de la obra) o que la música se detenga. Con `fuerte` (semicadencia, imperfecta,
      rota, plagal, frigia) tienen que pararse a la vez la melodía (`reposo`) y el ritmo armónico
      (`_freno`). Sin `fuerte` (auténtica perfecta: V–I con la tónica en el tiple, ya es una llegada
      clara) basta una de las dos: la melodía detenida o la armonía claramente detenida (el doble)."""
    r = ac[i]["r"]
    if cald is None:
        cald = _con_calderones(ac)
    if cald:
        return bool(r["calderon"])
    if r["marca"]:
        return True
    if fuerte:
        return bool(r["reposo"]) and _freno(ac, i)
    return bool(r["reposo"]) or _freno(ac, i, factor=2)

def _tiple_tonica(b):
    """La voz más aguda está en la tónica al llegar (o llega a ella por grado conjunto desde una apoyatura)."""
    t, tp = _tonica(b["tono"]), b["r"]["tiple"]
    return tp[:1] == [t] or (len(tp) > 1 and tp[1] == t and (tp[0] - t) % 12 in (1, 2, 10, 11))

def _es_autentica(ac, i):
    """V (en i) → I en estado fundamental, preparado por un predominante y con llegada en parte fuerte."""
    if i + 1 >= len(ac):
        return False
    a, b = ac[i], ac[i + 1]
    return a["tono"] == b["tono"] and buscar._es_V(a) and a["inversion"] == 0 and buscar._es_I(b) \
        and b["inversion"] == 0 and _antecedente(ac, i) and _llegada(a, b)

def _autenticas(ac):
    for i in range(len(ac) - 1):
        if _es_autentica(ac, i):
            yield i + 1, ac[i], ac[i + 1]

def _resuelve_en_cadencia(ac, i, cald):
    """El V en i resuelve enseguida en un I que cierra la frase (cadencia auténtica): el V es el penúltimo
    acorde de esa cadencia, no una llegada a la dominante. Salvo que el V tenga su propia marca de final
    (silencio de todas las voces, barra, calderón): entonces la frase se cortó en el V y el I empieza otra."""
    if not _es_autentica(ac, i) or ac[i]["r"]["marca"]:
        return False
    return _cierre(ac, i + 1, cald, fuerte=False)

def cadencia_autentica_perfecta(ac):
    """V–I en estado fundamental al final de frase (parte fuerte, preparada por un predominante), con la tónica en el tiple y la melodía o la armonía detenidas."""
    cald = _con_calderones(ac)
    return [(j, f'{a["cifrado"]} → {b["cifrado"]} · tiple en el 1.º grado', 2)
            for j, a, b in _autenticas(ac) if _tiple_tonica(b) and _cierre(ac, j, cald, fuerte=False)]

def cadencia_autentica_imperfecta(ac):
    """V–I en estado fundamental al final de frase, con la 3.ª o la 5.ª del acorde en el tiple, la melodía detenida y el ritmo armónico frenado."""
    cald = _con_calderones(ac)
    return [(j, f'{a["cifrado"]} → {b["cifrado"]} · tiple en el {_grado_tiple(b)} grado', 2)
            for j, a, b in _autenticas(ac) if not _tiple_tonica(b) and b["r"]["tiple"] and _cierre(ac, j, cald)]

def semicadencia(ac):
    """Llegada a V en estado fundamental al final de frase: desde un predominante o desde I, en parte fuerte, con la melodía detenida y el ritmo armónico frenado, sin prolongar un V anterior, ni seguir en V, ni resolver enseguida en un I que cierra la frase."""
    es_v = lambda x: x is not None and (buscar._es_V(x) or x["cifrado"].startswith("Cad64"))
    out, cald = [], _con_calderones(ac)
    for i in range(1, len(ac)):
        a, b = ac[i - 1], ac[i]
        n = ac[i + 1] if i + 1 < len(ac) else b.get("_sig")      # tras el corte de un unísono, lo que sigue en la obra
        if i > 1 and es_v(ac[i - 2]) and ac[i - 2]["tono"] == b["tono"] and (a["secundaria"] or a["grado"] == 1):
            continue                                      # V – V/V – V o V – I – V: prolongación del V, no llegada
        v = (buscar._es_V(b) and b["inversion"] == 0) or b["cifrado"].startswith("Cad64")
        prep = _predominante(a) or (a["grado"] == 1 and not a["secundaria"] and not a["cifrado"].startswith("Cad64"))
        if v and prep and a["tono"] == b["tono"] and _llegada(a, b) and not es_v(n) and _cierre(ac, i, cald) \
           and not _resuelve_en_cadencia(ac, i, cald):
            out.append((i, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def cadencia_rota(ac):
    """V en estado fundamental → VI al final de frase (en parte fuerte, sin acortar la llegada, con la melodía detenida y el ritmo armónico frenado, o calderón)."""
    out, cald = [], _con_calderones(ac)
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if a["tono"] == b["tono"] and buscar._es_V(a) and a["inversion"] == 0 and b["grado"] == 6 \
           and not b["secundaria"] and b["inversion"] == 0 and b["alteracion"] in (0, -1) and _llegada(a, b) \
           and "[no3]" not in b["cifrado"] and _cierre(ac, i + 1, cald):     # [no3]: apoyatura, el vi aún no ha llegado
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def cadencia_frigia(ac):
    """iv6 → V en menor al final de frase, con el bajo descendiendo por semitono (6.º → 5.º grado, comprobado en la partitura), la melodía detenida y el ritmo armónico frenado, sin resolver enseguida en un I que cierra la frase."""
    out, cald = [], _con_calderones(ac)
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if not (a["tono"] == b["tono"] and a["modo"] == "minor" and a["grado"] == 4 and a["inversion"] == 1
                and a["calidad"] == "minor" and not a["secundaria"] and buscar._es_V(b) and b["inversion"] == 0
                and _llegada(a, b) and _cierre(ac, i + 1, cald) and not _resuelve_en_cadencia(ac, i + 1, cald)):
            continue
        t = _tonica(b["tono"])
        if a["r"]["bajo"] is not None and b["r"]["bajo"] is not None and \
           (a["r"]["bajo"] != (t + 8) % 12 or b["r"]["bajo"] != (t + 7) % 12):
            continue
        out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def cadencia_plagal(ac):
    """IV → I en estado fundamental al final de frase (en parte fuerte, sin acortar la llegada, con la melodía detenida y el ritmo armónico frenado, o calderón)."""
    out, cald = [], _con_calderones(ac)
    for i in range(len(ac) - 1):
        a, b = ac[i], ac[i + 1]
        if a["tono"] == b["tono"] and a["grado"] == 4 and not a["secundaria"] and a["inversion"] == 0 \
           and buscar._es_I(b) and b["inversion"] == 0 and _llegada(a, b) and _cierre(ac, i + 1, cald):
            out.append((i + 1, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

def sexta_cuarta_cadencial(ac):
    """6/4 cadencial: I en segunda inversión → V(7) → I, con el I de llegada al final de frase (con la
    melodía o la armonía detenidas, como en la auténtica perfecta). El 6/4 está acentuado (en una parte
    al menos tan fuerte como el V que lo resuelve, o más largo que él) y el 5.º grado está en el bajo. Un I64 de paso, de bordadura o arpegiado, sin cadencia detrás, no cuenta."""
    out, cald = [], _con_calderones(ac)
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
        if b["tono"] != a["tono"] or not buscar._es_I(b) or b["inversion"] != 0 or not _llegada(v, b) \
           or not _cierre(ac, j, cald, fuerte=False):
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

def tercera_picardia(ac):
    """V → I mayor como acorde final en una tonalidad menor: al final de la obra o en un final de frase con calderón."""
    out = []
    for i in range(1, len(ac)):
        a, b = ac[i - 1], ac[i]
        if not (b["modo"] == "minor" and b["grado"] == 1 and b["calidad"] == "major" and not b["secundaria"]
                and b["inversion"] == 0 and b["tono"] == a["tono"] and buscar._es_V(a)):
            continue
        j = i                                              # I repetido hasta el final (I – I – I)
        while j + 1 < len(ac) and ac[j + 1]["tono"] == b["tono"] and ac[j + 1]["cifrado"] == b["cifrado"]:
            j += 1
        final = j == len(ac) - 1
        calderon = any(x.get("r") and x["r"]["calderon"] for x in ac[i:j + 1])
        if final or calderon:
            out.append((i, f'{a["cifrado"]} → {b["cifrado"]}', 2))
    return out

DETECTORES = {
    "cadencia_autentica_perfecta": cadencia_autentica_perfecta,
    "cadencia_autentica_imperfecta": cadencia_autentica_imperfecta,
    "semicadencia": semicadencia,
    "cadencia_rota": cadencia_rota,
    "cadencia_frigia": cadencia_frigia,
    "cadencia_plagal": cadencia_plagal,
    "tercera_picardia": tercera_picardia,
}
