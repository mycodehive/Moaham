const fs=require('node:fs'),path=require('node:path');
const {create}=require('./i18n.js');
let base={};try{base=JSON.parse(fs.readFileSync(path.join(__dirname,'locales','ko.json'),'utf8')).messages;}catch{}
const runtime=create({code:'ko',locale:'ko-KR',messages:base,fallback:base});
function setRuntimeLanguage(value,messages,fallback){runtime.set(typeof value==='string'?{code:value,messages,fallback:fallback||base}:value);}
module.exports={t:(key,params)=>runtime.t(key,params),setRuntimeLanguage,number:(value,options)=>runtime.number(value,options),date:(value,options)=>runtime.date(value,options),runtime};
