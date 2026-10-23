const p=require('puppeteer-core');
(async()=>{const b=await p.connect({browserURL:'http://localhost:8009',defaultViewport:null});const [pg]=await b.pages();
pg.on('pageerror',e=>console.log('pageerror',e.message));
await pg.reload(); await new Promise(r=>setTimeout(r,4000));
const t=await pg.$('.header_tabs button::-p-text(Settings)'); await t.tap(); await new Promise(r=>setTimeout(r,800));
console.log(await pg.evaluate(()=>document.querySelector('main').className));
b.disconnect();})();
