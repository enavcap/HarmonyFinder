"""Convierte las mazurcas descargadas (Humdrum) a score.mxl en sus carpetas del corpus."""
import json, hashlib, os, sys, warnings
warnings.filterwarnings("ignore")
from music21 import converter
dl = sys.argv[1]; corpus = sys.argv[2]
ok = 0
for d, u in json.load(open(os.path.join(dl, "lista.json"))):
    f = os.path.join(dl, hashlib.md5(d.encode()).hexdigest() + ".krn")
    if not os.path.exists(f):
        continue
    try:
        s = converter.parse(f, format="humdrum")
        s.write("mxl", fp=os.path.join(corpus, d, "score.mxl")); ok += 1
    except Exception as e:
        print("fallo", d, str(e)[:80])
print("convertidas", ok)
