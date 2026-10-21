const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {classify}=require('./formats.cjs');const {extractLinked}=require('./link-extract.cjs');
const key=p=>process.platform==='win32'?p.toLowerCase():p;
const identity=s=>s.ino?`${s.dev}:${s.ino}:${s.birthtimeMs}`:'';
const isInside=(root,p)=>{const r=path.relative(root,p);return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
async function externalFile(library,file,strict=false){
 if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('원본 경로를 확인하세요.');
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('일반 파일만 연결할 수 있습니다.');
 const real=await fs.realpath(file);if(strict&&key(path.resolve(file))!==key(real))throw new Error('원본 경로가 변경되었습니다. 재연결하세요.');if(isInside(library.root,real))throw new Error('보관함 내부 파일은 원본으로 연결할 수 없습니다.');
 await fs.access(real,require('node:fs').constants.R_OK);return{real,stat};
}
async function updateLink(item,real,stat){
 const {ext,kind}=classify(real);if(!/^[a-z0-9_-]{0,20}$/.test(ext))throw new Error('지원하지 않는 확장자입니다.');
 const changed=item.source!==real||item.linkMtime!==stat.mtimeMs||item.size!==stat.size||!!item.linkError;
 const oldName=item.name;item.name=path.basename(real);if(!item.title||item.title===path.parse(oldName||'').name)item.title=path.parse(item.name).name;
 Object.assign(item,{source:real,storage:'link',ext,kind,size:stat.size,modifiedAt:stat.mtime.toISOString(),linkMtime:stat.mtimeMs,fileIdentity:identity(stat),linkError:''});
 if(changed){try{item.searchText=await extractLinked(real,ext);item.previewError='';}catch(e){item.previewError=e.message;}item.previewRevision=Date.now();}
 return changed;
}
function newLink(real){return{id:crypto.randomUUID(),name:'',title:'',ext:'',kind:'other',size:0,hash:crypto.createHash('sha256').update(key(real)).digest('hex'),tags:[],folderIds:[],note:'',rating:0,favorite:false,deletedAt:null,createdAt:new Date().toISOString(),source:real,searchText:'',previewError:'',storage:'link'};}
function installLinks(Library){
 Library.prototype.resolveFile=async function(id){const item=this.item(id),file=this.filePath(id);if(item.storage==='link')return(await externalFile(this,file,true)).real;
  const stat=await fs.lstat(file);const real=await fs.realpath(file);if(key(path.resolve(file))!==key(real))throw new Error('보관 파일 경로가 변경되었습니다.');if(!stat.isFile()||stat.isSymbolicLink()||!isInside(this.root,real))throw new Error('보관 파일에 접근할 수 없습니다.');return real;
 };
 Library.prototype.linkPaths=function(paths,folderId,onProgress=()=>{}){return this.run(async()=>{
  if(!Array.isArray(paths)||paths.length>10000||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw new Error('가져오기 경로를 확인하세요.');
  if(folderId&&!this.db.folders.some(f=>f.id===folderId))throw new Error('폴더를 찾을 수 없습니다.');
  const before=structuredClone(this.db),check=this.authorize?.();const result={added:0,duplicates:0,errors:[],kinds:[],entries:[],mode:'link'},files=[];
  const visit=async(p,depth=0)=>{if(depth>40||files.length>=20000)throw new Error('한 번에 20,000개 이하로 연결하세요.');const s=await fs.lstat(p);if(s.isSymbolicLink())throw new Error('심볼릭 링크는 연결하지 않습니다.');const real=await fs.realpath(p);if(isInside(this.root,real))throw new Error('보관함 내부는 연결하지 않습니다.');if(s.isDirectory()){for(const name of await fs.readdir(real)){const child=path.join(real,name);try{await visit(child,depth+1);}catch(e){result.errors.push({name,path:child,message:e.message});}}}else if(s.isFile())files.push(real);};
  for(const p of paths)try{await visit(p);}catch(e){result.errors.push({name:path.basename(p),path:p,message:e.message});}
  try{for(let n=0;n<files.length;n++){check?.();const source=files[n];try{const {real,stat}=await externalFile(this,source);let item=this.db.items.find(i=>i.storage==='link'&&!i.watchId&&key(i.source)===key(real));
   if(item){result.duplicates++;if(folderId&&!item.folderIds.includes(folderId))item.folderIds.push(folderId);result.entries.push({name:item.name,path:real,status:item.deletedAt?'trashed':'duplicate',id:item.id});}
   else{item=newLink(real);await updateLink(item,real,stat);item.folderIds=folderId?[folderId]:[];this.db.items.push(item);result.added++;result.entries.push({name:item.name,path:real,status:'added',id:item.id});}
   if(!result.kinds.includes(item.kind))result.kinds.push(item.kind);
  }catch(e){result.errors.push({name:path.basename(source),path:source,message:e.message});}onProgress({current:n+1,total:files.length,name:path.basename(source)});}
  check?.();await this.save();return result;}catch(e){this.db=before;throw e;}
 });};
 Library.prototype.refreshLinks=function(){return this.run(async()=>{const before=structuredClone(this.db),check=this.authorize?.();let changed=false;try{for(const item of this.db.items.filter(i=>i.storage==='link')){
   check?.();try{const {real,stat}=await externalFile(this,item.source,true);if(await updateLink(item,real,stat)){changed=true;await fs.unlink(path.join(this.root,'previews',item.id+'.png')).catch(()=>{});}}
   catch(e){if(item.linkError!==e.message){item.linkError=e.message;item.searchText='';changed=true;}}
  }check?.();if(changed)await this.save();return changed;}catch(e){this.db=before;throw e;}
 });};
 Library.prototype.relink=function(id,source){return this.run(async()=>{const item=this.item(id);if(item.storage!=='link')throw new Error('링크 파일만 재연결할 수 있습니다.');if(item.watchId)throw new Error('자동 감시 파일은 감시 폴더를 변경하거나 동기화하세요.');const {real,stat}=await externalFile(this,source);const before=structuredClone(item);try{await updateLink(item,real,stat);await this.save();}catch(e){Object.assign(item,before);throw e;}await fs.unlink(path.join(this.root,'previews',id+'.png')).catch(()=>{});return this.snapshot();});};
}
module.exports={installLinks,externalFile,updateLink,newLink,identity,key,isInside};
