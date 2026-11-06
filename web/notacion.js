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
    leftMarginAccid: 2.2, rightMarginAccid: 0.8, leftMarginRest: 2, rightMarginRest: 1,
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
    // N-SIL-2: un silencio que pisa una nota de otra voz se aparta antes de ocultarse
    silenciosApartados: true,
    // Integridad musical (I-…): 'revertir' (por defecto: si una transformación altera una propiedad que no declaró, se
    // deshace ese paso y se registra el error en Notacion.incidencias), 'estricto' (se lanza Musica.ErrorIntegridad; lo
    // usan las pruebas) o 'no' (sin comprobación, solo para medir el coste)
    integridad: 'revertir',
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
        notas.push({ el, staff: txt(el, 'staff') || '1', voz: txt(el, 'voice') || '1', t, fin: t + d, val: pitch ? valorPaso(pitch) : null, gracia, acorde, silencio: !!hijo(el, 'rest') });
        if (!gracia) { t += d; ultimaDur = d } else ultimaDur = 0;
      }
    }
    return notas;
  }
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
      const CAMBIO = voz ? 10 : 6, SESGO = voz ? 1.5 : 0.6;
      // con «solo» (partitura original) se parte de las claves del editor: cambiar una cuesta, y solo compensa donde
      // ahorra muchas líneas adicionales
      cand = solo ? [...new Set([...cand, ...P.orig])] : cand;
      const loc = P.alt.map((ps, i) => cand.map(k => (solo ? (k === P.orig[i] ? 0 : 2) : (k === def ? 0 : SESGO)) + ps.reduce((s, q) => s + coste(lineas(q, k)), 0)));
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
        ev.push({ n: c, t, d, ch, st: txt(c, 'staff') || '1', v: txt(c, 'voice') || '1', silencio: !!hijo(c, 'rest'), gracia: !!hijo(c, 'grace') });
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
      const porPent = new Map();
      for (const n of hijos(m, 'note')) {
        const st = txt(n, 'staff') || '1', v = +(txt(n, 'voice') || 1), pi = hijo(n, 'pitch');
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
        for (const n of hijos(m, 'note')) { const st = txt(n, 'staff') || '1'; if (!porPent.has(st)) porPent.set(st, []); porPent.get(st).push({ n, v: +(txt(n, 'voice') || 1), conAltura: !!hijo(n, 'pitch'), silencio: !!hijo(n, 'rest') }) }
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
          const clave = (txt(n, 'staff') || '1') + '/' + (txt(n, 'voice') || '1');
          if (!porVoz.has(clave)) porVoz.set(clave, []);
          porVoz.get(clave).push({ n, ini, acorde, grace, sil: !!hijo(n, 'rest'), nivel: NIVEL_BARRA[txt(n, 'type')] || 0, tuplet: !!n.getElementsByTagName('time-modification').length });
        }
        for (const lista of porVoz.values()) {
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
            const soloCorcheas = l => l && l.every(x => x.nivel === 1 && !x.tuplet);
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
                for (const nt of [x.n, ...x.acorde_n]) {
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
      for (const n of aguda.l) cambios += ponerPlica(doc, n.el, 'up');
      for (const n of grave.l) cambios += ponerPlica(doc, n.el, 'down');
      activas.slice(1, -1).forEach((r, i) => {                            // N-PLICA-3: rango i+1 de n (0 = la más aguda)
        if (r.l.some(n => hijo(n.el, 'stem'))) return;
        const sentido = i + 1 < activas.length / 2 ? 'up' : 'down';
        for (const n of r.l) cambios += ponerPlica(doc, n.el, sentido);
      });
    }
    return cambios;
  }
  // N-LIG-3: las ligaduras de unión de la voz aguda van por arriba y las de la grave por abajo (MuseScore, código de
  // slurtielayout: con varias voces la ligadura va del lado de la plica; LilyPond, NR 5.4.1: las ligaduras alternan con la
  // dirección de la plica). En un acorde solo la nota exterior lleva orientación; las interiores las resuelve el grabador.
  function ligadurasPorVozDoc(doc) {
    if (!CONFIG.ligadurasPorVoz) return 0;
    let cambios = 0;
    for (const m of doc.getElementsByTagName('measure')) for (const activas of analizarVoces(m)) {
      for (const [r, arriba] of [[activas[0], true], [activas[activas.length - 1], false]]) {
        const porT = new Map();
        for (const n of r.l) if (n.val !== null && !n.gracia) { if (!porT.has(n.t)) porT.set(n.t, []); porT.get(n.t).push(n) }
        for (const g of porT.values()) {
          const ext = g.reduce((a, b) => (arriba ? b.val > a.val : b.val < a.val) ? b : a);
          for (const ti of ext.el.querySelectorAll('notations > tied')) {
            if (ti.getAttribute('type') !== 'start') continue;
            const [pl, or] = arriba ? ['above', 'over'] : ['below', 'under'];
            if (ti.getAttribute('placement') === pl && ti.getAttribute('orientation') === or) continue;
            ti.setAttribute('placement', pl); ti.setAttribute('orientation', or); cambios++;
          }
        }
      }
    }
    return cambios;
  }
  transformacion({ id: 'plicas-por-voz', regla: 'N-PLICA-2', tipo: 'notacion', aplicar: plicasPorVozDoc });
  transformacion({ id: 'ligaduras-por-voz', regla: 'N-LIG-3', tipo: 'notacion', aplicar: ligadurasPorVozDoc });

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
  regla('N-LIG-3', 'Ligaduras de unión: por arriba en la voz aguda, por abajo en la grave', 'xml', 'aplicada', 'Con dos o más voces simultáneas en un pentagrama, las ligaduras de unión de la voz aguda se dibujan por arriba y las de la grave por abajo (CONFIG.ligadurasPorVoz). En acordes, solo la nota exterior.');
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
  regla('N-VOC-1', 'Tres o más voces en un pentagrama', 'xml', 'pendiente', 'La reconstrucción deja hasta 4 voces en un pentagrama con cabezas encimadas (Allemande, c. 2). Afecta al 0,17 % de los pentagramas-compás.');
  regla('N-VOC-2', 'Unísonos entre voces con duraciones distintas', 'xml', 'pendiente', 'Mismo sonido en dos voces con distinta duración: cabeza compartida (si es posible) o dos cabezas separadas.');
  regla('N-ALT-1', 'Alteraciones que chocan', 'svg', 'pendiente', 'En las reconstrucciones, alteraciones encimadas con otra alteración o con una cabeza (12 en 57 fragmentos). Los márgenes de Verovio no lo resuelven.');
  regla('N-OCT-1', 'Signo de octava frente a muchas líneas adicionales', 'xml', 'pendiente', 'Pasajes con 5 o más líneas adicionales sostenidos: cambiar de clave, de pentagrama o 8va. Hay que fijar el umbral.');
  regla('N-CRUCE-1', 'Notas que cruzan de pentagrama', 'xml', 'pendiente', 'Notas de una mano escritas en el pentagrama de la otra con barra compartida.');
  regla('N-PLICA-4', 'Longitud de plica en acordes, con barra y con cabeza desplazada', 'opciones', 'verovio', 'Plicas alargadas hasta la barra o la nota extrema; plica compartida en acordes de segunda.', 'Verovio');
  regla('N-BARRA-4', 'Grupos irregulares', 'opciones', 'verovio', 'Cifra del tresillo del lado de la barra; corchete solo si ninguna barra abarca el grupo.', 'Verovio');
  regla('N-ALT-3', 'Alteraciones simultáneas en distintas voces', 'xml', 'aplicada', 'La alteración vale para todas las voces del pentagrama (N-ALT-2 por pentagrama); el resto lo resuelve Verovio.');
  regla('N-SIL-3', 'Silencios coincidentes', 'xml', 'pendiente', 'Silencios de igual duración simultáneos en dos voces: fundirlos en uno (MuseScore, «Merge matching rests»).');
  regla('N-LIG-4', 'Ligaduras entre sistemas y en acordes', 'opciones', 'verovio', 'Ligadura partida al cambiar de sistema; una ligadura por nota con pareja en los acordes.', 'Verovio');
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
    // preparación completa de una reconstrucción (lo que antes hacía ordenarVoces en index.html, sin las plicas)
    prepararReconstruccion: (xml, inst) => preparar(xml, { fuente: 'reconstruida', inst }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
