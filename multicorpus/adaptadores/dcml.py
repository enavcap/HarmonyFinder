"""
Adaptador del Distant Listening Corpus (DCML).

Lee de cada subcorpus (clonado y fijado a un commit):
  metadata.tsv                      metadatos de pieza / obra / movimiento / anotadores / ids externos
  harmonies/<pieza>.harmonies.tsv   etiquetas armónicas (una fila por etiqueta)
  measures/<pieza>.measures.tsv     compases (para reconstruir la partitura)
  notes/<pieza>.notes.tsv           notas    (para reconstruir la partitura)

Conserva la etiqueta original (`label`) y todos los campos de la fila en `derivado`/metadatos;
el cifrado normalizado sigue la sintaxis RomanText para que los detectores funcionen igual con
ambos corpus.
"""
import csv, hashlib, json, subprocess, sys
from fractions import Fraction
from functools import lru_cache
from pathlib import Path

LICENCIA_DLC = "CC BY-NC-SA 4.0"
URL_BASE = "https://github.com/DCMLab/{sub}/blob/{commit}/{ruta}"

def leer_tsv(p):
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))

def sha1(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()

def tono_m21(k):
    """'Bb' -> 'B-', 'bb' -> 'b-', 'f#' -> 'f#'."""
    if not k:
        return None
    return k[0] + k[1:].replace("b", "-")

@lru_cache(maxsize=None)
def tono_local(globalkey, localkey):
    """Tonalidad local absoluta (notación music21) a partir de la relativa del DCML."""
    from music21 import key, roman
    g = key.Key(tono_m21(globalkey))
    if not localkey:
        return g.tonicPitchNameWithCase
    partes = localkey.split("/")
    k = g
    for parte in reversed(partes):             # 'V/V' -> primero V de la global, luego V de esa
        M = roman.Minor67Default.CAUTIONARY
        rn = roman.RomanNumeral(parte.replace("b", "-") if parte.startswith("b") else parte, k, sixthMinor=M, seventhMinor=M)
        base = parte.lstrip("b#")
        modo = "major" if base[:1].isupper() else "minor"
        k = key.Key(rn.root().name, modo)
    return k.tonicPitchNameWithCase

LETRAS = "FCGDAEB"
def tpc_de(nombre_m21):
    """fifths desde do: 'C'->0, 'G'->1, 'F'->-1, 'B-'->-2."""
    from music21 import pitch
    p = pitch.Pitch(nombre_m21)
    return LETRAS.index(p.step) - 1 + 7 * int(p.accidental.alter if p.accidental else 0)

def nombre_de_tpc(t):
    i = t + 1
    letra, alt = LETRAS[i % 7], i // 7
    return letra + ("#" * alt if alt > 0 else "-" * (-alt))

ROMANOS = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7}
INV = {"": 0, "5": 0, "6": 1, "64": 2, "7": 0, "65": 1, "43": 2, "2": 3, "42": 3}

