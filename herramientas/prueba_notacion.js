// Prueba de las reglas de notación (web/notacion.js): catálogo coherente y reglas XML que se pueden comprobar sin ojo.
//   · identificadores de regla únicos y con el formato N-XXX-n; catálogo y docs/ESPECIFICACION_GRABADO_MUSICAL.md coinciden
//   · N-INI-1: un fragmento que empieza a mitad de obra muestra el compás; con la regla apagada, no
//   · N-INI-1: un fragmento que empieza en el primer compás no duplica la indicación de compás
//   · N-ALT-2: la alteración se escribe una vez por compás y se repite solo si cambia
//   · N-LIG-2: una ligadura de unión cruzada por una plica se retoca; si no cruza nada, no se toca
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
  // catálogo ↔ especificación (docs/ESPECIFICACION_GRABADO_MUSICAL.md): cada regla del código tiene ficha, y cada ficha, regla
  const esp = fs.readFileSync(__dirname + '/../docs/ESPECIFICACION_GRABADO_MUSICAL.md', 'utf8');
  const enEsp = new Set(esp.split('\n').filter(l => l.startsWith('#### ')).flatMap(l => l.match(/N-[A-Z]+-\d+/g) || []));
  const sinDoc = ids.filter(i => !enEsp.has(i)), sinCod = [...enEsp].filter(i => !ids.includes(i));
  ok(sinDoc.length === 0, `la especificación tiene una ficha para cada regla del catálogo${sinDoc.length ? ' (faltan: ' + sinDoc.join(', ') + ')' : ''}`);
  ok(sinCod.length === 0, `cada ficha de la especificación está en el catálogo del código${sinCod.length ? ' (faltan: ' + sinCod.join(', ') + ')' : ''}`);
  const medidas = async h => {
    await p.evaluate(h => { document.querySelector("#partitura").innerHTML = ""; __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, h);
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
  // N-PLICA-2: una dirección de plica por voz
  const nv = (paso, oct, voz, staff = 1, extra = '', dur = 2, tipo = 'half') => `<note><pitch><step>${paso}</step><octave>${oct}</octave></pitch><duration>${dur}</duration><voice>${voz}</voice><type>${tipo}</type>${extra}<staff>${staff}</staff><beam number="1">begin</beam></note>`;
  const env = m => `<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes>${m}</measure></part></score-partwise>`;
  const plicas = (x) => p.evaluate(x => { const y = Notacion.plicasPorVoz(x); const d = new DOMParser().parseFromString(y, 'application/xml'); return [...d.querySelectorAll('note')].map(n => (n.querySelector('voice').textContent + ':' + (n.querySelector('stem') ? n.querySelector('stem').textContent : '-'))).join(' ') }, x);
  // la voz grave se escribe antes que la aguda (como en muchas ediciones convertidas): la grave abajo, la aguda arriba
  ok(await plicas(env(nv('D', 3, 2) + nv('E', 3, 2) + '<backup><duration>4</duration></backup>' + nv('A', 4, 1) + nv('B', 4, 1))) === '2:down 2:down 1:up 1:up', 'N-PLICA-2: dos voces simultáneas, la aguda arriba y la grave abajo, venga en el orden que venga');
  // voces que no coinciden en el tiempo: no se toca nada
  ok(await plicas(env(nv('D', 3, 2) + '<forward><duration>2</duration></forward><backup><duration>4</duration></backup><forward><duration>2</duration></forward>' + nv('A', 4, 1))) === '2:- 1:-', 'N-PLICA-2: voces que no suenan a la vez: sin cambios');
  // la plica que ya traía el archivo se corrige y la que ya es correcta se deja
  ok(await plicas(env(nv('D', 3, 2, 1, '<stem>up</stem>') + '<backup><duration>2</duration></backup>' + nv('A', 4, 1, 1, '<stem>up</stem>'))) === '2:down 1:up', 'N-PLICA-2: corrige la plica errónea y respeta la correcta');
  // tres voces: solo las de los extremos
  ok(await plicas(env(nv('A', 4, 1) + '<backup><duration>2</duration></backup>' + nv('E', 4, 2) + '<backup><duration>2</duration></backup>' + nv('C', 3, 3))) === '1:up 2:up 3:down', 'N-PLICA-2/3: con tres voces, aguda arriba, grave abajo y la central arriba (LilyPond: voz 3 arriba)');
  // pentagramas distintos no se mezclan; la voz de otro pentagrama no cuenta
  ok(await plicas(env(nv('A', 4, 1, 1) + '<backup><duration>2</duration></backup>' + nv('C', 3, 1, 2))) === '1:- 1:-', 'N-PLICA-2: una sola voz por pentagrama: sin cambios');
  // la plica se inserta en el sitio que manda MusicXML (antes de staff/beam), para que el archivo siga siendo válido
  const orden = await p.evaluate(x => { const y = Notacion.plicasPorVoz(x); const d = new DOMParser().parseFromString(y, 'application/xml'); return [...d.querySelector('note').children].map(c => c.tagName).join(',') }, env(nv('D', 3, 2) + '<backup><duration>2</duration></backup>' + nv('A', 4, 1)));
  ok(/type,stem,staff,beam/.test(orden), `N-PLICA-2: <stem> va tras <type> y antes de <staff>/<beam> (${orden})`);
  await p.evaluate(() => { Notacion.config.plicasPorVoz = false });
  ok(await p.evaluate(x => Notacion.plicasPorVoz(x) === x, env(nv('D', 3, 2) + '<backup><duration>2</duration></backup>' + nv('A', 4, 1))), 'N-PLICA-2 apagada: el XML no cambia');
  await p.evaluate(() => { Notacion.config.plicasPorVoz = true });
  // N-LIG-3: ligaduras de unión por arriba (voz aguda) y por abajo (voz grave); en un acorde, solo la nota exterior
  const lig = '<notations><tied type="start"/></notations>';
  const notaAcorde = (paso, oct, voz) => `<note><chord/><pitch><step>${paso}</step><octave>${oct}</octave></pitch><duration>2</duration><voice>${voz}</voice><type>half</type><staff>1</staff>${lig}</note>`;
  const tied = x => p.evaluate(x => { const y = Notacion.plicasPorVoz(x); const d = new DOMParser().parseFromString(y, 'application/xml'); return [...d.querySelectorAll('note')].map(n => { const t = n.querySelector('tied'); return t ? (t.getAttribute('placement') || '-') + '/' + (t.getAttribute('orientation') || '-') : '·' }).join(' ') }, x);
  ok(await tied(env(nv('A', 4, 1, 1, lig) + '<backup><duration>2</duration></backup>' + nv('D', 3, 2, 1, lig))) === 'above/over below/under', 'N-LIG-3: voz aguda por arriba, voz grave por abajo');
  ok(await tied(env(nv('A', 4, 1, 1, lig) + notaAcorde('C', 5, 1) + '<backup><duration>2</duration></backup>' + nv('D', 3, 2, 1, lig) + notaAcorde('F', 3, 2))) === '-/- above/over below/under -/-', 'N-LIG-3: en un acorde solo la nota exterior (la más aguda en la voz aguda, la más grave en la grave)');
  await p.evaluate(() => { Notacion.config.ligadurasPorVoz = false; Notacion.config.plicasPorVoz = false });
  ok(await p.evaluate(x => Notacion.plicasPorVoz(x) === x, env(nv('A', 4, 1, 1, lig) + '<backup><duration>2</duration></backup>' + nv('D', 3, 2, 1, lig))), 'N-LIG-3 y N-PLICA-2 apagadas: el XML no cambia');
  await p.evaluate(() => { Notacion.config.ligadurasPorVoz = true; Notacion.config.plicasPorVoz = true });

  // N-LIG-2: una ligadura de unión que cruza una plica se acorta o se profundiza; una que no cruza nada no se toca
  const ligSvg = (tie, extra = '') => p.evaluate(([tie, extra]) => {
    const NS = 'http://www.w3.org/2000/svg', cont = document.createElementNS(NS, 'svg'); cont.setAttribute('width', 800); cont.setAttribute('height', 500);
    cont.innerHTML = `<g class="measure"><g class="staff"><path d="M0 100 L800 100"/><path d="M0 280 L800 280"/></g>${extra}<g class="tie"><path d="${tie}"/></g></g>`;
    document.body.append(cont);
    const r = Notacion.despejarLigaduras(cont), d = cont.querySelector('g.tie path').getAttribute('d'); cont.remove(); return [r, d];
  }, [tie, extra]);
  // una plica vertical en x=300 que corta el arco (de 100 a 500, y=200 a 235)
  const cruza = 'M100,200 C200,300 400,300 500,200 C400,260 200,260 100,200', plicaX = '<g class="stem"><path d="M300 150 L300 300"/></g>';
  let [cam, dd] = await ligSvg(cruza, plicaX);
  ok(cam === 1 && dd !== cruza, `N-LIG-2: una ligadura cruzada por una plica se retoca (${cam} cambiada)`);
  [cam, dd] = await ligSvg(cruza, '');
  ok(cam === 0 && dd === cruza, 'N-LIG-2: una ligadura que no cruza nada no se toca');
  await p.evaluate(() => { Notacion.config.ligadurasDespejadas = false });
  [cam, dd] = await ligSvg(cruza, plicaX);
  ok(cam === 0 && dd === cruza, 'N-LIG-2 apagada: la ligadura no cambia');
  await p.evaluate(() => { Notacion.config.ligadurasDespejadas = true });
  await b.close();
  console.log(fallos ? `${fallos} fallo(s)` : 'todo correcto'); process.exitCode = fallos ? 1 : 0;
})();
