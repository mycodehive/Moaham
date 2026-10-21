(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MoahamQuery=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const kinds=['image','design','document','spreadsheet','presentation','text','video','audio','archive','other'];
 function normalize(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('검색 조건을 확인하세요.');
  const r={};
  for(const key of ['query','kind','folderId','dateFrom','dateTo'])if(value[key]){if(typeof value[key]!=='string')throw new Error('잘못된 검색 조건입니다.');r[key]=value[key].trim().slice(0,key==='query'?2000:100);}
  if(r.kind&&!kinds.includes(r.kind))throw new Error('파일 유형을 확인하세요.');
  for(const key of ['dateFrom','dateTo'])if(r[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(r[key])||!Number.isFinite(Date.parse(r[key]))))throw new Error('날짜를 확인하세요.');
  if(r.dateFrom&&r.dateTo&&r.dateFrom>r.dateTo)throw new Error('시작일은 종료일 이전이어야 합니다.');
  for(const key of ['minSize','maxSize','minRating'])if(value[key]!==''&&value[key]!==undefined&&value[key]!==null){const n=Number(value[key]);if(!Number.isFinite(n)||n<0||(key==='minRating'&&(!Number.isInteger(n)||n>5)))throw new Error('크기·별점 조건을 확인하세요.');r[key]=n;}
  if(r.minSize!==undefined&&r.maxSize!==undefined&&r.minSize>r.maxSize)throw new Error('최소 크기는 최대 크기 이하여야 합니다.');
  if(value.tags!==undefined){if(!Array.isArray(value.tags)||value.tags.some(t=>typeof t!=='string'||t.length>60)||value.tags.length>100)throw new Error('태그 조건을 확인하세요.');r.tags=[...new Set(value.tags.map(t=>t.trim()).filter(Boolean))];}
  r.tagMode=value.tagMode==='any'?'any':'all';r.missingTags=value.missingTags===true;r.favorite=value.favorite===true;return r;
 }
 function matches(item,r,folders=[]){
  if(item.deletedAt)return false;
  if(r.kind&&item.kind!==r.kind)return false;
  if(r.query&&!r.query.toLocaleLowerCase().split(/\s+/).every(t=>[item.name,item.title,item.note,...item.tags,item.searchText].join(' ').toLocaleLowerCase().includes(t)))return false;
  if(r.tags?.length&&!(r.tagMode==='any'?r.tags.some(t=>item.tags.includes(t)):r.tags.every(t=>item.tags.includes(t))))return false;
  if(r.missingTags&&item.tags.length)return false;if(r.favorite&&!item.favorite)return false;
  if(r.minSize!==undefined&&item.size<r.minSize)return false;if(r.maxSize!==undefined&&item.size>r.maxSize)return false;if(r.minRating!==undefined&&item.rating<r.minRating)return false;
  const created=new Date(item.createdAt).getTime();if(r.dateFrom&&created<new Date(r.dateFrom+'T00:00:00').getTime())return false;if(r.dateTo&&created>new Date(r.dateTo+'T23:59:59.999').getTime())return false;
  if(r.folderId){const ids=new Set([r.folderId]);let changed=true;while(changed){changed=false;for(const f of folders)if(ids.has(f.parentId)&&!ids.has(f.id)){ids.add(f.id);changed=true;}}if(!item.folderIds.some(id=>ids.has(id)))return false;}
  return true;
 }
 return {normalize,matches};
});
