// Claves de las partituras reconstruidas (DCML): proporción de compases con la mayoría de notas a 3+ líneas adicionales, antes y después de asignarClaves.
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:900}});
p.on('pageerror',e=>console.log('PE',e.message));
await p.route(/googleapis|gstatic/,r=>r.abort());
await p.route(/jsdelivr/,r=>r.fulfill({body:fs.readFileSync('verovio-toolkit-wasm.js'),contentType:'application/javascript'}));
await p.goto('http://localhost:8767/index.html');await p.waitForFunction(()=>window.__prueba);
await p.addScriptTag({path:'jszip.min.js'});
const res=await p.evaluate(async()=>{
  const P={C:0,D:1,E:2,F:3,G:4,A:5,B:6}, MID={G2:34,'G2-1':27,F4:22,C3:28,C4:26,C1:30,F3:24,G1:36};
  function metrica(x){
    const doc=new DOMParser().parseFromString(x,'application/xml'); let malos=0,tot=0,cambios=0;
    const kids=(n,t)=>[...n.children].filter(c=>c.tagName===t);
    for(const parte of doc.getElementsByTagName('part')){
      const ms=kids(parte,'measure'); const n=Math.max(1,...[...parte.getElementsByTagName('staves')].map(e=>+e.textContent));
      for(let st=1;st<=n;st++){let cl='G2',prev=null;
      for(const m of ms){
        for(const c of m.getElementsByTagName('clef')){if(+(c.getAttribute('number')||1)!==st)continue;const s=c.querySelector('sign')?.textContent,l=c.querySelector('line')?.textContent,o=c.querySelector('clef-octave-change')?.textContent;cl=s+l+(o&&+o?o:'')}
        if(prev&&cl!==prev)cambios++;prev=cl;
        const ps=kids(m,'note').filter(no=>+(no.querySelector('staff')?.textContent||1)===st&&no.querySelector('pitch')).map(no=>{const pi=no.querySelector('pitch');return P[pi.querySelector('step').textContent]+7*+pi.querySelector('octave').textContent});
        if(!ps.length)continue; tot++;
        const mal=ps.filter(q=>{const d=Math.abs(q-(MID[cl]??34));return d>=6&&Math.floor((d-4)/2)>=3}).length;
        if(mal/ps.length>0.5)malos++;}}}
    return {malos,tot,cambios};
  }
  const out=[]; const vistos=new Set(); const zips={};
  for(const o of __prueba.OBRAS.filter(o=>o.f==='dcml')){
    if(vistos.has(o.m))continue;vistos.add(o.m);
    zips[o.pq]=zips[o.pq]||await (await fetch('scores/'+o.pq+'.json')).json();
    const z=await JSZip.loadAsync(zips[o.pq][o.m],{base64:true});
    const n=Object.keys(z.files).find(n=>/\.(xml|musicxml)$/.test(n)&&!n.startsWith('META'));
    const x=await z.file(n).async('string');
    const a=metrica(x), d=metrica(__prueba.ordenarVoces(x,o.src.inst));
    out.push([o.col,o.t,o.src.inst?.join('/'),a.malos/a.tot,d.malos/d.tot,d.cambios]);
  }
  return out;});
const f=(r,k,u)=>r.filter(x=>x[k]>u).length;
console.log('piezas',res.length,'| >5%: antes',f(res,3,.05),'después',f(res,4,.05),'| >15%: antes',f(res,3,.15),'después',f(res,4,.15));
console.log('peores después:');res.sort((a,b)=>b[4]-a[4]).slice(0,15).forEach(r=>console.log(r[4].toFixed(2),r[3].toFixed(2),r[5],r[0],r[1],r[2]));
console.log('más cambios:');res.sort((a,b)=>b[5]-a[5]).slice(0,8).forEach(r=>console.log(r[5],r[0],r[1],r[2]));
fs.writeFileSync('claves.json',JSON.stringify(res));
await b.close()})();
