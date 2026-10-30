#!/usr/bin/env python3
"""
Extrae los compases alrededor de una coincidencia desde score.mxl.

    python recortar.py <ruta_corpus> <obra_id> <compas> [--margen 1] [--salida dir] [--png]

Genera MusicXML (siempre) y, si hay MuseScore o Verovio instalados, PNG/SVG.
Añade un texto con la tonalidad y el cifrado sobre el compás señalado.
"""
import sys, sqlite3, argparse, shutil, subprocess
from pathlib import Path
from music21 import converter, expressions

AQUI = Path(__file__).resolve().parent
DB = AQUI / "indice.sqlite"

def recortar(corpus, obra_id, compas, margen=1, salida=AQUI / "recortes", etiqueta=None, png=False, db=DB):
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    obra = con.execute("SELECT * FROM obras WHERE id=?", (obra_id,)).fetchone()
    if not obra or not obra["partitura"]:
        raise FileNotFoundError("esta obra no tiene score.mxl en el corpus")
    s = converter.parse(str(Path(corpus) / obra["partitura"]))
    ini, fin = max(0, compas - margen), compas + margen
    frag = s.measures(ini, fin)
    if etiqueta:
        for p in frag.parts:
            m = p.measure(compas)
            if m is not None:
                te = expressions.TextExpression(etiqueta); te.style.fontWeight = "bold"
                m.insert(0, te); break
    frag.metadata = s.metadata
    salida = Path(salida); salida.mkdir(exist_ok=True)
    nombre = f'{obra_id:04d}_{Path(obra["carpeta"]).name[:30]}_c{compas}'.replace(" ", "_")
    xml = salida / f"{nombre}.musicxml"
    frag.write("musicxml", fp=str(xml))
    out = {"musicxml": str(xml)}
    if png:
        try:
            import verovio
            tk = verovio.toolkit()
            tk.setOptions({"pageWidth": 2100, "scale": 40, "adjustPageHeight": True,
                           "header": "none", "footer": "none", "breaks": "none"})
            tk.loadFile(str(xml))
            svg = xml.with_suffix(".svg")
            svg.write_text(tk.renderToSVG(1), encoding="utf-8")
            out["svg"] = str(svg)
        except ImportError:
            exe = shutil.which("mscore") or shutil.which("musescore")
            if exe:
                subprocess.run([exe, "-o", str(xml.with_suffix(".png")), str(xml)], capture_output=True)
                out["png"] = str(xml.with_suffix(".png"))
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus"); ap.add_argument("obra_id", type=int); ap.add_argument("compas", type=int)
    ap.add_argument("--margen", type=int, default=1); ap.add_argument("--salida", default=str(AQUI / "recortes"))
    ap.add_argument("--etiqueta"); ap.add_argument("--png", action="store_true")
    a = ap.parse_args()
    print(recortar(a.corpus, a.obra_id, a.compas, a.margen, a.salida, a.etiqueta, a.png))
