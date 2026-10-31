"""
Exporta el catálogo multicorpus a los datos estáticos de la web.

    python -m multicorpus.exportar_mc [--solo-datos]

web/data/obras.json        una entrada por ANÁLISIS (con su movimiento y su obra), solo si hay partitura
web/data/meta.json         conceptos (con tipo y criterio), sinónimos, fuentes y licencias
web/data/hits/<c>.json     coincidencias por concepto: [análisis, compás, parte, tono, etiqueta, ini, fin]
web/data/compases.json     rasgos por compás (búsqueda por tipo de acorde)
web/data/forma.json        sección y zona de cada movimiento con forma (Taking Form): {mov: [[compás, parte, sección, zona]…]}
web/data/acordes/<n>.json  acordes por análisis (progresiones, contexto, comparador, cifrados);
                           un 7.º campo 1 marca los acordes de un pasaje al unísono u octava
web/scores/<p>.json        partituras MusicXML (base64), por compositor, indexadas por movimiento
"""
import base64, json, re, sys, shutil
from collections import defaultdict
from pathlib import Path

from .buscar_mc import conectar, acordes, conceptos, sinonimos, RAIZ, DATOS
from . import unisonos, cadencias, vocabulario, forma, forma_global
import buscar

WEB = RAIZ / "web"
NOMBRE_FUENTE = {"wir": "When in Rome", "dcml": "DCML"}

def titulo_entrada(o, m):
    t = o["titulo"]
    if m["titulo"] and m["numero"]:
        return f'{t} · {m["numero"]}. {m["titulo"]}'
    if m["titulo"]:
        return f'{t} · {m["titulo"]}'
    if m["numero"]:
        return f'{t} · {m["numero"]}'
    return t

TRIADAS = {"major", "minor", "diminished", "augmented"}
def clase(a):
    n = len((a["pcs"] or "").split(",")) if a["pcs"] else 0
    if n == 3 and a["calidad"] in TRIADAS: return "tri"
    if n == 4 and a["septima"]: return "cua"
    return "otro"

def prestado(a):
    if a["secundaria"]: return False
    c = a["cifrado"]
    if a["modo"] == "major":
        return ((a["grado"] in (4, 5) and a["calidad"] == "minor" and not a["septima"]) or c.startswith(("bVI", "bIII", "bVII", "iiø", "iio"))
                or (a["grado"] == 1 and a["calidad"] == "minor") or (c.startswith("viio") and a["septima"] and a["calidad"] == "diminished"))
    return a["grado"] == 1 and a["calidad"] == "major" and (a["alteracion"] or 0) == 0

def alterado(a):
    if a["secundaria"] or prestado(a): return False
    return (a["alteracion"] or 0) != 0 or a["cifrado"].startswith(("N", "It", "Fr", "Ger", "Sw"))

def instrumentos(r):
    """Instrumento de cada pentagrama según los metadatos del DCML (para elegir las claves al dibujar)."""
    try:
        md = json.loads(r["metadatos_originales"] or "{}")
    except ValueError:
        return []
    inst = [md[f"staff_{i}_instrument"] for i in range(1, 12) if md.get(f"staff_{i}_instrument")]
    # las suites para violonchelo de Bach vienen etiquetadas como «Piano» (valor por defecto de MuseScore)
    if r["subcorpus"] == "bach_solo" and inst == ["Piano"] and r["otit"].startswith("Suite No."):
        inst = ["Violoncello"]
    return inst

def pcs_de(a):
    """Clases de altura del acorde cifrado (frozenset) o None."""
    if a.get("pcs"):
        try:
            return frozenset(int(x) for x in str(a["pcs"]).split(","))
        except ValueError:
            pass
    try:
        return frozenset(p.pitchClass for p in buscar._rn(a["cifrado"], a["tono"]).pitches)
    except Exception:
        return None

