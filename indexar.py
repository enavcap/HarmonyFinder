#!/usr/bin/env python3
"""
Construye el índice SQLite de acordes a partir del corpus When in Rome.

    python indexar.py <ruta_corpus> [indice.sqlite]

Una fila por acorde con su contexto: obra, compás, parte, tonalidad,
cifrado romano, grado, inversión, calidad, dominante secundaria, etc.
"""
import sys, sqlite3, re
from pathlib import Path
from multiprocessing import Pool
from music21 import converter, roman

ESQUEMA = """
CREATE TABLE IF NOT EXISTS obras (
    id INTEGER PRIMARY KEY, coleccion TEXT, compositor TEXT, titulo TEXT,
    carpeta TEXT, analisis TEXT, partitura TEXT, compases INTEGER, compas_pickup INTEGER
);
CREATE TABLE IF NOT EXISTS acordes (
    obra INTEGER, pos INTEGER, compas INTEGER, parte REAL, offset REAL,
    tono TEXT, modo TEXT, cifrado TEXT, grado INTEGER, alteracion INTEGER,
    calidad TEXT, inversion INTEGER, secundaria TEXT, septima INTEGER,
    pcs TEXT, bajo TEXT, cambio_tono INTEGER,
    PRIMARY KEY (obra, pos)
);
CREATE INDEX IF NOT EXISTS i_cif ON acordes(cifrado);
CREATE INDEX IF NOT EXISTS i_grado ON acordes(grado, secundaria);
"""

def _meta(path, corpus):
    rel = path.relative_to(corpus).parts
    meta = {"coleccion": rel[0], "compositor": rel[1] if len(rel) > 2 else "?",
            "titulo": " / ".join(rel[2:-1]) or rel[1]}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[:8]:
        m = re.match(r"(Composer|Title):\s*(.+)", line)
        if m and m.group(2).strip() not in ("?", ""):
            meta[m.group(1).lower().replace("composer", "compositor").replace("title", "titulo")] = m.group(2).strip()
    meta["compositor"] = meta["compositor"].replace("_", " ").rstrip(",")
    meta["titulo"] = meta["titulo"].replace("_", " ")
    return meta

def procesar(args):
    path, corpus = args
    path, corpus = Path(path), Path(corpus)
    try:
        from multicorpus import correcciones
        rel = path.relative_to(corpus).as_posix()
        if correcciones.correcciones(rel):      # erratas conocidas de la fuente (multicorpus/correcciones_fuentes.json)
            s = converter.parse(correcciones.aplicar(path.read_text(encoding="utf-8"), rel), format="romantext")
        else:
            s = converter.parse(str(path), format="romantext")
    except Exception as e:
        return None, f"{path}: {e}"
    filas, tono_prev = [], None
    measures = list(s.recurse().getElementsByClass("Measure"))
    for rn in s.recurse().getElementsByClass(roman.RomanNumeral):
        m = rn.getContextByClass("Measure")
        if m is None or rn.key is None:
            continue
        tono = rn.key.tonicPitchNameWithCase
        alt = rn.frontAlterationAccidental.alter if rn.frontAlterationAccidental else 0
        filas.append((
            len(filas), m.number, round(float(rn.beat), 3), float(m.offset + rn.offset),
            tono, rn.key.mode, rn.figure, rn.scaleDegree, int(alt),
            rn.quality, rn.inversion(),
            rn.secondaryRomanNumeral.figure if rn.secondaryRomanNumeral else None,
            1 if rn.isSeventh() else 0,
            ",".join(str(p.pitchClass) for p in rn.pitches),
            rn.bass().name, 1 if tono != tono_prev and tono_prev is not None else 0,
        ))
        tono_prev = tono
    meta = _meta(path, corpus)
    score = path.parent / "score.mxl"
    meta.update(carpeta=str(path.parent.relative_to(corpus)),
                analisis=str(path.relative_to(corpus)),
                partitura=str(score.relative_to(corpus)) if score.exists() else None,
                compases=max((mm.number for mm in measures), default=0),
                compas_pickup=1 if measures and measures[0].number == 0 else 0)
    return (meta, filas), None

def main(corpus, db="indice.sqlite"):
    corpus = Path(corpus).resolve()
    con = sqlite3.connect(db)
    con.executescript(ESQUEMA)
    paths = sorted(list(corpus.rglob("analysis.txt")) + list(corpus.rglob("analysis.rntxt")))
    print(f"{len(paths)} análisis encontrados")
    ok = fail = 0
    with Pool() as pool:
        for i, (res, err) in enumerate(pool.imap_unordered(procesar, [(str(p), str(corpus)) for p in paths], chunksize=4)):
            if err:
                fail += 1; print("  [aviso]", err[:140], file=sys.stderr); continue
            meta, filas = res
            cur = con.execute("INSERT INTO obras (coleccion,compositor,titulo,carpeta,analisis,partitura,compases,compas_pickup) VALUES (?,?,?,?,?,?,?,?)",
                              (meta["coleccion"], meta["compositor"], meta["titulo"], meta["carpeta"], meta["analisis"], meta["partitura"], meta["compases"], meta["compas_pickup"]))
            con.executemany("INSERT INTO acordes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            [(cur.lastrowid, *f) for f in filas])
            ok += 1
            if ok % 100 == 0:
                con.commit(); print(f"  {ok} obras indexadas...")
    con.commit()
    n = con.execute("SELECT COUNT(*) FROM acordes").fetchone()[0]
    print(f"Listo: {ok} obras, {n} acordes, {fail} análisis omitidos -> {db}")

if __name__ == "__main__":
    main(*sys.argv[1:])
