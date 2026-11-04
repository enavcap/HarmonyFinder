// Pruebas de «Para empezar» (web/canonicos.js) sobre los datos reales de web/data.
//
//     node --test herramientas/prueba_canonicos.js
//
// Comprueban lo que se le pidió a la elección: ejemplos de compositores distintos, un solo Bach, nada al unísono,
// cadencias claras (sin terceras de Picardía ni cambios de modo en el cifrado) y resultados deterministas.
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('fs'), path=require('path');
const C=require('../web/canonicos.js');

const WEB=path.join(__dirname,'..','web');
const OBRAS=JSON.parse(fs.readFileSync(path.join(WEB,'data/obras.json')));
const porId=new Map(OBRAS.map(o=>[o.id,o]));
const info=h=>{const o=porId.get(h.obra);return {c:o.c,per:o.per,reconstruida:!!o.reconstruida,manual:/Textbooks/.test(o.col||'')}};
const gruposAc={};
const cargar=async obra=>{
  const g=Math.floor(obra/50);
  if(!gruposAc[g]){const d=JSON.parse(fs.readFileSync(path.join(WEB,`data/acordes/${g}.json`)));
    gruposAc[g]={tonos:d.tonos,obras:d.obras}}
  const d=gruposAc[g];
  return (d.obras[obra]||[]).map(a=>({compas:a[0],parte:a[1],tono:d.tonos[a[2]],rn:a[3],orig:a[4]||a[3],cad:a[5]||null,u:a[6]||0}));
};
const filasDe=k=>JSON.parse(fs.readFileSync(path.join(WEB,`data/hits/${k}.json`)))
  .map(h=>({obra:h[0],compas:h[1],parte:h[2],tono:h[3],etq:h[4],ini:h[5],fin:h[6],ctx:h[7]}));
const elegidos=async k=>{const pre=C.preseleccion(filasDe(k),k,info); return {pre,fin:await C.refinarPool(pre,cargar)}};

const CONCEPTOS=['cadencia_autentica_perfecta','cadencia_autentica_imperfecta','semicadencia','cadencia_plagal','cadencia_rota',
  'sexta_cuarta_cadencial','napolitana','sexta_napolitana','sexta_aumentada_alemana','sexta_aumentada_italiana','sexta_aumentada_francesa',
  'dominante_secundaria_resuelta','septima_disminuida','septima_de_dominante','modulacion_a_dominante','modulacion_a_relativo','pedal_de_dominante',
  'secuencia_quintas','intercambio_modal','tercera_picardia'];

test('alteraciones de la armadura',()=>{
  const t={C:0,a:0,G:1,e:1,F:1,d:1,'B-':2,g:2,'E-':3,c:3,'f#':3,D:2,A:3,E:4,'F#':6,'e-':6,'C#':7};
  for(const [k,v] of Object.entries(t)) assert.equal(C.alteraciones(k),v,k);
});

for(const k of CONCEPTOS){
  test(`${k}: hasta 4 ejemplos, compositores distintos, un solo J. S. Bach, ninguno al unísono`,async()=>{
    const {fin}=await elegidos(k);
    assert.ok(fin.length>=1&&fin.length<=4);
    const cs=fin.map(h=>porId.get(h.obra).c);
    assert.equal(new Set(cs).size,cs.length,'compositores repetidos: '+cs.join(' | '));
    assert.ok(cs.filter(c=>c==='Johann Sebastian Bach').length<=1);
    for(const h of fin) assert.ok(!(await cargar(h.obra)).filter(a=>a.compas>=h.ini&&a.compas<=h.fin).some(a=>a.u),`al unísono: obra ${h.obra} c.${h.ini}`);
  });
}

test('una cadencia con muchos resultados incluye un Bach y variedad de épocas',async()=>{
  const {fin}=await elegidos('cadencia_autentica_perfecta');
  assert.ok(fin.some(h=>porId.get(h.obra).c==='Johann Sebastian Bach'));
  assert.ok(new Set(fin.map(h=>porId.get(h.obra).per)).size>=2);
});

test('cadencia auténtica perfecta: cifrado limpio, tonalidad y cifrado del mismo modo',async()=>{
  const {fin}=await elegidos('cadencia_autentica_perfecta');
  for(const h of fin){
    assert.ok(!/\[/.test(h.etq),'etiqueta con notas añadidas: '+h.etq);
    const menor=h.tono===h.tono.toLowerCase(), fin_=h.etq.split(' · ')[0].split(' → ').pop();
    assert.ok(menor?!/^I(?![IVv])/.test(fin_):!/^i(?![v])/.test(fin_),`modo incoherente: ${h.tono} ${h.etq}`);
  }
});

test('pedal de dominante: los ejemplos son sobre todo acordes de dominante',async()=>{
  const {fin}=await elegidos('pedal_de_dominante');
  for(const h of fin){
    const t=h.etq.split(/\s+/).filter(Boolean), v=t.filter(x=>/^(V|Cad64|I64|i64)(?!\/)/.test(x)).length;
    assert.ok(v/t.length>=0.5,'poca dominante: '+h.etq);
  }
});

test('un ejemplo con acordes al unísono baja de puesto',async()=>{
  const cx=C.contexto([{ini:1,fin:2,etq:'V → I'}],'cadencia_autentica_perfecta');
  const h={obra:1,ini:1,fin:2,etq:'V → I',tono:'C',parte:1};
  const limpio=[{compas:1,parte:1,rn:'V',cad:0,u:0},{compas:2,parte:1,rn:'I',cad:'PAC',u:0}];
  const unison=limpio.map(a=>({...a,u:1}));
  assert.ok(C.refinar(h,limpio,cx)>C.refinar(h,unison,cx)+4);
});

test('la elección es determinista',async()=>{
  const a=(await elegidos('semicadencia')).fin.map(h=>h.obra+':'+h.ini).join();
  const b=(await elegidos('semicadencia')).fin.map(h=>h.obra+':'+h.ini).join();
  assert.equal(a,b);
});
