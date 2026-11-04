// Prueba de alineación: los cifrados caen sobre los acordes de la partitura aunque el análisis cuente las partes en blancas.
//   · Beethoven, Op. 31 n.º 2, 1.er mov.: los análisis de When in Rome (927, 928, 930) cuentan 1, 1.5, 2, 2.5 en un 4/4;
//     el del DCML (929) cuenta 1, 2, 3, 4. Los cuatro deben dar cifrados sobre los mismos acordes.
//   · ningún silencio de una voz pisa la plica de otra (c. 191 de la misma sonata).
// uso (con la web servida en http://localhost:8767/ y verovio-toolkit-wasm.js en el directorio actual):
//   node herramientas/prueba_alineacion.js
// variables: VEROVIO_JS, URL_WEB, CHROME (como en auditoria_notacion.js)
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('node:assert/strict');
const VEROVIO = process.env.VEROVIO_JS || 'verovio-toolkit-wasm.js', URL = process.env.URL_WEB || 'http://localhost:8767/index.html';
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  await p.route(/googleapis|gstatic/, r => r.abort());
  await p.route(/jsdelivr/, r => r.fulfill({ body: fs.readFileSync(VEROVIO), contentType: 'application/javascript' }));
  await p.goto(URL); await p.waitForFunction(() => window.__prueba, null, { timeout: 60000 });
  // 1) escala de las partes
  const escalas = await p.evaluate(async () => { const P = __prueba, o = {};
    for (const id of [927, 928, 929, 930]) { const ob = P.porId.get(id), ac = await P.acordesDe(id); o[id] = P.alinear(P.estructura(ob.m, await P.xmlDe(ob)), ac, id, ob.f).escala || 1 }
    return o });
  assert.deepEqual(escalas, { 927: 2, 928: 2, 929: 1, 930: 2 }, 'escala de partes: ' + JSON.stringify(escalas));
  // 2) cada cifrado cae sobre un acorde: su x coincide (±1 espacio) con una cabeza de nota del mismo instante
  for (const id of [927, 929]) {
    await p.evaluate(h => { __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, { obra: id, ini: 191, fin: 193, frag: true, tono: '', etq: '', compas: 191, parte: 1 });
    await p.waitForFunction(() => document.querySelector('#partitura svg g.cifrados'), null, { timeout: 60000 }); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const svg = document.querySelector('#partitura svg');
      const x = e => { const r = e.getBoundingClientRect(); return (r.left + r.right) / 2 };
      const heads = [...svg.querySelectorAll('g.note g.notehead')].map(x), sp = svg.querySelector('g.notehead').getBoundingClientRect().height;
      const labs = [...svg.querySelectorAll('g.cifrados > g')].filter(g => g.getBoundingClientRect().top < svg.getBoundingClientRect().top + svg.getBoundingClientRect().height * 0.75).map(x);
      return { n: labs.length, lejos: labs.filter(l => !heads.some(h => Math.abs(h - l) < sp * 1.2)).length } });
    assert.ok(r.n >= 8, `obra ${id}: pocos cifrados (${r.n})`); assert.equal(r.lejos, 0, `obra ${id}: ${r.lejos} cifrados lejos de cualquier nota`);
    // 3) silencios y plicas
    const choques = await p.evaluate(() => { const svg = document.querySelector('#partitura svg'); let n = 0;
      for (const st of svg.querySelectorAll('g.measure > g.staff')) { const capas = [...st.querySelectorAll(':scope > g.layer')];
        capas.forEach((a, i) => capas.forEach((c, j) => { if (i === j) return;
          for (const r of a.querySelectorAll('g.rest')) { const rb = r.getBoundingClientRect(); if (rb.width < 1) continue;
            for (const s of c.querySelectorAll('g.stem')) { const sb = s.getBoundingClientRect(); if (sb.height > 1 && sb.left < rb.right - 1 && sb.right + 1 > rb.left + 1 && sb.top < rb.bottom - 1 && sb.bottom > rb.top + 1) n++ } } })) }
      return n });
    assert.equal(choques, 0, `obra ${id}: ${choques} silencios sobre plicas`);
  }
  console.log('alineación OK'); await b.close();
})().catch(e => { console.error(e.message); process.exit(1) });
