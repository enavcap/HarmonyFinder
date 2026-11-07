// Ajustes sobre el SVG que dibuja Verovio (capa 7 del motor de notación, ver web/notacion.js).
//
// Solo se retoca el dibujo cuando ni el MusicXML ni las opciones de Verovio pueden resolver el problema. Cada ajuste tiene
// una regla de la especificación (docs/ESPECIFICACION_GRABADO_MUSICAL.md), un interruptor en Notacion.config cuando cambia
// el grabado, y una prueba en herramientas/prueba_motor.js o herramientas/prueba_notacion.js. Ninguno cambia el contenido
// musical: solo mueven, acortan u ocultan elementos ya dibujados, y dejan una marca data-n-… para poder auditarlos.
//
//   despejarLigaduras  N-LIG-2  ligaduras de unión que atraviesan plicas, corchetes, barras o cabezas
//   despejarSilencios  N-SIL-2  silencios que pisan notas o silencios de otra voz
//   despejarNumeros    N-NUM-2  números de compás que chocan con la música (y amplía el lienzo por arriba)
//   limpiarNumeros     N-NUM-2  números internos de la reconstrucción («8X1») y paréntesis de casillas que empiezan en el fragmento
//   aplicar            los tres retoques de grabado, en el orden correcto (silencios → ligaduras → números)
(function (global) {
  'use strict';
  const Notacion = global.Notacion;

  // N-LIG-2 (Gould: una ligadura de unión no atraviesa plicas, corchetes ni cabezas; empieza y acaba junto a su nota)
  // Retoque sobre el SVG ya dibujado. Verovio dibuja cada ligadura de unión como una forma cerrada de dos curvas cúbicas
  // («M x,y C … C …»: la curva exterior de ida y la interior de vuelta) y no la aparta de las plicas y corchetes de las voces
  // vecinas ni de los de sus propias notas cuando las notas están muy juntas. Si el interior de la ligadura cruza algo, se
  // prueba, por este orden, (1) acortarla por los extremos hasta librar el obstáculo, (2) hacer el arco más profundo y (3) las
  // dos cosas; se conserva la primera variante que no deja ningún choque y, si ninguna lo logra, la ligadura no se toca.
  const bezier = (t, a, b, c, d) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]] };
  function despejarLigaduras(svg) {
    if (!Notacion.config.ligadurasDespejadas || !svg) return 0;
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

  // N-SIL-1/N-SIL-2. Silencios que pisan notas: en un pentagrama con varias voces, Verovio no siempre mira lo que hacen las
  // otras voces en ese instante, y las reconstrucciones fijan el silencio de la voz aguda en una altura fija.
  //  · Si un silencio pisa una cabeza, plica, barra, corchete o alteración de otra voz, se APARTA verticalmente, alejándose de
  //    la otra voz (hacia arriba en la voz aguda, hacia abajo en las demás) en pasos de media línea hasta 3 espacios, dejando
//    al menos 0,35 espacios libres por arriba y por abajo (separación silencio-acorde del código de MuseScore, v0.8.6)
  //    (MuseScore, «Working with multiple voices»: con varias voces los silencios de la voz 1 suben y los de la voz 2 bajan,
  //    «usually displaced further out to avoid colliding»; LilyPond, NR 1.5.2 «Collision resolution»: «Rests opposite a stem
  //    in a different voice are shifted vertically»). Solo si no hay sitio se oculta (decisión propia: en un ejemplo
  //    armónico la otra voz suena en ese instante y el silencio no aporta). Con CONFIG.silenciosApartados = false se oculta
  //    directamente (comportamiento anterior a la v0.9).
  //  · Si pisa el silencio de otra voz, se desplaza en múltiplos de media línea, alejándose de lo que pisa, hasta quedar libre.
  // Devuelve cuántos ocultó o movió. El desplazamiento va en un <g> interno del silencio, no en él mismo: getBBox() ignora el
  // transform propio del elemento y despejarNumeros() necesita la caja ya movida.
  function despejarSilencios(svg){
    const pm=svg&&svg.querySelector('g.page-margin'); if(!pm) return 0;
    const caja=e=>{try{const b=e.getBBox();return b.width>0&&b.height>0?{x:b.x,y:b.y,w:b.width,h:b.height}:null}catch(_){return null}};
    // las plicas son líneas sin anchura propia: se les da la de la plica más un margen a cada lado, para que el silencio no las roce
    const cajaFina=(e,sp)=>{try{const b=e.getBBox(); if(!(b.height>0)) return null; const w=Math.max(b.width,0)+sp*0.28; return {x:b.x+b.width/2-w/2,y:b.y,w,h:b.height}}catch(_){return null}};
    let movidos=0;
    for(const st of pm.querySelectorAll('g.measure > g.staff')){
      const capas=[...st.querySelectorAll(':scope > g.layer')]; if(capas.length<2) continue;
      // un espacio del pentagrama, leído de sus dos primeras líneas (en Verovio, 180 unidades)
      const ys=[...st.querySelectorAll(':scope > path')].slice(0,2).map(p=>+(p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g)||[])[1]);
      const sp=ys.length===2&&ys[1]>ys[0]?ys[1]-ys[0]:180, paso=sp/2, m=sp*0.06;
      const pisa=(a,b)=>a.x+m<b.x+b.w&&a.x+a.w-m>b.x&&a.y+m<b.y+b.h&&a.y+a.h-m>b.y;
      const voces=capas.map(c=>({
        silencios:[...c.querySelectorAll('g.rest,g.mRest')].map(e=>({e,b:caja(e),dy:0})).filter(r=>r.b),
        notas:[...c.querySelectorAll('g.note g.notehead')].map(caja).filter(Boolean),
        // plicas, barras, corchetes y alteraciones: el silencio de otra voz tampoco puede quedar encima de ellos
        trazos:[...c.querySelectorAll('g.stem,g.beam,g.flag,g.accid')].map(e=>cajaFina(e,sp)).filter(Boolean)}));
      voces.forEach((v,iv)=>{
        for(const r of v.silencios){
          // holgura: distancia vertical mínima exigida (N-SIL-2 pide 0,35 espacios entre el silencio apartado y las notas)
          const choques=(dy,holgura=0)=>{
            const c={x:r.b.x,y:r.b.y+dy-holgura,w:r.b.w,h:r.b.h+2*holgura}, fuera=[];
            voces.forEach((w,jw)=>{ if(jw===iv) return;
              for(const n of w.notas) if(pisa(c,n)) fuera.push(n);
              for(const n of w.trazos) if(pisa(c,n)) fuera.push(n);
              for(const s of w.silencios){ if(s.oculto) continue; const sb={x:s.b.x,y:s.b.y+s.dy,w:s.b.w,h:s.b.h,sil:true}; if(pisa(c,sb)) fuera.push(sb)}
            });
            return fuera;
          };
          const c0=choques(0); if(!c0.length) continue;
          const mover=dy=>{const g=document.createElementNS('http://www.w3.org/2000/svg','g'); g.setAttribute('transform',`translate(0,${dy})`);
            while(r.e.firstChild) g.appendChild(r.e.firstChild); r.e.appendChild(g); r.dy=dy; r.e.setAttribute('data-n-sil2',String(Math.round(dy/paso))); movidos++};
          if(!c0.some(b=>b.sil)){
            // N-SIL-2: solo pisa notas, plicas o alteraciones de otra voz: se aparta hacia fuera; si no cabe, se oculta
            if(Notacion.config.silenciosApartados){ const signo=iv===0?-1:1; let k=1; while(k<=6&&choques(signo*k*paso,sp*0.35).length) k++; if(k<=6){ mover(signo*k*paso); continue } }
            r.e.setAttribute('display','none'); r.oculto=true; movidos++; continue }
          const centro=r.b.y+r.b.h/2, medio=c0.reduce((s,b)=>s+b.y+b.h/2,0)/c0.length;
          const pref=Math.abs(medio-centro)>sp*0.25?(medio>centro?-1:1):(iv===0?-1:1);   // y crece hacia abajo
          let mejor=null;
          for(let k=1;k<=10;k++) for(const signo of [pref,-pref]){
            const coste=k+(signo===pref?0:1.5);
            if((!mejor||coste<mejor.coste)&&!choques(signo*k*paso,sp*0.35).length) mejor={coste,dy:signo*k*paso};
          }
          if(!mejor) continue;
          mover(mejor.dy);
        }
      });
    }
    return movidos;
  }

  // N-NUM-2. Verovio pone el número de compás a una altura fija sobre el pentagrama: si choca con notas agudas,
  // líneas adicionales, plicas, barras, tresillos, ligaduras, casillas de repetición o indicaciones, se sube por encima de todas ellas.
  function despejarNumeros(svg){
    const pm=svg&&svg.querySelector('g.page-margin'), inner=svg&&svg.querySelector('svg.definition-scale'); if(!pm||!inner) return;
    const nums=[...pm.querySelectorAll('g.mNum')]; if(!nums.length) return;
    const sel='g.note,g.rest,g.mRest,g.accid,g.stem,g.beam,g.flag,g.artic,g.tupletNum,g.tupletBracket,g.ledgerLines,g.dynam,g.dir,g.tempo,g.fermata,g.ornam,g.trill,g.turn,g.mordent,g.clef,g.keySig,g.meterSig,g.harm,g.verse,g.voltaBracket,g.slur,g.tie';
    const cajas=[...pm.querySelectorAll(sel)].map(e=>{try{return e.getBBox()}catch(_){return null}}).filter(b=>b&&b.width>0&&b.height>0);
    let minY=Infinity;
    for(const g of nums){
      let nb; try{nb=g.getBBox()}catch(_){continue}
      const pad=nb.height*0.25, x0=nb.x-pad, x1=nb.x+nb.width+pad;
      let dy=0;
      for(let vuelta=0;vuelta<20;vuelta++){
        const y0=nb.y+dy-pad, y1=nb.y+nb.height+dy+pad;
        const choque=cajas.filter(b=>b.x<x1&&b.x+b.width>x0&&b.y<y1&&b.y+b.height>y0);
        if(!choque.length) break;
        dy=Math.min(...choque.map(b=>b.y))-pad-(nb.y+nb.height);   // justo encima del elemento más alto que choca
      }
      if(dy<0) g.setAttribute('transform',`translate(0,${dy})`);
      minY=Math.min(minY,nb.y+dy);
    }
    // ampliar el lienzo por arriba si algún número ha quedado fuera
    const vb=inner.getAttribute('viewBox').split(/[ ,]+/).map(Number), ovb=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
    const tr=(pm.getAttribute('transform')||'').match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/)||[0,0,0];
    const arriba=+tr[2]+minY-80;
    if(arriba<vb[1]){
      const nvb=[vb[0],arriba,vb[2],vb[3]+(vb[1]-arriba)];
      inner.setAttribute('viewBox',nvb.join(' '));
      svg.setAttribute('viewBox',`${ovb[0]} ${ovb[1]} ${ovb[2]} ${ovb[3]*nvb[3]/vb[3]}`);
    }
  }

  // Números de compás internos de la reconstrucción («8X1»: compás partido) que no se muestran, y casillas de repetición:
  // Verovio pone entre paréntesis el número de una casilla que empieza en el primer compás del fragmento, como si viniera
  // de antes («(1)»); la casilla empieza ahí, así que va sin paréntesis.
  function limpiarNumeros(svg) {
    if (!svg) return;
    svg.querySelectorAll('g.mNum').forEach(g => { if (!/^\s*\d+\s*$/.test(g.textContent)) g.remove() });
    svg.querySelectorAll('g.voltaBracket text, g.voltaBracket tspan').forEach(t => { if (!t.children.length && /^\s*\(\s*\d+\s*\)\s*$/.test(t.textContent)) t.textContent = t.textContent.replace(/[()]/g, '') });
  }
  // retoques de grabado tras renderizar (el orden importa: los números se colocan al final, sobre todo lo demás)
  function aplicar(svg) {
    const r = { silencios: despejarSilencios(svg), ligaduras: despejarLigaduras(svg) };
    despejarNumeros(svg);
    return r;
  }
  Object.assign(Notacion, { despejarLigaduras, despejarSilencios, despejarNumeros, limpiarNumeros, svg: { aplicar, despejarLigaduras, despejarSilencios, despejarNumeros, limpiarNumeros } });
})(typeof window !== 'undefined' ? window : globalThis);
