"""Prueba en navegador: las búsquedas dan los mismos resultados en español y en inglés.

    python herramientas/prueba_idiomas.py        (necesita playwright y Chromium)

Para cada idioma de la interfaz comprueba que el nombre de cada procedimiento, tipo de acorde y término
de forma, en los dos idiomas, lleva a su clave; y que una lista de búsquedas escritas en español y en
inglés devuelven exactamente los mismos resultados (el orden de la lista puede variar, porque se ordena
por el título de la obra, que se traduce).
"""
import http.server, json, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = Path(__file__).resolve().parents[1] / "web"
PARES = [("cadencia rota", "deceptive cadence"), ("sexta alemana en el desarrollo", "German sixth in the development"),
         ("modulación al relativo", "modulation to the relative key"),
         ("sexta napolitana en la reexposición", "Neapolitan sixth in the recapitulation"),
         ("solo tríadas sin inversiones", "triads only root position only"),
         ("dominante secundaria en el segundo grupo temático", "secondary dominant in the secondary theme"),
         ("cadencia perfecta", "PAC"), ("semicadencia", "imperfect cadence"), ("ii6 V7 I", "ii6 V7 I"),
         ("desarrollo", "development"), ("todas las obras", "all works")]

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".html": "text/html; charset=utf-8",
                      ".json": "application/json; charset=utf-8", ".js": "text/javascript; charset=utf-8"}
    def __init__(self, *a, **k): super().__init__(*a, directory=str(WEB), **k)
    def log_message(self, *a): pass

def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    voc = json.loads((WEB / "data" / "vocab.json").read_text())
    res, errores, fallos = {}, [], []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for lang in ("es", "en"):
            ctx = b.new_context(); ctx.add_init_script(f"localStorage.setItem('idioma','{lang}')")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errores.append(str(e)))
            def cargar():
                pg.goto(url, wait_until="networkidle")
                pg.wait_for_function("window.__prueba && window.__prueba.OBRAS.length>0", timeout=60000)
            cargar()
            fallos += pg.evaluate("""V=>{const P=window.__prueba,out=[];
              const norm=t=>t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[,;.:]/g,' ').replace(/\\s+/g,' ');
              for(const [k,v] of Object.entries(V.conceptos)) for(const n of [v.es,v.en]) if(P.interpretar(n)!==k) out.push(['concepto',k,n]);
              for(const [k,v] of Object.entries(V.facetas)) for(const n of [v.es,v.en]){const r=P.parsearFacetas(norm(n));if(r.ids.join()!==k||r.libres.length) out.push(['faceta',k,n])}
              for(const [k,v] of Object.entries(V.forma)) for(const n of [v.es,v.en]){const r=P.extraerForma(n);if(r&&r.valor!==k) out.push(['forma',k,n])}
              return out}""", voc)
            for es, en in PARES:
                for txt in (es, en):
                    cargar()
                    pg.evaluate("t=>{const P=window.__prueba;P.fijarTexto(t);P.cerrar();P.enviar()}", txt)
                    pg.wait_for_function("!/Buscando|Searching/.test(document.querySelector('#estado').textContent)", timeout=120000)
                    # el orden puede cambiar (se ordena por título, que se traduce): se comparan los conjuntos
                    res[(lang, txt)] = pg.evaluate("()=>JSON.stringify([window.__prueba.actual,window.__prueba.filas.map(h=>[h.obra,h.compas,h.parte,h.ini,h.fin].join('|')).sort()])")
            ctx.close()
        b.close()
    srv.shutdown()
    for es, en in PARES:
        if len({res[(l, t)] for l in ("es", "en") for t in (es, en)}) != 1:
            fallos.append(["búsqueda", es, en])
    print(f"{len(PARES)} búsquedas × 2 idiomas de escritura × 2 idiomas de interfaz")
    for f in fallos: print("  FALLO", f)
    for e in errores: print("  ERROR", e)
    print("todo igual" if not fallos and not errores else "hay diferencias")
    sys.exit(1 if fallos or errores else 0)

if __name__ == "__main__":
    main()
