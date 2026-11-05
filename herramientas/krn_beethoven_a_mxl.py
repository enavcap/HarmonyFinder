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


def convertir(ruta_krn):
    s = converter.parse(ruta_krn, format="humdrum")
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


def a_mxl_base64(partitura, nombre):
    tmp = nombre + ".tmp.musicxml"
    partitura.write("musicxml", fp=tmp)
    xml = open(tmp, "rb").read(); os.remove(tmp)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("META-INF/container.xml",
                   '<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>')
        z.writestr("score.xml", xml)
    return base64.b64encode(buf.getvalue()).decode()


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    kd, obras_json, paquete_json, salida = sys.argv[1:5]
    solo = None
    if "--solo" in sys.argv:
        solo = set(sys.argv[sys.argv.index("--solo") + 1].split(","))
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
            paquete[m] = a_mxl_base64(convertir(ruta), f"/tmp/_k{m}")
            hechos[m] = f; print(f"{m}\t{o['t']}\t{f}")
        except Exception as e:
            print(f"{m}\t{o['t']}\tFALLO {type(e).__name__}: {e}")
    json.dump(paquete, open(salida, "w"))
    json.dump(hechos, open(salida + ".lista.json", "w"), indent=1)
    print(f"{len(hechos)} movimientos convertidos")


if __name__ == "__main__":
    main()
