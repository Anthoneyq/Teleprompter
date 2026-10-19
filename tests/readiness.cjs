const path=require('path'), fs=require('fs'), http=require('http'), assert=require('assert/strict');
const pw=require(process.env.PLAYWRIGHT_PATH || '/Users/anthoney/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const extra=require(process.env.PLAYWRIGHT_EXTRA_PATH || '/Users/anthoney/.cache/review360/node_modules/playwright');
const root=path.resolve(__dirname,'..'), key='prompterpro.document.v1';
const results={date:new Date().toISOString(),checks:[],errors:[],engines:{},externalRequests:[]};
const record=(name,detail='')=>{results.checks.push({name,pass:true,detail});console.log('PASS',name)};
const script='# Rehearse with purpose\n\n## Your next useful step\n\n**Slow down.** Take a breath.\n\n- Start with one clear idea\n- Give one concrete example\n\n> Pause here\n\n'+('A steady pace makes this easier to follow.\n\n'.repeat(60));
const server=http.createServer((req,res)=>{const file=path.join(root,'app',decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0])); if(!file.startsWith(path.join(root,'app')+path.sep)){res.writeHead(403).end();return;}try {res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
async function run(engine,name) {
 let browser;
 try {browser=await engine.launch({headless:true});}catch(e){results.engines[name]={available:false,error:e.message};console.log('UNAVAILABLE',name,e.message.slice(0,160));return;}
 results.engines[name]={available:true,version:browser.version()};
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 context.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('file:'))results.externalRequests.push(r.url())});
 const p=await context.newPage();p.on('pageerror',e=>results.errors.push({engine:name,message:e.message}));
 const editor=p.locator('#scriptEditor');
 const save=()=>p.locator('#saveScript').click();
 const load=async(text)=>{await p.locator('[data-tab=editor]').click();await editor.fill(text);await p.locator('#loadScript').click();await p.waitForTimeout(100)};
 const readSave=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const download=async()=>{const d=p.waitForEvent('download');await p.locator('#exportScript').click();return await d;};
 try {
 await p.goto(base); await load(script);
 assert.equal(await p.locator('#renderedContent h1').textContent(),'Rehearse with purpose');
 assert.equal(await p.locator('#renderedContent strong').textContent(),'Slow down.');record(name+': load Markdown');
 await p.locator('#playPauseBtn').click();await p.waitForTimeout(1000);
 const moving=await p.locator('#prompterContent').evaluate(e=>e.scrollTop);assert(moving>5);
 await p.locator('#playPauseBtn').click();const stopped=await p.locator('#prompterContent').evaluate(e=>e.scrollTop);await p.waitForTimeout(150);assert.equal(await p.locator('#prompterContent').evaluate(e=>e.scrollTop),stopped);
 await p.locator('#resetBtn').click();assert.equal(await p.locator('#prompterContent').evaluate(e=>e.scrollTop),0);record(name+': scroll, pause, reset');
 await p.locator('[data-tab=settings]').click();
 for(const [id,value] of [['speed',2],['fontSize',40],['lineHeight',2]]) await p.locator('#'+id+'Slider').fill(String(value));
 await p.locator('#mirrorH').click();await p.locator('#mirrorV').click();await p.locator('#showGuide').click();await p.locator('[data-color="#6366f1"]').click();
 await p.reload();assert.equal(await editor.inputValue(),script);
 const snap=await readSave();assert.equal(snap.settings.speed,2);assert.equal(snap.settings.fontSize,40);assert(snap.settings.mirrorH&&snap.settings.mirrorV);assert.equal(snap.settings.guide,false);
 record(name+': script and all settings restore paused');
 for(let i=0;i<4;i++)await save();assert.deepEqual(await readSave(),snap);record(name+': repeated saves stable');
 await editor.fill(script+'\nInterrupted draft');await p.reload();assert((await editor.inputValue()).endsWith('Interrupted draft'));record(name+': immediate reload preserves last edit');
 const first=await download();const backup=fs.readFileSync(await first.path(),'utf8');const validateBackup=JSON.parse(backup);assert(validateBackup.script.endsWith('Interrupted draft'));
 const second=await download();assert.equal(fs.readFileSync(await second.path(),'utf8'),backup);record(name+': repeated exports exact');
 const cancelled=await download();await cancelled.cancel();assert.match(await p.locator('#saveStatus').textContent(),/requested/);assert.equal((await readSave()).script,validateBackup.script);record(name+': download cancellation never claims disk success');
 await editor.fill('Replacement');
 p.once('dialog',d=>d.accept());await p.locator('#importFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
 await p.waitForFunction(t=>document.getElementById('scriptEditor').value===t,validateBackup.script);assert.deepEqual(await readSave(),validateBackup);record(name+': export/import round trip');
 p.once('dialog',d=>d.dismiss());await p.locator('#importFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...validateBackup,script:'Do not import'}))});await p.waitForTimeout(100);assert.equal(await editor.inputValue(),validateBackup.script);record(name+': import cancellation preserves work');
 for(const invalid of ['{',JSON.stringify({...validateBackup,version:2}),JSON.stringify({...validateBackup,settings:{...validateBackup.settings,fontSize:-5}}),JSON.stringify({...validateBackup,script:'x'.repeat(200001)})]){
 await p.locator('#importFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(invalid)});await p.waitForFunction(()=>document.getElementById('saveStatus').textContent.startsWith('Import rejected'));assert.equal(await editor.inputValue(),validateBackup.script);
 }record(name+': invalid/truncated/version/range/oversized imports atomic');
 await p.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}});
 await editor.fill('Survives failed save');assert.match(await p.locator('#saveStatus').textContent(),/Not saved/);assert.equal((await readSave()).script,validateBackup.script);
 const failedSaveExport=await download();assert.equal(JSON.parse(fs.readFileSync(await failedSaveExport.path(),'utf8')).script,'Survives failed save');
 await p.evaluate(()=>Storage.prototype.setItem=window.originalSet);await save();record(name+': failed write keeps previous save and current draft exports');
 // Corrupt storage must remain untouched until explicit overwrite confirmation.
 await p.evaluate(k=>localStorage.setItem(k,'{broken'),key);await p.reload();assert.match(await p.locator('#saveStatus').textContent(),/could not be restored/);await editor.fill('New recoverable draft');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),'{broken');p.once('dialog',d=>d.accept());await save();record(name+': corrupt save protected; explicit recovery works');
 const other=await context.newPage();await other.goto(base);await other.locator('#scriptEditor').fill('Other tab');await p.waitForTimeout(100);await editor.fill('This tab');assert.equal((await readSave()).script,'Other tab');assert.match(await p.locator('#saveStatus').textContent(),/Not saved/);p.once('dialog',d=>d.accept());await save();await other.close();record(name+': competing tabs cannot silently overwrite');
 const attack=`# Safe heading\n\n<img src="https://example.invalid/leak" onerror="window.pwned=1">\n\n<svg onload="window.pwned=2"><a xlink:href="javascript:alert(1)">x</a></svg>\n\n<script>window.pwned=3</script>\n\n<iframe srcdoc="<script>parent.pwned=4</script>"></iframe>\n\n<style>body{display:none}</style>\n\n[click](javascript:alert(1)) ![track](https://example.invalid/tracker)\n\n<a id="scriptEditor" name="location" href="data:text/html,evil">test</a>\n\n&#60;img src=x onerror=alert(1)&#62;\n\n**Formatting stays**`;
 await load(attack);assert.equal(await p.locator('#renderedContent script,#renderedContent img,#renderedContent svg,#renderedContent iframe,#renderedContent style,#renderedContent a,#renderedContent input').count(),0);assert.equal(await p.evaluate(()=>window.pwned),undefined);assert.equal(await p.locator('#renderedContent strong').textContent(),'Formatting stays');assert.equal(results.externalRequests.length,0);record(name+': active HTML, handlers, SVG, URL schemes, clobbering inert; no remote requests');
 const long='# Long rehearsal\n\n'+('A calm clear sentence for a longer rehearsal.\n\n'.repeat(3500));const start=Date.now();await editor.evaluate((e,text)=>{e.value=text;e.dispatchEvent(new Event('input',{bubbles:true}))},long);await p.locator('#loadScript').click();assert.equal(await p.locator('#renderedContent p').count(),3500);record(name+': 157K-character script via synthetic input',Date.now()-start+'ms including browser actions');
 await p.locator('#prompterContent').evaluate(e=>e.scrollTop=e.scrollHeight);await p.locator('#playPauseBtn').click();await p.waitForTimeout(200);assert.equal(await p.locator('#statusText').textContent(),'Paused');record(name+': stops at script end');
 await load('');assert.equal(await p.locator('#renderedContent').textContent(),'');record(name+': empty load clears prior script');
 await load(script);
 for(const [label,width,height] of [['desktop',1440,900],['tablet',768,1024],['phone',390,844],['small-phone',320,568],['landscape',844,390]]) {
 await p.setViewportSize({width,height});await p.waitForTimeout(350);
 if(width<=900){await p.locator('#fullscreenBtn').click();await p.locator('#scriptEditor').waitFor({state:'visible'});await editor.fill(script);await p.locator('#loadScript').click();await p.waitForTimeout(350);assert.equal(await p.locator('#sidebar').evaluate(e=>getComputedStyle(e).visibility),'hidden');}
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(root,'evidence',name+'-'+label+'.png')});
 if(width<=900){await p.locator('#fullscreenBtn').click();await p.locator('#playPauseBtn').click();await p.locator('#closeControls').click();await p.waitForTimeout(300);assert.equal(await p.locator('#statusText').textContent(),'Playing');await p.locator('#fullscreenBtn').click();await p.locator('#playPauseBtn').click();await p.screenshot({path:path.join(root,'evidence',name+'-'+label+'-controls.png')});await p.locator('#closeControls').click();}
 record(name+': '+label+' layout and controls');
 }
 await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>document.activeElement.blur());await p.keyboard.press('Space');assert.equal(await p.locator('#statusText').textContent(),'Playing');await p.keyboard.press('KeyR');assert.equal(await p.locator('#statusText').textContent(),'Paused');record(name+': keyboard shortcuts');
 const local=await context.newPage();await local.goto('file://'+path.join(root,'app/index.html'));await local.locator('#scriptEditor').fill(script);await local.locator('#loadScript').click();assert.equal(await local.locator('#renderedContent h1').textContent(),'Rehearse with purpose');await local.reload();assert.equal(await local.locator('#scriptEditor').inputValue(),script);record(name+': file:// offline folder load and restore');await local.close();
 }catch(e){results.checks.push({name:name+': failure',pass:false,error:e.stack.slice(0,1500)});console.error(e.message.slice(0,300));await p.screenshot({path:path.join(root,'evidence',name+'-failure.png')}).catch(()=>{});}
 finally {await browser.close();}
}
let base;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;await run(pw.chromium,'chromium');await run(extra.webkit,'webkit');await run(extra.firefox,'firefox');server.close();fs.writeFileSync(path.join(root,'evidence/results.json'),JSON.stringify(results,null,2));if(results.checks.some(c=>!c.pass)||results.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);server.close();process.exitCode=1});
