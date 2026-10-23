const {groups,classify}=require('./formats.cjs');
const {localizedError}=require('./localized-error.cjs');
const defaults=()=>structuredClone({...groups,other:[]});
function validateTypes(value){
 const base=defaults();if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(base).length||Object.keys(value).some(k=>!Object.hasOwn(base,k)))throw localizedError('backend.types.invalid');
 const seen=new Set(),result={};for(const key of Object.keys(base)){
  const values=typeof value[key]==='string'?value[key].split(','):value[key];if(!Array.isArray(values)||values.length>500)throw localizedError('backend.types.invalid');
  result[key]=[];for(const raw of values){if(typeof raw!=='string')throw localizedError('backend.types.invalid');const ext=raw.trim().replace(/^\./,'').toLowerCase();if(!ext)continue;if(!/^[a-z0-9_-]{1,20}$/.test(ext))throw localizedError('backend.types.extension',{ext});if(result[key].includes(ext))continue;if(seen.has(ext))throw localizedError('backend.types.duplicate',{ext});seen.add(ext);result[key].push(ext);}
 }return result;
}
function installFileTypes(Library){
 Library.prototype.typeSettings=function(){return{groups:structuredClone(this.db.fileTypes||defaults()),defaults:defaults()};};
 Library.prototype.typeConfigure=function(value){return this.run(async()=>{const next=validateTypes(value),before=structuredClone(this.db);try{this.db.fileTypes=next;for(const item of this.db.items)item.kind=classify('file.'+item.ext,next).kind;await this.save();return this.snapshot();}catch(e){this.db=before;throw e;}});};
}
module.exports={defaults,validateTypes,installFileTypes};
