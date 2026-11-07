// Pruebas del motor de notación (niveles 1 y 2 de docs/ESPECIFICACION_GRABADO_MUSICAL.md, «Pruebas»):
//   nivel 1  una prueba por regla, sobre MusicXML y SVG mínimos escritos a mano
//   nivel 2  integridad musical: Musica.comparar detecta notas perdidas o duplicadas, alteraciones, duraciones, posiciones
//            métricas, voces fusionadas y ligaduras perdidas; Notacion.preparar se detiene (modo estricto) o deshace el paso
//            (modo por defecto) cuando una transformación altera algo que no declaró
// No necesita la web servida ni Verovio: carga web/musica.js, web/notacion.js y web/notacion_svg.js en una página vacía.
//   uso: node herramientas/prueba_motor.js            variables: CHROME (ejecutable de Chrome)
const { chromium } = require('playwright'); const path = require('path');
const WEB = path.join(__dirname, '..', 'web');
let fallos = 0, total = 0; const ok = (c, m) => { total++; console.log((c ? 'OK   ' : 'FALLA'), m); if (!c) fallos++ };

// --- constructores de MusicXML -------------------------------------------------------------------------------
// nota('C',4,{dur:1, tipo:'quarter', voz:1, pent:1, alter, acc, acorde, extra, ligIni, ligFin})
const nota = (paso, oct, o = {}) => `<note>${o.gracia ? '<grace/>' : ''}${o.acorde ? '<chord/>' : ''}${paso === 'R' ? `<rest>${o.restPos || ''}</rest>` : `<pitch><step>${paso}</step>${o.alter ? `<alter>${o.alter}</alter>` : ''}<octave>${oct}</octave></pitch>`}` +
  `${o.gracia ? '' : `<duration>${o.dur ?? 1}</duration>`}${o.ligFin ? '<tie type="stop"/>' : ''}${o.ligIni ? '<tie type="start"/>' : ''}<voice>${o.voz ?? 1}</voice><type>${o.tipo || 'quarter'}</type>` +
  `${o.tresillo ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' : ''}${o.acc ? `<accidental>${o.acc}</accidental>` : ''}${o.plica ? `<stem>${o.plica}</stem>` : ''}<staff>${o.pent ?? 1}</staff>${o.extra || ''}` +
  `${o.ligIni || o.ligFin || o.slur ? `<notations>${o.ligFin ? '<tied type="stop"/>' : ''}${o.ligIni ? '<tied type="start"/>' : ''}${o.slur ? `<slur type="${o.slur}"/>` : ''}</notations>` : ''}</note>`;
const atras = d => `<backup><duration>${d}</duration></backup>`;
const compas = (n, cuerpo, at = '') => `<measure number="${n}">${at ? `<attributes>${at}</attributes>` : ''}${cuerpo}</measure>`;
const partitura = (compases, partes = 1) => `<?xml version="1.0"?><score-partwise version="4.0"><part-list>${[...Array(partes)].map((_, i) => `<score-part id="P${i + 1}"><part-name>Piano</part-name></score-part>`).join('')}</part-list>` +
  (Array.isArray(compases[0]) ? compases : [compases]).map((cs, i) => `<part id="P${i + 1}">${cs.join('')}</part>`).join('') + '</score-partwise>';
