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
    // N-VOC-3: extremos de cada ligadura de unión en el SVG (data-startid / data-endid), para moverlos con su nota
    svgAdditionalAttribute: ['tie@startid', 'tie@endid'],
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
    // N-LIG-2: apartar de plicas, corchetes, barras y cabezas las ligaduras de unión que las cruzan (retoque sobre el SVG)
    ligadurasDespejadas: true,
    // N-CRUCE-1: en las reconstrucciones, una voz interior que cae en el registro de la otra mano pasa a su pentagrama
    vocesPorRegistro: true,
    // N-VOC-1: en las reconstrucciones, como mucho dos capas (plica arriba / abajo) por pentagrama
    dosCapas: true,
    // N-VOC-2: un unísono entre las dos manos se escribe una sola vez
    unisonosUnaVez: true,
    // N-VOC-3: dos voces que atacan la misma nota a la vez comparten la cabeza (plicas opuestas), como en la edición
    cabezaCompartida: true,
    // N-VOC-4: con 3+ voces, las notas de dos voces vecinas que coinciden en ritmo van en un acorde de una plica
    vocesCondensadas: true,
    // N-VOC-4: dos voces con el mismo ritmo en todo el compás se escriben como acordes de una voz
    homorritmia: true,
    // N-LIG-4: las ligaduras de unión entre dos capas se dibujan como ligaduras de MEI
    ligadurasEntreCapas: true,
    // N-CRUCE-2: notas de una voz interior con 3+ líneas adicionales pasan al otro pentagrama si allí caben sin cruzarse
    notasAlOtroPentagrama: true,
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

  // N-LIG-2 (Gould: una ligadura de unión no atraviesa plicas, corchetes ni cabezas; empieza y acaba junto a su nota)
  // Retoque sobre el SVG ya dibujado. Verovio dibuja cada ligadura de unión como una forma cerrada de dos curvas cúbicas
  // («M x,y C … C …»: la curva exterior de ida y la interior de vuelta) y no la aparta de las plicas y corchetes de las voces
  // vecinas ni de los de sus propias notas cuando las notas están muy juntas. Si el interior de la ligadura cruza algo, se
  // prueba, por este orden, (1) acortarla por los extremos hasta librar el obstáculo, (2) hacer el arco más profundo y (3) las
  // dos cosas; se conserva la primera variante que no deja ningún choque y, si ninguna lo logra, la ligadura no se toca.
  const bezier = (t, a, b, c, d) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]] };
  function despejarLigaduras(svg) {
    if (!CONFIG.ligadurasDespejadas || !svg) return 0;
    let cambiadas = 0;
    for (const m of svg.querySelectorAll('g.measure')) {
      const lig = [...m.querySelectorAll(':scope > g.tie')]; if (!lig.length) continue;
      // un espacio de pentagrama, leído de las dos primeras líneas (180 unidades en Verovio)
      const lin = [...(m.querySelector(':scope > g.staff') || document.createElement('g')).querySelectorAll(':scope > path')].slice(0, 2).map(q => +((q.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || [])[1]);
      const sp = lin.length === 2 && lin[1] > lin[0] ? lin[1] - lin[0] : 180;
      const caja = e => { try { const b = e.getBBox(); return b.width > 0 || b.height > 0 ? b : null } catch (_) { return null } };
      const obst = [];
      const rect = (e, dx, dy) => { const b = caja(e); if (b) obst.push({ x0: b.x + dx, x1: b.x + b.width - dx, y0: b.y + dy, y1: b.y + b.height - dy }) };
      for (const e of m.querySelectorAll('g.notehead')) rect(e, sp * 0.18, sp * 0.18);
      for (const e of m.querySelectorAll('g.stem > path')) { const b = caja(e); if (b) obst.push({ x0: b.x - sp * 0.06, x1: b.x + b.width + sp * 0.06, y0: b.y + sp * 0.2, y1: b.y + b.height - sp * 0.2 }) }
      for (const e of m.querySelectorAll('g.flag')) rect(e, sp * 0.1, sp * 0.1);
      for (const e of m.querySelectorAll('g.beam polygon')) rect(e, sp * 0.05, sp * 0.05);
      if (!obst.length) continue;
      for (const g of lig) {
        const q = g.querySelector('path'); if (!q) continue;
        const d0 = q.getAttribute('d') || '', n = (d0.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        if (n.length !== 14 || !/^\s*M[^C]*C[^C]*C[^C]*$/.test(d0)) continue;                       // solo la forma de dos curvas cúbicas
        const ancho = n[6] - n[0]; if (!(ancho > sp * 1.2)) continue;                                   // las ligaduras muy cortas no se tocan
        // puntos del interior de las dos curvas (0,24-0,76 de cada una), con paso de ~0,1 espacios: ni los extremos, donde la
        // ligadura debe tocar su nota, ni los tramos que ya caen sobre la cabeza de destino
        const pasos = Math.max(8, Math.min(120, Math.ceil(ancho / (sp * 0.1) * 0.52)));
        const interior = v => {
          const pts = [], P = (k) => [v[2 * k], v[2 * k + 1]];
          for (let k = 0; k <= pasos; k++) { const t = 0.24 + 0.52 * k / pasos; pts.push(bezier(t, P(0), P(1), P(2), P(3))); pts.push(bezier(t, P(3), P(4), P(5), P(0))) }
          return pts;
        };
        const choques = v => { const dentro = []; for (const [x, y] of interior(v)) for (const o of obst) if (x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1) dentro.push(o); return dentro };
        const c0 = choques(n); if (!c0.length) continue;
        const medio = (n[0] + n[6]) / 2, arriba = (n[3] + n[5]) / 2 < n[1] ? -1 : 1;                    // sentido en que se curva (y crece hacia abajo)
        // recorte: el comienzo pasa de largo las plicas y corchetes de la mitad izquierda; el final se detiene antes de los de la derecha
        let ini = n[0], fin = n[6];
        for (const o of c0) { if ((o.x0 + o.x1) / 2 < medio) ini = Math.max(ini, o.x1 + sp * 0.15); else fin = Math.min(fin, o.x0 - sp * 0.15) }
        const variante = (x0, x1, dy) => {
          const k = (x1 - x0) / (n[6] - n[0]), v = n.slice();
          for (const i of [0, 2, 4, 6, 8, 10, 12]) v[i] = x0 + (n[i] - n[0]) * k;
          for (const i of [3, 5, 9, 11]) v[i] = n[i] + arriba * dy;                                    // solo los puntos de control: los extremos no suben
          return v;
        };
        const recorte = fin - ini >= sp * 1.2 && (ini > n[0] || fin < n[6]);
        const cand = [];
        if (recorte) cand.push([ini, fin, 0]);
        for (let k = 1; k <= 4; k++) cand.push([n[0], n[6], k * sp * 0.2]);
        if (recorte) for (let k = 1; k <= 4; k++) cand.push([ini, fin, k * sp * 0.2]);
        const buena = cand.map(c => variante(...c)).find(v => !choques(v).length);
        if (!buena) continue;
        const r = x => Math.round(x * 100) / 100;
        q.setAttribute('d', `M${r(buena[0])},${r(buena[1])} C${r(buena[2])},${r(buena[3])} ${r(buena[4])},${r(buena[5])} ${r(buena[6])},${r(buena[7])} C${r(buena[8])},${r(buena[9])} ${r(buena[10])},${r(buena[11])} ${r(buena[12])},${r(buena[13])}`);
        g.setAttribute('data-n-lig2', '1'); cambiadas++;
      }
    }
    return cambiadas;
  }
  regla('N-LIG-2', 'Ligaduras que atraviesan notas, plicas o barras', 'svg', 'aplicada', 'Una ligadura de unión cuyo interior cruza una cabeza, plica, corchete o barra se acorta por los extremos y/o se hace más profunda hasta librarlos; si ninguna variante lo logra, no se toca (CONFIG.ligadurasDespejadas). Las ligaduras de expresión no se tocan.');

  // ---------------------------------------------------------------------------------------------------------
  // Voces de las reconstrucciones del DCML (N-CRUCE-1, N-VOC-1, N-VOC-2)
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
        grupos.push(ult); t += d;
      }
      out.push({ m, div, grupos, raro, cambiado: false });
    }
    return out;
  }
  const alturas = g => g.els.map(e => { const p = hijo(e, 'pitch'); return p ? valorPaso(p) : null }).filter(v => v !== null);
  const sonido = e => { const p = hijo(e, 'pitch'); return p ? txt(p, 'step') + (Math.round(+txt(p, 'alter') || 0)) + txt(p, 'octave') : null };
  // voces con notas de un pentagrama: Map voz → {notas, todos, media}
  function vocesDe(grupos, staff) {
    const v = new Map();
    for (const g of grupos) if (g.staff === staff) { if (!v.has(g.voz)) v.set(g.voz, { voz: g.voz, todos: [], notas: [] }); const x = v.get(g.voz); x.todos.push(g); if (!g.silencio) x.notas.push(g) }
    for (const [k, x] of v) { if (!x.notas.length) { v.delete(k); continue } const a = x.notas.flatMap(alturas); x.media = a.reduce((s, y) => s + y, 0) / a.length }
    return v;
  }
  // reescribe un compás a partir de sus grupos: atributos, y luego cada pentagrama y voz con <forward> en los huecos
  function escribirCompas(doc, C) {
    const { m, grupos } = C;
    const atributos = [...m.children].filter(c => c.tagName === 'attributes');
    while (m.firstChild) m.removeChild(m.firstChild);
    atributos.forEach(a => m.append(a));
    const voces = new Map();
    for (const g of grupos) { const k = g.staff + '|' + g.voz; if (!voces.has(k)) voces.set(k, []); voces.get(k).push(g) }
    const claves = [...voces.keys()].sort((a, b) => { const [sa, va] = a.split('|'), [sb, vb] = b.split('|'); return +sa - +sb || +va - +vb });
    const hueco = (tag, d, g) => { const e = doc.createElement(tag), du = doc.createElement('duration'); du.textContent = String(d); e.append(du); if (tag === 'forward') { const v = doc.createElement('voice'); v.textContent = g.voz; const s = doc.createElement('staff'); s.textContent = g.staff; e.append(v, s) } m.append(e) };
    let pos = 0;
    claves.forEach((k, i) => {
      if (i > 0 && pos > 0) hueco('backup', pos, null);
      pos = 0;
      for (const g of voces.get(k).sort((a, b) => a.t - b.t)) {
        if (g.t > pos) hueco('forward', g.t - pos, g);
        g.els.forEach((e, j) => {
          ponerHijo(doc, e, 'voice', g.voz); ponerHijo(doc, e, 'staff', g.staff);
          const ch = hijo(e, 'chord'); if (j === 0 && ch) ch.remove(); if (j > 0 && !ch) e.insertBefore(doc.createElement('chord'), e.firstElementChild);
          m.append(e);
        });
        pos = Math.max(pos, g.t + g.d);
      }
    });
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
  // pentagrama en ese momento: los cruces de manos de la fuente (Medtner, Liszt) no se tocan.
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
        const libre = String(Math.max(0, ...C.grupos.map(g => +g.voz || 0)) + 1);
        const cabe = n => {
          const a = alturas(n); if (Math.max(...a.map(v => lineasAd(v, o))) > 1) return false;
          const otras = C.grupos.filter(g => g.staff === o && !g.silencio && g.t < n.t + n.d && n.t < g.t + g.d).flatMap(alturas);
          return !otras.length || (arriba ? Math.max(...a) < Math.min(...otras) : Math.min(...a) > Math.max(...otras));
        };
        let movidas = 0, siguiendo = -1;
        const notas = V.notas.slice().sort((a, b) => a.t - b.t);
        for (let i = 0; i < notas.length; i++) {
          const n = notas[i], q = Math.floor(n.t / pulso), lejos = Math.min(...alturas(n).map(v => lineasAd(v, s))) >= 3;
          const ligada = i > 0 && notas[i - 1].staff === o && notas[i - 1].t + notas[i - 1].d === n.t && n.els.some(e => ligadurasDe(e).stop);
          if (!((lejos || siguiendo === q || ligada) && cabe(n))) { if (siguiendo !== q) siguiendo = -1; continue }
          n.staff = o; n.voz = libre; siguiendo = q; movidas++;
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
    const restos = grupos.filter(g => !fuera.has(g) && !(g.staff === W.notas[0].staff && g.voz === W.voz && g.silencio && V.notas.some(v => g.t < v.t + v.d && v.t < g.t + g.d)));
    for (const g of V.notas) restos.push({ ...g, voz: W.voz });           // copia: el candidato puede no elegirse
    return restos;
  }
  function acordar(doc, V, W, grupos, div) {
    const staff = W.notas[0].staff;
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
        if (w.silencio) { if (v) return null; for (const [t1, d, f] of piezas) { const c = w.els[0].cloneNode(true); ponerFigura(doc, c, d, f); nuevos.push({ t: t1, d, staff, voz: W.voz, els: [c], silencio: true }) } continue }
        const sonW = w.els.map(sonido), ligV = v ? v.els.map(ligadurasDe) : [];
        // notas de V en este trozo: las que no son unísono de W; un unísono solo vale si W y V empiezan juntas o siguen las dos
        const deV = [];
        if (v) v.els.forEach((e, j) => {
          const i = sonW.indexOf(sonido(e));
          if (i < 0) { deV.push([e, j]); return }
          if ((a === w.t) !== (a === v.t)) deV.push(null);              // un ataque contra una nota que se sostiene: no se puede
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
          nuevos.push({ t: t1, d, staff, voz: W.voz, els, silencio: false });
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
    for (const s of [...new Set(C.grupos.map(g => g.staff))]) {
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
            // como la edición, y comparten la cabeza (N-VOC-3); no se convierten en acordes ligados
            if (brise.has(V) || brise.has(W)) continue;
            const r = !solapan(V.notas, W.notas) ? { grupos: intercalar(V, W, C.grupos), lig: 0 } : acordar(doc, V, W, C.grupos, C.div);
            if (!r) continue;
            const coste = r.lig * 10 + (k === 0 || k === voces.length - 1 ? 5 : 0) + Math.abs(V.media - W.media) / 10;
            if (!mejor || coste < mejor.coste) mejor = { ...r, coste };
          }
        });
        // último recurso: dos voces cualesquiera que no suenan nunca a la vez
        if (!mejor) for (const V of voces) { for (const W of voces) if (V !== W && !brise.has(V) && !brise.has(W) && !solapan(V.notas, W.notas)) { mejor = { grupos: intercalar(V, W, C.grupos) }; break } if (mejor) break }
        if (!mejor) break;
        for (const g of mejor.grupos) if (g.staff === s) limpiar(g);
        C.grupos = mejor.grupos; cambios++;
      }
    }
    return cambios;
  }

  // N-VOC-4 (Gould: las voces que coinciden en ritmo comparten plica, como un acorde). En la edición de la Allemande (c. 3, 4.ª
  // parte: do#5 y la4; c. 4: fa#4 y re#4) dos de tres voces que atacan a la vez con la misma figura van en un acorde de una plica, y
  // la tercera sigue aparte. Con dos voces que coinciden solo en parte no se juntan (cc. 6-7: se lee el contrapunto); si coinciden
  // en todo el compás, van en acordes (homorritmia). Aquí, con tres o más voces, en un pentagrama donde suenan a la vez
  // tres o más voces, la nota de una voz interior que coincide en instante y duración con la de una voz vecina pasa al acorde de
  // esta, si no es unísono (N-VOC-3) y entre las dos caben en una mano (una décima). También las notas que llegan ligadas: en la
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
    for (const g of C.grupos) if (g.staff === s) limpiar(g);
    return 1;
  }
  function condensar(C) {
    let cambios = 0;
    for (const s of [...new Set(C.grupos.map(g => g.staff))]) {
      const voces = [...vocesDe(C.grupos, s).values()]; if (voces.length < 2) continue;
      voces.sort((a, b) => b.media - a.media);
      if (voces.length === 2) { cambios += homorritmia(C, voces, s); continue }
      if (!CONFIG.vocesCondensadas) continue;
      const suenan = t => voces.filter(V => V.notas.some(g => g.t <= t && t < g.t + g.d)).length;
      for (let k = 1; k < voces.length - 1; k++) {
        const V = voces[k];
        for (const n of [...V.notas]) {
          if (suenan(n.t) < 3) continue;
          const an = alturas(n), sn = n.els.map(sonido);
          let mejor = null;
          for (const W of [voces[k - 1], voces[k + 1]]) {
            const m = W.notas.find(g => g.t === n.t && g.d === n.d); if (!m || m.cond) continue;
            const am = alturas(m); if (m.els.some(e => sn.includes(sonido(e)))) continue;          // unísono: N-VOC-3
            const todas = [...an, ...am]; if (Math.max(...todas) - Math.min(...todas) > DECIMA) continue;
            const arriba = W === voces[k - 1]; if (arriba ? Math.min(...am) <= Math.max(...an) : Math.max(...am) >= Math.min(...an)) continue;   // sin cruzarse
            const dist = Math.min(...am.flatMap(a => an.map(b => Math.abs(a - b))));
            if (!mejor || dist < mejor.dist) mejor = { m, dist };
          }
          if (!mejor) continue;
          mejor.m.els = [...mejor.m.els, ...n.els]; mejor.m.cond = true;
          C.grupos.splice(C.grupos.indexOf(n), 1); V.notas.splice(V.notas.indexOf(n), 1);
          cambios++;
        }
      }
      if (cambios) for (const g of C.grupos) if (g.staff === s) limpiar(g);
    }
    for (const g of C.grupos) delete g.cond;
    return cambios;
  }
  regla('N-VOC-4', 'Voces que coinciden en ritmo: un acorde con una plica', 'xml', 'aplicada', 'Reconstrucciones: con tres o más voces sonando en un pentagrama, la nota de una voz interior que coincide en instante y duración con la de una vecina pasa a su acorde, también si llega ligada (sin unísonos, sin cruzarse y en una décima; CONFIG.vocesCondensadas). Dos voces con el mismo ritmo en todo el compás van en acordes de una voz; si coinciden solo en parte, se dejan separadas (CONFIG.homorritmia).');

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

  // N-VOC-3 (Gould: dos voces que comparten una nota la escriben con una sola cabeza y dos plicas, cada una con su duración)
  // Es la escritura del style brisé en la edición de la Allemande (c. 2): mi5 y do#5 en semicorcheas con barra, plica abajo, y
  // las mismas cabezas con plica arriba y su duración real (corchea con puntillo, corchea). Dos pasos:
  //   · XML: si dos voces de un pentagrama atacan a la vez la misma nota con la plica en el mismo sentido, la voz que no es
  //     exterior del pentagrama (o, si las dos lo son o ninguna, la de menos notas) pasa a la plica contraria en todo el compás;
  //   · SVG: Verovio solo comparte la cabeza si las dos notas son iguales de figura y puntillo; si no, la desplaza a un lado.
  //     Aquí se lleva una nota (cabeza, plica, corchete, puntillos y alteración) sobre la otra y se ajustan sus ligaduras.
  function plicasUnisono(xml) {
    if (!CONFIG.cabezaCompartida) return xml;
    let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return xml }
    if (doc.querySelector('parsererror')) return xml;
    let cambios = 0;
    for (const parte of doc.getElementsByTagName('part')) for (const C of leerParte(parte)) {
      if (C.raro) continue;
      for (const s of [...new Set(C.grupos.map(g => g.staff))]) {
        const voces = [...vocesDe(C.grupos, s).values()]; if (voces.length < 2) continue;
        voces.sort((a, b) => b.media - a.media);
        const exterior = V => V === voces[0] || V === voces[voces.length - 1];
        const plica = V => { const e = V.notas.map(g => hijo(g.els[0], 'stem')).find(Boolean); return e ? e.textContent.trim() : null };
        for (let i = 0; i < voces.length; i++) for (let j = i + 1; j < voces.length; j++) {
          const A = voces[i], B = voces[j]; if (!atacanUnisono(A, B)) continue;
          const pa = plica(A), pb = plica(B); if (!pa || pa !== pb) continue;
          const mover = exterior(A) !== exterior(B) ? (exterior(A) ? B : A) : (A.notas.length <= B.notas.length ? A : B);
          const otra = mover === A ? pa : pb, nueva = otra === 'up' ? 'down' : 'up';
          for (const g of mover.notas) for (const e of g.els) { ponerHijo(doc, e, 'stem', nueva); cambios++ }
        }
      }
    }
    return cambios ? new XMLSerializer().serializeToString(doc) : xml;
  }
  // inicio: Map id de nota → instante de ataque (qstamp del timemap de Verovio)
  function cabezasCompartidas(svg, inicio) {
    if (!CONFIG.cabezaCompartida || !svg || !inicio) return 0;
    let movidas = 0;
    const caja = e => { try { return e.getBBox() } catch (_) { return null } };
    for (const st of svg.querySelectorAll('g.measure > g.staff')) {
      const capas = [...st.querySelectorAll(':scope > g.layer')]; if (capas.length < 2) continue;
      const notas = [];
      capas.forEach((c, k) => { for (const n of c.querySelectorAll('g.note')) {
        if (!inicio.has(n.id) || n.closest('g.chord') || n.closest('g.graceGrp')) continue;
        const cab = n.querySelector(':scope > g.notehead'), b = cab && caja(cab); if (!b || !b.width) continue;
        const pl = n.querySelector(':scope > g.stem > path'), pb = pl && caja(pl);
        notas.push({ n, k, t: inicio.get(n.id), x: b.x, y: b.y, w: b.width, viga: !!n.closest('g.beam'), plica: pb ? (pb.y + pb.height / 2 < b.y + b.height / 2 ? 'up' : 'down') : null, cab: (cab.querySelector('use') || {}).getAttribute?.('xlink:href') || (cab.querySelector('use') || {}).getAttribute?.('href') });
      } });
      const usadas = new Set();
      for (const a of notas) for (const b of notas) {
        if (a === b || a.k === b.k || usadas.has(a) || usadas.has(b) || a.t !== b.t || Math.abs(a.y - b.y) > 1) continue;
        const dx0 = b.x - a.x; if (Math.abs(dx0) < 1 || Math.abs(dx0) > a.w * 2.2) continue;
        if (!a.plica || !b.plica || a.plica === b.plica || a.cab !== b.cab) continue;  // misma cabeza y plicas opuestas
        // se mueve la que no está bajo una barra; si ninguna lo está, la desplazada (la de la derecha)
        const [fija, mov] = a.viga && !b.viga ? [a, b] : b.viga && !a.viga ? [b, a] : a.viga ? [null, null] : (a.x < b.x ? [a, b] : [b, a]);
        if (!fija) continue;
        const dx = fija.x - mov.x;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('transform', `translate(${dx},0)`);
        while (mov.n.firstChild) g.appendChild(mov.n.firstChild);
        mov.n.appendChild(g);
        // la alteración ya la lleva la nota fija: no se repite
        if (fija.n.querySelector(':scope > g.accid')) for (const ac of g.querySelectorAll(':scope > g.accid')) ac.setAttribute('display', 'none');
        // ligaduras de unión que salen de la nota movida o llegan a ella: se corre ese extremo
        for (const ti of svg.querySelectorAll(`g.tie[data-startid="#${mov.n.id}"], g.tie[data-endid="#${mov.n.id}"]`)) {
          const q = ti.querySelector('path'), n = ((q && q.getAttribute('d')) || '').match(/-?\d+(?:\.\d+)?/g); if (!n || n.length !== 14) continue;
          const v = n.map(Number), x0 = v[0], x1 = v[6], ini = ti.getAttribute('data-startid') === '#' + mov.n.id;
          const nx0 = ini ? x0 + dx : x0, nx1 = ini ? x1 : x1 + dx; if (!(nx1 - nx0 > 1)) continue;
          for (const i of [0, 2, 4, 6, 8, 10, 12]) v[i] = nx0 + (v[i] - x0) * (nx1 - nx0) / (x1 - x0);
          const r = x => Math.round(x * 100) / 100;
          q.setAttribute('d', `M${r(v[0])},${r(v[1])} C${r(v[2])},${r(v[3])} ${r(v[4])},${r(v[5])} ${r(v[6])},${r(v[7])} C${r(v[8])},${r(v[9])} ${r(v[10])},${r(v[11])} ${r(v[12])},${r(v[13])}`);
        }
        mov.n.setAttribute('data-n-voc3', '1'); usadas.add(a); usadas.add(b); movidas++;
      }
    }
    return movidas;
  }
  regla('N-VOC-3', 'Unísonos entre capas: una cabeza y dos plicas', 'svg', 'aplicada', 'Dos voces que atacan a la vez la misma nota (style brisé) llevan plicas opuestas y comparten la cabeza, cada una con su figura y puntillo, como en la edición; Verovio solo la comparte si figura y puntillo coinciden (CONFIG.cabezaCompartida).');

  // N-LIG-4. Ligaduras de unión entre dos capas. Verovio solo une las de MusicXML dentro de la misma voz (las demás quedan abiertas
  // o se enganchan a otra nota de la misma altura de su capa). Al condensar voces (N-VOC-4) una nota sostenida puede acabar en el
  // acorde de otra voz, ligada desde su capa de origen (Allemande, c. 2: el do#5 en corchea llega al acorde de corcheas). Aquí se
  // busca, por pentagrama y altura, la nota que recibe cada ligadura; si está en otra voz, se quita la ligadura de la notación
  // (<tied>; <tie>, el sonido, se conserva) y se anota el par en las dos notas (id y data-hf-tie). ligadurasMEI la añade después
  // como <tie> de MEI, que sí une notas de capas distintas.
  function ligadurasEntreCapas(xml) {
    if (!CONFIG.ligadurasEntreCapas) return xml;
    let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return xml }
    if (doc.querySelector('parsererror')) return xml;
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
          if (hijo(el, 'pitch') && !gracia) notas.push({ el, t: base + t, d, staff: txt(el, 'staff') || '1', voz: txt(el, 'voice') || '1', s: sonido(el), lig: ligadurasDe(el) });
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
        for (const [n, tipo] of [[a.el, 'start'], [b.el, 'stop']]) { const nt = hijo(n, 'notations'); if (nt) { for (const ti of [...nt.children]) if (ti.tagName === 'tied' && ti.getAttribute('type') === tipo) ti.remove(); if (!nt.children.length) nt.remove() } }
        for (const n of [a.el, b.el]) if (!n.getAttribute('id')) n.setAttribute('id', 'hf-lig' + (k++));
        a.el.setAttribute('data-hf-tie', [a.el.getAttribute('data-hf-tie'), b.el.getAttribute('id')].filter(Boolean).join(' '));
        cand.splice(cand.indexOf(b), 1); cambios++;
      }
    }
    return cambios ? new XMLSerializer().serializeToString(doc) : xml;
  }
  // pares de ligaduras pendientes de un MusicXML (los anota ligadurasEntreCapas)
  function ligadurasPendientes(xml) {
    const out = [];
    for (const m of (xml || '').matchAll(/<note\b[^>]*>/g)) {
      const id = (m[0].match(/\sid="([^"]+)"/) || [])[1], fin = (m[0].match(/\sdata-hf-tie="([^"]+)"/) || [])[1];
      if (id && fin) for (const b of fin.split(/\s+/)) out.push([id, b]);
    }
    return out;
  }
  // añade al MEI (de tk.getMEI()) las ligaduras pendientes, en el compás donde empieza cada una
  function ligadurasMEI(mei, pares) {
    for (const [a, b] of pares) {
      const i = mei.indexOf(`xml:id="${a}"`), j = mei.indexOf(`xml:id="${b}"`); if (i < 0 || j < 0) continue;
      const fin = mei.indexOf('</measure>', i); if (fin < 0) continue;
      mei = mei.slice(0, fin) + `<tie startid="#${a}" endid="#${b}"/>` + mei.slice(fin);
    }
    return mei;
  }
  regla('N-LIG-4', 'Ligaduras de unión entre capas', 'xml', 'aplicada', 'Una ligadura de unión cuya nota de llegada está en otra voz (al condensar voces, N-VOC-4) se pasa a MEI al dibujar, porque Verovio solo une las de MusicXML dentro de una misma voz (CONFIG.ligadurasEntreCapas).');

  // Punto de entrada para las reconstrucciones: reparto entre manos, dos capas por pentagrama y unísonos entre manos
  function vocesReconstruidas(xml) {
    if (!CONFIG.vocesPorRegistro && !CONFIG.dosCapas && !CONFIG.unisonosUnaVez && !CONFIG.vocesCondensadas && !CONFIG.homorritmia && !CONFIG.notasAlOtroPentagrama) return xml;
    let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return xml }
    if (doc.querySelector('parsererror')) return xml;
    let total = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      const staves = Math.max(1, ...[...parte.getElementsByTagName('staves')].map(e => +e.textContent || 1));
      for (const C of leerParte(parte)) {
        if (C.raro) continue;
        let n = 0;
        if (CONFIG.vocesPorRegistro && staves === 2) n += repartir(C);
        if (staves === 2) n += subirNotas(C);
        if (CONFIG.dosCapas) n += reducir(doc, C);
        if (CONFIG.vocesCondensadas || CONFIG.homorritmia) n += condensar(C);
        if (CONFIG.unisonosUnaVez && staves === 2) n += unisonosManos(C);
        if (n) { escribirCompas(doc, C); total += n }
      }
    }
    return total ? new XMLSerializer().serializeToString(doc) : xml;
  }
  regla('N-CRUCE-2', 'Notas sueltas al otro pentagrama', 'xml', 'aplicada', 'Reconstrucciones: en una voz interior, una nota con 3+ líneas adicionales en su pentagrama y como mucho 1 en el otro pasa al otro pentagrama, con lo que le sigue en el pulso, si queda por debajo (o por encima) de todo lo que suena allí (CONFIG.notasAlOtroPentagrama).');
  regla('N-CRUCE-1', 'Notas que cruzan de pentagrama', 'xml', 'aplicada', 'Reconstrucciones: una voz interior que su mano no puede tocar (más de una décima con otra voz a la vez) pasa al pentagrama de la otra mano en ese compás si allí cabe; los cruces de manos de la fuente se conservan (CONFIG.vocesPorRegistro).');
  regla('N-VOC-1', 'Tres o más voces en un pentagrama', 'xml', 'aplicada', 'Reconstrucciones: una voz interior se intercala en la vecina si no suenan a la vez o se escribe como acordes de la vecina con ligaduras de unión; las voces de un style brisé (que atacan una nota a la vez que otra) se dejan en sus capas (N-VOC-3); se rechaza si añade de media más de una ligadura por pulso o más de dos en un pulso (CONFIG.dosCapas).');
  regla('N-VOC-2', 'Unísonos entre voces', 'xml', 'aplicada', 'Reconstrucciones: la misma nota atacada a la vez en las dos manos se escribe una vez (la más larga, o la del pentagrama de su registro). Dentro de un pentagrama, una cabeza con dos plicas, como la dibuja Verovio (CONFIG.unisonosUnaVez).');

    // Reglas que ya aplica el proyecto en otros puntos (se mantienen allí; este catálogo las nombra para poder medirlas)
  regla('N-CLAVE-1', 'Elección y cambio de clave', 'xml', 'existente', 'Reconstrucciones del DCML: clave por tesitura, penalizando las líneas adicionales y los cambios breves. Ediciones profesionales (Sapp, OpenScore…): se conservan sus claves tal cual, con los cambios a mitad de compás (CONFIG.clavesDeLaEdicion).', 'web/index.html · asignarClaves, corregirClaves');
  regla('N-PLICA-1', 'Plicas: dirección y longitud', 'opciones', 'existente', 'Dirección por la nota más alejada de la línea central; plicas que llegan a ella. Verovio lo cumple (auditoría: 0 plicas de menos de 2 espacios).', 'Verovio');
  regla('N-BARRA-1', 'Barras: agrupación por pulso', 'xml', 'existente', 'Las figuras sin barra de las reconstrucciones se agrupan por pulso (3 corcheas en compases compuestos) y se cortan en silencios y notas largas.', 'web/index.html · barrasAutomaticas');
  regla('N-SIL-1', 'Silencios en pentagramas con varias voces', 'svg', 'existente', 'Los silencios de la voz aguda se colocan arriba, los de las demás se ocultan; después se apartan los que pisan notas, plicas o barras de otra voz.', 'web/index.html · ordenarVoces, despejarSilencios');
  regla('N-LIG-1', 'Ligaduras: distancia de seguridad', 'opciones', 'existente', 'Margen de las ligaduras a plicas, barras y notas de otras voces; ligaduras de unión con longitud mínima.', 'web/notacion.js · OPCIONES');
  // Pendientes, con la evidencia medida por herramientas/auditoria_gould.js (muestra de 119 fragmentos, semilla 777)
  regla('N-BARRA-2', 'Barras: pendiente máxima', 'svg', 'pendiente', 'Replanteada: el criterio es la subida de la barra en espacios de pentagrama, no el ángulo. Las barras «de más de 10°» (16 % de las originales, 33 % de las reconstruidas) son casi todas la inclinación de un espacio entre dos corcheas contiguas (16,4°), la habitual en los manuales de grabado. Subiendo más de 1,1 espacios solo hay el 5 % (máximo 2) y en la revisión visual (Op. 53 ii: escalas de fusas) no se ve un defecto. Sin evidencia: no actuar hasta contrastar con la edición.');
  regla('N-ALT-1', 'Alteraciones que chocan', 'svg', 'pendiente', 'En las reconstrucciones, alteraciones encimadas con otra alteración o con una cabeza (12 en 57 fragmentos). Los márgenes de Verovio no lo resuelven.');
  regla('N-OCT-1', 'Signo de octava frente a muchas líneas adicionales', 'xml', 'pendiente', 'Pasajes con 5 o más líneas adicionales sostenidos: cambiar de clave, pasar de pentagrama o 8va (Allemande, c. 5, mano izquierda con re5 en clave de fa). Hay que fijar el umbral: las octavas graves de Schumann (4 líneas) son legítimas.');

  global.Notacion = { opciones: OPCIONES, config: CONFIG, reglas: REGLAS, regla, compasInicio, alteracionesRedundantes, plicasPorVoz, despejarLigaduras, vocesReconstruidas, plicasUnisono, cabezasCompartidas, ligadurasEntreCapas, ligadurasPendientes, ligadurasMEI };
})(typeof window !== 'undefined' ? window : globalThis);