def normalizar_fila(r):
    """Campos normalizados de una fila de harmonies.tsv (o None si no es un acorde)."""
    numeral = (r.get("numeral") or "").strip()
    if not numeral or numeral.startswith("@"):
        return None
    form, fig, rel = (r.get("form") or "").strip(), (r.get("figbass") or "").strip(), (r.get("relativeroot") or "").strip()
    cambios = (r.get("changes") or "").strip()
    derivado = ["cifrado", "tono", "grado", "alteracion", "calidad", "inversion", "septima", "pcs", "bajo"]
    tipo = (r.get("chord_type") or "").strip()
    if tipo in ("It", "Ger", "Fr"):
        # El DCML guarda la sexta aumentada desarrollada (Ger6 = viio65(b3)/V); el nombre está en `chord`.
        # Cifrado RomanText equivalente: posición estándar (bajo en b6) Ger65 / Fr43 / It6; otras, su cifra.
        nombre = (r.get("chord") or tipo).split("/")[0].split("(")[0]
        fig_d = nombre[len(tipo):]
        estandar = {"It": "6", "Ger": "65", "Fr": "43"}[tipo]
        fig_rt = estandar if fig_d in ("", "6", estandar) or tipo == "It" else fig_d
        partes = rel.split("/")
        rel_real = "/".join(partes[1:]) if partes and partes[0] == "V" else rel   # quita la V de la expansión
        cif = tipo + fig_rt + ("/" + rel_real if rel_real else "")
        return {"cifrado": cif, "grado": None, "alteracion": 0, "calidad": "other",
                "inversion": 0 if fig_rt == estandar else INV.get(fig_rt, 0), "septima": 0 if tipo == "It" else 1,
                "secundaria": rel_real or None, "cambios": cambios or None, "derivado": ",".join(derivado + ["secundaria"])}
    if form == "%" and not fig:
        fig = "7"                                          # en el DCML «%» ya es semidisminuido con séptima
    if numeral in ("It", "Ger", "Fr"):
        cif = numeral + fig
    elif numeral == "V" and not fig and "64" in cambios.replace(" ", ""):
        cif = "Cad64"                                      # V(64) del DCML = 6/4 cadencial
    else:
        cif = numeral + {"o": "o", "%": "ø", "+": "+", "M": "", "+M": "+"}.get(form, "") + fig
    if rel:
        cif += "/" + rel
    base = numeral.lstrip("b#")
    grado = ROMANOS.get(base.lower())
    alter = numeral.count("#") - numeral.count("b") if numeral not in ("It", "Ger", "Fr") else 0
    if numeral in ("It", "Ger", "Fr"):
        calidad, grado = "other", None
    elif form in ("o", "%"):
        calidad = "diminished"
    elif form.startswith("+"):
        calidad = "augmented"
    else:
        calidad = "major" if base[:1].isupper() else "minor"
    return {"cifrado": cif, "grado": grado, "alteracion": alter, "calidad": calidad,
            "inversion": INV.get(fig, 0), "septima": 1 if fig in ("7", "65", "43", "2", "42") else 0,
            "secundaria": rel or None, "cambios": cambios or None, "derivado": ",".join(derivado)}

def parte_de(mn_onset, timesig):
    num, den = [int(x) for x in timesig.split("/")]
    compuesto = num % 3 == 0 and (num > 3 or den >= 8)
    beat = Fraction(3, den) if compuesto else Fraction(1, den)
    return float(1 + Fraction(mn_onset) / beat)

def _prefijo_comun(cats):
    """«Op. 8, SWV 282» y «Op. 8, SWV 283» -> «Op. 8»; iguales -> el mismo; nada en común -> ''."""
    cats = [c for c in cats if c]
    if not cats:
        return ""
    if len(set(cats)) == 1:
        return cats[0]
    partes = [[p.strip() for p in c.split(",")] for c in cats]
    comun = []
    for trozos in zip(*partes):
        if len(set(trozos)) > 1:
            break
        comun.append(trozos[0])
    return ", ".join(comun)

def agrupar_obras(meta):
    """{pieza: (título de obra, catálogo de obra, catálogo propio de cada pieza?)} según los metadatos.

    - Mismo workTitle con números de movimiento todos distintos -> una obra (ciclo, colección, sonata).
      Su catálogo es lo común a los workNumber (Winterreise «D. 911, Op. 89»; Schütz «Op. 8»).
    - Si el workTitle repite número de movimiento, contiene varias obras: se separan por workNumber
      (Koželuch, «Sonata No. 2 in C Major», Op. 15 y Op. 20).
    - Obras distintas con el mismo título visible llevan su catálogo en el título («Sonata, K.1»).
    No se usa el identificador de archivo (pieza) como catálogo: en un ciclo es el número de canción."""
    import re
    def movs_unicos(ms):
        # números de movimiento distintos; se admiten repeticiones solo entre partes de una misma pieza
        # (SV 97a / SV 97c: secciones del mismo madrigal, ambas «4»)
        tallos = {}
        for m in ms:
            n = m.get("movementNumber")
            if not n:
                return False
            tallos.setdefault(n, set()).add(re.sub(r"[a-z]$", "", (m.get("workNumber") or "").strip()))
        cuenta = {}
        for m in ms:
            cuenta[m.get("movementNumber")] = cuenta.get(m.get("movementNumber"), 0) + 1
        # cada número: una sola pieza, o varias con el mismo catálogo (salvo la letra final) y no vacío
        return all(cuenta[n] == 1 or (len(t) == 1 and next(iter(t))) for n, t in tallos.items())
    por_titulo = {}
    for m in meta:
        por_titulo.setdefault((m.get("workTitle") or m.get("title_text") or m["piece"]).strip(), []).append(m)
    grupos = []                                    # (título, catálogo, [metadatos], cat_por_pieza)
    for tit, ms in por_titulo.items():
        cats = [(m.get("workNumber") or "").strip() for m in ms]
        if len(ms) > 1 and movs_unicos(ms):
            comun = _prefijo_comun(cats)
            grupos.append((tit, comun, ms, len(set(cats)) > 1))
            continue
        por_num = {}
        for m, c in zip(ms, cats):
            por_num.setdefault(c or m["piece"], []).append(m)
        for c, sub in por_num.items():
            grupos.append((tit, c if c != sub[0]["piece"] else "", sub, False))
    # si en el subcorpus el catálogo resulta ser de cada pieza (varios SV en un mismo libro), una pieza
    # suelta con número de movimiento tampoco aporta el catálogo de la obra (libro con un solo madrigal)
    if any(g[3] for g in grupos):
        grupos = [(t, "", ms, True) if len(ms) == 1 and ms[0].get("movementNumber") else (t, c, ms, p)
                  for t, c, ms, p in grupos]
    # títulos repetidos entre obras distintas: se distinguen con el catálogo
    cuenta = {}
    for g in grupos:
        cuenta[g[0]] = cuenta.get(g[0], 0) + 1
    out = {}
    for tit, cat, ms, por_pieza in grupos:
        visible = f"{tit}, {cat}" if cuenta[tit] > 1 and cat and cat not in tit else tit
        for m in ms:
            out[m["piece"]] = (visible, cat, por_pieza)
    return out

