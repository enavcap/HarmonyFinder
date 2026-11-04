// Harmony Finder · elección de los ejemplos de «Para empezar»
//
// Objetivo: que los primeros ejemplos sean canónicos y claros del procedimiento buscado, no los más cortos ni
// los de quien más ejemplos tiene. Se puntúa cada ejemplo y se eligen cuatro de compositores distintos.
//
// Puntuación (de mayor a menor peso):
//   · Claridad del procedimiento
//       - su cifrado es el habitual en esa búsqueda (frecuencia relativa de la etiqueta entre los resultados)
//       - la etiqueta es limpia (sin notas añadidas ni omitidas: «[add6]», «[no5]»…)
//       - la longitud es la típica de ese procedimiento (ni recortado ni larguísimo)
//       - es cadencial, si el concepto distingue ejemplos cadenciales de no cadenciales
//       - cae en tiempo fuerte
//   · Fiabilidad: no está al unísono (el cifrado no corresponde a acordes que suenen), la partitura no es
//     una reconstrucción, y, para los manuales, un pequeño plus.
//   · Cuando se busca una cadencia, la claridad de la cadencia pesa más que nada: que el analista la marque
//     con su tipo (PAC, IAC, HC, PC, DC…), que llegue en tiempo fuerte y que la preceda una predominante o un 6/4.
//   · Tonalidad: desempata a favor de las que tienen menos alteraciones, pero nunca gana a la claridad.
//
// Elección: un ejemplo por compositor, con variedad de épocas y de tonalidades, y uno de J. S. Bach si lo hay
// y no es claramente peor que los demás (los corales de Bach son tantos que, sin esta regla, lo llenarían todo).
//
// El módulo no toca el DOM ni los datos: la web y las pruebas usan las mismas funciones.
(function(raiz){
'use strict';

// tipo de cadencia que anota el analista (campo «cad» de web/data/acordes) para cada concepto cadencial
const CADENCIA_ANOT={
  cadencia_autentica_perfecta:['PAC'],
  cadencia_autentica_imperfecta:['IAC'],
  semicadencia:['HC','HC.SIM','HC.CON','HC.PHR','HC.TEN'],
  cadencia_frigia:['HC.PHR'],
  cadencia_plagal:['PC'],
  cadencia_rota:['DC'],
  sexta_cuarta_cadencial:['PAC','IAC','HC','HC.SIM','HC.CON'],
};
// acordes cuya resolución canónica es la dominante (o el 6/4 cadencial)
const PREDOMINANTES=new Set(['sexta_aumentada','sexta_aumentada_italiana','sexta_aumentada_francesa','sexta_aumentada_alemana',
  'napolitana','sexta_napolitana','bii_fundamental']);
const ES_PREDOM=/^(Ger|It|Fr|Sw|N\d*|bII|♭II)/, ES_DOMINANTE=/^(V|Cad64|I64|i64)(?!\/)/;
// procedimientos cuya etiqueta es la lista de acordes: cuanto más pura de acordes del procedimiento, mejor
const PURO={pedal_de_dominante:ES_DOMINANTE};
const esCadencia=k=>!!k&&Object.prototype.hasOwnProperty.call(CADENCIA_ANOT,k);

// número de alteraciones de la armadura de una tonalidad escrita como en los datos: «G», «B-», «c#», «e-»…
const BASE={C:0,G:1,D:2,A:3,E:4,B:5,F:-1};
function alteraciones(tono){
  const m=/^([A-Ga-g])([#-]*)$/.exec(tono||''); if(!m) return 3;
  const l=m[1], mayor=l===l.toUpperCase(), alt=[...m[2]].reduce((s,c)=>s+(c==='#'?1:-1),0);
  return Math.abs(BASE[l.toUpperCase()]+7*alt-(mayor?0:3));
}

// la misma etiqueta sin los nombres de las tonalidades, para contar «diatónica · pivote: I = IV» y no «C → G…»
const etqNorm=e=>(e||'').replace(/(?<![\w#-])[A-Ga-g][#-]*(?![\w])/g,'X');

// lo que se necesita saber del conjunto de resultados para puntuar cada uno
function contexto(filas,k){
  const frec=new Map(), durs=[]; let max=0;
  for(const h of filas){
    const e=etqNorm(h.etq); if(e){const n=(frec.get(e)||0)+1; frec.set(e,n); if(n>max) max=n}
    durs.push(duracion(h));
  }
  durs.sort((a,b)=>a-b);
  return {k,cad:esCadencia(k),frec,max,med:durs.length?durs[durs.length>>1]:2};
}
const duracion=h=>Math.max(1,(h.fin!=null?h.fin:h.compas||1)-(h.ini!=null?h.ini:h.compas||1)+1);

// Primera pasada, con lo que ya está en memoria. Devuelve un número (más alto = más canónico).
// Si se pasa «porque», se rellena con las partes de la puntuación (para las pruebas y para depurar).
function puntuar(h,cx,info,porque){
  let s=0; const poner=(t,v)=>{if(v){s+=v; if(porque) porque.push(t+' '+(v>0?'+':'')+v.toFixed(2))}};
  const e=etqNorm(h.etq);
  if(e&&cx.max) poner('etiqueta habitual',2.5*Math.sqrt((cx.frec.get(e)||0)/cx.max));
  if(PURO[cx.k]&&e){const t=e.split(/\s+/).filter(Boolean); if(t.length) poner('acordes del procedimiento',3*t.filter(x=>PURO[cx.k].test(x)).length/t.length)}
  // cadencias: el cifrado y la tonalidad deben coincidir en modo (una cadencia con «I» en tonalidad menor es una tercera
  // de Picardía, y con «i» en mayor suele ser un cambio de modo del análisis: ni una ni otra es la cadencia típica)
  if(cx.cad&&e&&h.tono&&cx.k!=='tercera_picardia'){
    const menor=h.tono===h.tono.toLowerCase();
    if(e.split(/\s+/).some(t=>(menor?/^I(?![IVv])/:/^i(?![v])/).test(t))) poner('modo del cifrado distinto del de la tonalidad',-1.2);
  }
  poner('etiqueta limpia',-Math.min(3,1.2*((e.match(/\[/g)||[]).length)));
  const d=duracion(h), tip=cx.med;
  if(d>=Math.min(2,tip)&&d<=tip+1) poner('longitud típica',1);
  else if(d>tip+1) poner('demasiado largo',-Math.min(2,0.5*(d-tip-1)));
  else poner('recortado',-0.3);
  if(h.ctx==='c') poner('cadencial',1.2); else if(h.ctx==='n') poner('no cadencial',-0.3);
  if(h.parte===1) poner('tiempo fuerte',0.4);
  poner('tonalidad',-0.1*Math.min(7,alteraciones(h.tono)));
  if(info){
    if(info.reconstruida) poner('partitura reconstruida',-0.5);
    if(info.manual) poner('manual',0.3);
  }
  return s;
}

// Segunda pasada, con los acordes de la obra (web/data/acordes): lo que solo se ve mirando el pasaje.
// «acordes» es la lista de acordesDe(obra): {compas,parte,tono,rn,orig,cad,u}. Devuelve un ajuste a sumar.
function refinar(h,acordes,cx,porque){
  let s=0; const poner=(t,v)=>{s+=v; if(porque) porque.push(t+' '+(v>0?'+':'')+v.toFixed(2))};
  const a0=h.ini!=null?h.ini:h.compas, a1=h.fin!=null?h.fin:h.compas;
  const w=acordes.filter(a=>a.compas>=a0&&a.compas<=a1);
  if(w.some(a=>a.u)) poner('al unísono: no suenan los acordes cifrados',-5);
  if(cx.cad&&w.length){
    // No todos los corpus marcan cadencias: donde no hay marcas en toda la obra no se premia ni se castiga
    // (si no, ganarían siempre los corpus que las anotan).
    const tipos=CADENCIA_ANOT[cx.k], anot=w.filter(a=>a.cad), anotada=acordes.some(a=>a.cad);
    if(anot.some(a=>tipos.includes(a.cad))) poner('cadencia marcada por el analista',1);
    else if(anot.length) poner('el analista marca otra cadencia',-0.8);
    else if(anotada) poner('el analista no marca aquí cadencia',-0.6);
    if(w[w.length-1].parte===1) poner('llega en tiempo fuerte',0.4);
    if(w.some(a=>/^(ii|IV|iv|Cad64|I64|i64|N|Ger|It|Fr)/.test(a.rn||''))) poner('predominante o 6/4 previo',0.4);
  }
  if(PREDOMINANTES.has(cx.k)){
    const w2=acordes.filter(a=>a.compas>=a0&&a.compas<=a1+1); let i=-1;
    w2.forEach((a,j)=>{if(ES_PREDOM.test(a.rn||'')) i=j});
    if(i>=0&&i<w2.length-1) poner(ES_DOMINANTE.test(w2[i+1].rn||'')?'resuelve en la dominante':'no resuelve en la dominante',ES_DOMINANTE.test(w2[i+1].rn||'')?1.2:-0.3);
  }
  return s;
}

// Elige hasta «n» ejemplos. «punt(h)» da la puntuación de cada uno; «info(h)» → {c, per}.
function elegir(filas,punt,info,n=4){
  const BACH='Johann Sebastian Bach';
  const cand=filas.map(h=>({h,p:punt(h),i:info(h)})).sort((a,b)=>b.p-a.p||duracion(a.h)-duracion(b.h));
  const sale=[], comps=new Set(), pers=new Map(), tonos=new Map();
  const ajustada=x=>x.p-0.8*(pers.get(x.i.per)||0)-0.4*(tonos.get(x.h.tono)||0);
  const meter=x=>{sale.push(x); comps.add(x.i.c); pers.set(x.i.per,(pers.get(x.i.per)||0)+1); tonos.set(x.h.tono,(tonos.get(x.h.tono)||0)+1)};
  const libres=()=>cand.filter(x=>!comps.has(x.i.c)&&!sale.includes(x));
  while(sale.length<n){
    let mejor=null, vistos=0;
    for(const x of libres()){ if(++vistos>400) break; if(!mejor||ajustada(x)>ajustada(mejor)) mejor=x }
    if(!mejor) break; meter(mejor);
  }
  // un Bach, si lo hay y no es claramente peor que el último elegido
  if(sale.length&&!sale.some(x=>x.i.c===BACH)){
    const b=cand.find(x=>x.i.c===BACH);
    if(b){const k=sale.reduce((m,x,j)=>x.p<sale[m].p?j:m,0); if(b.p>=sale[k].p-1.5) sale[k]=b}
  }
  return sale.map(x=>x.h);
}

// Flujo completo. «preseleccion» es síncrona (instantánea): puntúa todo y deja un grupo de candidatos variado
// y la elección provisional. «refinarPool» carga los acordes de esos candidatos (pocas obras) y da la elección final.
const POOL=8;
function preseleccion(filas,k,info,n=4){
  const cx=contexto(filas,k), p1=new Map();
  for(const h of filas) p1.set(h,puntuar(h,cx,info(h)));
  const pool=elegir(filas,h=>p1.get(h),info,POOL);
  return {cx,p1,pool,n,info,rapida:elegir(pool,h=>p1.get(h),info,n)};
}
async function refinarPool(pre,cargar){
  const p2=new Map();
  await Promise.all(pre.pool.map(async h=>{
    let ac=[]; try{ac=await cargar(h.obra)||[]}catch(e){}
    p2.set(h,pre.p1.get(h)+refinar(h,ac,pre.cx));
  }));
  return elegir(pre.pool,h=>p2.get(h),pre.info,pre.n);
}

const API={preseleccion,refinarPool,alteraciones,etqNorm,contexto,puntuar,refinar,elegir,esCadencia,CADENCIA_ANOT};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else raiz.Canonicos=API;
})(typeof globalThis!=='undefined'?globalThis:this);
