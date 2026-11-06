"""Sustituye las partituras reconstruidas (DCML) de las sonatas para piano de Beethoven por la codificación
Humdrum de Craig Sapp (https://github.com/craigsapp/beethoven-piano-sonatas), hecha de una edición impresa
(Durand 1915, Paul Dukas), con sus voces, silencios, barras y ligaduras reales.

    python krn_beethoven_a_mxl.py <dir_kern> <web/data/obras.json> <web/scores/beethoven.json> <salida.json> [--solo m1,m2]

No modifica sus entradas: escribe <salida.json> con el paquete de partituras actualizado y imprime el informe
(qué movimiento usa qué archivo). La conversión a MusicXML se hace con music21; las dos manos quedan en una
sola parte de dos pentagramas (gran pentagrama con llave), como las demás partituras del corpus.
"""
import base64, io, json, os, re, sys, warnings, zipfile
warnings.filterwarnings("ignore")
from music21 import converter, layout, stream

# opus → número de sonata (1-32)
SONATA = {("2", "1"): 1, ("2", "2"): 2, ("2", "3"): 3, ("7", ""): 4, ("10", "1"): 5, ("10", "2"): 6, ("10", "3"): 7,
          ("13", ""): 8, ("14", "1"): 9, ("14", "2"): 10, ("22", ""): 11, ("26", ""): 12, ("27", "1"): 13,
          ("27", "2"): 14, ("28", ""): 15, ("31", "1"): 16, ("31", "2"): 17, ("31", "3"): 18, ("49", "1"): 19,
          ("49", "2"): 20, ("53", ""): 21, ("54", ""): 22, ("57", ""): 23, ("78", ""): 24, ("79", ""): 25,
          ("81a", ""): 26, ("90", ""): 27, ("101", ""): 28, ("106", ""): 29, ("109", ""): 30, ("110", ""): 31,
          ("111", ""): 32}


def archivo_kern(archivo):
    """'Piano_Sonatas/Beethoven,_Ludwig_van/Op002_No2/2/analysis.txt' → 'sonata02-2.krn'"""
    m = re.search(r"Op0*(\d+a?)(?:_No(\d))?[^/]*/(\d+)/", archivo or "")
    if not m:
        return None
    n = SONATA.get((m.group(1), m.group(2) or ""))
    return f"sonata{n:02d}-{int(m.group(3))}.krn" if n else None


class _Col:
    """Columna (espina) de un Humdrum: pentagrama al que pertenece, madre en el árbol de divisiones y si es **kern."""
    __slots__ = ("madre", "parte", "kern")

    def __init__(self, madre, parte, kern):
        self.madre, self.parte, self.kern = madre, parte, kern


