const {localizedError,errorInfo,errorText}=require('./localized-error.cjs');
const {t}=require('./i18n.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {inside}=require('./library.cjs');
class BackupSchedule{
 constructor(file){this.file=file;this.db={};this.queue=Promise.resolve();this.running=false;}
 async init(){try{const value=JSON.parse(await fs.readFile(this.file,'utf8'));if(value&&typeof value==='object'&&!Array.isArray(value))this.db=value;}catch(e){if(e.code!=='ENOENT')throw localizedError("backend.backup.settingsUnreadable");}return this;}
 status(root){const value=structuredClone(this.db[root]||{enabled:false,days:1,destination:'',lastSuccess:null,lastPath:'',lastError:'',lastAttempt:null});value.lastError=errorText(value.lastErrorInfo,value.lastError);return value;}
 async write(){await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify(this.db,null,2));await fs.rename(this.file+'.tmp',this.file);}
 run(fn){const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p;}
 configure(root,value){return this.run(async()=>{
  if(!value||typeof value.enabled!=='boolean'||!Number.isInteger(value.days)||value.days<1||value.days>30||typeof value.destination!=='string')throw localizedError("backend.backup.invalidSettings");
  let destination=value.destination;
  if(destination){if(!path.isAbsolute(destination))throw localizedError("backend.backup.invalidDestination");destination=await fs.realpath(destination);if(inside(root,destination))throw localizedError("backend.backup.separateFolder");if(!(await fs.stat(destination)).isDirectory())throw localizedError("backend.folder.choose");}
  if(value.enabled&&!destination)throw localizedError("backend.backup.chooseFirst");
  const before=this.db[root];this.db[root]={...this.status(root),enabled:value.enabled,days:value.days,destination};try{await this.write();}catch(e){if(before)this.db[root]=before;else delete this.db[root];throw e;}return this.status(root);
 });}
 due(root,now=Date.now()){const s=this.status(root);return s.enabled&&s.destination&&(!s.lastSuccess||now-Date.parse(s.lastSuccess)>=s.days*86400000)&&(!s.lastAttempt||now-Date.parse(s.lastAttempt)>=15*60000);}
 async backup(library,now=Date.now()){
  if(this.running)throw localizedError("backend.backup.busy");this.running=true;
  try{return await this.run(async()=>{const root=library.root,s=this.status(root);if(!s.destination)throw localizedError("backend.backup.configureDestination");
   s.lastAttempt=new Date(now).toISOString();this.db[root]=s;await this.write();
   try{const out=await library.backup(s.destination);s.lastSuccess=new Date(now).toISOString();s.lastPath=out;s.lastError='';s.lastErrorInfo=null;await this.write();return this.status(root);}catch(e){s.lastError=e.message;s.lastErrorInfo=errorInfo(e);await this.write();throw e;}
  });}finally{this.running=false;}
 }
}
module.exports={BackupSchedule};
