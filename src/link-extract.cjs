const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {textExt}=require('./formats.cjs');
let worker,next=0;const pending=new Map();
function extractLinked(file,ext){
 if(!textExt.includes(ext)&&!['docx','xlsx','pptx','hwpx','odt','ods','odp'].includes(ext))return Promise.resolve('');
 if(!worker){worker=new Worker(path.join(__dirname,'extract-worker.cjs'));worker.on('message',result=>{const job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.error?job.reject(new Error(result.error)):job.resolve(result.text);if(!pending.size)worker?.unref();});worker.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();worker=null;});worker.unref();}
 worker.ref();return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});worker.postMessage({id,file,ext});});
}
module.exports={extractLinked};
