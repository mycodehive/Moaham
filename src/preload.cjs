const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=name=>(...args)=>ipcRenderer.invoke('org:'+name,...args);
contextBridge.exposeInMainWorld('moaham',{
 languageStatus:invoke('languageStatus'),languageSet:invoke('languageSet'),languagesRefresh:invoke('languagesRefresh'),
 onLanguageChanged:callback=>{const listener=(_,state)=>callback(state);ipcRenderer.on('org:languageChanged',listener);return()=>ipcRenderer.removeListener('org:languageChanged',listener);},
 importWatched:invoke('importWatched'),fileSettings:invoke('fileSettings'),importConfigure:invoke('importConfigure'),watchChoose:invoke('watchChoose'),watchConfigure:invoke('watchConfigure'),watchSync:invoke('watchSync'),relink:invoke('relink'),sourceLocation:invoke('sourceLocation'),
 onFilesChanged:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('org:filesChanged',listener);return()=>ipcRenderer.removeListener('org:filesChanged',listener);},onWatchError:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('org:watchError',listener);return()=>ipcRenderer.removeListener('org:watchError',listener);},
 updateStatus:invoke('updateStatus'),checkUpdates:invoke('checkUpdates'),downloadUpdate:invoke('downloadUpdate'),installUpdate:invoke('installUpdate'),
 onUpdateStatus:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:updateStatus',listener);return()=>ipcRenderer.removeListener('org:updateStatus',listener);},
 authStatus:invoke('authStatus'),authUnlock:invoke('authUnlock'),authConfigure:invoke('authConfigure'),authLock:invoke('authLock'),
 onLocked:callback=>{const listener=()=>callback();ipcRenderer.on('org:locked',listener);return()=>ipcRenderer.removeListener('org:locked',listener);},
 assignFolder:invoke('assignFolder'),savedSearch:invoke('savedSearch'),manageTag:invoke('manageTag'),undoText:invoke('undoText'),undoInfo:invoke('undoInfo'),undo:invoke('undo'),backupStatus:invoke('backupStatus'),backupChoose:invoke('backupChoose'),backupConfigure:invoke('backupConfigure'),backupNow:invoke('backupNow'),backupLatest:invoke('backupLatest'),
 onBackupStatus:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:backupStatus',listener);return()=>ipcRenderer.removeListener('org:backupStatus',listener);},
 theme:invoke('theme'),libraryLocation:invoke('libraryLocation'),snapshot:invoke('snapshot'),importDialog:invoke('importDialog'),importPaths:invoke('importPaths'),update:invoke('update'),trash:invoke('trash'),purge:invoke('purge'),folder:invoke('folder'),preview:invoke('preview'),open:invoke('open'),reveal:invoke('reveal'),export:invoke('export'),backup:invoke('backup'),library:invoke('library'),info:invoke('info'),
 // FileList loses its native entries when passed through contextBridge.
 // Read the real OS File objects here and expose only plain path strings.
 onDrop:callback=>{
  const listener=event=>{
   event.preventDefault();
   if(!event.dataTransfer?.files.length)return;
   try{
    const paths=[...new Set(Array.from(event.dataTransfer.files,file=>webUtils.getPathForFile(file)).filter(Boolean))];
    callback({paths,error:'',errorKey:paths.length?'':'backend.drop.pathUnavailable'});
   }catch{callback({paths:[],error:'',errorKey:'backend.drop.pathFailed'});}
  };
  document.addEventListener('drop',listener,true);
  return()=>document.removeEventListener('drop',listener,true);
 },
 onProgress:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:progress',listener);return()=>ipcRenderer.removeListener('org:progress',listener);},
 onMenu:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:menu',listener);return()=>ipcRenderer.removeListener('org:menu',listener);}
});
