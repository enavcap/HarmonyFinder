"""
Auditoría de posibles duplicados en el catálogo (no modifica nada).

    python -m multicorpus.auditar

1. Obras distintas que comparten una clave de catálogo específica (BWV 1001, K. 279, Op. 2 n.º 1…).
   Un opus sin número interno no cuenta: puede ser un conjunto de obras.
2. Obras del mismo compositor con el mismo título normalizado.
3. Movimientos de una misma obra con el mismo número y análisis de la misma fuente.
Imprime cada caso con su motivo; la decisión se toma con `importar confirmar|descartar` o corrigiendo datos.
"""
import sqlite3
from collections import defaultdict
from .importar import DB
from .identificacion import compatibles, numeros


def auditar(con):
    con.row_factory = sqlite3.Row
    casos = []
    tit = {r["id"]: r for r in con.execute("SELECT id, compositor_id, titulo, titulo_norm FROM obras")}
    resueltos = {(r[0], r[1]) for r in con.execute(
        "SELECT obra_id, obra_candidata FROM candidatos_duplicado WHERE estado='descartado'")}
    resueltos |= {(b, a) for a, b in resueltos}
    # 1. clave de catálogo compartida
    por_clave = defaultdict(set)
    for r in con.execute("SELECT c.obra_id, c.clave, o.compositor_id FROM catalogos c JOIN obras o ON o.id=c.obra_id"):
        if r["clave"].startswith("op:") and r["clave"].count(":") == 1:
            continue
        por_clave[(r["compositor_id"], r["clave"])].add(r["obra_id"])
    for (comp, clave), obras in sorted(por_clave.items()):
        obras = sorted(obras)
        for i in range(len(obras)):
            for j in range(i + 1, len(obras)):
                if (obras[i], obras[j]) not in resueltos:
                    casos.append(("catálogo compartido " + clave, tit[obras[i]]["titulo"], tit[obras[j]]["titulo"]))
    # 2. mismo título normalizado
    por_tit = defaultdict(list)
    for o in tit.values():
        por_tit[(o["compositor_id"], o["titulo_norm"])].append(o["id"])
    claves = defaultdict(list)
    for r in con.execute("SELECT obra_id, clave FROM catalogos"):
        claves[r["obra_id"]].append(r["clave"])
    for (comp, tn), obras in sorted(por_tit.items()):
        for i in range(len(obras)):
            for j in range(i + 1, len(obras)):
                a, b = obras[i], obras[j]
                # números distintos en el título original (n.º 1 / n.º 2) o catálogos incompatibles: obras distintas
                if numeros(tit[a]["titulo"]) != numeros(tit[b]["titulo"]) or not compatibles(claves[a], claves[b]):
                    continue
                if (a, b) not in resueltos:
                    casos.append((f"mismo título, catálogos compatibles ({comp})", tit[a]["titulo"], tit[b]["titulo"]))
    # 3. movimientos repetidos
    for r in con.execute("""SELECT o.titulo, m.numero, a.fuente, COUNT(DISTINCT m.id) n FROM movimientos m
                            JOIN obras o ON o.id=m.obra_id JOIN analisis a ON a.movimiento_id=m.id
                            WHERE m.numero IS NOT NULL GROUP BY o.id, m.numero, a.fuente HAVING n > 1"""):
        casos.append((f"movimiento {r['numero']} repetido ({r['fuente']})", r["titulo"], f"{r['n']} movimientos"))
    return casos


if __name__ == "__main__":
    con = sqlite3.connect(DB)
    casos = auditar(con)
    for motivo, a, b in casos:
        print(f"{motivo:45} | {a} | {b}")
    print(f"{len(casos)} casos")
