#!/usr/bin/env python3
"""
Recalcula las coincidencias de uno o varios conceptos derivados directamente sobre los datos ya
exportados de la web (web/data/acordes), sin necesidad del catálogo ni de las fuentes.

    python herramientas/recalcular_concepto.py pedal_de_dominante [otro_concepto …]

Reescribe web/data/hits/<concepto>.json y su entrada en web/data/meta.json (descripción, criterio,
número de coincidencias y de análisis, sinónimos), y regenera web/data/vocab.json. Los campos que los
detectores necesitan y que la web no guarda (grado, calidad, inversión, bajo…) se derivan del
cifrado con music21, igual que en indexar.py. Como en exportar_mc, los detectores se ejecutan por
tramos, sin cruzar los pasajes al unísono.
"""
import json, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
import buscar
from multicorpus import vocabulario, unisonos, buscar_mc

CONC = buscar_mc.conceptos()   # {clave: (detector, descripción, tipo)}: los de buscar.py y los nuevos del multicorpus

DATA = RAIZ / "web" / "data"


def derivar(compas, parte, tono, cifrado, unisono):
    a = dict(compas=compas, parte=parte, tono=tono, cifrado=cifrado, unisono=unisono,
             modo="minor" if tono[:1].islower() else "major",
             grado=None, alteracion=0, calidad="other", inversion=None, secundaria=None,
             septima=0, pcs=None, bajo=None)
    try:
        rn = buscar._rn(cifrado, tono)
        alt = rn.frontAlterationAccidental.alter if rn.frontAlterationAccidental else 0
        a.update(grado=rn.scaleDegree, alteracion=int(alt), calidad=rn.quality, inversion=rn.inversion(),
                 secundaria=rn.secondaryRomanNumeral.figure if rn.secondaryRomanNumeral else None,
                 septima=1 if rn.isSeventh() else 0,
                 pcs=",".join(str(p.pitchClass) for p in rn.pitches), bajo=rn.bass().name)
    except Exception:
        pass
    return a


def analisis():
    for f in sorted((DATA / "acordes").glob("*.json"), key=lambda p: int(p.stem)):
        d = json.load(open(f, encoding="utf-8"))
        tonos = d["tonos"]
        for aid, filas in d["obras"].items():
            yield int(aid), [derivar(x[0], x[1], tonos[x[2]], x[3], 1 if len(x) > 6 and x[6] else 0)
                             for x in filas]


def recalcular(conceptos):
    hits = {k: [] for k in conceptos}
    for aid, ac in analisis():
        for _, seg in unisonos.tramos(ac):
            for k in conceptos:
                try:
                    res = CONC[k][0](seg)
                except Exception:
                    continue
                for i, et, n in res:
                    a = seg[i]
                    hits[k].append([aid, a["compas"], a["parte"], a["tono"], et,
                                    seg[max(0, i - 1)]["compas"] if n > 1 and i > 0 else a["compas"],
                                    seg[min(len(seg) - 1, i + n - 1)]["compas"]])
    meta = json.load(open(DATA / "meta.json", encoding="utf-8"))
    for k in conceptos:
        det, desc, tipo = CONC[k]
        json.dump(hits[k], open(DATA / "hits" / f"{k}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        anterior = meta["conceptos"].get(k, {})
        meta["conceptos"][k] = {**anterior, "tipo": tipo,
                                "desc": vocabulario.CONCEPTOS[k]["desc_es"] if k in vocabulario.CONCEPTOS else desc,
                                "n": len(hits[k]), "obras": len({h[0] for h in hits[k]}),
                                "criterio": (det.__doc__ or desc).strip().split("\n")[0]}
        if k in vocabulario.CONCEPTOS:
            meta["sinonimos"][k] = vocabulario.sinonimos_concepto(k)
        print(f"{k:32} {anterior.get('n', '?'):>6} → {len(hits[k]):6}")
    json.dump(meta, open(DATA / "meta.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(vocabulario.exportar(), open(DATA / "vocab.json", "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    ks = sys.argv[1:]
    malos = [k for k in ks if k not in CONC]
    if not ks or malos:
        sys.exit(f"uso: {sys.argv[0]} concepto […]   (desconocidos: {malos})")
    recalcular(ks)
