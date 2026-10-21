// Windows CI: installed app -> real electron-updater HTTP download -> real NSIS upgrade.
// The test-only 1.3.1 fixture is never published to GitHub Releases.
const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const {createReadStream}=require('node:fs');
const path=require('node:path');const http=require('node:http');
const yaml=require('js-yaml');
const installDir=process.argv[2],fixture=path.resolve('update-fixture');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 let desktop,server;let invalidHash=true,downloads=0;
 try{
  const saved=JSON.parse(await fs.readFile(path.join(process.env.RUNNER_TEMP,'moaham-upgrade-checkpoint.json'),'utf8'));
  const metadata=await fs.readFile(path.join(fixture,'latest.yml'),'utf8');
  const manifest=yaml.load(metadata);const target=manifest.version;
  assert.notEqual(target,require('../package.json').version);
  const exeName=manifest.files.find(f=>f.url.endsWith('.exe')).url;
  await fs.access(path.join(fixture,exeName));
  server=http.createServer(async(req,res)=>{
   if(req.url.split('?')[0]==='/latest.yml'){
    res.setHeader('Content-Type','text/yaml');
    const data=yaml.load(metadata);
    if(invalidHash){data.sha512=Buffer.alloc(64).toString('base64');for(const f of data.files)f.sha512=data.sha512;}
    res.end(yaml.dump(data));
   }else if(decodeURIComponent(req.url.split('?')[0])==='/'+exeName){
    downloads++;res.setHeader('Content-Length',(await fs.stat(path.join(fixture,exeName))).size);createReadStream(path.join(fixture,exeName)).pipe(res);
   }else{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const feed=`http://127.0.0.1:${server.address().port}`;
  desktop=await _electron.launch({executablePath:path.join(installDir,'Moaham.exe'),args:[],env:{...process.env},timeout:45000});
  const page=await desktop.firstWindow();await page.waitForSelector('#lockScreen:not([hidden])');
  await desktop.evaluate(({app,dialog},feed)=>{
   // Playwright evaluates in the main-process global scope, where CommonJS
   // require is not a global. Resolve through Node's loaded main module.
   const updates=process.mainModule.require(app.getAppPath()+'/src/main.cjs').updates;
   updates.updater.setFeedURL({provider:'generic',url:feed});
   // Avoid launching an untracked app after installation, then reopen to verify data.
   const install=updates.updater.quitAndInstall.bind(updates.updater);
   updates.updater.quitAndInstall=()=>install(true,false);
   global.__consent=0;dialog.showMessageBox=async()=>({response:global.__consent});
  },feed);
  for(const name of ['checkUpdates','downloadUpdate','installUpdate','updateStatus'])assert.equal(await page.evaluate(async name=>{try{await window.moaham[name]();return false;}catch{return true;}},name),true);
  await page.locator('#unlockPassword').fill('ci-upgrade-only-password');await page.locator('#unlockButton').click();await page.waitForSelector('.file-card');
  await page.locator('#settings').click();await page.locator('#appUpdates').click();
  await page.waitForFunction(()=>document.querySelector('#updateDialogStatus').textContent.includes('새 버전'));
  assert.equal(downloads,0);
  // Declining download must do nothing.
  await page.locator('#updateDialogAction').click();assert.equal(downloads,0);assert.equal((await page.evaluate(()=>window.moaham.updateStatus())).state,'available');
  await desktop.evaluate(()=>{global.__consent=1;});
  await page.locator('#updateDialogAction').click();
  await page.waitForFunction(()=>document.querySelector('#updateDialogStatus').textContent.includes('업데이트하지 못했습니다'),{},{timeout:120000});
  assert.ok(downloads>=1);assert.equal(await page.evaluate(async()=>{try{await window.moaham.installUpdate();return false;}catch{return true;}}),true);
  invalidHash=false;await page.locator('#checkUpdates').click();await page.waitForFunction(()=>document.querySelector('#updateDialogStatus').textContent.includes('새 버전'));
  await page.locator('#updateDialogAction').click();await page.waitForFunction(()=>document.querySelector('#updateDialogStatus').textContent.includes('설치 준비'),{},{timeout:120000});
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/Moaham-update-ready.png'});
  // Declining restart must leave the app running and preserve the ready update.
  await desktop.evaluate(()=>{global.__consent=0;});await page.locator('#updateDialogAction').click();assert.equal((await page.evaluate(()=>window.moaham.updateStatus())).state,'downloaded');
  await desktop.evaluate(()=>{global.__consent=1;});
  const closed=desktop.waitForEvent('close',{timeout:45000});await page.locator('#updateDialogAction').click().catch(()=>{});await closed;desktop=null;
  // Real NSIS replacement is asynchronous after the app exits.
  const asar=require('@electron/asar');let installed=false;
  for(let n=0;n<120;n++){
   try{const archive=path.join(installDir,'resources','app.asar');asar.uncache(archive);installed=JSON.parse(asar.extractFile(archive,'package.json').toString()).version===target;}catch{}
   if(installed)break;await delay(500);
  }
  assert.ok(installed,'NSIS did not replace the installed version');
  // Let the installer finish before launching again.
  await delay(3000);
  desktop=await _electron.launch({executablePath:path.join(installDir,'Moaham.exe'),args:[],env:{...process.env},timeout:45000});
  const next=await desktop.firstWindow();await next.waitForSelector('#lockScreen:not([hidden])');await next.locator('#unlockPassword').fill('ci-upgrade-only-password');await next.locator('#unlockButton').click();await next.waitForSelector('.file-card');
  assert.equal((await next.evaluate(()=>window.moaham.info())).version,target);
  const db=await next.evaluate(()=>window.moaham.snapshot());assert.equal(db.items[0].id,saved.itemId);assert.equal(db.items[0].favorite,true);assert.equal(db.folders[0].favorite,true);assert.equal(db.items[0].note,'기존 메모');assert.deepEqual(db.items[0].tags,['유지']);assert.equal(await next.locator('#cardSize').inputValue(),'280');
  await desktop.close();desktop=null;
  console.log('PASS: consent/decline, locked API denial, SHA512 rejection/retry, real updater download + NSIS upgrade, password/data/settings retained.');
 }finally{if(desktop)await desktop.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
