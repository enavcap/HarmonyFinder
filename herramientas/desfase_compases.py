#!/usr/bin/env python3
"""
Detecta análisis cuya numeración de compases va desplazada respecto a la partitura publicada (p. ej. una
anacrusa que el análisis cuenta como c. 1 y la partitura como c. 0).

    python herramientas/desfase_compases.py [margen]      # margen de mejora para avisar (0.05 por defecto)

Compara, compás a compás, las clases de altura de cada acorde del análisis con las notas de ese compás en la
partitura, suponiendo desfase 0 y desfase +1 (compás c del análisis = compás c-1 de la partitura), sobre los
datos ya exportados de la web (web/data/acordes, web/scores). Lista los análisis que encajan claramente mejor
con el desfase; los confirmados se anotan en multicorpus/desfases_compases.json. Las mejoras pequeñas o con
pocos acordes no bastan: hay que mirar la partitura antes de anotar un desfase.
"""
import base64, io, json, re, sys, zipfile
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
import xml.etree.ElementTree as ET

RAIZ = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(RAIZ))
import buscar
DATA = RAIZ / 'web' / 'data'
PASO = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

@lru_cache(maxsize=2)
def paquete(pq):
    return json.load(open(RAIZ / 'web' / 'scores' / f'{pq}.json'))

def xml_de(b):
    if b[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(b))
        n = [x for x in z.namelist() if x.endswith(('.xml', '.musicxml')) and not x.startswith('META')][0]
        return z.read(n)
    return b

def compases(xml):
    """[(number, set de pcs, primer compás incompleto?)] de la primera parte (todas las partes unidas por posición)."""
    r = ET.fromstring(xml)
    for e in r.iter():
        if '}' in e.tag: e.tag = e.tag.split('}', 1)[1]
    partes = r.findall('part')
    orden, pcs = [], defaultdict(set)
    for pi, p in enumerate(partes):
        for i, m in enumerate(p.findall('measure')):
            if pi == 0: orden.append(m.get('number'))
            for n in m.iter('note'):
                pt = n.find('pitch')
                if pt is None: continue
                a = pt.find('alter')
                pcs[i].add((PASO[pt.find('step').text] + int(float(a.text) if a is not None else 0)) % 12)
    return orden, pcs

@lru_cache(maxsize=None)
def pcs_cif(cif, tono):
    try: return frozenset(p.pitchClass for p in buscar._rn(cif, tono).pitches)
    except Exception: return None

def puntuar(ac, idx_de_num, pcs, d):
    ok = tot = 0
    for c, cif, tono in ac:
        i = idx_de_num.get(str(c - d))
        q = pcs_cif(cif, tono)
        if i is None or not q: continue
        tot += 1; ok += len(q & pcs[i]) / len(q)
    return ok / tot if tot else 0, tot

obras = json.load(open(DATA / 'obras.json'))
porid = {o['id']: o for o in obras}
res = []
vistos = set()
for f in sorted((DATA / 'acordes').glob('*.json'), key=lambda p: int(p.stem)):
    d = json.load(open(f)); tonos = d['tonos']
    for aid, filas in d['obras'].items():
        o = porid[int(aid)]
        if not o.get('pq'): continue
        ac = [(x[0], x[3], tonos[x[2]]) for x in filas if isinstance(x[0], int)]
        if not ac: continue
        try:
            orden, pcs = compases(xml_de(base64.b64decode(paquete(o['pq'])[str(o['m'])])))
        except Exception as e:
            continue
        idx = {}
        for i, n in enumerate(orden):
            idx.setdefault(n, i)
        mins = min(c for c, _, _ in ac)
        p0, n0 = puntuar(ac, idx, pcs, 0); p1, n1 = puntuar(ac, idx, pcs, 1)
        res.append((int(aid), o['c'], o['t'], o['f'], orden[0] if orden else None, mins, round(p0, 3), round(p1, 3), n0, n1))
MARGEN = float(sys.argv[1]) if len(sys.argv) > 1 else 0.05
malos = [r for r in res if r[7] > r[6] + MARGEN]
print(f'{len(res)} análisis; {len(malos)} encajan mejor con desfase +1 (análisis · compositor · título · fuente · '
      f'primer compás de la partitura · primer compás del análisis · coincidencia sin y con desfase · acordes comparados)')
for r in malos:
    print(r)
