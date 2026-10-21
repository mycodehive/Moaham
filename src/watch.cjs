const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {watch}=require('node:fs');const {newLink,updateLink,identity,key,isInside,externalFile}=require('./linked.cjs');
const delay=()=>new Promise(r=>setImmediate(r));
const temporary=name=>/(?:\.crdownload|\.part|\.partial|\.download|\.tmp|\.temp|\.lnk|\.url|\.importing)$/i.test(name)||/^~\$/.test(name);
async function watchRoot(library,source){
 if(typeof source!=='string'||!path.isAbsolute(source))throw new Error('감시 폴더를 선택하세요.');const st=await fs.lstat(source);if(st.isSymbolicLink()||!st.isDirectory())throw new Error('일반 폴더를 선택하세요.');const real=await fs.realpath(source);
 if(isInside(library.root,real)||isInside(real,library.root))throw new Error('라이브러리와 겹치지 않는 감시 폴더를 선택하세요.');return real;
}
function makeTarget(library,config){let root=library.db.folders.find(f=>f.id===config.targetFolderId&&!f.watchId);if(!root){root=library.db.folders.find(f=>f.name==='임시폴더'&&!f.parentId&&!f.watchId);if(!root){root={id:crypto.randomUUID(),name:'임시폴더',parentId:null,favorite:false};library.db.folders.push(root);}config.targetFolderId=root.id;}return root;}
class WatchEngine{
 constructor({stableMs=1500,onDirty=()=>{}}={}){this.stableMs=stableMs;this.onDirty=onDirty;this.observations=new Map();this.native=null;this.nativeRoot='';this.timer=null;}
 stop(){this.native?.close();this.native=null;this.nativeRoot='';clearTimeout(this.timer);this.timer=null;}
 listen(config){
  const signature=config?.enabled?config.source+'|'+config.recursive:'';if(this.nativeRoot===signature&&this.native)return;
  this.stop();if(!signature)return;this.nativeRoot=signature;
  try{this.native=watch(config.source,{recursive:config.recursive},()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>this.onDirty(),1800);this.timer.unref();});this.native.on('error',()=>{this.native?.close();this.native=null;});}catch{}
 }
 ensure(library,source='',enabled=false){return library.run(async()=>{if(!library.db.watch){if(enabled){try{source=await watchRoot(library,source);}catch{}}library.db.watch={id:crypto.randomUUID(),enabled,source,recursive:true,targetFolderId:null,ignored:[],lastSync:null,lastError:''};if(enabled)makeTarget(library,library.db.watch);await library.save();}return structuredClone(library.db.watch);});}
 configure(library,value,disposition='keep'){return library.run(async()=>{
  if(!value||typeof value.enabled!=='boolean'||typeof value.recursive!=='boolean'||typeof value.source!=='string'||!['keep','remove'].includes(disposition))throw new Error('감시 설정을 확인하세요.');
  const old=library.db.watch||{id:crypto.randomUUID(),ignored:[]};let source=value.source;
  if(value.enabled||source)source=await watchRoot(library,source);
  if(value.targetFolderId&&!library.db.folders.some(f=>f.id===value.targetFolderId&&!f.watchId))throw new Error('자동 표시할 라이브러리 폴더를 확인하세요.');
  const before=structuredClone(library.db);const changedSource=old.source&&key(old.source)!==key(source);
  try{
   if(changedSource){
    const owned=new Set(library.db.folders.filter(f=>f.watchId===old.id).map(f=>f.id));
    if(disposition==='remove'){library.db.items=library.db.items.filter(i=>i.watchId!==old.id);library.db.folders=library.db.folders.filter(f=>!owned.has(f.id));library.db.items.forEach(i=>i.folderIds=i.folderIds.filter(id=>!owned.has(id)));}
    else{for(const item of library.db.items)if(item.watchId===old.id){delete item.watchId;delete item.watchRelative;}for(const folder of library.db.folders)if(folder.watchId===old.id){delete folder.watchId;delete folder.watchRelative;}}
   }
   const config={...old,...value,source,id:old.id,targetFolderId:value.targetFolderId||null,ignored:changedSource?[]:old.ignored||[],lastError:''};
   if(config.enabled)makeTarget(library,config);
   // Move only watcher-owned classifications; keep explicit user folders.
   if(config.targetFolderId!==old.targetFolderId){for(const folder of library.db.folders)if(folder.watchId===old.id&&folder.watchRelative&&!folder.watchRelative.includes(path.sep))folder.parentId=config.targetFolderId;
    for(const item of library.db.items)if(item.watchId===old.id&&!item.watchRelative?.includes(path.sep))item.folderIds=[...new Set(item.folderIds.filter(id=>id!==old.targetFolderId).concat(config.targetFolderId||[]))];}
   library.db.watch=config;await library.save();this.observations.clear();return structuredClone(config);
  }catch(e){library.db=before;throw e;}
 });}
 async sync(library,{now=Date.now()}={}){return library.run(async()=>{
  const check=library.authorize?.();const config=library.db.watch;if(!config?.enabled)return{changed:false,status:structuredClone(config||{})};
  let root;try{root=await watchRoot(library,config.source);if(key(root)!==key(config.source))throw new Error('감시 폴더 경로가 변경되었습니다. 폴더를 다시 선택하세요.');}catch(e){config.lastError=e.message+' 폴더 연결·권한을 확인한 뒤 다시 동기화하세요.';await library.save();return{changed:true,status:structuredClone(config)};}
  const entries=[],directories=[],unreadable=[],skipped=new Set();let count=0;
  const walk=async(dir,relative='',depth=0)=>{check?.();
   if(depth>40||entries.length>50000||directories.length>5000)throw new Error('감시 범위를 50,000개 파일·5,000개 폴더 이하로 줄여 주세요.');
   let names;try{names=await fs.readdir(dir);}catch(e){if(!relative)throw e;unreadable.push(dir);return;}
   for(const name of names){const file=path.join(dir,name),rel=path.join(relative,name);if(temporary(name))continue;
    let stat;try{stat=await fs.lstat(file);}catch(e){if(e.code!=='ENOENT')unreadable.push(file);continue;}
    if(stat.isSymbolicLink())continue;
    if(stat.isDirectory()){if(config.recursive){directories.push({relative:rel});await walk(file,rel,depth+1);}}
    else if(stat.isFile()){
     const previous=this.observations.get(key(file)),signature=stat.size+':'+stat.mtimeMs;this.observations.set(key(file),{signature,since:previous?.signature===signature?previous.since:now});
     if(this.stableMs&&(!previous||previous.signature!==signature||now-previous.since<this.stableMs)){skipped.add(key(file));continue;}
     if(!/^[a-z0-9_-]{0,20}$/.test(require('./formats.cjs').classify(file).ext)){unreadable.push(file);continue;}try{await externalFile(library,file,true);}catch(e){if(e.code!=='ENOENT')unreadable.push(file);continue;}entries.push({source:file,relative:rel,stat});
    }
    if(++count%50===0){await delay();check?.();}
   }
  };
  try{await walk(root);}catch(e){check?.();config.lastError=e.message;await library.save();return{changed:true,status:structuredClone(config)};}
  check?.();const before=structuredClone(library.db);let changed=false;
  try{
   const target=makeTarget(library,config);const folders=new Map([['',target.id]]);
   for(const directory of directories){let folder=library.db.folders.find(f=>f.watchId===config.id&&f.watchRelative===directory.relative);if(!folder){folder={id:crypto.randomUUID(),name:path.basename(directory.relative),parentId:folders.get(path.dirname(directory.relative)==='.'?'':path.dirname(directory.relative))||target.id,favorite:false,watchId:config.id,watchRelative:directory.relative};library.db.folders.push(folder);changed=true;}else{const parent=folders.get(path.dirname(directory.relative)==='.'?'':path.dirname(directory.relative))||target.id;if(folder.parentId!==parent){folder.parentId=parent;changed=true;}}folders.set(directory.relative,folder.id);}
   const prior=library.db.items.filter(i=>i.watchId===config.id),seen=new Set(),paths=new Map(prior.map(i=>[key(i.source),i])),ignored=new Set((config.ignored||[]).map(key));
   const currentPaths=new Set(entries.map(e=>key(e.source)));
   for(const entry of entries){if(ignored.has(key(entry.source)))continue;
    let item=paths.get(key(entry.source));if(!item){const ident=identity(entry.stat);item=ident?prior.find(i=>!seen.has(i.id)&&i.fileIdentity===ident&&!currentPaths.has(key(i.source))):null;}
    const folderId=folders.get(path.dirname(entry.relative)==='.'?'':path.dirname(entry.relative))||target.id;
    if(!item){item=newLink(entry.source);item.watchId=config.id;item.folderIds=[folderId];library.db.items.push(item);changed=true;}
    const oldFolder=item.watchRelative?folders.get(path.dirname(item.watchRelative)==='.'?'':path.dirname(item.watchRelative)):null;
    if(await updateLink(item,entry.source,entry.stat)){changed=true;await fs.unlink(path.join(library.root,'previews',item.id+'.png')).catch(()=>{});}
    if(!item.folderIds.includes(folderId)){item.folderIds=[...new Set(item.folderIds.filter(id=>id!==oldFolder).concat(folderId))];changed=true;}
    item.watchRelative=entry.relative;seen.add(item.id);if(++count%50===0){await delay();check?.();}
   }
   const retained=i=>seen.has(i.id)||skipped.has(key(i.source))||unreadable.some(dir=>isInside(dir,i.source));
   const removed=new Set(prior.filter(i=>!retained(i)).map(i=>i.id));if(removed.size){library.db.items=library.db.items.filter(i=>!removed.has(i.id));changed=true;}
   const folderPaths=new Set(directories.map(d=>d.relative));const removedFolders=new Set(library.db.folders.filter(f=>f.watchId===config.id&&!folderPaths.has(f.watchRelative)&&!unreadable.some(dir=>isInside(dir,path.join(root,f.watchRelative)))).map(f=>f.id));
   if(removedFolders.size){library.db.folders=library.db.folders.filter(f=>!removedFolders.has(f.id));library.db.items.forEach(i=>i.folderIds=i.folderIds.filter(id=>!removedFolders.has(id)));changed=true;}
   for(const file of [...this.observations.keys()])if(!currentPaths.has(file)&&!skipped.has(file))this.observations.delete(file);
   const oldError=config.lastError;config.lastError=unreadable.length?`${unreadable.length}개 경로에 접근할 수 없습니다. 권한을 확인하세요.`:'';config.lastSync=new Date(now).toISOString();
   check?.();await library.save();this.listen(config);if(skipped.size){clearTimeout(this.timer);this.timer=setTimeout(()=>this.onDirty(),Math.max(250,this.stableMs+100));this.timer.unref();}return{changed:changed||oldError!==config.lastError,status:structuredClone(config)};
  }catch(e){library.db=before;throw e;}
 });}
}
module.exports={WatchEngine,watchRoot,temporary};
