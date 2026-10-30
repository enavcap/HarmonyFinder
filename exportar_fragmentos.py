#!/usr/bin/env python3
"""
Datos para la búsqueda por vocabulario de acordes (pasajes) y para la tira
de cifrados bajo la partitura.

  web/data/compases.json      rasgos por compás de todas las obras
  web/data/acordes/<n>.json   acordes por obra (en grupos de 50 obras)
"""
import json, sqlite3
from pathlib import Path
from collections import defaultdict

AQUI = Path(__file__).resolve().parent
OUT = AQUI / "web" / "data"
(OUT / "acordes").mkdir(parents=True, exist_ok=True)
con = sqlite3.connect(AQUI / "indice.sqlite"); con.row_factory = sqlite3.Row

TRIADAS = {"major", "minor", "diminished", "augmented"}

def clase(a):
    n = len(a["pcs"].split(","))
    if n == 3 and a["calidad"] in TRIADAS:
        return "tri"
    if n == 4 and a["septima"]:
        return "cua"
    return "otro"

def prestado(a):
    if a["secundaria"]:
        return False
    c = a["cifrado"]
    if a["modo"] == "major":
        return ((a["grado"] in (4, 5) and a["calidad"] == "minor" and not a["septima"]) or (a["grado"] == 4 and a["calidad"] == "minor") or c.startswith(("bVI", "bIII", "bVII", "iiø", "iio"))
                or (a["grado"] == 1 and a["calidad"] == "minor")
                or (c.startswith("viio") and a["septima"] and a["calidad"] == "diminished"))
    # en menor: tercera de picardía (tónica mayor)
    return a["grado"] == 1 and a["calidad"] == "major" and a["alteracion"] == 0

def alterado(a):
    if a["secundaria"] or prestado(a):
        return False
    return a["alteracion"] != 0 or a["cifrado"].startswith(("N", "It", "Fr", "Ger", "Sw"))

tonos, tono_idx = [], {}
def ti(t):
    if t not in tono_idx:
        tono_idx[t] = len(tonos); tonos.append(t)
    return tono_idx[t]

compases = {}          # obra -> [[compas, nAc, tri, cua, otro, inv0, inv1, inv2, inv3, prest, sec, alt, modos, cambio, tono], ...]
acordes = defaultdict(dict)
for (obra,) in con.execute("SELECT id FROM obras ORDER BY id"):
    filas = con.execute("SELECT * FROM acordes WHERE obra=? ORDER BY pos", (obra,)).fetchall()
    if not filas:
        continue
    por_compas = {}
    tono_prev = None
    lista = []
    for a in filas:
        m = por_compas.get(a["compas"])
        if m is None:
            m = por_compas[a["compas"]] = [a["compas"], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ti(a["tono"])]
        m[1] += 1
        k = clase(a)
        m[{"tri": 2, "cua": 3, "otro": 4}[k]] += 1
        if k != "otro" and a["inversion"] in (0, 1, 2, 3):
            m[5 + a["inversion"]] += 1
        if prestado(a): m[9] += 1
        if a["secundaria"]: m[10] += 1
        if alterado(a): m[11] += 1
        m[12] |= 1 if a["modo"] == "major" else 2
        if tono_prev is not None and a["tono"] != tono_prev:
            m[13] = 1
        tono_prev = a["tono"]
        lista.append([a["compas"], a["parte"], ti(a["tono"]), a["cifrado"]])
    compases[obra] = [por_compas[c] for c in sorted(por_compas)]
    acordes[obra // 50][obra] = lista

json.dump({"tonos": tonos, "obras": compases}, open(OUT / "compases.json", "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
for g, d in acordes.items():
    json.dump({"tonos": tonos, "obras": d}, open(OUT / "acordes" / f"{g}.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
tot = sum(len(v) for v in compases.values())
print(f"{len(compases)} obras, {tot} compases, {len(acordes)} grupos de acordes")
print("compases.json", round((OUT / "compases.json").stat().st_size / 1e6, 2), "MB")
print("acordes/", round(sum(p.stat().st_size for p in (OUT / "acordes").glob("*.json")) / 1e6, 2), "MB")