class AdaptadorDCML:
    fuente = "dcml"

    def __init__(self, raiz, dir_partituras):
        self.raiz = Path(raiz)
        self.dir_partituras = Path(dir_partituras)

    def subcorpus_disponibles(self):
        return sorted(p.name for p in self.raiz.iterdir() if (p / "metadata.tsv").exists())

    def _commit(self, sub):
        try:
            return subprocess.run(["git", "-C", str(self.raiz / sub), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        except Exception:
            return None

    def _referencia(self, sub):
        cff = self.raiz / sub / "CITATION.cff"
        if not cff.exists():
            return None
        t = cff.read_text(encoding="utf-8")
        import re
        tit = re.search(r"^title:\s*'?(.*?)'?\s*$", t, re.M)
        doi = re.search(r"value:\s*'?(https?://[^'\s]+doi[^'\s]*)'?", t)
        return " · ".join(x for x in [tit and tit.group(1), doi and doi.group(1)] if x)

    def listar(self, sub):
        base = self.raiz / sub
        meta = leer_tsv(base / "metadata.tsv")
        commit = self._commit(sub)
        ref = self._referencia(sub)
        obra_de = agrupar_obras(meta)
        # un id externo compartido por obras con distinto título es de la colección (Fiori musicali), no de la obra
        titulos_por_id = {}
        for m in meta:
            for k in ("wikidata", "musicbrainz"):
                if (m.get(k) or "").startswith("http"):
                    titulos_por_id.setdefault(m[k], set()).add(obra_de[m["piece"]][0])
        de_coleccion = {i for i, ts in titulos_por_id.items() if len(ts) > 1}
        for m in meta:
            pieza = m["piece"]
            harm = base / "harmonies" / f"{pieza}.harmonies.tsv"
            if not harm.exists():
                continue
            obra_tit_g, obra_cat, cat_por_pieza = obra_de[pieza]
            cat = (m.get("workNumber") or "").strip()
            ids = [x for x in (m.get("wikidata"), m.get("musicbrainz")) if x and x.startswith("http") and x not in de_coleccion]
            anio = None
            try:
                anio = int(float(m.get("composed_start") or ""))
            except ValueError:
                pass
            obra_tit = obra_tit_g
            mov_tit = (m.get("movementTitle") or "").strip() or None
            if cat_por_pieza and cat and cat != obra_cat:
                mov_tit = f"{mov_tit} ({cat})" if mov_tit else cat
            yield {
                "analisis_id": f"dcml:{sub}:{pieza}",
                "fuente": "dcml", "subcorpus": sub,
                "archivo": f"{sub}/harmonies/{pieza}.harmonies.tsv",
                "ruta_local": str(harm),
                "url": URL_BASE.format(sub=sub, commit=commit or "main", ruta=f"harmonies/{pieza}.harmonies.tsv"),
                "version": commit, "version_anotacion": m.get("harmony_version") or None,
                "licencia": LICENCIA_DLC, "autores": m.get("annotators") or None,
                "referencia": ref, "origen_declarado": None, "automatico": 0,
                "metadatos_originales": {k: v for k, v in m.items() if v},
                "obra": {
                    "compositor": m.get("composer"), "obra_titulo": obra_tit,
                    "obra_catalogo": obra_cat or None,
                    "pieza": pieza, "fuente_id": "dcml", "obra_fuente": f"{sub}|{obra_tit}|{obra_cat}",
                    "movimiento_numero": m.get("movementNumber") or None, "movimiento_titulo": mov_tit,
                    "ids_externos": ids, "anio": anio,
                    "wikidata": (m.get("wikidata") or None) if m.get("wikidata") not in de_coleccion else None,
                    "musicbrainz": (m.get("musicbrainz") or None) if m.get("musicbrainz") not in de_coleccion else None,
                    "imslp": m.get("imslp") or None,
                    "instrumentacion": ", ".join(sorted({v for k, v in m.items() if k.endswith("_instrument") and v})) or None,
                    "fuente": f"DCML {sub}",
                },
                "anotaciones": lambda harm=harm: self.anotaciones(harm),
                "partitura": lambda sub=sub, pieza=pieza: self.partitura(sub, pieza),
                "partitura_origen": "reconstruida desde las tablas de notas del DCML",
            }

    def anotaciones(self, harm):
        out = []
        for i, r in enumerate(leer_tsv(harm)):
            gk = r.get("globalkey") or ""
            lk = r.get("localkey") or ""
            try:
                tono = tono_local(gk, lk) if gk else None
            except Exception:
                tono = None
            n = normalizar_fila(r)
            try:
                compas = int(float(r.get("mn") or 0))
            except ValueError:
                compas = None
            base = {
                "pos": i, "linea_original": i + 2, "etiqueta_original": r.get("label"),
                "compas": compas, "parte": parte_de(r.get("mn_onset") or "0", r.get("timesig") or "4/4"),
                "onset_q": float(Fraction(r.get("mn_onset") or "0") * 4),
                "duracion_q": float(r["duration_qb"]) if r.get("duration_qb") else None,
                "tono": tono, "modo": None if not tono else ("major" if tono[0].isupper() else "minor"),
                "tono_global": tono_m21(gk), "cadencia": r.get("cadence") or None,
                "fin_frase": r.get("phraseend") or None, "pedal": r.get("pedal") or None,
            }
            if n is None:
                if base["cadencia"] or base["fin_frase"]:
                    out.append({**base, "tipo": "marca", "derivado": "tono"})
                continue
            # alturas del acorde a partir de las quintas relativas a la tónica local (dato del DCML)
            pcs = bajo = None
            if tono:
                t0 = tpc_de(tono[0].upper() + tono[1:])
                try:
                    ct = [int(x) for x in (r.get("chord_tones") or "").replace(" ", "").split(",") if x not in ("",)]
                    at = [int(x) for x in (r.get("added_tones") or "").replace(" ", "").split(",") if x not in ("",)]
                    pcs = ",".join(str(p) for p in sorted({(7 * (t0 + f)) % 12 for f in ct + at}))
                    if r.get("bass_note") not in (None, ""):
                        bajo = nombre_de_tpc(t0 + int(float(r["bass_note"])))
                except ValueError:
                    pass
            # en menor, #vi/#vii son los grados elevados de la escala (igual que vi/vii en RomanText): no son alteraciones
            if n["alteracion"] == 1 and n["cifrado"].startswith("#vi"):
                destino = (n["secundaria"] or "").split("/")[0].lstrip("#b")
                if (destino and destino == destino.lower()) or (not destino and tono and tono[0].islower()):
                    n = {**n, "alteracion": 0}
            out.append({**base, **n, "tipo": "acorde", "pcs": pcs, "bajo": bajo})
        return out

    def partitura(self, sub, pieza):
        """Reconstruye MusicXML desde notes + measures (sin MuseScore). Devuelve la ruta o None."""
        dest = self.dir_partituras / sub / f"{pieza}.mxl"
        if dest.exists():
            return str(dest)
        notes = self.raiz / sub / "notes" / f"{pieza}.notes.tsv"
        measures = self.raiz / sub / "measures" / f"{pieza}.measures.tsv"
        if not notes.exists() or not measures.exists():
            return None
        dest.parent.mkdir(parents=True, exist_ok=True)
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "herramientas"))
        from dcml_a_mxl import convertir
        convertir(str(notes), str(measures), str(dest))
        return str(dest)
