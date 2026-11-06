// Auditoría de notación según criterios de grabado (Elaine Gould, «Behind Bars»): dibuja una muestra de fragmentos y
// mide, sobre el SVG que produce Verovio, los fallos más visibles de una edición:
//   · sinClave / sinCompas       pentagramas del primer compás sin clave; fragmento sin indicación de compás
//   · lineasAdic4 / lineasAdic6  cabezas con ≥ 4 / ≥ 6 líneas adicionales (clave o octava mal elegidas)
//   · barraEmpinada              barras con pendiente excesiva (> PEND_MAX grados)
//   · plicaCorta                 plicas de nota suelta de menos de 2 espacios
//   · plicaNoLlega               notas fuera del pentagrama cuya plica apunta a él sin llegar a la línea central
//   · lazoChoque                 ligaduras / ligaduras de unión que atraviesan una cabeza, plica o barra ajena
//   · plicaCruza                 plicas que atraviesan la cabeza de una nota de otra voz
//   · alteracionChoque           alteraciones que pisan otra alteración o una cabeza de nota
//   · notaNota                   cabezas de notas de voces distintas que se pisan sin ser unísono
//   · plicaVoz / pentVoces       pentagramas con 2+ voces cuyas plicas no siguen la convención (aguda arriba, grave abajo) / total de esos pentagramas
//   · unionChoque / expresionChoque  como lazoChoque, separando las ligaduras de unión (prolongación) de las de expresión
//   · barraSilencio              barras que pasan por encima de un silencio de su misma voz
// y los desglosa por tipo de partitura (original / reconstruida) y por conjunto de obras.
// uso (con la web servida en http://localhost:8767/ y verovio-toolkit-wasm.js accesible):
//   node herramientas/auditoria_gould.js [N=200] [salida.json] [semilla=12345] [orig|rec|todos] [filtro-compositor]
//   CASOS=1 node herramientas/auditoria_gould.js x casos.json   (solo los casos fijos de herramientas/notacion_casos.json)
// variables: POR_MOV (fragmentos por movimiento, repartidos por toda la obra), VEROVIO_JS, URL_WEB, CHROME (ejecutable de Chrome), PEND_MAX (grados, 10 por defecto), CASOS, CFG (JSON con
// Notacion.config) y OPC (JSON con Notacion.opciones), para probar valores sin tocar el código
const { chromium } = require('playwright'); const fs = require('fs');
const N = +(process.argv[2] || 200), SALIDA = process.argv[3] || 'auditoria_gould.json', SEMILLA = +(process.argv[4] || 12345),
  FILTRO = process.argv[5] || 'todos', COMP = process.argv[6] || '';
const VEROVIO = process.env.VEROVIO_JS || 'verovio-toolkit-wasm.js', URL = process.env.URL_WEB || 'http://localhost:8767/index.html', PEND_MAX = +(process.env.PEND_MAX || 10), POR_MOV = +(process.env.POR_MOV || 0);

