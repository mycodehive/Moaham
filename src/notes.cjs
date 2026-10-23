const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const {localizedError}=require('./localized-error.cjs');
const {t}=require('./i18n.cjs');
const Scope=require('./library-scope.js');
const MAX_BODY=1024*1024,COLORS=['default','yellow','green','blue','pink','purple'],ID=/^[0-9a-f-]{36}$/;
function fail(key){throw localizedError('backend.notes.'+key);}
function category(db,id){if(id===null||id===undefined)return null;if(typeof id!=='string'||!db.noteCategories.some(c=>c.id===id))fail('categoryMissing');return id;}
function name(value,max=100){if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f]/.test(value))fail('invalidName');return value.trim();}
function fileName(title,ext){let base=title.replace(/[\\/:*?"<>|]/g,'_').replace(/[. ]+$/,'')||'note';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='_'+base;return base+'.'+ext;}
function validateNotes(db){
 db.noteCategories??=[];if(!Array.isArray(db.noteCategories)||db.noteCategories.length>100)fail('invalidCatalog');const ids=new Set(),names=new Set();
 for(const c of db.noteCategories){if(!c||typeof c.id!=='string'||!ID.test(c.id)||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>100||/[\u0000-\u001f]/.test(c.name)||names.has(c.name))fail('invalidCatalog');ids.add(c.id);names.add(c.name);}
 for(const item of db.items)if(item.isNote){if(item.isNote!==true||item.storage!=='copy'||!['txt','md'].includes(item.ext))fail('invalidCatalog');item.noteCategoryId??=null;item.notePinned??=false;item.noteColor??='default';if((item.noteCategoryId&&!ids.has(item.noteCategoryId))||typeof item.notePinned!=='boolean'||!COLORS.includes(item.noteColor))fail('invalidCatalog');}return db;
}
function selected(library,ids,mode){if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)fail('invalidSelection');const items=ids.map(id=>library.item(id));if(items.some(i=>i.deletedAt||!['txt','md'].includes(i.ext)||!Scope.isLibraryItem(i,mode)))fail('textOnly');return items;}
async function bodyOf(library,item,check){
 const file=await library.resolveFile(item.id);check?.();const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BODY)fail('tooLarge');const bytes=await fs.readFile(file);check?.();if(bytes.length>MAX_BODY)fail('tooLarge');let body;
 try{const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';body=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{fail('encoding');}if(body.includes('\0'))fail('encoding');return body;
}
function installNotes(Library){
 Library.prototype.noteRead=function(id,mode='copy'){const check=this.authorize?.();return this.run(async()=>{const item=selected(this,[id],mode)[0],body=await bodyOf(this,item,check);return{id:item.id,title:item.title,body,categoryId:item.noteCategoryId||null,pinned:!!item.notePinned,color:item.noteColor||'default',ext:item.ext};});};
 async function writeNote(library,payload,check,folderIds=[]){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>!['id','title','body','categoryId','pinned','color','ext'].includes(k)))fail('invalidNote');
  if(payload.id!==undefined&&(typeof payload.id!=='string'||!ID.test(payload.id)))fail('invalidSelection');
  const prior=payload.id?library.item(payload.id):null;if(prior&&(!prior.isNote||prior.storage!=='copy'||prior.deletedAt))fail('managedOnly');
  const title=name(typeof payload.title==='string'?(payload.title.trim()||t('backend.notes.untitled')):payload.title,200);
  if(typeof payload.body!=='string'||payload.body.includes('\0'))fail('invalidNote');const bytes=Buffer.from(payload.body,'utf8');if(bytes.length>MAX_BODY)fail('tooLarge');
  const ext=payload.ext===undefined?(prior?.ext||'md'):payload.ext;if(!['txt','md'].includes(ext)||(prior&&prior.ext!==ext))fail('invalidNote');
  const categoryId=category(library.db,payload.categoryId===undefined?prior?.noteCategoryId:payload.categoryId),pinned=payload.pinned===undefined?!!prior?.notePinned:payload.pinned,color=payload.color===undefined?(prior?.noteColor||'default'):payload.color;if(typeof pinned!=='boolean'||!COLORS.includes(color))fail('invalidNote');
  const id=prior?.id||crypto.randomUUID(),now=new Date().toISOString(),item=prior?structuredClone(prior):{id,name:'',title:'',ext,kind:'text',size:0,hash:'',tags:[],folderIds:[...folderIds],note:'',rating:0,favorite:false,deletedAt:null,createdAt:now,modifiedAt:now,source:'',searchText:'',previewError:'',storage:'copy',isNote:true};
  Object.assign(item,{name:fileName(title,ext),kind:require('./formats.cjs').classify('note.'+ext,library.db.fileTypes).kind,title,size:bytes.length,hash:crypto.createHash('sha256').update(bytes).digest('hex'),modifiedAt:now,searchText:payload.body,previewError:'',previewErrorInfo:null,noteCategoryId:categoryId,notePinned:pinned,noteColor:color});
  const dest=path.join(library.root,'files',id+'.'+ext),temp=path.join(library.root,'files',id+'.'+crypto.randomUUID()+'.importing'),before=prior?structuredClone(prior):null;let oldBytes,written=false,inserted=false;
  if(prior){oldBytes=await fs.readFile(await library.resolveFile(id));check?.();}
  try{await fs.writeFile(temp,bytes,{flag:'wx'});check?.();await fs.rename(temp,dest);written=true;check?.();if(prior)Object.assign(prior,item);else{library.db.items.push(item);inserted=true;}await library.save();return{id,snapshot:library.snapshot()};}
  catch(error){if(prior)Object.assign(prior,before);else if(inserted)library.db.items=library.db.items.filter(i=>i.id!==id);if(written){if(prior){await fs.writeFile(temp,oldBytes);await fs.rename(temp,dest);}else await fs.unlink(dest).catch(()=>{});}throw error;}
  finally{await fs.unlink(temp).catch(()=>{});}
 }
 Library.prototype.noteSave=function(payload){const check=this.authorize?.();return this.run(()=>writeNote(this,payload,check));};
 Library.prototype.noteCategory=function(action,payload){return this.edit('backend.notes.undoCategory',async()=>{
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>!['id','name'].includes(k)))fail('invalidNote');const before=structuredClone(this.db);
  try{if(action==='create'){if(this.db.noteCategories.length>=100)fail('categoryLimit');const value=name(payload.name);if(this.db.noteCategories.some(c=>c.name===value))fail('categoryDuplicate');this.db.noteCategories.push({id:crypto.randomUUID(),name:value});}
   else if(action==='rename'||action==='delete'){const c=this.db.noteCategories.find(c=>c.id===payload.id);if(!c)fail('categoryMissing');if(action==='rename'){const value=name(payload.name);if(this.db.noteCategories.some(x=>x.id!==c.id&&x.name===value))fail('categoryDuplicate');c.name=value;}else{this.db.noteCategories=this.db.noteCategories.filter(x=>x.id!==c.id);for(const item of this.db.items)if(item.noteCategoryId===c.id)item.noteCategoryId=null;}}
   else fail('invalidAction');await this.save();return this.snapshot();
  }catch(error){this.db=before;throw error;}
 });};
 Library.prototype.noteMove=function(ids,id){return this.edit('backend.notes.undoMove',async()=>{const items=selected(this,ids,'link');if(items.some(i=>!i.isNote))fail('managedOnly');const target=category(this.db,id),before=items.map(i=>i.noteCategoryId);items.forEach(i=>i.noteCategoryId=target);try{await this.save();return this.snapshot();}catch(error){items.forEach((i,n)=>i.noteCategoryId=before[n]);throw error;}});};
 Library.prototype.textCardDrop=function(ids,targetId,action,mode='copy'){
  const check=this.authorize?.();
  if(action==='move')return this.edit('backend.notes.undoMove',async()=>{const items=selected(this,ids,mode),target=selected(this,[targetId],mode)[0];if(ids.includes(targetId))fail('sameTarget');const bodies=new Map();if(target.isNote){if(items.some(i=>i.storage==='link'))fail('moveLinkToNote');for(const item of items)if(!item.isNote)bodies.set(item.id,await bodyOf(this,item,check));check?.();}const before=items.map(i=>structuredClone(i));items.forEach(i=>{i.folderIds=[...target.folderIds];if(target.isNote&&!i.isNote)Object.assign(i,{isNote:true,notePinned:false,noteColor:'default',searchText:bodies.get(i.id),previewError:'',previewErrorInfo:null});if(i.isNote)i.noteCategoryId=target.isNote?target.noteCategoryId||null:null;});try{await this.save();return{id:targetId,snapshot:this.snapshot()};}catch(error){items.forEach((i,n)=>{for(const k of Object.keys(i))delete i[k];Object.assign(i,before[n]);});throw error;}});
  return this.run(async()=>{if(action!=='merge')fail('invalidAction');const items=selected(this,ids,mode),target=selected(this,[targetId],mode)[0];if(ids.includes(targetId))fail('sameTarget');const bodies=[];for(const item of [target,...items])bodies.push(await bodyOf(this,item,check));const body=bodies.join('\n\n---\n\n');if(Buffer.byteLength(body,'utf8')>MAX_BODY)fail('tooLarge');return writeNote(this,{title:t('backend.notes.mergedTitle',{title:target.title}).slice(0,200),body,categoryId:target.isNote?target.noteCategoryId:null,pinned:false,color:target.isNote?target.noteColor:'default',ext:target.ext},check,target.folderIds);});
 };
}
module.exports={installNotes,validateNotes,MAX_BODY,COLORS};
