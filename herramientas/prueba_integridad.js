// Integridad musical sobre el corpus (nivel 2 de docs/ESPECIFICACION_GRABADO_MUSICAL.md, «Pruebas»).
// Para cada partitura del corpus (todas las fuentes: reconstrucciones del DCML, ediciones convertidas desde Humdrum y
// ediciones MusicXML), prepara el MusicXML con Notacion.preparar en modo ESTRICTO y compara el original con el resultado:
//   · ningún paso puede alterar una propiedad que no declara (si lo hace, preparar lanza HF-INTEGRIDAD)
//   · comparación global: notas, alturas, octavas, alteraciones sonoras, duraciones, posiciones métricas, pentagramas,
//     ligaduras de prolongación y de expresión, compases, compás, armadura, octavas e instrumentos deben coincidir; voces y
//     acordes también, salvo en las reconstrucciones (N-VOC-3, transformación estructural declarada)
//   · número de notas y de voces antes y después (resumen)
// uso (con la web servida en http://localhost:8767/):
//   node herramientas/prueba_integridad.js [límite] [filtro de compositor]     variables: VEROVIO_JS, URL_WEB, CHROME, CFG
const { chromium } = require('playwright'); const fs = require('fs');
const LIMITE = +(process.argv[2] || 0), FILTRO = process.argv[3] || '';
const VEROVIO = process.env.VEROVIO_JS || 'verovio-toolkit-wasm.js', URL = process.env.URL_WEB || 'http://localhost:8767/index.html';
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const p = await b.newPage(); const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.route(/googleapis|gstatic/, r => r.abort());
  await p.route(/jsdelivr/, r => fs.existsSync(VEROVIO) ? r.fulfill({ body: fs.readFileSync(VEROVIO), contentType: 'application/javascript' }) : r.abort());
  await p.goto(URL); await p.waitForFunction(() => window.__prueba, null, { timeout: 60000 });
  if (process.env.CFG) await p.evaluate(c => Object.assign(Notacion.config, JSON.parse(c)), process.env.CFG);
  const res = await p.evaluate(async ([LIM, FILTRO]) => {
    Notacion.config.integridad = 'estricto';
    // propiedades que la canalización puede cambiar a propósito, por fuente (unión de lo que declaran sus transformaciones)
    const libres = f => [...new Set(Notacion.transformaciones.filter(t => t.fuentes.includes(f)).flatMap(t => t.modifica))];
    const vistos = new Set(), out = { porFuente: {}, fallos: [] };
    const obras = __prueba.OBRAS.filter(o => o.pq && (!FILTRO || (o.c + ' ' + o.t).toLowerCase().includes(FILTRO.toLowerCase())) && !vistos.has(o.m) && vistos.add(o.m));
    for (const o of obras.slice(0, LIM || 1e9)) {
      const f = Notacion.fuenteDe(o), F = out.porFuente[f] = out.porFuente[f] || { partituras: 0, notas: 0, correctas: 0, fusionadas: 0 };
      F.partituras++;
      try {
        const x0 = await __prueba.textoDe(o), anacrusa = (await __prueba.acordesDe(o.id)).some(c => c.compas === 0);
        const x = Notacion.preparar(x0, { fuente: f, inst: o.src.inst || [], anacrusa });
        const r0 = Musica.resumen(x0), r1 = Musica.resumen(x); F.notas += r0.notas;
        const dif = Musica.comparar(Musica.huella(x0), Musica.huella(x), libres(f));
        if (dif.length || r0.notas !== r1.notas) out.fallos.push({ id: o.id, f, t: o.c + ' · ' + o.t, dif: dif.slice(0, 5).map(d => d.detalle), notas: [r0.notas, r1.notas] });
        else { F.correctas++; if (r1.voces < r0.voces) F.fusionadas++ }
      } catch (e) { out.fallos.push({ id: o.id, f, t: o.c + ' · ' + o.t, error: String(e.message || e).slice(0, 300) }) }
    }
    return out;
  }, [LIMITE, FILTRO]);
  for (const [f, F] of Object.entries(res.porFuente)) console.log(`${f.padEnd(13)} ${F.correctas}/${F.partituras} partituras íntegras · ${F.notas} notas comprobadas` + (F.fusionadas ? ` · ${F.fusionadas} con voces de ritmo idéntico unidas en acordes (N-VOC-3)` : ''));
  for (const x of res.fallos.slice(0, 20)) console.log('FALLA', x.id, x.f, x.t, x.error || JSON.stringify(x.dif), x.notas || '');
  if (errores.length) console.log('errores de página:', errores.slice(0, 5));
  await b.close();
  const n = res.fallos.length + errores.length;
  console.log(n ? `${res.fallos.length} partitura(s) con fallos de integridad` : 'integridad correcta en todo el corpus probado'); process.exitCode = n ? 1 : 0;
})();
