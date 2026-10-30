"""
Importación idempotente de corpus al catálogo multicorpus.

    python -m multicorpus.importar wir  [--sub Piano_Sonatas,Quartets]
    python -m multicorpus.importar dcml [--sub bach_solo,scarlatti_sonatas]
    python -m multicorpus.importar listar dcml
    python -m multicorpus.importar duplicados                 # candidatos pendientes
    python -m multicorpus.importar confirmar <id> | descartar <id>

Idempotencia: cada análisis tiene un id estable (fuente + ruta) y una huella SHA-1 del archivo
original. Si el id y la huella ya existen, el registro se omite. Si el id existe con otra huella
(la fuente cambió), se importa como versión nueva (id@huella) sin tocar la anterior.
"""
import argparse, datetime, json, shutil, sys, traceback
from pathlib import Path

from .modelo import conectar
from .identificacion import registrar_movimiento, preparar, confirmar, descartar

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
DB = RAIZ / "datos" / "catalogo.sqlite"
DIR_PART = RAIZ / "datos" / "partituras"

COLUMNAS_ANOT = ["pos", "tipo", "linea_original", "etiqueta_original", "compas", "parte", "onset_q", "duracion_q",
                 "tono", "modo", "tono_global", "cifrado", "grado", "alteracion", "calidad", "inversion", "secundaria",
                 "septima", "pcs", "bajo", "cadencia", "fin_frase", "pedal", "cambios", "derivado"]

def adaptador(nombre):
    if nombre == "wir":
        from .adaptadores.wir import AdaptadorWiR
        origen = {}
        for f, txt in ((Path("/tmp/dcml/lista.json"), "reconstruida desde las tablas de notas del DCML"),
                       (Path("/tmp/descargas_krn/lista.json"), "convertida desde Humdrum (Craig Sapp)")):
            if f.exists():
                for x in json.load(open(f)):
                    origen[x["dir"] if isinstance(x, dict) else x[0]] = txt
        corpus = Path("/tmp/wir/Corpus")
        for d in corpus.glob("Early_Choral/*/*/*"):
            rj = d / "remote.json"
            if rj.exists() and "remote_score_music21" in rj.read_text():
                origen.setdefault(str(d.relative_to(corpus)), "corpus de music21")
        return AdaptadorWiR(corpus, RAIZ / "indice.sqlite", origen)
    if nombre == "dcml":
        from .adaptadores.dcml import AdaptadorDCML
        return AdaptadorDCML(RAIZ / "datos" / "fuentes" / "dcml", DIR_PART / "dcml")
    raise SystemExit(f"fuente desconocida: {nombre}")

