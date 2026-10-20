const {app,BrowserWindow,ipcMain,dialog,shell,protocol,net,session,Menu,nativeImage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Library,inside}=require('./library.cjs');
const {previewType}=require('./formats.cjs');
const {AppAuth}=require('./auth.cjs');
const {profilePath,libraryPath}=require('./brand.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'orgapp',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}},{scheme:'orgasset',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let win,library,auth,initialRoot,busy=false,locking=false;
const thumbnails=new Map();
const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',svg:'image/svg+xml',avif:'image/avif',ico:'image/x-icon',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',flac:'audio/flac',aac:'audio/aac'};
const appCSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' orgasset: data:; media-src orgasset:; frame-src orgasset:; object-src orgasset:; connect-src 'self' orgasset:; base-uri 'none'; form-action 'none'";
function isTrusted(event){return !!win&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url.startsWith('orgapp://ui/');}
function handle(name,fn,allowLocked=false){ipcMain.handle('org:'+name,async(event,...args)=>{if(!isTrusted(event))throw new Error('허용되지 않은 요청입니다.');const epoch=auth.epoch;if(!allowLocked)requireUnlocked(epoch);const result=await fn(...args);if(!allowLocked)requireUnlocked(epoch);return result;});}
function requireUnlocked(epoch=auth.epoch){if(locking||auth.locked||epoch!==auth.epoch)throw new Error('앱 잠금 상태가 변경되었습니다. 잠금 해제 후 다시 시도하세요.');}
function bindLibrary(value){value.authorize=()=>{const epoch=auth.epoch;requireUnlocked(epoch);return()=>requireUnlocked(epoch);};return value;}
async function authorizedDialog(open){const epoch=auth.epoch;requireUnlocked(epoch);const result=await open();requireUnlocked(epoch);return result;}
async function directories(title){return authorizedDialog(()=>dialog.showOpenDialog(win,{title,properties:['openDirectory','createDirectory']}));}
async function remember(root){const file=path.join(app.getPath('userData'),'settings.json');await fs.writeFile(file+'.tmp',JSON.stringify({library:root}));await fs.rename(file+'.tmp',file);}
function guardBusy(){if(auth?.locked)throw new Error('앱 잠금을 먼저 해제하세요.');if(busy)throw new Error('진행 중인 작업이 끝난 후 다시 시도하세요.');}
async function importPaths(paths,folderId){guardBusy();busy=true;try{return await library.importPaths(paths,folderId,p=>win?.webContents.send('org:progress',p));}finally{busy=false;}}
async function openLibrary(create){guardBusy();const chosen=await directories(create?'새 보관함을 만들 빈 폴더 선택':'catalog.json이 있는 보관함 폴더 선택');if(chosen.canceled)return null;const root=chosen.filePaths[0];
 guardBusy();busy=true;try{if(create){const entries=await fs.readdir(root);if(entries.length)throw new Error('새 보관함은 빈 폴더를 선택하세요.');}else await fs.access(path.join(root,'catalog.json'));
 await library.queue;const next=bindLibrary(await new Library(root).init());await remember(root);library=next;thumbnails.clear();return library.snapshot();}finally{busy=false;}}
