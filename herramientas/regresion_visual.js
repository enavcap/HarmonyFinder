// Regresión visual de la notación (nivel 3 de docs/ESPECIFICACION_GRABADO_MUSICAL.md, «Pruebas»).
// Dibuja con la propia web cada fragmento de herramientas/regresion_visual/casos.json (monodia, polifonía, corales,
// pasajes densos, alteraciones, claves y compases distintos, y las tres fuentes: reconstrucciones del DCML, ediciones
// convertidas desde Humdrum y ediciones MusicXML), lo captura en PNG y lo compara píxel a píxel con la imagen de
// referencia de herramientas/regresion_visual/ref/. Además cuenta, sobre el SVG, los retoques del motor (silencios
// apartados u ocultos, ligaduras retocadas) para que un cambio de imagen se pueda atribuir a una regla.
// Genera un informe HTML con referencia, imagen nueva y diferencias (en rojo) para revisarlo a ojo: que el SVG se genere no
// basta, la notación hay que mirarla.
// uso (con la web servida en http://localhost:8767/):
//   node herramientas/regresion_visual.js                comparar con las referencias (falla si alguna difiere más del umbral)
//   node herramientas/regresion_visual.js --referencia   regenerar las referencias (solo tras revisar el informe)
// variables: URL_WEB, VEROVIO_JS, CHROME, REF_DIR (otra carpeta de referencias), SALIDA (carpeta del informe; por defecto regresion_visual_informe/), UMBRAL
// (fracción de píxeles distintos tolerada, 0.002 por defecto), CASOS (lista de id separados por comas), CFG (Notacion.config)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const DIR = path.join(__dirname, 'regresion_visual'), REF = process.env.REF_DIR || path.join(DIR, 'ref');
const REFERENCIA = process.argv.includes('--referencia');
const URL = process.env.URL_WEB || 'http://localhost:8767/index.html', VEROVIO = process.env.VEROVIO_JS || 'verovio-toolkit-wasm.js';
const SALIDA = process.env.SALIDA || 'regresion_visual_informe', UMBRAL = +(process.env.UMBRAL || 0.002);
const casos = JSON.parse(fs.readFileSync(path.join(DIR, 'casos.json'), 'utf8')).filter(c => !process.env.CASOS || process.env.CASOS.split(',').includes(c.id));

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const p = await b.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 });
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('tema', 'light') } catch (e) { } });
  await p.route(/googleapis|gstatic/, r => r.abort());
  await p.route(/jsdelivr/, r => r.fulfill({ body: fs.readFileSync(VEROVIO), contentType: 'application/javascript' }));
  await p.goto(URL); await p.waitForFunction(() => window.__prueba, null, { timeout: 60000 });
  if (process.env.CFG) await p.evaluate(c => Object.assign(Notacion.config, JSON.parse(c)), process.env.CFG);
  fs.mkdirSync(REFERENCIA ? REF : SALIDA, { recursive: true });
  const filas = []; let fallos = 0;
  for (const c of casos) {
    const h = { obra: c.obra, ini: c.ini, fin: c.fin, frag: true, tono: '', etq: '', compas: c.ini, parte: 1 };
    await p.evaluate(h => { document.querySelector('#partitura').innerHTML = ''; __prueba.fijarSeleccion(h); __prueba.mostrar(h) }, h);
    try {
      await p.waitForFunction(() => { const x = document.querySelector('#partitura'); return x && (x.querySelector('svg g.cifrados') || /No se pudo|No encuentro|no partitura|repeticiones desplegadas/.test(x.textContent)) }, null, { timeout: 60000 });
    } catch (e) { filas.push({ c, error: 'tiempo agotado' }); fallos++; continue }
    await p.waitForTimeout(300);
    const svg = await p.$('#partitura svg');
    if (!svg) { filas.push({ c, error: (await p.textContent('#partitura')).trim().slice(0, 120) }); fallos++; continue }
    const info = await p.evaluate(() => {
      const s = document.querySelector('#partitura svg');
      return { compases: s.querySelectorAll('g.measure').length, notas: s.querySelectorAll('g.note').length, silApartados: s.querySelectorAll('g.rest[data-n-sil2]').length, silOcultos: s.querySelectorAll('g.rest[display=none]').length, ligRetocadas: s.querySelectorAll('g.tie[data-n-lig2]').length, plicas: s.querySelectorAll('g.stem').length, barras: s.querySelectorAll('g.beam').length };
    });
    const png = await svg.screenshot();
    if (REFERENCIA) { fs.writeFileSync(path.join(REF, c.id + '.png'), png); filas.push({ c, info, ref: true }); console.log('referencia', c.id, JSON.stringify(info)); continue }
    fs.writeFileSync(path.join(SALIDA, c.id + '.nueva.png'), png);
    const rutaRef = path.join(REF, c.id + '.png');
    if (!fs.existsSync(rutaRef)) { filas.push({ c, info, sinRef: true }); console.log('SIN REFERENCIA', c.id); fallos++; continue }
    fs.copyFileSync(rutaRef, path.join(SALIDA, c.id + '.ref.png'));
    // comparación en el navegador (sin dependencias): fracción de píxeles distintos y una imagen con las diferencias en rojo
    const cmp = await p.evaluate(async ([a, n]) => {
      const img = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = 'data:image/png;base64,' + src });
      const [A, N] = await Promise.all([img(a), img(n)]);
      const w = Math.max(A.width, N.width), h = Math.max(A.height, N.height);
      const lienzo = (i) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(i, 0, 0); return x.getImageData(0, 0, w, h) };
      const da = lienzo(A), dn = lienzo(N), out = document.createElement('canvas'); out.width = w; out.height = h; const ox = out.getContext('2d'), od = ox.createImageData(w, h);
      let distintos = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const d = Math.max(Math.abs(da.data[i] - dn.data[i]), Math.abs(da.data[i + 1] - dn.data[i + 1]), Math.abs(da.data[i + 2] - dn.data[i + 2]));
        const gris = 255 - (255 - dn.data[i]) * 0.25;
        if (d > 48) { distintos++; od.data[i] = 230; od.data[i + 1] = 30; od.data[i + 2] = 30 } else { od.data[i] = od.data[i + 1] = od.data[i + 2] = gris }
        od.data[i + 3] = 255;
      }
      ox.putImageData(od, 0, 0);
      return { fraccion: distintos / (w * h), mismoTamano: A.width === N.width && A.height === N.height, tam: [A.width, A.height, N.width, N.height], diff: out.toDataURL('image/png').split(',')[1] };
    }, [fs.readFileSync(rutaRef).toString('base64'), png.toString('base64')]);
    fs.writeFileSync(path.join(SALIDA, c.id + '.diff.png'), Buffer.from(cmp.diff, 'base64'));
    const igual = cmp.fraccion <= UMBRAL && cmp.mismoTamano;
    if (!igual) fallos++;
    filas.push({ c, info, fraccion: cmp.fraccion, tam: cmp.tam, igual });
    console.log((igual ? 'igual  ' : 'DISTINTA'), c.id.padEnd(22), (cmp.fraccion * 100).toFixed(2) + ' %', cmp.mismoTamano ? '' : 'tamaño ' + cmp.tam.join('×'), JSON.stringify(info));
  }
  if (!REFERENCIA) {
    const html = `<!doctype html><meta charset="utf-8"><title>Regresión visual</title><style>body{font:14px system-ui;margin:16px}h2{font-size:15px;margin:24px 0 4px}img{max-width:100%;border:1px solid #ccc;display:block;margin:4px 0}.k{color:#666}.mal{color:#b00}</style>
<h1>Regresión visual de la notación</h1><p class="k">${new Date().toISOString()} · umbral ${UMBRAL * 100} % · ${filas.filter(f => f.igual).length} de ${filas.length} iguales</p>` +
      filas.map(f => `<h2 class="${f.igual ? '' : 'mal'}">${f.c.id} — ${f.c.tipo} (obra ${f.c.obra}, cc. ${f.c.ini}-${f.c.fin})</h2>` +
        (f.error ? `<p class="mal">${f.error}</p>` : `<p class="k">${f.fraccion !== undefined ? (f.fraccion * 100).toFixed(2) + ' % de píxeles distintos · ' : ''}${JSON.stringify(f.info)}</p>` +
          (f.sinRef ? '' : `<div>referencia</div><img src="${f.c.id}.ref.png"><div>nueva</div><img src="${f.c.id}.nueva.png"><div>diferencias</div><img src="${f.c.id}.diff.png">`))).join('');
    fs.writeFileSync(path.join(SALIDA, 'index.html'), html);
    console.log('informe:', path.join(SALIDA, 'index.html'));
  }
  if (errores.length) console.log('errores de página:', errores.slice(0, 5));
  await b.close();
  if (!REFERENCIA) { console.log(fallos ? `${fallos} caso(s) distintos de la referencia` : 'todas las imágenes coinciden con la referencia'); process.exitCode = fallos ? 1 : 0 }
})();
