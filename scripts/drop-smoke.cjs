const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'moaham-drop-'));let desktop;
 try{
  const src=path.join(temp,'원본');await fs.mkdir(src);
  const image=path.join(src,'참고 이미지.PNG'),document=path.join(src,'계약 자료.PDF');
  await fs.copyFile(path.join(__dirname,'../build/icon.png'),image);await fs.writeFile(document,'%PDF-1.4\n% test document');
  const args=process.platform==='linux'?['--no-sandbox','--ozone-platform=headless','.']:['.'];
  desktop=await _electron.launch({args,cwd:path.join(__dirname,'..'),env:{...process.env,MOAHAM_LIBRARY:path.join(temp,'보관함'),MOAHAM_TEST_MODE:'1',MOAHAM_TEST_USER_DATA:path.join(temp,'설정')},timeout:30000});
  const page=await desktop.firstWindow();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='준비됨');
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});
  const cdp=await page.context().newCDPSession(page);
  async function drop(files,x=600,y=350){
   const data={items:[],files,dragOperationsMask:1};
   for(const type of ['dragEnter','dragOver','drop'])await cdp.send('Input.dispatchDragEvent',{type,x,y,data});
  }
  await page.locator('[data-view="type:document"]').click();
  await drop([image]);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('1개 가져옴'),null,{timeout:10000});
  let db=await page.evaluate(()=>window.moaham.snapshot());assert.equal(db.items.length,1);assert.equal(db.items[0].kind,'image');
  assert.equal(await page.locator('#typeNav .active').getAttribute('data-view'),'type:image');assert.equal(await page.locator('.file-card').count(),1);
  await drop([document]);await page.waitForFunction(()=>document.querySelector('#typeNav .active')?.dataset.view==='type:document');
  db=await page.evaluate(()=>window.moaham.snapshot());assert.equal(db.items.find(i=>i.ext==='pdf').kind,'document');assert.equal(await page.locator('.file-card').count(),1);
  await page.locator('#search').fill('검색결과없는문구');await page.waitForFunction(()=>document.querySelectorAll('.file-card').length===0);
  // A mixed batch, including duplicates, must remain visible rather than hidden by the old filter.
  await drop([image,document],100,220);await page.waitForFunction(()=>document.querySelector('#mainNav .active')?.dataset.view==='all');
  assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await page.locator('.file-card').count(),2);
  assert.equal((await page.evaluate(()=>window.moaham.snapshot())).items.length,2);
  assert.equal(await page.locator('#dropOverlay').isVisible(),false);
  // Folder drops recurse and classify each file; user folders remain explicit assignments.
  const nested=path.join(src,'여러 자료');await fs.mkdir(nested);
  await fs.writeFile(path.join(nested,'메모.md'),'폴더 드롭 본문');
  await fs.writeFile(path.join(nested,'예산.CSV'),'항목,금액\n테스트,100');
  await page.evaluate(()=>window.moaham.folder('create',{name:'프로젝트',parentId:null}));
  await page.reload();await page.waitForSelector('#folderNav [data-view]');
  const folder=(await page.evaluate(()=>window.moaham.snapshot())).folders[0];
  await page.locator('#folderNav [data-view]').click();await drop([nested]);
  await page.waitForFunction(()=>document.querySelectorAll('.file-card').length===2);
  db=await page.evaluate(()=>window.moaham.snapshot());
  for(const ext of ['md','csv'])assert.deepEqual(db.items.find(i=>i.ext===ext).folderIds,[folder.id]);
  assert.equal(db.items.find(i=>i.ext==='md').kind,'text');assert.equal(db.items.find(i=>i.ext==='csv').kind,'spreadsheet');
  // The file-picker route uses the same automatic type routing.
  const picked=path.join(src,'버튼으로 가져온 문서.pdf');await fs.writeFile(picked,'%PDF-1.4\n% picker');
  await desktop.evaluate(({dialog},file)=>{global.__openDialog=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},picked);
  await page.locator('[data-view="type:image"]').click();await page.locator('#import').click();
  await page.waitForFunction(()=>document.querySelector('#typeNav .active')?.dataset.view==='type:document');
  assert.equal(await page.locator('.file-card').count(),2);
  await desktop.evaluate(({dialog})=>{dialog.showOpenDialog=global.__openDialog;delete global.__openDialog;});
  // Locked native drop must not bypass the app's existing import authorization.
  await page.evaluate(()=>window.moaham.authConfigure({currentPassword:'',newPassword:'drop-test-password'}));
  await page.evaluate(()=>window.moaham.authLock());await page.waitForSelector('#lockScreen:not([hidden])');
  const denied=path.join(src,'잠금 중 자료.txt');await fs.writeFile(denied,'must not import');
  await drop([denied]);
  await page.locator('#unlockPassword').fill('drop-test-password');await page.locator('#unlockButton').click();await page.waitForSelector('.file-card');
  db=await page.evaluate(()=>window.moaham.snapshot());assert.equal(db.items.length,5);assert.ok(!db.items.some(i=>i.name==='잠금 중 자료.txt'));
  assert.deepEqual(errors,[]);
  assert.ok((await fs.stat(image)).size>0);assert.ok((await fs.stat(document)).size>0);
  console.log('PASS: real OS-path drag/drop via Chromium, cross-type classification and view routing, mixed duplicate batch, stale search clearing, recursive folder drop, explicit folders, picker routing, locked drop denial, originals retained.');
 }finally{if(desktop)await desktop.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
