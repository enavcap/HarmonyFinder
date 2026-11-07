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
  const cruceUnisono = await p.evaluate(async () => {
    const obra = __prueba.OBRAS.find(o => o.id === 206);
    const d = new DOMParser().parseFromString(await __prueba.textoDe(obra), 'application/xml');
    for (const id of ['voces-a-su-mano', 'notas-al-otro-pentagrama', 'dos-capas', 'voces-condensadas'])
      Notacion.transformaciones.find(t => t.id === id).aplicar(d);
    const eventos = () => {
      const m = [...d.querySelectorAll('part > measure')].find(x => x.getAttribute('number') === '2');
      let t = 0, ultimo = 0; const notas = [];
      for (const e of m.children) {
        const dur = +(e.querySelector('duration')?.textContent || 0);
        if (e.tagName === 'backup') { t -= dur; continue }
        if (e.tagName === 'forward') { t += dur; continue }
        if (e.tagName !== 'note') continue;
        const acorde = !!e.querySelector('chord'); if (acorde) t = ultimo;
        const p = e.querySelector('pitch');
        if (p && t === 10080 && p.querySelector('step').textContent === 'A' &&
          +(p.querySelector('alter')?.textContent || 0) === 0 && p.querySelector('octave').textContent === '4')
          notas.push({ origen: e.getAttribute('data-hf-casa') || e.querySelector('staff').textContent, staff: e.querySelector('staff').textContent, dur });
        if (!acorde) { ultimo = t; t += dur }
      }
      return notas;
    };
    const antes = eventos();
    Notacion.transformaciones.find(t => t.id === 'unisono-entre-manos').aplicar(d);
    return { antes, despues: eventos() };
  });
  ok(cruceUnisono.antes.length === 2 && cruceUnisono.antes.every(n => n.staff === '1') &&
    new Set(cruceUnisono.antes.map(n => n.origen)).size === 2,
    `N-VOC-2: BWV 806, Allemande, c. 3: identifica el unísono tras el cruce (${JSON.stringify(cruceUnisono.antes)})`);
  ok(cruceUnisono.despues.length === 2 && cruceUnisono.despues.every(n => n.dur > 0),
  `N-VOC-2: conserva ambas notas mientras una forma parte de una ligadura (${JSON.stringify(cruceUnisono.despues)})`);
  const unisonoCruzado = await p.evaluate(() => {
    const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><staves>2</staves></attributes><note data-hf-casa="1"><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><backup><duration>4</duration></backup><note data-hf-casa="2"><pitch><step>A</step><octave>4</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>1</staff></note></measure></part></score-partwise>`;
    const d = new DOMParser().parseFromString(xml, 'application/xml');
    const cambios = Notacion.transformaciones.find(t => t.id === 'unisono-entre-manos').aplicar(d);
    return { cambios, notas: [...d.querySelectorAll('note')].map(e => ({
      origen: e.getAttribute('data-hf-casa'), dur: +(e.querySelector('duration')?.textContent || 0)
    })) };
  });
  ok(unisonoCruzado.cambios === 1 && unisonoCruzado.notas.length === 1 &&
    unisonoCruzado.notas[0].origen === '2' && unisonoCruzado.notas[0].dur === 8,
  `N-VOC-2: tras el cruce, conserva la nota más larga según el pentagrama de origen (${JSON.stringify(unisonoCruzado)})`);
  // opciones de Verovio dentro de sus rangos (un valor fuera de rango se rechaza en silencio: leftMarginAccid 2,2 hasta la 0.8.9)
  const fueraDeRango = await p.evaluate(() => {
    const tk = new verovio.toolkit(), av = tk.getAvailableOptions(), todos = {};
    for (const g of Object.values(av.groups || av)) Object.assign(todos, g.options || {});
    return Object.entries(Notacion.opciones).filter(([k, v]) => !todos[k] || (typeof v === 'number' && ((todos[k].min !== undefined && v < todos[k].min) || (todos[k].max !== undefined && v > todos[k].max)))).map(([k, v]) => k + '=' + v);
  });
  ok(fueraDeRango.length === 0, `todas las opciones de Notacion.opciones existen en Verovio y están dentro de su rango${fueraDeRango.length ? ' (fuera: ' + fueraDeRango.join(', ') + ')' : ''}`);
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
  ok(await tied(env(nv('A', 4, 1, 1, lig) + notaAcorde('C', 5, 1) + '<backup><duration>2</duration></backup>' + nv('D', 3, 2, 1, lig) + notaAcorde('F', 3, 2))) === 'above/over above/over below/under below/under', 'N-LIG-3: en un acorde, todas las notas de la voz del lado de su plica (también las interiores)');
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
  ok(rv.capas['1'] === 3 && rv.suena['A5@1'] === 16 && rv.suena['E5@1'] === 8 && rv.suena['C5@1'] === 6, `N-VOC-1: tres voces que entran escalonadas no se parten en trozos ligados: cada una conserva su figura (${JSON.stringify(rv.capas)} · ${JSON.stringify(rv.suena)})`);
  await p.evaluate(() => { Notacion.config.trozosLigados = true });
  rv = await voces(brise);
  ok(rv.capas['1'] === 2 && rv.suena['A5@1'] === 16 && rv.suena['E5@1'] === 8 && rv.suena['C5@1'] === 6, `N-VOC-1 con CONFIG.trozosLigados: quedan en dos capas con la misma duración sonora (${JSON.stringify(rv.capas)})`);
  await p.evaluate(() => { Notacion.config.trozosLigados = false });
  // una línea real de semicorcheas entre dos notas largas: absorberla pediría 15 ligaduras; se deja en su capa (como la edición, Allemande cc. 6-7)
  const linea = ['B', 'A', 'G', 'A', 'B', 'C', 'B', 'A', 'G', 'A', 'B', 'A', 'G', 'F', 'G', 'A'].map((s, i) => nr([s, s === 'C' ? 5 : 4], 1, 2)).join('');
  rv = await voces(gran(nr(['E', 5], 16, 1) + atras + linea + atras + nr(['E', 4], 16, 3) + atras + nr(['A', 2], 16, 5, 2)));
  ok(rv.capas['1'] === 3, `N-VOC-1: una línea melódica real no se convierte en acordes ligados (${rv.capas['1']} capas)`);
  // N-CRUCE-1: la3 a la vez que la5 en la mano derecha (dos octavas) pasa a la izquierda, donde cabe sobre el do3
  rv = await voces(gran(nr(['A', 5], 16, 1) + atras + nr(['A', 3], 16, 2) + atras + nr(['C', 3], 16, 5, 2)));
  ok(rv.suena['A3@2'] === 16 && !rv.suena['A3@1'], `N-CRUCE-1: una voz que su mano no alcanza pasa al pentagrama de la otra (${JSON.stringify(rv.suena)})`);
  // si el otro pentagrama solo tiene un silencio, no hay una voz con la que justificar el cambio de mano
  rv = await voces(gran(nr(['A', 5], 16, 1) + atras + nr(['A', 3], 16, 2) + atras + nr(null, 16, 5, 2)));
  ok(rv.suena['A3@1'] === 16 && !rv.suena['A3@2'], `N-CRUCE-1: conserva la voz en su pentagrama si el otro está en silencio (${JSON.stringify(rv.suena)})`);
  const gigaBWV812 = await p.evaluate(async () => {
    const obra = __prueba.OBRAS.find(o => o.id === 282);
    const d = new DOMParser().parseFromString(Notacion.vocesReconstruidas(await __prueba.textoDe(obra)), 'application/xml');
    const m = [...d.querySelectorAll('part > measure')].find(x => x.getAttribute('number') === '2');
    const notas = [...m.querySelectorAll('note')].filter(n => n.querySelector(':scope > pitch'));
    const interiores = notas.filter(n => ['F4', 'E4', 'D4', 'C4', 'G4'].includes(n.querySelector(':scope > pitch > step').textContent + n.querySelector(':scope > pitch > octave').textContent));
    return { interiores: interiores.map(n => n.querySelector(':scope > staff').textContent), bajo: notas.filter(n => n.querySelector(':scope > staff').textContent === '2').length };
  });
  ok(gigaBWV812.interiores.length === 6 && gigaBWV812.interiores.every(s => s === '1') && gigaBWV812.bajo === 0,
    `N-CRUCE-1: BWV 812, Gigue, c. 2: mantiene la línea interior en el pentagrama superior y el inferior en silencio (${JSON.stringify(gigaBWV812)})`);
  const gigaBWV812Barras = await p.evaluate(async () => {
    const obra = __prueba.OBRAS.find(o => o.id === 282);
    const d = new DOMParser().parseFromString(await __prueba.xmlDe(obra), 'application/xml');
    const m = [...d.querySelectorAll('part > measure')].find(x => x.getAttribute('number') === '3');
    let t = 0, ultimaDur = 0;
    const notas = [];
    for (const e of m.children) {
      const dur = +(e.querySelector(':scope > duration')?.textContent || 0);
      if (e.tagName === 'backup') { t -= dur; continue }
      if (e.tagName === 'forward') { t += dur; continue }
      if (e.tagName !== 'note') continue;
      const acorde = !!e.querySelector(':scope > chord');
      if (acorde) t -= ultimaDur;
      const pitch = e.querySelector(':scope > pitch');
      if (pitch) notas.push({
        t, nombre: pitch.querySelector(':scope > step').textContent + pitch.querySelector(':scope > octave').textContent,
        staff: e.querySelector(':scope > staff').textContent,
        beam: [...e.querySelectorAll(':scope > beam')].map(b => b.getAttribute('number') + ':' + b.textContent)
      });
      if (!acorde) { ultimaDur = dur; t += dur }
    }
    return {
      re4: notas.filter(n => n.t === 10080 && n.nombre === 'D4'),
      la4: notas.filter(n => n.t === 17640 && n.nombre === 'A3')
    };
  });
  ok(gigaBWV812Barras.re4.length === 2 && gigaBWV812Barras.re4.some(n => n.staff === '2' && n.beam.includes('1:begin')) &&
    gigaBWV812Barras.la4.some(n => n.staff === '2' && n.beam.includes('1:end')),
    `N-VOC-2: BWV 812, Gigue, c. 3: conserva el re4 del bajo para completar su barra con la3 (${JSON.stringify(gigaBWV812Barras)})`);
  // un tenor que la mano izquierda alcanza (la3 sobre si2) se queda abajo
  rv = await voces(gran(nr(['A', 4], 16, 1) + atras + nr(['E', 4], 16, 2) + atras + nr(['A', 3], 16, 5, 2) + atras + nr(['B', 2], 16, 6, 2)));
  ok(rv.suena['E4@1'] === 16 && rv.suena['A4@1'] === 16 && rv.suena['A3@2'] === 16 && rv.suena['B2@2'] === 16, `N-CRUCE-1: voces que cada mano alcanza: ninguna cambia de mano (${JSON.stringify(rv.suena)})`);
  // N-VOC-2: mi4 atacado a la vez en las dos manos: se queda el más largo
  rv = await voces(gran(nr(['A', 4], 16, 1) + atras + nr(['E', 4], 4, 2) + nr(null, 12, 2) + atras + nr(['E', 4], 8, 5, 2) + nr(null, 8, 5, 2) + atras + nr(['A', 3], 16, 6, 2)));
  ok(rv.suena['E4@2'] === 8 && !rv.suena['E4@1'], `N-VOC-2: un unísono entre manos se escribe una vez (${JSON.stringify(rv.suena)})`);
  // N-VOC-5: arpegio sostenido como lo trae el DCML (semicorcheas mi5-do#5 en una voz y mi5 con puntillo en otra, que atacan a la
  // vez): no se funde en acordes y la voz que sostiene lleva la plica contraria a la del arpegio
  const arpegio = gran(nr(['A', 5], 16, 1) + atras + nr(null, 1, 2) + nr(['E', 5], 3, 2) + nr(null, 12, 2) + atras + nr(null, 1, 3) + nr(['E', 5], 1, 3) + nr(['C', 5], 1, 3) + nr(null, 1, 3) + nr(null, 12, 3) + atras + nr(['A', 2], 16, 5, 2));
  rv = await voces(arpegio);
  ok(rv.capas['1'] === 3, `N-VOC-1: las voces de un arpegio sostenido no se funden en acordes ligados (${rv.capas['1']} capas)`);
  const plUn = await p.evaluate(x => { const y = Notacion.plicasUnisono(x.replace(/<staff>1<\/staff>/g, '<stem>down</stem><staff>1</staff>')); const d = new DOMParser().parseFromString(y, 'application/xml'); return [...d.querySelectorAll('note')].filter(n => n.querySelector('pitch') && n.querySelector('staff').textContent === '1').map(n => n.querySelector('voice').textContent + ':' + n.querySelector('stem').textContent).join(' ') }, arpegio);
  ok(plUn === '1:down 2:up 3:down 3:down', `N-VOC-5: la voz que sostiene la nota compartida pasa a la plica contraria (${plUn})`);
  // en la Allemande dibujada, el mi5 con puntillo y el do#5 en corchea del c. 2 (y el la3 y do#4 de la izquierda del c. 1)
  // comparten la cabeza con las semicorcheas del arpegio
  await p.evaluate(h => { __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, { obra: 206, ini: 0, fin: 3, frag: true, tono: '', etq: '', compas: 0, parte: 1 });
  await p.waitForFunction(() => { const c = document.querySelector('#partitura'); return c && c.querySelector('svg g.cifrados') }, null, { timeout: 60000 });
  const compartidas = await p.evaluate(() => document.querySelectorAll('#partitura svg [data-n-voc3]').length);
  ok(compartidas >= 2, `N-VOC-5: Allemande, cc. 0-3: ${compartidas} unísonos con puntillo distinto llevados a una cabeza (mi5 del c. 2, la3 del c. 1; los de figura igual ya los junta Verovio)`);
  // N-VOC-6: tres voces; la intermedia es una línea de semicorcheas en la 1.ª blanca (N-VOC-1 no la funde) y una blanca (la4) que
  // coincide en ritmo con la aguda (do#5) en la 2.ª: esa nota va al acorde de la aguda. Con dos voces, solo si el ritmo coincide en todo el compás
  const v4 = (v2) => gran(nr(['D', 5], 4, 1) + nr(['D', 5], 4, 1) + nr(['C', 5], 8, 1) + atras + v2 + atras + nr(['E', 4], 16, 3) + atras + nr(['A', 2], 16, 5, 2));
  const acordes = x => p.evaluate(x => { const d = new DOMParser().parseFromString(Notacion.vocesReconstruidas(x), 'application/xml'); return [...d.querySelectorAll('note')].filter(n => n.querySelector('chord') && n.querySelector('staff').textContent === '1').map(n => n.querySelector('step').textContent + n.querySelector('octave').textContent + '/v' + n.querySelector('voice').textContent).join(' ') }, x);
  const lineaInt = ['A', 'G', 'F', 'G', 'A', 'B', 'A', 'G'].map(x => nr([x, 4], 1, 2)).join('') + nr(['A', 4], 8, 2);
  const rc4 = await acordes(v4(lineaInt));
  ok(rc4 === 'A4/v1', `N-VOC-6: con tres voces, la nota interior que coincide en ritmo con la vecina va a su acorde; la línea de semicorcheas sigue aparte (${rc4})`);
  const dos = gran(nr(['D', 5], 8, 1) + nr(['C', 5], 8, 1) + atras + nr(['F', 4], 8, 2) + nr(['A', 4], 8, 2) + atras + nr(['A', 2], 16, 5, 2));
  ok(await acordes(dos) === 'F4/v1 A4/v1', `N-VOC-6: dos voces con el mismo ritmo en todo el compás van en acordes de una voz (${await acordes(dos)})`);
  const contra = gran(nr(['D', 5], 8, 1) + nr(['C', 5], 4, 1) + nr(['B', 4], 4, 1) + atras + nr(['F', 4], 8, 2) + nr(['A', 4], 8, 2) + atras + nr(['A', 2], 16, 5, 2));
  ok(await acordes(contra) === '', 'N-VOC-6: dos voces que coinciden solo en parte se dejan separadas (contrapunto)');
  // N-CRUCE-2: en la voz aguda de la izquierda (sobre un la3, al alcance de la mano), mi4 (2 líneas en fa) se queda; la4 (3 líneas) y
  // si4 suben a la derecha, bajo su mi5
  rv = await voces(gran(nr(['E', 5], 16, 1) + atras + nr(['A', 3], 16, 5, 2) + atras + nr(['E', 4], 4, 6, 2) + nr(['A', 4], 4, 6, 2) + nr(['B', 4], 8, 6, 2)));
  ok(rv.suena['E4@2'] === 4 && rv.suena['A4@1'] === 4 && rv.suena['B4@1'] === 8, `N-CRUCE-2: las notas de la izquierda con 3+ líneas adicionales pasan a la derecha (${JSON.stringify(rv.suena)})`);
  // si la derecha toca más grave que esas notas (cruce de manos), no se tocan
  rv = await voces(gran(nr(['G', 4], 16, 1) + atras + nr(['A', 3], 16, 5, 2) + atras + nr(['E', 4], 4, 6, 2) + nr(['A', 4], 4, 6, 2) + nr(['B', 4], 8, 6, 2)));
  ok(rv.suena['A4@2'] === 4 && rv.suena['B4@2'] === 8, `N-CRUCE-2: no deshace un cruce de manos (${JSON.stringify(rv.suena)})`);
  // N-LIG-6: ligadura de unión de la voz 1 a la voz 2 (mismo pentagrama y altura): se quita de <tied>, se conserva <tie> y se anota el par
  const nl = (voz, tipo, extra) => `<note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><tie type="${tipo}"/><voice>${voz}</voice><type>half</type><staff>1</staff><notations><tied type="${tipo}"/></notations></note>`;
  const ligx = env(nl(1, 'start') + '<backup><duration>2</duration></backup><forward><duration>2</duration><voice>2</voice><staff>1</staff></forward>' + nl(2, 'stop'));
  const l4 = await p.evaluate(x => { const y = Notacion.ligadurasEntreCapas(x); const d = new DOMParser().parseFromString(y, 'application/xml'); return { pares: Notacion.ligadurasPendientes(y).length, tied: d.querySelectorAll('tied').length, tie: d.querySelectorAll('tie').length, mei: Notacion.ligadurasMEI('<measure><note xml:id="hf-lig0"/><note xml:id="hf-lig1"/></measure>', Notacion.ligadurasPendientes(y)) } }, ligx);
  ok(l4.pares === 1 && l4.tied === 0 && l4.tie === 2 && /<tie startid="#hf-lig0" endid="#hf-lig1"\/><\/measure>/.test(l4.mei), `N-LIG-6: una ligadura entre dos voces pasa a MEI (${JSON.stringify(l4)})`);
  await p.evaluate(() => Object.assign(Notacion.config, { vocesPorRegistro: false, dosCapas: false, unisonosUnaVez: false, vocesCondensadas: false, homorritmia: false, notasAlOtroPentagrama: false }));
  ok((await voces(brise)).igual, 'N-VOC-1, N-VOC-2, N-VOC-6 y N-CRUCE-1 apagadas: el XML no cambia');
  await p.evaluate(() => Object.assign(Notacion.config, { vocesPorRegistro: true, dosCapas: true, unisonosUnaVez: true, vocesCondensadas: true, homorritmia: true, notasAlOtroPentagrama: true }));
  await b.close();
  console.log(fallos ? `${fallos} fallo(s)` : 'todo correcto'); process.exitCode = fallos ? 1 : 0;
})();
