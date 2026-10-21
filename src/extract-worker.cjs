const {parentPort}=require('node:worker_threads');
const {extract}=require('./extract.cjs');
parentPort.on('message',async({id,file,ext})=>{try{parentPort.postMessage({id,text:await extract(file,ext)});}catch(e){parentPort.postMessage({id,error:e.message});}});
