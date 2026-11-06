// Prueba de las reglas de notación (web/notacion.js): catálogo coherente y reglas XML que se pueden comprobar sin ojo.
//   · identificadores de regla únicos y con el formato N-XXX-n
//   · N-INI-1: un fragmento que empieza a mitad de obra muestra el compás; con la regla apagada, no
//   · N-INI-1: un fragmento que empieza en el primer compás no duplica la indicación de compás
//   · N-ALT-2: la alteración se escribe una vez por compás y se repite solo si cambia
// uso (con la web servida en http://localhost:8767/ y verovio-toolkit-wasm.js accesible):
//   node herramientas/prueba_notacion.js        variables: VEROVIO_JS, URL_WEB, CHROME
const { chromium } = require('playwright'); const fs = require('fs');
const VEROVIO = process.env.VEROVIO_JS || 'verovio-toolkit-wasm.js', URL = process.env.URL_WEB || 'http://localhost:8767/index.html';
let fallos = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA'), m); if (!c) fallos++ };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  await p.route(/googleapis|gstatic/, r => r.abort());
  await p.route(/jsdelivr/, r => r.fulfill({ body: fs.readFileSync(VEROVIO), contentType: 'application/javascript' }));
  await p.goto(URL); await p.waitForFunction(() => window.__prueba, null, { timeout: 60000 });
  const ids = await p.evaluate(() => Notacion.reglas.map(r => r.id));
  ok(ids.length > 0 && new Set(ids).size === ids.length && ids.every(i => /^N-[A-Z]+-\d+$/.test(i)), `catálogo: ${ids.length} reglas con identificador único (${ids.join(', ')})`);
  const doc = fs.existsSync(__dirname + '/../docs/NOTACION.md') ? fs.readFileSync(__dirname + '/../docs/NOTACION.md', 'utf8') : '';
  const sinDoc = ids.filter(i => !doc.includes('`' + i + '`'));
  ok(sinDoc.length === 0, `docs/NOTACION.md documenta todas las reglas del catálogo${sinDoc.length ? ' (faltan: ' + sinDoc.join(', ') + ')' : ''}`);
  const medidas = async h => {
    await p.evaluate(h => { __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, h);
    await p.waitForFunction(() => { const c = document.querySelector('#partitura'); return c && c.querySelector('svg g.cifrados') }, null, { timeout: 60000 });
    await p.waitForTimeout(200);
    return p.evaluate(() => ({ compases: document.querySelectorAll('#partitura svg g.meterSig').length, pentagramas: document.querySelector('#partitura svg g.measure').querySelectorAll(':scope > g.staff').length }));
  };
  const medio = { obra: 867, ini: 72, fin: 75, frag: true, tono: '', etq: '', compas: 72, parte: 1 };
  await p.evaluate(() => { Notacion.config.compasAlInicio = true });
  let r = await medidas(medio); ok(r.compases === r.pentagramas && r.pentagramas > 0, `a mitad de obra (Beethoven Op. 10/3, c. 72) con la regla: compás en los ${r.pentagramas} pentagramas (${r.compases})`);
  await p.evaluate(() => { Notacion.config.compasAlInicio = false });
  r = await medidas(medio); ok(r.compases === 0, `a mitad de obra con la regla apagada: sin compás (${r.compases})`);
  await p.evaluate(() => { Notacion.config.compasAlInicio = true });
  const inicio = { obra: 206, ini: 0, fin: 3, frag: true, tono: '', etq: '', compas: 0, parte: 1 };
  r = await medidas(inicio); ok(r.compases === r.pentagramas, `al principio de la obra (Suite inglesa 1, Allemande, c. 0): un solo compás por pentagrama (${r.compases} de ${r.pentagramas})`);
  // N-ALT-2: si♭ repetido dentro del compás, becuadro necesario, compás siguiente, acordes y voces distintas
  const nota = (paso, oct, alt, acc, extra = '', dur = 1) => `<note><pitch><step>${paso}</step>${alt ? `<alter>${alt}</alter>` : ''}<octave>${oct}</octave></pitch><duration>${dur}</duration><voice>1</voice><type>quarter</type>${acc ? `<accidental>${acc}</accidental>` : ''}${extra}<staff>1</staff></note>`;
  const xmlAlt = `<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key></attributes>
      ${nota('B', 4, -1, 'flat')}${nota('B', 4, -1, 'flat')}${nota('B', 4, 0, 'natural')}${nota('B', 4, -1, 'flat')}</measure>
    <measure number="2">${nota('B', 4, -1, 'flat')}${nota('B', 4, -1, 'flat')}${nota('B', 3, -1, 'flat')}${nota('B', 4, -1, 'flat', '', 1).replace('<accidental>flat</accidental>', '<accidental parentheses="yes">flat</accidental>')}</measure>
  </part></score-partwise>`;
  const salida = await p.evaluate(x => { const y = Notacion.alteracionesRedundantes(x); const d = new DOMParser().parseFromString(y, 'application/xml'); return [...d.querySelectorAll('measure')].map(m => [...m.querySelectorAll('note')].map(n => n.querySelector('accidental') ? n.querySelector('accidental').textContent + (n.querySelector('accidental').getAttribute('parentheses') ? '()' : '') : '-').join(' ')) }, xmlAlt);
  ok(salida[0] === 'flat - natural flat', `N-ALT-2: compás 1 (si♭, si♭ repetido, si♮, si♭): «${salida[0]}»`);
  ok(salida[1] === 'flat - flat flat()', `N-ALT-2: compás 2 (reinicia; otra octava la repite; la de precaución se conserva): «${salida[1]}»`);
  await p.evaluate(() => { Notacion.config.alteracionesUnaVez = false });
  const apagada = await p.evaluate(x => Notacion.alteracionesRedundantes(x) === x, xmlAlt);
  ok(apagada, 'N-ALT-2 apagada: el XML no cambia');
  await p.evaluate(() => { Notacion.config.alteracionesUnaVez = true });
  await b.close();
  console.log(fallos ? `${fallos} fallo(s)` : 'todo correcto'); process.exitCode = fallos ? 1 : 0;
})();
