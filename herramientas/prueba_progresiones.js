// Pruebas de regresión de la búsqueda de progresiones (web/progresiones.js) sobre los datos reales de web/data.
//
//     node --test herramientas/prueba_progresiones.js
//
// No necesita navegador: usa las mismas funciones que la web sobre los mismos JSON.
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('fs'), path=require('path');
const P=require('../web/progresiones.js');

const WEB=path.join(__dirname,'..','web');
const OBRAS=JSON.parse(fs.readFileSync(path.join(WEB,'data/obras.json')));
const G={}; const grupo=g=>G[g]||(G[g]=JSON.parse(fs.readFileSync(path.join(WEB,`data/acordes/${g}.json`))));

// la misma búsqueda que buscarProgresion() en web/index.html, sin filtros de interfaz
function buscar(texto,opc={},filtro=()=>true){
  const Q=texto.split(/[\s,–—]+/).filter(Boolean).map(P.consulta);
  assert.ok(Q.every(Boolean),`consulta ilegible: ${texto}`);
  const out=[];
  for(const o of OBRAS){
    if(!filtro(o)) continue;
    const d=grupo(Math.floor(o.id/50)), crudo=d.obras[o.id]; if(!crudo) continue;
    const seq=P.secuencia(crudo,d.tonos);
    for(const r of P.buscarEnSecuencia(seq,Q,opc)){
      const tramo=seq.slice(r.i0,r.i1+1);
      out.push({obra:o.id,o,i0:r.i0,i1:r.i1,crudo,ini:tramo[0].a[0],parte:tramo[0].a[1],fin:tramo.at(-1).a[0],tono:d.tonos[tramo[0].t],
        tramo,etq:tramo.map(z=>z.a[3]).join(' → '),h:r.h,caja:r.caja});
    }
  }
  return out;
}
const K545_DCML=1868;   // Sonata K. 545, 1.er mov., análisis DCML (cc. 7–8: ii7 → V43 → I)
const enK545=o=>o.id===K545_DCML;
const c78=r=>r.ini===7&&r.fin===8;
// acordes del tramo que realmente cumplen cada consulta (los intermedios permitidos por «gap» no cuentan)
const cumplen=(r,texto,opc={})=>{const Q=texto.split(/\s+/).map(P.consulta);return r.tramo.filter(z=>Q.some(q=>P.coincide(z.c,q,opc)))};

// ---------- 1. el caso reportado ----------
test('ii – V – I encuentra Mozart K. 545, cc. 7–8 (ii7 → V43 → I)',()=>{
  const r=buscar('ii V I',{},enK545);
  const h=r.find(c78);
  assert.ok(h,'no aparece el pasaje de cc. 7–8');
  assert.equal(h.etq,'ii7 → V43 → I');
});
test('ii – V – I encuentra también ii6, ii7, iiø7, V7, V43… en el corpus',()=>{
  const etqs=new Set(buscar('ii V I').map(r=>r.etq));
  for(const e of ['ii → V → I','ii6 → V → I','ii7 → V7 → I','ii7 → V43 → I','ii65 → V7 → I']) assert.ok(etqs.has(e),`falta ${e}`);
  assert.ok([...etqs].some(e=>/^ii(%|ø)7 → V/.test(e)),'falta algún iiø7 → V…');
});

// ---------- 2. búsquedas específicas ----------
test('ii7 – V43 – I encuentra específicamente esa estructura en K. 545',()=>{
  const r=buscar('ii7 V43 I',{},enK545);
  assert.ok(r.find(c78));
  for(const x of buscar('ii7 V43 I')){
    assert.equal(x.tramo[0].c.tam,'sep'); assert.equal(x.tramo[0].c.inv,0);
    assert.ok(x.tramo.some(z=>z.c.grado==='v'&&z.c.tam==='sep'&&z.c.inv===2),x.etq);
  }
});
test('iiø7 – V43 – I no confunde el ii7 de K. 545 (séptima menor) con un semidisminuido',()=>{
  assert.equal(buscar('iiø7 V43 I',{},enK545).length,0);
  assert.deepEqual(buscar('ii%7 V43 I').map(r=>r.etq),buscar('iiø7 V43 I').map(r=>r.etq),'% y ø son lo mismo');
});
test('iiø7 – V – i encuentra semidisminuidos en menor, y solo semidisminuidos',()=>{
  const r=buscar('iiø7 V i');
  assert.ok(r.length>0);
  for(const x of r){ assert.equal(x.tramo[0].c.cal,'ø',x.etq); assert.equal(x.tramo[0].c.tam,'sep',x.etq) }
});

