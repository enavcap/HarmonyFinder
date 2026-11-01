// Harmony Finder · búsqueda de progresiones de cifrados romanos
//
// Cada cifrado se descompone en propiedades (grado, alteración, dominante secundaria, cualidad, tamaño,
// inversión y notas añadidas) y se compara propiedad a propiedad. Lo que el usuario escribe solo exige
// las propiedades que escribe:
//   «ii»     → cualquier acorde sobre el II grado con cualidad de minúscula (ii, ii6, ii7, iiø7, iio6…)
//   «ii6»    → tríada de ii en primera inversión (no ii6/5, no ii en estado fundamental)
//   «iiø7»   → séptima semidisminuida sobre ii, en estado fundamental
//   «V43»    → séptima sobre V en segunda inversión
//   «V»      → V, V6, V7, V65, V43, V42, V9… (pero no V/V ni v)
// Las propiedades que nunca se relajan: el grado, la alteración (♭VI ≠ VI), la dominante secundaria
// (V/V ≠ V), la mayúscula/minúscula (v ≠ V) y la tonalidad local (una progresión no cruza una modulación).
// Los datos del corpus no se tocan: la normalización se hace aquí, al comparar.
(function(raiz){
'use strict';

const ESPECIALES=new Set(['Ger','Fr','It','Sw','N','Cad']);
// cifras → tamaño del acorde e inversión
const CIFRAS={
  '5':['tri',0],'53':['tri',0],'6':['tri',1],'63':['tri',1],'64':['tri',2],
  '7':['sep',0],'753':['sep',0],'65':['sep',1],'653':['sep',1],'43':['sep',2],'643':['sep',2],'42':['sep',3],'2':['sep',3],'642':['sep',3]};

// En menor, «#vi»/«#vii» y «vi»/«vii» son el mismo acorde (convención de RomanText que el DCML escribe con #).
// Sin tonalidad (lo que escribe el usuario) se tratan como iguales. Igual que accEfectiva() en index.html.
function alteracion(acc,num,sec,tono){
  acc=acc.replace(/-/g,'b');
  if(acc!=='#'||!/^(vi|vii)$/.test(num)) return acc;
  const destino=sec.length?sec[0].replace(/^[#b-]+/,''):null;
  const menor=destino?destino===destino.toLowerCase():(!tono||tono[0]===tono[0].toLowerCase());
  return menor?'':acc;
}

// Descompone un cifrado. Devuelve null si no es un cifrado romano.
function analizar(fig,tono){
  const s=String(fig).trim();
  const ext=[...s.matchAll(/\[([^\]]*)\]/g)].map(m=>m[1].replace(/-/g,'b'));
  const partes=s.replace(/\[[^\]]*\]/g,'').split('/');
  let main=partes[0], j=1;
  while(j<partes.length&&/^\d/.test(partes[j])){main+=partes[j];j++}
  const sec=partes.slice(j).filter(Boolean).map(x=>x.replace(/-/g,'b'));
  const m=main.match(/^(bb|##|b|#|-)?(Cad|Ger|Fr|It|Sw|N|[ivIV]+)(o|ø|\+|%)?(maj|M|d|m)?([0-9]*)(.*)$/);
  if(!m) return null;
  const num=m[2], dig=m[5];
  // un resto que no sean cifras ni notas añadidas (p. ej. «V7x») no es un cifrado que sepamos leer
  if(m[6]&&!/^[()0-9#b,]*$/.test(m[6])) return null;
  const especial=ESPECIALES.has(num);
  const [tam,inv]=dig===''?[null,null]:(CIFRAS[dig]||['otro',null]);
  return {
    num, especial,
    grado:especial?num:num.toLowerCase(),
    mayus:especial?null:num===num.toUpperCase(),
    acc:alteracion(m[1]||'',num,sec,tono),
    cal:(m[3]||'').replace('%','ø'),
    tipo:m[4]==='maj'?'M':(m[4]||''),   // tipo de séptima escrito: M (mayor), d (de dominante), m (menor)
    dig, tam, inv,
    sec:sec.join('/'),
    ext,
  };
}

// Lo que escribe el usuario: las mismas propiedades, más qué ha especificado.
function consulta(fig){
  const p=analizar(fig);
  if(!p) return null;
  return {...p, fig:String(fig)};
}

// ¿El acorde c (del corpus) cumple la consulta q?
function coincide(c,q,opc={}){
  if(!c||!q) return false;
  // acorde de sexta cadencial: solo cuando se pide expresamente (Cad64 o I64), como antes
  if(c.num==='Cad'){
    if(q.num==='Cad') return c.sec===q.sec;
    return q.grado==='i'&&q.mayus&&q.acc===''&&q.tam==='tri'&&(q.inv===2||opc.sinInv)&&c.sec===q.sec&&!q.cal;
  }
  if(q.num==='Cad') return false;
  if(c.grado!==q.grado||c.mayus!==q.mayus||c.acc!==q.acc||c.sec!==q.sec) return false;
  if(q.cal&&c.cal!==q.cal) return false;
  if(q.tipo&&c.tipo!==q.tipo) return false;
  if(q.dig){
    if(q.tam==='otro'){ if(c.dig!==q.dig) return false }
    else {
      if(c.tam!==q.tam) return false;
      if(!opc.sinInv&&c.inv!==q.inv) return false;
    }
  }
  for(const e of q.ext) if(!c.ext.includes(e)) return false;
  return true;
}

// Busca la progresión en la sucesión de acordes de un análisis.
//   crudo: [[compás, parte, índice de tono, cifrado, …, …, unísono?], …]  (web/data/acordes/*.json)
//   tonos: lista de tonalidades locales del grupo
//   Q:     consultas (consulta())
//   opc:   {sinInv, gap (acordes intermedios permitidos), min (mínimo de acordes que deben coincidir)}
// Devuelve [{i0, i1, h}] con índices en la sucesión comprimida `seq` y el número de acordes coincidentes.
const ILEGIBLE=Object.freeze({num:'?',grado:'?',mayus:null,acc:'',cal:'',tipo:'',dig:'',tam:null,inv:null,sec:'',ext:[]});
function secuencia(crudo,tonos){
  const seq=[];
  for(const a of crudo){
    // un unísono corta la sucesión (c=null); un cifrado que no sabemos leer ocupa su sitio pero no coincide con nada
    const c=a[6]?null:(analizar(a[3],tonos[a[2]])||ILEGIBLE);
    const ant=seq[seq.length-1];
    // un acorde repetido seguido (mismo cifrado, misma tonalidad) cuenta como uno
    if(ant&&ant.a[3]===a[3]&&ant.a[2]===a[2]&&!!ant.a[6]===!!a[6]) continue;
    // t: tónica local (sin modo). Un cambio de modo sobre la misma tónica (c → C, picarda) no corta la progresión
    seq.push({c,a,t:String(tonos[a[2]]??a[2]).toLowerCase()});
  }
  return seq;
}
function buscarEnSecuencia(seq,Q,opc={}){
  const n=Q.length, gap=opc.gap||0, m=Math.min(n,Math.max(2,opc.min||n)), out=[];
  const ok=(z,k)=>coincide(seq[z].c,Q[k],opc);
  // prolonga una etapa: V – V7 cuentan como una sola «V», salvo que el acorde ya sea la etapa siguiente
  const absorber=(z,k,t)=>{
    while(z+1<seq.length&&seq[z+1].c&&seq[z+1].t===t&&ok(z+1,k)&&!(k+1<n&&ok(z+1,k+1))) z++;
    return z;
  };
  let i=0;
  while(i<seq.length){
    let mejor=null;
    if(seq[i].c) for(let k0=0;k0<=n-m;k0++){
      if(!ok(i,k0)) continue;
      const t=seq[i].t;
      let ult=k0+1<n?absorber(i,k0,t):i, kk=k0+1, h=1;
      while(kk<n){
        let hit=-1;
        for(let z=ult+1;z<=Math.min(seq.length-1,ult+1+gap);z++){
          // un unísono o un cambio de tónica local (modulación) cortan la progresión
          if(!seq[z].c||seq[z].t!==t) break;
          if(ok(z,kk)){hit=z;break}
        }
        if(hit<0) break;
        ult=kk+1<n?absorber(hit,kk,t):hit; kk++; h++;
      }
      if(h>=m&&(!mejor||h>mejor.h)) mejor={i0:i,i1:ult,h};
    }
    if(mejor){out.push(mejor); i=mejor.i1+1}
    else i++;
  }
  return out;
}

const API={analizar,consulta,coincide,secuencia,buscarEnSecuencia,CIFRAS};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else raiz.Progresiones=API;
})(typeof globalThis!=='undefined'?globalThis:this);
