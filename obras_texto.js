// Harmony Finder · reconocer el nombre de una obra dentro del texto del buscador
//
// «dominante de la dominante en suite inglesa 1 de bach»: además del procedimiento y del compositor, el texto
// nombra una obra. Los títulos del corpus están en varios idiomas («English Suite No. 1», «Sonata para piano
// n.º 14», «Partita No2, BWV1004»), así que se compara por palabras, no por cadena, y las palabras genéricas
// del español se traducen a las del título («inglesa» → english).
//
// Regla de seguridad: solo se reconoce una obra si el trozo escrito identifica una sola (los movimientos de una
// misma obra cuentan como una). Si es ambiguo («suite 1» sin compositor), no se adivina.
(function(raiz){
'use strict';

// palabras de relleno de un título o de lo escrito: no identifican la obra
const RELLENO_TITULO=new Set(['no','n','º','nr','num','numero','in','en','de','del','la','el','los','las','y','e','a','o']);
// formas equivalentes → palabras que pueden figurar en el título (en inglés o en el idioma del título)
const ALIAS={
  inglesa:['english'],ingles:['english'],inglesas:['english'],english:['inglesa'],
  francesa:['french'],frances:['french'],francesas:['french'],french:['francesa'],suites:['suite'],
  preludio:['prelude'],fuga:['fugue'],invencion:['invention'],sinfonia:['sinfonia','symphony'],
  concierto:['concerto','concert'],variaciones:['variations'],cuarteto:['quartet','cuarteto'],cuerda:['string','cuerda'],
  quartet:['cuarteto'],string:['cuerda'],strings:['cuerda'],
  mayor:['major'],menor:['minor'],bemol:['flat'],sostenido:['sharp'],
  piano:['piano','keyboard'],teclado:['keyboard'],cancion:['song','lied'],canciones:['songs','lieder'],
  mazurca:['mazurka'],polonesa:['polonaise'],balada:['ballade'],nocturno:['nocturne'],estudio:['etude','study'],
  estudios:['etudes','studies'],fantasia:['fantasia','fantasy'],piezas:['pieces'],liricas:['lyric'],
};
// «op27», «bwv806», «k331»: número de catálogo pegado a su sigla
const CATALOGOS=['op','bwv','k','kv','hob','d','wq','s','sz','wwv','l','h','rv','trv','woo'];
const SEP_CAT=new RegExp('^('+CATALOGOS.join('|')+')(\\d+[a-z]?)$');

// palabras de un título: se separan letras y cifras pegadas («No2» → no 2, «BWV1004» → bwv 1004) y los guiones
function palabrasTitulo(titulo,norm){
  return norm(titulo).replace(/([a-z])(\d)/g,'$1 $2').replace(/(\d)([a-z])/g,'$1 $2').replace(/-/g,' ')
    .split(' ').filter(Boolean);
}
// palabras de lo escrito: solo se separa el número de catálogo («op27» → op 27); «v7» o «ii6» siguen siendo una palabra
function palabrasEscritas(pal){
  return pal.flatMap(p=>{const m=SEP_CAT.exec(p);return m?[m[1],m[2]]:[p]});
}
const esCifra=p=>/^\d+[a-z]?$/.test(p);
const esRelleno=p=>RELLENO_TITULO.has(p);

// ¿esta palabra escrita figura en el título (directamente o por su traducción)?
function encaja(p,conjunto){
  if(conjunto.has(p)) return true;
  return (ALIAS[p]||[]).some(a=>conjunto.has(a));
}

// Índice de obras: una entrada por obra (`w`), con las palabras de su título.
function indexar(obras,norm){
  const vistas=new Map();
  for(const o of obras) if(!vistas.has(o.w)) vistas.set(o.w,{w:o.w,c:o.c,ob:o.ob,pal:new Set(palabrasTitulo(o.ob,norm))});
  return [...vistas.values()];
}

// Busca en `pal` (palabras normalizadas) el trozo más largo que nombra una sola obra, sin tocar las palabras ya
// usadas (`usado[i]`). Devuelve {obra:{w,c,ob}, i, L} o null.
//   · `comp`: si hay compositor elegido o escrito, solo se consideran sus obras.
//   · El trozo no puede empezar ni acabar en una palabra de relleno, y debe llevar al menos dos palabras con
//     significado, y de ellas una cifra (o tres palabras): así «sonata» o «piano» sueltos no eligen obra.
function buscarObra(pal,usado,indice,{comp=''}={}){
  const cand=comp?indice.filter(o=>o.c===comp):indice;
  const n=pal.length;
  for(let L=Math.min(8,n);L>=2;L--){
    const halladas=[];
    for(let i=0;i+L<=n;i++){
      if(usado.slice(i,i+L).some(Boolean)) continue;
      if(esRelleno(pal[i])||esRelleno(pal[i+L-1])) continue;
      const sig=palabrasEscritas(pal.slice(i,i+L).filter(p=>!esRelleno(p)));
      if(sig.length<2||!(sig.some(esCifra)||sig.length>=3)) continue;
      if(sig.every(esCifra)) continue;                       // «1 2» no nombra una obra
      const m=cand.filter(o=>sig.every(p=>encaja(p,o.pal)));
      if(m.length===1) halladas.push({obra:m[0],i,L});
    }
    if(halladas.length===1) return halladas[0];
    // dos trozos del mismo largo («courante 2 suite inglesa 1»): el número va detrás del nombre («suite inglesa 1»)
    const natural=halladas.filter(h=>!esCifra(pal[h.i]));
    if(halladas.length&&natural.length===1) return natural[0];
    if(halladas.length) return null;
  }
  return null;
}

// Busca una familia de obras sin número («suite francesa»), que puede nombrar varias obras.
// Solo se acepta una frase suficientemente específica y un conjunto homogéneo de coincidencias.
function buscarFamiliaObras(pal,usado,indice,{comp=''}={}){
  const cand=comp?indice.filter(o=>o.c===comp):indice;
  for(let L=Math.min(8,pal.length);L>=2;L--){
    const halladas=[];
    for(let i=0;i+L<=pal.length;i++){
      if(usado.slice(i,i+L).some(Boolean)||esRelleno(pal[i])||esRelleno(pal[i+L-1])||esCifra(pal[i+L])) continue;
      const sig=palabrasEscritas(pal.slice(i,i+L).filter(p=>!esRelleno(p)));
      if(sig.some(esCifra)||sig.length<2||(!sig.some(p=>ALIAS[p])&&sig.length<3)) continue;
      const obras=cand.filter(o=>sig.every(p=>encaja(p,o.pal)));
      if(obras.length>1) halladas.push({obras,i,L,etiqueta:sig.join(' ')});
    }
    if(halladas.length===1) return halladas[0];
    if(halladas.length>1) return null;
  }
  return null;
}

// ---- movimientos de una obra: «allemande», «courante 2», «segundo movimiento», «n.º 5 Gute Nacht»
// Se buscan solo entre los movimientos de la obra ya identificada (o elegida), nunca en todo el corpus.
const MARCAS=new Set(['movimiento','movement','mov','mvt']);
const ORDINALES={primer:'1',primero:'1',primera:'1',first:'1',segundo:'2',segunda:'2',second:'2',tercer:'3',tercero:'3',tercera:'3',third:'3',
  cuarto:'4',cuarta:'4',fourth:'4',quinto:'5',quinta:'5',fifth:'5',sexto:'6',sexta:'6',sixth:'6'};
const ROMANOS=['','i','ii','iii','iv','v','vi','vii','viii','ix','x'];
Object.assign(ALIAS,{alemanda:['allemande'],giga:['gigue'],zarabanda:['sarabande'],minueto:['minuet','menuet'],gavota:['gavotte'],
  tema:['theme','thema'],variacion:['variation'],pasapie:['passepied'],burlesca:['burlesque']});

// Una entrada por movimiento (`m`), con las palabras de su rótulo («2. Allemande» → 2, allemande).
// `rotulo(o)` da el texto del movimiento de un registro.
function indexarMovimientos(obras,norm,rotulo){
  const out=new Map();
  for(const o of obras){
    if(out.has(o.m)) continue;
    const r=rotulo(o); if(!r||r==='—') continue;
    out.set(o.m,{m:o.m,w:o.w,rotulo:r,pal:new Set(palabrasTitulo(r,norm))});
  }
  return [...out.values()];
}
// «1» encaja con «1» y con «i» (Courante I); «ii» con «2»
function encajaMov(p,conjunto){
  if(encaja(p,conjunto)) return true;
  if(esCifra(p)&&ROMANOS[+p]&&conjunto.has(ROMANOS[+p])) return true;
  const r=ROMANOS.indexOf(p); return r>0&&conjunto.has(String(r));
}
// Busca en `pal` el trozo más largo que nombra un solo movimiento de `movs`. Un número solo (o un ordinal) se
// acepta únicamente acompañado de «movimiento»/«movement»: «segundo grupo temático» no elige el movimiento 2.
function buscarMovimiento(pal,usado,movs){
  const n=pal.length;
  for(let L=Math.min(4,n);L>=1;L--){
    for(let i=0;i+L<=n;i++){
      if(usado.slice(i,i+L).some(Boolean)) continue;
      const trozo=pal.slice(i,i+L);
      if(esRelleno(trozo[0])||esRelleno(trozo[L-1])) continue;
      const marca=trozo.some(p=>MARCAS.has(p));
      const sig=palabrasEscritas(trozo.filter(p=>!esRelleno(p)&&!MARCAS.has(p))).map(p=>ORDINALES[p]||p);
      if(!sig.length||(sig.every(esCifra)&&!marca)) continue;
      const m=movs.filter(x=>sig.every(p=>encajaMov(p,x.pal)));
      if(m.length===1) return {mov:m[0],i,L};
    }
  }
  return null;
}

const API={indexar,buscarObra,buscarFamiliaObras,palabrasTitulo,palabrasEscritas,indexarMovimientos,buscarMovimiento};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else raiz.ObrasTexto=API;
})(typeof globalThis!=='undefined'?globalThis:this);
