// Pruebas del cifrado interválico (web/cifrado.js): sensible «+», disminuidos tachados, alteraciones y abreviaturas.
//
//     node --test herramientas/prueba_cifrado.js
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const C=require('../web/cifrado.js');
const T=C.TACHA, cif=(rn,tono)=>C.texto(C.cifras(rn,tono));

const CASOS=[
  // tríadas
  ['I','C','5'], ['I6','C','6'], ['I64','C','6/4'], ['V','C','+'], ['V64','C','+6/4'], ['Cad64','c','6/4'],
  ['viio','C','5'+T], ['viio6','C','+6'], ['IV','c','♮'], ['III+','c','+5'], ['bVI','C','♭5'],
  // séptima de dominante (Zamacois)
  ['V7','C','7+'], ['V65','C','6/5'+T], ['V43','C','+6'], ['V42','C','+4'], ['V2','C','+4'], ['V7','c','7+'],
  // dominantes secundarias: la sensible de la tonalidad tonicalizada
  ['V7/V','C','7+'], ['V65/V','C','6/5'+T], ['V7/iv','c','7+'],
  // séptima disminuida y semidisminuida
  ['viio7','C','7'+T+'/5'+T], ['viio65','C','+6/5'+T], ['viio43','c','+4/3'], ['viio42','c','4/+2'], ['viiø7','C','7/5'+T],
  // otras séptimas
  ['ii7','C','7'], ['ii65','C','6/5'], ['IVM7','C','7'], ['iiø65','c','6/5'],
  // napolitana y sextas aumentadas
  ['N6','c','♭6'], ['N','c','♭6'], ['N6','C','♭6/♭'], ['It6','C','♯6'], ['Ger65','c','♯6/5'], ['Ger65','C','♯6/♭5'], ['Fr43','C','♯6/4/3'],
];
for(const [rn,tono,esperado] of CASOS)
  test(`${rn} en ${tono} → ${esperado}`,()=>assert.equal(cif(rn,tono),esperado));

test('notas añadidas u omitidas no cambian el cifrado',()=>assert.equal(cif('V7[no5]','C'),'7+'));
test('lo que no sabe cifrar devuelve null (la web usa entonces el cifrado de siempre)',()=>{
  assert.equal(C.cifras('Ger43','C'),null);
  assert.equal(C.cifras('V9','C'),null);
  assert.equal(C.cifras('V','?'),null);
});
test('notas del acorde como music21: IV7 en mayor con 7.ª mayor, iv7 en mayor con 7.ª menor, IV7 en menor de dominante',()=>{
  const notas=(rn,t)=>C._acorde(rn,t).notas.map(n=>n.pc).sort((a,b)=>a-b).join(',');
  assert.equal(notas('IV7','C'),'0,4,5,9');
  assert.equal(notas('iv7','C'),'0,3,5,8');
  assert.equal(notas('IV7','d'),'2,5,7,11');
});
