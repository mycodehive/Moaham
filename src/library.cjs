const {localizedError,errorInfo,errorText}=require('./localized-error.cjs');
const {t}=require('./i18n.cjs');
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const {pipeline} = require('node:stream/promises');
const {createWriteStream} = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const {classify,previewType,blocked} = require('./formats.cjs');
const {extract}=require('./extract.cjs');
const ID=/^[0-9a-f-]{36}$/;
function inside(root,target){const r=path.relative(root,target);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));}
function cleanText(v,max=2000){if(typeof v!=='string')throw localizedError("backend.validation.text");return v.trim().slice(0,max);}
async function hashFile(p){const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(p))hash.update(chunk);return hash.digest('hex');}
function validateCatalog(db){
 if(!db||db.version!==1||!Array.isArray(db.items)||!Array.isArray(db.folders))throw localizedError("backend.library.unsupported");
 const ids=new Set();for(const i of db.items){if(i.storage===undefined)i.storage='copy';if(!['copy','link'].includes(i.storage)||(i.storage==='link'&&(typeof i.source!=='string'||!path.isAbsolute(i.source))))throw localizedError("backend.library.storageCorrupt");if(!ID.test(i.id)||ids.has(i.id)||typeof i.name!=='string'||!['string'].includes(typeof i.ext)||!/^[a-z0-9_-]{0,20}$/.test(i.ext)||!Array.isArray(i.tags)||!Array.isArray(i.folderIds)||!/^[a-f0-9]{64}$/.test(i.hash)||!Number.isFinite(i.size))throw localizedError("backend.library.itemCorrupt");ids.add(i.id);}
 const fids=new Set();for(const f of db.folders){if(!ID.test(f.id)||fids.has(f.id)||typeof f.name!=='string'||(f.parentId&&!ID.test(f.parentId))||(f.favorite!==undefined&&typeof f.favorite!=='boolean'))throw localizedError("backend.library.folderCorrupt");fids.add(f.id);}
 if(db.watch){const w=db.watch;if(!ID.test(w.id)||typeof w.enabled!=='boolean'||typeof w.recursive!=='boolean'||typeof w.source!=='string'||(w.source&&!path.isAbsolute(w.source))||(w.targetFolderId&&!ID.test(w.targetFolderId))||!Array.isArray(w.ignored)||w.ignored.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw localizedError("backend.library.watchCorrupt");}
 db.folders.forEach(f=>{if(f.favorite===undefined)f.favorite=false;});
 db.savedSearches??=[];db.tagStyles??=[];
 if(!Array.isArray(db.savedSearches)||!Array.isArray(db.tagStyles))throw localizedError("backend.library.classificationCorrupt");
 for(const saved of db.savedSearches){if(!ID.test(saved.id)||typeof saved.name!=='string'||!saved.name.trim())throw localizedError("backend.library.smartCorrupt");saved.rules=require('./query.js').normalize(saved.rules);}
 for(const style of db.tagStyles)if(typeof style.name!=='string'||!/^#[a-f0-9]{6}$/i.test(style.color||''))throw localizedError("backend.library.tagColorCorrupt");
 require('./notes.cjs').validateNotes(db);require('./connections.cjs').validateConnections(db);
 return db;
}
class Library{
 constructor(root){this.root=path.resolve(root);this.db=null;this.queue=Promise.resolve();this.recovery=false;}
 async init(){await fs.mkdir(path.join(this.root,'files'),{recursive:true});await fs.mkdir(path.join(this.root,'previews'),{recursive:true});this.root=await fs.realpath(this.root);
  try{this.db=validateCatalog(JSON.parse(await fs.readFile(path.join(this.root,'catalog.json'),'utf8')));}
  catch(e){if(e.code==='ENOENT'){const files=await fs.readdir(path.join(this.root,'files'));if(files.length)throw localizedError("backend.library.catalogMissing");this.db={version:1,items:[],folders:[],savedSearches:[],tagStyles:[],noteCategories:[],connections:[]};await this.save();}else{try{this.db=validateCatalog(JSON.parse(await fs.readFile(path.join(this.root,'catalog.previous.json'),'utf8')));this.recovery=true;}catch{throw localizedError("backend.library.catalogUnreadable");}}}
  return this;
 }
 run(fn){const check=this.authorize?.();const job=this.queue.then(()=>{check?.();return fn();});this.queue=job.catch(()=>{});return job;}
 async save(){
  const target=path.join(this.root,'catalog.json'), temp=path.join(this.root,`catalog-${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(temp,'wx');try{await handle.writeFile(JSON.stringify(this.db,null,2));await handle.sync();}finally{await handle.close();}
  if(!this.recovery){try{await fs.copyFile(target,path.join(this.root,'catalog.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}}
  await fs.rename(temp,target);this.recovery=false;
 }
 snapshot(){const db=structuredClone(this.db);for(const item of db.items){item.previewError=errorText(item.previewErrorInfo,item.previewError);if(item.linkError)item.linkError=errorText(item.linkErrorInfo,item.linkError);}for(const c of db.connections||[])c.lastError=errorText(c.lastErrorInfo,c.lastError);if(db.watch)db.watch.lastError=errorText(db.watch.lastErrorInfo,db.watch.lastError);return {...db,root:this.root,recovery:this.recovery};}
 item(id){if(typeof id!=='string'||!ID.test(id))throw localizedError("backend.file.invalidId");const i=this.db.items.find(i=>i.id===id);if(!i)throw localizedError("backend.file.notFound");return i;}
 filePath(id){const i=this.item(id);return i.storage==='link'?i.source:path.join(this.root,'files',i.id+(i.ext?'.'+i.ext:''));}
 async importPaths(paths,folderId,onProgress=()=>{},options={}){if(options.mode==='link')return this.linkPaths(paths,folderId,onProgress);if(options.mode&&options.mode!=='copy')throw localizedError("backend.import.invalidMode");if(options.duplicates&&!['content','keep','name'].includes(options.duplicates))throw localizedError("backend.import.invalidDuplicates");return this.run(async()=>{
  if(!Array.isArray(paths)||paths.length>10000||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw localizedError("backend.import.invalidPath");
  if(folderId&&this.db.folders.some(f=>f.id===folderId&&f.connectionId))throw localizedError('backend.watch.folderReadOnly');if(folderId&&!this.db.folders.some(f=>f.id===folderId))throw localizedError("backend.folder.notFound");
  const result={added:0,duplicates:0,errors:[],restored:0,kinds:[],entries:[],mode:'copy',duplicatesPolicy:options.duplicates||'content'};const list=[];
  const visit=async(p,depth=0)=>{if(depth>40||list.length>=20000)throw localizedError("backend.import.tooMany");if(inside(this.root,path.resolve(p)))throw localizedError("backend.import.internal");const s=await fs.lstat(p);if(s.isSymbolicLink())throw localizedError("backend.import.symlink");if(s.isDirectory()){for(const entry of await fs.readdir(p)){const child=path.join(p,entry);try{await visit(child,depth+1);}catch(e){result.errors.push({name:entry,path:child,message:e.message,errorInfo:errorInfo(e)});}}}else if(s.isFile())list.push(p);};
  for(const p of paths){try{await visit(p);}catch(e){result.errors.push({name:path.basename(p),path:p,message:e.message,errorInfo:errorInfo(e)});}}
  for(let index=0;index<list.length;index++){
   const source=list[index];let target;
   try{const s=await fs.lstat(source);if(!s.isFile()||s.isSymbolicLink())throw localizedError("backend.import.regularFile");
    const id=crypto.randomUUID(),{ext,kind}=classify(source);if(!/^[a-z0-9_-]{0,20}$/.test(ext))throw localizedError("backend.import.invalidExtension");
    const temp=path.join(this.root,'files',id+'.importing');target=temp;
    await pipeline(createReadStream(source),createWriteStream(temp,{flags:'wx'}));
    const copied=await fs.stat(temp);if(copied.size!==s.size)throw localizedError("backend.import.changedDuringCopy");
    const hash=await hashFile(temp);const prior=options.duplicates==='keep'?null:this.db.items.find(i=>i.storage!=='link'&&(options.duplicates==='name'?i.name===path.basename(source):i.hash===hash&&i.size===s.size));
    if(prior){await fs.unlink(temp);target=null;result.duplicates++;result.entries.push({name:path.basename(source),path:source,status:prior.deletedAt?'trashed':'duplicate',id:prior.id});if(!result.kinds.includes(prior.kind))result.kinds.push(prior.kind);if(folderId&&!prior.folderIds.includes(folderId))prior.folderIds.push(folderId);continue;}
    const name=path.basename(source);const item={id,name,title:path.parse(name).name,ext,kind,size:s.size,hash,tags:[],folderIds:folderId?[folderId]:[],note:'',rating:0,favorite:false,deletedAt:null,createdAt:new Date().toISOString(),modifiedAt:s.mtime.toISOString(),source,searchText:'',previewError:'',storage:'copy'};
    const dest=path.join(this.root,'files',id+(ext?'.'+ext:''));await fs.rename(temp,dest);target=dest;
    try{item.searchText=await extract(dest,ext);}catch(e){item.previewError=e.message;item.previewErrorInfo=errorInfo(e);}
    this.db.items.push(item);try{await this.save();}catch(e){this.db.items.pop();throw e;}target=null;result.added++;result.entries.push({name,path:source,status:'added',id});if(!result.kinds.includes(kind))result.kinds.push(kind);
   }catch(e){if(target)await fs.unlink(target).catch(()=>{});result.errors.push({name:path.basename(source),path:source,message:e.message,errorInfo:errorInfo(e)});}
   onProgress({current:index+1,total:list.length,name:path.basename(source)});
  }
  await this.save();return result;
 });}
 async update(ids,patch){return this.edit('backend.undo.fileInfo',async()=>{
  if(!Array.isArray(ids)||ids.length>20000||!patch||typeof patch!=='object')throw localizedError("backend.validation.patch");const items=ids.map(id=>this.item(id));const next={};
  for(const [k,v] of Object.entries(patch)){
   if(k==='title')next.title=cleanText(v,200)||t("backend.file.untitled");
   else if(k==='note')next.note=cleanText(v,20000);
   else if(k==='tags'){if(!Array.isArray(v)||v.length>100)throw localizedError("backend.validation.tagsLimit");next.tags=[...new Set(v.map(t=>cleanText(t,60)).filter(Boolean))];}
   else if(k==='folderIds'){if(!Array.isArray(v)||v.some(id=>!this.db.folders.some(f=>f.id===id)))throw localizedError("backend.folder.invalid");if(v.some(id=>this.db.folders.some(f=>f.id===id&&f.connectionId)&&items.some(i=>!i.folderIds.includes(id))))throw localizedError('backend.watch.folderReadOnly');next.folderIds=[...new Set(v)];}
   else if(k==='favorite'){if(typeof v!=='boolean')throw localizedError("backend.validation.favorite");next.favorite=v;}
   else if(k==='rating'){if(!Number.isInteger(v)||v<0||v>5)throw localizedError("backend.validation.rating");next.rating=v;}
   else throw localizedError("backend.validation.readOnly");
  }
  const before=items.map(i=>structuredClone(i));items.forEach(i=>{const owned=i.folderIds.filter(id=>this.db.folders.some(f=>f.id===id&&f.connectionId));Object.assign(i,structuredClone(next));if(next.folderIds)i.folderIds=[...new Set([...i.folderIds,...owned])];});try{await this.save();}catch(e){items.forEach((i,j)=>Object.assign(i,before[j]));throw e;}return this.snapshot();
 });}
 async trash(ids,restore=false){return this.edit(restore?'backend.undo.restore':'backend.undo.trash',async()=>{if(!Array.isArray(ids))throw localizedError("backend.validation.files");const items=ids.map(id=>this.item(id));const old=items.map(i=>i.deletedAt);items.forEach(i=>i.deletedAt=restore?null:new Date().toISOString());try{await this.save();}catch(e){items.forEach((i,n)=>i.deletedAt=old[n]);throw e;}return this.snapshot();});}
 async purge(ids){return this.run(async()=>{const items=ids.map(id=>this.item(id));if(items.some(i=>!i.deletedAt))throw localizedError("backend.file.trashFirst");this.undoStack=[];
  for(const i of items){if(i.storage!=='link')await fs.unlink(this.filePath(i.id)).catch(e=>{if(e.code!=='ENOENT')throw e;});else if(i.watchId){const config=i.connectionId?this.db.connections?.find(c=>c.id===i.connectionId):this.db.watch?.id===i.watchId?this.db.watch:null;if(config&&!config.ignored.includes(i.source))config.ignored.push(i.source);}await fs.unlink(path.join(this.root,'previews',i.id+'.png')).catch(()=>{});this.db.items=this.db.items.filter(x=>x.id!==i.id);await this.save();}return this.snapshot();});}
 async folder(action,payload){return this.edit('backend.undo.folder.'+action,async()=>{
  if(!payload||typeof payload!=='object')throw localizedError("backend.folder.invalidRequest");const before=structuredClone(this.db);
  if(action==='create'){const parentId=payload.parentId||null;if(parentId&&this.db.folders.some(f=>f.id===parentId&&f.watchId))throw localizedError('backend.watch.folderReadOnly');if(parentId&&!this.db.folders.some(f=>f.id===parentId))throw localizedError("backend.folder.parentMissing");this.db.folders.push({id:crypto.randomUUID(),name:cleanText(payload.name,100)||t("backend.folder.new"),favorite:false,parentId});}
  else {const f=this.db.folders.find(f=>f.id===payload.id);if(!f)throw localizedError("backend.folder.notFound");if(f.watchId&&action!=='favorite')throw localizedError("backend.watch.folderReadOnly");if(action==='delete'&&this.db.watch?.enabled&&this.db.watch.targetFolderId===f.id)throw localizedError("backend.watch.disableFirst");if(action==='rename'){f.name=cleanText(payload.name,100)||f.name;delete f.systemName;}
   else if(action==='favorite'){if(typeof payload.favorite!=='boolean')throw localizedError("backend.folder.favoriteInvalid");f.favorite=payload.favorite;}
   else if(action==='delete'){const removed=new Set([f.id]);let more=true;while(more){more=false;for(const x of this.db.folders)if(removed.has(x.parentId)&&!removed.has(x.id)){removed.add(x.id);more=true;}}if(this.db.watch?.enabled&&removed.has(this.db.watch.targetFolderId))throw localizedError("backend.watch.disableFirst");this.db.folders=this.db.folders.filter(x=>!removed.has(x.id));this.db.items.forEach(i=>i.folderIds=i.folderIds.filter(id=>!removed.has(id)));}else throw localizedError("backend.folder.invalidAction");}
  try{await this.save();}catch(e){this.db=before;throw e;}return this.snapshot();
 });}
 async preview(id){const item=this.item(id);if(item.storage==='link'){try{await this.resolveFile(id);}catch{throw localizedError("backend.link.previewUnavailable");}}const type=previewType(item.ext);let text=item.searchText;if(item.connectionId&&(type==='text'))text=await require('./link-extract.cjs').extractLinked(await this.resolveFile(id),item.ext);return {type,text,error:errorText(item.previewErrorInfo,item.previewError),errorInfo:item.previewErrorInfo||null,url:`orgasset://file/${item.id}`,thumbnail:`orgasset://thumb/${item.id}`};}
 async exportFiles(ids,destination){return this.run(async()=>{if(inside(this.root,destination))throw localizedError("backend.export.outsideLibrary");let n=0;for(const id of ids){const item=this.item(id);const safe=path.basename(item.name);let name=safe;for(let k=1;;k++){try{await fs.copyFile(await this.resolveFile(id),path.join(destination,name),require('node:fs').constants.COPYFILE_EXCL);break;}catch(e){if(e.code!=='EEXIST')throw e;name=path.parse(safe).name+` (${k})`+path.extname(safe);}}n++;}return n;});}
 async backup(destination){return this.run(async()=>{
  const real=await fs.realpath(destination);if(inside(this.root,real))throw localizedError("backend.backup.separateFolder");
  const name=`Moaham-backup-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`;
  const out=path.join(real,name),partial=out+'.partial';await fs.mkdir(partial,{recursive:false});
  try{await fs.cp(path.join(this.root,'files'),path.join(partial,'files'),{recursive:true,filter:p=>!p.endsWith('.importing')});const backupDb=structuredClone(this.db);if(backupDb.watch)backupDb.watch.enabled=false;for(const c of backupDb.connections||[])c.enabled=false;await fs.writeFile(path.join(partial,'catalog.json'),JSON.stringify(backupDb,null,2));await fs.copyFile(path.join(partial,'catalog.json'),path.join(partial,'catalog.previous.json'));await fs.writeFile(path.join(partial,'BACKUP.txt'),t('backend.backup.readme'));await fs.rename(partial,out);return out;}catch(e){await fs.rm(partial,{recursive:true,force:true}).catch(()=>{});throw e;}
 });}

 canOpen(id){return !blocked.has(this.item(id).ext);}
}
require('./productivity.cjs').installProductivity(Library);
require('./linked.cjs').installLinks(Library);
require('./notes.cjs').installNotes(Library);
module.exports={Library,inside,hashFile,validateCatalog};
