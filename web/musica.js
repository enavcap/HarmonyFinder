// Modelo musical normalizado e integridad musical de Harmony Finder.
//
// El motor de notación no crea un formato intermedio propio: MusicXML ya tiene la estructura necesaria (partes,
// pentagramas, voces, compases, acordes, ligaduras…) y todas las transformaciones trabajan sobre su DOM. Lo que este
// módulo añade es una LECTURA normalizada de ese DOM —cada nota y cada silencio con su parte, compás, instante métrico
// (en negras, con la anacrusa y los <backup>/<forward> resueltos), pentagrama, voz, altura y duración— y, sobre ella,
// una HUELLA por propiedad musical que permite comprobar qué ha cambiado una transformación.
//
// Uso típico (lo hace Notacion.preparar en cada transformación):
//   const antes = Musica.huella(doc);  …transformar doc…;  const dif = Musica.comparar(antes, Musica.huella(doc), permitidas)
// `dif` lista las diferencias en las propiedades NO permitidas; si no está vacía, la transformación ha alterado información
// musical que no declaró y se lanza (o se registra) un Musica.ErrorIntegridad (código HF-INTEGRIDAD).
//
// Especificación: docs/ESPECIFICACION_GRABADO_MUSICAL.md, sección «Integridad musical» (reglas I-…).
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------------------------------------
  // Propiedades musicales que se vigilan. Cada transformación declara cuáles puede modificar; las demás deben quedar intactas.
  // Las propiedades de PRESENTACIÓN pura (dirección de plicas, barras, orientación de ligaduras, posición de silencios…) no
  // se vigilan: son precisamente lo que el motor de grabado tiene derecho a decidir.
  // ---------------------------------------------------------------------------------------------------------
  const PROPIEDADES = {
    notas: 'Notas: número, instante métrico y altura (nombre, alteración sonora y octava) de cada nota',
    duraciones: 'Duración de cada nota',
    silencios: 'Silencios: número, instante y duración (visibles u ocultos)',
    silenciosVisibles: 'Qué silencios se imprimen (print-object)',
    pentagramas: 'Pentagrama al que pertenece cada nota',
    voces: 'Reparto de las notas entre voces (qué notas van juntas en la misma voz; sin mirar el número de voz)',
    numeracionVoces: 'Número de voz de cada nota (etiqueta <voice>)',
    acordes: 'Estructura de acordes (qué notas comparten plica)',
    ligadurasUnion: 'Ligaduras de prolongación (<tie>/<tied>) de cada nota',
    ligadurasExpresion: 'Ligaduras de expresión (<slur>) de cada nota',
    alteracionesEscritas: 'Alteraciones impresas (<accidental>) de cada nota',
    instrumentos: 'Partes (instrumentos) y número de pentagramas de cada una',
    nombresInstrumento: 'Nombres de los instrumentos (<part-name>, <part-abbreviation>)',
    compases: 'Número de compases de cada parte',
    numeracionCompases: 'Número escrito de cada compás (atributo number)',
    metrica: 'Indicación de compás vigente en cada compás',
    armadura: 'Armadura vigente en cada compás',
    claves: 'Claves y cambios de clave',
    octavas: 'Líneas de octava (8va, 8vb, 15ma…)',
    tempo: 'Indicaciones de tempo y metrónomo',
    dinamicas: 'Dinámicas y reguladores',
    textos: 'Textos de expresión e indicaciones de interpretación (<words>, pedal…)',
    articulaciones: 'Articulaciones (<articulations>)',
    adornos: 'Adornos y calderones (<ornaments>, <fermata>)',
    armonias: 'Cifrados armónicos del archivo (<harmony>)',
    letra: 'Letra (<lyric>)',
    sonido: 'Lo que suena: ataques de cada altura (sin las notas que llegan ligadas; dos ataques iguales a la vez cuentan como uno) y tramos en que suena cada altura (uniendo notas ligadas o seguidas). Ninguna transformación puede cambiarlo: es la garantía de las estructurales que parten notas en trozos ligados o quitan un unísono duplicado (N-VOC-1, N-VOC-2)',
    lecturaAlturas: 'Notas cuya altura escrita (armadura + alteraciones impresas del compás) no coincide con la sonora: una transformación puede reducirlas, nunca añadir',
  };

  class ErrorIntegridad extends Error {
    constructor(transformacion, diferencias) {
      super(`HF-INTEGRIDAD: «${transformacion}» alteró ${[...new Set(diferencias.map(d => d.propiedad))].join(', ')}: ` +
        diferencias.slice(0, 4).map(d => d.detalle).join(' · ') + (diferencias.length > 4 ? ` (y ${diferencias.length - 4} más)` : ''));
      this.name = 'ErrorIntegridad'; this.codigo = 'HF-INTEGRIDAD'; this.transformacion = transformacion; this.diferencias = diferencias;
    }
  }

  const hijo = (n, t) => { for (const c of n.children) if (c.tagName === t) return c; return null };
  const txt = (n, t) => { const h = n && hijo(n, t); return h ? h.textContent.trim() : '' };
  const PASOS = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const redondo = x => Math.round(x * 1e4) / 1e4;
  const docDe = x => {
    if (typeof x !== 'string') return x;
    const d = new DOMParser().parseFromString(x, 'application/xml');
    if (d.querySelector('parsererror')) throw new Error('MusicXML mal formado');
    return d;
  };

  // ---------------------------------------------------------------------------------------------------------
  // Lectura normalizada
  // ---------------------------------------------------------------------------------------------------------
  // Devuelve { partes: [{ id, pentagramas, compases: [{ i, numero, divisiones, metrica, armadura, eventos: [...], ... }] }] }
  // Cada evento: { el, tipo: 'nota'|'silencio', parte, compas (índice 0-based), t (inicio, en negras desde el principio del
  // compás), dur (negras), gracia (orden dentro del grupo de notas de adorno, o 0), pentagrama, voz, paso, alter, octava,
  // altura ('C#4'), acorde (id del acorde), oculto, ligaduras ['start'|'stop'…], expresion ['start 1'…], alteracion }
  function leer(x) {
    const doc = docDe(x), partes = [];
    for (const parte of doc.getElementsByTagName('part')) {
      const P = { id: parte.getAttribute('id') || '', pentagramas: 1, compases: [] };
      let div = 1, metrica = '', armadura = '0', nAcorde = 0;
      for (const m of parte.children) {
        if (m.tagName !== 'measure') continue;
        const M = { i: P.compases.length, numero: m.getAttribute('number') || '', eventos: [], claves: [], octavas: 0, tempo: [], dinamicas: 0, textos: 0, armonias: 0 };
        let t = 0, ultimaDur = 0, acordeAct = null, graciaN = 0;
        for (const el of m.children) {
          const tag = el.tagName;
          if (tag === 'attributes') {
            const dv = txt(el, 'divisions'); if (dv) div = +dv || div;
            const st = txt(el, 'staves'); if (st) P.pentagramas = +st || P.pentagramas;
            for (const c of el.children) {
              if (c.tagName === 'key') armadura = txt(c, 'fifths') + (txt(c, 'mode') ? ' ' + txt(c, 'mode') : '');
              else if (c.tagName === 'time') metrica = c.getAttribute('symbol') === 'senza-misura' ? 'senza' : [...c.children].filter(e => e.tagName === 'beats' || e.tagName === 'beat-type').map(e => e.textContent.trim()).join('/');
              else if (c.tagName === 'clef') M.claves.push(`${redondo(t / div)}|${c.getAttribute('number') || '1'}|${txt(c, 'sign')}${txt(c, 'line')}${txt(c, 'clef-octave-change') ? '^' + txt(c, 'clef-octave-change') : ''}`);
            }
            continue;
          }
          if (tag === 'backup') { t -= +txt(el, 'duration') || 0; continue }
          if (tag === 'forward') { t += +txt(el, 'duration') || 0; continue }
          if (tag === 'harmony') { M.armonias++; continue }
          if (tag === 'direction') {
            for (const dt of el.getElementsByTagName('direction-type')) for (const c of dt.children) {
              if (c.tagName === 'octave-shift') M.octavas++;
              else if (c.tagName === 'metronome') M.tempo.push(`${redondo(t / div)}|${c.textContent.replace(/\s+/g, ' ').trim()}`);
              else if (c.tagName === 'dynamics' || c.tagName === 'wedge') M.dinamicas++;
              else if (c.tagName === 'words' || c.tagName === 'pedal' || c.tagName === 'rehearsal') M.textos++;
            }
            for (const s of el.getElementsByTagName('sound')) if (s.getAttribute('tempo')) M.tempo.push(`${redondo(t / div)}|q=${s.getAttribute('tempo')}`);
            continue;
          }
          if (tag === 'sound' && el.getAttribute('tempo')) { M.tempo.push(`${redondo(t / div)}|q=${el.getAttribute('tempo')}`); continue }
          if (tag !== 'note') continue;
          const d = +txt(el, 'duration') || 0, esAcorde = !!hijo(el, 'chord'), gracia = !!hijo(el, 'grace');
          if (esAcorde) t -= ultimaDur; else acordeAct = ++nAcorde;
          const pitch = hijo(el, 'pitch'), rest = hijo(el, 'rest'), unp = hijo(el, 'unpitched');
          if (gracia && !esAcorde) graciaN++; else if (!gracia) graciaN = 0;
          const E = {
            el, tipo: rest ? 'silencio' : 'nota', parte: P.id, compas: M.i, t: redondo(t / div), dur: gracia ? 0 : redondo(d / div), gracia: gracia ? graciaN : 0,
            pentagrama: txt(el, 'staff') || '1', voz: txt(el, 'voice') || '1', acorde: acordeAct, oculto: el.getAttribute('print-object') === 'no',
          };
          if (pitch) { E.paso = txt(pitch, 'step'); E.alter = +txt(pitch, 'alter') || 0; E.octava = +txt(pitch, 'octave') || 0; E.altura = E.paso + (E.alter ? (E.alter > 0 ? '#'.repeat(E.alter) : 'b'.repeat(-E.alter)) : '') + E.octava; E.valor = E.octava * 7 + (PASOS[E.paso] ?? 0) }
          else if (unp) { E.altura = 'u' + txt(unp, 'display-step') + txt(unp, 'display-octave') }
          else E.altura = rest ? 'r' : '?';
          E.ligaduras = []; E.expresion = []; E.articulaciones = 0; E.adornos = 0; E.dinamicas = 0; E.letra = 0;
          for (const c of el.children) {
            if (c.tagName === 'tie') E.ligaduras.push('s:' + c.getAttribute('type'));
            else if (c.tagName === 'lyric') E.letra++;
            else if (c.tagName === 'notations') for (const n of c.children) {
              if (n.tagName === 'tied') E.ligaduras.push('n:' + n.getAttribute('type'));
              else if (n.tagName === 'slur') E.expresion.push(n.getAttribute('type') + ' ' + (n.getAttribute('number') || '1'));
              else if (n.tagName === 'articulations') E.articulaciones += n.children.length;
              else if (n.tagName === 'ornaments' || n.tagName === 'fermata') E.adornos += Math.max(1, n.children.length);
              else if (n.tagName === 'dynamics') E.dinamicas++;
            }
          }
          E.ligaduras.sort(); E.expresion.sort();
          const acc = hijo(el, 'accidental'); E.alteracion = acc ? acc.textContent.trim() + (acc.getAttribute('parentheses') === 'yes' || acc.getAttribute('cautionary') === 'yes' ? '()' : '') : '';
          M.eventos.push(E);
          if (!gracia) { t += d; ultimaDur = d } else ultimaDur = 0;
        }
        M.divisiones = div; M.metrica = metrica; M.armadura = armadura;
        P.compases.push(M);
      }
      partes.push(P);
    }
    const nombres = [...doc.getElementsByTagName('score-part')].map(sp => `${sp.getAttribute('id')}|${txt(sp, 'part-name')}|${hijo(sp, 'part-name')?.getAttribute('print-object') || ''}|${txt(sp, 'part-abbreviation')}`);
    return { doc, partes, nombres };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Huella: para cada propiedad, un multiconjunto (Map clave → número de apariciones) que no depende del orden del archivo
  // ---------------------------------------------------------------------------------------------------------
  function huella(x) {
    const mod = x && x.partes ? x : leer(x), H = {};
    for (const k of Object.keys(PROPIEDADES)) H[k] = new Map();
    const pon = (k, clave, n = 1) => H[k].set(clave, (H[k].get(clave) || 0) + n);
    for (const P of mod.partes) {
      sonidoDe(P, H.sonido);
      pon('instrumentos', `${P.id}|pentagramas=${P.pentagramas}`);
      pon('compases', `${P.id}|${P.compases.length}`);
      for (const M of P.compases) {
        const c = `${P.id}|c${M.i}`;
        pon('numeracionCompases', `${c}|${M.numero}`);
        pon('metrica', `${c}|${M.metrica}`); pon('armadura', `${c}|${M.armadura}`);
        for (const k of M.claves) pon('claves', `${c}|${k}`);
        if (M.octavas) pon('octavas', c, M.octavas);
        for (const k of M.tempo) pon('tempo', `${c}|${k}`);
        if (M.armonias) pon('armonias', c, M.armonias);
        if (M.dinamicas) pon('dinamicas', c, M.dinamicas);
        if (M.textos) pon('textos', c, M.textos);
        const grupos = new Map(), acordes = new Map();
        for (const E of M.eventos) {
          const id = `${c}|t${E.t}${E.gracia ? 'g' + E.gracia : ''}|${E.altura}`;
          if (E.tipo === 'silencio') {
            pon('silencios', `${c}|t${E.t}|p${E.pentagrama}|d${E.dur}`);
            if (!E.oculto) pon('silenciosVisibles', `${c}|t${E.t}|p${E.pentagrama}|d${E.dur}`);
            continue;
          }
          pon('notas', id); pon('duraciones', `${id}|d${E.dur}`); pon('pentagramas', `${id}|p${E.pentagrama}`);
          pon('numeracionVoces', `${id}|v${E.voz}`);
          if (E.ligaduras.length) pon('ligadurasUnion', `${id}|${E.ligaduras.join(',')}`);
          if (E.expresion.length) pon('ligadurasExpresion', `${id}|${E.expresion.length}`);
          pon('alteracionesEscritas', `${id}|${E.alteracion || '-'}`);
          if (E.articulaciones) pon('articulaciones', id, E.articulaciones);
          if (E.adornos) pon('adornos', id, E.adornos);
          if (E.dinamicas) pon('dinamicas', id, E.dinamicas);
          if (E.letra) pon('letra', id, E.letra);
          const gv = `${E.pentagrama}|${E.voz}`; if (!grupos.has(gv)) grupos.set(gv, []); grupos.get(gv).push(id);
          if (!acordes.has(E.acorde)) acordes.set(E.acorde, []); acordes.get(E.acorde).push(id);
        }
        for (const id of lecturaIncorrecta(M)) pon('lecturaAlturas', id);
        for (const l of grupos.values()) pon('voces', `${c}|${l.sort().join('+')}`);
        for (const l of acordes.values()) if (l.length > 1) pon('acordes', l.sort().join('+'));
      }
    }
    for (const n of mod.nombres) pon('nombresInstrumento', n);
    return H;
  }

  // I-7. Lo que suena, por parte: instantes absolutos (en negras) desde el principio, con la duración nominal de cada compás
  // (la de su indicación; en un compás incompleto, lo que dura su contenido). Los ataques se cuentan una vez aunque se repitan
  // en dos voces o pentagramas, y los tramos de cada altura se unen: así partir una nota en trozos ligados o quitar la copia de
  // un unísono no cambia la huella, y cualquier nota perdida, añadida, movida o alargada sí.
  function sonidoDe(P, mapa) {
    const ataques = new Set(), tramos = new Map(); let base = 0;
    for (const M of P.compases) {
      let fin = 0;
      for (const E of M.eventos) {
        fin = Math.max(fin, E.t + E.dur);
        if (E.tipo !== 'nota' || E.gracia) continue;
        const ini = redondo(base + E.t), fn = redondo(base + E.t + E.dur);
        if (!E.ligaduras.includes('s:stop')) ataques.add(`${P.id}|a|${E.altura}|${ini}`);
        if (!tramos.has(E.altura)) tramos.set(E.altura, []); tramos.get(E.altura).push([ini, fn]);
      }
      const [b, t] = (M.metrica || '').split('/').map(Number);
      const nominal = b && t ? b * 4 / t : 0;
      base += nominal && Math.abs(fin - nominal) < 1e-6 ? nominal : (fin || nominal);
    }
    for (const a of ataques) mapa.set(a, 1);
    for (const [alt, l] of tramos) {
      l.sort((x, y) => x[0] - y[0]);
      let [s0, e0] = l[0];
      for (const [s1, e1] of l.slice(1)) { if (s1 <= e0 + 1e-6) e0 = Math.max(e0, e1); else { mapa.set(`${P.id}|t|${alt}|${s0}-${e0}`, (mapa.get(`${P.id}|t|${alt}|${s0}-${e0}`) || 0) + 1); s0 = s1; e0 = e1 } }
      mapa.set(`${P.id}|t|${alt}|${s0}-${e0}`, (mapa.get(`${P.id}|t|${alt}|${s0}-${e0}`) || 0) + 1);
    }
  }
  // I-5. Lectura de las alturas: lo que un músico leería en el compás (LilyPond, estilo de alteraciones «default»: una
  // alteración rige hasta el final del compás, en su octava y en su pentagrama; al empezar el compás rige la armadura) frente a
  // la altura real. Las notas ligadas desde antes (tie stop) se leen por la ligadura y no cuentan. Devuelve los id de las
  // notas mal leídas, con el mismo formato que la huella.
  const VALOR_ALT = { sharp: 1, flat: -1, natural: 0, 'double-sharp': 2, 'sharp-sharp': 2, 'flat-flat': -2, 'natural-sharp': 1, 'natural-flat': -1, 'triple-sharp': 3, 'triple-flat': -3 };
  const ORDEN_SOST = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const deArmadura = (fifths, paso) => fifths > 0 ? (ORDEN_SOST.slice(0, fifths).includes(paso) ? 1 : 0) : fifths < 0 ? (ORDEN_SOST.slice(7 + fifths).includes(paso) ? -1 : 0) : 0;
  function lecturaIncorrecta(M) {
    const fifths = parseInt(M.armadura, 10) || 0, estado = new Map(), mal = [];
    const notas = M.eventos.filter(E => E.tipo === 'nota' && E.paso && Number.isInteger(E.alter)).map((E, i) => ({ E, i }));
    notas.sort((a, b) => a.E.t - b.E.t || a.i - b.i);
    for (const { E } of notas) {
      const k = `${E.pentagrama}|${E.paso}${E.octava}`, acc = E.alteracion.replace('()', '');
      if (E.ligaduras.some(l => l.endsWith(':stop'))) continue;
      const leida = acc in VALOR_ALT ? VALOR_ALT[acc] : (estado.has(k) ? estado.get(k) : deArmadura(fifths, E.paso));
      if (acc in VALOR_ALT) estado.set(k, VALOR_ALT[acc]);
      if (leida !== E.alter) mal.push(`${E.parte}|c${E.compas}|t${E.t}${E.gracia ? 'g' + E.gracia : ''}|${E.altura}`);
    }
    return mal;
  }

  // Diferencias entre dos huellas en las propiedades no permitidas. Cada diferencia lleva un texto legible
  // («nota perdida: P1|c3|t1.5|C#4», «nota duplicada…») y la propiedad afectada.
  function comparar(a, b, permitidas = []) {
    const libres = new Set(permitidas), dif = [];
    const QUE = { notas: ['nota perdida', 'nota añadida'], silencios: ['silencio perdido', 'silencio añadido'], duraciones: ['duración cambiada (antes)', 'duración cambiada (después)'] };
    for (const k of Object.keys(PROPIEDADES)) {
      if (libres.has(k)) continue;
      const A = a[k], B = b[k], claves = new Set([...A.keys(), ...B.keys()]);
      for (const c of claves) {
        const na = A.get(c) || 0, nb = B.get(c) || 0; if (na === nb) continue;
        if (k === 'lecturaAlturas') { if (nb > na) dif.push({ propiedad: k, clave: c, detalle: `nota que ahora se lee mal: ${c}` }); continue }
        const [menos, mas] = QUE[k] || [`${k}: falta`, `${k}: sobra`];
        if (k === 'notas' && na && nb) dif.push({ propiedad: k, clave: c, detalle: `nota ${nb > na ? 'duplicada' : 'perdida'}: ${c} (${na} → ${nb})` });
        else dif.push({ propiedad: k, clave: c, detalle: `${na > nb ? menos : mas}: ${c}${na && nb ? ` (${na} → ${nb})` : ''}` });
        if (dif.length > 200) return dif;
      }
    }
    return dif;
  }

  // Resumen legible de una partitura (para informes y pruebas)
  function resumen(x) {
    const mod = leer(x); let notas = 0, silencios = 0; const voces = new Set();
    for (const P of mod.partes) for (const M of P.compases) for (const E of M.eventos) { if (E.tipo === 'nota') { notas++; voces.add(`${P.id}|${E.pentagrama}|${E.voz}`) } else silencios++ }
    return { partes: mod.partes.length, compases: mod.partes[0] ? mod.partes[0].compases.length : 0, notas, silencios, voces: voces.size };
  }

  global.Musica = { PROPIEDADES, ErrorIntegridad, leer, huella, comparar, resumen, docDe, lecturaIncorrecta };
})(typeof window !== 'undefined' ? window : globalThis);
