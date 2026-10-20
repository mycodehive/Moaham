const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {zipSync,strToU8}=require('fflate');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'orgfiles-ui-'));const source=path.join(temp,'테스트 원본');await fs.mkdir(source);const root=path.join(temp,'보관함');let desktop;
 try{
  await fs.copyFile(path.join(__dirname,'../build/icon.png'),path.join(source,'브랜드 심볼.png'));
  await fs.writeFile(path.join(source,'프로젝트 기획안.md'),'# 프로젝트 기획안\n\n목표: 디자인과 문서를 한곳에서 관리합니다.\n\n기능\n- 태그와 폴더 분류\n- 원본 보존\n- 전체 백업\n\n검토 일정: 2026년 10월');
  await fs.writeFile(path.join(source,'2026 예산.csv'),'구분,예산,담당\n디자인,1200000,기획팀\n개발,3500000,개발팀');
  await fs.writeFile(path.join(source,'연구 계약서.docx'),zipSync({'word/document.xml':strToU8('<w:document><w:p><w:r><w:t>세종대학교 연구 계약 검토안</w:t></w:r></w:p><w:p><w:r><w:t>계약 기간: 2026년 10월부터 2027년 9월까지</w:t></w:r></w:p></w:document>')}));
  await fs.writeFile(path.join(source,'안전 테스트.html'),'<script>window.INJECTED=true</script><h1>미리보기 보안 검증</h1>');
  await fs.writeFile(path.join(source,'program.exe'),'do not execute');
  const args=process.platform==='linux'?['--no-sandbox','--ozone-platform=headless','.']:['.'];
  desktop=await _electron.launch({args,cwd:path.join(__dirname,'..'),env:{...process.env,ORGFILES_LIBRARY:root,ORGFILES_TEST_MODE:'1'},timeout:30000});
  const page=await desktop.firstWindow();await page.waitForURL('orgapp://ui/');await page.waitForSelector('#viewTitle');await page.setViewportSize({width:1500,height:940});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='준비됨');
  const result=await page.evaluate(paths=>window.orgFiles.importPaths(paths,null),[source]);assert.equal(result.added,6);
  // Reload uses the actual preload bridge, protocols and persisted library.
  await page.reload();await page.waitForSelector('.file-card');assert.equal(await page.locator('.file-card').count(),6);
  await page.getByLabel('파일 검색',{exact:true}).fill('세종대학교');await page.waitForFunction(()=>document.querySelectorAll('.file-card').length===1);
  await page.locator('.file-card').click();await page.getByLabel('파일 제목',{exact:true}).fill('연구 계약서 최종안');await page.locator('#detailTags').fill('연구, 계약');await page.locator('#detailNote').fill('법무 검토 완료');await page.locator('#saveDetails').click();await page.waitForFunction(()=>document.querySelector('.card-title')?.textContent==='연구 계약서 최종안');
  await page.locator('#showPreview').click();await page.waitForSelector('.document-text');assert.match(await page.locator('.document-text').textContent(),/세종대학교/);await page.locator('#modalActions button').first().click();
  await page.locator('#search').fill('');await page.waitForFunction(()=>document.querySelectorAll('.file-card').length===6);
  const snap=await page.evaluate(()=>window.orgFiles.snapshot());const image=snap.items.find(i=>i.ext==='png');const unsafe=snap.items.find(i=>i.ext==='exe');
  assert.equal(await page.evaluate(async id=>{try{await window.orgFiles.open(id);return false;}catch{return true;}},unsafe.id),true);
  assert.equal(await page.evaluate(async()=>{const r=await fetch('orgasset://file/00000000-0000-0000-0000-000000000000');return r.status;}),404);
  assert.equal(await page.evaluate(async()=>{const r=await fetch('orgasset://file/..%2Fcatalog.json');return r.status;}),404);
  const response=await page.evaluate(async id=>{const r=await fetch('orgasset://file/'+id);return{status:r.status,type:r.headers.get('content-type')};},image.id);assert.equal(response.status,200);assert.equal(response.type,'image/png');
  await page.evaluate(async id=>{await window.orgFiles.update([id],{tags:['브랜딩','디자인'],favorite:true});},image.id);
  await page.reload();await page.waitForSelector('.file-card');await page.locator(`[data-id="${image.id}"]`).click();
  await page.locator('#listMode').click();assert.equal(await page.locator('.gallery.list').count(),1);await page.locator('#gridMode').click();
  await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../test-results/library.png')});
  // Verify trash and restore via public IPC and persisted restart.
  await page.evaluate(async id=>{await window.orgFiles.trash([id],false);},image.id);await page.reload();await page.waitForSelector('.file-card');assert.equal(await page.locator('.file-card').count(),5);await page.locator('[data-view="trash"]').click();assert.equal(await page.locator('.file-card').count(),1);await page.locator('.file-card').click();await page.locator('#trashFile').click();await page.waitForFunction(()=>document.querySelectorAll('.file-card').length===0);await page.locator('[data-view="all"]').click();assert.equal(await page.locator('.file-card').count(),6);
  await page.locator('[data-view="type:text"]').click();await page.locator('.file-card').filter({hasText:'안전 테스트'}).click();await page.locator('#showPreview').click();await page.waitForSelector('.document-text');assert.match(await page.locator('.document-text').textContent(),/<script>/);assert.equal(await page.evaluate(()=>window.INJECTED),undefined);
  assert.deepEqual(errors,[]);await desktop.close();desktop=null;
  desktop=await _electron.launch({args,cwd:path.join(__dirname,'..'),env:{...process.env,ORGFILES_LIBRARY:root,ORGFILES_TEST_MODE:'1'},timeout:30000});const again=await desktop.firstWindow();await again.waitForURL('orgapp://ui/');await again.waitForSelector('.file-card');assert.equal(await again.locator('.file-card').count(),6);assert.equal((await again.evaluate(()=>window.orgFiles.snapshot())).items.find(i=>i.ext==='png').favorite,true);
  console.log('PASS: Electron UI, Korean import, search, edit, document preview, custom protocol, executable blocking, inert HTML, trash/restore, restart persistence.');
 }finally{if(desktop)await desktop.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
