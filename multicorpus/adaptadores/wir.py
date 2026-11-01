"""
Adaptador de When in Rome (Mark Gotham y colaboradores).

Importa cada archivo de análisis humano (analysis.txt, analysis_<autor>.txt, analysis.rntxt) como un
análisis independiente. Los análisis automáticos (analysis_automatic.rntxt) se omiten.

Las anotaciones se obtienen con music21 a partir del RomanText original; si el archivo ya está en el
índice anterior (indice.sqlite) y su huella coincide, se reutilizan esas filas para no repetir el
cálculo.
"""
import hashlib, json, re, sqlite3, subprocess
from pathlib import Path

LICENCIA_WIR = "CC BY-SA 4.0"
URL_BASE = "https://github.com/MarkGotham/When-in-Rome/blob/{commit}/Corpus/{ruta}"

def sha1(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()

def cabecera(path):
    meta = {}
    for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines()[:12]:
        m = re.match(r"(Composer|Title|Analyst|Proofreader|Note|Movement|Piece):\s*(.*)", line)
        if m:
            meta.setdefault(m.group(1), []).append(m.group(2).strip())
    return {k: " | ".join(v) for k, v in meta.items()}

def bonito(t):
    t = t.replace("_", " ").strip()
    t = re.sub(r"\bOp0*(\d+)\s*No0*(\d+)", r"Op. \1 No. \2", t)
    t = re.sub(r"\bOp0*(\d+)", r"Op. \1", t)
    t = re.sub(r"\bK0*(\d+)", r"K. \1", t)
    return t

COLECCION_GENERO = {
    "OpenScore-LiederCorpus": ("Lied", "voz y piano"), "Piano_Sonatas": ("Sonata", "piano"),
    "Quartets": ("Cuarteto de cuerda", "cuarteto de cuerda"), "Early_Choral": (None, "coro"),
    "Keyboard_Other": (None, "teclado"), "Chamber_Other": ("Sonata en trío", "conjunto de cámara"),
    "Orchestral": (None, "orquesta"), "Variations_and_Grounds": ("Variaciones", None),
    "Textbooks": ("Ejemplo de tratado", None),
}

from functools import lru_cache

@lru_cache(maxsize=1)
def _TITULOS_CHOPIN():
    """{carpeta BI: {titulo, catalogo, bi}} (multicorpus/titulos_chopin.json)."""
    f = Path(__file__).resolve().parents[1] / "titulos_chopin.json"
    return json.loads(f.read_text(encoding="utf-8"))["mazurcas"] if f.exists() else {}

def obra_y_movimiento(rel, meta, remote):
    """Deduce obra y movimiento de la ruta y los metadatos de WiR. rel = ruta de la carpeta."""
    p = Path(rel).parts
    col, comp, resto = p[0], p[1] if len(p) > 1 else "", list(p[2:])
    genero, inst = COLECCION_GENERO.get(col, (None, None))
    titulo_meta = meta.get("Title", "")
    cat = None
    # corales de Bach: BWV desde la referencia a la partitura de music21
    if col == "Early_Choral" and remote.get("remote_score_music21", "").startswith("bach/"):
        m = re.search(r"bwv(\d+)(?:\.(\d+))?", remote["remote_score_music21"])
        if m:
            cat = f"BWV {m.group(1)}" + (f"/{m.group(2)}" if m.group(2) else "")
        nombre = re.sub(r"\s*-\s*None.*$", "", titulo_meta).strip() or f"Coral {resto[-1]}"
        return dict(obra_titulo=f"{nombre}", obra_catalogo=cat, movimiento_numero=None, movimiento_titulo=None,
                    genero="Coral", instrumentacion="coro a cuatro voces")
    if col == "Early_Choral" and "Monteverdi" in comp and len(resto) >= 2:
        libro = re.sub(r"\D", "", resto[-2]) or resto[-2]
        return dict(obra_titulo=f"Madrigali, libro {libro}", obra_catalogo=None, movimiento_numero=resto[-1],
                    movimiento_titulo=titulo_meta or None, genero="Madrigal", instrumentacion="voces")
    if col == "Early_Choral" and "Goudimel" in comp:
        return dict(obra_titulo=f"Psaume {resto[-1].lstrip('0')}", obra_catalogo=None, movimiento_numero=None,
                    movimiento_titulo=None, genero="Salmo", instrumentacion="coro")
    # mazurcas de Chopin: las carpetas solo dan el número del catálogo Brown (BI); opus y tonalidad desde la tabla
    if "Chopin" in comp and resto[:1] == ["Mazurkas"] and len(resto) >= 2:
        t = _TITULOS_CHOPIN().get(resto[1])
        if t:
            return dict(obra_titulo=t["titulo"], obra_catalogo=t["catalogo"], movimiento_numero=None,
                        movimiento_titulo=None, genero=genero, instrumentacion=inst)
    if col == "OpenScore-LiederCorpus":
        coleccion, cancion = (resto + ["", ""])[:2]
        m = re.match(r"0*(\d+)[_ ](.*)", cancion)
        if coleccion in ("_", "") or not m:
            return dict(obra_titulo=bonito(cancion or coleccion), obra_catalogo=None, movimiento_numero=None,
                        movimiento_titulo=None, genero=genero, instrumentacion=inst)
        return dict(obra_titulo=bonito(coleccion), obra_catalogo=None, movimiento_numero=m.group(1),
                    movimiento_titulo=m.group(2).replace("_", " "), genero=genero, instrumentacion=inst)
    if col in ("Piano_Sonatas", "Quartets") and len(resto) >= 2:
        obra = bonito(resto[0])
        pref = "Sonata para piano" if col == "Piano_Sonatas" else "Cuarteto de cuerda"
        return dict(obra_titulo=f"{pref}, {obra}", obra_catalogo=obra, movimiento_numero=resto[-1],
                    movimiento_titulo=None, genero=genero, instrumentacion=inst)
    # genérico: «05_Chaconne» -> movimiento 5 «Chaconne»
    if len(resto) >= 2:
        m = re.match(r"0*(\d+)[_ ](.+)", resto[-1])
        if m:
            obra = " · ".join(bonito(x) for x in resto[:-1] if x != "_")
            return dict(obra_titulo=obra, obra_catalogo=obra, movimiento_numero=m.group(1),
                        movimiento_titulo=m.group(2).replace("_", " "), genero=genero, instrumentacion=inst)
    # genérico: la última carpeta corta es el movimiento
    if len(resto) >= 2 and re.fullmatch(r"[0-9]{1,3}[a-z]?", resto[-1]):
        obra = " · ".join(bonito(x) for x in resto[:-1])
        return dict(obra_titulo=obra, obra_catalogo=obra, movimiento_numero=resto[-1].lstrip("0") or "0",
                    movimiento_titulo=None, genero=genero, instrumentacion=inst)
    obra = " · ".join(bonito(x) for x in resto if x != "_").strip(" ·")
    if not re.search(r"[A-Za-zÀ-ÿ]{3,}", re.sub(r"\b(Op|WoO|BWV|K)\b", "", obra)):
        tm = re.sub(r"\s*-\s*None.*$", "", titulo_meta).strip()
        obra = f"{tm} ({obra})" if tm and obra else (tm or obra or rel)
    return dict(obra_titulo=obra, obra_catalogo=obra, movimiento_numero=None, movimiento_titulo=None,
                genero=genero, instrumentacion=inst)

class AdaptadorWiR:
    fuente = "wir"

    def __init__(self, corpus, indice_previo=None, origen_partituras=None):
        self.corpus = Path(corpus)
        self.indice_previo = indice_previo
        self.origen_partituras = origen_partituras or {}     # ruta carpeta -> descripción
        try:
            self.commit = subprocess.run(["git", "-C", str(self.corpus.parent), "rev-parse", "HEAD"],
                                         capture_output=True, text=True).stdout.strip() or None
        except Exception:
            self.commit = None

    def subcorpus_disponibles(self):
        return sorted(p.name for p in self.corpus.iterdir() if p.is_dir())

    def archivos(self, sub):
        for f in sorted((self.corpus / sub).rglob("analysis*")):
            if f.suffix not in (".txt", ".rntxt") or "automatic" in f.name:
                continue
            yield f

    def listar(self, sub):
        for f in self.archivos(sub):
            rel = f.relative_to(self.corpus)
            carpeta = f.parent
            meta = cabecera(f)
            remote = {}
            if (carpeta / "remote.json").exists():
                try:
                    remote = json.loads((carpeta / "remote.json").read_text())
                except Exception:
                    pass
            om = obra_y_movimiento(str(carpeta.relative_to(self.corpus)), meta, remote)
            analista = meta.get("Analyst")
            if f.stem != "analysis":
                analista = (analista + " · " if analista else "") + f"versión «{f.stem.replace('analysis_', '')}»"
            origen = remote.get("analysis_source")
            score = carpeta / "score.mxl"
            yield {
                "analisis_id": f"wir:{rel}",
                "fuente": "wir", "subcorpus": sub,
                "archivo": str(rel), "ruta_local": str(f),
                "url": URL_BASE.format(commit=self.commit or "main", ruta=str(rel)),
                "version": self.commit, "version_anotacion": None,
                "licencia": LICENCIA_WIR, "autores": analista,
                "referencia": "Gotham, M. et al. When in Rome: a meta-corpus of functional harmony. TISMIR (2023)",
                "origen_declarado": origen, "automatico": 0,
                "metadatos_originales": {**meta, **{k: v for k, v in remote.items() if isinstance(v, (str, int, float))}},
                "obra": {"compositor": Path(rel).parts[1],
                         **om, "fuente": "When in Rome", "ids_externos": [],
                         "pieza": str(carpeta.relative_to(self.corpus)), "fuente_id": "wir",
                         "obra_fuente": str(carpeta.relative_to(self.corpus).parent)},
                "anotaciones": lambda f=f, rel=rel: self.anotaciones(f, rel),
                "partitura": (lambda s=score: str(s)) if score.exists() else (lambda: None),
                "partitura_origen": self.origen_partituras.get(str(carpeta.relative_to(self.corpus)), "original (When in Rome)"),
            }

    def anotaciones(self, f, rel):
        from .. import correcciones
        sufijo = correcciones.huella(Path(rel).as_posix())     # las correcciones de la fuente invalidan la caché
        cache = Path(__file__).resolve().parents[2] / "datos" / "cache" / "anotaciones" / f"{sha1(f)}{sufijo}.json"
        if cache.exists():
            return json.loads(cache.read_text())
        filas = None
        if self.indice_previo and Path(self.indice_previo).exists() and f.name in ("analysis.txt", "analysis.rntxt") \
           and not sufijo:
            con = sqlite3.connect(self.indice_previo); con.row_factory = sqlite3.Row
            o = con.execute("SELECT id FROM obras WHERE analisis=?", (str(rel),)).fetchone()
            if o:
                filas = [dict(r) for r in con.execute("SELECT * FROM acordes WHERE obra=? ORDER BY pos", (o["id"],))]
            con.close()
        if filas is None:
            import sys
            sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
            from indexar import procesar
            res, err = procesar((str(f), str(self.corpus)))
            if err:
                raise RuntimeError(err)
            cols = ["pos", "compas", "parte", "offset", "tono", "modo", "cifrado", "grado", "alteracion", "calidad",
                    "inversion", "secundaria", "septima", "pcs", "bajo", "cambio_tono"]
            filas = [dict(zip(cols, x)) for x in res[1]]
        out = []
        for r in filas:
            out.append({
                "pos": r["pos"], "tipo": "acorde", "linea_original": None, "etiqueta_original": r["cifrado"],
                "compas": r["compas"], "parte": r["parte"], "onset_q": None, "duracion_q": None,
                "tono": r["tono"], "modo": r["modo"], "tono_global": None, "cifrado": r["cifrado"],
                "grado": r["grado"], "alteracion": r["alteracion"], "calidad": r["calidad"],
                "inversion": r["inversion"], "secundaria": r["secundaria"], "septima": r["septima"],
                "pcs": r["pcs"], "bajo": r["bajo"], "cadencia": None, "fin_frase": None, "pedal": None,
                "cambios": None, "derivado": "grado,alteracion,calidad,inversion,septima,pcs,bajo",
            })
        return out