// ---------- 3. la inversión escrita filtra ----------
test('ii6 – V – I solo devuelve ii en primera inversión (tríada)',()=>{
  const r=buscar('ii6 V I');
  assert.ok(r.length>0);
  for(const x of r){ const c=x.tramo[0].c; assert.equal(c.grado,'ii'); assert.equal(c.inv,1,x.etq); assert.equal(c.tam,'tri',x.etq) }
  assert.ok(!buscar('ii6 V I',{},enK545).some(c78),'K. 545 cc. 7–8 es ii7, no ii6');
});
test('«ignorar inversiones» relaja la inversión pero no el tamaño del acorde',()=>{
  for(const x of buscar('ii6 V I',{sinInv:true})) assert.equal(x.tramo[0].c.tam,'tri',x.etq);
  assert.ok(buscar('V7 I',{sinInv:true}).some(x=>x.tramo[0].c.inv===2),'V7 con inversiones ignoradas debe admitir V43');
});

// ---------- 4. las búsquedas existentes siguen funcionando ----------
// Lo que antes era una coincidencia exacta sigue apareciendo (las búsquedas con cifras completas no cambian),
// salvo los pasajes que atravesaban un cambio de tonalidad local, que ahora se descartan a propósito.
const viejas=JSON.parse(fs.readFileSync(path.join(__dirname,'prueba_progresiones_base.json')));
for(const [texto,hits] of Object.entries(viejas)){
  test(`búsqueda anterior «${texto}»: no pierde resultados`,()=>{
    const nuevos=buscar(texto), porObra={};
    for(const x of nuevos) (porObra[x.obra]||=[]).push(x);
    // cada resultado anterior: [análisis, índice del primer acorde en web/data/acordes, 1 si cruzaba una modulación]
    const perdidos=hits.filter(([obra,j0])=>!(porObra[obra]||[]).some(x=>x.tramo.some(z=>z.a===x.crudo[j0])));
    assert.deepEqual(perdidos.filter(h=>!h[2]),[],'resultados perdidos');
    assert.ok(nuevos.length>=hits.filter(h=>!h[2]).length);
  });
}
test('las progresiones de ejemplo de la web dan resultados',()=>{
  for(const t of ['I IV V I','ii6 V7 I','I vi IV V','iv6 V','I6 ii6 V']) assert.ok(buscar(t).length>0,t);
});

// ---------- 5. alteraciones, modulaciones y dominantes secundarias ----------
test('V no coincide con V/V, V7/IV… ni ii con ii/V',()=>{
  for(const x of buscar('ii V I')) for(const z of cumplen(x,'ii V I')) assert.equal(z.c.sec,'',x.etq);
  const r=buscar('V/V V I');
  assert.ok(r.length>0);
  for(const x of r) assert.equal(x.tramo[0].c.sec,'V',x.etq);
});
test('♭VI no es VI, v no es V, II no es ii',()=>{
  for(const x of buscar('bVI V i')) assert.equal(x.tramo[0].c.acc,'b',x.etq);
  for(const x of buscar('VI V i')) assert.equal(x.tramo[0].c.acc,'',x.etq);
  for(const x of buscar('ii V I')) assert.ok(cumplen(x,'ii V I').every(z=>z.c.grado==='ii'?!z.c.mayus:z.c.mayus),x.etq);
  assert.equal(buscar('ii v i',{},enK545).length,0,'v e i minúsculas son acordes menores');
  for(const x of buscar('II V I')) assert.equal(x.tramo[0].c.mayus,true,x.etq);
});
test('una progresión no cruza un cambio de tonalidad local',()=>{
  for(const t of ['ii V I','I IV V I','iv6 V']) for(const x of buscar(t)) assert.equal(new Set(x.tramo.map(z=>z.t)).size,1,`${t}: ${x.etq}`);
  // c → C sobre la misma tónica (picarda) no es una modulación: V7 (do menor) → I (do mayor) se mantiene
  assert.ok(buscar('V7 I',{},o=>o.id===794).some(x=>x.ini===144));
});
test('el acorde de sexta cadencial solo cuenta cuando se pide',()=>{
  for(const x of buscar('ii V I')) assert.ok(!cumplen(x,'ii V I').some(z=>z.c.num==='Cad'),x.etq);
  assert.ok(buscar('Cad64 V I').length>0);
});
test('las alteraciones de lo escrito (#vii en menor) siguen la convención anterior',()=>{
  assert.equal(buscar('#viio7 i').length,buscar('viio7 i').length);
});

