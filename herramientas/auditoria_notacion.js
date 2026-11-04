// Auditoría de notación: dibuja una muestra de fragmentos y mide, dentro de cada pentagrama con varias voces,
//   · silencios que pisan una nota de otra voz (silNota)
//   · silencios de voces distintas que se pisan (silSil)
//   · cabezas de nota de voces distintas que se pisan sin ser unísono (notaNota)
//   · silencios que pisan una plica, una barra, un corchete o una alteración de otra voz (silPlica)
// y los efectos secundarios de despejarSilencios() (silencios movidos, cuánto, si invaden cifrados o números de compás
// o se salen del dibujo). Termina con código 1 si queda algún silencio pisando una nota, un silencio, una plica, una barra, un corchete o una alteración.
// uso (con la web servida en http://localhost:8767/ y verovio-toolkit-wasm.js en el directorio actual):
//   node herramientas/auditoria_notacion.js [N=300] [salida.json] [semilla=12345] [orig|rec|todos]
// variables: VEROVIO_JS (ruta de verovio-toolkit-wasm.js), URL_WEB, CHROME (ejecutable de Chrome si Playwright no tiene el suyo)
const { chromium } = require('playwright'); const fs = require('fs');
const N = +(process.argv[2] || 300), SALIDA = process.argv[3] || 'auditoria_notacion.json', SEMILLA = +(process.argv[4] || 12345), FILTRO = process.argv[5] || 'todos';
const VEROVIO = process.env.VEROVIO_JS || 'verovio-toolkit-wasm.js', URL = process.env.URL_WEB || 'http://localhost:8767/index.html';
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.route(/googleapis|gstatic/, r => r.abort());
  await p.route(/jsdelivr/, r => r.fulfill({ body: fs.readFileSync(VEROVIO), contentType: 'application/javascript' }));
  await p.goto(URL); await p.waitForFunction(() => window.__prueba, null, { timeout: 60000 });
  // muestra: movimientos con partitura, repartidos (semilla fija), una ventana de 4 compases al azar
  const muestra = await p.evaluate(async ([N, S, F]) => {
    let s = S; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    let movs = [...new Map(__prueba.OBRAS.filter(o => o.pq).map(o => [o.id, o])).values()];
    if (F === 'orig') movs = movs.filter(o => !o.reconstruida); if (F === 'rec') movs = movs.filter(o => o.reconstruida);
    for (let i = movs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [movs[i], movs[j]] = [movs[j], movs[i]] }
    const out = [];
    for (const o of movs.slice(0, N)) {
      const ac = await __prueba.acordesDe(o.id); if (!ac.length) continue;
      const cs = [...new Set(ac.map(a => a.compas))].sort((a, b) => a - b);
      const i0 = cs[Math.floor(rnd() * Math.max(1, cs.length - 3))];
      out.push({ obra: o.id, ini: i0, fin: i0 + 3, f: o.f, rec: !!o.reconstruida, t: o.c + ' · ' + o.t });
    }
    return out;
  }, [N, SEMILLA, FILTRO]);
  const res = []; let k = 0;
  for (const m of muestra) {
    k++;
    const h = { obra: m.obra, ini: m.ini, fin: m.fin, frag: true, tono: '', etq: '', compas: m.ini, parte: 1 };
    try {
      await p.evaluate(h => { __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, h);
      await p.waitForFunction(() => { const c = document.querySelector('#partitura'); return c && (c.querySelector('svg g.cifrados') || /No se pudo|No encuentro|no partitura|repeticiones desplegadas/.test(c.textContent)) }, null, { timeout: 60000 });
      await p.waitForTimeout(150);
    } catch (e) { res.push({ ...m, fallo: 'tiempo agotado' }); continue }
    const r = await p.evaluate(() => {
      const svg = document.querySelector('#partitura svg'); if (!svg) return { sinPartitura: true };
      const caja = e => { const r = e.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, w: r.width, h: r.height } };
      const visible = e => { const c = caja(e); if (c.w < 0.5 || c.h < 0.5) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && e.closest('[visibility="hidden"],[display="none"]') == null };
      const inter = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? { w, h } : null };
      const out = { silNota: [], silSil: [], silPlica: [], notaNota: [], silencios: 0, notas: 0 };
      const medidas = [...svg.querySelectorAll('g.measure')];
      medidas.forEach((m, im) => {
        for (const st of m.querySelectorAll(':scope > g.staff')) {
          const capas = [...st.querySelectorAll(':scope > g.layer')];
          const items = [];
          capas.forEach((ly, il) => {
            for (const r of ly.querySelectorAll('g.rest, g.mRest')) if (visible(r)) items.push({ tipo: 'rest', il, e: r, c: caja(r) });
            for (const nh of ly.querySelectorAll('g.note g.notehead')) if (visible(nh)) items.push({ tipo: 'nota', il, e: nh, c: caja(nh) });
            for (const tz of ly.querySelectorAll('g.stem, g.beam, g.flag, g.accid')) { const c = caja(tz); if (c.h >= 0.5) items.push({ tipo: 'trazo', il, e: tz, c }) }
          });
          out.silencios += items.filter(x => x.tipo === 'rest').length; out.notas += items.filter(x => x.tipo === 'nota').length;
          const u = (items.find(x => x.tipo === 'nota') || { c: { h: 10 } }).c.h;      // ≈ un espacio del pentagrama
          const tol = u * 0.12;
          for (const x of items) if (x.tipo === 'trazo') x.c = { ...x.c, x0: x.c.x0 - tol * 1.5, x1: x.c.x1 + tol * 1.5, w: x.c.w + tol * 3 };   // las plicas no tienen anchura propia
          for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
            const A = items[i], B = items[j]; if (A.il === B.il) continue;
            const a = { x0: A.c.x0 + tol, x1: A.c.x1 - tol, y0: A.c.y0 + tol, y1: A.c.y1 - tol }, bb = { x0: B.c.x0 + tol, x1: B.c.x1 - tol, y0: B.c.y0 + tol, y1: B.c.y1 - tol };
            const I = inter(a, bb); if (!I) continue;
            if (A.tipo === 'trazo' || B.tipo === 'trazo') { if (A.tipo === 'rest' || B.tipo === 'rest') out.silPlica.push({ m: im }); continue }
            if (A.tipo === 'nota' && B.tipo === 'nota') {
              // unísono (misma posición) → Verovio los une o los separa a propósito; se cuentan solo los solapes parciales
              const mismoX = Math.abs(A.c.x0 - B.c.x0) < tol, mismoY = Math.abs(A.c.y0 - B.c.y0) < tol;
              if (mismoX && mismoY) continue;
              if (I.w * I.h > 0.3 * Math.min(A.c.w * A.c.h, B.c.w * B.c.h)) out.notaNota.push({ m: im });
            } else (A.tipo === 'rest' && B.tipo === 'rest' ? out.silSil : out.silNota).push({ m: im });
          }
        }
      });
      // efectos secundarios de mover silencios: cuántos, cuánto, y si invaden cifrados o números de compás o se salen del dibujo
      const movidos = [...svg.querySelectorAll('g.rest > g[transform], g.mRest > g[transform]')];
      const sv = svg.getBoundingClientRect(), cif = svg.querySelector('g.cifrados'), cajasCif = cif ? [...cif.querySelectorAll('text,g')].map(caja).filter(c => c.w > 1 && c.h > 1) : [];
      const nums = [...svg.querySelectorAll('g.mNum')].map(caja).filter(c => c.w > 1);
      out.movidos = movidos.length; out.maxPasos = 0; out.sobreCifrados = 0; out.sobreNumeros = 0; out.fuera = 0;
      for (const g of movidos) {
        const c = caja(g.parentNode), dy = +((g.getAttribute('transform').match(/translate\(\s*[-\d.]+[ ,]+(-?[\d.]+)/) || [])[1] || 0);
        out.maxPasos = Math.max(out.maxPasos, Math.abs(Math.round(dy / 90)));   // media línea = 90 unidades de Verovio
        if (cajasCif.some(b => inter(c, b))) out.sobreCifrados++;
        if (nums.some(b => inter(c, b))) out.sobreNumeros++;
        if (c.y0 < sv.top - 1 || c.y1 > sv.bottom + 1) out.fuera++;
      }
      out.medidas = medidas.length; return out;
    });
    res.push({ ...m, ...r });
    if (k % 25 === 0) { console.log(k, '/', muestra.length); fs.writeFileSync(SALIDA, JSON.stringify({ res, errores }, null, 1)) }
  }
  fs.writeFileSync(SALIDA, JSON.stringify({ res, errores }, null, 1));
  const ok = res.filter(r => !r.fallo && !r.sinPartitura);
  const resumen = f => { const g = ok.filter(f); return { fragmentos: g.length, conSilNota: g.filter(r => r.silNota.length).length, conSilSil: g.filter(r => r.silSil.length).length, conSilPlica: g.filter(r => r.silPlica.length).length, conNotaNota: g.filter(r => r.notaNota.length).length,
    totalSilNota: g.reduce((s, r) => s + r.silNota.length, 0), totalSilSil: g.reduce((s, r) => s + r.silSil.length, 0), totalSilPlica: g.reduce((s, r) => s + r.silPlica.length, 0), totalNotaNota: g.reduce((s, r) => s + r.notaNota.length, 0) } };
  console.log('errores de página', errores.length, '· fallos', res.filter(r => r.fallo).length, '· sin partitura', res.filter(r => r.sinPartitura).length);
  console.log('ORIGINALES  ', JSON.stringify(resumen(r => !r.rec)));
  console.log('RECONSTRUIDAS', JSON.stringify(resumen(r => r.rec)));
  console.log('EFECTOS     ', JSON.stringify({ fragmentosConMovidos: ok.filter(r => r.movidos > 0).length, silenciosMovidos: ok.reduce((s, r) => s + (r.movidos || 0), 0), maxPasos: Math.max(0, ...ok.map(r => r.maxPasos || 0)),
    sobreCifrados: ok.reduce((s, r) => s + (r.sobreCifrados || 0), 0), sobreNumeros: ok.reduce((s, r) => s + (r.sobreNumeros || 0), 0), fuera: ok.reduce((s, r) => s + (r.fuera || 0), 0) }));
  if (ok.some(r => r.silNota.length || r.silSil.length || r.silPlica.length)) process.exitCode = 1;
  await b.close();
})();
