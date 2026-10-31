"""
Pasajes al unísono u octava, detectados en la partitura.

Cuando varias voces o instrumentos doblan la misma línea al unísono o en octavas, el analista suele
cifrar la armonía implícita nota a nota, a veces con cambios de tonalidad local. Esos cifrados no
corresponden a acordes que suenen, así que los detectores derivados (modulaciones, progresiones,
cadencias por regla…) no deben apoyarse en ellos.

Criterio, para el tramo de cada acorde anotado (de su ataque al del acorde siguiente):
  · «doblado»: suenan ≥2 notas a la vez y todas son la misma nota (misma clase de altura);
  · «armónico»: suenan a la vez ≥2 clases de altura distintas.
Un acorde está al unísono si en su tramo no hay nada armónico y lo doblado ocupa al menos la mitad
del tiempo con sonido, salvo que la línea arpegie el propio acorde (≥3 notas distintas, todas del
acorde cifrado): un arpegio en octavas sí expone la armonía. Una línea a solo (una sola voz) NO cuenta como unísono: en las obras para
instrumento solo la armonía implícita es la que interesa.
Un PASAJE al unísono son ≥2 acordes seguidos al unísono; un acorde aislado al unísono (p. ej. un
final en octavas) se conserva.

Las alturas son las reales: se aplica la transposición de los instrumentos transpositores.
"""
import io, re, zipfile
import xml.etree.ElementTree as ET
from fractions import Fraction

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

def _xml_de(datos):
    """Texto MusicXML a partir de bytes de un .mxl (zip) o de un .musicxml/.xml."""
    if datos[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(datos))
        nombre = None
        if "META-INF/container.xml" in z.namelist():
            m = re.search(rb'full-path="([^"]+)"', z.read("META-INF/container.xml"))
            nombre = m.group(1).decode() if m else None
        if not nombre:
            nombre = next(n for n in z.namelist() if not n.startswith("META-INF") and n.endswith((".xml", ".musicxml")))
        datos = z.read(nombre)
    return datos

def leer(datos, midi=False, calderones=None):
    """(notas, compases) de una partitura.
    notas: [(inicio, fin, clase de altura)] en negras, alturas reales (con midi=True, altura MIDI).
    calderones: si se pasa un set, recibe el inicio de cada nota con calderón.
    compases: [(número, inicio, duración, (num, den))] de la primera parte, en orden."""
    raiz = ET.fromstring(_xml_de(datos))
    notas, compases = [], None
    for ip, parte in enumerate(raiz.iter("part")):
        divisiones, transp, t0, metro = 1, 0, Fraction(0), (4, 4)
        lista = []
        for m in parte.findall("measure"):
            t = mx = Fraction(0); ultimo_inicio = Fraction(0)
            for el in m:
                if el.tag == "attributes":
                    d = el.findtext("divisions")
                    if d: divisiones = int(d)
                    tr = el.find("transpose")
                    if tr is not None:
                        transp = int(float(tr.findtext("chromatic") or 0)) + 12 * int(float(tr.findtext("octave-change") or 0))
                    b, bt = el.findtext("time/beats"), el.findtext("time/beat-type")
                    if b and bt and b.isdigit():
                        metro = (int(b), int(bt))
                elif el.tag == "backup":
                    t -= Fraction(int(el.findtext("duration") or 0), divisiones)
                elif el.tag == "forward":
                    t += Fraction(int(el.findtext("duration") or 0), divisiones); mx = max(mx, t)
                elif el.tag == "note":
                    if el.find("grace") is not None or el.find("cue") is not None:
                        continue
                    dur = Fraction(int(el.findtext("duration") or 0), divisiones)
                    inicio = ultimo_inicio if el.find("chord") is not None else t
                    if el.find("chord") is None:
                        ultimo_inicio = t; t += dur; mx = max(mx, t)
                    p = el.find("pitch")
                    if p is not None and dur > 0:
                        alt = (PC[p.findtext("step")] + int(float(p.findtext("alter") or 0)) + transp
                               + 12 * (int(p.findtext("octave") or 4) + 1))
                        notas.append((t0 + inicio, t0 + inicio + dur, alt if midi else alt % 12))
                    if calderones is not None and el.find("notations/fermata") is not None:
                        calderones.add(t0 + inicio)
            lleno = Fraction(4 * metro[0], metro[1])
            dur_m = mx if mx > 0 else lleno
            lista.append((m.get("number") or "", t0, dur_m, metro))
            t0 += dur_m
        if compases is None:
            compases = lista
    return notas, compases or []

def _num(n):
    return int(n) if re.fullmatch(r"\d+", n or "") else None

