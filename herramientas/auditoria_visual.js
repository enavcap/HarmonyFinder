// Auditoría visual: dibuja una muestra de fragmentos y mide solapes de cifrados, acordes no dibujados y números de compás raros.
const { chromium } = require('playwright'); const fs=require('fs');
const N=+(process.argv[2]||400);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:900}});
const errores=[]; p.on('pageerror',e=>errores.push(e.message));
await p.route(/googleapis|gstatic/,r=>r.abort());
await p.route(/jsdelivr/,r=>r.fulfill({body:fs.readFileSync('verovio-toolkit-wasm.js'),contentType:'application/javascript'}));
await p.goto('http://localhost:8767/index.html');await p.waitForFunction(()=>window.__prueba);
// muestra: movimientos con partitura, repartidos (semilla fija), una ventana de 4 compases al azar
const muestra=await p.evaluate(async N=>{
  let s=12345; const rnd=()=>(s=(s*1103515245+12345)%2147483648)/2147483648;
  const movs=[...new Map(__prueba.OBRAS.filter(o=>o.pq).map(o=>[o.id,o])).values()];
  for(let i=movs.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[movs[i],movs[j]]=[movs[j],movs[i]]}
  const out=[];
  for(const o of movs.slice(0,N)){
    const ac=await __prueba.acordesDe(o.id); if(!ac.length) continue;
    const cs=[...new Set(ac.map(a=>a.compas))].sort((a,b)=>a-b);
    const i0=cs[Math.floor(rnd()*Math.max(1,cs.length-3))];
    out.push({obra:o.id,ini:i0,fin:i0+3,f:o.f,t:o.c+' · '+o.t});
  }
  return out},N);
const res=[]; let k=0;
for(const m of muestra){
  k++;
  const h={obra:m.obra,ini:m.ini,fin:m.fin,frag:true,tono:'',etq:'',compas:m.ini,parte:1};
  try{
    await p.evaluate(h=>{__prueba.fijarSeleccion(h);__prueba.mostrar(h)},h);
    await p.waitForFunction(()=>{const c=document.querySelector('#partitura');return c&&(c.querySelector('svg g.cifrados')||/No se pudo|No encuentro|no partitura|repeticiones desplegadas/.test(c.textContent))},null,{timeout:60000});
  }catch(e){res.push({...m,fallo:'tiempo agotado'});continue}
  const r=await p.evaluate(async h=>{
    const cont=document.querySelector('#partitura'), svg=cont.querySelector('svg');
    if(!svg) return /repeticiones desplegadas/.test(cont.textContent)?{sinPartitura:true}:{fallo:cont.textContent.trim().slice(0,80)};
    const ac=(await __prueba.acordesDe(h.obra)).filter(a=>a.compas>=h.ini-1&&a.compas<=h.fin+1);   // margen ±1
    const g=svg.querySelector('g.cifrados');
    const romanos=[...g.children].filter(x=>x.tagName==='g');
    // solapes en la fila del romano
    const cajas=romanos.map(x=>x.getBoundingClientRect()).map(bb=>({x0:bb.left,x1:bb.right,y:bb.top})).sort((a,b)=>a.x0-b.x0);
    const ref=romanos[0]?romanos[0].getBoundingClientRect().height:1;
    let solapes=0; for(let i=1;i<cajas.length;i++){ if(cajas[i].x0<cajas[i-1].x1-ref*0.05) solapes++ }
    // fila funcional (textos con text-anchor middle y la y mayor)
    const nums=[...svg.querySelectorAll('g.mNum')].map(x=>x.textContent.trim()).filter(t=>!/^\d+$/.test(t));
    const medidas=svg.querySelectorAll('g.measure').length;
    return {dibujados:romanos.length, esperados:ac.length, solapes, numsRaros:nums, medidas};
  },h);
  res.push({...m,...r});
  if(k%50===0) console.log(k,'/',muestra.length);
}
fs.writeFileSync('auditoria.json',JSON.stringify({res,errores},null,1));
const con=f=>res.filter(f);
console.log('fragmentos',res.length,'· errores de página',errores.length);
console.log('fallos al dibujar',con(r=>r.fallo).length);
console.log('con cifrados que se pisan',con(r=>r.solapes>0).length);
console.log('con acordes sin dibujar (<90%)',con(r=>!r.fallo&&r.esperados&&r.dibujados<0.9*r.esperados).length);
console.log('sin partitura por numeración desplegada',con(r=>r.sinPartitura).length);
console.log('con números de compás raros',con(r=>r.numsRaros&&r.numsRaros.length).length);
await b.close()})();