def _plan_espinas(eventos, capa0):
    """Busca (con vuelta atrás) cómo escribir cada línea de divisiones/fusiones/cierres con una sola operación por fila.
    music21 monta un árbol de espinas: `*^` crea dos hijas y `*v` solo fusiona bien dos hermanas de la misma división;
    una fusión «cruzada» le hace perder toda una mano. En Humdrum las columnas son posicionales, así que da igual cuál
    se llame «madre»: se elige la columna que se divide en cada `*^` para que luego cada `*v` junte dos hermanas del
    mismo pentagrama. Devuelve, por evento, la lista de filas (tokens por columna), o None si no hay solución."""
    sys.setrecursionlimit(max(sys.getrecursionlimit(), 20000))

    def reducir(campos, capa):
        """Fusiones y cierres de la línea, de derecha a izquierda. Devuelve (filas, capa) o None."""
        filas, capa, i, grupos = [], list(capa), 0, []
        while i < len(campos):
            if campos[i] == "*v":
                j = i
                while j + 1 < len(campos) and campos[j + 1] == "*v": j += 1
                grupos.append(("v", i, j)); i = j + 1
            else:
                if campos[i] == "*-": grupos.append(("-", i, i))
                i += 1
        for tipo, i, j in sorted(grupos, key=lambda g: -g[1]):
            if tipo == "-":
                fila = ["*"] * len(capa); fila[i] = "*-"; filas.append(fila); del capa[i]; continue
            while j > i:
                par = None
                for q in range(j - 1, i - 1, -1):               # hermanas contiguas dentro del grupo
                    a, b = capa[q], capa[q + 1]
                    if (a.kern and b.kern and a.madre is not None and a.madre is b.madre) or (not a.kern and not b.kern):
                        par = q; break
                if par is None: return None
                fila = ["*"] * len(capa); fila[par] = fila[par + 1] = "*v"; filas.append(fila)
                a = capa[par]
                capa[par:par + 2] = [a.madre if a.kern else a]
                j -= 1
        return filas, capa

    def resolver(e, capa):
        if e == len(eventos): return []
        campos = eventos[e]
        r = reducir(campos, capa)
        if r is None: return None
        filas, capa2 = r
        # índice (tras las reducciones) de cada columna que se divide
        indices, vivo, i = [], 0, 0
        while i < len(campos):
            c = campos[i]
            if c == "*v":
                j = i
                while j + 1 < len(campos) and campos[j + 1] == "*v": j += 1
                vivo += 1; i = j + 1
            elif c == "*-": i += 1
            else:
                if c == "*^": indices.append(vivo)
                vivo += 1; i += 1

        def dividir(d, capa3, filas3):
            if d == len(indices):
                resto = resolver(e + 1, capa3)
                return None if resto is None else [filas3] + resto
            c = indices[d] + d                                  # las divisiones anteriores desplazan una columna cada una
            if c >= len(capa3): return None
            opc = [c] + ([x for x in range(len(capa3)) if x != c and capa3[x].kern and capa3[x].parte == capa3[c].parte] if capa3[c].kern else [])
            for x in opc:
                m = capa3[x]
                nueva = capa3[:x] + [_Col(m, m.parte, m.kern), _Col(m, m.parte, m.kern)] + capa3[x + 1:]
                fila = ["*"] * len(capa3); fila[x] = "*^"
                r = dividir(d + 1, nueva, filas3 + [fila])
                if r is not None: return r
            return None
        return dividir(0, capa2, list(filas))
    return resolver(0, capa0)


def solo_kern(texto):
    """Deja solo las columnas **kern del Humdrum de Sapp y reescribe las divisiones/fusiones de columnas para music21
    (ver _plan_espinas). Si no se encuentra una forma coherente, deja las operaciones como vienen."""
    lineas = texto.split("\n")
    tipos0 = next((l.split("\t") for l in lineas if l.startswith("**")), None)
    if tipos0 is None: return texto
    capa0 = [_Col(None, i, t == "**kern") for i, t in enumerate(tipos0)]
    ops = ("*^", "*v", "*-")
    idx = [n for n, l in enumerate(lineas) if l.startswith("*") and not l.startswith("**")
           and any(c in ops for c in l.split("\t")) and not all(c == "*-" for c in l.split("\t"))]
    ok = all(all(c in ops or c == "*" for c in lineas[n].split("\t")) for n in idx)
    plan = None
    if ok:
        try: plan = _plan_espinas([lineas[n].split("\t") for n in idx], capa0)
        except Exception: plan = None
    filas_de = dict(zip(idx, plan)) if plan is not None else {}
    kern = [t.kern for t in capa0]                              # ¿es kern cada columna ahora?
    salida = []

    def aplicar(fila):
        i, nuevo = 0, []
        while i < len(fila):
            c = fila[i]
            if c == "*^": nuevo += [kern[i], kern[i]]
            elif c == "*v":
                j = i
                while j + 1 < len(fila) and fila[j + 1] == "*v": j += 1
                nuevo.append(kern[i]); i = j
            elif c != "*-": nuevo.append(kern[i])
            i += 1
        return nuevo

    for n, l in enumerate(lineas):
        if l.startswith("!!") or not l.strip():
            salida.append(l); continue
        filas = filas_de.get(n)
        if filas is None:
            campos = l.split("\t")
            if len(campos) == len(kern):
                fila = "\t".join(c for c, k in zip(campos, kern) if k)
                if fila: salida.append(fila)
            else:
                salida.append(l)
            if n in idx or (l.startswith("*") and not l.startswith("**") and any(c in ops for c in campos)):
                kern[:] = aplicar(campos) if len(campos) == len(kern) else kern
            continue
        for fila in filas:
            salida.append("\t".join(c for c, k in zip(fila, kern) if k))
            kern[:] = aplicar(fila)
    return "\n".join(salida)


