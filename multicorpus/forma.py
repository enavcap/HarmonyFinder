"""
Forma de los movimientos (sección y zona), a partir de Taking Form (Gotham e Ireland, ISMIR 2019; MIT).

Taking Form anota cada movimiento compás a compás en columnas por niveles (de la sección mayor a la
más pequeña); una celda vacía continúa la etiqueta anterior de ese nivel y un cambio en un nivel
superior reinicia los inferiores. Aquí se toman los dos primeros niveles con etiqueta reconocible y
se traducen al vocabulario canónico (vocabulario.FORMA): nivel 1 = sección, nivel 2 = zona.

    python -m multicorpus.forma <carpeta Taking-Form/corpus> [salida.json]
"""
import csv, json, re, sys
from pathlib import Path
from . import vocabulario

def _limpia(x):
    x = x.strip().lower().replace("’", "'")
    x = re.sub(r"\s*\(.*?\)\s*", " ", x).strip()
    return re.sub(r"\s+", " ", x)

def _indice(nivel):
    idx = {}
    for k, v in vocabulario.FORMA.items():
        if v["nivel"] == nivel:
            for e in v["tf"]:
                idx[_limpia(e)] = k
    return idx

IDX1, IDX2 = _indice(1), _indice(2)

def clave(etiqueta, nivel):
    e = _limpia(etiqueta)
    idx = IDX1 if nivel == 1 else IDX2
    if e in idx:
        return idx[e]
    if nivel == 1 and re.match(r"variation\b", e):
        return "variacion"
    if nivel == 1 and "da capo" in e:
        return {"scherzo": "scherzo", "minuet": "minueto", "menuet": "minueto", "menuetto": "minueto"}.get(e.split()[0])
    return None

def _filas(ruta):
    """Filas (compás, parte, celdas) con los atajos de repetición desplegados: «58-61=1-4» en la columna
    del compás significa que 58-61 repiten el análisis de 1-4 por debajo del nivel que trae la fila."""
    crudas = list(csv.reader(open(ruta, encoding="utf-8", errors="replace")))
    out = []
    for f in crudas:
        if not f or not f[0].strip():
            continue
        celdas = [c.strip() for c in f[2:]] + [""] * 8
        m = re.fullmatch(r"(\d+)-(\d+)=(\d+)-(\d+)", f[0].strip().replace(" ", ""))
        if m:
            a, b, c, d = map(int, m.groups())
            out.append((a, 1.0, celdas[:8]))
            j0 = next((j for j, x in enumerate(celdas[:8]) if x), 8)
            for (cm, cp, cc) in [x for x in out if c <= x[0] <= d]:
                copia = ["" if k <= j0 else cc[k] for k in range(8)]
                if any(copia):
                    out.append((a + cm - c, cp, copia))
            continue
        try:
            out.append((int(float(f[0])), float(f[1] or 1), celdas[:8]))
        except ValueError:
            continue                                   # «Repeat: 1-8» y otras notas
    return out

def leer(ruta):
    """[(compás, parte, sección, zona)] en cada punto donde cambia algo. Sección y zona son claves del
    vocabulario o None (sin equivalente; el tramo queda sin forma en ese nivel)."""
    actual = [None] * 8
    out = []
    for compas, parte, celdas in _filas(ruta):
        j0 = next((j for j, x in enumerate(celdas) if x), None)
        if j0 is None:
            continue
        for k in range(j0, 8):
            actual[k] = celdas[k] or None
        sec = clave(actual[0], 1) if actual[0] else None
        # zona: la etiqueta de 2.º nivel; si la 1.ª columna ya es una zona (algunas anotaciones ponen
        # ahí la transición o el segundo grupo), se toma de ella
        zona = None
        if actual[0] and not sec and clave(actual[0], 2):
            zona = clave(actual[0], 2)
        elif actual[1]:
            zona = clave(actual[1], 2)
        if parte < 1:                                   # anacrusa de la sección: cuenta desde el compás
            parte = 1.0
        while out and (out[-1][0], out[-1][1]) >= (compas, parte):
            out.pop()                                   # misma posición (o atajo desplegado): manda la última
        if not out or (out[-1][2], out[-1][3]) != (sec, zona):
            out.append((compas, parte, sec, zona))
    if out:
        out[0] = (0, 0.0) + tuple(out[0][2:])           # la primera sección empieza con la obra (anacrusa incluida)
    return out

def en(forma, compas, parte):
    """(sección, zona) en ese punto de la forma."""
    r = (None, None)
    for c, p, s, z in forma:
        if (c, p) > (compas, parte or 1):
            break
        r = (s, z)
    return r

# ------------------------------------------------------------------ identificación con When in Rome
def carpeta_wir(nombre):
    """Carpeta de When in Rome (Piano_Sonatas/…/<obra>/<mov>) para un archivo de Taking Form."""
    m = re.match(r"K(\d+)-mvt(\d+)\.csv$", nombre)
    if m:
        return f"Piano_Sonatas/Mozart,_Wolfgang_Amadeus/K{m.group(1)}/{m.group(2)}"
    m = re.match(r"sonata\d+op(\d+)(?:no(\d+))?.*?movt(\d+)\.csv$", nombre)
    if m:
        op = f"Op{int(m.group(1)):03d}" + (f"_No{m.group(2)}" if m.group(2) else "")
        return f"Piano_Sonatas/Beethoven,_Ludwig_van/{op}/{m.group(3)}"
    return None

def ultimo_compas(ruta):
    nums = [int(float(r[0])) for r in csv.reader(open(ruta, encoding="utf-8", errors="replace"))
            if r and re.fullmatch(r"\d+(\.0)?", r[0].strip())]
    return max(nums) if nums else 0

def _reexposicion_coincide(F, acordes):
    """El primer acorde de la reexposición es el mismo (tonalidad y cifrado) que el de la exposición."""
    exp = [x for x in F if x[2] == "exposicion"]; rec = [x for x in F if x[2] == "reexposicion"]
    if not exp or not rec:
        return None
    m0, mr = max(1, exp[0][0]), rec[0][0]
    a = [x for x in acordes if x[0] == m0][:1]; b = [x for x in acordes if x[0] == mr][:1]
    return bool(a and b and a[0][2:] == b[0][2:])

def alinear(ruta, nums_partitura, acordes):
    """Forma de Taking Form alineada con la numeración de la partitura de HarmoFind, o None si no se puede
    comprobar. acordes: [(compás, parte, tono, cifrado)] de un análisis del movimiento.
    Se acepta si el último compás anotado coincide con el último número de la partitura, o si el primer
    acorde de la reexposición coincide con el de la exposición. Si la anotación acaba antes que la obra,
    lo que sigue queda sin forma."""
    F = leer(ruta)
    if not F:
        return None
    ints = [int(n) for n in nums_partitura if re.fullmatch(r"\d+", n or "")]
    if not ints:
        return None
    tfm = ultimo_compas(ruta)
    if tfm != max(ints) and not _reexposicion_coincide(F, acordes):
        return None
    if tfm < max(ints):
        F = F + [(tfm + 1, 1.0, None, None)]
    return F

def main(argv=None):
    argv = argv or sys.argv[1:]
    raiz = Path(argv[0])
    out = {}
    for f in sorted(raiz.glob("*_Sonatas/*.csv")):
        c = carpeta_wir(f.name)
        if c:
            out[c] = leer(f)
    json.dump(out, open(argv[1] if len(argv) > 1 else "forma_tf.json", "w"), ensure_ascii=False)
    print(len(out), "movimientos con forma")

if __name__ == "__main__":
    main()
