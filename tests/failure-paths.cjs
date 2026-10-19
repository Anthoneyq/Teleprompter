const {chromium}=require(process.env.PLAYWRIGHT_PATH || '/Users/anthoney/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),url='file://'+path.join(root,'app/index.html');
const result={checks:[],errors:[]};
const ok=name=>{result.checks.push(name);console.log('PASS',name)};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 const c=await browser.newContext({acceptDownloads:true,bypassCSP:true}); const p=await c.newPage();
 await p.addInitScript(()=>{Storage.prototype.getItem=function(){throw new DOMException('Blocked','SecurityError')};Storage.prototype.setItem=function(){throw new DOMException('Blocked','SecurityError')}});
 await p.goto(url);await p.locator('#scriptEditor').fill('# Storage blocked\n\nStill usable');await p.locator('#loadScript').click();assert.equal(await p.locator('#renderedContent h1').textContent(),'Storage blocked');assert.match(await p.locator('#saveStatus').textContent(),/Not saved/);
 const d=p.waitForEvent('download');await p.locator('#exportScript').click();assert.equal(JSON.parse(fs.readFileSync(await (await d).path(),'utf8')).script,'# Storage blocked\n\nStill usable');ok('blocked storage at startup: local-folder rendering and export survive');
 await p.evaluate(()=>{window.realCreate=URL.createObjectURL;URL.createObjectURL=()=>{throw Error('blocked')}});await p.locator('#exportScript').click();assert.match(await p.locator('#saveStatus').textContent(),/Export could not start/);await p.evaluate(()=>URL.createObjectURL=window.realCreate);ok('failed export reports failure and preserves editor');
 await p.locator('#scriptEditor').fill('<img src=x onerror="window.attack=true"><svg onload="window.attack=true"></svg>\n\n[x](javascript:alert(1))');await p.locator('#loadScript').click();assert.equal(await p.locator('#renderedContent img,#renderedContent svg,#renderedContent a').count(),0);assert.equal(await p.evaluate(()=>window.attack),undefined);ok('inert renderer remains safe with CSP disabled in test context');
 await c.close();
 const c2=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});const p2=await c2.newPage();await p2.goto(url);
 const good={format:'prompterpro',version:1,script:'# Imported',settings:{speed:1,fontSize:32,lineHeight:1.7,mirrorH:false,mirrorV:false,guide:true,accent:'#00d4aa'}};
 await p2.locator('#scriptEditor').fill('Original draft');
 await p2.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){await new Promise(r=>setTimeout(r,400));return original.call(this)}});
 await p2.locator('#importFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(good))});await p2.locator('#scriptEditor').fill('Edited during import');await p2.waitForTimeout(500);assert.equal(await p2.locator('#scriptEditor').inputValue(),'Edited during import');assert.match(await p2.locator('#saveStatus').textContent(),/Import cancelled/);ok('edit during asynchronous import prevents replacement');
 const sample=fs.readFileSync(path.join(root,'app/demo-script.md'),'utf8');await p2.locator('#scriptEditor').fill(sample);await p2.locator('#loadScript').click();
 await p2.locator('[data-tab=settings]').click();await p2.locator('#speedSlider').fill('0.2');await p2.locator('#playPauseBtn').click();await p2.waitForTimeout(1100);assert(await p2.locator('#prompterContent').evaluate(e=>e.scrollTop)>2);await p2.locator('#playPauseBtn').click();ok('minimum 0.2x scroll advances');
 await p2.locator('#speedSlider').fill('1');await p2.locator('[data-tab=editor]').click();await p2.locator('#resetBtn').click();await p2.locator('#scriptEditor').evaluate(e=>e.scrollTop=0);await p2.waitForTimeout(500);await p2.screenshot({path:path.join(root,'evidence/demo-desktop.png')});
 await p2.setViewportSize({width:390,height:844});await p2.waitForTimeout(400);await p2.screenshot({path:path.join(root,'evidence/demo-phone.png')});await p2.locator('#fullscreenBtn').click();await p2.locator('[data-tab=settings]').click();await p2.waitForTimeout(500);await p2.screenshot({path:path.join(root,'evidence/demo-phone-settings.png')});ok('clean demo stills generated from supplied sample');
 await c2.close();
 }catch(e){result.errors.push(e.stack);console.error(e.message);process.exitCode=1;}finally{await browser.close();fs.writeFileSync(path.join(root,'evidence/failure-paths.json'),JSON.stringify(result,null,2))}
})().catch(e=>{console.error(e.message);process.exitCode=1});
