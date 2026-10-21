const fs=require('node:fs/promises');
class ImportSettings{
 constructor(file){this.file=file;this.value={mode:'copy',duplicates:'content'};this.queue=Promise.resolve();}
 async init(){try{const v=JSON.parse(await fs.readFile(this.file,'utf8'));this.value=this.validate(v);}catch(e){if(e.code!=='ENOENT')this.loadError='기본 가져오기 설정을 읽지 못해 복사 방식으로 시작했습니다.';}return this;}
 validate(v){if(!v||!['copy','link'].includes(v.mode)||!['content','keep','name'].includes(v.duplicates))throw new Error('가져오기 설정을 확인하세요.');return{mode:v.mode,duplicates:v.duplicates};}
 status(){return{...this.value,error:this.loadError||''};}
 save(value){const next=this.validate(value);const job=this.queue.then(async()=>{await fs.writeFile(this.file+'.tmp',JSON.stringify(next,null,2));await fs.rename(this.file+'.tmp',this.file);this.value=next;this.loadError='';return this.status();});this.queue=job.catch(()=>{});return job;}
}
module.exports={ImportSettings};