def importar(con, fuente, subcorpus, log=print):
    ad = adaptador(fuente)
    preparar(con)
    subs = subcorpus or ad.subcorpus_disponibles()
    informes = []
    for sub in subs:
        inf = {"fuente": fuente, "subcorpus": sub, "obras_nuevas": 0, "obras_existentes": 0, "analisis_nuevos": 0,
               "candidatos": [], "omitidos": 0, "errores": [], "versiones_nuevas": 0}
        cur = con.execute("INSERT INTO importaciones (fuente, subcorpus, fecha) VALUES (?,?,?)",
                          (fuente, sub, datetime.datetime.now().isoformat(timespec="seconds")))
        imp_id = cur.lastrowid
        obras_vistas = {}
        for reg in ad.listar(sub):
            try:
                from .adaptadores.dcml import sha1
                huella = sha1(reg["ruta_local"])
                aid = reg["analisis_id"]
                prev = con.execute("SELECT huella FROM analisis WHERE id=? OR id LIKE ?", (aid, aid + "@%")).fetchall()
                if any(p[0] == huella for p in prev):
                    inf["omitidos"] += 1
                    continue
                if prev:
                    aid = f"{aid}@{huella[:8]}"; inf["versiones_nuevas"] += 1
                obra_id, mov_id, estado, cands = registrar_movimiento(con, reg["obra"], imp_id)
                if obra_id not in obras_vistas:
                    obras_vistas[obra_id] = estado
                    if estado == "existente": inf["obras_existentes"] += 1
                    else: inf["obras_nuevas"] += 1
                    if estado == "pendiente":
                        inf["candidatos"] += [{"obra": obra_id, "candidata": c[0], "puntuacion": c[1], "motivo": c[2]} for c in cands]
                anots = reg["anotaciones"]()
                con.execute("""INSERT INTO analisis (id, movimiento_id, fuente, subcorpus, archivo, url, version, version_anotacion,
                               licencia, autores, referencia, origen_declarado, automatico, huella, metadatos_originales, importacion_id, pieza, obra_fuente)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (aid, mov_id, reg["fuente"], reg["subcorpus"], reg["archivo"], reg["url"], reg["version"],
                             reg["version_anotacion"], reg["licencia"], reg["autores"], reg["referencia"],
                             reg["origen_declarado"], reg["automatico"], huella,
                             json.dumps(reg["metadatos_originales"], ensure_ascii=False), imp_id, reg["obra"].get("pieza"),
                             reg["obra"].get("obra_fuente")))
                con.executemany(f"INSERT INTO anotaciones (analisis_id, {', '.join(COLUMNAS_ANOT)}) VALUES (?{', ?' * len(COLUMNAS_ANOT)})",
                                [(aid, *[a.get(c) for c in COLUMNAS_ANOT]) for a in anots])
                inf["analisis_nuevos"] += 1
                # partitura del movimiento (la primera disponible; no se sustituye una existente)
                tiene = con.execute("SELECT partitura FROM movimientos WHERE id=?", (mov_id,)).fetchone()[0]
                if not tiene:
                    try:
                        ruta = reg["partitura"]()
                    except Exception as e:
                        ruta = None
                        inf["errores"].append({"registro": aid, "error": f"partitura: {type(e).__name__}: {e}"[:200]})
                    if ruta:
                        dest = DIR_PART / reg["fuente"] / (Path(reg["archivo"]).parent if reg["fuente"] == "wir" else Path(sub)) / Path(ruta).name
                        if reg["fuente"] == "wir":
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            if not dest.exists():
                                shutil.copy(ruta, dest)
                            ruta = str(dest)
                        con.execute("UPDATE movimientos SET partitura=?, partitura_origen=? WHERE id=?",
                                    (str(Path(ruta).relative_to(RAIZ / "datos")), reg["partitura_origen"], mov_id))
                con.commit()
            except Exception as e:
                con.rollback()
                inf["errores"].append({"registro": reg.get("analisis_id"), "error": f"{type(e).__name__}: {e}"[:300]})
        con.execute("""UPDATE importaciones SET version=?, obras_nuevas=?, obras_existentes=?, analisis_nuevos=?, candidatos=?,
                       omitidos=?, errores=?, detalle=? WHERE id=?""",
                    (getattr(ad, "commit", None), inf["obras_nuevas"], inf["obras_existentes"], inf["analisis_nuevos"],
                     len(inf["candidatos"]), inf["omitidos"], len(inf["errores"]), json.dumps(inf, ensure_ascii=False), imp_id))
        con.commit()
        log(f"{fuente}/{sub}: obras nuevas {inf['obras_nuevas']} · existentes identificadas {inf['obras_existentes']} · "
            f"análisis nuevos {inf['analisis_nuevos']} · posibles duplicados {len(inf['candidatos'])} · "
            f"omitidos (ya importados) {inf['omitidos']} · errores {len(inf['errores'])}")
        informes.append(inf)
    return informes

def renormalizar(con, fuente, log=print):
    """Vuelve a derivar las anotaciones de una fuente desde sus archivos originales (p. ej. tras corregir
    el normalizador). No toca obras, movimientos, análisis ni procedencia; si el archivo original ya no
    coincide con la huella registrada, ese análisis se deja como está y se informa."""
    ad = adaptador(fuente)
    hechos = distintos = 0
    for sub in ad.subcorpus_disponibles():
        for reg in ad.listar(sub):
            from .adaptadores.dcml import sha1
            fila = con.execute("SELECT id, huella FROM analisis WHERE id=?", (reg["analisis_id"],)).fetchone()
            if not fila:
                continue
            if fila["huella"] != sha1(reg["ruta_local"]):
                distintos += 1; continue
            anots = reg["anotaciones"]()
            con.execute("DELETE FROM anotaciones WHERE analisis_id=?", (fila["id"],))
            con.executemany(f"INSERT INTO anotaciones (analisis_id, {', '.join(COLUMNAS_ANOT)}) VALUES (?{', ?' * len(COLUMNAS_ANOT)})",
                            [(fila["id"], *[a.get(c) for c in COLUMNAS_ANOT]) for a in anots])
            hechos += 1
        con.commit()
    log(f"{fuente}: anotaciones regeneradas en {hechos} análisis · {distintos} con el archivo original cambiado (sin tocar; reimportar)")
    return hechos

def main(argv=None):
    ap = argparse.ArgumentParser(prog="importar")
    ap.add_argument("accion")
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--sub", help="subcorpus separados por comas")
    ap.add_argument("--db", default=str(DB))
    a = ap.parse_args(argv)
    con = conectar(a.db); preparar(con)
    if a.accion in ("wir", "dcml"):
        importar(con, a.accion, a.sub.split(",") if a.sub else None)
    elif a.accion == "listar":
        print("\n".join(adaptador(a.arg).subcorpus_disponibles()))
    elif a.accion == "renormalizar":
        renormalizar(con, a.arg)
    elif a.accion == "revisar":
        from .identificacion import revisar
        print(f"candidatos nuevos: {revisar(con)}")
    elif a.accion == "duplicados":
        for r in con.execute("""SELECT c.id, c.puntuacion, c.motivo, o1.titulo t1, o2.titulo t2 FROM candidatos_duplicado c
                                JOIN obras o1 ON o1.id=c.obra_id JOIN obras o2 ON o2.id=c.obra_candidata WHERE c.estado='pendiente'"""):
            print(f"[{r['id']}] {r['puntuacion']:.2f}  «{r['t1']}»  ↔  «{r['t2']}»")
    elif a.accion == "confirmar":
        print("fusionado" if confirmar(con, int(a.arg)) else "nada que hacer"); con.commit()
    elif a.accion == "descartar":
        print("descartado" if descartar(con, int(a.arg)) else "nada que hacer"); con.commit()
    else:
        raise SystemExit("acción desconocida")

if __name__ == "__main__":
    main()