// Se ejecuta dentro de la página, sobre el SVG ya dibujado de #partitura
function medir(PEND_MAX) {
  const svg = document.querySelector('#partitura svg'); if (!svg) return { sinPartitura: true };
  const caja = e => { const r = e.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, w: r.width, h: r.height } };
  const inter = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? { w, h } : null };
  const encoge = (c, k) => ({ x0: c.x0 + k, x1: c.x1 - k, y0: c.y0 + k, y1: c.y1 - k });
  const out = { lineasAdic4: 0, lineasAdic6: 0, barraEmpinada: 0, barras: 0, plicaCorta: 0, plicaNoLlega: 0, plicas: 0, lazoChoque: 0, lazos: 0, plicaCruza: 0, alteracionChoque: 0, notaNota: 0, notas: 0, medidas: 0, sinClave: 0, sinCompas: 0, maxPendiente: 0, peores: [],
    plicaVoz: 0, pentVoces: 0, barraSilencio: 0, unionChoque: 0, uniones: 0, expresionChoque: 0, expresiones: 0 };
  const medidas = [...svg.querySelectorAll('g.measure')]; out.medidas = medidas.length;
  // clave en cada pentagrama y compás al principio del fragmento
  if (medidas[0]) {
    const sts = [...medidas[0].querySelectorAll(':scope > g.staff')];
    out.sinClave = sts.filter(st => !st.querySelector('g.clef')).length;
    out.sinCompas = svg.querySelector('g.meterSig') ? 0 : 1;
  }
  for (const m of medidas) {
    // geometría de cada pentagrama del compás (una nota con cruce de pentagrama está en el SVG dentro de su pentagrama de
    // origen, pero se dibuja en otro: se asigna al pentagrama más cercano)
    const pent = [...m.querySelectorAll(':scope > g.staff')].map(st => {
      const L = [...st.querySelectorAll(':scope > path')].slice(0, 5).map(p => p.getBoundingClientRect());
      if (L.length < 5) return null; const u = (L[4].top - L[0].top) / 4; if (!(u > 1)) return null;
      return { st, top: L[0].top, u, centro: (L[0].top + L[4].top) / 2 };
    }).filter(Boolean);
    if (!pent.length) continue;
    const u = pent[0].u, k = u * 0.1, items = [];
    const porPent = pent.map(() => []);                       // por pentagrama: voces con la altura media y la dirección de sus plicas
    pent.forEach((P, ip) => [...P.st.querySelectorAll(':scope > g.layer')].forEach((ly, il) => {
      const capa = ip * 10 + il;
      const info = { il, ys: [], arriba: 0, abajo: 0 };
      for (const nt of ly.querySelectorAll('g.note')) {
        const cab = nt.querySelector('g.notehead'); if (!cab) continue;
        const c = caja(cab); if (c.w < 0.5) continue;
        const yc = (c.y0 + c.y1) / 2, Q = pent.reduce((a, b) => Math.abs(b.centro - yc) < Math.abs(a.centro - yc) ? b : a);
        { // dirección de la plica de la voz (en acorde, la de su plica común)
          info.ys.push(yc);
          const ac = nt.closest('g.chord'), se = (ac || nt).querySelector(':scope > g.stem');
          if (se && (!ac || nt === ac.querySelector('g.note'))) {                      // una vez por plica
            const cs = [...(ac ? ac.querySelectorAll('g.note g.notehead') : [cab])].map(h => { const b = caja(h); return (b.y0 + b.y1) / 2 });
            const ref = cs.reduce((s, v) => s + v, 0) / cs.length, sb = caja(se);
            if (sb.h > 0.5) ((sb.y0 + sb.y1) / 2 < ref ? info.arriba++ : info.abajo++);
          }
        }
        const pos = (yc - Q.top) / Q.u;                       // 0 = línea superior, 4 = inferior
        const n = pos < -0.01 ? Math.floor(-pos + 0.01) : pos > 4.01 ? Math.floor(pos - 4 + 0.01) : 0;
        if (n >= 4) out.lineasAdic4++; if (n >= 6) out.lineasAdic6++;
        items.push({ tipo: 'nota', il: capa, c }); out.notas++;
        // plica de la nota (las de acordes no se miden): muy corta, o dirigida al pentagrama sin llegar a la línea central
        const sp = nt.closest('g.chord') ? null : nt.querySelector(':scope > g.stem');
        if (sp && !nt.closest('g.beam')) {
          const sb = caja(sp); if (sb.h > 0.5) {
            const arriba = (sb.y0 + sb.y1) / 2 < yc; out.plicas++;
            if (sb.h < u * 2) out.plicaCorta++;
            const punta = ((arriba ? sb.y0 : sb.y1) - Q.top) / Q.u;
            if ((pos > 4.01 && arriba && punta > 2.3) || (pos < -0.01 && !arriba && punta < 1.7)) out.plicaNoLlega++;
          }
        }
      }
      for (const s of ly.querySelectorAll('g.stem')) { const c = caja(s); if (c.h > 0.5) items.push({ tipo: 'plica', il: capa, c }) }
      for (const a of ly.querySelectorAll('g.accid')) { const c = caja(a); if (c.w > 0.5) items.push({ tipo: 'alt', il: capa, c }) }
      for (const b of ly.querySelectorAll('g.beam')) {
        const pg = b.querySelector('polygon'); if (!pg) continue;       // la barra principal es el primer polígono
        const pts = pg.getAttribute('points').trim().split(/[\s,]+/).map(Number); if (pts.length < 8) continue;
        const v = []; for (let i = 0; i < pts.length; i += 2) v.push([pts[i], pts[i + 1]]);
        v.sort((a, b) => a[0] - b[0]); const dx = v[v.length - 1][0] - v[0][0]; if (dx < 1) continue;
        const l = (v[0][1] + v[1][1]) / 2, r = (v[v.length - 1][1] + v[v.length - 2][1]) / 2;
        const ang = Math.abs(Math.atan2(r - l, dx)) * 180 / Math.PI;
        out.barras++; if (ang > out.maxPendiente) out.maxPendiente = ang;
        if (ang > PEND_MAX) { out.barraEmpinada++; out.peores.push({ m: medidas.indexOf(m), ang: Math.round(ang * 10) / 10 }) }
        items.push({ tipo: 'barra', il: capa, c: caja(pg) });
        // silencio de la misma voz dentro del tramo de la barra (la barra pasa por encima de un silencio)
        const bc = caja(pg);
        for (const r of ly.querySelectorAll('g.rest')) { const rc = caja(r), cx = (rc.x0 + rc.x1) / 2; if (rc.w > 0.5 && cx > bc.x0 + k && cx < bc.x1 - k) { out.barraSilencio++; break } }
      }
      porPent[ip].push(info);
    }));
    // convención de plicas (Gould): con dos voces en un pentagrama, la aguda lleva la plica hacia arriba y la grave hacia abajo
    porPent.forEach(vs => {
      const v = vs.filter(x => x.ys.length && (x.arriba + x.abajo) > 0); if (v.length < 2) return;
      out.pentVoces++;
      v.sort((a, b) => a.ys.reduce((s, y) => s + y, 0) / a.ys.length - b.ys.reduce((s, y) => s + y, 0) / b.ys.length);   // y crece hacia abajo: la primera es la más aguda
      const aguda = v[0], grave = v[v.length - 1];
      if (aguda.abajo > aguda.arriba || grave.arriba > grave.abajo) out.plicaVoz++;
    });
    const notas = items.filter(x => x.tipo === 'nota'), plicas = items.filter(x => x.tipo === 'plica'), alts = items.filter(x => x.tipo === 'alt'), barras = items.filter(x => x.tipo === 'barra');
    // plica de una voz que atraviesa la cabeza de otra voz
    for (const p of plicas) for (const n of notas) {
      if (n.il === p.il) continue;
      if (notas.some(q => q.il === p.il && Math.abs(q.c.x0 - n.c.x0) < k * 3 && Math.abs(q.c.y0 - n.c.y0) < k * 3)) continue;   // unísono: dos voces con la misma cabeza y plicas opuestas es la escritura correcta
      const pc = { x0: p.c.x0 - k, x1: p.c.x1 + k, y0: p.c.y0 + u * 0.4, y1: p.c.y1 - u * 0.4 };
      if (inter(pc, encoge(n.c, u * 0.15))) out.plicaCruza++;
    }
    // cabezas de voces distintas que se pisan (sin ser unísono)
    for (let i = 0; i < notas.length; i++) for (let j = i + 1; j < notas.length; j++) {
      const A = notas[i], B = notas[j]; if (A.il === B.il) continue;
      const I = inter(encoge(A.c, k), encoge(B.c, k)); if (!I) continue;
      if (Math.abs(A.c.x0 - B.c.x0) < k && Math.abs(A.c.y0 - B.c.y0) < k) continue;
      if (I.w * I.h > 0.3 * Math.min(A.c.w * A.c.h, B.c.w * B.c.h)) out.notaNota++;
    }
    // alteraciones que pisan otra alteración o una cabeza
    for (let i = 0; i < alts.length; i++) {
      const a = encoge(alts[i].c, k * 0.5);
      if (alts.some((b, j) => j > i && inter(a, encoge(b.c, k * 0.5))) || notas.some(n => inter(a, encoge(n.c, k)))) out.alteracionChoque++;
    }
    // ligaduras y ligaduras de unión: muestreo del trazo frente a cabezas, plicas y barras (se omiten los extremos)
    for (const lz of m.querySelectorAll('g.slur path, g.tie path')) {
      let L; try { L = lz.getTotalLength() } catch (e) { continue } if (!(L > 2 * u)) continue;
      const ctm = lz.getScreenCTM(); if (!ctm) continue;
      const union = !!lz.closest('g.tie');
      out.lazos++; union ? out.uniones++ : out.expresiones++; let choca = false;
      for (let d = L * 0.12; d <= L * 0.88 && !choca; d += u * 0.35) {
        const q = lz.getPointAtLength(d), px = ctm.a * q.x + ctm.c * q.y + ctm.e, py = ctm.b * q.x + ctm.d * q.y + ctm.f;
        for (const o of items) {
          if (o.tipo === 'alt') continue;
          const c = o.tipo === 'nota' ? encoge(o.c, u * 0.18) : o.tipo === 'plica' ? { x0: o.c.x0 - k * .3, x1: o.c.x1 + k * .3, y0: o.c.y0 + u * .2, y1: o.c.y1 - u * .2 } : encoge(o.c, k);
          if (px > c.x0 && px < c.x1 && py > c.y0 && py < c.y1) { choca = true; break }
        }
      }
      if (choca) { out.lazoChoque++; union ? out.unionChoque++ : out.expresionChoque++ }
    }
  }
  return out;
}

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.route(/googleapis|gstatic/, r => r.abort());
  await p.route(/jsdelivr/, r => r.fulfill({ body: fs.readFileSync(VEROVIO), contentType: 'application/javascript' }));
  await p.goto(URL); await p.waitForFunction(() => window.__prueba, null, { timeout: 60000 });
  // OPC='{"beamMaxSlope":5}' sustituye opciones de Verovio para probar valores sin tocar el código
  if (process.env.CFG) await p.evaluate(o => Object.assign(Notacion.config, o), JSON.parse(process.env.CFG));   // CFG='{"compasAlInicio":false}'
  if (process.env.OPC) await p.evaluate(o => Object.assign(Notacion.opciones, o), JSON.parse(process.env.OPC));
  // CASOS=1: en lugar de una muestra al azar, los fragmentos fijos de herramientas/notacion_casos.json (regresión)
  const casos = process.env.CASOS ? JSON.parse(fs.readFileSync(process.env.CASOS === '1' ? __dirname + '/notacion_casos.json' : process.env.CASOS, 'utf8')) : null;   // CASOS=ruta.json: otra lista de fragmentos
  const muestra = casos ? await p.evaluate(cs => cs.map(c => { const o = __prueba.porId.get(c.obra); return { obra: c.obra, ini: c.ini, fin: c.fin, f: o.f, rec: !!o.reconstruida, t: o.c + ' · ' + o.t } }), casos) : await p.evaluate(async ([N, S, F, C, POR_MOV]) => {
    let s = S; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    let movs = [...new Map(__prueba.OBRAS.filter(o => o.pq).map(o => [o.id, o])).values()];
    if (F === 'orig') movs = movs.filter(o => !o.reconstruida); if (F === 'rec') movs = movs.filter(o => o.reconstruida);
    if (C) movs = movs.filter(o => C.toLowerCase().split('&&').every(x => (o.c + ' ' + o.t).toLowerCase().includes(x.trim())));   // «beethoven && sonata»: todos los términos
    if (POR_MOV > 0) movs = [...new Map(movs.map(o => [o.m, o])).values()];      // un análisis por movimiento (varios análisis comparten partitura)
    for (let i = movs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [movs[i], movs[j]] = [movs[j], movs[i]] }
    const out = [];
    for (const o of movs.slice(0, N)) {
      const ac = await __prueba.acordesDe(o.id); if (!ac.length) continue;
      const cs = [...new Set(ac.map(a => a.compas))].sort((a, b) => a - b);
      // POR_MOV=k: k fragmentos repartidos a intervalos regulares por todo el movimiento (en vez de uno al azar)
      const K = POR_MOV > 0 ? Math.min(POR_MOV, Math.max(1, Math.floor(cs.length / 4))) : 1;
      for (let q = 0; q < K; q++) {
        const i0 = POR_MOV > 0 ? cs[Math.floor(q * Math.max(1, cs.length - 3) / K)] : cs[Math.floor(rnd() * Math.max(1, cs.length - 3))];
        out.push({ obra: o.id, ini: i0, fin: i0 + 3, f: o.f, rec: !!o.reconstruida, t: o.c + ' · ' + o.t });
      }
    }
    return out;
  }, [N, SEMILLA, FILTRO, COMP, POR_MOV]);
  const res = []; let k = 0;
  for (const m of muestra) {
    k++;
    const h = { obra: m.obra, ini: m.ini, fin: m.fin, frag: true, tono: '', etq: '', compas: m.ini, parte: 1 };
    try {
      await p.evaluate(h => { __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, h);
      await p.waitForFunction(() => { const c = document.querySelector('#partitura'); return c && (c.querySelector('svg g.cifrados') || /No se pudo|No encuentro|no partitura|repeticiones desplegadas/.test(c.textContent)) }, null, { timeout: 60000 });
      await p.waitForTimeout(150);
    } catch (e) { res.push({ ...m, fallo: 'tiempo agotado' }); continue }
    const r = await p.evaluate(medir, PEND_MAX);
    res.push({ ...m, ...r });
    if (k % 25 === 0) { console.log(k, '/', muestra.length); fs.writeFileSync(SALIDA, JSON.stringify({ res, errores }, null, 1)) }
  }
  fs.writeFileSync(SALIDA, JSON.stringify({ res, errores }, null, 1));
  const ok = res.filter(r => !r.fallo && !r.sinPartitura);
  const CLAVES = ['sinClave', 'sinCompas', 'lineasAdic4', 'lineasAdic6', 'barraEmpinada', 'plicaCorta', 'plicaNoLlega', 'lazoChoque', 'unionChoque', 'expresionChoque', 'plicaCruza', 'alteracionChoque', 'notaNota', 'plicaVoz', 'pentVoces', 'barraSilencio'];
  const resumen = f => { const g = ok.filter(f), o = { fragmentos: g.length, notas: g.reduce((s, r) => s + r.notas, 0), barras: g.reduce((s, r) => s + r.barras, 0), lazos: g.reduce((s, r) => s + r.lazos, 0), uniones: g.reduce((s, r) => s + r.uniones, 0) };
    for (const c of CLAVES) { o[c] = g.reduce((s, r) => s + r[c], 0); o['frag_' + c] = g.filter(r => r[c] > 0).length } return o };
  console.log('errores de página', errores.length, '· fallos', res.filter(r => r.fallo).length, '· sin partitura', res.filter(r => r.sinPartitura).length);
  console.log('ORIGINALES   ', JSON.stringify(resumen(r => !r.rec)));
  console.log('RECONSTRUIDAS', JSON.stringify(resumen(r => r.rec)));
  await b.close();
})();