def convertir(ruta_krn):
    texto = solo_kern(open(ruta_krn, encoding="utf-8", errors="replace").read())
    s = converter.parse(texto, format="humdrum")
    partes = list(s.parts)
    if len(partes) != 2:
        raise ValueError(f"se esperaban 2 pentagramas y hay {len(partes)}")
    # el orden de las partes depende del importador: arriba va la de tesitura más aguda (la mano derecha)
    def media(p):
        m = [n.pitch.midi for n in p.recurse().notes if n.isNote] + [c.pitches[-1].midi for c in p.recurse().getElementsByClass("Chord")]
        return sum(m) / len(m) if m else 0
    sup, inf = sorted(partes, key=media, reverse=True)
    out = stream.Score()
    for p in (sup, inf):
        p.__class__ = stream.PartStaff
        out.insert(0, p)
    out.insert(0, layout.StaffGroup([sup, inf], symbol="brace", barTogether=True))
    return out


def _leer_xml(b64):
    b = base64.b64decode(b64)
    if b[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(b))
        ns = [n for n in z.namelist() if "META" not in n]
        b = z.read(next((n for n in ns if n.endswith(".xml")), ns[0]))
    return b.decode("utf-8", "ignore")


def a_mxl_base64(partitura, nombre):
    tmp = nombre + ".tmp.musicxml"
    partitura.write("musicxml", fp=tmp)
    xml = open(tmp, "rb").read(); os.remove(tmp)
    return _a_b64(xml.decode("utf-8", "ignore"))


def _a_b64(xml):
    xml = xml.encode("utf-8")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("META-INF/container.xml",
                   '<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>')
        z.writestr("score.xml", xml)
    return base64.b64encode(buf.getvalue()).decode()


PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def _medidas(xml):
    """[(etiqueta, frozenset de clases de altura, frozenset de (clase, pulso dentro del compás))] de la primera parte (por
    regex, sin tocar el texto). El tercer elemento distingue compases con las mismas alturas pero distinto ritmo."""
    parte = xml[: xml.find("</part>")] if "</part>" in xml else xml
    out = []
    div = 1.0
    for m in re.finditer(r"<measure\b[^>]*\bnumber=\"([^\"]*)\"[^>]*>(.*?)</measure>", parte, re.S):
        d = re.search(r"<divisions>(\d+)</divisions>", m.group(2))
        if d: div = float(d.group(1))
        pcs, ev, t = set(), set(), 0.0
        for tag in re.finditer(r"<note\b.*?</note>|<backup>.*?</backup>|<forward>.*?</forward>", m.group(2), re.S):
            x = tag.group(0)
            dur = re.search(r"<duration>(\d+(?:\.\d+)?)</duration>", x)
            dur = float(dur.group(1)) / div if dur else 0.0
            if x.startswith("<backup"): t -= dur; continue
            if x.startswith("<forward"): t += dur; continue
            chord, grace = "<chord" in x, "<grace" in x
            if "<rest" not in x and not grace:
                p = re.search(r"<step>([A-G])</step>(?:\s*<alter>(-?\d+(?:\.\d+)?)</alter>)?", x)
                if p:
                    pc = (PC[p.group(1)] + int(float(p.group(2) or 0))) % 12
                    pcs.add(pc)
                    ev.add((pc, round((t - (dur if chord else 0.0)) * 8)))
            if not chord and not grace: t += dur
        out.append((m.group(1), frozenset(pcs), frozenset(ev)))
    return out


def _jac(a, b):
    return len(a & b) / len(a | b) if a | b else 1.0


