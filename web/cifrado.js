// Harmony Finder · cifrado interválico (bajo cifrado) a partir del cifrado romano
//
// Calcula las notas del acorde (deletreadas) en su tonalidad, mide cada intervalo sobre el bajo y lo cifra
// según la tradición española (Zamacois):
//   +      la sensible (de la tonalidad local o de la tonicalizada en una dominante secundaria):
//          sola si es la 3.ª («7+», «+»), delante de la cifra si no («+6», «+4»)
//   5̸ 7̸   intervalo disminuido: la cifra tachada
//   ♯ ♭ ♮  nota alterada respecto a la armadura de la tonalidad local: delante de la cifra («♯6»), sola si es la 3.ª
// Cifras abreviadas: 5 · 6 · 6/4 · 7 · 6/5 · 4/3 · 4/2, y la séptima de dominante en 2.ª y 3.ª inversión,
// «+6» y «+4». Una cifra que en la abreviatura no se escribe aparece si lleva alguna marca.
//
// Las notas siguen las mismas reglas que music21 (que usa el resto del proyecto): la séptima es la de la escala
// salvo que la cualidad diga otra cosa (o, ø, M), y en menor vi/vii en minúscula van sobre los grados elevados.
// Devuelve las cifras de arriba abajo; el tachado se escribe con U+0338 detrás de la cifra.
(function(raiz){
'use strict';

const TACHA='̸';
const NAT=[0,2,4,5,7,9,11];                 // do re mi fa sol la si
const MAYOR=[0,2,4,5,7,9,11], MENOR=[0,2,3,5,7,8,10];
const ROM={i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7};
const mod=(a,n)=>((a%n)+n)%n;
const altDe=(l,pc)=>{let a=mod(pc-NAT[l],12);return a>6?a-12:a};
const nota=(l,pc)=>({l:mod(l,7),pc:mod(pc,12),a:altDe(mod(l,7),pc)});
const subir=(n,pasos,semis)=>nota(n.l+pasos,n.pc+semis);

function tonalidad(t){
  const m=String(t||'').match(/^([A-Ga-g])([#-]*)$/); if(!m) return null;
  const l='CDEFGAB'.indexOf(m[1].toUpperCase()), a=(m[2].match(/#/g)||[]).length-(m[2].match(/-/g)||[]).length;
  return {t:nota(l,NAT[l]+a),menor:m[1]===m[1].toLowerCase()};
}
// nota de la escala de la tonalidad con esa letra (para la armadura y la séptima diatónica)
function deEscala(k,l){
  const g=mod(l-k.t.l,7);
  return nota(l,k.t.pc+(k.menor?MENOR:MAYOR)[g]);
}
// fundamental de un grado romano en una tonalidad (reglas de music21)
function fundamental(k,acc,num){
  const g=ROM[num.toLowerCase()]; if(!g) return null;
  const may=num===num.toUpperCase();
  let semis=(k.menor?MENOR:MAYOR)[g-1];
  acc=(acc||'').replace(/-/g,'b');
  if(k.menor&&(g===6||g===7)){
    if(!may||acc==='#') {semis+=1; acc=acc==='#'?'':acc}       // vi, vii (y #vi, #vii): grados elevados
    if(may&&acc==='b') acc='';                                  // bVI, bVII: los mismos que VI, VII
  }
  semis+=acc==='#'?1:acc==='##'?2:acc==='b'?-1:acc==='bb'?-2:0;
  return nota(k.t.l+g-1,k.t.pc+semis);
}
function tonicalizada(k,sec){
  for(let i=sec.length-1;i>=0;i--){
    const m=sec[i].match(/^(bb|##|b|#|-)?([ivIV]+)/); if(!m) return null;
    const f=fundamental(k,m[1],m[2]); if(!f) return null;
    k={t:f,menor:m[2]===m[2].toLowerCase()};
  }
  return k;
}
// semitonos de cada intervalo justo/mayor por número (2 a 7)
const REF={2:2,3:4,4:5,5:7,6:9,7:11}, JUSTO=new Set([4,5]);
function disminuido(n,s){return JUSTO.has(n)?s===REF[n]-1:s===REF[n]-2}

const INV={'':0,'5':0,'53':0,'6':1,'63':1,'64':2,'7':0,'753':0,'65':1,'653':1,'43':2,'643':2,'42':3,'2':3,'642':3};
function analizar(fig){
  const f=String(fig||'').replace(/\[[^\]]*\]/g,'');
  const partes=f.split('/'); let main=partes[0], j=1;
  while(j<partes.length&&/^\d/.test(partes[j])){main+=partes[j];j++}
  const sec=partes.slice(j).filter(Boolean);
  const m=main.match(/^(bb|##|b|#|-)?(Cad|Ger|Fr|It|N|[ivIV]+)(o|ø|\+|%|M|maj)?(\d*)$/);
  if(!m) return null;
  return {acc:m[1]||'',num:m[2],cal:m[3]||'',dig:m[4]||'',sec};
}

// notas del acorde desde la fundamental (o desde el bajo en las sextas aumentadas) y posición del bajo
function acorde(p,k){
  if(p.num==='Cad') return acorde({acc:'',num:k.menor?'i':'I',cal:'',dig:'64',sec:[]},k);
  if(['It','Fr','Ger'].includes(p.num)){
    if(p.dig!=={It:'6',Ger:'65',Fr:'43'}[p.num]&&p.dig!=='') return null;   // otras inversiones: sin cifrado propio
    const b=nota(k.t.l+5,k.t.pc+8), base=[b,nota(k.t.l,k.t.pc),nota(k.t.l+3,k.t.pc+6)];
    if(p.num==='Ger') base.push(nota(k.t.l+2,k.t.pc+3));
    if(p.num==='Fr') base.push(nota(k.t.l+1,k.t.pc+2));
    return {notas:base,bajo:0,tipo:p.num};
  }
  if(!(p.dig in INV)) return null;
  const sep=/^(7|753|65|653|43|643|42|2|642)$/.test(p.dig);
  let num=p.num, acc=p.acc;
  if(num==='N'){num='II';acc='b'}
  const inv=p.num==='N'&&!p.dig?1:INV[p.dig];   // «N» solo = sexta napolitana
  const r=fundamental(k,acc,num); if(!r) return null;
  const may=num===num.toUpperCase(), cal=p.cal;
  const t3=cal==='o'||cal==='ø'||cal==='%'?3:cal==='+'?4:may?4:3;
  const t5=cal==='o'||cal==='ø'||cal==='%'?6:cal==='+'?8:7;
  const notas=[r,subir(r,2,t3),subir(r,4,t5)];
  if(sep){
    let s7;
    if(cal==='o') s7=9; else if(cal==='ø'||cal==='%') s7=10; else if(cal==='M'||cal==='maj') s7=11;
    else{
      // la de la escala; en mayor, la del menor homónimo si la tríada no es la diatónica y sí la de menor (iv7, i7…)
      const diat=k2=>mod(deEscala(k2,r.l+2).pc-r.pc,12)===t3&&mod(deEscala(k2,r.l+4).pc-r.pc,12)===t5&&deEscala(k2,r.l).pc===r.pc;
      const kh={t:k.t,menor:true}, ks=!k.menor&&!acc&&!diat(k)&&diat(kh)?kh:k;
      s7=mod(deEscala(ks,r.l+6).pc-r.pc,12);
    }
    notas.push(subir(r,6,s7));
  }
  return {notas,bajo:inv,tipo:sep?(t3===4&&t5===7&&mod(notas[3].pc-r.pc,12)===10?'dom':'sep'):'tri'};
}

function cifras(fig,tono){
  const p=analizar(fig), k0=tonalidad(tono); if(!p||!k0) return null;
  const kt=tonicalizada(k0,p.sec); if(!kt) return null;
  const ac=acorde(p,kt); if(!ac) return null;
  const sens=nota(kt.t.l-1,kt.t.pc-1);
  const bajo=ac.notas[ac.bajo];
  // cada nota sobre el bajo: número de intervalo y su marca
  const iv={};
  for(const n of ac.notas){
    if(n===bajo) continue;
    const num=mod(n.l-bajo.l,7)+1, s=mod(n.pc-bajo.pc,12);
    let marca='';
    if(n.l===sens.l&&n.pc===sens.pc) marca='+';
    else if(disminuido(num,s)) marca=TACHA;
    else if(n.a!==deEscala(k0,n.l).a) marca={'-2':'𝄫','-1':'♭','0':'♮','1':'♯','2':'𝄪'}[n.a]||'';
    iv[num]=marca;
  }
  const con=(n,m)=>m==='+'||m===''?(m+n):m===TACHA?n+TACHA:m+n;
  const marcadas=Object.keys(iv).map(Number).filter(n=>iv[n]);
  let escritas;
  if(ac.tipo==='It') escritas=[6];
  else if(ac.tipo==='Ger') escritas=[6,5];
  else if(ac.tipo==='Fr') escritas=[6,4,3];
  else if(ac.tipo==='tri') escritas=[[5],[6],[6,4]][ac.bajo];
  else escritas=[[7],[6,5],[4,3],[4,2]][ac.bajo];
  // séptima de dominante en 2.ª y 3.ª inversión: basta la cifra de la sensible (Zamacois)
  if(ac.tipo==='dom'&&ac.bajo===2&&iv[6]==='+') escritas=[6];
  else if(ac.tipo==='dom'&&ac.bajo===3&&iv[4]==='+') escritas=[4];
  else{
    const otras=marcadas.filter(n=>!escritas.includes(n)&&n!==3);
    escritas=[...new Set([...escritas,...otras])];
    // tríada en estado fundamental: el 5 sobra si la 3.ª ya lleva marca y la 5.ª no
    if(ac.tipo==='tri'&&ac.bajo===0&&iv[3]&&!iv[5]) escritas=[];
  }
  escritas.sort((a,b)=>b-a);
  const out=escritas.map(n=>con(String(n),iv[n]||''));
  // la 3.ª no escrita: su marca sola, debajo
  if(iv[3]&&!escritas.includes(3)) out.push(iv[3]===TACHA?'3'+TACHA:iv[3]);
  return out;
}
// en una línea: cifras separadas por «/»; la sensible sola (la 3.ª) va pegada a la cifra de encima («7+»)
function texto(filas){
  if(!filas) return null;
  let s='';
  for(const f of filas) s+=(s&&f!=='+'?'/':'')+f;
  return s;
}

const API={cifras,texto,TACHA,_tonalidad:tonalidad,_acorde:(fig,tono)=>{const p=analizar(fig),k=tonalidad(tono);if(!p||!k)return null;const kt=tonicalizada(k,p.sec);return kt&&acorde(p,kt)}};
if(typeof module!=='undefined'&&module.exports) module.exports=API; else raiz.Cifrado=API;
})(typeof window!=='undefined'?window:globalThis);
