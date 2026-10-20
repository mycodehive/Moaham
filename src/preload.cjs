const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=name=>(...args)=>ipcRenderer.invoke('org:'+name,...args);
contextBridge.exposeInMainWorld('orgFiles',{
 snapshot:invoke('snapshot'),importDialog:invoke('importDialog'),importPaths:invoke('importPaths'),update:invoke('update'),trash:invoke('trash'),purge:invoke('purge'),folder:invoke('folder'),preview:invoke('preview'),open:invoke('open'),reveal:invoke('reveal'),export:invoke('export'),backup:invoke('backup'),library:invoke('library'),info:invoke('info'),
 droppedPaths:files=>Array.from(files).map(f=>webUtils.getPathForFile(f)).filter(Boolean),
 onProgress:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:progress',listener);return()=>ipcRenderer.removeListener('org:progress',listener);},
 onMenu:callback=>{const listener=(_,v)=>callback(v);ipcRenderer.on('org:menu',listener);return()=>ipcRenderer.removeListener('org:menu',listener);}
});
