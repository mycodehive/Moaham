const {localizedError,errorInfo,errorText}=require('./localized-error.cjs');
const {t}=require('./i18n.cjs');
const {LanguageService}=require('./language.cjs');
const {app,BrowserWindow,ipcMain,dialog,shell,protocol,net,session,Menu,nativeImage,nativeTheme}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Library,inside}=require('./library.cjs');
const {previewType}=require('./formats.cjs');
const {AppAuth}=require('./auth.cjs');
const {profilePath,libraryPath}=require('./brand.cjs');
const {AppUpdates}=require('./updates.cjs');
const {BackupSchedule}=require('./backup.cjs');
const {WatchEngine,watchRoot}=require('./watch.cjs');
const {ImportSettings}=require('./import-settings.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'orgapp',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}},{scheme:'orgasset',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let languages,watchEngine,importSettings,watchRunning=false,schedules,win,library,auth,initialRoot,updates,busy=false,locking=false,installing=false;
const thumbnails=new Map();
const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',svg:'image/svg+xml',avif:'image/avif',ico:'image/x-icon',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',flac:'audio/flac',aac:'audio/aac'};
const appCSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' orgasset: data:; media-src orgasset:; frame-src orgasset:; object-src orgasset:; connect-src 'self' orgasset:; base-uri 'none'; form-action 'none'";
function isTrusted(event){return !!win&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url.startsWith('orgapp://ui/');}
function handle(name,fn,allowLocked=false){ipcMain.handle('org:'+name,async(event,...args)=>{if(!isTrusted(event))throw localizedError("backend.request.denied");if(installing&&!allowLocked)throw localizedError("backend.update.installing");const epoch=auth.epoch;if(!allowLocked)requireUnlocked(epoch);const result=await fn(...args);if(!allowLocked)requireUnlocked(epoch);return result;});}
function requireUnlocked(epoch=auth.epoch){if(locking||auth.locked||epoch!==auth.epoch)throw localizedError("backend.auth.changed");}
function bindLibrary(value){value.authorize=()=>{if(installing)throw localizedError("backend.update.installing");const epoch=auth.epoch;requireUnlocked(epoch);return()=>requireUnlocked(epoch);};return value;}
async function authorizedDialog(open){const epoch=auth.epoch;requireUnlocked(epoch);const result=await open();requireUnlocked(epoch);if(installing)throw localizedError("backend.update.installing");return result;}
async function directories(title){return authorizedDialog(()=>dialog.showOpenDialog(win,{title,properties:['openDirectory','createDirectory']}));}
async function remember(root){const file=path.join(app.getPath('userData'),'settings.json');await fs.writeFile(file+'.tmp',JSON.stringify({library:root}));await fs.rename(file+'.tmp',file);}
function guardBusy(){if(installing)throw localizedError("backend.update.installing");if(auth?.locked)throw localizedError("backend.auth.unlockFirst");if(busy)throw localizedError("backend.operation.busy");}
async function importPaths(paths,folderId,options){guardBusy();busy=true;try{return await library.importPaths(paths,folderId,p=>win?.webContents.send('org:progress',p),options||importSettings.status());}finally{busy=false;}}
// Watched files are originals. Explicit import creates independent managed
// copies and never gives those copies a source-folder classification.
async function importWatched(ids,options={}){
 guardBusy();const epoch=auth.epoch;busy=true;
 try{
  if(!Array.isArray(ids)||!ids.length||ids.length>10000||new Set(ids).size!==ids.length)throw localizedError('backend.watch.invalidImportSelection');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='duplicates')||(options.duplicates!==undefined&&!['content','keep','name'].includes(options.duplicates)))throw localizedError('backend.import.invalidDuplicates');
  await library.queue;requireUnlocked(epoch);const paths=[];
  for(const id of ids){const item=library.item(id);if(item.storage!=='link'||(!item.sourceOnly&&(!item.watchId||item.watchId!==library.db.watch?.id)))throw localizedError('backend.watch.importOwnedOnly');if(item.deletedAt)throw localizedError('backend.file.restoreFirst');paths.push(await library.resolveFile(id));requireUnlocked(epoch);}
  return await library.importPaths(paths,null,p=>win?.webContents.send('org:progress',p),{mode:'copy',duplicates:options.duplicates||importSettings.status().duplicates});
 }finally{busy=false;}
}
async function openLibrary(create){guardBusy();const chosen=await directories(create?t("backend.library.chooseNew"):t("backend.library.chooseExisting"));if(chosen.canceled)return null;const root=chosen.filePaths[0];
 guardBusy();busy=true;try{if(create){const entries=await fs.readdir(root);if(entries.length)throw localizedError("backend.library.emptyRequired");}else await fs.access(path.join(root,'catalog.json'));
 await library.queue;const next=bindLibrary(await new Library(root).init());await remember(root);library=next;watchEngine.stop();await ensureWatch(library);thumbnails.clear();return library.snapshot();}finally{busy=false;}}
