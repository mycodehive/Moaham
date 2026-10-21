const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=name=>(...args)=>ipcRenderer.invoke('org:'+name,...args);
contextBridge.exposeInMainWorld('moaham',{
 updateStatus:invoke('updateStatus'),checkUpdates:invoke('checkUpdates'),downloadUpdate:invoke('downloadUpdate'),installUpdate:invoke('installUpdate'),
 onUpdateStatus:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:updateStatus',listener);return()=>ipcRenderer.removeListener('org:updateStatus',listener);},
 authStatus:invoke('authStatus'),authUnlock:invoke('authUnlock'),authConfigure:invoke('authConfigure'),authLock:invoke('authLock'),
 onLocked:callback=>{const listener=()=>callback();ipcRenderer.on('org:locked',listener);return()=>ipcRenderer.removeListener('org:locked',listener);},
 snapshot:invoke('snapshot'),importDialog:invoke('importDialog'),importPaths:invoke('importPaths'),update:invoke('update'),trash:invoke('trash'),purge:invoke('purge'),folder:invoke('folder'),preview:invoke('preview'),open:invoke('open'),reveal:invoke('reveal'),export:invoke('export'),backup:invoke('backup'),library:invoke('library'),info:invoke('info'),
 // FileList loses its native entries when passed through contextBridge.
 // Read the real OS File objects here and expose only plain path strings.
 onDrop:callback=>{
  const listener=event=>{
   event.preventDefault();
   if(!event.dataTransfer?.files.length)return;
   try{
    const paths=[...new Set(Array.from(event.dataTransfer.files,file=>webUtils.getPathForFile(file)).filter(Boolean))];
    callback({paths,error:paths.length?'':'파일 경로를 읽을 수 없습니다. 탐색기에서 파일을 끌어오거나 파일 가져오기를 사용하세요.'});
   }catch{callback({paths:[],error:'파일 경로를 읽지 못했습니다. 파일 가져오기를 사용해 주세요.'});}
  };
  document.addEventListener('drop',listener,true);
  return()=>document.removeEventListener('drop',listener,true);
 },
 onProgress:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:progress',listener);return()=>ipcRenderer.removeListener('org:progress',listener);},
 onMenu:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:menu',listener);return()=>ipcRenderer.removeListener('org:menu',listener);}
});
