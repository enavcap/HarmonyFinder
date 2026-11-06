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

    // Reglas que ya aplica el proyecto en otros puntos (se mantienen allí; este catálogo las nombra para poder medirlas)
  regla('N-CLAVE-1', 'Elección y cambio de clave', 'xml', 'existente', 'Se elige la clave por tesitura, penalizando las líneas adicionales y los cambios breves de clave.', 'web/index.html · asignarClaves, corregirClaves');
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

  global.Notacion = { opciones: OPCIONES, config: CONFIG, reglas: REGLAS, regla, compasInicio };
})(typeof window !== 'undefined' ? window : globalThis);
