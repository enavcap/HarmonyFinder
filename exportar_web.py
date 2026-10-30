#!/usr/bin/env python3
"""
Exporta el índice a los datos estáticos de la web autónoma:
  web/data/obras.json          lista de obras
  web/data/hits/<concepto>.json coincidencias por concepto (compactas)
  web/scores/<paquete>.zip     partituras .mxl agrupadas por carpeta de compositor
"""
import json, re, sqlite3, zipfile, shutil
from pathlib import Path
from collections import defaultdict
import buscar

CORPUS = Path("/tmp/wir/Corpus")
OUT = Path(__file__).resolve().parent / "web"
(OUT / "data" / "hits").mkdir(parents=True, exist_ok=True)
(OUT / "scores").mkdir(exist_ok=True)

con = sqlite3.connect(buscar.DB); con.row_factory = sqlite3.Row
obras = [dict(r) for r in con.execute("SELECT * FROM obras ORDER BY id")]

def bonito(t):
    t = t.replace("_", " ")
    t = re.sub(r"\bBI\d+(-\d+)?\s*op(\d+)-(\d+)", r"Op. \2 nº \3", t)
    t = re.sub(r"\bBI(\d+)(-(\d+))?\b", r"B. \1", t)
    t = re.sub(r"\bOp(\d+)[ _]No(\d+)", r"Op. \1 nº \2", t)
    t = re.sub(r"\bOp(\d+)\b", r"Op. \1", t)
    t = re.sub(r"\bK(\d+)-(\d)\b", r"K. \1, mov. \2", t)
    t = re.sub(r"\bop(\d+)n(\d+)([a-z])\b", lambda m: f"Op. {int(m.group(1))} nº {int(m.group(2))}, mov. {ord(m.group(3))-96}", t)
    t = re.sub(r"\bNo\.\s*", "nº ", t)
    return t.strip()

ALIAS_COMPOSITOR = {"Piotr Ilyich Tchaikovsky": "Pyotr Ilyich Tchaikovsky", "Pyotr Tchaikovsky": "Pyotr Ilyich Tchaikovsky"}

def compositor_bonito(c):
    return ALIAS_COMPOSITOR.get(_compositor_bonito(c), _compositor_bonito(c))

def _compositor_bonito(c):
    c = c.replace("_", " ").strip().rstrip(",")
    if "," in c:
        ape, nom = [x.strip() for x in c.split(",", 1)]
        return f"{nom} {ape}"
    return c

# --- paquetes de partituras: una carpeta de compositor = un zip ---------
paquetes = defaultdict(list)
for o in obras:
    if o["partitura"]:
        key = "__".join(Path(o["carpeta"]).parts[:2])
        key = re.sub(r"[^A-Za-z0-9_.-]+", "-", key)
        paquetes[key].append(o)
        o["paquete"] = key
for key, lista in paquetes.items():
    import base64
    json.dump({str(o["id"]): base64.b64encode((CORPUS / o["partitura"]).read_bytes()).decode() for o in lista},
              open(OUT / "scores" / f"{key}.json", "w"))
print(f"{len(paquetes)} paquetes de partituras, {sum(len(v) for v in paquetes.values())} obras con partitura")

# --- obras -----------------------------------------------------------------
salida_obras = []
for o in obras:
    titulo = o["titulo"]
    # si el título es escueto (código de carpeta), completar con la ruta
    partes = Path(o["carpeta"]).parts
    if len(titulo) < 14 or re.fullmatch(r"[\w\-. /()]*\d[\w\-. /()]*", titulo) and "/" in titulo:
        titulo = " · ".join(x for x in partes[2:] if x != "_") if len(partes) > 2 else titulo
    salida_obras.append({
        "id": o["id"], "c": compositor_bonito(Path(o["carpeta"]).parts[1] if len(Path(o["carpeta"]).parts) > 1 else o["compositor"]), "t": bonito(titulo),
        "col": o["coleccion"].replace("_", " ").replace("OpenScore-LiederCorpus", "Lieder"),
        "ruta": o["carpeta"], "pq": o.get("paquete"), "n": o["compases"],
        "humano": 1,
    })
json.dump(salida_obras, open(OUT / "data" / "obras.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# --- coincidencias por concepto -------------------------------------------
resumen = {}
for concepto, (det, desc) in buscar.CONCEPTOS.items():
    res = buscar.buscar(concepto)
    filas = [[r["obra_id"], r["compas"], r["parte"], r["tono"], r["etiqueta"], r["compas_inicio"], r["compas_fin"]] for r in res]
    json.dump(filas, open(OUT / "data" / "hits" / f"{concepto}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    resumen[concepto] = {"desc": desc, "n": len(filas), "obras": len({f[0] for f in filas})}
    print(f"{concepto:32} {len(filas):6} en {resumen[concepto]['obras']} obras")

json.dump({"conceptos": resumen, "sinonimos": buscar.SINONIMOS, "requiere": buscar.REQUIERE,
           "n_obras": len(salida_obras), "n_acordes": con.execute("SELECT COUNT(*) FROM acordes").fetchone()[0]},
          open(OUT / "data" / "meta.json", "w", encoding="utf-8"), ensure_ascii=False)
print("listo:", OUT)