// ---------- 6. sin duplicados ----------
test('ningún pasaje aparece dos veces ni se solapa dentro de un mismo análisis',()=>{
  for(const t of ['ii V I','I IV V I','ii6 V7 I','V I','I V I']){
    // (algunos análisis de manual reúnen varios ejercicios que reinician la numeración de compases,
    //  así que el pasaje se identifica por su posición en la sucesión, no por el compás)
    const vistos=new Set(), fin={};
    for(const x of buscar(t,{gap:1})){
      const k=`${x.obra}|${x.i0}`;
      assert.ok(!vistos.has(k),`${t}: duplicado ${k}`); vistos.add(k);
      if(fin[x.obra]!==undefined) assert.ok(x.i0>fin[x.obra],`${t}: solapado en ${x.obra}`);
      fin[x.obra]=x.i1;
    }
  }
});

// ---------- unidad: lectura de cifrados ----------
test('analizar(): propiedades de los cifrados',()=>{
  const a=P.analizar;
  assert.deepEqual([a('ii7').tam,a('ii7').inv,a('ii7').cal],['sep',0,'']);
  assert.deepEqual([a('ii%7').cal,a('iiø7').cal],['ø','ø']);
  assert.deepEqual([a('V4/3').inv,a('V43').inv,a('V4/3').tam],[2,2,'sep']);
  assert.deepEqual([a('V7/V').sec,a('V65/V/IV').sec],['V','V/IV']);
  assert.equal(a('IVd7').tipo,'d'); assert.equal(a('IM7').tipo,'M'); assert.equal(a('Imaj7').tipo,'M');
  assert.deepEqual(a('V7[no5]').ext,['no5']);
  assert.equal(a('-VI').acc,'b');
  assert.equal(a('V').dig,''); assert.equal(a('V').inv,null);
  assert.equal(a('xyz'),null);
});

// ---------- «¿Querías decir…?»: variantes de mayúscula/minúscula ----------
test('conCaja() cambia solo el número romano',()=>{
  assert.equal(P.conCaja('v7',true),'V7'); assert.equal(P.conCaja('bVI6',false),'bvi6');
  assert.equal(P.conCaja('V65/v',true),'V65/v','la dominante secundaria no se toca');
  assert.equal(P.conCaja('Ger65',false),'Ger65');
});
test('ignorarCaja amplía la búsqueda sin cambiar la búsqueda normal',()=>{
  const estricta=buscar('ii v i'), amplia=buscar('ii v i',{ignorarCaja:true});
  assert.ok(amplia.length>estricta.length);
  assert.equal(buscar('ii v i',{},enK545).length,0,'v e i minúsculas siguen siendo acordes menores');
});
test('ii – v – i propone ii – V – I, que encuentra K. 545',()=>{
  const v=P.variantesCaja(['ii','v','i'],buscar('ii v i',{ignorarCaja:true}),2);
  assert.deepEqual(v[0],['ii','V','I']);
  assert.ok(buscar(v[0].join(' '),{},enK545).some(c78));
  const k=P.variantesCaja(['ii','v','i'],buscar('ii v i',{ignorarCaja:true},enK545),2);
  assert.deepEqual(k[0],['ii','V','I'],'también con el filtro de obra');
});
test('las variantes no repiten la progresión escrita',()=>{
  for(const t of ['ii V I','iv6 V']) for(const v of P.variantesCaja(t.split(' '),buscar(t,{ignorarCaja:true}),3)) assert.notEqual(v.join(' '),t);
});

test('sin cifra = estado fundamental (opción fund): «I6/4 V7 I» ya no acaba en I64', ()=>{
  const sin=buscar('I64 V7 I'), con=buscar('I64 V7 I',{fund:true});
  assert.ok(con.length>0&&con.length<sin.length, `${con.length} con fund, ${sin.length} sin`);
  // estado fundamental: I, I7, I[add9]… pero nunca I6, I64, I65, I43, I42
  for(const r of con){const ult=r.tramo.at(-1).a[3]; assert.ok(!/^I(6|64|65|43|42|2)\b/.test(ult)&&!/^I(6|64|65|43|42|2)(\[|\/|$)/.test(ult), `termina en ${ult}`)}
  assert.ok(sin.some(r=>/^I64/.test(r.tramo.at(-1).a[3])), 'sin la opción, «I» acepta I64');
});

test('en menor, «bVI» del analista es el VI de la escala: lo encuentra «VI V», no «bVI V»', ()=>{
  const tono=r=>grupo(Math.floor(r.obra/50)).tonos[r.tramo[0].a[2]], menor=r=>{const t=tono(r);return t[0]===t[0].toLowerCase()};
  assert.equal(buscar('bVI V').filter(menor).length, 0, '«bVI V» solo debe dar el préstamo en mayor');
  const vi=buscar('VI V').filter(r=>menor(r)&&/^bVI/.test(r.tramo[0].a[3]));
  assert.ok(vi.length>0, '«VI V» encuentra los VI que el analista escribió «bVI» en menor');
});
