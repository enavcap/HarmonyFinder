// Prueba de las reglas de notación (web/notacion.js): catálogo coherente y reglas XML que se pueden comprobar sin ojo.
//   · identificadores de regla únicos y con el formato N-XXX-n
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
  ok(await plicas(env(nv('A', 4, 1) + '<backup><duration>2</duration></backup>' + nv('E', 4, 2) + '<backup><duration>2</duration></backup>' + nv('C', 3, 3))) === '1:up 2:- 3:down', 'N-PLICA-2: con tres voces, aguda arriba, grave abajo y la intermedia como la resuelva el grabador');
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

  // N-CRUCE-1, N-VOC-1, N-VOC-2 (reconstrucciones): divisiones 4 (semicorchea = 1), compás de 4/4
  const FIG = { 16: ['whole', 0], 12: ['half', 1], 8: ['half', 0], 6: ['quarter', 1], 4: ['quarter', 0], 3: ['eighth', 1], 2: ['eighth', 0], 1: ['16th', 0] };
  const nr = (alt, dur, voz, staff = 1) => { const [ti, pu] = FIG[dur]; const cab = alt ? `<pitch><step>${alt[0]}</step><octave>${alt[1]}</octave></pitch>` : '<rest/>'; return `<note>${cab}<duration>${dur}</duration><voice>${voz}</voice><type>${ti}</type>${'<dot/>'.repeat(pu)}<staff>${staff}</staff></note>` };
  const atras = '<backup><duration>16</duration></backup>';
  const gran = m => `<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>${m}</measure></part></score-partwise>`;
  // resumen del resultado: voces con notas por pentagrama y tiempo que suena cada altura (las notas ligadas suman)
  const voces = x => p.evaluate(x => {
    const y = Notacion.vocesReconstruidas(x), d = new DOMParser().parseFromString(y, 'application/xml'), porSt = {}, suena = {}; let t = 0, ult = 0;
    for (const e of d.querySelector('measure').children) {
      const du = +(e.querySelector(':scope > duration') || { textContent: 0 }).textContent;
      if (e.tagName === 'backup') { t -= du; continue } if (e.tagName === 'forward') { t += du; continue } if (e.tagName !== 'note') continue;
      const ch = !!e.querySelector(':scope > chord'); if (ch) t -= ult;
      const pi = e.querySelector(':scope > pitch'), st = e.querySelector(':scope > staff').textContent;
      if (pi) { (porSt[st] = porSt[st] || new Set()).add(e.querySelector(':scope > voice').textContent); const k = pi.querySelector('step').textContent + pi.querySelector('octave').textContent + '@' + st; suena[k] = (suena[k] || 0) + du }
      t += du; ult = du;
    }
    return { igual: y === x, capas: Object.fromEntries(Object.entries(porSt).map(([k, v]) => [k, v.size])), suena };
  }, x);
  // una voz que entra mientras las otras se sostienen, sin atacar ninguna nota a la vez: la5 redonda, mi5 blanca y do#5 que entra una corchea después
  const brise = gran(nr(['A', 5], 16, 1) + atras + nr(['E', 5], 8, 2) + nr(null, 8, 2) + atras + nr(null, 2, 3) + nr(['C', 5], 6, 3) + nr(null, 8, 3) + atras + nr(['A', 2], 16, 5, 2));
  let rv = await voces(brise);
  ok(rv.capas['1'] === 2 && rv.suena['A5@1'] === 16 && rv.suena['E5@1'] === 8 && rv.suena['C5@1'] === 6, `N-VOC-1: tres voces que entran escalonadas quedan en dos capas con la misma duración sonora (${JSON.stringify(rv.capas)} · ${JSON.stringify(rv.suena)})`);
  // una línea real de semicorcheas entre dos notas largas: absorberla pediría 15 ligaduras; se deja en su capa (como la edición, Allemande cc. 6-7)
  const linea = ['B', 'A', 'G', 'A', 'B', 'C', 'B', 'A', 'G', 'A', 'B', 'A', 'G', 'F', 'G', 'A'].map((s, i) => nr([s, s === 'C' ? 5 : 4], 1, 2)).join('');
  rv = await voces(gran(nr(['E', 5], 16, 1) + atras + linea + atras + nr(['E', 4], 16, 3) + atras + nr(['A', 2], 16, 5, 2)));
  ok(rv.capas['1'] === 3, `N-VOC-1: una línea melódica real no se convierte en acordes ligados (${rv.capas['1']} capas)`);
  // N-CRUCE-1: la3 a la vez que la5 en la mano derecha (dos octavas) pasa a la izquierda, donde cabe sobre el do3
  rv = await voces(gran(nr(['A', 5], 16, 1) + atras + nr(['A', 3], 16, 2) + atras + nr(['C', 3], 16, 5, 2)));
  ok(rv.suena['A3@2'] === 16 && !rv.suena['A3@1'], `N-CRUCE-1: una voz que su mano no alcanza pasa al pentagrama de la otra (${JSON.stringify(rv.suena)})`);
  // un tenor que la mano izquierda alcanza (la3 sobre si2) se queda abajo
  rv = await voces(gran(nr(['A', 4], 16, 1) + atras + nr(['E', 4], 16, 2) + atras + nr(['A', 3], 16, 5, 2) + atras + nr(['B', 2], 16, 6, 2)));
  ok(rv.igual, 'N-CRUCE-1: voces que cada mano alcanza: sin cambios');
  // N-VOC-2: mi4 atacado a la vez en las dos manos: se queda el más largo
  rv = await voces(gran(nr(['A', 4], 16, 1) + atras + nr(['E', 4], 4, 2) + nr(null, 12, 2) + atras + nr(['E', 4], 8, 5, 2) + nr(null, 8, 5, 2) + atras + nr(['A', 3], 16, 6, 2)));
  ok(rv.suena['E4@2'] === 8 && !rv.suena['E4@1'], `N-VOC-2: un unísono entre manos se escribe una vez (${JSON.stringify(rv.suena)})`);
  // N-VOC-3: arpegio sostenido como lo trae el DCML (semicorcheas mi5-do#5 en una voz y mi5 con puntillo en otra, que atacan a la
  // vez): no se funde en acordes y la voz que sostiene lleva la plica contraria a la del arpegio
  const arpegio = gran(nr(['A', 5], 16, 1) + atras + nr(null, 1, 2) + nr(['E', 5], 3, 2) + nr(null, 12, 2) + atras + nr(null, 1, 3) + nr(['E', 5], 1, 3) + nr(['C', 5], 1, 3) + nr(null, 1, 3) + nr(null, 12, 3) + atras + nr(['A', 2], 16, 5, 2));
  rv = await voces(arpegio);
  ok(rv.capas['1'] === 3, `N-VOC-1: las voces de un arpegio sostenido no se funden en acordes ligados (${rv.capas['1']} capas)`);
  const plUn = await p.evaluate(x => { const y = Notacion.plicasUnisono(x.replace(/<staff>1<\/staff>/g, '<stem>down</stem><staff>1</staff>')); const d = new DOMParser().parseFromString(y, 'application/xml'); return [...d.querySelectorAll('note')].filter(n => n.querySelector('pitch') && n.querySelector('staff').textContent === '1').map(n => n.querySelector('voice').textContent + ':' + n.querySelector('stem').textContent).join(' ') }, arpegio);
  ok(plUn === '1:down 2:up 3:down 3:down', `N-VOC-3: la voz que sostiene la nota compartida pasa a la plica contraria (${plUn})`);
  // en la Allemande dibujada, el mi5 con puntillo y el do#5 en corchea del c. 2 (y el la3 y do#4 de la izquierda del c. 1)
  // comparten la cabeza con las semicorcheas del arpegio
  await p.evaluate(h => { __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, { obra: 206, ini: 0, fin: 3, frag: true, tono: '', etq: '', compas: 0, parte: 1 });
  await p.waitForFunction(() => { const c = document.querySelector('#partitura'); return c && c.querySelector('svg g.cifrados') }, null, { timeout: 60000 });
  const compartidas = await p.evaluate(() => document.querySelectorAll('#partitura svg [data-n-voc3]').length);
  ok(compartidas >= 2, `N-VOC-3: Allemande, cc. 0-3: ${compartidas} unísonos con puntillo distinto llevados a una cabeza (mi5 del c. 2, la3 del c. 1; los de figura igual ya los junta Verovio)`);
  await p.evaluate(() => Object.assign(Notacion.config, { vocesPorRegistro: false, dosCapas: false, unisonosUnaVez: false }));
  ok((await voces(brise)).igual, 'N-VOC-1, N-VOC-2 y N-CRUCE-1 apagadas: el XML no cambia');
  await p.evaluate(() => Object.assign(Notacion.config, { vocesPorRegistro: true, dosCapas: true, unisonosUnaVez: true }));
  await b.close();
  console.log(fallos ? `${fallos} fallo(s)` : 'todo correcto'); process.exitCode = fallos ? 1 : 0;
})();
