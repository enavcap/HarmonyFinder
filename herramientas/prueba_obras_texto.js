// Pruebas del reconocimiento de una obra dentro del texto del buscador (web/obras_texto.js), con los datos reales.
//
//     node --test herramientas/prueba_obras_texto.js
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('fs'), path=require('path');
const O=require('../web/obras_texto.js');

const OBRAS=JSON.parse(fs.readFileSync(path.join(__dirname,'..','web','data','obras.json'),'utf8'));
// misma normalización que web/index.html
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[,;.:]/g,' ').replace(/\s+/g,' ');
const INDICE=O.indexar(OBRAS,norm);
const BACH='Johann Sebastian Bach';
const buscar=(texto,comp='')=>{
  const pal=norm(texto).trim().split(' ').filter(Boolean);
  const r=O.buscarObra(pal,pal.map(()=>false),INDICE,{comp});
  return r&&{titulo:r.obra.ob,compositor:r.obra.c,trozo:pal.slice(r.i,r.i+r.L).join(' ')};
};
const buscarFamilia=(texto,comp='')=>{
  const pal=norm(texto).trim().split(' ').filter(Boolean);
  const r=O.buscarFamiliaObras(pal,pal.map(()=>false),INDICE,{comp});
  return r&&{obras:r.obras,etiqueta:r.etiqueta,trozo:pal.slice(r.i,r.i+r.L).join(' ')};
};

test('la obra del ejemplo: «suite inglesa 1» con Bach',()=>{
  const r=buscar('dominante de la dominante en suite inglesa 1 de',BACH);
  assert.equal(r.titulo,'English Suite No. 1');
  assert.equal(r.trozo,'suite inglesa 1');
});
test('también en inglés, con «n.º» y sin compositor si la obra es única',()=>{
  assert.equal(buscar('english suite no. 1').titulo,'English Suite No. 1');
  assert.equal(buscar('suite inglesa n.º 3',BACH).titulo,'English Suite No. 3');
  assert.equal(buscar('suite francesa 5',BACH).titulo,'French Suite No. 5');
});
test('una familia de obras en español o inglés se reconoce sin inventar un número',()=>{
  const familia=buscarFamilia('suite francesa');
  assert.equal(familia.etiqueta,'suite francesa');
  assert.equal(familia.trozo,'suite francesa');
  assert.equal(new Set(familia.obras.map(o=>o.w)).size,6);
  assert(familia.obras.every(o=>o.c===BACH&&o.ob.startsWith('French Suite No.')));
  assert.equal(buscarFamilia('french suite').obras.length,6);
  assert.equal(buscarFamilia('suites francesas').obras.length,6);
  assert.equal(buscarFamilia('french suites').obras.length,6);
  assert.equal(buscarFamilia('suite francesa', 'Wolfgang Amadeus Mozart'),null);
  assert.equal(buscarFamilia('suite francesa 1'),null);
  assert.equal(buscar('suite francesa 1').titulo,'French Suite No. 1');
});
test('números de catálogo: K., Op. y la sigla pegada al número',()=>{
  assert.equal(buscar('sonata k 331 de mozart').titulo,'Sonata para piano, K. 331');
  assert.equal(buscar('sonata k331').titulo,'Sonata para piano, K. 331');
  assert.equal(buscar('cuarteto op 59 n.º 1','Ludwig van Beethoven').titulo,'Cuarteto de cuerda, Op. 59 No. 1');
  assert.equal(buscar('string quartet op59 no 1','Ludwig van Beethoven').titulo,'Cuarteto de cuerda, Op. 59 No. 1');
  assert.equal(buscar('mazurca op 33 2','Frédéric Chopin').titulo,'Mazurka in D major, Op. 33 No. 2');
});
test('el número debe coincidir exactamente («Op. 18 n.º 1» no es «Op. 18 n.º 11»)',()=>{
  assert.equal(buscar('cuarteto op 18 1','Ludwig van Beethoven').titulo,'Cuarteto de cuerda, Op. 18 No. 1');
});
test('títulos con cifra pegada («Partita No2, BWV1004»)',()=>{
  assert.equal(buscar('partita 2 bwv 1004',BACH).titulo,'Partita No2, BWV1004');
});
test('ambiguo → no se adivina',()=>{
  assert.equal(buscar('suite 1'),null);                         // hay varias «Suite n.º 1»
  assert.equal(buscar('suite 1',BACH),null);                    // inglesa, francesa, violonchelo…
  assert.equal(buscarFamilia('suite'),null);
});
test('lo que no es una obra no la elige',()=>{
  assert.equal(buscar('dominante de la dominante',BACH),null);
  assert.equal(buscar('sonata',BACH),null);
  assert.equal(buscar('ii6 v7 i',BACH),null);
  assert.equal(buscar('sexta napolitana en re menor',BACH),null);
});
test('no usa palabras ya consumidas por otros filtros',()=>{
  const pal=norm('suite inglesa 1').split(' ');
  assert.equal(O.buscarObra(pal,[false,true,false],INDICE,{comp:BACH}),null);
});
test('una obra de otro compositor no se elige si hay compositor distinto',()=>{
  assert.equal(buscar('suite inglesa 1','Wolfgang Amadeus Mozart'),null);
});

