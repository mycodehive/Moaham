const {localizedError,errorInfo,errorText}=require('./localized-error.cjs');
const {t}=require('./i18n.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {classify}=require('./formats.cjs');const {extractLinked}=require('./link-extract.cjs');
const key=p=>process.platform==='win32'?p.toLowerCase():p;
const identity=s=>s.ino?`${s.dev}:${s.ino}:${s.birthtimeMs}`:'';
const isInside=(root,p)=>{const r=path.relative(root,p);return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
async function externalFile(library,file,strict=false){
 if(typeof file!=='string'||!path.isAbsolute(file))throw localizedError("backend.link.invalidPath");
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw localizedError("backend.link.regularFile");
 const real=await fs.realpath(file);if(strict&&key(path.resolve(file))!==key(real))throw localizedError("backend.link.pathChanged");if(isInside(library.root,real))throw localizedError("backend.link.internalFile");
 await fs.access(real,require('node:fs').constants.R_OK);return{real,stat};
}
async function updateLink(item,real,stat,{metadataOnly=false,classification}={}){
 const {ext,kind}=classify(real,classification);if(!/^[a-z0-9_-]{0,20}$/.test(ext))throw localizedError("backend.link.invalidExtension");
 const changed=item.source!==real||item.linkMtime!==stat.mtimeMs||item.size!==stat.size||!!item.linkError;
 const oldName=item.name;item.name=path.basename(real);if(!item.title||item.title===path.parse(oldName||'').name)item.title=path.parse(item.name).name;
 Object.assign(item,{source:real,storage:'link',ext,kind,size:stat.size,modifiedAt:stat.mtime.toISOString(),linkMtime:stat.mtimeMs,fileIdentity:identity(stat),linkError:'',linkErrorInfo:null});
 if(changed&&!metadataOnly){try{item.searchText=await extractLinked(real,ext);item.previewError='';item.previewErrorInfo=null;}catch(e){item.searchText='';item.previewError=e.message;item.previewErrorInfo=errorInfo(e);}item.previewRevision=Date.now();}
 return changed;
}
function newLink(real){return{id:crypto.randomUUID(),name:'',title:'',ext:'',kind:'other',size:0,hash:crypto.createHash('sha256').update(key(real)).digest('hex'),tags:[],folderIds:[],note:'',rating:0,favorite:false,deletedAt:null,createdAt:new Date().toISOString(),source:real,searchText:'',previewError:'',storage:'link'};}
function installLinks(Library){
 Library.prototype.resolveFile=async function(id){const item=this.item(id),file=this.filePath(id);if(item.storage==='link')return(await externalFile(this,file,true)).real;
  const stat=await fs.lstat(file);const real=await fs.realpath(file);if(key(path.resolve(file))!==key(real))throw localizedError("backend.file.pathChanged");if(!stat.isFile()||stat.isSymbolicLink()||!isInside(this.root,real))throw localizedError("backend.file.unavailable");return real;
 };
 Library.prototype.linkPaths=function(paths,folderId,onProgress=()=>{}){return this.run(async()=>{
  if(!Array.isArray(paths)||paths.length>10000||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw localizedError("backend.link.importPath");
  if(folderId&&this.db.folders.some(f=>f.id===folderId&&f.connectionId))throw localizedError('backend.watch.folderReadOnly');if(folderId&&!this.db.folders.some(f=>f.id===folderId))throw localizedError("backend.folder.notFound");
  const before=structuredClone(this.db),check=this.authorize?.();const result={added:0,duplicates:0,errors:[],kinds:[],entries:[],mode:'link'},files=[];
  const visit=async(p,depth=0)=>{if(depth>40||files.length>=20000)throw localizedError("backend.link.tooMany");const s=await fs.lstat(p);if(s.isSymbolicLink())throw localizedError("backend.link.symlink");const real=await fs.realpath(p);if(isInside(this.root,real))throw localizedError("backend.link.internal");if(s.isDirectory()){for(const name of await fs.readdir(real)){const child=path.join(real,name);try{await visit(child,depth+1);}catch(e){result.errors.push({name,path:child,message:e.message,errorInfo:errorInfo(e)});}}}else if(s.isFile())files.push(real);};
  for(const p of paths)try{await visit(p);}catch(e){result.errors.push({name:path.basename(p),path:p,message:e.message,errorInfo:errorInfo(e)});}
  try{for(let n=0;n<files.length;n++){check?.();const source=files[n];try{const {real,stat}=await externalFile(this,source);let item=this.db.items.find(i=>i.storage==='link'&&!i.watchId&&key(i.source)===key(real));
   if(item){delete item.sourceOnly;result.duplicates++;if(folderId&&!item.folderIds.includes(folderId))item.folderIds.push(folderId);result.entries.push({name:item.name,path:real,status:item.deletedAt?'trashed':'duplicate',id:item.id});}
   else{item=newLink(real);await updateLink(item,real,stat,{classification:this.db.fileTypes});item.folderIds=folderId?[folderId]:[];this.db.items.push(item);result.added++;result.entries.push({name:item.name,path:real,status:'added',id:item.id});}
   if(!result.kinds.includes(item.kind))result.kinds.push(item.kind);
  }catch(e){result.errors.push({name:path.basename(source),path:source,message:e.message,errorInfo:errorInfo(e)});}onProgress({current:n+1,total:files.length,name:path.basename(source)});}
  check?.();await this.save();return result;}catch(e){this.db=before;throw e;}
 });};
 Library.prototype.refreshLinks=function(){return this.run(async()=>{const before=structuredClone(this.db),check=this.authorize?.();let changed=false;try{for(const item of this.db.items.filter(i=>i.storage==='link'&&!i.connectionId)){
   check?.();try{const {real,stat}=await externalFile(this,item.source,true);if(await updateLink(item,real,stat,{classification:this.db.fileTypes})){changed=true;await fs.unlink(path.join(this.root,'previews',item.id+'.png')).catch(()=>{});}}
   catch(e){if(item.linkError!==e.message){item.linkError=e.message;item.linkErrorInfo=errorInfo(e);item.searchText='';changed=true;}}
  }check?.();if(changed)await this.save();return changed;}catch(e){this.db=before;throw e;}
 });};
 Library.prototype.relink=function(id,source){return this.run(async()=>{const item=this.item(id);if(item.storage!=='link')throw localizedError("backend.link.reconnectOnly");if(item.watchId)throw localizedError("backend.watch.reconnect");const {real,stat}=await externalFile(this,source);const before=structuredClone(item);try{await updateLink(item,real,stat,{classification:this.db.fileTypes});await this.save();}catch(e){Object.assign(item,before);throw e;}await fs.unlink(path.join(this.root,'previews',id+'.png')).catch(()=>{});return this.snapshot();});};
}
module.exports={installLinks,externalFile,updateLink,newLink,identity,key,isInside};
