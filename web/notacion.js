// Motor de notación de Harmony Finder.
//
// Conjunto único y centralizado de criterios de grabado para todas las partituras del proyecto (Bach, Beethoven,
// Mozart, corales, reconstrucciones del DCML…). La especificación de referencia, con el fundamento documental de cada
// regla (manual de MuseScore, Notation Reference de LilyPond, guías de grabado de DAISY) y las decisiones propias del
// proyecto, está en docs/ESPECIFICACION_GRABADO_MUSICAL.md; las mediciones históricas, en docs/NOTACION.md.
//
// Arquitectura (de la entrada al dibujo):
//   1. FUENTES          adaptación de cada procedencia (reconstrucción DCML, edición convertida desde Humdrum, edición
//                       MusicXML): la decodificación de bytes vive en index.html (xmlDe); aquí, qué se hace con cada una
//   2. MODELO           el propio DOM de MusicXML, leído de forma normalizada por web/musica.js
//   3. TRANSFORMACIONES registro único (TRANSFORMACIONES) de las operaciones sobre el MusicXML. Cada una declara su tipo
//                       ('estructural' | 'notacion' | 'presentacion'), las fuentes a las que se aplica y las propiedades
//                       musicales que PUEDE modificar; Notacion.preparar comprueba antes y después de cada paso que las
//                       demás no cambian (Musica.huella / Musica.comparar) y, si cambian, lo trata como error HF-INTEGRIDAD
//   4. GRABADO          reglas de grabado aplicadas sobre el MusicXML (plicas, ligaduras, barras, alteraciones, silencios)
//                       y opciones de Verovio (OPCIONES)
//   5. MusicXML         serialización única al final de la canalización
//   6. RENDERIZADO      Verovio (index.html · mostrar)
//   7. AJUSTES SVG      web/notacion_svg.js: solo lo que ni el MusicXML ni las opciones de Verovio pueden resolver
// Cada regla tiene un identificador estable (N-…) que se cita en el CHANGELOG, en la especificación y en las pruebas.
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------------------------------------
  // OPCIONES de Verovio (capa más barata: ver ESPECIFICACION, «Arquitectura»)
  // ---------------------------------------------------------------------------------------------------------
  const OPCIONES = {
    // aspecto general (estilo de edición moderna: líneas y plicas finas, fuente Bravura)
    font: 'Bravura', staffLineWidth: 0.12, stemWidth: 0.14, barLineWidth: 0.2, ledgerLineThickness: 0.2,
    slurMidpointThickness: 0.5, slurEndpointThickness: 0.06, tieMidpointThickness: 0.45, tieEndpointThickness: 0.06,
    // N-ESP-2: espaciado horizontal proporcional (Verovio: lineal + no lineal según la duración)
    spacingLinear: 0.3, spacingNonLinear: 0.62,
    // N-LIG-1: distancia de seguridad de las ligaduras a plicas, barras y notas de otras voces
    slurMargin: 2, slurCurveFactor: 1.3, slurSymmetry: 0.4, slurEndpointFlexibility: 0.3, tieMinLength: 3,
    // N-ESP-1: aire alrededor de alteraciones y silencios
    leftMarginAccid: 2, rightMarginAccid: 0.8, leftMarginRest: 2, rightMarginRest: 1,
    // N-VOC-5: extremos de cada ligadura de unión en el SVG (data-startid / data-endid), para moverlos con su nota
    svgAdditionalAttribute: ['tie@startid', 'tie@endid'],
  };

  // ---------------------------------------------------------------------------------------------------------
  // Catálogo (en sincronía con la especificación; las pruebas fallan si una regla del catálogo no está documentada)
  // ---------------------------------------------------------------------------------------------------------
  const REGLAS = [];
  // estado: 'aplicada' (código del motor), 'verovio' (la resuelve Verovio; el motor no actúa) o 'pendiente'
  const regla = (id, tema, capa, estado, resumen, donde) => REGLAS.push({ id, tema, capa, estado, resumen, donde: donde || 'web/notacion.js' });

  const CONFIG = {
    // N-INI-1: mostrar la indicación de compás al principio de un fragmento que empieza a mitad de la obra
    compasAlInicio: true,
    // N-ALT-2: quitar las alteraciones repetidas dentro de un compás
    alteracionesUnaVez: true,
    // N-PLICA-2: dirección de plicas por voz (aguda arriba, grave abajo) en pentagramas con varias voces simultáneas
    plicasPorVoz: true,
    // N-LIG-3: ligaduras de unión por arriba (voz aguda) o por abajo (voz grave) en pentagramas con varias voces simultáneas
    ligadurasPorVoz: true,
    // N-CLAVE-1: en las partituras con edición profesional se respetan sus claves; a false se corrigen por tesitura
    clavesDeLaEdicion: true,
    // N-LIG-2: apartar de plicas, corchetes, barras y cabezas las ligaduras de unión que las cruzan (retoque SVG)
    ligadurasDespejadas: true,
    // N-BARRA-3: excepciones de agrupación por compás (corcheas por medio compás en 4/4, compás entero en 3/4 y 3/8)
    barrasPorCompas: true,
    // N-PLICA-3: criterio para las voces intermedias con 3+ voces: 'rango' (convención de LilyPond y MuseScore: la mitad
    // superior arriba) o 'cercania' (la voz va del lado de la voz extrema que tiene más cerca; criterio anterior)
    vocesIntermedias: 'rango',
    // N-SIL-2: un silencio que pisa una nota de otra voz se aparta antes de ocultarse
    silenciosApartados: true,
    // Integridad musical (I-…): 'revertir' (por defecto: si una transformación altera una propiedad que no declaró, se
    // deshace ese paso y se registra el error en Notacion.incidencias), 'estricto' (se lanza Musica.ErrorIntegridad; lo
    // usan las pruebas) o 'no' (sin comprobación, solo para medir el coste)
    integridad: 'revertir',
    // N-CRUCE-1: en las reconstrucciones, una voz que su mano no puede tocar pasa al pentagrama de la otra mano
    vocesPorRegistro: true,
    // N-CRUCE-2: notas de una voz interior con 3+ líneas adicionales se dibujan en el otro pentagrama (barra que cruza)
    notasAlOtroPentagrama: true,
    // N-VOC-1: en las reconstrucciones, como mucho dos capas por pentagrama (salvo líneas reales y arpegios sostenidos)
    dosCapas: true,
    // N-VOC-2: un unísono entre las dos manos se escribe una sola vez
    unisonosUnaVez: true,
    // N-VOC-5: dos voces que atacan la misma nota a la vez llevan plicas opuestas y comparten la cabeza (style brisé)
    cabezaCompartida: true,
    // N-VOC-6: con 3+ voces, las notas de voces vecinas que coinciden en ritmo van en un acorde de una plica
    vocesCondensadas: true,
    // N-VOC-6: dos voces con el mismo ritmo en todo el compás se escriben como acordes de una voz
    homorritmia: true,
    // N-LIG-6: las ligaduras de unión entre dos capas se dibujan como ligaduras de MEI
    ligadurasEntreCapas: true,
    // N-VOC-1: partir notas en trozos ligados para fundir una voz en los acordes de otra (desactivado: produce notas repetidas y
    // ligadas que la edición escribe como una sola figura)
    trozosLigados: false,
    // N-CLAVE-1: en el teclado, la mano izquierda se resiste más a dejar la clave de fa
    izquierdaEnFa: true,
  };

  const hijo = (n, t) => { for (const c of n.children) if (c.tagName === t) return c; return null };
  const hijos = (n, t) => [...n.children].filter(c => c.tagName === t);
  const txt = (n, t) => { const h = n && hijo(n, t); return h ? h.textContent.trim() : '' };
  const compasesDe = parte => hijos(parte, 'measure');
  const PASOS = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const valorPaso = pitch => { const p = PASOS[txt(pitch, 'step')]; return p === undefined ? null : (+txt(pitch, 'octave') || 0) * 7 + p };
  // orden de los hijos de <note> en MusicXML: <stem> va tras <type>/<dot>/<accidental>/<time-modification> y antes de estos
  const ANTES_DE_PLICA = ['notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];
  // <attributes> donde insertar al principio de un compás (el existente si va antes de la primera nota; si no, uno nuevo)
  function atributosIniciales(doc, m) {
    let at = hijo(m, 'attributes');
    const primero = [...m.children].find(c => ['note', 'backup', 'forward'].includes(c.tagName));
    if (at && primero && (at.compareDocumentPosition(primero) & 2 /* PRECEDING */)) at = null;
    if (!at) { at = doc.createElement('attributes'); primero ? m.insertBefore(at, primero) : m.append(at) }
    return at;
  }
  // notas de un compás con su instante (en divisiones), para las reglas que necesitan saber qué suena a la vez
  function notasDelCompas(m) {
    const notas = []; let t = 0, ultimaDur = 0;
    for (const el of m.children) {
      const d = +txt(el, 'duration') || 0;
      if (el.tagName === 'backup') t -= d;
      else if (el.tagName === 'forward') t += d;
      else if (el.tagName === 'note') {
        const acorde = !!hijo(el, 'chord'), gracia = !!hijo(el, 'grace');
        if (acorde) t -= ultimaDur;
        const pitch = hijo(el, 'pitch');
        notas.push({ el, staff: casaDe(el), voz: txt(el, 'voice') || '1', t, fin: t + d, val: pitch ? valorPaso(pitch) : null, gracia, acorde, silencio: !!hijo(el, 'rest') });
        if (!gracia) { t += d; ultimaDur = d } else ultimaDur = 0;
      }
    }
    return notas;
  }
  // pentagrama de origen de una nota: el suyo, salvo las que N-CRUCE-2 dibuja en el otro pentagrama sin cambiarlas de voz
  const casaDe = el => el.getAttribute('data-hf-casa') || txt(el, 'staff') || '1';
  const parsear = xml => { let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return null } return doc.querySelector('parsererror') ? null : doc };
  // envoltorio texto → texto para las funciones que operan sobre el DOM (API histórica y pruebas): devuelve el mismo
  // texto si no hubo cambios
  const sobreTexto = fn => (xml, ...args) => { const doc = parsear(xml); if (!doc) return xml; return fn(doc, ...args) ? new XMLSerializer().serializeToString(doc) : xml };

  // =========================================================================================================
  // 1. FUENTES
  // =========================================================================================================
  const FUENTES = {
    reconstruida: 'Reconstrucción desde las tablas de notas del DCML: sin plicas, barras parciales, una sola clave por pentagrama, alteración en cada nota y silencios añadidos por la reconstrucción',
    convertida: 'Edición convertida desde Humdrum (Craig Sapp): claves y voces de la edición; la conversión escribe la alteración en cada nota',
    edicion: 'Edición MusicXML (OpenScore, music21, corales…): se respeta tal cual salvo las reglas comunes',
  };
  const fuenteDe = o => o && o.reconstruida ? 'reconstruida' : o && o.convertida ? 'convertida' : 'edicion';

  // =========================================================================================================
  // 3. TRANSFORMACIONES (registro único). tipo:
  //   'presentacion'  qué se muestra del original en un ejemplo armónico (quita cifrados, dinámicas…): modifica
  //                   propiedades a propósito y lo declara
  //   'estructural'   cambia la estructura musical de forma intencionada (reparto de voces)
  //   'notacion'      corrección de notación: cambia cómo se escribe, nunca qué suena
  // =========================================================================================================
  const TRANSFORMACIONES = [];
  const transformacion = t => { TRANSFORMACIONES.push({ fuentes: Object.keys(FUENTES), modifica: [], activa: () => true, ...t }); return t.aplicar };

  // --- presentación: lo que no se muestra en un ejemplo armónico --------------------------------------------
  // Etiquetas armónicas del archivo (<harmony>, p. ej. «C.I»): Verovio las dibujaría sobre el pentagrama superior y
  // duplicarían, en otra notación, los cifrados que la aplicación graba debajo.
  const quitarArmonias = transformacion({
    id: 'quitar-armonias', regla: 'N-PRES-1', tipo: 'presentacion', modifica: ['armonias'],
    aplicar(doc) { const l = [...doc.getElementsByTagName('harmony')]; l.forEach(h => h.remove()); return l.length },
  });
  // Los ejemplos se muestran solo con notas, ritmos y ligaduras: se quitan dinámicas, reguladores, pedales, textos de
  // expresión, metrónomos y articulaciones, que chocan con los cifrados y con las demás voces. Se conservan las ligaduras
  // (<slur>, <tied>), los cambios de octava (<octave-shift>) y los calderones (<fermata>), que marcan el final de frase y
  // afectan a la lectura de las cadencias. (Antes había además un paso previo que limpiaba las «dinámicas» vacías de la
  // conversión desde Humdrum; era redundante con este, que ya quita todas las dinámicas, y se ha eliminado.)
  const quitarExpresion = transformacion({
    id: 'quitar-expresion', regla: 'N-PRES-2', tipo: 'presentacion', modifica: ['dinamicas', 'textos', 'tempo', 'articulaciones'],
    aplicar(doc) {
      let n = 0;
      for (const d of [...doc.getElementsByTagName('direction')]) {
        const tipos = hijos(d, 'direction-type'), utiles = tipos.filter(t => t.getElementsByTagName('octave-shift').length);
        if (!utiles.length) { d.remove(); n++; continue }
        for (const t of tipos) if (!utiles.includes(t)) { t.remove(); n++ }
        for (const s of [...d.getElementsByTagName('sound')]) if (!s.children.length && !s.textContent.trim()) { s.remove(); n++ }
      }
      for (const tag of ['dynamics', 'articulations']) for (const e of [...doc.getElementsByTagName(tag)]) { e.remove(); n++ }
      for (const e of [...doc.getElementsByTagName('notations')]) if (!e.children.length && !e.textContent.trim()) { e.remove(); n++ }
      return n;
    },
  });
  // Con un solo instrumento, su nombre no se imprime (ocupa sitio a la izquierda del primer sistema y no informa).
  const ocultarNombreUnico = transformacion({
    id: 'ocultar-nombre-unico', regla: 'N-PRES-3', tipo: 'presentacion', modifica: ['nombresInstrumento'],
    aplicar(doc) {
      const sp = doc.getElementsByTagName('score-part'); if (sp.length !== 1) return 0;
      const pn = hijo(sp[0], 'part-name');
      if (pn) { while (pn.attributes.length) pn.removeAttribute(pn.attributes[0].name); pn.setAttribute('print-object', 'no'); pn.textContent = '' }
      const ab = hijo(sp[0], 'part-abbreviation'); if (ab) ab.remove();
      return pn || ab ? 1 : 0;
    },
  });

  // ---------------------------------------------------------------------------------------------------------
  // Voces de las reconstrucciones del DCML (N-CRUCE-1, N-CRUCE-2, N-VOC-1, N-VOC-2, N-VOC-5, N-VOC-6, N-LIG-6)
  // ---------------------------------------------------------------------------------------------------------
  // Las tablas del DCML guardan una voz por cada línea que MuseScore tenía en el pentagrama, y el pentagrama de origen de cada
  // nota (no los cruces de pentagrama). Al reconstruir salen pentagramas con 3 y 4 capas, arpegios sostenidos escritos como una
  // voz por nota y voces interiores en el pentagrama de la otra mano (p. ej. la Allemande de la Suite inglesa n.º 1, cc. 1-5).
  // Una edición profesional (cotejada con la impresa de esa Allemande) hace tres cosas, que aquí se reproducen sobre el MusicXML:
  //   · N-CRUCE-1 cada voz en el pentagrama de su registro (la voz interior de la mano derecha que baja hasta el tenor pasa
  //               a la izquierda);
  //   · N-VOC-1   nunca más de dos capas por pentagrama: la voz interior se escribe en la vecina como acordes, con ligaduras de
  //               unión donde una nota se sostiene mientras la otra se mueve (style brisé);
  //   · N-VOC-2   un unísono entre las dos manos se escribe una sola vez.
  // Las tres trabajan sobre un modelo del compás (grupos = nota o acorde con su instante, duración, pentagrama y voz) y
  // reescriben solo los compases que cambian. Las reconstrucciones solo tienen <note>, <backup>, <forward> y <attributes>.
  const FIGURAS = [[8, 'breve', 0], [6, 'whole', 1], [4, 'whole', 0], [3.5, 'half', 2], [3, 'half', 1], [2, 'half', 0], [1.75, 'quarter', 2], [1.5, 'quarter', 1], [1, 'quarter', 0], [0.875, 'eighth', 2], [0.75, 'eighth', 1], [0.5, 'eighth', 0], [0.375, '16th', 1], [0.25, '16th', 0], [0.1875, '32nd', 1], [0.125, '32nd', 0], [0.0625, '64th', 0]];
  // duración (en divisiones) → figuras sucesivas ligadas, de mayor a menor (como mucho 3); null si no se puede escribir
  function figurasDe(d, div) {
    const out = []; let r = d / div;
    while (r > 1e-9) { const f = FIGURAS.find(x => x[0] <= r + 1e-9); if (!f || out.length === 3 || Math.abs(f[0] * div - Math.round(f[0] * div)) > 1e-9) return null; out.push(f); r -= f[0] }
    return out;
  }
  const ORDEN_NOTA = ['grace', 'cue', 'chord', 'pitch', 'unpitched', 'rest', 'duration', 'tie', 'instrument', 'footnote', 'level', 'voice', 'type', 'dot', 'accidental', 'time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];
  // escribe (o crea en su sitio) el hijo `tag` de una nota
  function ponerHijo(doc, el, tag, texto) {
    let h = hijo(el, tag);
    if (!h) { h = doc.createElement(tag); const k = ORDEN_NOTA.indexOf(tag); const ref = [...el.children].find(c => ORDEN_NOTA.indexOf(c.tagName) > k); ref ? el.insertBefore(h, ref) : el.append(h) }
    if (texto !== undefined) h.textContent = texto;
    return h;
  }
  // ligaduras de unión de una nota: {stop, start}
  const ligadurasDe = el => ({ stop: [...el.children].some(c => c.tagName === 'tie' && c.getAttribute('type') === 'stop'), start: [...el.children].some(c => c.tagName === 'tie' && c.getAttribute('type') === 'start') });
  function ponerLigaduras(doc, el, { stop, start }) {
    for (const c of [...el.children]) if (c.tagName === 'tie') c.remove();
    const nt = hijo(el, 'notations');
    if (nt) { for (const c of [...nt.children]) if (c.tagName === 'tied') c.remove(); if (!nt.children.length) nt.remove() }
    const tipos = [stop && 'stop', start && 'start'].filter(Boolean); if (!tipos.length) return;
    const ref = [...el.children].find(c => ORDEN_NOTA.indexOf(c.tagName) > ORDEN_NOTA.indexOf('tie'));
    for (const ti of tipos) { const e = doc.createElement('tie'); e.setAttribute('type', ti); ref ? el.insertBefore(e, ref) : el.append(e) }
    const n2 = ponerHijo(doc, el, 'notations');
    for (const ti of tipos) { const e = doc.createElement('tied'); e.setAttribute('type', ti); n2.append(e) }
  }
  // figura, puntillos y duración de una nota
  function ponerFigura(doc, el, d, f) {
    ponerHijo(doc, el, 'duration', String(d)); ponerHijo(doc, el, 'type', f[1]);
    for (const c of [...el.children]) if (c.tagName === 'dot') c.remove();
    const tipo = hijo(el, 'type'); for (let k = 0; k < f[2]; k++) tipo.after(doc.createElement('dot'));
  }
  // modelo de los compases de una parte: por compás, {m, div, grupos, raro}; raro = el compás no se debe reescribir
  function leerParte(parte) {
    let div = 1; const out = [];
    for (const m of [...parte.children].filter(c => c.tagName === 'measure')) {
      const grupos = []; let t = 0, ult = null, raro = false, vistoNota = false;
      for (const el of m.children) {
        if (el.tagName === 'attributes') { if (txt(el, 'divisions')) div = +txt(el, 'divisions') || div; if (vistoNota) raro = true; continue }
        const d = +txt(el, 'duration') || 0;
        if (el.tagName === 'backup') { t -= d; vistoNota = true; continue }
        if (el.tagName === 'forward') { t += d; vistoNota = true; continue }
        if (el.tagName !== 'note') { raro = true; continue }
        vistoNota = true;
        if (hijo(el, 'grace') || hijo(el, 'time-modification') || hijo(el, 'cue')) raro = true;
        if (hijo(el, 'chord') && ult) { ult.els.push(el); continue }
        const pitch = hijo(el, 'pitch');
        ult = { t, d, staff: txt(el, 'staff') || '1', voz: txt(el, 'voice') || '1', els: [el], silencio: !pitch };
        if (el.getAttribute('data-hf-casa')) ult.casa = el.getAttribute('data-hf-casa');
        grupos.push(ult); t += d;
      }
      out.push({ m, div, grupos, raro, cambiado: false });
    }
    return out;
  }
  // pentagrama de origen de un grupo: el suyo, salvo las notas que N-CRUCE-2 dibuja en el otro pentagrama sin cambiarlas de voz
  const casa = g => g.casa || g.staff;
  const alturas = g => g.els.map(e => { const p = hijo(e, 'pitch'); return p ? valorPaso(p) : null }).filter(v => v !== null);
  const sonido = e => { const p = hijo(e, 'pitch'); return p ? txt(p, 'step') + (Math.round(+txt(p, 'alter') || 0)) + txt(p, 'octave') : null };
  // voces con notas de un pentagrama: Map voz → {notas, todos, media}
  function vocesDe(grupos, staff) {
    const v = new Map();
    for (const g of grupos) if (casa(g) === staff) { if (!v.has(g.voz)) v.set(g.voz, { voz: g.voz, todos: [], notas: [] }); const x = v.get(g.voz); x.todos.push(g); if (!g.silencio) x.notas.push(g) }
    for (const [k, x] of v) { if (!x.notas.length) { v.delete(k); continue } const a = x.notas.flatMap(alturas); x.media = a.reduce((s, y) => s + y, 0) / a.length }
    return v;
  }
  // reescribe un compás a partir de sus grupos: atributos, y luego cada pentagrama y voz con <forward> en los huecos
  function escribirCompas(doc, C) {
    const { m, grupos } = C;
    const atributos = [...m.children].filter(c => c.tagName === 'attributes');
    while (m.firstChild) m.removeChild(m.firstChild);
    atributos.forEach(a => m.append(a));
    // con notas dibujadas en el otro pentagrama (N-CRUCE-2), una voz no puede compartir número con otra de la otra mano: en MusicXML
    // el número de voz es de la parte, y Verovio las juntaría
    if (grupos.some(g => g.casa && g.casa !== g.staff)) {
      const usados = new Map(); let max = Math.max(0, ...grupos.map(g => +g.voz || 0));
      for (const g of grupos) { const k = g.voz; if (!usados.has(k)) usados.set(k, casa(g)) }
      const nuevo = new Map();
      for (const g of grupos) if (usados.get(g.voz) !== casa(g)) { const k = casa(g) + '|' + g.voz; if (!nuevo.has(k)) nuevo.set(k, String(++max)); g.voz = nuevo.get(k) }
    }
    const voces = new Map();
    for (const g of grupos) { const k = casa(g) + '|' + g.voz; if (!voces.has(k)) voces.set(k, []); voces.get(k).push(g) }
    const claves = [...voces.keys()].sort((a, b) => { const [sa, va] = a.split('|'), [sb, vb] = b.split('|'); return +sa - +sb || +va - +vb });
    const hueco = (tag, d, g) => { const e = doc.createElement(tag), du = doc.createElement('duration'); du.textContent = String(d); e.append(du); if (tag === 'forward') { const v = doc.createElement('voice'); v.textContent = g.voz; const s = doc.createElement('staff'); s.textContent = casa(g); e.append(v, s) } m.append(e) };
    let pos = 0;
    claves.forEach((k, i) => {
      if (i > 0 && pos > 0) hueco('backup', pos, null);
      pos = 0;
      for (const g of voces.get(k).sort((a, b) => a.t - b.t)) {
        if (g.t > pos) hueco('forward', g.t - pos, g);
        g.els.forEach((e, j) => {
          ponerHijo(doc, e, 'voice', g.voz); ponerHijo(doc, e, 'staff', g.staff);
          if (g.casa && g.casa !== g.staff) e.setAttribute('data-hf-casa', g.casa); else e.removeAttribute('data-hf-casa');
          const ch = hijo(e, 'chord'); if (j === 0 && ch) ch.remove(); if (j > 0 && !ch) e.insertBefore(doc.createElement('chord'), e.firstElementChild);
          m.append(e);
        });
        pos = Math.max(pos, g.t + g.d);
      }
    });
    alteracionesExplicitas(doc, m);
  }
  // N-ALT-2 rige por pentagrama: al mover notas de pentagrama o juntar voces, una nota puede leerse con la alteración de otra
  // (un do4 que llega a un pentagrama con un do#4 antes en el compás). En los compases reescritos cada nota con altura lleva su
  // alteración explícita; las que sobran las quita después N-ALT-2. Las notas que llegan ligadas se leen por la ligadura.
  const NOMBRE_ALT = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };
  function alteracionesExplicitas(doc, m) {
    for (const e of m.children) {
      if (e.tagName !== 'note' || hijo(e, 'accidental') || ligadurasDe(e).stop) continue;
      const p = hijo(e, 'pitch'); if (!p) continue;
      const nom = NOMBRE_ALT[Math.round(+txt(p, 'alter') || 0)]; if (!nom) continue;
      ponerHijo(doc, e, 'accidental', nom);
    }
  }
  // las notas de una voz rehecha pierden barras y plicas: barrasAutomaticas y ordenarVoces (index.html) las vuelven a poner
  const limpiar = g => { for (const e of g.els) for (const c of [...e.children]) if (c.tagName === 'beam' || c.tagName === 'stem') c.remove() };
  // ¿suenan a la vez dos listas de grupos con notas?
  const solapan = (A, B) => A.some(a => B.some(b => a.t < b.t + b.d && b.t < a.t + a.d));
  const CENTRO = { '1': 34, '2': 22 };                                    // línea central: si4 en sol, re3 en fa
  const lineasAd = (val, staff) => { const d = Math.abs(val - CENTRO[staff]); return d >= 6 ? Math.floor((d - 4) / 2) : 0 };

  // N-CRUCE-1. En un gran pentagrama (2 pentagramas en la parte), una voz que no es la exterior de su mano (la más aguda de la
  // derecha, la más grave de la izquierda) pasa al otro pentagrama en ese compás si su mano no puede tocarla: a la vez que alguna
  // de sus notas, otra voz del mismo pentagrama está a más de una décima (9 pasos diatónicos; Allemande, c. 1: la5 y la3 en la
  // derecha; c. 5: sol#2 bajo sol#4), en la otra mano esa extensión cabe y allí no pasa de 3 líneas adicionales.
  // Una voz de tenor que la mano izquierda alcanza (la3-do#4 bajo un si2) se queda abajo, como en la edición. No se usan las
  // líneas adicionales para decidir: los cruces de manos de la fuente (Medtner, Op. 26 n.º 4, cc. 38-39: la izquierda por encima
  // de la derecha; Liszt, Sposalizio, c. 58) se escriben así a propósito y se conservan.
  const DECIMA = 9;
  function extension(V, otras) {
    let max = 0;
    for (const g of V.notas) for (const v of alturas(g)) for (const U of otras) for (const h of U.notas)
      if (g.t < h.t + h.d && h.t < g.t + g.d) for (const u of alturas(h)) max = Math.max(max, Math.abs(u - v));
    return max;
  }
  function repartir(C) {
    let cambios = 0;
    for (const s of ['1', '2']) {
      const o = s === '1' ? '2' : '1';
      for (let vuelta = 0; vuelta < 3; vuelta++) {
        const propias = [...vocesDe(C.grupos, s).values()]; if (propias.length < 2) break;
        propias.sort((a, b) => b.media - a.media);                        // de aguda a grave
        const exterior = s === '1' ? propias[0] : propias[propias.length - 1];
        const ajenas = [...vocesDe(C.grupos, o).values()];
        let movida = null;
        for (const V of propias) {
          if (V === exterior) continue;
          const vals = V.notas.flatMap(alturas);
          if (extension(V, propias.filter(x => x !== V)) > DECIMA && extension(V, ajenas) <= DECIMA && Math.max(...vals.map(y => lineasAd(y, o))) <= 3) { movida = V; break }
          // (b) su mano tiene tres o más voces sonando a la vez y la otra como mucho una en ese tramo: la voz más cercana a la otra
          // mano pasa allí si cabe (como mucho 2 líneas adicionales) y no se cruza con ella (Sarabande, c. 5: el mi4 blanca con
          // puntillo de la derecha va en la izquierda, sobre el sol3, como en la edición)
          const cercana = s === '1' ? V === propias[propias.length - 1] : V === propias[0];
          const juntas = V.notas.some(g => propias.filter(x => x !== V && x.notas.some(h => h.t < g.t + g.d && g.t < h.t + h.d)).length >= 2);
          const enTramo = ajenas.filter(x => x.notas.some(h => V.notas.some(g => h.t < g.t + g.d && g.t < h.t + h.d)));
          const sinCruce = enTramo.every(x => s === '1' ? Math.min(...vals) > Math.max(...x.notas.flatMap(alturas)) : Math.max(...vals) < Math.min(...x.notas.flatMap(alturas)));
          if (cercana && juntas && enTramo.length <= 1 && sinCruce && Math.max(...vals.map(y => lineasAd(y, o))) <= 2) { movida = V; break }
        }
        if (!movida) break;
        const libre = String(Math.max(0, ...C.grupos.map(g => +g.voz || 0)) + 1);
        for (const g of movida.todos) { g.staff = o; g.voz = libre }
        cambios++;
      }
    }
    return cambios;
  }

  // N-CRUCE-2. Notas sueltas de una voz interior que pasan al otro pentagrama. En la edición de la Allemande (c. 2) la línea aguda
  // de la mano izquierda (sol#4, la4, si4, mi4, fa#4) se escribe en el pentagrama de la derecha, por debajo de sus notas, en vez de
  // con 3-4 líneas adicionales en clave de fa; el fa#4 anterior (2 líneas) se queda abajo. Aquí, en una voz que no es la exterior
  // de su mano (la más grave de la izquierda, la más aguda de la derecha), una nota que en su pentagrama lleva 3 o más líneas
  // adicionales y en el otro como mucho una pasa al otro pentagrama, y con ella lo que le sigue en ese pulso (para no ir y venir
  // dentro de un grupo) y las notas a las que va ligada. Solo si queda por debajo (o por encima) de todo lo que suena en el otro
  // pentagrama en ese momento: los cruces de manos de la fuente (Medtner, Liszt) no se tocan. La nota sigue en su voz y solo cambia
  // el pentagrama donde se dibuja (data-hf-casa guarda el de origen), así la barra une las notas de los dos pentagramas, como en
  // la edición (c. 2: fa#4 abajo y sol#4 arriba).
  function subirNotas(C) {
    if (!CONFIG.notasAlOtroPentagrama) return 0;
    let cambios = 0;
    const pulso = C.div;                                                // una negra
    for (const s of ['2', '1']) {
      const o = s === '1' ? '2' : '1', arriba = s === '2';             // la izquierda sube; la derecha baja
      const propias = [...vocesDe(C.grupos, s).values()]; if (propias.length < 2) continue;
      propias.sort((a, b) => b.media - a.media);
      const exterior = s === '1' ? propias[0] : propias[propias.length - 1];
      for (const V of propias) {
        if (V === exterior) continue;
        const cabe = n => {
          const a = alturas(n); if (Math.max(...a.map(v => lineasAd(v, o))) > 1) return false;
          const otras = C.grupos.filter(g => g.staff === o && !g.silencio && g.t < n.t + n.d && n.t < g.t + g.d).flatMap(alturas);
          return !otras.length || (arriba ? Math.max(...a) < Math.min(...otras) : Math.min(...a) > Math.max(...otras));
        };
        let movidas = 0, siguiendo = -1;
        const notas = V.notas.slice().sort((a, b) => a.t - b.t);
        for (let i = 0; i < notas.length; i++) {
          const n = notas[i], q = Math.floor(n.t / pulso), lejos = Math.min(...alturas(n).map(v => lineasAd(v, s))) >= 3;
          const ligada = i > 0 && notas[i - 1].staff === o && notas[i - 1].casa && notas[i - 1].t + notas[i - 1].d === n.t && n.els.some(e => ligadurasDe(e).stop);
          if (!((lejos || siguiendo === q || ligada) && cabe(n))) { if (siguiendo !== q) siguiendo = -1; continue }
          n.casa = casa(n); n.staff = o; siguiendo = q; movidas++;   // misma voz: Verovio dibuja la barra que cruza de pentagrama
        }
        cambios += movidas;
      }
    }
    // las barras de las dos manos se rehacen (barrasAutomaticas): una barra que unía una nota que se ha movido quedaría abierta
    if (cambios) for (const g of C.grupos) limpiar(g);
    return cambios;
  }

  // N-VOC-1. Mientras un pentagrama tenga más de dos voces con notas, una voz interior V se escribe dentro de una vecina W:
  //   · si no suenan nunca a la vez, se intercalan (los silencios de W donde suena V desaparecen);
  //   · si W suena (sin silencios) durante todas las notas de V, las dos se parten en la unión de sus ataques y se escriben
  //     como acordes de W, ligando los trozos de una misma nota. Un unísono en el ataque de V con la nota de W se omite y la
  //     ligadura sale de la nota de W (el arpegio sostenido). Se rechaza si un trozo no se puede escribir con figuras, si un
  //     unísono choca con un ataque, o si añade más de una ligadura por pulso de media (o más de dos en un mismo pulso).
  function intercalar(V, W, grupos) {
    const fuera = new Set(V.todos);
    const restos = grupos.filter(g => !fuera.has(g) && !(casa(g) === casa(W.notas[0]) && g.voz === W.voz && g.silencio && V.notas.some(v => g.t < v.t + v.d && v.t < g.t + g.d)));
    for (const g of V.notas) restos.push({ ...g, voz: W.voz });           // copia: el candidato puede no elegirse
    return restos;
  }
  function acordar(doc, V, W, grupos, div) {
    const staff = W.notas[0].staff, casaW = W.notas[0].casa;
    const cubre = v => { let t = v.t; for (const w of W.todos.filter(w => !w.silencio).sort((a, b) => a.t - b.t)) { if (w.t > t) break; if (w.t + w.d > t) t = w.t + w.d } return t >= v.t + v.d };
    if (!V.notas.every(cubre)) return null;
    const cortes = new Set(); for (const g of [...V.notas, ...W.todos]) { cortes.add(g.t); cortes.add(g.t + g.d) }
    const nuevos = [], porPulso = new Map(); let ligNuevas = 0;
    const clon = (e, d, f, lig) => { const c = e.cloneNode(true); ponerFigura(doc, c, d, f); ponerLigaduras(doc, c, lig); if (!lig.primero) { const a = hijo(c, 'accidental'); if (a) a.remove() } return c };
    for (const w of W.todos.sort((a, b) => a.t - b.t)) {
      const fin = w.t + w.d, puntos = [w.t, ...[...cortes].filter(x => x > w.t && x < fin).sort((a, b) => a - b), fin];
      const ligW = w.els.map(ligadurasDe);
      for (let k = 0; k + 1 < puntos.length; k++) {
        const a = puntos[k], b = puntos[k + 1], v = V.notas.find(x => x.t <= a && a < x.t + x.d);
        // figuras de este trozo (si no cabe en una, varias ligadas)
        const fs = figurasDe(b - a, div); if (!fs) return null;
        const piezas = []; let t0 = a; for (const f of fs) { const d = Math.round(f[0] * div); piezas.push([t0, d, f]); t0 += d }
        if (w.silencio) { if (v) return null; for (const [t1, d, f] of piezas) { const c = w.els[0].cloneNode(true); ponerFigura(doc, c, d, f); nuevos.push({ t: t1, d, staff, casa: casaW, voz: W.voz, els: [c], silencio: true }) } continue }
        const sonW = w.els.map(sonido), ligV = v ? v.els.map(ligadurasDe) : [];
        // notas de V en este trozo: las que no son unísono de W; un unísono solo vale si W y V empiezan juntas o siguen las dos
        const deV = [];
        if (v) v.els.forEach((e, j) => {
          const i = sonW.indexOf(sonido(e));
          if (i < 0) { deV.push([e, j]); return }
          // un unísono solo se omite si las dos notas atacan aquí o las dos se sostienen; una nota que llega ligada (del compás
          // anterior) no ataca: omitir el unísono de V perdería su ataque (Couperin, L'Art de toucher, 4.º preludio)
          const wAtaca = a === w.t && !ligW[i].stop, vAtaca = a === v.t && !ligV[j].stop;
          if (wAtaca !== vAtaca) deV.push(null);
        });
        if (deV.includes(null)) return null;
        // nota de W unísona con una de V que sigue sonando tras este trozo: la ligadura sale de W hacia el trozo siguiente de V
        const sigueV = e => !!v && b < v.t + v.d && v.els.some(x => sonido(x) === sonido(e));
        piezas.forEach(([t1, d, f], p) => {
          const ultimaPieza = p === piezas.length - 1, primeraPieza = p === 0;
          const els = w.els.map((e, i) => clon(e, d, f, {
            stop: !primeraPieza || a > w.t || ligW[i].stop,
            start: !ultimaPieza || b < fin || ligW[i].start || sigueV(e),
            primero: primeraPieza && a === w.t
          }));
          for (const [e, j] of deV) els.push(clon(e, d, f, {
            stop: !primeraPieza || a > v.t || ligV[j].stop,
            start: !ultimaPieza || b < v.t + v.d || ligV[j].start,
            primero: primeraPieza && a === v.t
          }));
          nuevos.push({ t: t1, d, staff, casa: casaW, voz: W.voz, els, silencio: false });
          // ligadura nueva: se parte una nota de W, o una nota de V sigue sonando en el trozo siguiente
          if (!ultimaPieza || a > w.t || b < fin || (deV.length && b < v.t + v.d)) { ligNuevas++; const q = Math.floor(t1 / div); porPulso.set(q, (porPulso.get(q) || 0) + 1) }
        });
      }
    }
    const pulsos = Math.max(1, Math.max(...grupos.map(g => g.t + g.d)) / div);
    if (ligNuevas > pulsos || Math.max(0, ...porPulso.values()) > 2) return null;
    const fuera = new Set([...V.todos, ...W.todos]);
    return { grupos: [...grupos.filter(g => !fuera.has(g)), ...nuevos], lig: ligNuevas };
  }
  // ¿atacan dos voces la misma nota a la vez? (sin contar las notas que llegan ligadas)
  const ataques = g => g.els.filter(e => hijo(e, 'pitch') && !ligadurasDe(e).stop).map(e => g.t + '|' + sonido(e));
  const atacanUnisono = (V, W) => { const a = new Set(V.notas.flatMap(ataques)); return W.notas.some(g => ataques(g).some(k => a.has(k))) };
  function reducir(doc, C) {
    let cambios = 0;
    for (const s of [...new Set(C.grupos.map(casa))]) {
      for (let vuelta = 0; vuelta < 4; vuelta++) {
        const voces = [...vocesDe(C.grupos, s).values()]; if (voces.length <= 2) break;
        voces.sort((a, b) => b.media - a.media);
        // voces de un arpegio sostenido: las que atacan una nota a la vez que otra voz
        const brise = new Set(); for (const A of voces) for (const B of voces) if (A !== B && atacanUnisono(A, B)) { brise.add(A); brise.add(B) }
        // candidatos: cada voz absorbida en una vecina (por altura); se elige la que añade menos ligaduras y, a igualdad,
        // la que absorbe una voz interior y la más cercana en altura
        let mejor = null;
        voces.forEach((V, k) => {
          for (const W of [voces[k - 1], voces[k + 1]]) {
            if (!W) continue;
            // las voces de un arpegio sostenido (style brisé: alguna ataca una nota a la vez que otra voz) se dejan en sus capas,
            // como la edición, y comparten la cabeza (N-VOC-5); no se convierten en acordes ligados
            if (brise.has(V) || brise.has(W)) continue;
            // partir una nota en trozos ligados para meterla en el acorde de otra voz (acordar) llena el compás de notas repetidas y
            // ligadas que la edición escribe como una sola figura en su capa (Sarabande de la Suite inglesa n.º 1, c. 5: el la4 negra
            // aparte, no la4 corchea con puntillo + fusa + fusa ligadas); solo con CONFIG.trozosLigados
            const r = !solapan(V.notas, W.notas) ? { grupos: intercalar(V, W, C.grupos), lig: 0 } : CONFIG.trozosLigados ? acordar(doc, V, W, C.grupos, C.div) : null;
            if (!r) continue;
            const coste = r.lig * 10 + (k === 0 || k === voces.length - 1 ? 5 : 0) + Math.abs(V.media - W.media) / 10;
            if (!mejor || coste < mejor.coste) mejor = { ...r, coste };
          }
        });
        // último recurso: dos voces cualesquiera que no suenan nunca a la vez
        if (!mejor) for (const V of voces) { for (const W of voces) if (V !== W && !brise.has(V) && !brise.has(W) && !solapan(V.notas, W.notas)) { mejor = { grupos: intercalar(V, W, C.grupos) }; break } if (mejor) break }
        if (!mejor) break;
        for (const g of mejor.grupos) if (casa(g) === s) limpiar(g);
        C.grupos = mejor.grupos; cambios++;
      }
    }
    return cambios;
  }

  // N-VOC-6 (Gould: las voces que coinciden en ritmo comparten plica, como un acorde). En la edición de la Allemande (c. 3, 4.ª
  // parte: do#5 y la4; c. 4: fa#4 y re#4) dos de tres voces que atacan a la vez con la misma figura van en un acorde de una plica, y
  // la tercera sigue aparte. Con dos voces que coinciden solo en parte no se juntan (cc. 6-7: se lee el contrapunto); si coinciden
  // en todo el compás, van en acordes (homorritmia). Aquí, con tres o más voces, en un pentagrama donde suenan a la vez
  // tres o más voces, la nota de una voz interior que coincide en instante y duración con la de una voz vecina pasa al acorde de
  // esta, si no es unísono (N-VOC-5) y entre las dos caben en una mano (una décima). También las notas que llegan ligadas: en la
  // edición, las notas sostenidas de un arpegio (c. 1, izquierda: la3, do#4 y mi4; c. 2, derecha: mi5 y do#5) llegan ligadas a un
  // mismo acorde. La ligadura queda entonces entre dos capas, y eso lo resuelve ligadurasEntreCapas.
  // Dos voces con el mismo ritmo en todo el compás (mismos ataques, duraciones, silencios y ligaduras), sin cruzarse, sin unísonos y
  // en una décima: se escriben como acordes de una voz (terceras y sextas paralelas escritas como dos voces).
  function homorritmia(C, [W, V], s) {
    if (!CONFIG.homorritmia) return 0;
    const huella = X => X.todos.map(g => g.t + '/' + g.d + (g.silencio ? 'r' : '') + (g.silencio ? '' : '|' + g.els.map(e => { const l = ligadurasDe(e); return (l.stop ? 's' : '') + (l.start ? 'i' : '') }).sort()[0])).sort().join(' ');
    if (huella(V) !== huella(W)) return 0;
    for (const n of V.notas) {
      const m = W.notas.find(g => g.t === n.t); if (!m) return 0;
      const an = alturas(n), am = alturas(m);
      if (Math.min(...am) <= Math.max(...an) || Math.max(...am, ...an) - Math.min(...am, ...an) > DECIMA) return 0;   // sin cruzarse ni unísonos, en una décima
    }
    for (const n of V.notas) { const m = W.notas.find(g => g.t === n.t); m.els = [...m.els, ...n.els] }
    C.grupos = C.grupos.filter(g => !V.todos.includes(g));
    for (const g of C.grupos) if (casa(g) === s) limpiar(g);
    return 1;
  }
  function condensar(C) {
    let cambios = 0;
    for (const s of [...new Set(C.grupos.map(casa))]) {
      const voces = [...vocesDe(C.grupos, s).values()]; if (voces.length < 2) continue;
      voces.sort((a, b) => b.media - a.media);
      if (voces.length === 2) { cambios += homorritmia(C, voces, s); continue }
      if (!CONFIG.vocesCondensadas) continue;
      const hechos = [];
      const suenan = t => voces.filter(V => V.notas.some(g => g.t <= t && t < g.t + g.d)).length;
      for (let k = 1; k < voces.length - 1; k++) {
        const V = voces[k];
        for (const n of [...V.notas]) {
          if (suenan(n.t) < 3) continue;
          const an = alturas(n), sn = n.els.map(sonido);
          let mejor = null;
          for (const W of [voces[k - 1], voces[k + 1]]) {
            const m = W.notas.find(g => g.t === n.t && g.d === n.d); if (!m || m.cond) continue;
            const am = alturas(m); if (m.els.some(e => sn.includes(sonido(e)))) continue;          // unísono: N-VOC-5
            const todas = [...an, ...am]; if (Math.max(...todas) - Math.min(...todas) > DECIMA) continue;
            const arriba = W === voces[k - 1]; if (arriba ? Math.min(...am) <= Math.max(...an) : Math.max(...am) >= Math.min(...an)) continue;   // sin cruzarse
            const dist = Math.min(...am.flatMap(a => an.map(b => Math.abs(a - b))));
            if (!mejor || dist < mejor.dist) mejor = { m, dist };
          }
          if (!mejor) continue;
          mejor.m.els = [...mejor.m.els, ...n.els]; mejor.m.cond = true; hechos.push(mejor.m);
          C.grupos.splice(C.grupos.indexOf(n), 1); V.notas.splice(V.notas.indexOf(n), 1);
          cambios++;
        }
      }
      // dos acordes condensados seguidos en el mismo pulso, de voces distintas (Allemande, c. 2: las dos corcheas de la 2.ª parte):
      // el segundo pasa a la voz del primero si está libre, para que vayan bajo una barra, como en la edición
      hechos.sort((a, b) => a.t - b.t);
      for (let i = 0; i + 1 < hechos.length; i++) {
        const A = hechos[i], B = hechos[i + 1];
        if (A.voz === B.voz || A.t + A.d !== B.t || Math.floor(A.t / C.div) !== Math.floor(B.t / C.div) || A.d > C.div / 2 || B.d > C.div / 2) continue;
        const pisa = g => g !== B && casa(g) === s && g.voz === A.voz && g.t < B.t + B.d && B.t < g.t + g.d;
        if (C.grupos.some(g => pisa(g) && !g.silencio)) continue;
        C.grupos = C.grupos.filter(g => !pisa(g));                        // los silencios de relleno de esa voz donde entra el acorde
        B.voz = A.voz; cambios++;
      }
      if (cambios) for (const g of C.grupos) if (casa(g) === s) limpiar(g);
    }
    for (const g of C.grupos) delete g.cond;
    return cambios;
  }

  // N-VOC-2. La misma nota (altura y grafía) atacada a la vez en las dos manos: se queda la más larga, o, si duran lo mismo,
  // la del pentagrama más cercano a su registro. Dentro de un mismo pentagrama no se toca: un unísono entre dos voces se
  // escribe con una cabeza y dos plicas, y eso ya lo resuelve el grabador.
  function unisonosManos(C) {
    let cambios = 0;
    const notas = []; for (const g of C.grupos) if (!g.silencio) g.els.forEach(e => notas.push({ g, e, s: sonido(e), v: valorPaso(hijo(e, 'pitch')) }));
    const quitar = new Set();
    for (const x of notas) for (const y of notas) {
      if (x === y || x.g.staff === y.g.staff || x.s !== y.s || x.g.t !== y.g.t || quitar.has(x.e) || quitar.has(y.e)) continue;
      if (ligadurasDe(x.e).stop || ligadurasDe(y.e).stop) continue;
      const peor = x.g.d !== y.g.d ? (x.g.d < y.g.d ? x : y) : (lineasAd(x.v, x.g.staff) >= lineasAd(y.v, y.g.staff) ? x : y);
      quitar.add(peor.e);
    }
    if (!quitar.size) return 0;
    for (const g of [...C.grupos]) {
      const quedan = g.els.filter(e => !quitar.has(e)); if (quedan.length === g.els.length) continue;
      cambios += g.els.length - quedan.length;
      if (quedan.length) g.els = quedan; else C.grupos.splice(C.grupos.indexOf(g), 1);
    }
    return cambios;
  }

  // N-VOC-5 (Gould: dos voces que comparten una nota la escriben con una sola cabeza y dos plicas, cada una con su duración)
  // Es la escritura del style brisé en la edición de la Allemande (c. 2): mi5 y do#5 en semicorcheas con barra, plica abajo, y
  // las mismas cabezas con plica arriba y su duración real (corchea con puntillo, corchea). Dos pasos:
  //   · XML: si dos voces de un pentagrama atacan a la vez la misma nota con la plica en el mismo sentido, la voz que no es
  //     exterior del pentagrama (o, si las dos lo son o ninguna, la de menos notas) pasa a la plica contraria en todo el compás;
  //   · SVG: Verovio solo comparte la cabeza si las dos notas son iguales de figura y puntillo; si no, la desplaza a un lado.
  //     Aquí se lleva una nota (cabeza, plica, corchete, puntillos y alteración) sobre la otra y se ajustan sus ligaduras.
  function plicasUnisonoDoc(doc) {
    if (!CONFIG.cabezaCompartida) return 0;
    let cambios = 0;
    for (const parte of doc.getElementsByTagName('part')) for (const C of leerParte(parte)) {
      if (C.raro) continue;
      for (const s of [...new Set(C.grupos.map(casa))]) {
        const voces = [...vocesDe(C.grupos, s).values()]; if (voces.length < 2) continue;
        voces.sort((a, b) => b.media - a.media);
        const exterior = V => V === voces[0] || V === voces[voces.length - 1];
        const plica = V => { const e = V.notas.map(g => hijo(g.els[0], 'stem')).find(Boolean); return e ? e.textContent.trim() : null };
        for (let i = 0; i < voces.length; i++) for (let j = i + 1; j < voces.length; j++) {
          const A = voces[i], B = voces[j]; if (!atacanUnisono(A, B)) continue;
          const pa = plica(A), pb = plica(B); if (!pa || pa !== pb) continue;
          const mover = exterior(A) !== exterior(B) ? (exterior(A) ? B : A) : (A.notas.length <= B.notas.length ? A : B);
          const otra = mover === A ? pa : pb, nueva = otra === 'up' ? 'down' : 'up';
          for (const g of mover.notas) for (const e of g.els) { if (e.getAttribute('data-hf-casa')) continue; ponerHijo(doc, e, 'stem', nueva); cambios++ }
        }
      }
    }
    return cambios;
  }
  // N-LIG-6. Ligaduras de unión entre dos capas. Verovio solo une las de MusicXML dentro de la misma voz (las demás quedan abiertas
  // o se enganchan a otra nota de la misma altura de su capa). Al condensar voces (N-VOC-6) una nota sostenida puede acabar en el
  // acorde de otra voz, ligada desde su capa de origen (Allemande, c. 2: el do#5 en corchea llega al acorde de corcheas). Aquí se
  // busca, por pentagrama y altura, la nota que recibe cada ligadura; si está en otra voz, se quita la ligadura de la notación
  // (<tied>; <tie>, el sonido, se conserva) y se anota el par en las dos notas (id y data-hf-tie). ligadurasMEI la añade después
  // como <tie> de MEI, que sí une notas de capas distintas.
  function ligadurasEntreCapasDoc(doc) {
    if (!CONFIG.ligadurasEntreCapas) return 0;
    let cambios = 0, k = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      const notas = []; let base = 0, div = 1;
      for (const m of [...parte.children].filter(c => c.tagName === 'measure')) {
        let t = 0, ult = 0, fin = 0;
        for (const el of m.children) {
          if (el.tagName === 'attributes' && txt(el, 'divisions')) { const nd = +txt(el, 'divisions') || div; base = base * nd / div; div = nd }
          const d = +txt(el, 'duration') || 0;
          if (el.tagName === 'backup') { t -= d; continue }
          if (el.tagName === 'forward') { t += d; fin = Math.max(fin, t); continue }
          if (el.tagName !== 'note') continue;
          const acorde = !!hijo(el, 'chord'), gracia = !!hijo(el, 'grace'); if (acorde) t -= ult;
          if (hijo(el, 'pitch') && !gracia) notas.push({ el, t: base + t, d, staff: el.getAttribute('data-hf-casa') || txt(el, 'staff') || '1', voz: txt(el, 'voice') || '1', s: sonido(el), lig: ligadurasDe(el) });
          if (!gracia) { t += d; ult = d } fin = Math.max(fin, t);
        }
        base += fin;
      }
      const llegan = new Map(); for (const n of notas) if (n.lig.stop) { const c = n.staff + '|' + n.s + '|' + n.t; if (!llegan.has(c)) llegan.set(c, []); llegan.get(c).push(n) }
      for (const a of notas) {
        if (!a.lig.start) continue;
        const cand = llegan.get(a.staff + '|' + a.s + '|' + (a.t + a.d)); if (!cand || !cand.length) continue;
        if (cand.some(b => b.voz === a.voz)) continue;                     // la recibe una nota de su voz: Verovio la dibuja
        const b = cand[0];
        const dirTied = [...(hijo(a.el, 'notations') || { children: [] }).children].find(ti => ti.tagName === 'tied' && ti.getAttribute('type') === 'start');
        if (dirTied && dirTied.getAttribute('placement')) a.el.setAttribute('data-hf-tie-dir', dirTied.getAttribute('placement'));   // N-LIG-3 → curvedir de MEI
        for (const [n, tipo] of [[a.el, 'start'], [b.el, 'stop']]) { const nt = hijo(n, 'notations'); if (nt) { for (const ti of [...nt.children]) if (ti.tagName === 'tied' && ti.getAttribute('type') === tipo) ti.remove(); if (!nt.children.length) nt.remove() } }
        for (const n of [a.el, b.el]) if (!n.getAttribute('id')) n.setAttribute('id', 'hf-lig' + (k++));
        a.el.setAttribute('data-hf-tie', [a.el.getAttribute('data-hf-tie'), b.el.getAttribute('id')].filter(Boolean).join(' '));
        cand.splice(cand.indexOf(b), 1); cambios++;
      }
    }
    return cambios;
  }
  // pares de ligaduras pendientes de un MusicXML (los anota ligadurasEntreCapas)
  function ligadurasPendientes(xml) {
    const out = [];
    for (const m of (xml || '').matchAll(/<note\b[^>]*>/g)) {
      const id = (m[0].match(/\sid="([^"]+)"/) || [])[1], fin = (m[0].match(/\sdata-hf-tie="([^"]+)"/) || [])[1], dir = (m[0].match(/\sdata-hf-tie-dir="(above|below)"/) || [])[1];
      if (id && fin) for (const b of fin.split(/\s+/)) out.push(dir ? [id, b, dir] : [id, b]);
    }
    return out;
  }
  // añade al MEI (de tk.getMEI()) las ligaduras pendientes, en el compás donde empieza cada una
  function ligadurasMEI(mei, pares) {
    for (const [a, b, dir] of pares) {
      const i = mei.indexOf(`xml:id="${a}"`), j = mei.indexOf(`xml:id="${b}"`); if (i < 0 || j < 0) continue;
      const fin = mei.indexOf('</measure>', i); if (fin < 0) continue;
      mei = mei.slice(0, fin) + `<tie startid="#${a}" endid="#${b}"${dir ? ` curvedir="${dir}"` : ''}/>` + mei.slice(fin);
    }
    return mei;
  }

  // Cada regla de voces es un paso propio del registro, con lo que declara modificar; todas trabajan compás a compás sobre el
  // modelo de grupos y solo reescriben los compases que cambian. Orden: reparto entre manos (N-CRUCE-1, N-CRUCE-2), dos capas
  // (N-VOC-1), condensar (N-VOC-6), unísonos entre manos (N-VOC-2); todo antes de elegir las claves (N-CLAVE-1).
  function porCompas(fn, soloGranPentagrama) {
    return doc => {
      let total = 0;
      for (const parte of doc.getElementsByTagName('part')) {
        const staves = Math.max(1, ...[...parte.getElementsByTagName('staves')].map(e => +e.textContent || 1));
        if (soloGranPentagrama && staves !== 2) continue;
        for (const C of leerParte(parte)) { if (C.raro) continue; const n = fn(doc, C); if (n) { escribirCompas(doc, C); total += n } }
      }
      return total;
    };
  }
  const repartirDoc = porCompas((doc, C) => CONFIG.vocesPorRegistro ? repartir(C) : 0, true);
  const subirNotasDoc = porCompas((doc, C) => subirNotas(C), true);
  const reducirDoc = porCompas((doc, C) => CONFIG.dosCapas ? reducir(doc, C) : 0, false);
  const condensarDoc = porCompas((doc, C) => CONFIG.vocesCondensadas || CONFIG.homorritmia ? condensar(C) : 0, false);
  const unisonosManosDoc = porCompas((doc, C) => CONFIG.unisonosUnaVez ? unisonosManos(C) : 0, true);
  // lo que cambia cada paso (Musica.PROPIEDADES): reparto, pentagrama y número de voz; los silencios de relleno de la
  // reconstrucción viajan con su voz o desaparecen al fundirla
  const VOCES_MOD = ['voces', 'numeracionVoces', 'pentagramas', 'silencios', 'silenciosVisibles', 'alteracionesEscritas'];
  transformacion({ id: 'voces-a-su-mano', regla: 'N-CRUCE-1', tipo: 'estructural', fuentes: ['reconstruida'], modifica: VOCES_MOD, aplicar: repartirDoc });
  transformacion({ id: 'notas-al-otro-pentagrama', regla: 'N-CRUCE-2', tipo: 'estructural', fuentes: ['reconstruida'], modifica: VOCES_MOD, aplicar: subirNotasDoc });
  // N-VOC-1 parte notas en trozos ligados (acordar): cambian notas, duraciones, acordes, ligaduras y alteraciones escritas de
  // los trozos; lo que suena no cambia (la suma de las duraciones ligadas de cada altura es la misma)
  transformacion({ id: 'dos-capas', regla: 'N-VOC-1', tipo: 'estructural', fuentes: ['reconstruida'], modifica: [...VOCES_MOD, 'notas', 'duraciones', 'acordes', 'ligadurasUnion', 'alteracionesEscritas'], aplicar: reducirDoc });
  transformacion({ id: 'voces-condensadas', regla: 'N-VOC-6', tipo: 'estructural', fuentes: ['reconstruida'], modifica: [...VOCES_MOD, 'acordes'], aplicar: condensarDoc });
  // N-VOC-2 quita la copia de un unísono entre manos: una nota menos (la que se oye igual en la otra mano)
  transformacion({ id: 'unisono-entre-manos', regla: 'N-VOC-2', tipo: 'estructural', fuentes: ['reconstruida'], modifica: [...VOCES_MOD, 'notas', 'duraciones', 'acordes', 'ligadurasUnion', 'alteracionesEscritas'], aplicar: unisonosManosDoc });

  // --- N-CLAVE-1: claves -----------------------------------------------------------------------------------
  // Reconstrucciones (DCML): la reconstrucción pone una sola clave por pentagrama para toda la pieza. Aquí se elige,
  // compás a compás, la clave que pediría un copista: las propias del instrumento (violonchelo: fa, tenor y sol; viola:
  // do en 3.ª y sol; tenor vocal: sol octava baja; teclado: sol y fa…), evitando pasajes con 3 o más líneas adicionales,
  // sin cambios de un compás y cambiando solo en la barra de compás (programación dinámica).
  const CLAVES = { G2: { s: 'G', l: 2, c: 34 }, 'G2-1': { s: 'G', l: 2, o: -1, c: 27 }, F4: { s: 'F', l: 4, c: 22 }, C3: { s: 'C', l: 3, c: 28 }, C4: { s: 'C', l: 4, c: 26 } };
  function clavesDeInstrumento(nombre) {
    const t = (nombre || '').toLowerCase();
    if (/cello|violoncell|gamba/.test(t)) return { c: ['F4', 'C4', 'G2'], d: 'F4' };
    if (/viola\b|bratsche/.test(t)) return { c: ['C3', 'G2'], d: 'C3' };
    if (/violin|flute|flöte|oboe|recorder|clarinet|trumpet|cornet/.test(t)) return { c: ['G2'], d: 'G2' };
    if (/continuo|bassoon|fagott/.test(t)) return { c: ['F4', 'C4'], d: 'F4' };
    // voces: una clave para toda la pieza (la de su tesitura); se cambia solo si la parte se sale mucho de ella
    if (/tenor/.test(t)) return { c: ['G2-1', 'F4', 'G2'], d: 'G2-1', voz: 1 };
    if (/bass|basso|bajo/.test(t)) return { c: ['F4', 'G2-1'], d: 'F4', voz: 1 };
    if (/soprano|alto|mezzo|contralto|canto/.test(t)) return { c: ['G2', 'G2-1'], d: 'G2', voz: 1 };
    if (/voice|voce|stimme/.test(t)) return { c: ['G2', 'G2-1', 'F4'], d: null, voz: 1 };
    return { c: ['G2', 'F4'], d: null };                     // teclado o desconocido: gran pentagrama sol / fa
  }
  // `solo` (Set de índices de pentagrama): corrige solo esos pentagramas partiendo de las claves del editor
  function asignarClaves(doc, inst, solo = null) {
    const partes = [...doc.getElementsByTagName('part')];
    const lineas = (pos, clave) => { const d = Math.abs(pos - CLAVES[clave].c); return d >= 6 ? Math.floor((d - 4) / 2) : 0 };
    const coste = L => L <= 2 ? 0.15 * L : 0.3 + 1.5 * (L - 2);
    // pentagramas: una parte puede tener varios (gran pentagrama del teclado, <staves>2)
    const pent = [];
    for (const parte of partes) {
      const compases = compasesDe(parte); if (!compases.length) continue;
      const n = Math.max(1, ...[...parte.getElementsByTagName('staves')].map(e => +e.textContent || 1));
      for (let s = 1; s <= n; s++) {
        // clave que escribió el editor en cada compás (para respetarla cuando solo se corrigen algunos pentagramas)
        let k = n === 2 && s === 2 ? 'F4' : 'G2'; const orig = compases.map(m => {
          for (const c of m.getElementsByTagName('clef')) if (+(c.getAttribute('number') || 1) === s) {
            const x = txt(c, 'sign') + txt(c, 'line') + (+(txt(c, 'clef-octave-change') || 0) === -1 ? '-1' : ''); if (CLAVES[x]) k = x
          } return k
        });
        pent.push({ parte, compases, s, n, orig, alt: compases.map(() => []) });
      }
    }
    for (const P of pent) {
      P.compases.forEach((m, i) => {
        for (const no of m.children) {
          if (no.tagName !== 'note') continue;
          if (P.n > 1 && +(txt(no, 'staff') || 1) !== P.s) continue;
          const pi = hijo(no, 'pitch'); if (pi) P.alt[i].push((PASOS[txt(pi, 'step')] ?? 0) + 7 * (+(txt(pi, 'octave') || 4)))
        }
      });
    }
    const nombres = inst && inst.length === pent.length ? inst : [];
    pent.forEach((P, g) => {
      const todas = P.alt.flat(); if (!todas.length || (solo && !solo.has(g))) { P.elegida = null; return }
      const nom = nombres[g]; let { c: cand, d: def, voz } = clavesDeInstrumento(nom);
      const total = k => todas.reduce((s, q) => s + coste(lineas(q, k)), 0);
      if (!def) {
        // gran pentagrama: el de arriba en sol y el de abajo en fa
        const hermanos = P.n === 2 ? 2 : nombres.length ? nombres.filter(x => x === nom).length : 0;
        const arriba = P.n === 2 ? P.s === 1 : nombres.indexOf(nom) === g;
        if (!voz && hermanos === 2) def = arriba ? 'G2' : 'F4';
        else def = cand.reduce((a, b) => total(b) < total(a) ? b : a);
      }
      if (voz) { const mejor = cand.reduce((a, b) => total(b) < total(a) ? b : a); if (total(mejor) < total(def) * 0.5 - 2) def = mejor }
      // teclado: la mano izquierda se queda en fa salvo un pasaje agudo sostenido (en la edición de la Allemande de la Suite
      // inglesa n.º 1 no cambia de clave en toda la pieza, aunque el tenor suba a mi4); la derecha sigue con 0,6
      const izquierda = CONFIG.izquierdaEnFa && !voz && P.n === 2 && P.s === 2 && def === 'F4';
      const CAMBIO = voz ? 10 : 6, SESGO = voz ? 1.5 : izquierda ? 2 : 0.6;
      // con «solo» (partitura original) se parte de las claves del editor: cambiar una cuesta, y solo compensa donde
      // ahorra muchas líneas adicionales
      cand = solo ? [...new Set([...cand, ...P.orig])] : cand;
      // el sesgo de la izquierda solo en los compases que caben en fa con 2 líneas adicionales o menos (un tenor la3-mi4, donde fa y
      // sol empatan): una izquierda aguda de verdad pasa a sol (Bartók, Bagatela n.º 1: las dos manos en sol)
      const sesgo = ps => izquierda && !ps.every(q => lineas(q, 'F4') <= 2) ? 0.6 : SESGO;
      const loc = P.alt.map((ps, i) => cand.map(k => (solo ? (k === P.orig[i] ? 0 : 2) : (k === def ? 0 : sesgo(ps))) + ps.reduce((s, q) => s + coste(lineas(q, k)), 0)));
      let prev = loc[0].slice(); const atras = [];
      for (let i = 1; i < loc.length; i++) {
        const de = [], act = cand.map((k, j) => { let mejor = Infinity, arg = 0; cand.forEach((k2, j2) => { const v = prev[j2] + (j2 === j ? 0 : CAMBIO); if (v < mejor) { mejor = v; arg = j2 } }); de.push(arg); return mejor + loc[i][j] });
        atras.push(de); prev = act;
      }
      let j = prev.indexOf(Math.min(...prev)); P.elegida = new Array(loc.length);
      for (let i = loc.length - 1; i >= 0; i--) { P.elegida[i] = cand[j]; if (i > 0) j = atras[i - 1][j] }
    });
    // se reescriben las claves (solo de los pentagramas con notas)
    let cambios = 0;
    for (const P of pent) {
      if (!P.elegida) continue;
      for (const cl of [...P.parte.getElementsByTagName('clef')]) if (P.n === 1 || +(cl.getAttribute('number') || 1) === P.s) { cl.remove(); cambios++ }
    }
    for (const P of pent) {
      if (!P.elegida) continue;
      P.elegida.forEach((k, i) => {
        if (i > 0 && k === P.elegida[i - 1]) return;
        const at = atributosIniciales(doc, P.compases[i]);
        const cl = doc.createElement('clef'), sg = doc.createElement('sign'), ln = doc.createElement('line'), K = CLAVES[k];
        if (P.n > 1) cl.setAttribute('number', String(P.s));
        sg.textContent = K.s; ln.textContent = String(K.l); cl.append(sg, ln);
        if (K.o) { const oc = doc.createElement('clef-octave-change'); oc.textContent = String(K.o); cl.append(oc) }
        // orden de MusicXML: las claves van tras divisions/key/time/staves…, por número de pentagrama
        const tras = [...at.children].find(c => ['staff-details', 'transpose', 'directive', 'measure-style'].includes(c.tagName) || (c.tagName === 'clef' && +(c.getAttribute('number') || 1) > P.s));
        tras ? at.insertBefore(cl, tras) : at.append(cl); cambios++;
      });
    }
    return cambios;
  }
  transformacion({
    id: 'claves-por-tesitura', regla: 'N-CLAVE-1', tipo: 'notacion', fuentes: ['reconstruida'], modifica: ['claves'],
    aplicar: (doc, ctx) => asignarClaves(doc, ctx.inst || []),
  });
  // Partituras con edición (solo si CONFIG.clavesDeLaEdicion = false): se respetan las claves del editor salvo en los
  // pentagramas donde producen notas a 4 o más líneas adicionales en varios compases (cruces de manos escritos sin cambiar
  // de clave, p. ej. Mozart, K. 457/iii, cc. 289-309). Solo en esos pentagramas se eligen las claves por tesitura.
  function corregirClavesDoc(doc) {
    const solo = new Set(); let g = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      const compases = compasesDe(parte);
      const n = Math.max(1, ...[...parte.getElementsByTagName('staves')].map(e => +e.textContent || 1));
      for (let st = 1; st <= n; st++, g++) {
        let clave = n === 2 && st === 2 ? 'F4' : 'G2', malos = 0, desp = 0;
        for (const m of compases) {
          // claves de este pentagrama en el compás, con el instante en que entran (cambios de clave a mitad de compás)
          const dur = e => +(txt(e, 'duration') || 0);
          const cambios = [], notas = [], octavas = []; let pos = 0, ant = 0;
          for (const e of m.children) {
            if (e.tagName === 'backup') { pos -= dur(e); continue }
            if (e.tagName === 'forward') { pos += dur(e); continue }
            if (e.tagName === 'direction') {
              // líneas de octava (8va/8ba): las notas se escriben desplazadas, así que cuenta su altura escrita
              if (+(txt(e, 'staff') || 1) === st) for (const o of e.getElementsByTagName('octave-shift')) {
                const ti = o.getAttribute('type'), tam = +(o.getAttribute('size') || 8);
                octavas.push({ t: pos, d: ti === 'stop' ? 0 : (ti === 'down' ? -1 : 1) * 7 * Math.round((tam - 1) / 7) })
              }
              continue
            }
            if (e.tagName === 'attributes') {
              for (const c of e.children) if (c.tagName === 'clef' && +(c.getAttribute('number') || 1) === st) {
                const k = txt(c, 'sign') + txt(c, 'line') + (+txt(c, 'clef-octave-change') === -1 ? '-1' : ''); if (CLAVES[k]) cambios.push({ t: pos, k })
              }
              continue
            }
            if (e.tagName !== 'note') continue;
            const acorde = !!hijo(e, 'chord'), adorno = !!hijo(e, 'grace'), ini = acorde ? pos - ant : pos;
            if (!acorde && !adorno) { ant = dur(e); pos += ant }
            if (n > 1 && +(txt(e, 'staff') || 1) !== st) continue;
            const pi = hijo(e, 'pitch'); if (pi) notas.push({ t: ini, alt: PASOS[txt(pi, 'step')] + 7 * +txt(pi, 'octave') });
          }
          let lejos = 0;
          for (const nt of notas) {
            let k = clave; for (const cb of cambios) if (cb.t <= nt.t) k = cb.k;       // clave vigente cuando suena la nota
            let dz = desp; for (const o of octavas) if (o.t <= nt.t) dz = o.d;
            const lin = q => { const d = Math.abs(nt.alt + dz - CLAVES[q].c); return d >= 6 ? Math.floor((d - 4) / 2) : 0 };
            // solo cuenta si otra clave habitual (sol o fa) ahorraría 3 o más líneas
            const ahora = lin(k); if (ahora >= 4 && ahora - Math.min(lin('G2'), lin('F4')) >= 3) lejos++
          }
          if (cambios.length) clave = cambios[cambios.length - 1].k;
          if (octavas.length) desp = octavas[octavas.length - 1].d;
          if (lejos >= 2) malos++;
        }
        if (malos >= 2) solo.add(g);
      }
    }
    return solo.size ? asignarClaves(doc, [], solo) : 0;
  }
  transformacion({
    id: 'claves-corregidas', regla: 'N-CLAVE-1', tipo: 'notacion', fuentes: ['convertida', 'edicion'], modifica: ['claves'],
    activa: () => !CONFIG.clavesDeLaEdicion, aplicar: corregirClavesDoc,
  });

  // --- N-VOC-3: voces de ritmo idéntico → acordes (estructural, solo reconstrucciones) -------------------------
  // En un pentagrama con 3+ voces, la voz cuyas notas coinciden todas (inicio y duración) con las de otra se convierte en
  // acordes de esa otra; su hueco temporal se mantiene como <forward> (espacio invisible) y sus silencios se quitan.
  // LilyPond, NR 1.5.2 «Identical rhythms»: partes de ritmo idéntico se combinan en una sola voz formando acordes.
  function fusionarVocesIguales(doc) {
    let cambios = 0;
    for (const m of doc.getElementsByTagName('measure')) {
      let t = 0, prevD = 0; const ev = [];
      for (const c of [...m.children]) {
        const d = +(txt(c, 'duration') || 0);
        if (c.tagName === 'backup') { t -= d; continue }
        if (c.tagName === 'forward') { t += d; continue }
        if (c.tagName !== 'note') continue;
        const ch = !!hijo(c, 'chord'); if (ch) t -= prevD;
        ev.push({ n: c, t, d, ch, st: casaDe(c), v: txt(c, 'voice') || '1', silencio: !!hijo(c, 'rest'), gracia: !!hijo(c, 'grace') });
        t += d; prevD = d;
      }
      const porSt = new Map(); for (const e of ev) { if (!porSt.has(e.st)) porSt.set(e.st, new Map()); const m2 = porSt.get(e.st); if (!m2.has(e.v)) m2.set(e.v, []); m2.get(e.v).push(e) }
      for (const voces of porSt.values()) {
        const conNotas = [...voces].filter(([v, l]) => l.some(e => !e.silencio));
        if (conNotas.length < 3) continue;
        const clave = e => e.t + '|' + e.d;
        const huellas = new Map(conNotas.map(([v, l]) => [v, new Set(l.filter(e => !e.silencio && !e.gracia).map(clave))]));
        const orden = conNotas.map(x => x[0]).sort((a, b) => huellas.get(b).size - huellas.get(a).size), quedan = [];
        for (const v of orden) {
          const lista = voces.get(v);
          if (lista.some(e => e.gracia)) { quedan.push(v); continue }
          const destino = quedan.find(w => [...huellas.get(v)].every(k => huellas.get(w).has(k)));
          if (!destino || !huellas.get(v).size) { quedan.push(v); continue }
          const objetivo = new Map(); for (const e of voces.get(destino)) if (!e.silencio && !e.ch) objetivo.set(clave(e), e.n);
          for (const e of lista) {
            if (e.ch) continue;                                    // los miembros de acorde viajan con su nota principal
            const grupo = [e.n]; let sig = e.n.nextElementSibling; while (sig && sig.tagName === 'note' && hijo(sig, 'chord')) { grupo.push(sig); sig = sig.nextElementSibling }
            const hueco = doc.createElement('forward'), du = doc.createElement('duration'); du.textContent = String(e.d); hueco.append(du);
            e.n.parentNode.insertBefore(hueco, e.n); cambios++;
            if (e.silencio) { grupo.forEach(g => g.remove()); continue }
            let ref = objetivo.get(clave(e)); while (ref.nextElementSibling && ref.nextElementSibling.tagName === 'note' && hijo(ref.nextElementSibling, 'chord')) ref = ref.nextElementSibling;
            for (const g of grupo) {
              if (!hijo(g, 'chord')) { const c = doc.createElement('chord'); g.insertBefore(c, g.firstElementChild) }
              hijos(g, 'beam').forEach(c => c.remove());
              const vo = hijo(g, 'voice'); if (vo) vo.textContent = destino;
              ref.after(g); ref = g;
            }
          }
        }
      }
    }
    return cambios;
  }
  transformacion({
    id: 'fusionar-voces-iguales', regla: 'N-VOC-3', tipo: 'estructural', fuentes: ['reconstruida'],
    // une notas de dos voces en acordes (cambia reparto, acordes, número de voz) y quita los silencios de la voz absorbida
    modifica: ['voces', 'acordes', 'numeracionVoces', 'silencios', 'silenciosVisibles'],
    aplicar: fusionarVocesIguales,
  });

  // --- N-VOC-4: numeración de voces por altura (solo reconstrucciones) ---------------------------------------
  // En cada pentagrama con varias voces, la voz más aguda pasa a ser la de número más bajo, y así sucesivamente: Verovio
  // asigna las capas por número de voz, y la convención (LilyPond, NR 1.5.2 «Voice order»; MuseScore, «Working with multiple
  // voices») es que la voz 1 es la aguda. Solo cambia las etiquetas <voice>: el reparto de notas entre voces no cambia.
  function renumerarVoces(doc) {
    let cambios = 0;
    for (const m of doc.getElementsByTagName('measure')) {
      // con notas dibujadas en el otro pentagrama (N-CRUCE-2) no se renumera: el número de voz es de toda la parte y chocaría
      // con el de la otra mano (escribirCompas ya los dejó sin repetir)
      if (m.querySelector('note[data-hf-casa]')) continue;
      const porPent = new Map();
      for (const n of hijos(m, 'note')) {
        const st = casaDe(n), v = +(txt(n, 'voice') || 1), pi = hijo(n, 'pitch');
        if (!porPent.has(st)) porPent.set(st, []); porPent.get(st).push({ n, v, alt: pi ? valorPaso(pi) : null });
      }
      for (const notas of porPent.values()) {
        const voces = [...new Set(notas.map(x => x.v))]; if (voces.length < 2) continue;
        const media = new Map();
        for (const v of voces) { const a = notas.filter(x => x.v === v && x.alt != null).map(x => x.alt); if (a.length) media.set(v, a.reduce((s, x) => s + x, 0) / a.length) }
        const orden = [...media].sort((a, b) => b[1] - a[1]).map(x => x[0]);   // de aguda a grave
        const base = Math.min(...voces), nueva = new Map();
        [...orden, ...voces.filter(v => !orden.includes(v)).sort((a, b) => a - b)].forEach((v, k) => nueva.set(v, base + k));
        for (const x of notas) { const vo = hijo(x.n, 'voice'); if (vo && +vo.textContent !== nueva.get(x.v)) { vo.textContent = String(nueva.get(x.v)); cambios++ } }
      }
    }
    return cambios;
  }
  transformacion({ id: 'voces-por-altura', regla: 'N-VOC-4', tipo: 'notacion', fuentes: ['reconstruida'], modifica: ['numeracionVoces'], aplicar: renumerarVoces });

  // --- N-SIL-1: silencios de la reconstrucción en pentagramas con varias voces (solo reconstrucciones) -----------
  // Las tablas del DCML no contienen silencios: los añadió la reconstrucción para completar cada voz. En un pentagrama con
  // varias voces, los de las voces que no son la aguda se ocultan (MuseScore, «Adjusting rests»: los silencios redundantes de
  // las voces secundarias se ocultan o se borran; la voz 1 queda rítmicamente completa) y los de la voz aguda se colocan en
  // la línea superior del pentagrama (MuseScore: con varias voces, los silencios de la voz 1 suben al menos un espacio).
  // Se ejecuta después de N-VOC-4, de modo que la voz aguda es la de número más bajo.
  const ARRIBA = { G2: ['F', 5], 'G2-1': ['F', 4], F4: ['A', 3], C3: ['G', 4], C4: ['E', 4], C1: ['C', 5], G1: ['A', 5], F3: ['C', 4] };  // línea superior según la clave
  function silenciosReconstruccion(doc) {
    let cambios = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      const claves = {};
      for (const m of compasesDe(parte)) {
        for (const cl of m.getElementsByTagName('clef')) { const nn = cl.getAttribute('number') || '1', oc = +(txt(cl, 'clef-octave-change') || 0); claves[nn] = (txt(cl, 'sign') || 'G') + (txt(cl, 'line') || '2') + (oc ? String(oc) : '') }
        const porPent = new Map();
        for (const n of hijos(m, 'note')) { const st = casaDe(n); if (!porPent.has(st)) porPent.set(st, []); porPent.get(st).push({ n, v: +(txt(n, 'voice') || 1), conAltura: !!hijo(n, 'pitch'), silencio: !!hijo(n, 'rest') }) }
        for (const [st, notas] of porPent) {
          const voces = [...new Set(notas.map(x => x.v))]; if (voces.length < 2) continue;
          const alta = Math.min(...voces), conNotas = new Set(notas.filter(x => x.conAltura).map(x => x.v)).size;
          for (const { n, v, silencio } of notas) {
            if (!silencio) continue;
            if (v !== alta) { if (n.getAttribute('print-object') !== 'no') { n.setAttribute('print-object', 'no'); cambios++ } continue }
            if (conNotas < 2) continue;
            const r = hijo(n, 'rest'), pos = ARRIBA[claves[st] || 'G2']; if (!pos || !r || hijo(r, 'display-step')) continue;
            const ds = doc.createElement('display-step'), dO = doc.createElement('display-octave'); ds.textContent = pos[0]; dO.textContent = pos[1]; r.append(ds, dO); cambios++;
          }
        }
      }
    }
    return cambios;
  }
  transformacion({ id: 'silencios-reconstruccion', regla: 'N-SIL-1', tipo: 'notacion', fuentes: ['reconstruida'], modifica: ['silenciosVisibles'], aplicar: silenciosReconstruccion });

  // --- N-BARRA-1 / N-BARRA-3: barras automáticas (solo reconstrucciones) ---------------------------------------
  // La reconstrucción solo agrupa algunas figuras; las demás (tresillos de fusas, grupos sueltos) quedan con corchetes.
  // Aquí se agrupan, por pentagrama y voz, las figuras de corchea o menos que no tienen barra: se cortan en cada pulso, en
  // silencios y en notas largas (LilyPond, NR 1.2.4 «How automatic beaming works»: los grupos terminan al final de cada
  // pulso de beatStructure; MuseScore, «Regroup rhythms»: las semicorcheas se agrupan aclarando cada pulso).
  // N-BARRA-3 (excepciones por compás, «beamExceptions» de LilyPond, y MuseScore: «las corcheas se agrupan aclarando cada
  // grupo de dos pulsos»): en 4/4 y 2/2 un grupo solo de corcheas puede abarcar medio compás; en 3/4, el compás entero; en
  // 3/8 el pulso es el compás entero (un grupo de 3 corcheas). Los grupos con semicorcheas o menos siguen cortándose por pulso.
  const NIVEL_BARRA = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4, '128th': 5 };
  // estructura métrica de un compás: pulso (en divisiones) y, para grupos solo de corcheas, tramo máximo (en divisiones)
  function estructuraMetrica(beats, beatType, dv) {
    const unidad = dv * 4 / beatType, compas = unidad * beats;
    // con la regla apagada, el criterio anterior: pulso de 3 corcheas en x/8 compuestos, y si no, la unidad del compás
    if (!CONFIG.barrasPorCompas) { const p = (beatType === 8 && beats % 3 === 0 && beats >= 6) ? dv * 1.5 : unidad; return { pulso: p, corcheas: p } }
    if (beatType >= 8 && beats % 3 === 0 && beats >= 6) return { pulso: unidad * 3, corcheas: unidad * 3 };    // compuestos: 6/8, 9/8, 12/8, 6/16…
    if (beatType >= 8 && beats === 3) return { pulso: compas, corcheas: compas };                              // 3/8, 3/16: un pulso por compás
    if (beatType === 4 && beats === 4) return { pulso: unidad, corcheas: unidad * 2 };                          // 4/4: corcheas por medio compás
    if (beatType === 4 && beats === 3) return { pulso: unidad, corcheas: compas };                              // 3/4: corcheas por compás entero
    return { pulso: unidad, corcheas: unidad };                                                                 // 2/4, 2/2 (pulso de blanca), 3/2…
  }
  function barrasAutomaticas(doc) {
    let cambios = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      let dv = 1, est = null;
      for (const m of compasesDe(parte)) {
        const dd = m.getElementsByTagName('divisions')[0]; if (dd) dv = +dd.textContent || dv;
        const ti = m.getElementsByTagName('time')[0];
        if (ti) est = estructuraMetrica(+(txt(ti, 'beats') || 4), +(txt(ti, 'beat-type') || 4), dv);
        const E = est || { pulso: dv, corcheas: dv };
        let pos = 0, prev = 0; const porVoz = new Map();
        for (const n of [...m.children]) {
          if (n.tagName === 'backup') { pos -= +(txt(n, 'duration') || 0); continue }
          if (n.tagName === 'forward') { pos += +(txt(n, 'duration') || 0); continue }
          if (n.tagName !== 'note') continue;
          const du = +(txt(n, 'duration') || 0), acorde = !!hijo(n, 'chord'), grace = !!hijo(n, 'grace');
          const ini = acorde ? pos - prev : pos;
          if (!acorde && !grace) { prev = du; pos += du }
          const clave = casaDe(n) + '/' + (txt(n, 'voice') || '1');   // N-CRUCE-2: la barra cruza de pentagrama
          if (!porVoz.has(clave)) porVoz.set(clave, []);
          porVoz.get(clave).push({ n, ini, acorde, grace, sil: !!hijo(n, 'rest'), nivel: NIVEL_BARRA[txt(n, 'type')] || 0, tuplet: !!n.getElementsByTagName('time-modification').length });
        }
        // notas que atacan a la vez la misma altura que otra voz de su pentagrama (cabeza compartida de un style brisé, N-VOC-5):
        // en la edición llevan su propio corchete (Allemande, c. 2: el do#5 en corchea), así que no se unen con el pulso vecino
        const compartidas = new Set(), ataque = new Map();
        for (const [clave, lista] of porVoz) for (const x of lista) {
          const pi = hijo(x.n, 'pitch'); if (!pi || x.grace || [...x.n.children].some(c => c.tagName === 'tie' && c.getAttribute('type') === 'stop')) continue;
          const k = clave.split('/')[0] + '|' + x.ini + '|' + txt(pi, 'step') + txt(pi, 'alter') + txt(pi, 'octave');
          if (!ataque.has(k)) ataque.set(k, new Set()); ataque.get(k).add(clave);
          if (ataque.get(k).size > 1) compartidas.add(k);
        }
        const esCompartida = (clave, x) => { const pi = hijo(x.n, 'pitch'); return !!pi && compartidas.has(clave.split('/')[0] + '|' + x.ini + '|' + txt(pi, 'step') + txt(pi, 'alter') + txt(pi, 'octave')) };
        for (const [claveVoz, lista] of porVoz) {
          // se agrupan los acordes en su primera nota
          const cab = []; for (const x of lista) { if (x.acorde && cab.length) cab[cab.length - 1].acorde_n.push(x.n); else cab.push({ ...x, acorde_n: [] }) }
          // primero por pulso; después, N-BARRA-3: se unen grupos contiguos solo de corcheas dentro del mismo tramo
          const grupos = []; let g = [];
          const corta = () => { if (g.length) grupos.push(g); g = [] };
          for (const x of cab) {
            if (x.sil || x.grace || x.nivel < 1) { corta(); grupos.push(null); continue }
            if (g.length && Math.floor(x.ini / E.pulso + 1e-6) !== Math.floor(g[0].ini / E.pulso + 1e-6)) corta();
            g.push(x);
          }
          corta();
          const unidos = [];
          for (const gr of grupos) {
            const ant = unidos[unidos.length - 1];
            const soloCorcheas = l => l && l.every(x => x.nivel === 1 && !x.tuplet && !esCompartida(claveVoz, x));
            // grupos contiguos solo de corcheas (sin tresillos) dentro del mismo tramo (medio compás en 4/4, compás en 3/4)
            if (gr && ant && E.corcheas > E.pulso && soloCorcheas(gr) && soloCorcheas(ant) &&
              Math.floor(gr[0].ini / E.corcheas + 1e-6) === Math.floor(ant[0].ini / E.corcheas + 1e-6) && contiguos(ant, gr)) { ant.push(...gr); continue }
            unidos.push(gr);
          }
          for (const grupo of unidos) {
            if (!grupo || grupo.length < 2 || !grupo.every(x => !hijo(x.n, 'beam') && !x.acorde_n.some(c => hijo(c, 'beam')))) continue;
            grupo.forEach((x, i) => {
              const ant = grupo[i - 1], sig = grupo[i + 1];
              for (let l = 1; l <= x.nivel; l++) {
                const a = ant && ant.nivel >= l, s = sig && sig.nivel >= l;
                const estado = a && s ? 'continue' : a ? 'end' : s ? 'begin' : (i === 0 ? 'forward hook' : 'backward hook');
                if (!a && !s && !(x.nivel > 1 && l > 1)) continue;           // el nivel 1 aislado no existe (grupo de ≥2)
                // la barra se escribe en la primera nota del acorde (convención de MusicXML; Verovio deja de dibujar notas del
                // acorde si las demás también la llevan)
                for (const nt of [x.n]) {
                  const be = doc.createElement('beam'); be.setAttribute('number', String(l)); be.textContent = estado;
                  const ref = [...nt.children].find(c => c.tagName === 'notations' || c.tagName === 'lyric' || c.tagName === 'play' || c.tagName === 'listen');
                  ref ? nt.insertBefore(be, ref) : nt.append(be); cambios++;
                }
              }
            });
          }
        }
      }
    }
    return cambios;
  }
  // dos grupos son contiguos si el segundo empieza justo donde acaba el primero (sin hueco: un hueco es un silencio u otra voz)
  function contiguos(a, b) {
    const ult = a[a.length - 1], d = +(txt(ult.n, 'duration') || 0);
    return Math.abs(ult.ini + d - b[0].ini) < 1e-6;
  }
  transformacion({ id: 'barras-automaticas', regla: 'N-BARRA-1', tipo: 'notacion', fuentes: ['reconstruida'], aplicar: barrasAutomaticas });

  // --- N-ALT-2: alteraciones una vez por compás (reconstrucciones y ediciones convertidas desde Humdrum) ----------
  // Una alteración escrita ante una nota rige para las demás notas de la misma altura (mismo nombre y octava) del resto del
  // compás en ese pentagrama, sea cual sea la voz; solo se escribe de nuevo si se cambia. Es el comportamiento por defecto
  // de LilyPond (NR 1.1.1 «Automatic accidentals», estilo «default»: «accidentals are remembered to the end of the measure
  // in which they occur and only in their own octave»), a nivel de pentagrama. No se tocan las alteraciones de precaución o
  // editoriales (entre paréntesis) ni las de las notas ligadas (DAISY G10: reglas de alteración especiales, con cuidado), y
  // una nota ligada desde el compás anterior no cuenta como alteración escrita para el resto del compás (corregido en v0.9:
  // antes sí contaba y se quitaba la alteración necesaria de la nota siguiente; lo detectó la comprobación I-5).
  const ORDEN_SOST = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const alteracionDeArmadura = (fifths, paso) => {
    if (fifths > 0) return ORDEN_SOST.slice(0, fifths).includes(paso) ? 1 : 0;
    if (fifths < 0) return ORDEN_SOST.slice(7 + fifths).includes(paso) ? -1 : 0;
    return 0;
  };
  function alteracionesRedundantesDoc(doc) {
    if (!CONFIG.alteracionesUnaVez) return 0;
    let quitadas = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      let fifths = 0;
      for (const compas of compasesDe(parte)) {
        const estado = new Map();                            // «staff|paso|octava» → alteración vigente
        const ligadas = new Map();                           // ídem, de las notas que llegan ligadas desde antes
        const notas = []; let t = 0, ultimaDur = 0, orden = 0;
        for (const el of compas.children) {
          if (el.tagName === 'attributes') { const k = hijo(el, 'key'); if (k) fifths = +txt(k, 'fifths') || 0 }
          const d = +txt(el, 'duration') || 0;
          if (el.tagName === 'backup') t -= d;
          else if (el.tagName === 'forward') t += d;
          else if (el.tagName === 'note') {
            const acorde = !!hijo(el, 'chord'), gracia = !!hijo(el, 'grace');
            if (acorde) t -= ultimaDur;
            if (hijo(el, 'pitch')) notas.push({ el, t, orden: orden++ });
            if (!gracia) { t += d; ultimaDur = d } else ultimaDur = 0;
          }
        }
        notas.sort((a, b) => a.t - b.t || a.orden - b.orden);
        for (const { el } of notas) {
          const pitch = hijo(el, 'pitch'), paso = txt(pitch, 'step'), oct = txt(pitch, 'octave');
          if (!(paso in PASOS)) continue;
          const alt = Math.round(+txt(pitch, 'alter') || 0), staff = txt(el, 'staff') || '1', clave = staff + '|' + paso + oct;
          const vigente = estado.has(clave) ? estado.get(clave) : alteracionDeArmadura(fifths, paso);
          const acc = hijo(el, 'accidental');
          const precaucion = acc && ['cautionary', 'editorial', 'parentheses', 'bracket'].some(a => acc.getAttribute(a) === 'yes');
          // una nota ligada desde antes se lee por la ligadura: ni se le quita la alteración ni su alteración rige para el
          // resto del compás (si venía del compás anterior, la siguiente nota igual necesita la suya; ver I-5)
          // tras ella, una nota igual con otra alteración conserva la suya aunque sea redundante: es la de precaución que
          // la práctica editorial imprime (y que la fuente traía)
          if (hijos(el, 'tie').some(c => c.getAttribute('type') === 'stop')) { ligadas.set(clave, alt); continue }
          // el estado sigue lo ESCRITO: solo una alteración impresa lo cambia (una nota sin alteración que no coincide con
          // la lectura es un descuido de la fuente y no autoriza a quitar la alteración de la siguiente; ver I-5)
          if (!acc) continue;
          if (!precaucion && alt === vigente && (!ligadas.has(clave) || ligadas.get(clave) === alt)) { acc.remove(); quitadas++ }
          estado.set(clave, alt); ligadas.delete(clave);
        }
      }
    }
    return quitadas;
  }
  transformacion({ id: 'alteraciones-una-vez', regla: 'N-ALT-2', tipo: 'notacion', fuentes: ['reconstruida', 'convertida'], modifica: ['alteracionesEscritas'], aplicar: alteracionesRedundantesDoc });

  // --- N-PLICA-2 / N-PLICA-3 / N-LIG-3: plicas y ligaduras de unión por voz (todas las fuentes) ------------------
  // ÚNICA fuente de verdad de la dirección de plicas en pentagramas con varias voces (antes la reconstrucción la fijaba
  // además en ordenarVoces, con otro criterio). Reglas:
  //   · MuseScore («Working with multiple voices», «Stems and flags»): con una voz, la plica según la posición de las notas
  //     (lo resuelve Verovio, N-PLICA-1); con varias voces, las voces 1 y 3 llevan la plica arriba y las 2 y 4 abajo.
  //   · LilyPond (NR 1.5.2 «Voice order»): voz 1 la más aguda, voz 2 la más grave, 3 la segunda más aguda, 4 la segunda
  //     más grave…; las impares, plica arriba; las pares, abajo.
  // El número de voz de los archivos no siempre sigue ese orden (muchas ediciones convertidas escriben antes la voz grave),
  // así que aquí se decide por ALTURA MEDIA de cada voz en el compás, que es lo que esas convenciones presuponen:
  //   N-PLICA-2  la voz más aguda, plica arriba; la más grave, abajo; en todo el compás (también si una voz calla un momento)
  //   N-PLICA-3  las voces intermedias (3+ voces, raro: 0,17 % de los pentagramas-compás) por su RANGO de altura: la mitad
  //              superior, plica arriba; la inferior, abajo; con un número impar, la central arriba (LilyPond: la segunda más
  //              aguda es la voz 3, plica arriba; la segunda más grave, la voz 4, abajo; MuseScore: voz 3 arriba, voz 4
  //              abajo). Si el archivo ya trae <stem> en esa voz, se respeta (decisión de la edición)
  // Solo cuentan las voces que suenan a la vez que alguna otra: si alternan sin coincidir no hay choque posible y Verovio
  // decide por la posición de las notas (también es el criterio de MuseScore, que mira si hay otras voces en el tramo).
  function analizarVoces(m) {
    const notas = notasDelCompas(m).filter(n => !n.silencio);
    const porStaff = new Map();
    for (const n of notas) { if (!porStaff.has(n.staff)) porStaff.set(n.staff, new Map()); const s = porStaff.get(n.staff); if (!s.has(n.voz)) s.set(n.voz, []); s.get(n.voz).push(n) }
    const res = [];
    for (const voces of porStaff.values()) {
      if (voces.size < 2) continue;
      const lista = [...voces].map(([voz, l]) => { const v = l.map(n => n.val).filter(x => x !== null); return { voz, l, media: v.length ? v.reduce((s, x) => s + x, 0) / v.length : null } }).filter(r => r.media !== null);
      const suenaCon = (A, B) => A.l.some(a => !a.gracia && B.l.some(b => !b.gracia && a.t < b.fin && b.t < a.fin));
      const activas = lista.filter(A => lista.some(B => B !== A && suenaCon(A, B)));
      if (activas.length < 2) continue;
      activas.sort((a, b) => b.media - a.media);                           // la más aguda primero
      if (activas[0].media === activas[activas.length - 1].media) continue;
      res.push(activas);
    }
    return res;
  }
  function ponerPlica(doc, el, sentido) {
    let s = hijo(el, 'stem');
    if (s) { if (s.textContent.trim() === sentido) return 0; s.textContent = sentido; return 1 }
    s = doc.createElement('stem'); s.textContent = sentido; const ref = [...el.children].find(c => ANTES_DE_PLICA.includes(c.tagName)); ref ? el.insertBefore(s, ref) : el.append(s);
    return 1;
  }
  function plicasPorVozDoc(doc) {
    if (!CONFIG.plicasPorVoz) return 0;
    let cambios = 0;
    for (const m of doc.getElementsByTagName('measure')) for (const activas of analizarVoces(m)) {
      const aguda = activas[0], grave = activas[activas.length - 1];
      for (const n of aguda.l) if (!n.el.getAttribute('data-hf-casa')) cambios += ponerPlica(doc, n.el, 'up');
      for (const n of grave.l) if (!n.el.getAttribute('data-hf-casa')) cambios += ponerPlica(doc, n.el, 'down');
      activas.slice(1, -1).forEach((r, i) => {                            // N-PLICA-3: rango i+1 de n (0 = la más aguda)
        if (r.l.some(n => hijo(n.el, 'stem'))) return;
        const sentido = CONFIG.vocesIntermedias === 'cercania' ? (r.media - grave.media > aguda.media - r.media ? 'up' : 'down') : (i + 1 < activas.length / 2 ? 'up' : 'down');
        for (const n of r.l) if (!n.el.getAttribute('data-hf-casa')) cambios += ponerPlica(doc, n.el, sentido);
      });
    }
    // N-CRUCE-2: una nota dibujada en el otro pentagrama apunta hacia el suyo, para que la barra quede entre los dos (edición
    // de la Allemande, c. 2: sol#4 y la4 en la derecha con plica abajo, unidos al fa#4 de la izquierda)
    for (const n of doc.querySelectorAll('note[data-hf-casa]')) cambios += ponerPlica(doc, n, n.getAttribute('data-hf-casa') === '2' ? 'down' : 'up');
    return cambios;
  }
  // N-LIG-3: las ligaduras de unión de la voz aguda van por arriba y las de la grave por abajo (MuseScore, código de
  // slurtielayout: con varias voces la ligadura va del lado de la plica; LilyPond, NR 5.4.1: las ligaduras alternan con la
  // dirección de la plica). En un acorde solo la nota exterior lleva orientación; las interiores las resuelve el grabador.
  function ligadurasPorVozDoc(doc) {
    if (!CONFIG.ligadurasPorVoz) return 0;
    let cambios = 0;
    const poner = (el, arriba) => {
      for (const ti of el.querySelectorAll('notations > tied')) {
        if (ti.getAttribute('type') !== 'start') continue;
        const [pl, or] = arriba ? ['above', 'over'] : ['below', 'under'];
        if (ti.getAttribute('placement') === pl && ti.getAttribute('orientation') === or) continue;
        ti.setAttribute('placement', pl); ti.setAttribute('orientation', or); cambios++;
      }
    };
    for (const m of doc.getElementsByTagName('measure')) for (const activas of analizarVoces(m)) {
      // Todas las notas de cada voz, también las interiores de un acorde y las de las voces intermedias: la ligadura va del lado
      // de su plica (ya decidida por N-PLICA-2/3 y N-CRUCE-2), que es hacia fuera de la otra voz (MuseScore, slurtielayout: con
      // varias voces la ligadura sigue a la plica de su acorde; LilyPond, NR 5.4.1). Antes solo se orientaba la nota exterior de
      // las voces aguda y grave, y el 13 % de las ligaduras de los pentagramas con 3+ voces se curvaba hacia la otra voz.
      activas.forEach((r, k) => {
        for (const n of r.l) {
          if (n.val === null || n.gracia) continue;
          const pl = hijo(n.el, 'stem'), dir = pl && pl.textContent.trim();
          const arriba = dir === 'up' ? true : dir === 'down' ? false : k === 0 ? true : k === activas.length - 1 ? false : null;
          if (arriba !== null) poner(n.el, arriba);
        }
      });
    }
    return cambios;
  }
  // única transformación de plicas: N-PLICA-2/3 y, en las reconstrucciones, después N-VOC-5 (plicas opuestas en los unísonos de un brisé)
  transformacion({ id: 'plicas-por-voz', regla: 'N-PLICA-2', tipo: 'notacion', aplicar: (doc, ctx) => plicasPorVozDoc(doc) + ((ctx && ctx.fuente) === 'reconstruida' ? plicasUnisonoDoc(doc) : 0) });
  transformacion({ id: 'ligaduras-por-voz', regla: 'N-LIG-3', tipo: 'notacion', aplicar: ligadurasPorVozDoc });
  // N-LIG-6 quita el <tied> de las ligaduras entre capas, que se dibujan desde MEI: es presentación (dónde se dibuja la ligadura);
  // el <tie> (lo que suena) se conserva
  transformacion({ id: 'ligaduras-entre-capas', regla: 'N-LIG-6', tipo: 'presentacion', fuentes: ['reconstruida'], modifica: ['ligadurasUnion'], aplicar: ligadurasEntreCapasDoc });

  // --- numeración de compases: anacrusa (todas las fuentes, según el análisis) ----------------------------------
  // El análisis numera la anacrusa 0 y algunas partituras la numeran 1: se alinea la partitura con el análisis (solo el
  // atributo number; el contenido de los compases no cambia). Lo activa ctx.anacrusa (lo decide index.html con el análisis).
  function alinearAnacrusaDoc(doc) {
    const parte = doc.getElementsByTagName('part')[0]; if (!parte) return 0;
    const ms = parte.getElementsByTagName('measure'), nums = [...ms].map(m => m.getAttribute('number')).filter(x => x !== null);
    if (!nums.length || nums[0] !== '1' || nums.includes('0')) return 0;
    const m1 = [...ms].find(m => m.getAttribute('number') === '1'); if (!m1) return 0;
    const div = +(parte.getElementsByTagName('divisions')[0]?.textContent || 0), ti = parte.getElementsByTagName('time')[0];
    const beats = ti && txt(ti, 'beats'), bt = ti && txt(ti, 'beat-type');
    if (!div || !/^\d+$/.test(beats || '') || !/^\d+$/.test(bt || '')) return 0;
    const lleno = div * 4 * (+beats) / (+bt);
    let t = 0, mx = 0;
    for (const e of m1.getElementsByTagName('*')) {
      if (!['note', 'backup', 'forward'].includes(e.tagName)) continue;
      const d = +(e.getElementsByTagName('duration')[0]?.textContent || 0);
      if (e.tagName === 'backup') { t -= d; continue }
      if (hijo(e, 'chord') || hijo(e, 'grace')) continue;
      t += d; mx = Math.max(mx, t);
    }
    if (mx >= lleno - 1e-6) return 0;                        // primer compás completo: no es anacrusa
    let cambios = 0;
    for (const m of doc.getElementsByTagName('measure')) {   // también «24X1», «4a»
      const r = (m.getAttribute('number') || '').match(/^(\d+)(.*)$/); if (!r) continue;
      m.setAttribute('number', (+r[1] - 1) + r[2]); cambios++;
    }
    return cambios;
  }
  transformacion({ id: 'alinear-anacrusa', regla: 'N-NUM-1', tipo: 'presentacion', modifica: ['numeracionCompases'], activa: ctx => !!(ctx && ctx.anacrusa), aplicar: alinearAnacrusaDoc });

  // =========================================================================================================
  // Canalización: una sola lectura y una sola serialización del MusicXML; integridad antes y después de cada paso
  // =========================================================================================================
  const INCIDENCIAS = [];
  // ctx: { fuente: 'reconstruida'|'convertida'|'edicion', inst: [nombres de instrumento], anacrusa: bool }
  // Devuelve el MusicXML preparado. En modo 'estricto' lanza Musica.ErrorIntegridad; en 'revertir' deshace el paso que
  // falla, lo registra en Notacion.incidencias y sigue. Si el texto no es XML válido, lo devuelve sin tocar.
  function preparar(xml, ctx = {}) {
    let doc = parsear(xml); if (!doc) return xml;
    const fuente = ctx.fuente || 'edicion', modo = CONFIG.integridad, M = global.Musica, informe = [];
    let h = modo !== 'no' && M ? M.huella(doc) : null;
    for (const T of TRANSFORMACIONES) {
      if (!T.fuentes.includes(fuente) || !T.activa(ctx)) continue;
      const copia = doc.cloneNode(true);
      let n;
      try { n = T.aplicar(doc, ctx) } catch (e) {
        console.warn(`Notacion: «${T.id}» falló y se deshace`, e); doc = copia; informe.push({ id: T.id, error: String(e && e.message || e) }); continue;
      }
      informe.push({ id: T.id, cambios: n || 0 });
      if (!n || !h) continue;
      const h2 = M.huella(doc), dif = M.comparar(h, h2, T.modifica);
      if (dif.length) {
        const err = new M.ErrorIntegridad(T.id, dif); INCIDENCIAS.push(err);
        if (modo === 'estricto') throw err;
        console.error(err); doc = copia; informe[informe.length - 1].revertida = true; continue;
      }
      h = h2;
    }
    preparar.ultimoInforme = { fuente, pasos: informe };
    return new XMLSerializer().serializeToString(doc);
  }

  // N-INI-1 (se aplica al grabar cada fragmento, no al preparar la obra: depende del primer compás que se dibuja)
  // Un fragmento que empieza a mitad de la obra salía sin indicación de compás (Verovio solo la dibuja donde la obra la
  // escribe). Aquí se calcula qué compás rige en el compás `indice` (0-based) y se escribe explícitamente, parte por parte.
  // Las claves y la armadura ya las arrastra bien Verovio (auditoría: 0 pentagramas sin clave en 119 fragmentos).
  function compasInicioDoc(doc, indice) {
    if (!CONFIG.compasAlInicio || !(indice > 0)) return 0;      // el compás 1 ya lleva el suyo
    let cambios = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      const compases = compasesDe(parte); if (indice >= compases.length) continue;
      let time = null;
      for (let i = 0; i <= indice; i++) for (const at of hijos(compases[i], 'attributes')) for (const c of hijos(at, 'time')) time = c;
      const m = compases[indice]; if (!time || m.getElementsByTagName('time').length) continue;
      const at = atributosIniciales(doc, m);
      // orden de MusicXML: divisions, key, time, staves, … (el compás va tras divisions y key)
      const antes = ['footnote', 'level', 'divisions', 'key'];
      const tras = [...at.children].find(c => !antes.includes(c.tagName));
      const copia = time.cloneNode(true); tras ? at.insertBefore(copia, tras) : at.append(copia); cambios++;
    }
    return cambios;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Catálogo de reglas (ver docs/ESPECIFICACION_GRABADO_MUSICAL.md para referencia, casos especiales y prueba asociada)
  // ---------------------------------------------------------------------------------------------------------
  regla('N-INI-1', 'Indicaciones al inicio del sistema (clave, armadura, compás)', 'xml', 'aplicada', 'Un fragmento que empieza a mitad de obra muestra el compás vigente (CONFIG.compasAlInicio). Claves y armadura ya las resuelve Verovio.');
  regla('N-ALT-2', 'Alteraciones: una vez por compás', 'xml', 'aplicada', 'Una alteración rige para las notas de la misma altura del resto del compás en ese pentagrama; las repetidas de las reconstrucciones del DCML y de las ediciones convertidas desde Humdrum se quitan (CONFIG.alteracionesUnaVez). No toca precauciones, editoriales ni notas ligadas.');
  regla('N-PLICA-2', 'Plicas: una dirección por voz', 'xml', 'aplicada', 'Con dos o más voces simultáneas en un pentagrama, la más aguda lleva la plica hacia arriba y la más grave hacia abajo en todo el compás (CONFIG.plicasPorVoz). Única fuente de verdad de las plicas con varias voces, para todas las fuentes.');
  regla('N-PLICA-3', 'Plicas de las voces intermedias', 'xml', 'aplicada', 'Con 3+ voces simultáneas, las intermedias por rango de altura: mitad superior arriba, inferior abajo, la central (número impar) arriba (LilyPond: voz 3 arriba, voz 4 abajo; MuseScore: voces 1 y 3 arriba, 2 y 4 abajo); si el archivo ya trae plicas en esa voz, se respetan.');
  regla('N-LIG-3', 'Ligaduras de unión: del lado de la plica con varias voces', 'xml', 'aplicada', 'Con dos o más voces simultáneas en un pentagrama, cada ligadura de unión va del lado de la plica de su nota (la voz aguda por arriba, la grave por abajo, las intermedias según su plica), en todas las notas del acorde; también las ligaduras dibujadas desde MEI (CONFIG.ligadurasPorVoz).');
  regla('N-LIG-2', 'Ligaduras que atraviesan notas, plicas o barras', 'svg', 'aplicada', 'Una ligadura de unión cuyo interior cruza una cabeza, plica, corchete o barra se acorta por los extremos y/o se hace más profunda hasta librarlos; si ninguna variante lo logra, no se toca (CONFIG.ligadurasDespejadas).', 'web/notacion_svg.js');
  regla('N-CLAVE-1', 'Elección y cambio de clave', 'xml', 'aplicada', 'Reconstrucciones: clave por tesitura e instrumento, penalizando líneas adicionales y cambios breves. Ediciones: se conservan sus claves (CONFIG.clavesDeLaEdicion).');
  regla('N-PLICA-1', 'Plicas: dirección y longitud con una voz', 'opciones', 'verovio', 'Dirección por la nota más alejada de la línea central; plicas de una octava que llegan a la línea central fuera del pentagrama. Verovio lo cumple (auditoría: 0 plicas de menos de 2 espacios).', 'Verovio');
  regla('N-BARRA-1', 'Barras: agrupación por pulso', 'xml', 'aplicada', 'Las figuras sin barra de las reconstrucciones se agrupan por pulso (3 corcheas en compases compuestos) y se cortan en silencios y notas largas.');
  regla('N-BARRA-3', 'Barras: excepciones por compás', 'xml', 'aplicada', 'Grupos solo de corcheas: medio compás en 4/4, compás entero en 3/4; en 3/8 el pulso es el compás (CONFIG.barrasPorCompas). Solo reconstrucciones.');
  regla('N-SIL-1', 'Silencios de la reconstrucción con varias voces', 'xml', 'aplicada', 'En las reconstrucciones, los silencios de la voz aguda suben a la línea superior y los de las demás voces se ocultan (son silencios añadidos por la reconstrucción).');
  regla('N-SIL-2', 'Silencios que pisan notas de otra voz', 'svg', 'aplicada', 'Un silencio que pisa una nota, plica, barra o alteración de otra voz se aparta verticalmente (hacia arriba en la voz aguda, hacia abajo en las demás) hasta 3 espacios; solo si no hay sitio se oculta (CONFIG.silenciosApartados).', 'web/notacion_svg.js');
  regla('N-VOC-3', 'Voces de ritmo idéntico en acordes', 'xml', 'aplicada', 'En las reconstrucciones, con 3+ voces en un pentagrama, una voz cuyas notas coinciden todas en inicio y duración con las de otra pasa a formar acordes con ella (transformación estructural declarada).');
  regla('N-VOC-4', 'Numeración de voces por altura', 'xml', 'aplicada', 'En las reconstrucciones, la voz más aguda de cada pentagrama pasa a ser la de número más bajo (solo cambia la etiqueta de voz).');
  regla('N-PRES-1', 'Sin cifrados del archivo', 'xml', 'aplicada', 'Se quitan los <harmony> del archivo de origen: la aplicación graba sus propios cifrados.');
  regla('N-PRES-2', 'Ejemplos sin indicaciones expresivas', 'xml', 'aplicada', 'Se quitan dinámicas, reguladores, textos, metrónomos y articulaciones; se conservan ligaduras, líneas de octava y calderones.');
  regla('N-PRES-3', 'Sin nombre de instrumento único', 'xml', 'aplicada', 'Con un solo instrumento no se imprime su nombre.');
  regla('N-NUM-1', 'Numeración de la anacrusa', 'xml', 'aplicada', 'Si el análisis numera la anacrusa 0 y la partitura 1, se renumeran los compases de la partitura.');
  regla('N-NUM-2', 'Números de compás sin choques', 'svg', 'aplicada', 'El número de compás que choca con notas, plicas, ligaduras o indicaciones sube por encima de ellas; los números internos de la reconstrucción («8X1») no se muestran.', 'web/notacion_svg.js');
  regla('N-LIG-1', 'Ligaduras: distancia de seguridad', 'opciones', 'aplicada', 'Margen de las ligaduras a plicas, barras y notas de otras voces; ligaduras de unión con longitud mínima (OPCIONES).');
  regla('N-ESP-1', 'Aire alrededor de alteraciones y silencios', 'opciones', 'aplicada', 'Márgenes de Verovio a la izquierda y derecha de alteraciones y silencios (OPCIONES).');
  regla('N-ESP-2', 'Espaciado horizontal proporcional', 'opciones', 'verovio', 'Espaciado según la duración (spacingLinear, spacingNonLinear); probado que ampliarlo no reduce los choques.', 'Verovio');
  regla('N-CAB-1', 'Cabezas de voces distintas: segundas y unísonos', 'opciones', 'verovio', 'Desplazamiento de cabezas a distancia de segunda y cabeza compartida en unísonos con plicas opuestas. Verovio lo resuelve (auditoría: 0 cabezas encimadas).', 'Verovio');
  regla('N-BARRA-2', 'Barras: pendiente máxima', 'svg', 'pendiente', 'El criterio es la subida en espacios, no el ángulo; solo el 5 % de las barras sube más de 1,1 espacios y no se ve defecto. Sin evidencia: no actuar.');
  regla('N-VOC-1', 'Tres o más voces en un pentagrama', 'xml', 'aplicada', 'Reconstrucciones: una voz interior se intercala en la vecina si no suenan a la vez, o se escribe como acordes de la vecina con ligaduras de unión; no se funden las voces de un style brisé (N-VOC-5) ni las líneas reales (si hace falta de media más de una ligadura por pulso o más de dos en un pulso) (CONFIG.dosCapas).');
  regla('N-VOC-2', 'Unísonos entre las dos manos', 'xml', 'aplicada', 'Reconstrucciones: la misma nota atacada a la vez en las dos manos se escribe una vez (la más larga o, si duran igual, la del pentagrama de su registro). Dentro de un pentagrama, una cabeza y dos plicas (N-VOC-5) (CONFIG.unisonosUnaVez).');
  regla('N-VOC-5', 'Unísonos entre capas: una cabeza y dos plicas', 'xml+svg', 'aplicada', 'Dos voces que atacan a la vez la misma nota (style brisé) llevan plicas opuestas y comparten la cabeza, cada una con su figura y puntillo, como en la edición; Verovio solo la comparte si figura y puntillo coinciden (CONFIG.cabezaCompartida).', 'web/notacion.js, web/notacion_svg.js');
  regla('N-VOC-6', 'Voces que coinciden en ritmo: un acorde con una plica', 'xml', 'aplicada', 'Reconstrucciones: con 3+ voces sonando, la nota de una voz interior que coincide en instante y duración con la de una vecina pasa a su acorde, también si llega ligada; dos acordes condensados seguidos en un pulso van en la misma voz. Dos voces con el mismo ritmo en todo el compás van en acordes; si coinciden solo en parte, se dejan separadas (CONFIG.vocesCondensadas, CONFIG.homorritmia).');
  regla('N-ALT-1', 'Alteraciones que chocan', 'svg', 'pendiente', 'En las reconstrucciones, alteraciones encimadas con otra alteración o con una cabeza (12 en 57 fragmentos). Los márgenes de Verovio no lo resuelven.');
  regla('N-OCT-1', 'Signo de octava frente a muchas líneas adicionales', 'xml', 'pendiente', 'Pasajes con 5 o más líneas adicionales sostenidos: cambiar de clave, de pentagrama o 8va. Hay que fijar el umbral.');
  regla('N-CRUCE-1', 'Voces que cruzan de pentagrama', 'xml', 'aplicada', 'Reconstrucciones: una voz no exterior que su mano no puede tocar (más de una décima con otra voz a la vez) pasa al pentagrama de la otra mano en ese compás si allí cabe; los cruces de manos de la fuente se conservan (CONFIG.vocesPorRegistro).');
  regla('N-CRUCE-2', 'Notas sueltas al otro pentagrama', 'xml', 'aplicada', 'Reconstrucciones: en una voz interior, una nota con 3+ líneas adicionales en su pentagrama y como mucho 1 en el otro se dibuja en el otro pentagrama (con lo que le sigue en el pulso) si queda por debajo o por encima de todo lo que suena allí; sigue en su voz (data-hf-casa), apunta hacia su pentagrama y la barra cruza (CONFIG.notasAlOtroPentagrama).');
  regla('N-PLICA-4', 'Longitud de plica en acordes, con barra y con cabeza desplazada', 'opciones', 'verovio', 'Plicas alargadas hasta la barra o la nota extrema; plica compartida en acordes de segunda.', 'Verovio');
  regla('N-BARRA-4', 'Grupos irregulares', 'opciones', 'verovio', 'Cifra del tresillo del lado de la barra; corchete solo si ninguna barra abarca el grupo.', 'Verovio');
  regla('N-ALT-3', 'Alteraciones simultáneas en distintas voces', 'xml', 'aplicada', 'La alteración vale para todas las voces del pentagrama (N-ALT-2 por pentagrama); el resto lo resuelve Verovio.');
  regla('N-SIL-3', 'Silencios coincidentes', 'xml', 'pendiente', 'Silencios de igual duración simultáneos en dos voces: fundirlos en uno (MuseScore, «Merge matching rests»).');
  regla('N-LIG-4', 'Ligaduras entre sistemas y en acordes', 'opciones', 'verovio', 'Ligadura partida al cambiar de sistema; una ligadura por nota con pareja en los acordes.', 'Verovio');
  regla('N-LIG-6', 'Ligaduras de unión entre capas', 'xml', 'aplicada', 'Una ligadura de unión cuya nota de llegada está en otra voz (tras condensar, N-VOC-6) se quita de <tied>, se anota el par (id, data-hf-tie) y se dibuja como <tie> de MEI, porque Verovio solo une las de MusicXML dentro de una voz (CONFIG.ligadurasEntreCapas).');
  regla('N-LIG-5', 'Ligaduras de expresión', 'opciones', 'verovio', 'Del lado de las cabezas con una voz; del lado de la plica con varias.', 'Verovio');
  regla('N-ESP-3', 'Espaciado vertical entre pentagramas', 'opciones', 'verovio', 'Distancias entre pentagramas y sistemas (adjustPageHeight).', 'Verovio');
  regla('N-EXP-1', 'Dinámicas y articulaciones: colocación', 'xml', 'pendiente', 'Hoy se quitan en los ejemplos (N-PRES-2). Si se muestran: dinámicas bajo el pentagrama (por encima en voces cantadas), articulaciones del lado de la cabeza.');

  // API: las funciones de texto → texto se conservan para las pruebas y la auditoría
  global.Notacion = {
    opciones: OPCIONES, config: CONFIG, reglas: REGLAS, regla, fuentes: FUENTES, fuenteDe,
    transformaciones: TRANSFORMACIONES, preparar, incidencias: INCIDENCIAS,
    compasInicio: sobreTexto(compasInicioDoc),
    alteracionesRedundantes: sobreTexto(alteracionesRedundantesDoc),
    // N-PLICA-2/3 y N-LIG-3 juntas (como antes)
    plicasPorVoz: sobreTexto(doc => plicasPorVozDoc(doc) + ligadurasPorVozDoc(doc)),
    asignarClaves: sobreTexto((doc, inst) => asignarClaves(doc, inst || [])),
    corregirClaves: sobreTexto(corregirClavesDoc),
    barrasAutomaticas: sobreTexto(barrasAutomaticas),
    fusionarVocesIguales: sobreTexto(fusionarVocesIguales),
    quitarExpresion: sobreTexto(quitarExpresion),
    alinearAnacrusa: sobreTexto(alinearAnacrusaDoc),
    estructuraMetrica,
    // reglas de voces de las reconstrucciones (N-CRUCE-1, N-CRUCE-2, N-VOC-1, N-VOC-6, N-VOC-2), en el orden del registro
    vocesReconstruidas: sobreTexto(doc => repartirDoc(doc) + subirNotasDoc(doc) + reducirDoc(doc) + condensarDoc(doc) + unisonosManosDoc(doc)),
    plicasUnisono: sobreTexto(plicasUnisonoDoc),
    ligadurasEntreCapas: sobreTexto(ligadurasEntreCapasDoc), ligadurasPendientes, ligadurasMEI,
    // preparación completa de una reconstrucción (lo que antes hacía ordenarVoces en index.html, sin las plicas)
    prepararReconstruccion: (xml, inst) => preparar(xml, { fuente: 'reconstruida', inst }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
