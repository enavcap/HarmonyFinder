"""Sustituye las partituras reconstruidas (DCML) de las sonatas para piano de Beethoven por la codificación
Humdrum de Craig Sapp (https://github.com/craigsapp/beethoven-piano-sonatas), hecha de una edición impresa
(Durand 1915, Paul Dukas), con sus voces, silencios, barras y ligaduras reales.

    python krn_beethoven_a_mxl.py <dir_kern> <web/data/obras.json> <web/scores/beethoven.json> <salida.json> [--solo m1,m2]
    python krn_beethoven_a_mxl.py --reconvertir <dir_kern> <obras.json> <beethoven.json> <salida.json>   (las ya convertidas)

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


def _es_datos(l):
    return bool(l) and not l.startswith(("!", "*", "="))


def _duraciones_lineas(lineas):
    """Duración (en negras, Fraction) de cada línea de datos de un Humdrum solo **kern: el tiempo hasta la línea siguiente.
    Una línea solo con notas de adorno dura 0. Las demás líneas valen None."""
    from fractions import Fraction
    def dur(tok):
        t = tok.split(" ")[0]
        if t in (".", "") or re.search(r"[qQ]", t): return None
        m = re.search(r"(\d+)(?:%(\d+))?(\.*)", t)
        if not m: return None
        a, b, pts = int(m.group(1)), int(m.group(2) or 1), len(m.group(3))
        base = Fraction(8) if a == 0 else Fraction(4 * b, a)
        return base * (2 - Fraction(1, 2 ** pts))
    T, fines, out = Fraction(0), None, []
    for l in lineas:
        if not _es_datos(l):
            out.append(None)
            if l.startswith("*") and not l.startswith("**") and fines is not None:
                c, nuevas, i = l.split("\t"), [], 0
                if len(c) == len(fines):
                    while i < len(c):
                        if c[i] == "*^": nuevas += [fines[i], fines[i]]
                        elif c[i] == "*v":
                            j = i
                            while j + 1 < len(c) and c[j + 1] == "*v": j += 1
                            nuevas.append(max(fines[i:j + 1])); i = j
                        elif c[i] != "*-": nuevas.append(fines[i])
                        i += 1
                    fines = nuevas
            elif l.startswith("**"):
                fines = [Fraction(0)] * len(l.split("\t"))
            continue
        c = l.split("\t")
        if fines is None or len(c) != len(fines):
            out.append(None); continue
        nuevo, adorno = False, False
        for k, x in enumerate(c):
            d = dur(x)
            if d is not None: fines[k] = T + d; nuevo = True
            elif re.search(r"[qQ]", x) and x != ".": adorno = True
        if adorno and not nuevo:
            out.append(Fraction(0)); continue
        fut = [f - T for f in fines if f > T]
        d = min(fut) if fut else Fraction(0)
        out.append(d); T += d
    return out


def _silencio_invisible(d):
    """Señal **kern de un silencio invisible (`yy`) de d negras, en notación de duración racional si hace falta (3%2…)."""
    from fractions import Fraction
    r = Fraction(4) / d
    return (str(r.numerator) if r.denominator == 1 else f"{r.numerator}%{r.denominator}") + "ryy"


def voces_por_compas(texto):
    """Lleva las divisiones (`*^`) y fusiones (`*v`) de columnas que el Humdrum hace a mitad de compás al principio y al final
    del compás, y rellena la voz que antes no existía con silencios invisibles (`ryy`, que luego son <forward>). music21
    convierte mal esas divisiones: la voz nueva empezaba en el pulso 1 en vez de donde empieza (Op. 2 n.º 1, ii, c. 3) y,
    tras una fusión, el resto del compás iba a una segunda capa con el mismo número de voz, que Verovio dibuja a
    continuación (c. 2: notas fuera de sitio y un hueco). Solo se mueven líneas con una única operación (una `*^` o un
    par `*v`), que es lo que deja `solo_kern`; las demás se respetan y hacen de tope."""
    lineas = texto.split("\n")
    durs = _duraciones_lineas(lineas)
    filas = [[l, d] for l, d in zip(lineas, durs)]

    def op_simple(l):
        """('^', c) / ('v', c) si la línea es una sola división de la columna c o una sola fusión de c y c+1."""
        if not l.startswith("*") or l.startswith("**"): return None
        c = l.split("\t")
        otros = [i for i, x in enumerate(c) if x != "*"]
        if len(otros) == 1 and c[otros[0]] == "*^": return ("^", otros[0])
        if len(otros) == 2 and otros[1] == otros[0] + 1 and c[otros[0]] == c[otros[1]] == "*v": return ("v", otros[0])
        return None

    def es_op(l):
        return l.startswith("*") and not l.startswith("**") and any(x in ("*^", "*v", "*-") for x in l.split("\t"))

    def relleno(fila, c):
        """Campo para la columna nueva insertada tras la columna c de la fila."""
        l, d = fila
        campos = l.split("\t")
        if _es_datos(l): return _silencio_invisible(d) if d else "."
        if l.startswith("!"): return "!"
        x = campos[c]
        return x if x.startswith("*") and x not in ("*^", "*v", "*-") and not re.match(r"\*X?(8va|15ma|8ba|15mb)$", x) else "*"

    def insertar(fila, pos, campo):
        c = fila[0].split("\t"); c.insert(pos, campo); fila[0] = "\t".join(c)

    def con_columnas(l):
        return not l.startswith("!!") and l.strip() != "" and not l.startswith("**")

    # segmentos: tramos entre barras (o entre la cabecera y la primera barra, y la última barra y el fin de las columnas)
    i, n, cambios = 0, len(filas), 0
    while i < n:
        if filas[i][0].startswith("**") or filas[i][0].startswith("="):
            ini = i + 1
            fin = ini
            while fin < n and not filas[fin][0].startswith("=") and not all(x == "*-" for x in filas[fin][0].split("\t")):
                fin += 1
            if fin >= n: break
            seg = [list(f) for f in filas[ini:fin]]
            nuevo = _normalizar_segmento(seg, op_simple, es_op, relleno, insertar, con_columnas)
            if nuevo is not None:
                filas[ini:fin] = nuevo; cambios += 1
            i = ini + (len(nuevo) if nuevo is not None else fin - ini)
            continue
        i += 1
    return "\n".join(f[0] for f in filas)


def _normalizar_segmento(seg, op_simple, es_op, relleno, insertar, con_columnas):
    """Mueve las operaciones de columnas de un compás a sus extremos (ver voces_por_compas). None si no cambia nada."""
    cambiado = False
    inicio = 0                                    # las divisiones ya movidas quedan en seg[:inicio]
    while True:                                   # divisiones, de la primera a la última
        k = next((k for k in range(inicio, len(seg)) if es_op(seg[k][0])), None)
        if k is None: break
        op = op_simple(seg[k][0])
        hay_datos = any(_es_datos(f[0]) for f in seg[inicio:k])
        if op is None or op[0] != "^": break
        if not hay_datos:                         # ya está al principio del compás
            inicio = k + 1; continue
        c = op[1]
        for f in seg[inicio:k]:
            if con_columnas(f[0]): insertar(f, c + 1, relleno(f, c))
        seg.insert(inicio, seg.pop(k)); inicio += 1; cambiado = True
    final = len(seg)                              # las fusiones ya movidas quedan en seg[final:]
    while True:                                   # fusiones, de la última a la primera
        k = next((k for k in range(final - 1, inicio - 1, -1) if es_op(seg[k][0])), None)
        if k is None: break
        op = op_simple(seg[k][0])
        hay_datos = any(_es_datos(f[0]) for f in seg[k + 1:final])
        if op is None or op[0] != "v": break
        if not hay_datos:                         # ya está al final del compás
            final = k; continue
        c = op[1]
        for f in seg[k + 1:final]:
            if con_columnas(f[0]): insertar(f, c + 1, relleno(f, c))
        seg.insert(final - 1, seg.pop(k)); final -= 1; cambiado = True
    return seg if cambiado else None


_OCTAVAS = {"8va": ("down", 8, "above"), "15ma": ("down", 15, "above"), "8ba": ("up", 8, "below"), "15mb": ("up", 15, "below")}


def _duracion_kern(tok):
    """Duración en negras del primer sonido de una señal **kern (None si no tiene: nota de adorno o señal nula)."""
    t = tok.split(" ")[0]
    if t in (".", "") or re.search(r"[qQ]", t):
        return None
    m = re.search(r"(\d+)(?:%(\d+))?(\.*)", t)
    if not m:
        return None
    a, b, pts = int(m.group(1)), m.group(2), len(m.group(3))
    base = (4.0 * int(b) / a) if b else (8.0 if a == 0 else 4.0 / a)
    return base * (2 - 0.5 ** pts)


def octavas_kern(texto):
    """Líneas de octava (`*8va` … `*X8va`, también 15ma, 8ba y 15mb) del Humdrum original: [(parte, inicio?, tipo, tamaño,
    lugar, compás, negras)], donde parte es el número de la espina raíz (0 = la primera columna), compás el índice 0-based del
    compás y negras la posición dentro de él. music21 las ignora, así que se reescriben después como <octave-shift>."""
    cols = None                               # [[parte, fin]] por columna
    T, ini_compas, compas, datos_desde_barra = 0.0, 0.0, -1, True
    ev = []
    for l in texto.split("\n"):
        if l.startswith("!") or not l.strip():
            continue
        c = l.split("\t")
        if l.startswith("**"):
            cols = [[i, 0.0, t == "**kern"] for i, t in enumerate(c)]; continue
        if cols is None or len(c) != len(cols):
            continue
        if l.startswith("="):
            if compas == -1 or datos_desde_barra:
                compas += 1
            datos_desde_barra = False; ini_compas = T; continue
        if l.startswith("*"):
            nuevas, i = [], 0
            while i < len(c):
                x = c[i]
                m = re.match(r"\*(X?)(8va|15ma|8ba|15mb)$", x)
                if m and cols[i][2]:
                    tipo, tam, lugar = _OCTAVAS[m.group(2)]
                    ev.append((cols[i][0], not m.group(1), tipo, tam, lugar, max(compas, 0), T - ini_compas))
                if x == "*^": nuevas += [list(cols[i]), list(cols[i])]
                elif x == "*v":
                    j = i
                    while j + 1 < len(c) and c[j + 1] == "*v": j += 1
                    nuevas.append([cols[i][0], max(k[1] for k in cols[i:j + 1]), cols[i][2]]); i = j
                elif x == "*-": pass
                else: nuevas.append(cols[i])
                i += 1
            cols = nuevas; continue
        # línea de datos
        if compas == -1: compas = 0
        datos_desde_barra = True
        for k, x in zip(cols, c):
            d = _duracion_kern(x) if k[2] else None
            if d is not None: k[1] = T + d
        futuros = [k[1] for k in cols if k[1] > T + 1e-9]
        if futuros: T = min(futuros)
    únicos, vistos = [], set()                  # las dos voces de un pentagrama repiten la misma señal
    for e in ev:
        e = e[:6] + (round(e[6], 4),)
        if e not in vistos:
            vistos.add(e); únicos.append(e)
    return únicos


def insertar_octavas(xml, eventos):
    """Escribe en el MusicXML las líneas de octava como <direction><octave-shift>. music21 exporta los dos pentagramas como
    una sola <part> con <staff>1</staff> (superior) y <staff>2</staff>; la primera columna del Humdrum (parte 0) es el
    pentagrama inferior."""
    if not eventos:
        return xml
    pm = re.search(r"<part id=[^>]*>.*?</part>", xml, re.S)
    if not pm or xml.count("</part>") != 1:
        return xml
    cuerpo = pm.group(0)
    ms = list(re.finditer(r"<measure\b[^>]*>.*?</measure>", cuerpo, re.S))
    divs, d = [], 1.0
    for m in ms:
        x = re.search(r"<divisions>(\d+)</divisions>", m.group(0))
        if x: d = float(x.group(1))
        divs.append(d)
    por_compas = {}
    for (cp, inicio, tipo, tam, lugar, comp, q) in eventos:
        if comp < len(ms):
            por_compas.setdefault(comp, []).append((2 if cp == 0 else 1, q, inicio, tipo, tam, lugar))
    nuevos = {}
    for comp, evs in por_compas.items():
        medida = ms[comp].group(0)
        for st, q, inicio, tipo, tam, lugar in sorted(evs, key=lambda e: -e[1]):
            dir_ = ('<direction placement="%s"><direction-type><octave-shift type="%s" size="%d" number="1"/></direction-type>'
                    '<staff>%d</staff></direction>') % (lugar, tipo if inicio else "stop", tam, st)
            objetivo, cursor, ultimo, pos = q * divs[comp], 0.0, None, None
            for t in re.finditer(r"<note\b.*?</note>|<backup>.*?</backup>|<forward>.*?</forward>", medida, re.S):
                x = t.group(0)
                acorde, gracia = "<chord" in x, "<grace" in x
                es_nota = x.startswith("<note")
                est = re.search(r"<staff>(\d+)</staff>", x)
                est = int(est.group(1)) if est else 1
                if cursor >= objetivo - 1e-6 and ((es_nota and not acorde and est == st) or (not es_nota and ultimo == st)):
                    pos = t.start(); break
                du = re.search(r"<duration>(\d+(?:\.\d+)?)</duration>", x)
                du = float(du.group(1)) if du else 0.0
                if x.startswith("<backup"): cursor -= du
                elif x.startswith("<forward"): cursor += du
                elif not acorde and not gracia:
                    cursor += du; ultimo = est
            if pos is None: pos = medida.rfind("</measure>")
            medida = medida[:pos] + dir_ + medida[pos:]
        nuevos[comp] = medida
    pieza, ult = [], 0
    for comp in sorted(nuevos):
        m = ms[comp]; pieza += [cuerpo[ult:m.start()], nuevos[comp]]; ult = m.end()
    pieza.append(cuerpo[ult:])
    return xml[:pm.start()] + "".join(pieza) + xml[pm.end():]


def _con_invisibles():
    """music21 no lee la marca de invisibilidad `yy` de **kern: se añade a su lector de notas (silencio oculto)."""
    from music21.humdrum import spineParser as sp
    if getattr(sp.hdStringToNote, "_yy", False): return
    original = sp.hdStringToNote
    def lector(contenido):
        o = original(contenido)
        if "yy" in contenido and o.isRest: o.style.hideObjectOnPrint = True
        return o
    lector._yy = True
    sp.hdStringToNote = lector


def invisibles_a_forward(xml):
    """Los silencios invisibles (print-object="no") pasan a <forward>: espacio sin dibujo, que Verovio respeta."""
    def cambia(m):
        x = m.group(0)
        if "<rest" not in x: return x
        d = re.search(r"<duration>(\d+)</duration>", x)
        if not d: return x
        v = re.search(r"<voice>[^<]*</voice>", x); st = re.search(r"<staff>[^<]*</staff>", x)
        return "<forward><duration>%s</duration>%s%s</forward>" % (d.group(1), v.group(0) if v else "", st.group(0) if st else "")
    return re.sub(r'<note\b[^>]*print-object="no"[^>]*>.*?</note>', cambia, xml, flags=re.S)


def convertir(ruta_krn):
    bruto = open(ruta_krn, encoding="utf-8", errors="replace").read()
    _con_invisibles()
    texto = solo_kern(bruto) if os.environ.get("SIN_VOCES_POR_COMPAS") else voces_por_compas(solo_kern(bruto))
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
    out.octavas_kern = octavas_kern(texto)         # music21 las ignora: se escriben después en el MusicXML
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
    return _a_b64(invisibles_a_forward(insertar_octavas(xml.decode("utf-8", "ignore"), getattr(partitura, "octavas_kern", []))))


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


def añadir_octavas(kd, obras_json, paquete_json, salida):
    """Añade las líneas de octava (8va…) a los movimientos ya convertidos del paquete, sin volver a convertirlos."""
    obras = json.load(open(obras_json, encoding="utf-8"))
    paquete = json.load(open(paquete_json))
    movs = {}
    for o in obras:
        if o.get("pq") == "beethoven" and str(o["src"].get("partitura") or "").startswith("convertida"):
            movs.setdefault(str(o["m"]), o)
    n = 0
    for m, o in sorted(movs.items(), key=lambda kv: int(kv[0])):
        f = archivo_kern(o["src"].get("archivo")); ruta = os.path.join(kd, f) if f else None
        if not ruta or not os.path.exists(ruta) or m not in paquete:
            print(f"{m}\tSIN kern"); continue
        xml = _leer_xml(paquete[m])
        if "<octave-shift" in xml:
            continue
        ev = octavas_kern(solo_kern(open(ruta, encoding="utf-8", errors="replace").read()))
        if not ev:
            continue
        nuevo = insertar_octavas(xml, ev)
        if nuevo != xml:
            paquete[m] = _a_b64(nuevo); n += 1
            print(f"{m}\t{o['t']}\t{len(ev)} señales de octava")
    json.dump(paquete, open(salida, "w"))
    print(f"{n} movimientos con líneas de octava")


def reconvertir(kd, obras_json, paquete_json, salida):
    """Vuelve a convertir los movimientos ya convertidos del paquete (p. ej. tras corregir el conversor) conservando la
    numeración de compases que tienen (la del DCML, copiada con --etiquetas-de en su día). Solo se sustituye un
    movimiento si tiene el mismo número de compases; imprime cuántos compases cambian de notas."""
    obras = json.load(open(obras_json, encoding="utf-8"))
    paquete = json.load(open(paquete_json))
    movs = {}
    for o in obras:
        if o.get("pq") == "beethoven" and str(o["src"].get("partitura") or "").startswith("convertida"):
            movs.setdefault(str(o["m"]), o)
    def notas(medida):
        return re.sub(r"\s+", "", "".join(re.findall(r"<note\b.*?</note>|<backup>.*?</backup>|<forward>.*?</forward>", medida, re.S)))
    n = 0
    for m, o in sorted(movs.items(), key=lambda kv: int(kv[0])):
        f = archivo_kern(o["src"].get("archivo")); ruta = os.path.join(kd, f) if f else None
        if not ruta or not os.path.exists(ruta) or m not in paquete:
            print(f"{m}\tSIN kern"); continue
        viejo = _leer_xml(paquete[m])
        nuevo = _leer_xml(a_mxl_base64(convertir(ruta), f"/tmp/_k{m}"))
        parte = lambda x: x[: x.find("</part>")]
        mv = re.findall(r"<measure\b.*?</measure>", parte(viejo), re.S)
        mn = re.findall(r"<measure\b.*?</measure>", parte(nuevo), re.S)
        if len(mv) != len(mn):
            print(f"{m}\t{o['t']}\tNO: {len(mv)} compases antes y {len(mn)} ahora"); continue
        etq = [re.search(r'number="([^"]*)"', x).group(1) for x in mv]
        nuevo = renumerar(nuevo, etq)
        distintos = [etq[k] for k in range(len(mv)) if notas(mv[k]) != notas(mn[k])]
        paquete[m] = _a_b64(nuevo); n += 1
        print(f"{m}\t{o['t']}\t{f}\t{len(distintos)} de {len(mv)} compases cambian\t{' '.join(distintos[:12])}")
    json.dump(paquete, open(salida, "w"))
    print(f"{n} movimientos reconvertidos")


def main():
    if "--reconvertir" in sys.argv:
        a = [x for x in sys.argv[1:] if x != "--reconvertir"]
        return reconvertir(*a[:4])
    if "--octavas" in sys.argv:
        a = [x for x in sys.argv[1:] if x != "--octavas"]
        return añadir_octavas(*a[:4])
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
