// Usability checks added 2026-10-19: first-run sample, tap-to-play, on-screen speed, ?sample, wake lock, phone layout.
const path=require('path'), fs=require('fs'), http=require('http'), assert=require('assert/strict');
const pw=require(process.env.PLAYWRIGHT_PATH || '/Users/anthoney/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const extra=require(process.env.PLAYWRIGHT_EXTRA_PATH || '/Users/anthoney/.cache/review360/node_modules/playwright');
const root=path.resolve(__dirname,'..'), app=path.join(root,'app'), key='prompterpro.document.v1';
const results={date:new Date().toISOString(),checks:[],errors:[],engines:{}};
const ok=(name,detail='')=>{results.checks.push({name,pass:true,detail});console.log('PASS',name)};
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const file=path.join(app,u==='/'?'/index.html':u);if(!file.startsWith(app+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
let base;
async function run(engine,name){
 let browser;try{browser=await engine.launch({headless:true});}catch(e){results.engines[name]={available:false,error:e.message};console.log('UNAVAILABLE',name);return;}
 results.engines[name]={available:true,version:browser.version()};
 try{
  for(const [label,width,height] of [['desktop',1440,900],['phone',390,844],['small-phone',320,568]]){
   const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<900});
   await ctx.addInitScript(()=>{window.__wake={requests:0,releases:0};Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.__wake.requests++;const l=new EventTarget();l.release=async()=>{window.__wake.releases++;};return l;}}});});
   const p=await ctx.newPage();p.on('pageerror',e=>results.errors.push({engine:name,label,message:e.message}));
   await p.goto(base+'/');
   assert.equal((await p.locator('#fullscreenBtn').textContent()).trim(),'Controls');
   await p.screenshot({path:path.join(root,'evidence',`usability-${name}-${label}-first-run.png`)});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow on first run');
   ok(`${name} ${label}: first run shows labelled Controls button and sample/editor actions`);
   if(width<900){await p.locator('#openEditor').click();await p.locator('#scriptEditor').waitFor({state:'visible'});assert.equal(await p.evaluate(()=>document.activeElement.id),'scriptEditor');await p.locator('#closeControls').click();ok(`${name} ${label}: Open the editor opens controls with the editor focused`);}
   await p.locator('#trySample').click();await p.waitForTimeout(350);
   assert.equal(await p.locator('#renderedContent h1').textContent(),'One useful next step');
   assert.equal(await p.locator('#sidebar').evaluate(e=>getComputedStyle(e).visibility),width<900?'hidden':'visible');
   assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),key)).script.startsWith('# One useful next step'),true);
   ok(`${name} ${label}: Try a sample loads, saves and (on phones) leaves the reading view clear`);
   const tapTarget=p.locator('#renderedContent p').first();
   if(width<900) await tapTarget.tap(); else await tapTarget.click();
   assert.equal(await p.locator('#statusText').textContent(),'Playing');
   await p.waitForTimeout(800);assert(await p.locator('#prompterContent').evaluate(e=>e.scrollTop)>3,'scrolls after tap');
   assert(await p.evaluate(()=>window.__wake.requests)>=1,'wake lock requested');
   if(width<900) await tapTarget.tap({force:true}); else await tapTarget.click({force:true});
   assert.equal(await p.locator('#statusText').textContent(),'Paused');
   await p.waitForTimeout(100);assert(await p.evaluate(()=>window.__wake.releases)>=1,'wake lock released on pause');
   ok(`${name} ${label}: tap/click script toggles play and pause; screen wake lock requested and released`);
   await p.locator('#fasterBtn').click();await p.locator('#fasterBtn').click();await p.locator('#slowerBtn').click();
   assert.equal(await p.locator('#speedReadout').textContent(),'1.2x');
   assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),key)).settings.speed,1.2);
   for(let i=0;i<30;i++) await p.locator('#slowerBtn').click();
   assert.equal(await p.locator('#speedReadout').textContent(),'0.2x');
   await p.locator('#fasterBtn').click();await p.locator('#fasterBtn').click();await p.locator('#fasterBtn').click();await p.locator('#fasterBtn').click();
   ok(`${name} ${label}: on-screen speed buttons change, clamp and save speed`);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.locator('#prompterContent').evaluate(e=>e.scrollTop=0);
   if(width<900 && await p.locator('#sidebar').evaluate(e=>e.classList.contains('open'))) await p.locator('#closeControls').click();
   await p.waitForTimeout(400);
   await p.screenshot({path:path.join(root,'evidence',`usability-${name}-${label}-sample.png`)});
   // ?sample: fresh profile loads sample; existing save is never replaced.
   const fresh=await browser.newContext({viewport:{width,height}});const f=await fresh.newPage();await f.goto(base+'/?sample');await f.waitForTimeout(250);
   assert.equal(await f.locator('#renderedContent h1').textContent(),'One useful next step');
   await f.locator('#scriptEditor').evaluate(e=>{e.value='# My own script';e.dispatchEvent(new Event('input',{bubbles:true}));});
   await f.goto(base+'/?sample');await f.waitForTimeout(250);
   assert.equal(await f.locator('#scriptEditor').inputValue(),'# My own script');
   await fresh.close();
   ok(`${name} ${label}: ?sample opens a demo on first visit and never overwrites a saved script`);
   // Sample button asks before replacing typed text.
   const c3=await browser.newContext({viewport:{width,height}});const g=await c3.newPage();await g.goto(base+'/');
   await g.locator('#scriptEditor').evaluate(e=>{e.value='Keep me';e.dispatchEvent(new Event('input',{bubbles:true}));});
   g.once('dialog',d=>d.dismiss());await g.locator('#trySample').click();await g.waitForTimeout(150);
   assert.equal(await g.locator('#scriptEditor').inputValue(),'Keep me');await c3.close();
   ok(`${name} ${label}: sample never silently replaces typed text`);
   await ctx.close();
  }
 }catch(e){results.checks.push({name:name+': failure',pass:false,error:e.stack.slice(0,1500)});console.error('FAIL',name,e.message.slice(0,400));}
 finally{await browser.close();}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;await run(pw.chromium,'chromium');await run(extra.webkit,'webkit');await run(extra.firefox,'firefox');server.close();fs.writeFileSync(path.join(root,'evidence/usability-results.json'),JSON.stringify(results,null,2));const fails=results.checks.filter(c=>!c.pass).length;console.log(`${results.checks.length-fails} passed, ${fails} failed, ${results.errors.length} page errors`);if(fails||results.errors.length)process.exitCode=1;})();