def marcar_unisonos(ac, partitura, continuo=False):
    """Pone a["unisono"] = 1 en los acordes de pasajes al unísono u octava (ver unisonos.py) y
    a["r"] = rasgos de partitura para las cadencias (ver cadencias.py)."""
    flags = [0] * len(ac)
    pos = [(a["compas"], a["parte"]) for a in ac]
    if partitura and not continuo:
        flags = unisonos.marcar(partitura, pos, [pcs_de(a) for a in ac])
    rs = cadencias.rasgos(partitura, pos) if partitura else [None] * len(ac)
    for a, f, r in zip(ac, flags, rs):
        a["unisono"] = f; a["r"] = r
    return ac

def datos_analisis(ac, aid, ti, CONC):
    """(acordes para la web, rasgos por compás, {concepto: coincidencias}) de un análisis.
    Los acordes de pasajes al unísono no cuentan en los rasgos por compás ni en los detectores
    derivados (que se ejecutan por tramos, sin cruzar esos pasajes)."""
    fila = []
    for a in ac:
        x = [a["compas"], a["parte"], ti(a["tono"]), a["cifrado"],
             a["etiqueta_original"] if a["etiqueta_original"] != a["cifrado"] else 0, a.get("cadencia") or 0]
        if a.get("unisono"):
            x.append(1)
        fila.append(x)
    pc = {}
    prev = None
    for a in ac:
        if a.get("unisono"):
            prev = None                                   # no hay cambio de tono a través del pasaje
            continue
        m = pc.get(a["compas"])
        if m is None:
            m = pc[a["compas"]] = [a["compas"], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ti(a["tono"])]
        m[1] += 1; k = clase(a); m[{"tri": 2, "cua": 3, "otro": 4}[k]] += 1
        if k != "otro" and a["inversion"] in (0, 1, 2, 3): m[5 + a["inversion"]] += 1
        if prestado(a): m[9] += 1
        if a["secundaria"]: m[10] += 1
        if alterado(a): m[11] += 1
        m[12] |= 1 if a["modo"] == "major" else 2
        if prev is not None and a["tono"] != prev: m[13] = 1
        prev = a["tono"]
    hits = {}
    tramos = unisonos.tramos(ac)
    for k, (det, desc, tipo) in CONC.items():
        partes = [(0, ac)] if tipo == "anotado" else tramos
        out = hits[k] = []
        for _, seg in partes:
            try:
                res = det(seg)
            except Exception:
                continue
            for i, et, n in res:
                a = seg[i]
                out.append([aid, a["compas"], a["parte"], a["tono"], et,
                            seg[max(0, i - 1)]["compas"] if n > 1 and i > 0 else a["compas"],
                            seg[min(len(seg) - 1, i + n - 1)]["compas"]])
    return fila, [pc[c] for c in sorted(pc)], hits

