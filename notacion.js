// Reglas de notación de Harmony Finder.
//
// Conjunto único y centralizado de criterios de grabado para todas las partituras del proyecto (Bach, Beethoven,
// Mozart, corales, reconstrucciones del DCML…). Los criterios siguen las prácticas de grabado profesional que
// recoge Elaine Gould en «Behind Bars» (Faber Music, 2011); aquí se aplican por temas, no se reproduce el libro,
// y los valores numéricos son criterios propios del proyecto, calibrados con herramientas/auditoria_gould.js.
// El catálogo completo, con el estado de cada regla, está en docs/NOTACION.md.
//
// Tres capas, de más a menos barata:
//   1. OPCIONES   parámetros de grabado de Verovio (pendiente de barras, líneas adicionales, márgenes…)
//   2. XML        correcciones sobre el MusicXML antes de grabar (claves, orientación de ligaduras…)
//   3. SVG        retoques sobre el dibujo ya hecho (colisiones que Verovio no resuelve)
// Cada regla tiene un identificador estable (N-…) que se cita en el CHANGELOG, en docs/NOTACION.md y en la auditoría.
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------------------------------------
  // 1. OPCIONES de Verovio
  // ---------------------------------------------------------------------------------------------------------
  const OPCIONES = {
    // aspecto general (estilo de edición moderna: líneas y plicas finas, fuente Bravura)
    font: 'Bravura', staffLineWidth: 0.12, stemWidth: 0.14, barLineWidth: 0.2, ledgerLineThickness: 0.2,
    slurMidpointThickness: 0.5, slurEndpointThickness: 0.06, tieMidpointThickness: 0.45, tieEndpointThickness: 0.06,
    spacingLinear: 0.3, spacingNonLinear: 0.62,
    // N-LIG-1: distancia de seguridad de las ligaduras a plicas, barras y notas de otras voces
    slurMargin: 2, slurCurveFactor: 1.3, slurSymmetry: 0.4, slurEndpointFlexibility: 0.3, tieMinLength: 3,
    // N-ESP-1: aire alrededor de alteraciones y silencios
    leftMarginAccid: 2.2, rightMarginAccid: 0.8, leftMarginRest: 2, rightMarginRest: 1,
  };

  // ---------------------------------------------------------------------------------------------------------
  // Catálogo (se mantiene en sincronía con docs/NOTACION.md; la auditoría lo usa para informar por regla)
  // ---------------------------------------------------------------------------------------------------------
  const REGLAS = [];
  // estado: 'aplicada' (código en este archivo), 'existente' (ya aplicada en otro punto del proyecto, ver `donde`) o 'pendiente'
  const regla = (id, tema, capa, estado, resumen, donde) => REGLAS.push({ id, tema, capa, estado, resumen, donde: donde || 'web/notacion.js' });

  // ---------------------------------------------------------------------------------------------------------
  // 2. XML: correcciones sobre el MusicXML antes de grabar
  // ---------------------------------------------------------------------------------------------------------
  const CONFIG = {
    // N-INI-1: mostrar la indicación de compás al principio de un fragmento que empieza a mitad de la obra
    // (las pruebas lo apagan para medir el efecto de la regla)
    compasAlInicio: true,
    // N-ALT-2: quitar las alteraciones repetidas dentro de un compás
    alteracionesUnaVez: true,
    // N-PLICA-2: dirección de plicas por voz (aguda arriba, grave abajo) en pentagramas con varias voces simultáneas
    plicasPorVoz: true,
    // N-LIG-3: ligaduras de unión por arriba (voz aguda) o por abajo (voz grave) en pentagramas con varias voces simultáneas
    ligadurasPorVoz: true,
    // N-CLAVE-1: en las partituras que ya tienen edición profesional (no reconstruidas) se respetan sus claves, con los
    // cambios a mitad de compás; a false se vuelve a corregir la clave por tesitura (corregirClaves, index.html)
    clavesDeLaEdicion: true,
  };
  const hijo = (n, t) => [...n.children].find(c => c.tagName === t);
  const txt = (n, t) => { const h = n && hijo(n, t); return h ? h.textContent.trim() : '' };

  // N-INI-1 (Gould: la indicación de compás se escribe al comienzo del primer sistema)
  // Un fragmento que empieza a mitad de la obra salía sin indicación de compás (Verovio solo la dibuja donde la obra la
  // escribe). Aquí se recorre la obra hasta el compás `indice` (0-based, el primero que se dibuja), se calcula qué
  // compás rige allí y se escribe explícitamente en ese compás, parte por parte. Las claves y la armadura ya las
  // arrastra bien Verovio (medido con auditoria_gould.js: 0 pentagramas sin clave en 119 fragmentos), por eso no se tocan.
  // Devuelve el XML (el mismo si no hay nada que añadir).
  function compasInicio(xml, indice) {
    if (!CONFIG.compasAlInicio || !(indice > 0)) return xml;      // el compás 1 ya lleva el suyo
    let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return xml }
    if (doc.querySelector('parsererror')) return xml;
    let cambios = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      const compases = [...parte.children].filter(c => c.tagName === 'measure'); if (indice >= compases.length) continue;
      let time = null;
      for (let i = 0; i <= indice; i++) for (const at of compases[i].children) if (at.tagName === 'attributes') for (const c of at.children) if (c.tagName === 'time') time = c;
      const m = compases[indice]; if (!time || m.getElementsByTagName('time').length) continue;
      let at = [...m.children].find(c => c.tagName === 'attributes');
      const primero = [...m.children].find(c => ['note', 'backup', 'forward'].includes(c.tagName));
      if (at && primero && (at.compareDocumentPosition(primero) & Node.DOCUMENT_POSITION_PRECEDING)) at = null;
      if (!at) { at = doc.createElement('attributes'); primero ? m.insertBefore(at, primero) : m.append(at) }
      // orden de MusicXML: divisions, key, time, staves, … (el compás va tras divisions y key)
      const antes = ['footnote', 'level', 'divisions', 'key'];
      const tras = [...at.children].find(c => !antes.includes(c.tagName));
      const copia = time.cloneNode(true); tras ? at.insertBefore(copia, tras) : at.append(copia); cambios++;
    }
    return cambios ? new XMLSerializer().serializeToString(doc) : xml;
  }
  regla('N-INI-1', 'Indicaciones al inicio del sistema (clave, armadura, compás)', 'xml', 'aplicada', 'Un fragmento que empieza a mitad de obra muestra el compás vigente (CONFIG.compasAlInicio). Claves y armadura ya las resuelve Verovio.');


  // N-ALT-2 (Gould: una alteración vale para todo el compás; no se repite)
  // Una alteración escrita ante una nota rige para las demás notas de la misma altura (mismo nombre y octava) del resto del
  // compás en ese pentagrama, sea cual sea la voz; solo se escribe de nuevo si se cambia (becuadro tras sostenido, etc.).
  // Las reconstrucciones desde tablas de notas (DCML) ponen la alteración ante cada nota alterada: aquí se quitan las
  // repetidas. El estado de cada altura al empezar el compás es el de la armadura. No se tocan las alteraciones de
  // precaución o editoriales (entre paréntesis) ni las de las notas ligadas, que se dejan como vienen.
  const PASOS = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const ORDEN_SOST = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const alteracionDeArmadura = (fifths, paso) => {
    if (fifths > 0) return ORDEN_SOST.slice(0, fifths).includes(paso) ? 1 : 0;
    if (fifths < 0) return ORDEN_SOST.slice(7 + fifths).includes(paso) ? -1 : 0;
    return 0;
  };
  function alteracionesRedundantes(xml) {
    if (!CONFIG.alteracionesUnaVez) return xml;
    let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return xml }
    if (doc.querySelector('parsererror')) return xml;
    let quitadas = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      let fifths = 0, divisions = 1;
      for (const compas of [...parte.children].filter(c => c.tagName === 'measure')) {
        const estado = new Map();                            // «staff|paso|octava» → alteración vigente
        const notas = []; let t = 0, ultimaDur = 0, orden = 0;
        for (const el of compas.children) {
          if (el.tagName === 'attributes') {
            const k = hijo(el, 'key'); if (k) fifths = +txt(k, 'fifths') || 0;
            if (txt(el, 'divisions')) divisions = +txt(el, 'divisions') || divisions;
          }
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
          const precaucion = acc && (acc.getAttribute('cautionary') === 'yes' || acc.getAttribute('editorial') === 'yes' || acc.getAttribute('parentheses') === 'yes' || acc.getAttribute('bracket') === 'yes');
          const ligada = [...el.children].some(c => c.tagName === 'tie' && c.getAttribute('type') === 'stop');
          if (acc && !precaucion && !ligada && alt === vigente) { acc.remove(); quitadas++ }
          estado.set(clave, alt);
        }
      }
    }
    return quitadas ? new XMLSerializer().serializeToString(doc) : xml;
  }
  regla('N-ALT-2', 'Alteraciones: una vez por compás', 'xml', 'aplicada', 'Una alteración rige para las notas de la misma altura del resto del compás en ese pentagrama; las repetidas de las reconstrucciones del DCML se quitan (CONFIG.alteracionesUnaVez). No toca precauciones, editoriales ni notas ligadas.');

  // N-PLICA-2 (Gould: con varias voces en un pentagrama, la plica de cada voz mira siempre al mismo lado)
  // Con dos o más voces que suenan a la vez en un mismo pentagrama, la voz más aguda lleva la plica hacia arriba y la más
  // grave hacia abajo, en todo el compás, sea cual sea la altura de cada nota; las voces intermedias se dejan como las
  // resuelva el grabador. Verovio reparte las plicas según el orden en que la voz aparece en el archivo, y en las
  // ediciones donde la voz grave se escribe antes (o la voz aguda lleva otro número) las plicas de una voz atraviesan
  // las cabezas de la otra. Solo actúa si las dos voces coinciden en el tiempo: si alternan sin sonar a la vez no hay
  // choque posible y se dejan como vienen. Se aplica a todas las partituras (originales, convertidas y reconstruidas).
  const valorPaso = pitch => { const p = PASOS[txt(pitch, 'step')]; return p === undefined ? null : (+txt(pitch, 'octave') || 0) * 7 + p };
  const ANTES_DE_PLICA = ['notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];
  function plicasPorVoz(xml) {
    if (!CONFIG.plicasPorVoz && !CONFIG.ligadurasPorVoz) return xml;
    let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return xml }
    if (doc.querySelector('parsererror')) return xml;
    let cambios = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      for (const compas of [...parte.children].filter(c => c.tagName === 'measure')) {
        const notas = []; let t = 0, ultimaDur = 0;
        for (const el of compas.children) {
          const d = +txt(el, 'duration') || 0;
          if (el.tagName === 'backup') t -= d;
          else if (el.tagName === 'forward') t += d;
          else if (el.tagName === 'note') {
            const acorde = !!hijo(el, 'chord'), gracia = !!hijo(el, 'grace');
            if (acorde) t -= ultimaDur;
            const pitch = hijo(el, 'pitch');
            if (!hijo(el, 'rest')) notas.push({ el, staff: txt(el, 'staff') || '1', voz: txt(el, 'voice') || '1', t, fin: t + d, val: pitch ? valorPaso(pitch) : null, gracia });
            if (!gracia) { t += d; ultimaDur = d } else ultimaDur = 0;
          }
        }
        const porStaff = new Map();
        for (const n of notas) { if (!porStaff.has(n.staff)) porStaff.set(n.staff, new Map()); const m = porStaff.get(n.staff); if (!m.has(n.voz)) m.set(n.voz, []); m.get(n.voz).push(n) }
        for (const voces of porStaff.values()) {
          if (voces.size < 2) continue;
          const resumen = [...voces].map(([voz, l]) => { const v = l.map(n => n.val).filter(x => x !== null); return { voz, l, media: v.length ? v.reduce((s, x) => s + x, 0) / v.length : null } }).filter(r => r.media !== null);
          if (resumen.length < 2) continue;
          resumen.sort((a, b) => b.media - a.media);                           // la más aguda primero
          const aguda = resumen[0], grave = resumen[resumen.length - 1];
          if (aguda.media === grave.media) continue;
          const coinciden = aguda.l.some(a => !a.gracia && grave.l.some(b => !b.gracia && a.t < b.fin && b.t < a.fin));
          if (!coinciden) continue;
          if (CONFIG.plicasPorVoz) for (const [r, sentido] of [[aguda, 'up'], [grave, 'down']]) for (const n of r.l) {
            let s = hijo(n.el, 'stem');
            if (s) { if (s.textContent.trim() === sentido) continue; s.textContent = sentido }
            else { s = doc.createElement('stem'); s.textContent = sentido; const ref = [...n.el.children].find(c => ANTES_DE_PLICA.includes(c.tagName)); ref ? n.el.insertBefore(s, ref) : n.el.append(s) }
            cambios++;
          }
          // N-LIG-3: las ligaduras de unión de la voz aguda van por arriba y las de la grave por abajo. En un acorde solo la nota
          // exterior (la más aguda en la voz aguda, la más grave en la grave) lleva orientación; las interiores las resuelve el grabador
          if (CONFIG.ligadurasPorVoz) for (const [r, arriba] of [[aguda, true], [grave, false]]) {
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
      }
    }
    return cambios ? new XMLSerializer().serializeToString(doc) : xml;
  }
  regla('N-LIG-3', 'Ligaduras de unión: por arriba en la voz aguda, por abajo en la grave', 'xml', 'aplicada', 'Con dos o más voces simultáneas en un pentagrama, las ligaduras de unión de la voz aguda se dibujan por arriba y las de la grave por abajo, para que no pasen por las notas de la otra voz (CONFIG.ligadurasPorVoz). En acordes, solo la nota exterior. Se aplica a todas las fuentes.');
  regla('N-PLICA-2', 'Plicas: una dirección por voz', 'xml', 'aplicada', 'Con dos o más voces simultáneas en un pentagrama, la más aguda lleva la plica hacia arriba y la más grave hacia abajo en todo el compás (CONFIG.plicasPorVoz). Se aplica a todas las fuentes.');

    // Reglas que ya aplica el proyecto en otros puntos (se mantienen allí; este catálogo las nombra para poder medirlas)
  regla('N-CLAVE-1', 'Elección y cambio de clave', 'xml', 'existente', 'Reconstrucciones del DCML: clave por tesitura, penalizando las líneas adicionales y los cambios breves. Ediciones profesionales (Sapp, OpenScore…): se conservan sus claves tal cual, con los cambios a mitad de compás (CONFIG.clavesDeLaEdicion).', 'web/index.html · asignarClaves, corregirClaves');
  regla('N-PLICA-1', 'Plicas: dirección y longitud', 'opciones', 'existente', 'Dirección por la nota más alejada de la línea central; plicas que llegan a ella. Verovio lo cumple (auditoría: 0 plicas de menos de 2 espacios).', 'Verovio');
  regla('N-BARRA-1', 'Barras: agrupación por pulso', 'xml', 'existente', 'Las figuras sin barra de las reconstrucciones se agrupan por pulso (3 corcheas en compases compuestos) y se cortan en silencios y notas largas.', 'web/index.html · barrasAutomaticas');
  regla('N-SIL-1', 'Silencios en pentagramas con varias voces', 'svg', 'existente', 'Los silencios de la voz aguda se colocan arriba, los de las demás se ocultan; después se apartan los que pisan notas, plicas o barras de otra voz.', 'web/index.html · ordenarVoces, despejarSilencios');
  regla('N-LIG-1', 'Ligaduras: distancia de seguridad', 'opciones', 'existente', 'Margen de las ligaduras a plicas, barras y notas de otras voces; ligaduras de unión con longitud mínima.', 'web/notacion.js · OPCIONES');
  // Pendientes, con la evidencia medida por herramientas/auditoria_gould.js (muestra de 119 fragmentos, semilla 777)
  regla('N-BARRA-2', 'Barras: pendiente máxima', 'svg', 'pendiente', 'El 14 % de las barras de las ediciones originales y el 32 % de las reconstruidas pasan de 10°. Las opciones de Verovio no lo corrigen (beamMaxSlope de 1 a 20 no tiene efecto; 0 las aplana todas): hay que recalcular barras y plicas en el SVG o en MEI.');
  regla('N-VOC-1', 'Tres o más voces en un pentagrama', 'xml', 'pendiente', 'La reconstrucción deja hasta 4 voces en un pentagrama con 3 de ellas con la plica abajo y las cabezas encimadas (Allemande, c. 2). Requiere reparto de voces (fusionar las que no se solapan) y desplazamiento de cabezas.');
  regla('N-VOC-2', 'Unísonos entre voces con duraciones distintas', 'xml', 'pendiente', 'Mismo sonido en dos voces con distinta duración: una cabeza compartida con la plica de la más larga, o dos cabezas separadas.');
  regla('N-LIG-2', 'Ligaduras que atraviesan notas, plicas o barras', 'svg', 'pendiente', 'Afectan al 2 % de las ligaduras de las originales y al 7 % de las reconstruidas; ningún valor de slurMargin, slurCurveFactor o slurSymmetry lo mejora.');
  regla('N-ALT-1', 'Alteraciones que chocan', 'svg', 'pendiente', 'En las reconstrucciones, alteraciones encimadas con otra alteración o con una cabeza (12 en 57 fragmentos). Los márgenes de Verovio no lo resuelven.');
  regla('N-OCT-1', 'Signo de octava frente a muchas líneas adicionales', 'xml', 'pendiente', 'Pasajes con 5 o más líneas adicionales sostenidos: cambiar de clave, pasar de pentagrama o 8va (Allemande, c. 5, mano izquierda con re5 en clave de fa). Hay que fijar el umbral: las octavas graves de Schumann (4 líneas) son legítimas.');
  regla('N-CRUCE-1', 'Notas que cruzan de pentagrama', 'xml', 'pendiente', 'Notas de una mano escritas en el pentagrama de la otra con barra compartida, en lugar de líneas adicionales o cambios de clave.');

  global.Notacion = { opciones: OPCIONES, config: CONFIG, reglas: REGLAS, regla, compasInicio, alteracionesRedundantes, plicasPorVoz };
})(typeof window !== 'undefined' ? window : globalThis);
