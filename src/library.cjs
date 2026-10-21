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
function cleanText(v,max=2000){if(typeof v!=='string')throw new Error('문자열을 입력하세요.');return v.trim().slice(0,max);}
async function hashFile(p){const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(p))hash.update(chunk);return hash.digest('hex');}
function validateCatalog(db){
 if(!db||db.version!==1||!Array.isArray(db.items)||!Array.isArray(db.folders))throw new Error('지원하지 않는 보관함 형식입니다.');
 const ids=new Set();for(const i of db.items){if(!ID.test(i.id)||ids.has(i.id)||typeof i.name!=='string'||!['string'].includes(typeof i.ext)||!/^[a-z0-9_-]{0,20}$/.test(i.ext)||!Array.isArray(i.tags)||!Array.isArray(i.folderIds)||!/^[a-f0-9]{64}$/.test(i.hash)||!Number.isFinite(i.size))throw new Error('보관함 항목이 손상되었습니다.');ids.add(i.id);}
 const fids=new Set();for(const f of db.folders){if(!ID.test(f.id)||fids.has(f.id)||typeof f.name!=='string'||(f.parentId&&!ID.test(f.parentId))||(f.favorite!==undefined&&typeof f.favorite!=='boolean'))throw new Error('폴더 정보가 손상되었습니다.');fids.add(f.id);}
 db.folders.forEach(f=>{if(f.favorite===undefined)f.favorite=false;});
 db.savedSearches??=[];db.tagStyles??=[];
 if(!Array.isArray(db.savedSearches)||!Array.isArray(db.tagStyles))throw new Error("분류 설정이 손상되었습니다.");
 for(const saved of db.savedSearches){if(!ID.test(saved.id)||typeof saved.name!=='string'||!saved.name.trim())throw new Error('스마트 보관함이 손상되었습니다.');saved.rules=require('./query.js').normalize(saved.rules);}
 for(const style of db.tagStyles)if(typeof style.name!=='string'||!/^#[a-f0-9]{6}$/i.test(style.color||''))throw new Error('태그 색상이 손상되었습니다.');
 return db;
}
class Library{
 constructor(root){this.root=path.resolve(root);this.db=null;this.queue=Promise.resolve();this.recovery=false;}
 async init(){await fs.mkdir(path.join(this.root,'files'),{recursive:true});await fs.mkdir(path.join(this.root,'previews'),{recursive:true});this.root=await fs.realpath(this.root);
  try{this.db=validateCatalog(JSON.parse(await fs.readFile(path.join(this.root,'catalog.json'),'utf8')));}
  catch(e){if(e.code==='ENOENT'){const files=await fs.readdir(path.join(this.root,'files'));if(files.length)throw new Error('목록이 없지만 보관 파일이 있습니다. 백업에서 복구하세요.');this.db={version:1,items:[],folders:[],savedSearches:[],tagStyles:[]};await this.save();}else{try{this.db=validateCatalog(JSON.parse(await fs.readFile(path.join(this.root,'catalog.previous.json'),'utf8')));this.recovery=true;}catch{throw new Error('보관함 목록을 읽을 수 없습니다. 데이터를 보존했습니다. 백업을 확인하세요.');}}}
  return this;
 }
 run(fn){const check=this.authorize?.();const job=this.queue.then(()=>{check?.();return fn();});this.queue=job.catch(()=>{});return job;}
 async save(){
  const target=path.join(this.root,'catalog.json'), temp=path.join(this.root,`catalog-${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(temp,'wx');try{await handle.writeFile(JSON.stringify(this.db,null,2));await handle.sync();}finally{await handle.close();}
  if(!this.recovery){try{await fs.copyFile(target,path.join(this.root,'catalog.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}}
  await fs.rename(temp,target);this.recovery=false;
 }
 snapshot(){return {...structuredClone(this.db),root:this.root,recovery:this.recovery};}
 item(id){if(typeof id!=='string'||!ID.test(id))throw new Error('잘못된 파일 ID입니다.');const i=this.db.items.find(i=>i.id===id);if(!i)throw new Error('파일을 찾을 수 없습니다.');return i;}
 filePath(id){const i=this.item(id);return path.join(this.root,'files',i.id+(i.ext?'.'+i.ext:''));}
 async importPaths(paths,folderId,onProgress=()=>{}){return this.run(async()=>{
  if(!Array.isArray(paths)||paths.length>10000||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw new Error('잘못된 가져오기 경로입니다.');
  if(folderId&&!this.db.folders.some(f=>f.id===folderId))throw new Error('폴더를 찾을 수 없습니다.');
  const result={added:0,duplicates:0,errors:[],restored:0,kinds:[],entries:[]};const list=[];
  const visit=async(p,depth=0)=>{if(depth>40||list.length>=20000)throw new Error('한 번에 20,000개 이하로 가져와 주세요.');if(inside(this.root,path.resolve(p)))throw new Error('현재 보관함 내부 파일은 가져올 수 없습니다.');const s=await fs.lstat(p);if(s.isSymbolicLink())throw new Error('심볼릭 링크는 가져올 수 없습니다.');if(s.isDirectory()){for(const entry of await fs.readdir(p)){const child=path.join(p,entry);try{await visit(child,depth+1);}catch(e){result.errors.push({name:entry,path:child,message:e.message});}}}else if(s.isFile())list.push(p);};
  for(const p of paths){try{await visit(p);}catch(e){result.errors.push({name:path.basename(p),path:p,message:e.message});}}
  for(let index=0;index<list.length;index++){
   const source=list[index];let target;
   try{const s=await fs.lstat(source);if(!s.isFile()||s.isSymbolicLink())throw new Error('일반 파일만 가져올 수 있습니다.');
    const id=crypto.randomUUID(),{ext,kind}=classify(source);if(!/^[a-z0-9_-]{0,20}$/.test(ext))throw new Error('지원하지 않는 확장자 이름입니다.');
    const temp=path.join(this.root,'files',id+'.importing');target=temp;
    await pipeline(createReadStream(source),createWriteStream(temp,{flags:'wx'}));
    const copied=await fs.stat(temp);if(copied.size!==s.size)throw new Error('복사 도중 파일 크기가 바뀌었습니다.');
    const hash=await hashFile(temp);const prior=this.db.items.find(i=>i.hash===hash&&i.size===s.size);
    if(prior){await fs.unlink(temp);target=null;result.duplicates++;result.entries.push({name:path.basename(source),path:source,status:prior.deletedAt?'trashed':'duplicate',id:prior.id});if(!result.kinds.includes(prior.kind))result.kinds.push(prior.kind);if(folderId&&!prior.folderIds.includes(folderId))prior.folderIds.push(folderId);continue;}
    const name=path.basename(source);const item={id,name,title:path.parse(name).name,ext,kind,size:s.size,hash,tags:[],folderIds:folderId?[folderId]:[],note:'',rating:0,favorite:false,deletedAt:null,createdAt:new Date().toISOString(),modifiedAt:s.mtime.toISOString(),source,searchText:'',previewError:''};
    const dest=path.join(this.root,'files',id+(ext?'.'+ext:''));await fs.rename(temp,dest);target=dest;
    try{item.searchText=await extract(dest,ext);}catch(e){item.previewError=e.message;}
    this.db.items.push(item);try{await this.save();}catch(e){this.db.items.pop();throw e;}target=null;result.added++;result.entries.push({name,path:source,status:'added',id});if(!result.kinds.includes(kind))result.kinds.push(kind);
   }catch(e){if(target)await fs.unlink(target).catch(()=>{});result.errors.push({name:path.basename(source),path:source,message:e.message});}
   onProgress({current:index+1,total:list.length,name:path.basename(source)});
  }
  await this.save();return result;
 });}
 async update(ids,patch){return this.edit('파일 정보 변경',async()=>{
  if(!Array.isArray(ids)||ids.length>20000||!patch||typeof patch!=='object')throw new Error('잘못된 변경 요청입니다.');const items=ids.map(id=>this.item(id));const next={};
  for(const [k,v] of Object.entries(patch)){
   if(k==='title')next.title=cleanText(v,200)||'제목 없음';
   else if(k==='note')next.note=cleanText(v,20000);
   else if(k==='tags'){if(!Array.isArray(v)||v.length>100)throw new Error('태그는 최대 100개입니다.');next.tags=[...new Set(v.map(t=>cleanText(t,60)).filter(Boolean))];}
   else if(k==='folderIds'){if(!Array.isArray(v)||v.some(id=>!this.db.folders.some(f=>f.id===id)))throw new Error('잘못된 폴더입니다.');next.folderIds=[...new Set(v)];}
   else if(k==='favorite'){if(typeof v!=='boolean')throw new Error('잘못된 즐겨찾기 값입니다.');next.favorite=v;}
   else if(k==='rating'){if(!Number.isInteger(v)||v<0||v>5)throw new Error('별점은 0~5입니다.');next.rating=v;}
   else throw new Error('변경할 수 없는 속성입니다.');
  }
  const before=items.map(i=>structuredClone(i));items.forEach(i=>Object.assign(i,structuredClone(next)));try{await this.save();}catch(e){items.forEach((i,j)=>Object.assign(i,before[j]));throw e;}return this.snapshot();
 });}
 async trash(ids,restore=false){return this.edit(restore?'휴지통 복원':'휴지통 이동',async()=>{if(!Array.isArray(ids))throw new Error('잘못된 파일 목록입니다.');const items=ids.map(id=>this.item(id));const old=items.map(i=>i.deletedAt);items.forEach(i=>i.deletedAt=restore?null:new Date().toISOString());try{await this.save();}catch(e){items.forEach((i,n)=>i.deletedAt=old[n]);throw e;}return this.snapshot();});}
 async purge(ids){return this.run(async()=>{this.undoStack=[];const items=ids.map(id=>this.item(id));if(items.some(i=>!i.deletedAt))throw new Error('휴지통에 있는 파일만 영구 삭제할 수 있습니다.');
  for(const i of items){await fs.unlink(this.filePath(i.id)).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.unlink(path.join(this.root,'previews',i.id+'.png')).catch(()=>{});this.db.items=this.db.items.filter(x=>x.id!==i.id);await this.save();}return this.snapshot();});}
 async folder(action,payload){return this.edit('폴더 '+action,async()=>{
  if(!payload||typeof payload!=='object')throw new Error('잘못된 폴더 요청입니다.');const before=structuredClone(this.db);
  if(action==='create'){const parentId=payload.parentId||null;if(parentId&&!this.db.folders.some(f=>f.id===parentId))throw new Error('상위 폴더가 없습니다.');this.db.folders.push({id:crypto.randomUUID(),name:cleanText(payload.name,100)||'새 폴더',favorite:false,parentId});}
  else {const f=this.db.folders.find(f=>f.id===payload.id);if(!f)throw new Error('폴더를 찾을 수 없습니다.');if(action==='rename')f.name=cleanText(payload.name,100)||f.name;
   else if(action==='favorite'){if(typeof payload.favorite!=='boolean')throw new Error('즐겨찾기 값을 확인하세요.');f.favorite=payload.favorite;}
   else if(action==='delete'){const removed=new Set([f.id]);let more=true;while(more){more=false;for(const x of this.db.folders)if(removed.has(x.parentId)&&!removed.has(x.id)){removed.add(x.id);more=true;}}this.db.folders=this.db.folders.filter(x=>!removed.has(x.id));this.db.items.forEach(i=>i.folderIds=i.folderIds.filter(id=>!removed.has(id)));}else throw new Error('잘못된 폴더 작업입니다.');}
  try{await this.save();}catch(e){this.db=before;throw e;}return this.snapshot();
 });}
 async preview(id){const item=this.item(id);const type=previewType(item.ext);return {type,text:item.searchText,error:item.previewError,url:`orgasset://file/${item.id}`,thumbnail:`orgasset://thumb/${item.id}`};}
 async exportFiles(ids,destination){return this.run(async()=>{if(inside(this.root,destination))throw new Error('보관함 외부 폴더를 선택하세요.');let n=0;for(const id of ids){const item=this.item(id);const safe=path.basename(item.name);let name=safe;for(let k=1;;k++){try{await fs.copyFile(this.filePath(id),path.join(destination,name),require('node:fs').constants.COPYFILE_EXCL);break;}catch(e){if(e.code!=='EEXIST')throw e;name=path.parse(safe).name+` (${k})`+path.extname(safe);}}n++;}return n;});}
 async backup(destination){return this.run(async()=>{
  const real=await fs.realpath(destination);if(inside(this.root,real))throw new Error('보관함과 분리된 백업 폴더를 선택하세요.');
  const name=`Moaham-backup-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`;
  const out=path.join(real,name),partial=out+'.partial';await fs.mkdir(partial,{recursive:false});
  try{await fs.cp(path.join(this.root,'files'),path.join(partial,'files'),{recursive:true,filter:p=>!p.endsWith('.importing')});await fs.writeFile(path.join(partial,'catalog.json'),JSON.stringify(this.db,null,2));await fs.copyFile(path.join(partial,'catalog.json'),path.join(partial,'catalog.previous.json'));await fs.writeFile(path.join(partial,'BACKUP.txt'),'Moaham 전체 백업입니다. 앱 환경설정의 다른 보관함 / 전체 백업 열기에서 이 폴더를 선택하세요.\n');await fs.rename(partial,out);return out;}catch(e){await fs.rm(partial,{recursive:true,force:true}).catch(()=>{});throw e;}
 });}

 canOpen(id){return !blocked.has(this.item(id).ext);}
}
require('./productivity.cjs').installProductivity(Library);
module.exports={Library,inside,hashFile,validateCatalog};
