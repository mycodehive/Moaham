// Windows CI exercises the actual v1.1.0 installation and the renamed package.
const {_electron}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const phase=process.argv[2],installDir=process.argv[3];
const checkpoint=path.join(process.env.RUNNER_TEMP,'moaham-upgrade-checkpoint.json');
const password='ci-upgrade-only-password';
async function launch(executablePath,env){const app=await _electron.launch({executablePath,args:[],env,timeout:45000});const page=await app.firstWindow();await page.waitForURL('orgapp://ui/');return {app,page};}
(async()=>{let desktop;try{
 if(phase==='seed'){
  const library=path.join(process.env.RUNNER_TEMP,'기존 orgFiles 보관함');const source=path.join(process.env.RUNNER_TEMP,'기존 문서.txt');await fs.writeFile(source,'Moaham 업데이트 후에도 남아야 하는 연구 문서');
  const {app,page}=await launch(path.join(installDir,'orgFiles.exe'),{...process.env,ORGFILES_LIBRARY:library});desktop=app;await page.waitForFunction(()=>!document.body.classList.contains('booting'));
  await page.evaluate(async source=>{await window.orgFiles.importPaths([source]);await window.orgFiles.folder('create',{name:'기존 즐겨찾기 폴더'});const db=await window.orgFiles.snapshot();await window.orgFiles.folder('favorite',{id:db.folders[0].id,favorite:true});await window.orgFiles.update([db.items[0].id],{favorite:true,tags:['유지'],note:'기존 메모',folderIds:[db.folders[0].id]});},source);
  await page.locator('#cardSize').evaluate(el=>{el.value='280';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.evaluate(password=>window.orgFiles.authConfigure({newPassword:password}),password);const userData=await app.evaluate(({app})=>app.getPath('userData'));const data=await page.evaluate(()=>window.orgFiles.snapshot());
  await app.close();desktop=null;
  await fs.writeFile(path.join(userData,'settings.json'),JSON.stringify({library}));await fs.writeFile(checkpoint,JSON.stringify({userData,library,itemId:data.items[0].id,folderId:data.folders[0].id}));console.log('PASS: seeded installed orgFiles v1.1.0 with password, data, favorites and card preferences.');
 }else if(phase==='verify'){
  const saved=JSON.parse(await fs.readFile(checkpoint,'utf8'));const env={...process.env};for(const k of ['ORGFILES_LIBRARY','MOAHAM_LIBRARY','ORGFILES_TEST_MODE','MOAHAM_TEST_MODE','ORGFILES_TEST_USER_DATA','MOAHAM_TEST_USER_DATA'])delete env[k];
  const {app,page}=await launch(path.join(installDir,'Moaham.exe'),env);desktop=app;await page.waitForSelector('#lockScreen:not([hidden])');assert.equal(await page.title(),'Moaham');assert.equal(await page.locator('.file-card').count(),0);assert.equal((await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),saved.userData.toLowerCase());
  await page.locator('#unlockPassword').fill(password);await page.locator('#unlockButton').click();await page.waitForSelector('.file-card');const db=await page.evaluate(()=>window.moaham.snapshot());assert.equal(db.items[0].id,saved.itemId);assert.equal(db.items[0].favorite,true);assert.deepEqual(db.items[0].tags,['유지']);assert.equal(db.items[0].note,'기존 메모');assert.equal(db.folders[0].id,saved.folderId);assert.equal(db.folders[0].favorite,true);assert.equal((await fs.realpath(db.root)).toLowerCase(),(await fs.realpath(saved.library)).toLowerCase());assert.equal(await page.locator('#cardSize').inputValue(),'280');assert.match(await fs.readFile(path.join(db.root,'files',saved.itemId+'.txt'),'utf8'),/연구 문서/);
  // Verify linked text extraction in the installed ASAR package, including its Worker.
  const linked=path.join(process.env.RUNNER_TEMP,'설치본 링크 원본.txt');await fs.writeFile(linked,'packaged worker original');const imported=await page.evaluate(file=>window.moaham.importPaths([file],null,{mode:'link'}),linked);assert.equal(imported.added,1);let linkedItem=(await page.evaluate(()=>window.moaham.snapshot())).items.find(i=>i.id===imported.entries[0].id);assert.match(linkedItem.searchText,/packaged worker original/);await fs.writeFile(linked,'packaged worker updated longer');linkedItem=(await page.evaluate(()=>window.moaham.snapshot())).items.find(i=>i.id===linkedItem.id);assert.match(linkedItem.searchText,/packaged worker updated/);
  await app.evaluate(({dialog})=>{global.__savedDialog=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});});await page.evaluate(async id=>{await window.moaham.trash([id]);await window.moaham.purge([id]);},linkedItem.id);await app.evaluate(({dialog})=>{dialog.showMessageBox=global.__savedDialog;delete global.__savedDialog;});assert.match(await fs.readFile(linked,'utf8'),/packaged worker updated/);console.log('PASS: installed ASAR Worker extracts and refreshes linked text; purging a link preserves its original.');
  assert.ok(await page.locator('.brand-icon').first().evaluate(async img=>{await img.decode();return img.naturalWidth>=128;}));await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/Moaham-upgrade.png'});await app.close();desktop=null;console.log('PASS: installed Moaham retained the old password, chosen library, files, favorites, notes, tags and card size.');
 }else if(phase==='preserved'){
  const saved=JSON.parse(await fs.readFile(checkpoint,'utf8'));await fs.access(path.join(saved.library,'catalog.json'));await fs.access(path.join(saved.userData,'app-lock.json'));console.log('PASS: uninstall preserved the library and app password.');
 }else throw new Error('Use seed, verify or preserved');
 }finally{if(desktop)await desktop.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
