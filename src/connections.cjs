const path=require('node:path'),crypto=require('node:crypto');
const {WatchEngine,watchRoot}=require('./watch.cjs');
const {key,isInside}=require('./linked.cjs');
const {localizedError}=require('./localized-error.cjs');
const {errorText}=require('./localized-error.cjs');
const ID=/^[0-9a-f-]{36}$/;
const safeRelative=value=>typeof value==='string'&&!path.isAbsolute(value)&&!value.split(/[\\/]/).includes('..');
function fail(key){throw localizedError('backend.connections.'+key);}
function validateConnections(db){
 db.connections??=[];if(!Array.isArray(db.connections)||db.connections.length>100)fail('invalid');const ids=new Set(db.watch?[db.watch.id]:[]);
 for(const c of db.connections){if(!c||!ID.test(c.id)||ids.has(c.id)||c.connection!==true||typeof c.name!=='string'||!c.name.trim()||c.name.length>100||typeof c.source!=='string'||!path.isAbsolute(c.source)||typeof c.enabled!=='boolean'||typeof c.recursive!=='boolean'||!Array.isArray(c.ignored)||c.ignored.some(p=>typeof p!=='string'||!path.isAbsolute(p))||(c.targetFolderId&&!ID.test(c.targetFolderId)))fail('invalid');ids.add(c.id);}
 for(const c of db.connections)if(!db.folders.some(f=>f.id===c.targetFolderId&&f.connectionId===c.id&&f.watchRelative===''))fail('invalid');
 for(const item of [...db.items,...db.folders])if(item.connectionId&&(!safeRelative(item.watchRelative)||!db.connections.some(c=>c.id===item.connectionId)||item.watchId!==item.connectionId||(item.storage&&item.storage!=='link')))fail('invalid');
 return db;
}
class Connections{
 constructor({onDirty=()=>{},stableMs=0,maxFiles=50000}={}){this.engines=new Map();this.onDirty=onDirty;this.stableMs=stableMs;this.maxFiles=maxFiles;this.root=null;}
 stop(){for(const e of this.engines.values())e.stop();this.engines.clear();this.root=null;}
 status(library){return(library.db.connections||[]).map(c=>({...structuredClone(c),lastError:errorText(c.lastErrorInfo,c.lastError)}));}
 async source(library,source,id){const real=await watchRoot(library,source);for(const c of [...(library.db.connections||[]),...(library.db.watch?.source?[library.db.watch]:[])]){if(c.id!==id&&(isInside(c.source,real)||isInside(real,c.source)))fail('overlap');}return real;}
 configure(library,action,value){const check=library.authorize?.();return library.run(async()=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['id','name','source','recursive','enabled'].includes(k)))fail('invalid');
  library.db.connections??=[];const old=library.db.connections.find(c=>c.id===value.id);if(action!=='create'&&!old)fail('missing');
  if(!['create','update','remove'].includes(action))fail('invalid');
  let next;if(action!=='remove'){
   if(action==='create'&&library.db.connections.length>=100)fail('limit');
   const name=value.name===undefined?old?.name:value.name,recursive=value.recursive===undefined?old?.recursive:value.recursive,enabled=value.enabled===undefined?(old?.enabled??true):value.enabled;
   if(typeof name!=='string'||!name.trim()||name.trim().length>100||/[\u0000-\u001f]/.test(name)||typeof recursive!=='boolean'||typeof enabled!=='boolean')fail('invalid');
   const source=value.source===undefined?old?.source:value.source;if(typeof source!=='string'||!path.isAbsolute(source))fail('invalid');
   const changed=!old||key(source)!==key(old.source);const real=changed?await this.source(library,source,old?.id):source;check?.();
   next={...(old||{id:crypto.randomUUID(),targetFolderId:null,ignored:[],lastSync:null,lastError:'',lastErrorInfo:null,status:'pending'}),connection:true,name:name.trim(),source:real,recursive,enabled};
   if(changed){next.ignored=[];next.status='pending';next.lastError='';next.lastErrorInfo=null;next.lastSync=null;}
  }
  check?.();const before=structuredClone(library.db);
  try{
   if(action==='remove'){
    const owned=new Set(library.db.folders.filter(f=>f.connectionId===old.id).map(f=>f.id));library.db.items=library.db.items.filter(i=>i.connectionId!==old.id);library.db.folders=library.db.folders.filter(f=>!owned.has(f.id));for(const i of library.db.items)i.folderIds=i.folderIds.filter(id=>!owned.has(id));library.db.connections=library.db.connections.filter(c=>c.id!==old.id);
   }else if(old){
    library.db.connections=library.db.connections.map(c=>c.id===old.id?next:c);const target=library.db.folders.find(f=>f.id===old.targetFolderId);if(target)target.name=next.name;
    if(key(next.source)!==key(old.source))for(const i of library.db.items.filter(i=>i.connectionId===old.id)){i.source=path.join(next.source,i.watchRelative);i.fileIdentity='';i.linkMtime=null;i.searchText='';i.linkError='';i.linkErrorInfo=null;}
   }else{
    const folder={id:crypto.randomUUID(),name:next.name,parentId:null,favorite:false,watchId:next.id,watchRelative:'',connectionId:next.id};next.targetFolderId=folder.id;library.db.folders.push(folder);library.db.connections.push(next);
   }
   await library.save();library.undoStack=[];
  }catch(e){library.db=before;throw e;}
  if(old){this.engines.get(old.id)?.stop();this.engines.delete(old.id);}return action==='remove'?null:structuredClone(next);
 });}
 async sync(library,id){
  if(this.root!==library.root){this.stop();this.root=library.root;}
  if(id&&!library.db.connections?.some(c=>c.id===id))fail('missing');let changed=false;
  const configs=(library.db.connections||[]).filter(c=>!id||c.id===id);for(const c of configs){if(!c.enabled&&!id){this.engines.get(c.id)?.stop();continue;}let e=this.engines.get(c.id);if(!e){e=new WatchEngine({connectionId:c.id,onDirty:this.onDirty,stableMs:this.stableMs,maxFiles:this.maxFiles});this.engines.set(c.id,e);}const result=await e.sync(library,{force:!!id});changed||=result.changed;}
  return{changed,connections:this.status(library)};
 }
}
module.exports={Connections,validateConnections};