function installIPC(){
 handle('authStatus',()=>auth.status(),true);
 handle('authUnlock',async value=>{await auth.unlock(value);if(library)return auth.status();guardBusy();busy=true;try{library=bindLibrary(await new Library(initialRoot).init());}catch(e){if(auth.status().enabled)auth.lock();throw e;}finally{busy=false;}return auth.status();},true);
 handle('authConfigure',input=>auth.configure(input));
 handle('authLock',async()=>{guardBusy();if(locking)throw new Error('앱을 잠그는 중입니다.');locking=true;try{await library.queue;guardBusy();const status=await auth.run(()=>{guardBusy();return auth.lock();});win?.webContents.send('org:locked');await session.defaultSession.clearCache();return status;}finally{locking=false;}},true);
 handle('snapshot',()=>library.snapshot());
 handle('importDialog',async(folderId,folder)=>{const result=await authorizedDialog(()=>dialog.showOpenDialog(win,{title:folder?'폴더 가져오기':'파일 가져오기',properties:folder?['openDirectory','multiSelections']:['openFile','multiSelections']}));return result.canceled?null:importPaths(result.filePaths,folderId);});
 handle('importPaths',importPaths);
 handle('update',(ids,patch)=>library.update(ids,patch));handle('trash',(ids,restore)=>library.trash(ids,restore===true));
 handle('purge',async(ids)=>{if(!Array.isArray(ids)||!ids.length)throw new Error('파일을 선택하세요.');ids.forEach(id=>library.item(id));const answer=await authorizedDialog(()=>dialog.showMessageBox(win,{type:'warning',buttons:['취소','영구 삭제'],defaultId:0,cancelId:0,message:`선택한 ${ids.length}개 파일을 영구 삭제할까요?`,detail:'앱 보관함의 복사본이 삭제됩니다. 이 작업은 되돌릴 수 없습니다. 원본 파일은 유지됩니다.'}));return answer.response===1?library.purge(ids):null;});
 handle('folder',(action,payload)=>library.folder(action,payload));handle('preview',id=>library.preview(id));
 handle('open',async(id)=>{if(!library.canOpen(id))throw new Error('실행 파일·스크립트·바로가기는 앱에서 열 수 없습니다. 파일 내보내기를 이용하세요.');const error=await shell.openPath(library.filePath(id));if(error)throw new Error(error);return true;});
 handle('reveal',async(id)=>{const epoch=auth.epoch;const p=library.filePath(id);await fs.access(p);requireUnlocked(epoch);shell.showItemInFolder(p);return true;});
 handle('export',async(ids)=>{if(!Array.isArray(ids)||!ids.length)throw new Error('파일을 선택하세요.');ids.forEach(id=>library.item(id));const chosen=await directories('파일을 내보낼 폴더 선택');if(chosen.canceled)return null;guardBusy();busy=true;try{return await library.exportFiles(ids,chosen.filePaths[0]);}finally{busy=false;}});
 handle('backup',async()=>{guardBusy();const chosen=await directories('전체 백업을 저장할 폴더 선택');if(chosen.canceled)return null;busy=true;try{return await library.backup(chosen.filePaths[0]);}finally{busy=false;}});
 handle('library',openLibrary);handle('info',()=>({version:app.getVersion(),platform:process.platform}));
}
async function routes(){
 protocol.handle('orgapp',async request=>{const u=new URL(request.url);const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/assets/app-icon.png':'assets/app-icon.png'};const file=allowed[u.pathname];if(u.hostname!=='ui'||!file)return new Response('Not found',{status:404});const res=await net.fetch(pathToFileURL(path.join(__dirname,file)).toString());res.headers.set('Content-Security-Policy',appCSP);res.headers.set('X-Content-Type-Options','nosniff');return res;});
 protocol.handle('orgasset',async request=>{const epoch=auth.epoch;let response = await (async()=>{try{
  if(locking||auth.locked||!library)return new Response('',{status:403});
  const u=new URL(request.url);if(!['file','thumb'].includes(u.hostname)||u.search||u.hash||!/^\/[0-9a-f-]{36}$/.test(u.pathname))return new Response('',{status:404});
  const id=u.pathname.slice(1),item=library.item(id),file=library.filePath(id);
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||!inside(library.root,await fs.realpath(file)))return new Response('',{status:403});
  if(u.hostname==='thumb'){
   const cache=path.join(library.root,'previews',id+'.png');
   if(!thumbnails.has(id))thumbnails.set(id,(async()=>{try{await fs.access(cache);}catch{let img;try{img=await nativeImage.createThumbnailFromPath(file,{width:420,height:420});}catch{}if((!img||img.isEmpty())&&previewType(item.ext)==='image'&&item.ext!=='svg'){img=nativeImage.createFromPath(file);if(!img.isEmpty())img=img.resize({width:420});}if(!img||img.isEmpty())throw new Error('No thumbnail');await fs.writeFile(cache,img.toPNG());}return cache;})());
   const p=await thumbnails.get(id);const res=await net.fetch(pathToFileURL(p).toString());res.headers.set('Content-Type','image/png');return res;
  }
  if(!mime[item.ext])return new Response('',{status:415});
  const res=await net.fetch(pathToFileURL(file).toString(),{headers:request.headers});res.headers.set('Content-Type',mime[item.ext]);res.headers.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; sandbox");res.headers.set('X-Content-Type-Options','nosniff');return res;
 }catch{return new Response('',{status:404});}})();if(locking||auth.locked||epoch!==auth.epoch)response=new Response('',{status:403});response.headers.set('Cache-Control','no-store');response.headers.set('Access-Control-Allow-Origin','orgapp://ui');return response;});
}
function createWindow(){
 win=new BrowserWindow({width:1500,height:940,minWidth:1050,minHeight:650,title:'Moaham',backgroundColor:'#111318',icon:path.join(__dirname,'assets/app-icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,plugins:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('will-attach-webview',e=>e.preventDefault());
 win.on('close',e=>{if(busy){e.preventDefault();dialog.showMessageBox(win,{message:'파일 작업이 진행 중입니다. 완료 후 종료하세요.'});}});win.on('closed',()=>{win=null;});
 win.loadURL('orgapp://ui/');
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'파일',submenu:[{label:'파일 가져오기',accelerator:'CmdOrCtrl+O',click:()=>win.webContents.send('org:menu','import')},{type:'separator'},{role:'quit',label:'종료'}]},{label:'편집',submenu:[{role:'undo',label:'실행 취소'},{role:'redo',label:'다시 실행'},{type:'separator'},{role:'cut',label:'잘라내기'},{role:'copy',label:'복사'},{role:'paste',label:'붙여넣기'},{role:'selectAll',label:'모두 선택'}]},{label:'보기',submenu:[{role:'resetZoom',label:'확대 초기화'},{role:'zoomIn',label:'확대'},{role:'zoomOut',label:'축소'},{role:'togglefullscreen',label:'전체 화면'},{role:'toggleDevTools',label:'개발자 도구'}]}]));
}
app.setName('Moaham');
const isTest = !app.isPackaged && (process.env.MOAHAM_TEST_MODE||process.env.ORGFILES_TEST_MODE) === '1';
let profileError;
const testProfile=isTest&&(process.env.MOAHAM_TEST_USER_DATA||process.env.ORGFILES_TEST_USER_DATA);
try{app.setPath('userData',profilePath(app.getPath('appData'),testProfile));app.setPath('sessionData',app.getPath('userData'));}catch(e){profileError=e;}

