const fs=require('node:fs/promises');
const path=require('node:path');
const {inside}=require('./library.cjs');
class BackupSchedule{
 constructor(file){this.file=file;this.db={};this.queue=Promise.resolve();this.running=false;}
 async init(){try{const value=JSON.parse(await fs.readFile(this.file,'utf8'));if(value&&typeof value==='object'&&!Array.isArray(value))this.db=value;}catch(e){if(e.code!=='ENOENT')throw new Error('자동 백업 설정을 읽을 수 없습니다.');}return this;}
 status(root){return structuredClone(this.db[root]||{enabled:false,days:1,destination:'',lastSuccess:null,lastPath:'',lastError:'',lastAttempt:null});}
 async write(){await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify(this.db,null,2));await fs.rename(this.file+'.tmp',this.file);}
 run(fn){const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p;}
 configure(root,value){return this.run(async()=>{
  if(!value||typeof value.enabled!=='boolean'||!Number.isInteger(value.days)||value.days<1||value.days>30||typeof value.destination!=='string')throw new Error('백업 주기와 저장 위치를 확인하세요.');
  let destination=value.destination;
  if(destination){if(!path.isAbsolute(destination))throw new Error('백업 위치를 확인하세요.');destination=await fs.realpath(destination);if(inside(root,destination))throw new Error('보관함과 분리된 백업 폴더를 선택하세요.');if(!(await fs.stat(destination)).isDirectory())throw new Error('폴더를 선택하세요.');}
  if(value.enabled&&!destination)throw new Error('백업 폴더를 먼저 선택하세요.');
  const before=this.db[root];this.db[root]={...this.status(root),enabled:value.enabled,days:value.days,destination};try{await this.write();}catch(e){if(before)this.db[root]=before;else delete this.db[root];throw e;}return this.status(root);
 });}
 due(root,now=Date.now()){const s=this.status(root);return s.enabled&&s.destination&&(!s.lastSuccess||now-Date.parse(s.lastSuccess)>=s.days*86400000)&&(!s.lastAttempt||now-Date.parse(s.lastAttempt)>=15*60000);}
 async backup(library,now=Date.now()){
  if(this.running)throw new Error('백업이 진행 중입니다.');this.running=true;
  try{return await this.run(async()=>{const root=library.root,s=this.status(root);if(!s.destination)throw new Error('백업 위치를 설정하세요.');
   s.lastAttempt=new Date(now).toISOString();this.db[root]=s;await this.write();
   try{const out=await library.backup(s.destination);s.lastSuccess=new Date(now).toISOString();s.lastPath=out;s.lastError='';await this.write();return this.status(root);}catch(e){s.lastError=e.message;await this.write();throw e;}
  });}finally{this.running=false;}
 }
}
module.exports={BackupSchedule};
