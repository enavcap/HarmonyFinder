#!/usr/bin/env python3
"""
Interfaz web mínima: escribes un concepto, aparecen los ejemplos con
compás y parte, y al pulsar uno se renderiza el fragmento de partitura.

    pip install flask verovio music21
    CORPUS=/ruta/al/When-in-Rome/Corpus python app.py
    → http://localhost:5000
"""
import os
from pathlib import Path
from flask import Flask, request, jsonify, send_file, Response
import buscar, recortar

CORPUS = Path(os.environ.get("CORPUS", "/tmp/wir/Corpus"))
app = Flask(__name__)

PAGINA = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Buscador armónico</title>
<style>
 body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#222}
 input{font:inherit;width:100%;padding:.7rem 1rem;border:1px solid #bbb;border-radius:8px}
 .meta{color:#666;font-size:.9rem;margin:.5rem 0 1rem}
 table{border-collapse:collapse;width:100%} td,th{padding:.35rem .6rem;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
 tr.hit{cursor:pointer} tr.hit:hover{background:#f4f4f4} tr.sel{background:#eef}
 #score{margin-top:1.5rem;border:1px solid #ddd;border-radius:8px;padding:1rem;overflow-x:auto;min-height:3rem}
 #score svg{max-width:100%;height:auto}
 .pill{display:inline-block;background:#eee;border-radius:1rem;padding:0 .6rem;font-size:.85rem;margin:.1rem .2rem .1rem 0;cursor:pointer}
 .pill:hover{background:#ddd}
</style></head><body>
<h1>Buscador armónico</h1>
<input id="q" placeholder="Escribe un concepto: cadencia rota, napolitana, sexta aumentada alemana, dominante de la dominante, pedal de dominante…" autofocus>
<div class="meta" id="pills"></div>
<div class="meta" id="info"></div>
<table id="res"></table>
<div id="score"><em>Pulsa una fila para ver el fragmento.</em></div>
<script>
const q=document.getElementById('q'),res=document.getElementById('res'),info=document.getElementById('info'),score=document.getElementById('score');
fetch('/conceptos').then(r=>r.json()).then(c=>{document.getElementById('pills').innerHTML=c.map(x=>`<span class="pill" onclick="q.value='${x}';go()">${x.replace(/_/g,' ')}</span>`).join('')});
let t;q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(go,400)});
async function go(){
  if(!q.value.trim())return;
  info.textContent='Buscando…';
  const r=await fetch('/buscar?q='+encodeURIComponent(q.value)).then(r=>r.json());
  if(r.error){info.textContent=r.error;res.innerHTML='';return}
  info.textContent=`${q.value} → ${r.concepto.replace(/_/g,' ')} (${r.descripcion}) · ${r.total} coincidencias en ${r.obras} obras`;
  res.innerHTML='<tr><th>Compositor</th><th>Obra</th><th>Compás</th><th>Parte</th><th>Tono</th><th>Cifrado</th><th>Partitura</th></tr>'+
   r.resultados.map(h=>`<tr class="hit" onclick="ver(this,${h.obra_id},${h.compas},'${h.etiqueta.replace(/'/g,"")}')"><td>${h.compositor}</td><td>${h.titulo}</td><td>${h.compas}</td><td>${h.parte}</td><td>${h.tono}</td><td>${h.etiqueta}</td><td>${h.partitura?'✓':'—'}</td></tr>`).join('');
}
async function ver(tr,obra,compas,et){
  document.querySelectorAll('tr.sel').forEach(x=>x.classList.remove('sel'));tr.classList.add('sel');
  score.innerHTML='<em>Renderizando…</em>';
  const r=await fetch(`/recorte?obra=${obra}&compas=${compas}&etiqueta=${encodeURIComponent(et)}`);
  score.innerHTML= r.ok ? await r.text() : '<em>'+await r.text()+'</em>';
}
</script></body></html>"""

@app.get("/")
def index(): return PAGINA

@app.get("/conceptos")
def conceptos(): return jsonify(list(buscar.CONCEPTOS))

@app.get("/buscar")
def api_buscar():
    texto = request.args.get("q", "")
    concepto = buscar.interpretar(texto)
    if not concepto:
        return jsonify(error=f"No reconozco «{texto}».")
    res = buscar.buscar(concepto, compositor=request.args.get("compositor"), por_obra=int(request.args.get("por_obra", 2)))
    res.sort(key=lambda r: (r["partitura"] is None, r["compositor"], r["titulo"], r["compas"]))
    return jsonify(concepto=concepto, descripcion=buscar.CONCEPTOS[concepto][1], total=len(res),
                   obras=len({r["obra_id"] for r in res}), resultados=res[:300])

@app.get("/recorte")
def api_recorte():
    try:
        out = recortar.recortar(CORPUS, int(request.args["obra"]), int(request.args["compas"]),
                                margen=1, etiqueta=request.args.get("etiqueta"), png=True)
    except Exception as e:
        return Response(f"No se pudo renderizar: {e}", status=500, mimetype="text/plain")
    if "svg" in out:
        return Response(Path(out["svg"]).read_text(encoding="utf-8"), mimetype="image/svg+xml")
    return send_file(out["musicxml"], as_attachment=True)

if __name__ == "__main__":
    app.run(debug=False, port=int(os.environ.get("PORT", 5000)))