def main(argv=None):
    solo_datos = "--solo-datos" in (argv or sys.argv[1:])
    con = conectar()
    filas = con.execute("""SELECT a.*, m.id mid, m.numero mnum, m.titulo mtit, m.partitura, m.partitura_origen,
                                  o.id oid, o.titulo otit, o.catalogo, o.periodo, o.anio, c.nombre, c.nombre_orden, c.id cid
                           FROM analisis a JOIN movimientos m ON m.id=a.movimiento_id JOIN obras o ON o.id=m.obra_id
                           JOIN compositores c ON c.id=o.compositor_id
                           WHERE m.partitura IS NOT NULL ORDER BY c.nombre_orden, o.titulo, m.numero, a.fuente, a.id""").fetchall()
    ids_an, ids_mov, ids_obra = {}, {}, {}
    # obras distintas con el mismo título visible (p. ej. armonizaciones de un coral): se añade el catálogo
    repetidos = defaultdict(set)
    for r in filas:
        repetidos[(r["cid"], r["otit"].strip().lower())].add(r["oid"])
    def titulo_visible(r):
        t = r["otit"]
        if len(repetidos[(r["cid"], t.strip().lower())]) > 1 and r["catalogo"] and r["catalogo"].lower() not in t.lower():
            return f'{t} ({r["catalogo"]})'
        return t
    entradas, bundles = [], defaultdict(dict)
    for r in filas:
        aid = ids_an.setdefault(r["id"], len(ids_an) + 1)
        mid = ids_mov.setdefault(r["mid"], len(ids_mov) + 1)
        wid = ids_obra.setdefault(r["oid"], len(ids_obra) + 1)
        pq = re.sub(r"[^A-Za-z0-9_-]+", "-", r["cid"])
        if not solo_datos and str(mid) not in bundles[pq]:
            bundles[pq][str(mid)] = base64.b64encode((DATOS / r["partitura"]).read_bytes()).decode()
        entradas.append({
            "id": aid, "m": mid, "w": wid, "c": r["nombre"], "co": r["nombre_orden"],
            "t": titulo_entrada({"titulo": titulo_visible(r)}, {"titulo": r["mtit"], "numero": r["mnum"]}),
            "ob": titulo_visible(r), "mv": r["mnum"], "cat": r["catalogo"], "per": r["periodo"], "anio": r["anio"],
            "f": r["fuente"], "col": f'{NOMBRE_FUENTE[r["fuente"]]} · {r["subcorpus"]}', "pq": pq,
            "src": {"archivo": r["archivo"], "url": r["url"], "version": (r["version"] or "")[:12], "licencia": r["licencia"],
                    "autores": r["autores"], "ref": r["referencia"], "origen": r["origen_declarado"],
                    "anot": r["version_anotacion"], "partitura": r["partitura_origen"], "clave": r["id"],
                    **({"inst": instrumentos(r)} if instrumentos(r) else {})},
        })
    print(f"{len(entradas)} análisis · {len(ids_mov)} movimientos · {len(ids_obra)} obras con partitura")
    (WEB / "data" / "hits").mkdir(parents=True, exist_ok=True)
    (WEB / "data" / "acordes").mkdir(exist_ok=True)
    json.dump(entradas, open(WEB / "data" / "obras.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    if not solo_datos:
        (WEB / "scores").mkdir(exist_ok=True)
        for f in (WEB / "scores").glob("*.json"):
            f.unlink()
        for pq, d in bundles.items():
            json.dump(d, open(WEB / "scores" / f"{pq}.json", "w"))
    # acordes, compases y coincidencias
    tonos, tidx = [], {}
    def ti(t):
        if t not in tidx:
            tidx[t] = len(tonos); tonos.append(t)
        return tidx[t]
    grupos, compases = defaultdict(dict), {}
    CONC = conceptos()
    hits = {k: [] for k in CONC}
    n_uni = 0
    TF = DATOS / "fuentes" / "taking_form" / "corpus"          # clon de github.com/MarkGotham/Taking-Form
    archivos_tf = {forma.carpeta_wir(f.name): f for f in TF.glob("*_Sonatas/*.csv")} if TF.exists() else {}
    formas = {}
    for r in filas:
        aid = ids_an[r["id"]]
        ac = acordes(con, r["id"])
        ruta = DATOS / r["partitura"]
        marcar_unisonos(ac, ruta.read_bytes() if ruta.exists() else None,
                        unisonos.continuo_sin_realizar(r["subcorpus"], instrumentos(r), r["nombre"]))
        n_uni += sum(a["unisono"] for a in ac)
        tf = archivos_tf.get((r["archivo"] or "").rsplit("/", 1)[0]) if r["fuente"] == "wir" else None
        mid = ids_mov[r["mid"]]
        if tf and mid not in formas and ruta.exists():
            _, compases_p = unisonos.leer(ruta.read_bytes())
            F = forma.alinear(tf, [c[0] for c in compases_p], [(a["compas"], a["parte"], a["tono"], a["cifrado"]) for a in ac])
            if F:
                formas[mid] = [list(x) for x in F]
        grupos[aid // 50][aid], compases[aid], hs = datos_analisis(ac, aid, ti, CONC)
        for k, v in hs.items():
            hits[k].extend(v)
    print(f"{n_uni} acordes en pasajes al unísono u octava · {len(formas)} movimientos con secciones")
    json.dump(formas, open(WEB / "data" / "forma.json", "w", encoding="utf-8"), separators=(",", ":"))
    # forma global de cada movimiento y número tradicional de sonatas y cuartetos (forma_global.py)
    td = forma_global.titulos_dcml(DATOS / "fuentes" / "dcml_meta" / "beethoven_piano_sonatas" / "metadata.tsv",
                                   DATOS / "fuentes" / "dcml_meta" / "mozart_piano_sonatas" / "metadata.tsv")
    rev = forma_global.revisadas(RAIZ / "multicorpus" / "formas_revisadas.tsv")
    fglob, numeros = {}, {}
    for e in entradas:
        n = forma_global.numero(e["c"], e["ob"], e["cat"])
        if n:
            numeros[e["w"]] = n
        if e["m"] in fglob:
            continue
        try:
            mv = int(str(e["mv"] or "").split(".")[0])
        except ValueError:
            mv = None
        extra = td.get(("Beethoven" if "Beethoven" in e["c"] else "Mozart", n, mv)) if n and mv and "Sonata para piano" in e["ob"] else None
        clave = e["src"]["archivo"].rsplit("/", 1)[0] if e["f"] == "wir" else e["src"]["archivo"]
        f, fu = forma_global.asignar({"fuente": e["f"], "subcorpus": e["col"].split(" · ", 1)[1], "compositor": e["c"],
                                      "titulo": e["t"], "clave": clave},
                                     [x[2] for x in formas.get(e["m"], [])], extra, rev)
        if f:
            fglob[e["m"]] = [f, fu]
    json.dump(fglob, open(WEB / "data" / "formas.json", "w", encoding="utf-8"), separators=(",", ":"))
    json.dump(numeros, open(WEB / "data" / "numeros.json", "w", encoding="utf-8"), separators=(",", ":"))
    print(f"{len(fglob)} movimientos con forma global")
    for g, d in grupos.items():
        json.dump({"tonos": tonos, "obras": d}, open(WEB / "data" / "acordes" / f"{g}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"tonos": tonos, "obras": compases}, open(WEB / "data" / "compases.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    for f in (WEB / "data" / "hits").glob("*.json"):
        f.unlink()
    resumen = {}
    for k, (det, desc, tipo) in CONC.items():
        json.dump(hits[k], open(WEB / "data" / "hits" / f"{k}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        resumen[k] = {"desc": desc, "n": len(hits[k]), "obras": len({h[0] for h in hits[k]}), "tipo": tipo,
                      "criterio": (det.__doc__ or desc).strip().split("\n")[0]}
        print(f"{k:32} {len(hits[k]):6}")
    fuentes = {}
    for r in con.execute("SELECT fuente, subcorpus, licencia, MAX(version) v, MAX(referencia) ref, COUNT(*) n FROM analisis GROUP BY 1,2"):
        fuentes.setdefault(r["fuente"], []).append({"sub": r["subcorpus"], "licencia": r["licencia"], "version": (r["v"] or "")[:12], "ref": r["ref"], "n": r["n"]})
    vidas = {r["nombre"]: [r["nacimiento"], r["muerte"]] for r in con.execute("SELECT nombre, nacimiento, muerte FROM compositores")}
    json.dump(vocabulario.exportar(), open(WEB / "data" / "vocab.json", "w", encoding="utf-8"), ensure_ascii=False)
    json.dump({"compositores": vidas, "conceptos": resumen, "sinonimos": sinonimos(), "requiere": vocabulario.REQUIERE,
               "n_obras": len(ids_obra), "n_mov": len(ids_mov), "n_analisis": len(entradas),
               "n_acordes": sum(len(v) for d in grupos.values() for v in d.values()), "fuentes": fuentes},
              open(WEB / "data" / "meta.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("listo")

if __name__ == "__main__":
    main()