// ---- movimientos
const movDe=o=>{const r=o.t.slice(o.ob.length).replace(/^ · /,'');return r||'—'};
const MOVS=O.indexarMovimientos(OBRAS,norm,movDe);
const movsDe=w=>MOVS.filter(x=>x.w===w);
const buscarMov=(texto,w)=>{
  const pal=norm(texto).trim().split(' ').filter(Boolean);
  const r=O.buscarMovimiento(pal,pal.map(()=>false),movsDe(w));
  return r&&{rotulo:r.mov.rotulo,trozo:pal.slice(r.i,r.i+r.L).join(' ')};
};
const SUITE1=121, SONATA_K331=INDICE.find(o=>o.ob==='Sonata para piano, K. 331').w, WINTERREISE=INDICE.find(o=>o.ob==='Winterreise, D.911').w;

test('movimiento por nombre, en español o inglés',()=>{
  assert.equal(buscarMov('dominante secundaria en la allemande',SUITE1).rotulo,'2. Allemande');
  assert.equal(buscarMov('alemanda',SUITE1).rotulo,'2. Allemande');
  assert.equal(buscarMov('preludio',SUITE1).rotulo,'1. Prelude');
  assert.equal(buscarMov('giga',SUITE1).rotulo,'10. Gigue');
  assert.equal(buscarMov('zarabanda',SUITE1).rotulo,'7. Sarabande');
});
test('«courante 2» distingue Courante I y II; «courante» a secas es ambiguo',()=>{
  assert.equal(buscarMov('courante 1',SUITE1).rotulo,'3. Courante I');
  assert.equal(buscarMov('courante 2',SUITE1).rotulo,'4. Courante II');
  assert.equal(buscarMov('courante ii',SUITE1).rotulo,'4. Courante II');
  assert.equal(buscarMov('courante',SUITE1),null);
});
test('movimiento por número: solo con la palabra «movimiento»',()=>{
  assert.equal(buscarMov('segundo movimiento',SONATA_K331).rotulo,'2');
  assert.equal(buscarMov('movimiento 3',SONATA_K331).rotulo,'3');
  assert.equal(buscarMov('3rd movement',SONATA_K331)?.rotulo??null,null);   // «3rd» no se reconoce: no se adivina
  assert.equal(buscarMov('first movement',SONATA_K331).rotulo,'1');
  assert.equal(buscarMov('segundo grupo temático',SONATA_K331),null);       // el 2 de «segundo grupo» no es un movimiento
  assert.equal(buscarMov('en 2',SONATA_K331),null);
});
test('rótulos con nombre propio (Winterreise)',()=>{
  assert.equal(buscarMov('gute nacht',WINTERREISE).rotulo,'1. Gute Nacht');
  assert.equal(buscarMov('n.º 1 gute nacht',WINTERREISE).rotulo,'1. Gute Nacht');
});
test('no usa palabras ya consumidas',()=>{
  const pal=norm('segundo movimiento').split(' ');
  assert.equal(O.buscarMovimiento(pal,[true,false],movsDe(SONATA_K331)),null);
});

test('dos obras posibles en el mismo texto: el número va detrás del nombre',()=>{
  const r=buscar('courante 2 suite inglesa 1',BACH);
  assert.equal(r.titulo,'English Suite No. 1');
  assert.equal(r.trozo,'suite inglesa 1');
});