async function ensureWatch(value){return watchEngine.ensure(value,isTest?(process.env.MOAHAM_TEST_DOWNLOADS||''):app.getPath('downloads'),!isTest||!!process.env.MOAHAM_TEST_DOWNLOADS);}
async function runWatch(){
 if(!library||auth.locked||locking||installing||busy||watchRunning)return;
 watchRunning=true;const current=library;
 try{await ensureWatch(current);const result=await watchEngine.sync(current);const linksChanged=await current.refreshLinks();if(current===library&&(result.changed||linksChanged)){thumbnails.clear();if(!auth.locked&&!locking)win?.webContents.send('org:filesChanged',result.status);}}
 catch(e){if(!auth.locked&&!locking)win?.webContents.send('org:watchError',e.message);}finally{watchRunning=false;}
}
module.exports.runWatch=runWatch;
module.exports.scheduledBackup=scheduledBackup;
function installUpdates(){
 const enabled=app.isPackaged&&process.platform==='win32';
 const updater=enabled?require('electron-updater').autoUpdater:null;
 updates=new AppUpdates(updater,{version:app.getVersion(),enabled,onChange:status=>{if(!auth.locked&&!locking)win?.webContents.send('org:updateStatus',status);},onError:()=>{installing=false;}});
 // Exposed only as a main-process module export for the installed-app CI harness.
 module.exports.updates=updates;
 const check=()=>{if(win&&!auth.locked&&!locking&&!busy&&!installing)updates.check();};
 if(enabled){const start=setTimeout(check,10000);start.unref();const timer=setInterval(check,4*60*60*1000);timer.unref();app.once('before-quit',()=>{clearTimeout(start);clearInterval(timer);});}
}
async function scheduledBackup(force=false){
 if(!library||auth.locked||locking||busy||installing||schedules.running)return;
 if(!force&&!schedules.due(library.root))return;
 busy=true;try{const result=await schedules.backup(library);win?.webContents.send('org:backupStatus',result);return result;}catch(e){win?.webContents.send('org:backupStatus',schedules.status(library.root));if(force)throw e;}finally{busy=false;}
}
function installIPC(){
 handle('languageStatus',()=>languages.status(),true);
 handle('languageSet',code=>languages.set(code),true);
 handle('languagesRefresh',()=>languages.refresh(),true);
 handle('fileSettings',async()=>({imports:importSettings.status(),watch:await ensureWatch(library)}));
 handle('importConfigure',value=>importSettings.save(value));
 handle('importWatched',importWatched);
 handle('watchChoose',async()=>{const picked=await directories(t("backend.watch.chooseSource"));if(picked.canceled)return null;return watchRoot(library,picked.filePaths[0]);});
 handle('watchConfigure',async value=>{guardBusy();const old=await ensureWatch(library);let disposition='keep';
  if(old.source&&value?.source&&old.source!==value.source){const answer=await authorizedDialog(()=>dialog.showMessageBox(win,{type:'question',buttons:[t("backend.action.cancel"),t("backend.watch.keepLinks"),t("backend.watch.removeLinks")],defaultId:1,cancelId:0,message:t("backend.watch.confirmChange"),detail:t("backend.watch.changeDetails")}));if(answer.response===0)return null;disposition=answer.response===2?'remove':'keep';}
  requireUnlocked();const result=await watchEngine.configure(library,value,disposition);watchEngine.listen(result);setImmediate(()=>runWatch());return result;
 });
 handle('watchSync',async()=>{await runWatch();return ensureWatch(library);});
 handle('sourceLocation',async id=>{const epoch=auth.epoch;const item=library.item(id);if(item.storage!=='link')throw localizedError("backend.link.choose");const folder=path.dirname(item.source);await fs.access(folder);requireUnlocked(epoch);const error=await shell.openPath(folder);if(error)throw new Error(error);return true;});
 handle('relink',async id=>{const item=library.item(id);if(item.storage!=='link'||item.watchId)throw localizedError("backend.link.chooseManual");const picked=await authorizedDialog(()=>dialog.showOpenDialog(win,{title:t("backend.link.reconnectTitle"),properties:['openFile']}));if(picked.canceled)return null;const result=await library.relink(id,picked.filePaths[0]);thumbnails.clear();return result;});

 handle('assignFolder',(ids,id,move)=>library.assignFolder(ids,id,move));
 handle('savedSearch',(action,payload)=>library.savedSearch(action,payload));
 handle('manageTag',(action,payload)=>library.manageTag(action,payload,importSettings.status().mode));
 handle('noteRead',id=>library.noteRead(id,importSettings.status().mode));
 handle('noteSave',async value=>{guardBusy();busy=true;try{return await library.noteSave(value);}finally{busy=false;}});
 handle('noteCategory',(action,value)=>library.noteCategory(action,value));
 handle('noteMove',(ids,id)=>library.noteMove(ids,id));
 handle('textCardDrop',async(ids,target,action)=>{guardBusy();busy=true;try{return await library.textCardDrop(ids,target,action,importSettings.status().mode);}finally{busy=false;}});
 handle('undoText',()=>{win.webContents.undo();return true;});
 handle('undoInfo',()=>library.undoInfo());handle('undo',()=>library.undo());
 handle('backupStatus',()=>schedules.status(library.root));
 handle('backupChoose',async()=>{const picked=await directories(t("backend.backup.chooseScheduled"));if(picked.canceled)return null;const destination=await fs.realpath(picked.filePaths[0]);if(inside(library.root,destination))throw localizedError("backend.library.separateFolder");return destination;});
 handle('backupConfigure',async value=>{guardBusy();const result=await schedules.configure(library.root,value);return result;});
 handle('backupNow',async()=>{guardBusy();return scheduledBackup(true);});
 handle('backupLatest',async()=>{const epoch=auth.epoch;const s=schedules.status(library.root);if(!s.lastPath)throw localizedError("backend.backup.none");await fs.access(path.join(s.lastPath,'catalog.json'));requireUnlocked(epoch);const error=await shell.openPath(s.lastPath);if(error)throw new Error(error);return true;});

 handle('theme',(value)=>{if(!value||!['light','dark'].includes(value.mode)||!/^#[a-f0-9]{6}$/i.test(value.background||''))throw localizedError("backend.appearance.invalid");nativeTheme.themeSource=value.mode;win?.setBackgroundColor(value.background);return true;},true);
 handle('updateStatus',()=>updates.status());
 handle('checkUpdates',()=>updates.check());
 handle('downloadUpdate',async()=>{
  guardBusy();if(updates.status().state!=='available')throw localizedError("backend.update.checkFirst");
  const answer=await authorizedDialog(()=>dialog.showMessageBox(win,{type:'info',buttons:[t("backend.action.later"),t("backend.action.download")],defaultId:1,cancelId:0,message:t('backend.update.available',{version:updates.status().version}),detail:t("backend.update.downloadDetails")}));
  requireUnlocked();guardBusy();if(answer.response!==1)return updates.status();
  // Download in background; no install or app quit without the second confirmation.
  updates.download().catch(()=>{});return updates.status();
 });
 handle('installUpdate',async()=>{
  requireUnlocked();guardBusy();if(updates.status().state!=='downloaded')throw localizedError("backend.update.downloadFirst");
  const answer=await authorizedDialog(()=>dialog.showMessageBox(win,{type:'question',buttons:[t("backend.action.later"),t("backend.update.restartInstall")],defaultId:0,cancelId:0,message:t("backend.update.installConfirm"),detail:t("backend.update.installDetails")}));
  requireUnlocked();guardBusy();if(answer.response!==1)return updates.status();
  installing=true;
  try{await Promise.all([library.queue,auth.queue]);setImmediate(()=>updates.install());}catch(e){installing=false;throw e;}
  return {state:'installing'};
 },true);
 handle('authStatus',()=>auth.status(),true);
 handle('authUnlock',async value=>{await auth.unlock(value);const retry=setTimeout(()=>{if(!auth.locked&&!busy&&!installing)updates.check();},1000);retry.unref();if(library){setImmediate(()=>runWatch());return auth.status();}guardBusy();busy=true;try{library=bindLibrary(await new Library(initialRoot).init());}catch(e){if(auth.status().enabled)auth.lock();throw e;}finally{busy=false;}await ensureWatch(library);setImmediate(()=>runWatch());return auth.status();},true);
 handle('authConfigure',input=>auth.configure(input));
 handle('authLock',async()=>{guardBusy();if(locking)throw localizedError("backend.auth.locking");locking=true;try{await library.queue;guardBusy();const status=await auth.run(()=>{guardBusy();return auth.lock();});watchEngine.stop();win?.webContents.send('org:locked');await session.defaultSession.clearCache();return status;}finally{locking=false;}},true);
 handle('snapshot',async()=>{if(await library.refreshLinks())thumbnails.clear();return library.snapshot();});
 handle('importDialog',async(folderId,folder,options)=>{const result=await authorizedDialog(()=>dialog.showOpenDialog(win,{title:folder?t("backend.action.importFolder"):t("backend.action.importFiles"),properties:folder?['openDirectory','multiSelections']:['openFile','multiSelections']}));return result.canceled?null:importPaths(result.filePaths,folderId,options);});
 handle('importPaths',importPaths);
 handle('update',(ids,patch)=>library.update(ids,patch));handle('trash',(ids,restore)=>library.trash(ids,restore===true));
 handle('purge',async(ids)=>{if(!Array.isArray(ids)||!ids.length)throw localizedError("backend.file.choose");ids.forEach(id=>library.item(id));const answer=await authorizedDialog(()=>dialog.showMessageBox(win,{type:'warning',buttons:[t("backend.action.cancel"),t("backend.action.purge")],defaultId:0,cancelId:0,message:t('backend.file.purgeConfirm',{count:ids.length}),detail:t("backend.file.purgeDetails")}));return answer.response===1?library.purge(ids):null;});
 handle('folder',(action,payload)=>library.folder(action,payload));handle('preview',async id=>{if(library.item(id).storage==='link'&&await library.refreshLinks())thumbnails.clear();return library.preview(id);});
 handle('open',async(id)=>{if(!library.canOpen(id))throw localizedError("backend.file.executionBlocked");const epoch=auth.epoch;const file=await library.resolveFile(id);requireUnlocked(epoch);const error=await shell.openPath(file);if(error)throw new Error(error);return true;});
 handle('reveal',async(id)=>{const epoch=auth.epoch;const p=await library.resolveFile(id);requireUnlocked(epoch);shell.showItemInFolder(p);return true;});
 handle('export',async(ids)=>{if(!Array.isArray(ids)||!ids.length)throw localizedError("backend.file.choose");ids.forEach(id=>library.item(id));const chosen=await directories(t("backend.export.choose"));if(chosen.canceled)return null;guardBusy();busy=true;try{return await library.exportFiles(ids,chosen.filePaths[0]);}finally{busy=false;}});
 handle('backup',async()=>{guardBusy();const chosen=await directories(t("backend.backup.choose"));if(chosen.canceled)return null;busy=true;try{return await library.backup(chosen.filePaths[0]);}finally{busy=false;}});
 handle('libraryLocation',async()=>{const epoch=auth.epoch;await fs.access(library.root);requireUnlocked(epoch);const error=await shell.openPath(library.root);if(error)throw new Error(error);return true;});
 handle('library',openLibrary);handle('info',()=>({version:app.getVersion(),platform:process.platform}));
}
async function routes(){
 protocol.handle('orgapp',async request=>{const u=new URL(request.url);const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/notes.js':'notes.js','/preferences.js':'preferences.js','/productivity.js':'productivity.js','/file-management.js':'file-management.js','/i18n.js':'i18n.js','/i18n-ui.js':'i18n-ui.js','/library-scope.js':'library-scope.js','/query.js':'query.js','/icons.js':'icons.js','/styles.css':'styles.css','/assets/app-icon.png':'assets/app-icon.png'};const file=allowed[u.pathname];if(u.hostname!=='ui'||!file)return new Response('Not found',{status:404});const res=await net.fetch(pathToFileURL(path.join(__dirname,file)).toString());res.headers.set('Content-Security-Policy',appCSP);res.headers.set('X-Content-Type-Options','nosniff');return res;});
 protocol.handle('orgasset',async request=>{const epoch=auth.epoch;let response = await (async()=>{try{
  if(locking||auth.locked||!library)return new Response('',{status:403});
  const u=new URL(request.url);if(!['file','thumb'].includes(u.hostname)||u.search||u.hash||!/^\/[0-9a-f-]{36}$/.test(u.pathname))return new Response('',{status:404});
  const id=u.pathname.slice(1),item=library.item(id),file=await library.resolveFile(id);
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
 win.on('close',e=>{if(busy){e.preventDefault();dialog.showMessageBox(win,{message:t("backend.operation.closeBusy")});}});win.on('closed',()=>{win=null;});
 win.loadURL('orgapp://ui/');
 installApplicationMenu();
}
function installApplicationMenu(){
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:t("backend.menu.file"),submenu:[{label:t("backend.action.importFiles"),accelerator:'CmdOrCtrl+O',click:()=>win.webContents.send('org:menu','import')},{type:'separator'},{role:'quit',label:t("backend.menu.quit")}]},{label:t("backend.menu.edit"),submenu:[{label:t("backend.menu.undo"),accelerator:'CmdOrCtrl+Z',click:()=>win.webContents.send('org:menu','undo')},{role:'undo',label:t("backend.menu.inputUndo"),accelerator:'CmdOrCtrl+Alt+Z'},{role:'redo',label:t("backend.menu.redo")},{type:'separator'},{role:'cut',label:t("backend.menu.cut")},{role:'copy',label:t("backend.menu.copy")},{role:'paste',label:t("backend.menu.paste")},{role:'selectAll',label:t("backend.menu.selectAll")}]},{label:t("backend.menu.view"),submenu:[{role:'resetZoom',label:t("backend.menu.resetZoom")},{role:'zoomIn',label:t("backend.menu.zoomIn")},{role:'zoomOut',label:t("backend.menu.zoomOut")},{role:'togglefullscreen',label:t("backend.menu.fullScreen")},{role:'toggleDevTools',label:t("backend.menu.developerTools")}]},{label:t("backend.menu.help"),submenu:[{label:t("backend.menu.checkUpdates"),click:()=>{if(auth.locked||locking)return;win.webContents.send('org:menu','updates');}}]}]));
}
async function initializeLanguages(){
 const directory=isTest&&process.env.MOAHAM_TEST_LANGUAGES?process.env.MOAHAM_TEST_LANGUAGES:path.join(app.isPackaged?path.dirname(process.execPath):app.getAppPath(),'languages');
 languages=await new LanguageService({directory,settingsFile:path.join(app.getPath('userData'),'language-settings.json'),osLocale:isTest?(process.env.MOAHAM_TEST_LOCALE||'ko'):app.getLocale(),onChanged:state=>{if(win){installApplicationMenu();win.webContents.send('org:languageChanged',state);}}}).init();
}
app.setName('Moaham');
const isTest = !app.isPackaged && (process.env.MOAHAM_TEST_MODE||process.env.ORGFILES_TEST_MODE) === '1';
let profileError;
const testProfile=isTest&&(process.env.MOAHAM_TEST_USER_DATA||process.env.ORGFILES_TEST_USER_DATA);
try{app.setPath('userData',profilePath(app.getPath('appData'),testProfile));app.setPath('sessionData',app.getPath('userData'));}catch(e){profileError=e;}

if(profileError){app.whenReady().then(async()=>{await initializeLanguages();dialog.showErrorBox(t("backend.startup.settingsError"),errorText(errorInfo(profileError),profileError.message));app.quit();});}else if(!isTest && !app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(async()=>{
  await initializeLanguages();
  session.defaultSession.setPermissionRequestHandler((wc,p,cb)=>cb(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  if(process.platform==='win32')app.setAppUserModelId('click.writeaday.moaham');
  const explicitLibrary=process.env.MOAHAM_LIBRARY||process.env.ORGFILES_LIBRARY;
  let root=libraryPath(app.getPath('documents'),explicitLibrary);
  if(!explicitLibrary){try{const settings=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'settings.json'),'utf8'));if(typeof settings.library==='string')root=settings.library;}catch{}}
  initialRoot=root;watchEngine=new WatchEngine({onDirty:()=>runWatch()});importSettings=await new ImportSettings(path.join(app.getPath('userData'),'import-settings.json')).init();
  try{auth=await new AppAuth(path.join(app.getPath('userData'),'app-lock.json')).init();if(!auth.locked)library=bindLibrary(await new Library(root).init());}catch(e){dialog.showErrorBox(t("backend.startup.openError"),t('backend.startup.location',{error:e.message,path:app.getPath('userData')}));app.quit();return;}
  schedules=await new BackupSchedule(path.join(app.getPath('userData'),'backup-settings.json')).init();
  if(library)await ensureWatch(library);
  await routes();installUpdates();installIPC();createWindow();
  const watchStart=setTimeout(()=>runWatch(),1500);watchStart.unref();const watchTimer=setInterval(()=>runWatch(),30000);watchTimer.unref();app.once('before-quit',()=>{languages?.stop();clearTimeout(watchStart);clearInterval(watchTimer);watchEngine.stop();});
  const backupStart=setTimeout(()=>scheduledBackup(),10000);backupStart.unref();const backupTimer=setInterval(()=>scheduledBackup(),60000);backupTimer.unref();app.once('before-quit',()=>{clearTimeout(backupStart);clearInterval(backupTimer);});
 }).catch(e=>{dialog.showErrorBox(t("backend.startup.error"),e.message);app.quit();});
 let exiting=false;app.on('before-quit',event=>{if(!exiting&&(library||auth)){event.preventDefault();exiting=true;Promise.all([library?.queue,auth?.queue,schedules?.queue,importSettings?.queue,languages?.queue]).finally(()=>app.quit());}});
 app.on('window-all-closed',()=>app.quit());
}
