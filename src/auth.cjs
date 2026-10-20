const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const PARAMS={N:32768,r:8,p:1,maxmem:64*1024*1024};
function password(value,setting=false){if(typeof value!=='string'||value.length>256||(setting&&value.length<6))throw new Error('비밀번호는 6~256자로 입력하세요.');return value;}
class AppAuth{
 constructor(file){this.file=file;this.record=null;this.locked=true;this.attempts=0;this.lockUntil=0;this.epoch=0;this.queue=Promise.resolve();}
 async init(){try{const r=JSON.parse(await fs.readFile(this.file,'utf8'));if(r.version!==1||r.algorithm!=='scrypt'||!/^([a-f0-9]{32})$/.test(r.salt)||!/^([a-f0-9]{128})$/.test(r.hash))throw new Error('Invalid authentication record');this.record=r;}catch(e){if(e.code!=='ENOENT')throw new Error('비밀번호 설정을 읽을 수 없습니다. 잠금 상태를 유지합니다.');}this.locked=!!this.record;return this;}
 run(fn){const job=this.queue.then(fn);this.queue=job.catch(()=>{});return job;}
 status(){return {enabled:!!this.record,locked:this.locked,retryAfter:Math.max(0,Math.ceil((this.lockUntil-Date.now())/1000))};}
 async verify(value){password(value);if(Date.now()<this.lockUntil)throw new Error(`${this.status().retryAfter}초 후에 다시 시도하세요.`);const derived=await scrypt(value,Buffer.from(this.record.salt,'hex'),64,PARAMS);if(!crypto.timingSafeEqual(derived,Buffer.from(this.record.hash,'hex'))){this.attempts++;if(this.attempts>=5){this.lockUntil=Date.now()+30000;this.attempts=0;throw new Error('비밀번호가 5회 일치하지 않아 30초 동안 잠깁니다.');}throw new Error('비밀번호가 일치하지 않습니다.');}this.attempts=0;this.lockUntil=0;}
 async unlock(value){return this.run(async()=>{if(this.record)await this.verify(value);this.locked=false;return this.status();});}
 lock(){if(!this.record)throw new Error('먼저 앱 비밀번호를 설정하세요.');this.locked=true;this.epoch++;return this.status();}
 async configure(input){return this.run(async()=>{if(this.locked)throw new Error('앱 잠금을 먼저 해제하세요.');if(!input||typeof input!=='object'||typeof input.newPassword!=='string')throw new Error('잘못된 비밀번호 설정 요청입니다.');if(this.record)await this.verify(input.currentPassword);const next=input.newPassword;let record=null;
  if(next!==''){password(next,true);const salt=crypto.randomBytes(16);const derived=await scrypt(next,salt,64,PARAMS);record={version:1,algorithm:'scrypt',salt:salt.toString('hex'),hash:derived.toString('hex')};}
  await fs.mkdir(path.dirname(this.file),{recursive:true});
  if(record){const temp=this.file+'.'+crypto.randomUUID()+'.tmp';const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(record));await handle.sync();}finally{await handle.close();}try{await fs.rename(temp,this.file);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}}
  else await fs.unlink(this.file).catch(e=>{if(e.code!=='ENOENT')throw e;});
  this.record=record;this.attempts=0;this.lockUntil=0;return this.status();
 });}
}
module.exports={AppAuth};
