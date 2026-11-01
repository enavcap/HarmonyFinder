#!/usr/bin/env python3
"""Sincroniza la versión de la web con el archivo VERSION de la raíz.

VERSION es la única fuente de referencia (Semantic Versioning 2.0.0). Este script
genera web/version.js, que la web carga para mostrar la versión en el pie de página;
así el número no se escribe a mano en ningún componente.

  uso: herramientas/sincronizar_version.py              # regenera web/version.js
       herramientas/sincronizar_version.py --comprobar  # falla si web/version.js no coincide con VERSION
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
VERSION = RAIZ / "VERSION"
SALIDA = RAIZ / "web" / "version.js"
# SemVer 2.0.0: MAJOR.MINOR.PATCH con prerelease y build opcionales
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
    r"(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
)


def leer_version() -> str:
    v = VERSION.read_text(encoding="utf-8").strip()
    if not SEMVER.match(v):
        sys.exit(f"VERSION contiene «{v}», que no es una versión SemVer válida (MAJOR.MINOR.PATCH)")
    return v


def contenido(v: str) -> str:
    return (
        "// Generado por herramientas/sincronizar_version.py a partir de VERSION. No editar a mano.\n"
        f"window.HF_VERSION='{v}';\n"
    )


def main() -> None:
    v = leer_version()
    esperado = contenido(v)
    if "--comprobar" in sys.argv[1:]:
        actual = SALIDA.read_text(encoding="utf-8") if SALIDA.exists() else ""
        if actual != esperado:
            sys.exit(f"web/version.js no coincide con VERSION ({v}); ejecuta herramientas/sincronizar_version.py")
        print(f"web/version.js sincronizado con VERSION ({v})")
        return
    SALIDA.write_text(esperado, encoding="utf-8")
    print(f"web/version.js → {v}")


if __name__ == "__main__":
    main()