def etiquetas_del_viejo(xml_viejo, xml_nuevo):
    """Alinea (Needleman-Wunsch) los compases de la reconstrucción DCML con los de la edición por su contenido y devuelve
    las etiquetas de numeración del DCML para cada compás nuevo, más estadísticas. Así los análisis (que siguen la
    numeración del DCML: compases partidos «15X1», anacrusa…) siguen cayendo en su sitio."""
    A, B = _medidas(xml_viejo), _medidas(xml_nuevo)
    n, m, gap = len(A), len(B), -1.0
    sc = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): sc[i][0] = i * gap
    for j in range(1, m + 1): sc[0][j] = j * gap
    def puntos(a, b):
        return 4.0 * _jac(a[2], b[2]) - 1.5          # >0 si comparten más de ~38 % de sus (altura, pulso)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sc[i][j] = max(sc[i - 1][j - 1] + puntos(A[i - 1], B[j - 1]), sc[i - 1][j] + gap, sc[i][j - 1] + gap)
    i, j, pares = n, m, {}
    while i > 0 and j > 0:
        s = puntos(A[i - 1], B[j - 1])
        if abs(sc[i][j] - (sc[i - 1][j - 1] + s)) < 1e-9:
            if s > 0: pares[j - 1] = i - 1
            i, j = i - 1, j - 1
        elif abs(sc[i][j] - (sc[i - 1][j] + gap)) < 1e-9: i -= 1
        else: j -= 1
    firmes = len(pares)
    # huecos entre dos compases bien alineados: se emparejan por posición (compases que difieren por ornamentos, notas
    # de paso…); solo la parte que tienen en común si los huecos no miden lo mismo
    anclas = sorted(pares.items()) + [(m, n)]
    prev_j, prev_i = -1, -1
    for j1, i1 in anclas:
        for k in range(min(j1 - prev_j - 1, i1 - prev_i - 1)):
            pares[prev_j + 1 + k] = prev_i + 1 + k
        prev_j, prev_i = j1, i1
    etiquetas = [A[pares[k]][0] if k in pares else None for k in range(m)]
    return etiquetas, dict(viejo=n, nuevo=m, alineados=firmes, por_posicion=len(pares) - firmes,
                           sin_par_viejo=n - len(pares), sin_par_nuevo=m - len(pares))


def renumerar(xml, etiquetas):
    """Pone a los compases de la primera parte las etiquetas dadas (None = se deja la suya)."""
    it = iter(etiquetas)
    fin = xml.find("</part>")
    def cambia(mo):
        e = next(it, None)
        return mo.group(1) + (e if e is not None else mo.group(2)) + mo.group(3)
    cabeza = re.sub(r"(<measure\b[^>]*\bnumber=\")([^\"]*)(\")", cambia, xml[:fin])
    return cabeza + xml[fin:]


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    kd, obras_json, paquete_json, salida = sys.argv[1:5]
    solo = None
    if "--solo" in sys.argv:
        solo = set(sys.argv[sys.argv.index("--solo") + 1].split(","))
    viejo = None                                   # paquete con las reconstrucciones, para copiar su numeración
    if "--etiquetas-de" in sys.argv:
        viejo = json.load(open(sys.argv[sys.argv.index("--etiquetas-de") + 1]))
    obras = json.load(open(obras_json, encoding="utf-8"))
    paquete = json.load(open(paquete_json))
    movs = {}
    for o in obras:
        if o.get("pq") == "beethoven" and re.match("reconstruida", (o["src"].get("partitura") or "")):
            movs.setdefault(str(o["m"]), o)
    hechos = {}
    for m, o in sorted(movs.items(), key=lambda kv: int(kv[0])):
        if solo and m not in solo:
            continue
        f = archivo_kern(o["src"].get("archivo"))
        ruta = os.path.join(kd, f) if f else None
        if not ruta or not os.path.exists(ruta):
            print(f"{m}\t{o['t']}\tSIN kern ({f})"); continue
        try:
            b64 = a_mxl_base64(convertir(ruta), f"/tmp/_k{m}")
            info = ""
            if viejo is not None:
                xv, xn = _leer_xml(viejo[m]), _leer_xml(b64)
                etq, st = etiquetas_del_viejo(xv, xn)
                info = f"\t{st}"
                b64 = _a_b64(renumerar(xn, etq))
            paquete[m] = b64
            hechos[m] = f; print(f"{m}\t{o['t']}\t{f}{info}")
        except Exception as e:
            print(f"{m}\t{o['t']}\tFALLO {type(e).__name__}: {e}")
    json.dump(paquete, open(salida, "w"))
    json.dump(hechos, open(salida + ".lista.json", "w"), indent=1)
    print(f"{len(hechos)} movimientos convertidos")


if __name__ == "__main__":
    main()
