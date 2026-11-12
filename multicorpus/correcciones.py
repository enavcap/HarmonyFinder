"""
Correcciones de erratas en las fuentes (correcciones_fuentes.json).

Algunos análisis tienen errores de formato que hacen que se lean mal (una línea sin la «m» del número de compás,
por ejemplo, se descarta entera). Las correcciones se aplican al texto antes de interpretarlo y quedan
documentadas junto al motivo; el archivo original del corpus no se toca.
"""
import json
from pathlib import Path

ARCHIVO = Path(__file__).resolve().parent / "correcciones_fuentes.json"
DESFASES = Path(__file__).resolve().parent / "desfases_compases.json"


def _tabla():
    return {k: v for k, v in json.loads(ARCHIVO.read_text(encoding="utf-8")).items() if not k.startswith("_")}


def correcciones(rel):
    """Lista de [original, corregido, motivo] para un análisis (ruta relativa al corpus, con «/»)."""
    return _tabla().get(str(rel).replace("\\", "/"), [])


def aplicar(texto, rel):
    """Texto del análisis con sus correcciones aplicadas. Falla si una corrección no encaja exactamente una vez
    (la fuente habrá cambiado y hay que revisarla)."""
    for orig, nuevo, _motivo in correcciones(rel):
        n = texto.count(orig)
        if n != 1:
            raise ValueError(f"{rel}: la corrección {orig.strip()!r} aparece {n} veces (se esperaba 1)")
        texto = texto.replace(orig, nuevo)
    return texto


def huella(rel):
    """Sufijo para las cachés: cambia si cambian las correcciones de ese análisis."""
    c = correcciones(rel)
    if not c:
        return ""
    import hashlib
    return "-c" + hashlib.sha1(json.dumps(c, ensure_ascii=False).encode()).hexdigest()[:8]


def desfase(rel):
    """Número que se suma a los compases de un análisis cuya numeración va desplazada respecto a la partitura
    (desfases_compases.json); 0 si no hay desfase."""
    t = json.loads(DESFASES.read_text(encoding="utf-8"))
    return t.get(str(rel).replace("\\", "/"), [0])[0]
