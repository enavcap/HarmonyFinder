"""
Reconstruye una partitura MusicXML a partir de las tablas de notas y compases del DCML
(notes.tsv + measures.tsv), sin necesidad de MuseScore.

    python dcml_a_mxl.py <dir_tablas> <lista.json> <dir_corpus> [solo_repo]

Por cada obra escribe <dir_corpus>/<carpeta>/score.mxl.
Conserva: alturas con su grafía, duraciones, voces, acordes, ligaduras de prolongación,
armaduras, compases y numeración de compases (mn). No conserva dinámicas, articulaciones
ni ligaduras de expresión.
"""
import csv, json, os, sys, warnings
from fractions import Fraction
from collections import defaultdict
warnings.filterwarnings("ignore")
from music21 import stream, note, chord, meter, key, clef, tie, pitch, duration, layout, instrument

def fr(x):
    return Fraction(x) if x not in ("", None) else Fraction(0)

def leer(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))

def convertir(notas_tsv, compases_tsv, salida):
    notas, compases = leer(notas_tsv), leer(compases_tsv)
    compases.sort(key=lambda r: int(r["mc"]))
    staffs = sorted({int(n["staff"]) for n in notas})
    # clave por pentagrama según la tesitura
    clave = {}
    for s in staffs:
        midis = sorted(int(n["midi"]) for n in notas if int(n["staff"]) == s and n.get("midi"))
        med = midis[len(midis) // 2] if midis else 60
        clave[s] = clef.TrebleClef() if med >= 57 else clef.BassClef()
    por = defaultdict(list)                       # (mc, staff, voice) -> notas
    for n in notas:
        if n.get("gracenote"):
            continue
        por[(int(n["mc"]), int(n["staff"]), int(n.get("voice") or 1))].append(n)

    partitura = stream.Score()
    partes = {}
    for s in staffs:
        p = stream.PartStaff(id=f"P{s}")
        p.insert(0, instrument.Instrument())
        partes[s] = p
    vistos_mn = defaultdict(int)
    ts_prev = ks_prev = None
    for i, m in enumerate(compases):
        mc, mn = int(m["mc"]), int(m["mn"])
        vistos_mn[mn] += 1
        etiqueta = str(mn) if vistos_mn[mn] == 1 else f"{mn}X{vistos_mn[mn] - 1}"
        ts, ks = m["timesig"], int(float(m["keysig"] or 0))
        act = fr(m["act_dur"]) * 4
        lleno = Fraction(meter.TimeSignature(ts).barDuration.quarterLength).limit_denominator(64)
        for s in staffs:
            meas = stream.Measure(number=mn)
            meas.numberSuffix = None
            if etiqueta != str(mn):
                meas.number = mn
                meas.numberSuffix = etiqueta[len(str(mn)):]
            if i == 0:
                meas.insert(0, clave[s])
            if ts != ts_prev:
                meas.insert(0, meter.TimeSignature(ts))
            if ks != ks_prev:
                meas.insert(0, key.KeySignature(ks))
            if i == 0 and act < lleno:
                meas.paddingLeft = float(lleno - act)            # anacrusa
            voces = sorted(v for (c, st, v) in por if c == mc and st == s) or [1]
            for v in voces:
                voz = stream.Voice(id=str(v))
                grupos = defaultdict(list)
                for n in por.get((mc, s, v), []):
                    grupos[(fr(n["mc_onset"]), fr(n["duration"]))].append(n)
                for (on, du), ns in sorted(grupos.items()):
                    ql = float(du * 4)
                    if ql <= 0:
                        continue
                    ps = [pitch.Pitch(n["name"].replace("b", "-") if len(n["name"]) > 1 and n["name"][1:2] == "b" else n["name"]) for n in ns]
                    el = note.Note(ps[0]) if len(ps) == 1 else chord.Chord(ps)
                    el.duration = duration.Duration(ql)
                    t = ns[0].get("tied", "")
                    if t not in ("", None):
                        el.tie = tie.Tie({"1": "start", "0": "continue", "-1": "stop"}.get(str(int(float(t))), "start"))
                    voz.insert(float(on * 4), el)
                if len(voz.notes) == 0 and len(voces) > 1:
                    continue
                voz.makeRests(fillGaps=True, inPlace=True, refStreamOrTimeRange=[0.0, float(act)], hideRests=False)
                meas.insert(0, voz)
            if len(meas.voices) == 1:                           # una sola voz: aplanar
                v = meas.voices[0]; meas.remove(v)
                for el in v.elements:
                    meas.insert(el.offset, el)
            partes[s].append(meas)
        ts_prev, ks_prev = ts, ks
    for s in staffs:
        partitura.insert(0, partes[s])
    if len(staffs) == 2:
        partitura.insert(0, layout.StaffGroup([partes[s] for s in staffs], symbol="brace"))
    try:
        partitura.write("mxl", fp=salida)
    except Exception:
        # duraciones irregulares (cadencias, grupetos): cuantizar y quitar silencios residuales
        partitura.quantize((16, 12, 10, 14), processOffsets=True, processDurations=True, inPlace=True, recurse=True)
        for r in list(partitura.recurse().getElementsByClass(note.Rest)):
            if r.quarterLength < 1 / 32 or r.duration.type in ("inexpressible", "complex") and r.quarterLength < 0.25:
                r.activeSite.remove(r)
        for n in partitura.recurse().notesAndRests:
            if n.duration.type == "inexpressible":
                n.duration = duration.Duration(max(0.0625, round(n.quarterLength * 16) / 16))
        partitura.write("mxl", fp=salida)

if __name__ == "__main__":
    tablas, lista, corpus = sys.argv[1:4]
    solo = sys.argv[4] if len(sys.argv) > 4 else None
    ok = mal = 0
    for x in json.load(open(lista)):
        if solo and x["repo"] != solo:
            continue
        base = os.path.join(tablas, f"{x['repo']}__{x['nombre']}")
        if os.path.exists(os.path.join(corpus, x["dir"], "score.mxl")):
            continue
        try:
            convertir(base + ".notes.tsv", base + ".measures.tsv", os.path.join(corpus, x["dir"], "score.mxl"))
            ok += 1
        except Exception as e:
            mal += 1
            print("fallo", x["dir"], type(e).__name__, str(e)[:120], flush=True)
    print("convertidas", ok, "fallos", mal)
