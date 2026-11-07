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
    // N-LIG-2: apartar de plicas, corchetes, barras y cabezas las ligaduras de unión que las cruzan (retoque sobre el SVG)
    ligadurasDespejadas: true,
    // N-CRUCE-1: en las reconstrucciones, una voz interior que cae en el registro de la otra mano pasa a su pentagrama
    vocesPorRegistro: true,
    // N-VOC-1: en las reconstrucciones, como mucho dos capas (plica arriba / abajo) por pentagrama
    dosCapas: true,
    // N-VOC-2: un unísono entre las dos manos se escribe una sola vez
    unisonosUnaVez: true,
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
  // derecha, la más grave de la izquierda) pasa al otro pentagrama en ese compás si:
  //   (a) su mano no puede tocarla: a la vez que alguna de sus notas, otra voz del mismo pentagrama está a más de una décima
  //       (9 pasos diatónicos; Allemande, c. 1: la5 y la3 en la derecha), y en la otra mano esa extensión cabe; o
  //   (b) en su pentagrama lleva de media 3 o más líneas adicionales y en el otro como mucho 1 (Allemande, c. 5: sol#2 en sol).
  // Una voz de tenor que la mano izquierda alcanza (la3-do#4 bajo un si2) se queda abajo, como en la edición.
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
          const propio = vals.reduce((x, y) => x + lineasAd(y, s), 0) / vals.length, ajeno = vals.reduce((x, y) => x + lineasAd(y, o), 0) / vals.length;
          const a = extension(V, propias.filter(x => x !== V)) > DECIMA && extension(V, ajenas) <= DECIMA && Math.max(...vals.map(y => lineasAd(y, o))) <= 3;
          const b = propio >= 3 && ajeno <= 1;
          if (a || b) { movida = V; break }
        }
        if (!movida) break;
        const libre = String(Math.max(0, ...C.grupos.map(g => +g.voz || 0)) + 1);
        for (const g of movida.todos) { g.staff = o; g.voz = libre }
        cambios++;
      }
    }
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
  function reducir(doc, C) {
    let cambios = 0;
    for (const s of [...new Set(C.grupos.map(g => g.staff))]) {
      for (let vuelta = 0; vuelta < 4; vuelta++) {
        const voces = [...vocesDe(C.grupos, s).values()]; if (voces.length <= 2) break;
        voces.sort((a, b) => b.media - a.media);
        // candidatos: cada voz absorbida en una vecina (por altura); se elige la que añade menos ligaduras y, a igualdad,
        // la que absorbe una voz interior y la más cercana en altura
        let mejor = null;
        voces.forEach((V, k) => {
          for (const W of [voces[k - 1], voces[k + 1]]) {
            if (!W) continue;
            const r = !solapan(V.notas, W.notas) ? { grupos: intercalar(V, W, C.grupos), lig: 0 } : acordar(doc, V, W, C.grupos, C.div);
            if (!r) continue;
            const coste = r.lig * 10 + (k === 0 || k === voces.length - 1 ? 5 : 0) + Math.abs(V.media - W.media) / 10;
            if (!mejor || coste < mejor.coste) mejor = { ...r, coste };
          }
        });
        // último recurso: dos voces cualesquiera que no suenan nunca a la vez
        if (!mejor) for (const V of voces) { for (const W of voces) if (V !== W && !solapan(V.notas, W.notas)) { mejor = { grupos: intercalar(V, W, C.grupos) }; break } if (mejor) break }
        if (!mejor) break;
        for (const g of mejor.grupos) if (g.staff === s) limpiar(g);
        C.grupos = mejor.grupos; cambios++;
      }
    }
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

  // Punto de entrada para las reconstrucciones: reparto entre manos, dos capas por pentagrama y unísonos entre manos
  function vocesReconstruidas(xml) {
    if (!CONFIG.vocesPorRegistro && !CONFIG.dosCapas && !CONFIG.unisonosUnaVez) return xml;
    let doc; try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch (e) { return xml }
    if (doc.querySelector('parsererror')) return xml;
    let total = 0;
    for (const parte of doc.getElementsByTagName('part')) {
      const staves = Math.max(1, ...[...parte.getElementsByTagName('staves')].map(e => +e.textContent || 1));
      for (const C of leerParte(parte)) {
        if (C.raro) continue;
        let n = 0;
        if (CONFIG.vocesPorRegistro && staves === 2) n += repartir(C);
        if (CONFIG.dosCapas) n += reducir(doc, C);
        if (CONFIG.unisonosUnaVez && staves === 2) n += unisonosManos(C);
        if (n) { escribirCompas(doc, C); total += n }
      }
    }
    return total ? new XMLSerializer().serializeToString(doc) : xml;
  }
  regla('N-CRUCE-1', 'Notas que cruzan de pentagrama', 'xml', 'aplicada', 'Reconstrucciones: una voz interior que su mano no puede tocar (más de una décima con otra voz a la vez, y en la otra mano cabe) o que necesita 3+ líneas adicionales que en el otro pentagrama no necesita pasa al pentagrama de la otra mano en ese compás (CONFIG.vocesPorRegistro).');
  regla('N-VOC-1', 'Tres o más voces en un pentagrama', 'xml', 'aplicada', 'Reconstrucciones: como mucho dos capas por pentagrama. Una voz interior se intercala en la vecina si no suenan a la vez o se escribe como acordes de la vecina, con ligaduras de unión donde se sostiene (style brisé); se rechaza si añade de media más de una ligadura por pulso o más de dos en un pulso (CONFIG.dosCapas).');
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

  global.Notacion = { opciones: OPCIONES, config: CONFIG, reglas: REGLAS, regla, compasInicio, alteracionesRedundantes, plicasPorVoz, despejarLigaduras, vocesReconstruidas };
})(typeof window !== 'undefined' ? window : globalThis);