def posiciones(compases, acordes):
    """Inicio (en negras) de cada acorde anotado [(compás, parte)] según la partitura, con el mismo
    convenio que la web: compás por número, parte = pulso (en compases compuestos, el pulso con puntillo),
    anacrusa numerada 0 en el análisis y 1 en la partitura alineadas. None si no se encuentra."""
    nums = [_num(c[0]) for c in compases]
    desplaza = 0
    if compases and any(a[0] == 0 for a in acordes) and nums and nums[0] == 1 and 0 not in nums:
        n0, i0, d0, (b, bt) = compases[0]
        if d0 < Fraction(4 * b, bt):
            desplaza = 1                                  # el compás 1 de la partitura es la anacrusa (0)
    por_num = {}
    for i, n in enumerate(nums):
        if n is not None:
            por_num.setdefault(n - desplaza, []).append(i)
    vistas, out = {}, []
    primero = min(por_num) if por_num else None
    for compas, parte in acordes:
        idx = por_num.get(compas)
        if not idx or parte is None:
            out.append(None); continue
        clave = (compas, round(parte, 3)); occ = vistas.get(clave, 0); vistas[clave] = occ + 1
        i = idx[min(occ, len(idx) - 1)]
        _, ini, dur, (b, bt) = compases[i]
        compuesto = b % 3 == 0 and (b > 3 or bt >= 8)
        pulso = Fraction(12, bt) if compuesto else Fraction(4, bt)
        q = (Fraction(parte).limit_denominator(96) - 1) * pulso
        lleno = Fraction(4 * b, bt)
        if compas == primero and dur < lleno:
            q -= lleno - dur                              # anacrusa: la parte se cuenta desde el compás completo
        out.append(ini + max(Fraction(0), q))
    return out

def _tramo(notas, s, e):
    """Duraciones (doblado, armónico, con sonido) en [s, e) y clases de altura que suenan."""
    dentro = [(max(a, s), min(b, e), pc) for a, b, pc in notas if a < e and b > s]
    if not dentro:
        return 0, 0, 0, frozenset()
    cortes = sorted({s, e} | {a for a, _, _ in dentro} | {b for _, b, _ in dentro})
    dob = arm = son = Fraction(0)
    for x, y in zip(cortes, cortes[1:]):
        if y <= s or x >= e:
            continue
        suenan = [pc for a, b, pc in dentro if a <= x and b >= y]
        if not suenan:
            continue
        son += y - x
        if len(set(suenan)) >= 2:
            arm += y - x
        elif len(suenan) >= 2:
            dob += y - x
    return dob, arm, son, frozenset(pc for _, _, pc in dentro)

def marcar(datos, acordes, pcs=None):
    """Lista de 0/1 (1 = el acorde pertenece a un pasaje al unísono u octava) para los acordes
    anotados [(compás, parte)] en orden. `pcs`: clases de altura de cada acorde cifrado (o None),
    para reconocer los arpegios. Si la partitura no se puede leer, todo 0."""
    try:
        notas, compases = leer(datos)
    except Exception:
        return [0] * len(acordes)
    notas.sort()
    ini = posiciones(compases, acordes)
    fin_obra = max((b for _, b, _ in notas), default=Fraction(0))
    uni = []
    for i, s in enumerate(ini):
        e = next((x for x in ini[i + 1:] if x is not None and s is not None and x > s), None) if s is not None else None
        if s is None:
            uni.append(0); continue
        if e is None:
            e = fin_obra
        if e <= s:
            uni.append(0); continue
        dob, arm, son, suenan = _tramo(notas, s, e)
        arpegio = pcs is not None and pcs[i] and len(suenan) >= 3 and suenan <= pcs[i]
        uni.append(1 if son and arm == 0 and dob * 2 >= son and not arpegio else 0)
    # solo pasajes: ≥2 acordes seguidos (los que comparten ataque con el anterior no rompen la racha)
    out = [0] * len(uni); i = 0
    while i < len(uni):
        if not uni[i]:
            i += 1; continue
        j = i
        while j + 1 < len(uni) and uni[j + 1]:
            j += 1
        if j > i:
            for k in range(i, j + 1):
                out[k] = 1
        i = j + 1
    return out

# Obras con bajo continuo sin realizar: la partitura solo trae la línea del bajo, así que una voz que
# dobla el bajo no es un unísono (el continuo rellena los acordes que cifra el analista).
CONTINUO_SUBCORPUS = {"kleine_geistliche_konzerte", "peri_euridice", "couperin_concerts"}
CONTINUO_COMPOSITORES = ("Corelli",)

def continuo_sin_realizar(subcorpus, instrumentos, compositor):
    inst = [i.lower() for i in instrumentos or []]
    clave_con_otros = any("harpsichord" in i or "organ" in i for i in inst) and \
        any(not ("harpsichord" in i or "organ" in i) for i in inst)
    return (subcorpus in CONTINUO_SUBCORPUS or any(c in (compositor or "") for c in CONTINUO_COMPOSITORES)
            or any("continuo" in i for i in inst) or clave_con_otros)

def tramos(ac):
    """Divide la lista de acordes en tramos sin acordes al unísono: [(desplazamiento, sublista)]."""
    out, ini = [], None
    for i, a in enumerate(ac):
        if a.get("unisono"):
            if ini is not None:
                out.append((ini, ac[ini:i])); ini = None
        elif ini is None:
            ini = i
    if ini is not None:
        out.append((ini, ac[ini:]))
    return out