if(profileError){app.whenReady().then(()=>{dialog.showErrorBox('Moaham 설정 오류',profileError.message);app.quit();});}else if(!isTest && !app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((wc,p,cb)=>cb(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  if(process.platform==='win32')app.setAppUserModelId('click.writeaday.moaham');
  const explicitLibrary=process.env.MOAHAM_LIBRARY||process.env.ORGFILES_LIBRARY;
  let root=libraryPath(app.getPath('documents'),explicitLibrary);
  if(!explicitLibrary){try{const settings=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'settings.json'),'utf8'));if(typeof settings.library==='string')root=settings.library;}catch{}}
  initialRoot=root;
  try{auth=await new AppAuth(path.join(app.getPath('userData'),'app-lock.json')).init();if(!auth.locked)library=bindLibrary(await new Library(root).init());}catch(e){dialog.showErrorBox('앱을 열 수 없습니다',e.message+'\n설정 위치: '+app.getPath('userData'));app.quit();return;}
  await routes();installIPC();createWindow();
 }).catch(e=>{dialog.showErrorBox('Moaham 시작 오류',e.message);app.quit();});
 let exiting=false;app.on('before-quit',event=>{if(!exiting&&(library||auth)){event.preventDefault();exiting=true;Promise.all([library?.queue,auth?.queue]).finally(()=>app.quit());}});
 app.on('window-all-closed',()=>app.quit());
}
