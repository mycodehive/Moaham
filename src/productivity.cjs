const crypto=require('node:crypto');
const {normalize}=require('./query.js');
const fields=['title','note','tags','folderIds','rating','favorite','deletedAt'];
const text=(value,max=60)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('이름을 확인하세요.');return value.trim();};
function installProductivity(Library){
 Library.prototype.historyState=function(){return{items:this.db.items.map(i=>({id:i.id,...Object.fromEntries(fields.map(k=>[k,structuredClone(i[k])]))})),folders:structuredClone(this.db.folders),savedSearches:structuredClone(this.db.savedSearches||[]),tagStyles:structuredClone(this.db.tagStyles||[])};};
 Library.prototype.edit=function(label,fn){return this.run(async()=>{const before=this.historyState();const result=await fn();if(JSON.stringify(before)!==JSON.stringify(this.historyState())){this.undoStack??=[];this.undoStack.push({label,before});if(this.undoStack.length>20)this.undoStack.shift();}return result;});};
 Library.prototype.undoInfo=function(){return{count:this.undoStack?.length||0,label:this.undoStack?.at(-1)?.label||''};};
 Library.prototype.undo=function(){return this.run(async()=>{
  const entry=this.undoStack?.at(-1);if(!entry)throw new Error('실행 취소할 작업이 없습니다.');const current=structuredClone(this.db);
  const known=new Map(entry.before.items.map(i=>[i.id,i]));for(const item of this.db.items){const prior=known.get(item.id);if(prior)for(const key of fields)item[key]=structuredClone(prior[key]);}
  this.db.folders=structuredClone(entry.before.folders);this.db.savedSearches=structuredClone(entry.before.savedSearches);this.db.tagStyles=structuredClone(entry.before.tagStyles);
  const valid=new Set(this.db.folders.map(f=>f.id));this.db.items.forEach(i=>i.folderIds=i.folderIds.filter(id=>valid.has(id)));
  try{await this.save();}catch(e){this.db=current;throw e;}this.undoStack.pop();return this.snapshot();
 });};
 Library.prototype.assignFolder=function(ids,folderId,move=false){return this.edit(move?'폴더 이동':'폴더 분류',async()=>{
  if(!Array.isArray(ids)||!ids.length||ids.length>20000||!this.db.folders.some(f=>f.id===folderId)||typeof move!=='boolean')throw new Error('분류할 파일과 폴더를 확인하세요.');
  const items=ids.map(id=>this.item(id));if(items.some(i=>i.deletedAt))throw new Error('휴지통 파일은 먼저 복원하세요.');const before=structuredClone(items);
  items.forEach(i=>i.folderIds=move?[folderId]:[...new Set([...i.folderIds,folderId])]);try{await this.save();}catch(e){items.forEach((i,n)=>Object.assign(i,before[n]));throw e;}return this.snapshot();
 });};
 Library.prototype.savedSearch=function(action,payload){return this.edit('스마트 보관함 편집',async()=>{
  const before=structuredClone(this.db.savedSearches||[]);this.db.savedSearches??=[];
  if(action==='save'){
   const rules=normalize(payload?.rules);if(rules.folderId&&!this.db.folders.some(f=>f.id===rules.folderId))throw new Error('검색할 폴더를 찾을 수 없습니다.');
   const name=text(payload?.name,100),existing=payload.id?this.db.savedSearches.find(s=>s.id===payload.id):null;if(payload.id&&!existing)throw new Error('스마트 보관함을 찾을 수 없습니다.');
   if(this.db.savedSearches.some(s=>s.name===name&&s.id!==existing?.id))throw new Error('같은 이름의 스마트 보관함이 있습니다.');
   if(existing)Object.assign(existing,{name,rules});else{if(this.db.savedSearches.length>=100)throw new Error('스마트 보관함은 최대 100개입니다.');this.db.savedSearches.push({id:crypto.randomUUID(),name,rules});}
  }else if(action==='delete'){if(!this.db.savedSearches.some(s=>s.id===payload?.id))throw new Error('스마트 보관함을 찾을 수 없습니다.');this.db.savedSearches=this.db.savedSearches.filter(s=>s.id!==payload.id);}else throw new Error('지원하지 않는 작업입니다.');
  try{await this.save();}catch(e){this.db.savedSearches=before;throw e;}return this.snapshot();
 });};
 Library.prototype.manageTag=function(action,payload){return this.edit('태그 '+({rename:'이름 변경',merge:'통합',delete:'삭제',color:'색상 변경'}[action]||'편집'),async()=>{
  const name=text(payload?.name),before=structuredClone(this.db);this.db.tagStyles??=[];
  if(action==='rename'||action==='merge'){
   const target=text(payload?.target);if(name===target)throw new Error('다른 태그 이름을 입력하세요.');
   for(const item of this.db.items)item.tags=[...new Set(item.tags.map(t=>t===name?target:t))];
   const source=this.db.tagStyles.find(t=>t.name===name);if(source&&!this.db.tagStyles.some(t=>t.name===target))this.db.tagStyles.push({...source,name:target});this.db.tagStyles=this.db.tagStyles.filter(t=>t.name!==name);
   for(const saved of this.db.savedSearches||[])if(saved.rules.tags)saved.rules.tags=[...new Set(saved.rules.tags.map(t=>t===name?target:t))];
  }else if(action==='delete'){
   this.db.items.forEach(i=>i.tags=i.tags.filter(t=>t!==name));this.db.tagStyles=this.db.tagStyles.filter(t=>t.name!==name);
   // Keep saved conditions unchanged: deleting a tag must not silently broaden a saved search.
  }else if(action==='color'){
   if(!/^#[a-f0-9]{6}$/i.test(payload.color||''))throw new Error('태그 색상을 확인하세요.');
   this.db.tagStyles=this.db.tagStyles.filter(t=>t.name!==name);this.db.tagStyles.push({name,color:payload.color});
  }else throw new Error('지원하지 않는 태그 작업입니다.');
  try{await this.save();}catch(e){this.db=before;throw e;}return this.snapshot();
 });};
}
module.exports={installProductivity};