const AT = (div = 1, tiempo = '4/4', clave = '<clef><sign>G</sign><line>2</line></clef>', fifths = 0) => `<divisions>${div}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${tiempo.split('/')[0]}</beats><beat-type>${tiempo.split('/')[1]}</beat-type></time>${clave}`;

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const p = await b.newPage();
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  for (const f of ['musica.js', 'notacion.js', 'notacion_svg.js']) await p.addScriptTag({ path: path.join(WEB, f) });
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  // aplica una transformación del registro por su id (en modo estricto) y devuelve el XML
  const T = (id, xml, ctx = {}) => ev(([id, xml, ctx]) => {
    const t = Notacion.transformaciones.find(t => t.id === id); const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const antes = Musica.huella(doc); t.aplicar(doc, ctx); const dif = Musica.comparar(antes, Musica.huella(doc), t.modifica);
    return { xml: new XMLSerializer().serializeToString(doc), dif: dif.map(d => d.detalle) };
  }, [id, xml, ctx]);
  const notas = (xml, f) => ev(([xml, f]) => { const d = new DOMParser().parseFromString(xml, 'application/xml'); return [...d.querySelectorAll('note')].map(n => new Function('n', 'return ' + f)(n)).join(' ') }, [xml, f]);

  // ====================================== NIVEL 1: reglas ======================================
  console.log('— Catálogo y registro');
  const cat = await ev(() => ({ reglas: Notacion.reglas.map(r => r.id), trans: Notacion.transformaciones.map(t => ({ id: t.id, regla: t.regla, tipo: t.tipo, modifica: t.modifica })), props: Object.keys(Musica.PROPIEDADES) }));
  ok(new Set(cat.reglas).size === cat.reglas.length, `reglas con identificador único (${cat.reglas.length})`);
  ok(cat.trans.every(t => ['presentacion', 'estructural', 'notacion'].includes(t.tipo)), 'cada transformación declara su tipo (presentación, estructural o notación)');
  ok(cat.trans.every(t => t.modifica.every(m => cat.props.includes(m))), 'cada transformación declara solo propiedades musicales conocidas');
  ok(cat.trans.every(t => cat.reglas.includes(t.regla)), 'cada transformación remite a una regla del catálogo');
  ok(cat.trans.filter(t => t.tipo === 'notacion').every(t => !t.modifica.some(m => ['notas', 'duraciones', 'voces', 'acordes', 'ligadurasUnion', 'ligadurasExpresion', 'compases', 'metrica', 'armadura', 'instrumentos'].includes(m))),
    'ninguna corrección de notación declara poder cambiar notas, duraciones, voces, acordes, ligaduras, compases, armadura o instrumentos');
  ok(cat.trans.filter(t => /plica/.test(t.id)).length === 1, 'una sola transformación decide la dirección de las plicas (N-PLICA-2/3)');

  console.log('— A. Plicas (N-PLICA-2, N-PLICA-3)');
  const dosVoces = (aguda, grave, extraA = {}, extraG = {}) => partitura([compas(1, nota(grave[0], grave[1], { dur: 4, tipo: 'whole', voz: 2, ...extraG }) + atras(4) + nota(aguda[0], aguda[1], { dur: 4, tipo: 'whole', voz: 1, ...extraA }), AT())]);
  let r = await T('plicas-por-voz', dosVoces(['A', 4], ['D', 4]));
  ok(await notas(r.xml, "n.querySelector('voice').textContent+':'+(n.querySelector('stem')?.textContent||'-')") === '2:down 1:up', 'dos voces simultáneas: la aguda arriba y la grave abajo, aunque el archivo escriba antes la grave');
  r = await T('plicas-por-voz', dosVoces(['D', 4], ['A', 4], { voz: 1 }, { voz: 2 }));
  ok(await notas(r.xml, "n.querySelector('stem')?.textContent") === 'up down', 'el criterio es la altura, no el número de voz (voz 2 más aguda → arriba)');
  r = await T('plicas-por-voz', partitura([compas(1, nota('A', 4, { dur: 2, tipo: 'half' }) + nota('C', 5, { dur: 2, tipo: 'half' }), AT())]));
  ok(await notas(r.xml, "n.querySelector('stem')?.textContent||'-'") === '- -', 'una sola voz: no se toca (lo decide Verovio por la posición de las notas, N-PLICA-1)');
  r = await T('plicas-por-voz', partitura([compas(1, nota('D', 4, { dur: 2, tipo: 'half', voz: 2 }) + `<forward><duration>2</duration></forward>` + atras(4) + `<forward><duration>2</duration></forward>` + nota('A', 4, { dur: 2, tipo: 'half', voz: 1 }), AT())]));
  ok(await notas(r.xml, "n.querySelector('stem')?.textContent||'-'") === '- -', 'voces que no suenan a la vez: no se tocan');
  const tres = (plicaMedia) => partitura([compas(1, nota('A', 4, { dur: 4, tipo: 'whole', voz: 1 }) + atras(4) + nota('F', 4, { dur: 4, tipo: 'whole', voz: 2, plica: plicaMedia }) + atras(4) + nota('C', 3, { dur: 4, tipo: 'whole', voz: 3 }) + atras(4) + nota('C', 4, { dur: 4, tipo: 'whole', voz: 4 }), AT())]);
  r = await T('plicas-por-voz', tres());
  ok(await notas(r.xml, "n.querySelector('stem')?.textContent") === 'up up down down', 'cuatro voces: aguda arriba, grave abajo; intermedias por rango (N-PLICA-3: la segunda más aguda arriba, la segunda más grave abajo, aunque esté más cerca de la aguda)');
  r = await T('plicas-por-voz', tres('down'));
  ok(await notas(r.xml, "n.querySelector('stem')?.textContent") === 'up down down down', 'N-PLICA-3: la plica que la edición ya trae en una voz intermedia se respeta');
  r = await T('plicas-por-voz', dosVoces(['A', 4], ['D', 4], { plica: 'down' }, { plica: 'down' }));
  ok(await notas(r.xml, "n.querySelector('stem')?.textContent") === 'down up', 'la plica errónea del archivo se corrige');
  ok(/<type>whole<\/type><stem>up<\/stem><staff>/.test(r.xml), '<stem> queda en el orden que pide MusicXML (tras <type>, antes de <staff>)');

  console.log('— F. Ligaduras de unión por voz (N-LIG-3)');
  r = await T('ligaduras-por-voz', partitura([compas(1, nota('D', 4, { dur: 4, tipo: 'whole', voz: 2, ligIni: 1 }) + nota('F', 4, { dur: 4, tipo: 'whole', voz: 2, acorde: 1, ligIni: 1 }) + atras(4) + nota('A', 4, { dur: 4, tipo: 'whole', voz: 1, ligIni: 1 }), AT()),
    compas(2, nota('D', 4, { dur: 4, tipo: 'whole', voz: 2, ligFin: 1 }) + nota('F', 4, { dur: 4, tipo: 'whole', voz: 2, acorde: 1, ligFin: 1 }) + atras(4) + nota('A', 4, { dur: 4, tipo: 'whole', voz: 1, ligFin: 1 }))]));
  ok(await notas(r.xml, "(n.querySelector('tied[type=start]')?.getAttribute('orientation'))||'-'") === 'under under over - - -', 'voz grave por abajo y aguda por arriba; en el acorde, todas sus notas (sin plica escrita: por su posición entre las voces)');
  ok(r.dif.length === 0, 'N-LIG-3 no altera ninguna propiedad musical');

  console.log('— C. Barras (N-BARRA-1, N-BARRA-3)');
  const grupos = async (tiempo, figuras, div = 2) => {
    const cuerpo = figuras.map(([paso, d, tipo, o]) => nota(paso, 5, { dur: d, tipo, ...(o || {}) })).join('');
    const x = (await T('barras-automaticas', partitura([compas(1, cuerpo, AT(div, tiempo))]))).xml;
    return ev(x => { const d = new DOMParser().parseFromString(x, 'application/xml'); let s = ''; for (const n of d.querySelectorAll('note')) { const b = n.querySelector('beam[number="1"]'); s += !b ? '.' : b.textContent === 'begin' ? '[' : b.textContent === 'end' ? ']' : '=' } return s }, x);
  };
  const corch = (n, paso = 'C') => Array(n).fill([paso, 1, 'eighth']);
  ok(await grupos('4/4', corch(8)) === '[==][==]', '4/4, ocho corcheas: dos grupos de medio compás (LilyPond beamExceptions; MuseScore: «each group of two beats»)');
  ok(await grupos('4/4', [...corch(2), ['C', 2, 'quarter'], ...corch(4)]) === '[].[==]', '4/4: una negra corta el grupo; las corcheas del segundo medio compás, juntas');
  ok(await grupos('4/4', Array(8).fill(['C', 1, '16th']), 4) === '[==][==]', '4/4, semicorcheas: por pulso (negra)');
  ok(await grupos('4/4', [['C', 1, '16th'], ['C', 1, '16th'], ['C', 2, 'eighth'], ['C', 2, 'eighth'], ['C', 2, 'eighth']], 4) === '[=][]', '4/4: un grupo con semicorcheas no se une al siguiente')
  ok(await grupos('3/4', corch(6)) === '[====]', '3/4, seis corcheas: un grupo de compás entero (LilyPond: «eighth notes in 3/4 time are beamed as a full measure»)');
  ok(await grupos('6/8', corch(6)) === '[=][=]', '6/8: dos grupos de tres corcheas (pulso de negra con puntillo)');
  ok(await grupos('3/8', corch(3)) === '[=]', '3/8: las tres corcheas en un grupo (antes quedaban sueltas, con corchete)');
  ok(await grupos('2/4', corch(4)) === '[][]', '2/4: corcheas por pulso');
  { const x = (await T('barras-automaticas', partitura([compas(1, nota('C', 5, { dur: 1, tipo: 'eighth' }) + nota('E', 5, { dur: 1, tipo: 'eighth', acorde: 1 }) + nota('D', 5, { dur: 1, tipo: 'eighth' }) + nota('F', 5, { dur: 1, tipo: 'eighth', acorde: 1 }), AT(2, '2/4'))]))).xml;
    ok(await notas(x, "n.querySelectorAll('beam').length") === '1 0 1 0', 'en un acorde la barra va solo en la primera nota (si las demás la llevan, Verovio deja de dibujar notas)') }
  ok(await grupos('4/4', [['C', 1, 'eighth'], ['R', 1, 'eighth'], ...corch(6)]) === '..[][==]', '4/4: un silencio corta el grupo (y la corchea suelta no lleva barra)')
  ok(await grupos('4/4', [...Array(6).fill(['C', 2, 'eighth', { tresillo: 1 }]), ...Array(4).fill(['C', 3, 'eighth'])], 6) === '[=][=][==]', 'tresillos: se agrupan por pulso y no se unen por medio compás')
  await ev(() => { Notacion.config.barrasPorCompas = false });
  ok(await grupos('4/4', corch(8)) === '[][][][]', 'N-BARRA-3 apagada: 4/4 vuelve a agrupar por negra');
  await ev(() => { Notacion.config.barrasPorCompas = true });

  console.log('— D. Alteraciones (N-ALT-2)');
  const alt = async (cuerpo, fifths = 0) => notas((await T('alteraciones-una-vez', partitura([compas(1, cuerpo, AT(1, '4/4', undefined, fifths))]))).xml, "n.querySelector('accidental')?.textContent||'-'");
  ok(await alt(nota('F', 4, { alter: 1, acc: 'sharp' }) + nota('F', 4, { alter: 1, acc: 'sharp' }) + nota('F', 5, { alter: 1, acc: 'sharp' }) + nota('F', 4, { alter: 0, acc: 'natural' })) === 'sharp - sharp natural', 'repetida en la misma octava se quita; en otra octava se conserva; el becuadro necesario se conserva');
  ok(await alt(nota('B', 4, { alter: -1, acc: 'flat' }) + nota('D', 5, { acorde: 1 }) + nota('B', 4, { alter: -1, acc: 'flat', voz: 2 })) === 'flat - -', 'rige para las demás voces del mismo pentagrama');
  ok(await alt(nota('F', 4, { alter: 1, acc: 'sharp' }) + nota('F', 4, { alter: 1, acc: 'sharp', pent: 2 })) === 'sharp sharp', 'no pasa de un pentagrama a otro');
  ok(await alt(nota('F', 4, { alter: 1, acc: 'sharp' }), 1) === '-', 'la que repite la armadura se quita');
  ok(await alt(nota('F', 4, { alter: 1, acc: 'sharp', ligIni: 1 }) + nota('F', 4, { alter: 1, acc: 'sharp', ligFin: 1 })) === 'sharp sharp', 'la de una nota ligada se deja como viene');
  { const x = partitura([compas(1, nota('C', 4, { dur: 3, tipo: 'half' }) + nota('D', 4, { alter: -1, acc: 'flat', ligIni: 1 }), AT()), compas(2, nota('D', 4, { alter: -1, ligFin: 1 }) + nota('D', 4, { alter: -1, acc: 'flat' }) + nota('D', 4, { dur: 2, tipo: 'half', alter: -1, acc: 'flat' }))]);
    ok(await notas((await T('alteraciones-una-vez', x)).xml, "n.querySelector('accidental')?.textContent||'-'") === '- flat - flat -', 'una nota ligada desde el compás anterior no hace redundante la alteración de la siguiente (sí la de después)') }
  { const x = partitura([compas(1, nota('C', 4, { dur: 3, tipo: 'half' }) + nota('G', 4, { alter: 1, acc: 'sharp', ligIni: 1 }), AT()), compas(2, nota('G', 4, { alter: 1, ligFin: 1 }) + nota('G', 4, { acc: 'natural' }) + nota('G', 4, { dur: 2, tipo: 'half', acc: 'natural' }))]);
    ok(await notas((await T('alteraciones-una-vez', x)).xml, "n.querySelector('accidental')?.textContent||'-'") === '- sharp - natural -', 'tras un sol♯ ligado desde el compás anterior, el becuadro de precaución del sol siguiente se conserva (el del otro sol, no)') }
  ok(await alt(nota('G', 5, { alter: 1, voz: 2 }) + nota('G', 5, { alter: 1, acc: 'sharp' })) === '- sharp', 'una nota alterada sin alteración impresa (descuido de la fuente) no hace redundante la de la siguiente: el estado sigue lo escrito')

  console.log('— E. Silencios de la reconstrucción (N-SIL-1) y voces (N-VOC-3, N-VOC-4)');
  r = await T('silencios-reconstruccion', partitura([compas(1, nota('A', 4, { dur: 2, tipo: 'half', voz: 1 }) + nota('R', 0, { dur: 2, tipo: 'half', voz: 1 }) + atras(4) + nota('D', 4, { dur: 2, tipo: 'half', voz: 2 }) + nota('R', 0, { dur: 2, tipo: 'half', voz: 2 }), AT())]));
  ok(await notas(r.xml, "(n.getAttribute('print-object')||'')+(n.querySelector('display-step')?n.querySelector('display-step').textContent+n.querySelector('display-octave').textContent:'')") === ' A4  no', 'el silencio de la voz aguda se coloca a la altura de la nota vecina de su voz; el de la otra voz se oculta');
  ok(r.dif.length === 0, 'N-SIL-1 solo cambia qué silencios se imprimen');
  r = await T('silencios-reconstruccion', partitura([compas(1, nota('A', 4, { dur: 2, tipo: 'half', voz: 1 }) + '<forward><duration>2</duration></forward>' + atras(4) + nota('D', 4, { dur: 2, tipo: 'half', voz: 2 }) + nota('R', 0, { dur: 2, tipo: 'half', voz: 2 }), AT())]));
  ok(await notas(r.xml, "n.getAttribute('print-object')||''") === '  ', 'N-SIL-1: el silencio de una voz secundaria se conserva si ninguna otra voz ocupa su tramo');
  // BWV 806, Allemande, c. 21, mano izquierda: voz 1 = negra con puntillo de silencio + corchea; voz 2 = negra + silencio de negra
  r = await T('silencios-reconstruccion', partitura([compas(1, nota('C', 4, { dur: 4, tipo: 'half', voz: 1 }) + nota('R', 0, { dur: 3, tipo: 'quarter', voz: 1, extra: '' }).replace('<type>quarter</type>', '<type>quarter</type><dot/>') + nota('F', 3, { dur: 1, tipo: 'eighth', voz: 1 }) + atras(8) + nota('R', 0, { dur: 4, tipo: 'half', voz: 2 }) + nota('F', 3, { dur: 2, tipo: 'quarter', voz: 2 }) + nota('R', 0, { dur: 2, tipo: 'quarter', voz: 2 }), AT(2, '4/4'))]));
  ok((r.xml.match(/<forward>/g) || []).length === 2 && !/<dot\/>/.test(r.xml), 'N-SIL-1: los silencios solapados con notas de otra voz se recortan al hueco real (corchea) y el resto pasa a <forward>');
  r = await T('voces-por-altura', partitura([compas(1, nota('D', 4, { dur: 4, tipo: 'whole', voz: 1 }) + atras(4) + nota('A', 4, { dur: 4, tipo: 'whole', voz: 2 }), AT())]));
  ok(await notas(r.xml, "n.querySelector('voice').textContent") === '2 1' && r.dif.length === 0, 'N-VOC-4: la voz aguda pasa a ser la 1; el reparto de notas no cambia');
  const tresVoces = partitura([compas(1, nota('C', 5, { dur: 2, tipo: 'half', voz: 1 }) + nota('D', 5, { dur: 2, tipo: 'half', voz: 1 }) + atras(4) + nota('E', 4, { dur: 2, tipo: 'half', voz: 2 }) + nota('F', 4, { dur: 2, tipo: 'half', voz: 2 }) + atras(4) + nota('C', 4, { dur: 4, tipo: 'whole', voz: 3 }), AT())]);
  r = await T('fusionar-voces-iguales', tresVoces);
  ok(await notas(r.xml, "(n.querySelector('chord')?'+':'')+n.querySelector('step').textContent+n.querySelector('voice').textContent") === 'C1 +E1 D1 +F1 C3', 'N-VOC-3: una voz con el mismo ritmo que otra pasa a formar acordes con ella');
  ok(r.dif.length === 0, 'N-VOC-3 conserva notas, alturas, duraciones y posiciones (solo cambia reparto de voces y acordes, como declara)');

  console.log('— Claves (N-CLAVE-1) y presentación (N-PRES-1/2/3, N-NUM-1)');
  r = await T('claves-por-tesitura', partitura([[compas(1, nota('C', 3) + nota('E', 2) + nota('G', 2) + nota('C', 3), AT(1, '4/4'))]]), { inst: ['Violoncello'] });
  ok(/<sign>F<\/sign><line>4<\/line>/.test(r.xml) && !/<sign>G<\/sign>/.test(r.xml) && r.dif.length === 0, 'violonchelo grave en clave de sol → clave de fa; solo cambian las claves');
  const expr = partitura([compas(1, '<direction><direction-type><dynamics><p/></dynamics></direction-type></direction><direction><direction-type><octave-shift type="down" size="8"/></direction-type><sound/></direction><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>' +
    nota('C', 5, { extra: '<notations><articulations><staccato/></articulations><fermata/></notations>', slur: undefined }), AT())]);
  r = await T('quitar-expresion', expr);
  ok(!/<dynamics/.test(r.xml) && /octave-shift/.test(r.xml) && !/<articulations/.test(r.xml) && /<fermata\/>/.test(r.xml) && !/<sound/.test(r.xml), 'N-PRES-2: se quitan dinámicas y articulaciones; se conservan la línea de octava y el calderón');
  ok(r.dif.length === 0, 'N-PRES-2 no toca nada que no declare (notas, octavas, calderones intactos)');
  r = await T('quitar-armonias', expr); ok(!/<harmony/.test(r.xml) && r.dif.length === 0, 'N-PRES-1: se quitan los cifrados del archivo');
  r = await T('ocultar-nombre-unico', expr); ok(/<part-name print-object="no"\/?>(<\/part-name>)?/.test(r.xml) && r.dif.length === 0, 'N-PRES-3: con un solo instrumento, su nombre no se imprime');
  const anac = partitura([compas(1, nota('G', 4), AT()), compas(2, nota('C', 5, { dur: 4, tipo: 'whole' }))]);
  r = await T('alinear-anacrusa', anac, { anacrusa: true });
  ok(/number="0"/.test(r.xml) && /number="1"/.test(r.xml) && r.dif.length === 0, 'N-NUM-1: una anacrusa numerada 1 pasa a ser el compás 0');

  console.log('— SVG: silencios (N-SIL-2) y ligaduras (N-LIG-2)');
  // pentagrama con dos capas: una cabeza de la voz grave justo donde está el silencio de la voz aguda
  const svgSil = (cabezaY) => `<g class="page-margin"><g class="measure"><g class="staff"><path d="M0 100 L800 100"/><path d="M0 280 L800 280"/><path d="M0 460 L800 460"/><path d="M0 640 L800 640"/><path d="M0 820 L800 820"/>` +
    `<g class="layer"><g class="rest"><rect x="300" y="300" width="100" height="250"/></g></g><g class="layer"><g class="note"><g class="notehead"><rect x="290" y="${cabezaY}" width="140" height="160"/></g></g></g></g></g></g>`;
  const sil = (cabezaY, cfg) => ev(([s, cfg]) => {
    Object.assign(Notacion.config, cfg); const NS = 'http://www.w3.org/2000/svg', c = document.createElementNS(NS, 'svg'); c.setAttribute('width', 900); c.setAttribute('height', 2000); c.innerHTML = s; document.body.append(c);
    const n = Notacion.despejarSilencios(c), r = c.querySelector('g.rest'); const res = { n, oculto: r.getAttribute('display') === 'none', pasos: r.getAttribute('data-n-sil2') }; c.remove(); Notacion.config.silenciosApartados = true; return res;
  }, [svgSil(cabezaY), cfg || {}]);
  let rs = await sil(450);
  ok(rs.n === 1 && !rs.oculto && rs.pasos === '-2', `N-SIL-2: el silencio de la voz aguda que pisa una cabeza de la grave sube (${rs.pasos} medias líneas, no 1: la primera posición libre lo dejaría tocando la cabeza; holgura de 0,35 espacios) en vez de ocultarse`);
  rs = await sil(450, { silenciosApartados: false });
  ok(rs.oculto, 'N-SIL-2 apagada: se oculta (comportamiento anterior)');
  rs = await sil(900);
  ok(rs.n === 0 && !rs.oculto, 'un silencio que no pisa nada no se toca');

  // ====================================== NIVEL 2: integridad ======================================
  console.log('— Integridad musical (I-1 … I-4)');
  const base = partitura([compas(1, nota('C', 5, { dur: 2, tipo: 'half', ligIni: 1, slur: 'start' }) + nota('E', 5, { dur: 2, tipo: 'half', alter: -1, acc: 'flat' }) + atras(4) + nota('C', 4, { dur: 4, tipo: 'whole', voz: 2 }), AT()),
    compas(2, nota('C', 5, { dur: 4, tipo: 'whole', ligFin: 1, slur: 'stop' }) + atras(4) + nota('G', 3, { dur: 4, tipo: 'whole', voz: 2 }))]);
  const cmp = (a, b, perm = []) => ev(([a, b, perm]) => Musica.comparar(Musica.huella(a), Musica.huella(b), perm).map(d => d.propiedad + ' · ' + d.detalle), [a, b, perm]);
  ok((await cmp(base, base)).length === 0, 'la misma partitura: sin diferencias');
  const sinNota = base.replace(nota('G', 3, { dur: 4, tipo: 'whole', voz: 2 }), '');
  ok((await cmp(base, sinNota)).some(d => /^notas · nota perdida/.test(d)), 'detecta una nota perdida');
  const dupl = base.replace(nota('G', 3, { dur: 4, tipo: 'whole', voz: 2 }), nota('G', 3, { dur: 4, tipo: 'whole', voz: 2 }) + nota('G', 3, { dur: 4, tipo: 'whole', voz: 2, acorde: 1 }));
  ok((await cmp(base, dupl)).some(d => /nota duplicada/.test(d)), 'detecta una nota duplicada');
  ok((await cmp(base, base.replace('<alter>-1</alter>', ''))).some(d => /^notas/.test(d)), 'detecta una alteración cambiada (mi♭ → mi)');
  { const d0 = await cmp(base, base.replace('<accidental>flat</accidental>', '')), d1 = await cmp(base, base.replace('<accidental>flat</accidental>', ''), ['alteracionesEscritas']);
    ok(d0.some(d => /^alteracionesEscritas/.test(d)) && d1.length > 0 && d1.every(d => /^lecturaAlturas/.test(d)), 'distingue la alteración impresa (notación) de la sonora (contenido): quitar el bemol de un mi♭ no cambia la nota, pero hace que se lea mal (I-5)') }
  // I-5: quitar un becuadro necesario (si♭ … si♮) hace que la nota se lea mal aunque se permita cambiar las alteraciones impresas
  const conBecuadro = partitura([compas(1, nota('B', 4, { alter: -1, acc: 'flat' }) + nota('B', 4, { acc: 'natural' }) + nota('B', 4, { alter: -1, acc: 'flat' }) + nota('B', 4, { alter: -1 }), AT())]);
  ok((await cmp(conBecuadro, conBecuadro.replace('<accidental>natural</accidental>', ''), ['alteracionesEscritas'])).some(d => /^lecturaAlturas/.test(d)), 'I-5: detecta una alteración necesaria quitada (la nota pasaría a leerse mal) aunque las alteraciones impresas puedan cambiar');
  ok((await cmp(conBecuadro, conBecuadro.replace(/(<alter>-1<\/alter><octave>4<\/octave><\/pitch><duration>1<\/duration><voice>1<\/voice><type>quarter<\/type>)<accidental>flat<\/accidental>(<staff>1<\/staff><\/note><\/measure>)/, '$1$2'), ['alteracionesEscritas'])).length === 0, 'I-5: quitar una alteración redundante no es un error');
  ok((await cmp(base, base.replace('<duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note></measure><measure number="2">', '<duration>2</duration><voice>2</voice><type>whole</type><staff>1</staff></note></measure><measure number="2">'))).some(d => /^duraciones/.test(d)), 'detecta una duración alterada');
  const movida = base.replace(atras(4) + nota('C', 4, { dur: 4, tipo: 'whole', voz: 2 }), atras(2) + nota('C', 4, { dur: 2, tipo: 'half', voz: 2 }) + `<forward><duration>2</duration></forward>`);
  ok((await cmp(base, movida, ['duraciones'])).some(d => /^notas/.test(d)), 'detecta un cambio de posición métrica');
  const fundida = base.replace('<voice>2</voice><type>whole</type><staff>1</staff></note></measure><measure', '<voice>1</voice><type>whole</type><staff>1</staff></note></measure><measure');
  ok((await cmp(base, fundida, ['numeracionVoces'])).some(d => /^voces/.test(d)), 'detecta voces fusionadas aunque se permita renumerarlas');
  ok((await cmp(base, base.replace(/<tie type="start"\/>|<tied type="start"\/>/g, ''))).some(d => /^ligadurasUnion/.test(d)), 'detecta una ligadura de prolongación eliminada');
  ok((await cmp(base, base.replace('<slur type="start"/>', ''))).some(d => /^ligadurasExpresion/.test(d)), 'detecta una ligadura de expresión eliminada');
  ok((await cmp(base, base.replace('<fifths>0</fifths>', '<fifths>1</fifths>'))).some(d => /^armadura/.test(d)), 'detecta un cambio de armadura');
  ok((await cmp(base, base.replace('<beats>4</beats>', '<beats>3</beats>'))).some(d => /^metrica/.test(d)), 'detecta un cambio de compás');
  ok((await cmp(base, base.replace('<staff>1</staff></note></measure><measure number="2">', '<staff>2</staff></note></measure><measure number="2">'))).some(d => /^pentagramas/.test(d)), 'detecta una nota que cambia de pentagrama');

  // una transformación fraudulenta: borra una nota sin declararlo
  const fraude = await ev(xml => {
    const T = { id: 'fraude', regla: 'N-PRES-1', tipo: 'notacion', fuentes: ['edicion'], modifica: [], activa: () => true, aplicar: d => { d.querySelector('note').remove(); return 1 } };
    Notacion.transformaciones.push(T);
    const out = {};
    Notacion.config.integridad = 'estricto';
    try { Notacion.preparar(xml, { fuente: 'edicion' }); out.estricto = 'sin error' } catch (e) { out.estricto = e.codigo; out.mensaje = e.message; out.props = [...new Set(e.diferencias.map(d => d.propiedad))] }
    Notacion.config.integridad = 'revertir'; const n0 = Notacion.incidencias.length; const ce = console.error; console.error = () => { };
    const y = Notacion.preparar(xml, { fuente: 'edicion' }); console.error = ce;
    out.revertido = Musica.resumen(y).notas === Musica.resumen(xml).notas; out.registrada = Notacion.incidencias.length === n0 + 1;
    out.informe = Notacion.preparar.ultimoInforme.pasos.find(p => p.id === 'fraude');
    Notacion.transformaciones.pop();
    return out;
  }, base);
  ok(fraude.estricto === 'HF-INTEGRIDAD', `modo estricto: una transformación que borra una nota sin declararlo se detiene con HF-INTEGRIDAD (${(fraude.mensaje || '').slice(0, 90)}…)`);
  ok(fraude.revertido && fraude.registrada && fraude.informe && fraude.informe.revertida, 'modo por defecto: el paso se deshace, la nota sigue ahí y la incidencia queda registrada');

  // la canalización completa, por fuente, en modo estricto sobre una partitura con dos voces, ligaduras y expresión
  const completa = await ev(xml => {
    Notacion.config.integridad = 'estricto'; const out = {};
    for (const fuente of Object.keys(Notacion.fuentes)) {
      try { const y = Notacion.preparar(xml, { fuente, inst: ['Piano'], anacrusa: true }); const d = Musica.comparar(Musica.huella(xml), Musica.huella(y), ['silenciosVisibles', 'alteracionesEscritas', 'claves', 'numeracionVoces', 'numeracionCompases', 'armonias', 'dinamicas', 'textos', 'tempo', 'articulaciones', 'nombresInstrumento']); out[fuente] = d.length ? d.map(x => x.detalle).join('; ') : 'ok' }
      catch (e) { out[fuente] = e.message }
    }
    Notacion.config.integridad = 'revertir'; return out;
  }, base);
  for (const [f, v] of Object.entries(completa)) ok(v === 'ok', `canalización completa (${f}) en modo estricto: conserva notas, duraciones, voces, acordes, ligaduras, compases y armadura (${v})`);

  ok(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  await b.close();
  console.log(fallos ? `${fallos} fallo(s) de ${total}` : `todo correcto (${total} comprobaciones)`); process.exitCode = fallos ? 1 : 0;
})();
