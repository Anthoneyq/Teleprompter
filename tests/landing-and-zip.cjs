// Landing page renders at desktop/phone with the live demo; release ZIP opens from a clean folder and reads.
const path=require('path'),fs=require('fs'),http=require('http'),os=require('os'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const pw=require(process.env.PLAYWRIGHT_PATH||'/Users/anthoney/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const f=path.join(root,u.endsWith('/')?u+'index.html':u);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const b=await pw.chromium.launch();const errors=[];
try{
 for(const [label,w,h] of [['desktop',1440,900],['phone',390,844]]){
  const p=await b.newPage({viewport:{width:w,height:h}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/');await p.waitForTimeout(800);
  const frame=p.frameLocator('iframe');assert.equal(await frame.locator('#renderedContent h1').textContent(),'One useful next step');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  assert.equal(await p.locator('a.btn.primary').getAttribute('href'),'app/index.html?sample');
  await p.screenshot({path:path.join(root,'evidence',`landing-${label}.png`),fullPage:true});
  console.log('PASS landing',label,'renders, demo iframe loads sample, no sideways scroll');await p.close();
 }
 const zip=fs.readdirSync(path.join(root,'dist')).filter(f=>f.endsWith('.zip')).sort().pop();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pp-zip-'));execFileSync('unzip',['-q',path.join(root,'dist',zip),'-d',dir]);
 const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto('file://'+path.join(dir,'PrompterPro','index.html'));await p.locator('#trySample').click();
 assert.equal(await p.locator('#renderedContent h1').textContent(),'One useful next step');
 await p.locator('#renderedContent p').first().click();await p.waitForTimeout(700);assert(await p.locator('#prompterContent').evaluate(e=>e.scrollTop)>3);
 await p.reload();assert((await p.locator('#scriptEditor').inputValue()).startsWith('# One useful next step'));
 console.log('PASS release ZIP',zip,'unzips, opens from file://, plays, restores after reload');
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS no page errors');
}catch(e){console.error('FAIL',e.message);process.exitCode=1;}finally{await b.close();server.close();}})();
