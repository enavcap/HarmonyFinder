# Harmony Finder — instrucciones para Claude Code

Buscador de procedimientos armónicos en el repertorio. Web estática en `web/` (publicada en GitHub Pages desde la rama `gh-pages` con `herramientas/publicar_pages.sh`); datos generados por los scripts Python de la raíz y de `multicorpus/`; tests en `multicorpus/tests/` y `herramientas/prueba_*`.

## Versionado (Semantic Versioning 2.0.0)

- `VERSION` (raíz) es la **única fuente** del número de versión. Formato `MAJOR.MINOR.PATCH`.
  - MAJOR: cambios que rompen la compatibilidad o modifican sustancialmente el funcionamiento.
  - MINOR: nuevas funcionalidades.
  - PATCH: correcciones de errores, pequeños ajustes y mejoras menores.
  - Fase experimental: versiones `0.x.y`. La primera estable será `1.0.0`.
- `CHANGELOG.md` sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/): una sección por versión con fecha y categorías `Added`, `Changed`, `Fixed`, `Removed`, `Security`. Los cambios en curso van en `[Unreleased]`.
- La web muestra la versión en el pie (`<span id="version">` en `web/index.html`), leída de `web/version.js`, que **se genera** con `herramientas/sincronizar_version.py`. Nunca escribas el número a mano en la web ni en otros componentes.

## Flujo de trabajo

Al empezar a trabajar en el repositorio:
1. Lee `VERSION` para conocer la versión vigente.
2. Lee la cabecera de `CHANGELOG.md` (`[Unreleased]` y la última versión) para conocer las últimas modificaciones.

Al terminar una actualización:
1. Analiza los cambios realizados y determina si corresponden a MAJOR, MINOR o PATCH.
2. **Propón** el incremento al usuario; si no está claro qué tipo corresponde, explica la propuesta antes de aplicarla.
3. Agrupa en una sola versión los cambios que formen parte de la misma actualización. **No** incrementes la versión en cada commit.
4. **No** incrementes la versión por cambios internos irrelevantes, documentación menor o modificaciones que no afecten al producto (esos cambios pueden anotarse en `[Unreleased]` si son relevantes para el usuario, o no anotarse).
5. Al incrementar: actualiza `VERSION`, ejecuta `herramientas/sincronizar_version.py` (regenera `web/version.js`) y mueve el contenido de `[Unreleased]` a una sección nueva `## [x.y.z] - AAAA-MM-DD` con los cambios concretos. Añade el enlace de comparación al pie del CHANGELOG.
6. Mantén sincronizados `VERSION`, `CHANGELOG.md` y `web/version.js` en el mismo commit. `herramientas/sincronizar_version.py --comprobar` falla si no lo están (el script de publicación lo ejecuta).
7. **Nunca** sobrescribas ni elimines entradas anteriores del CHANGELOG.

## Publicación y etiquetas Git

- Las versiones publicadas se identifican con etiquetas `vMAJOR.MINOR.PATCH` (`v0.3.0`, `v1.0.0`…) sobre el commit que actualiza `VERSION`.
- **No** crees etiquetas ni publiques en `gh-pages` sin autorización explícita del usuario en la conversación. Una etiqueta se crea solo cuando el usuario confirma la publicación de esa versión.
- No modifiques ni muevas etiquetas de versiones anteriores.
- Comandos de referencia (solo con autorización): `git tag -a vX.Y.Z -m "Harmony Finder vX.Y.Z"`, `git push origin vX.Y.Z`, `herramientas/publicar_pages.sh`.
