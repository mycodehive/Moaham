const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {watch}=require('node:fs');const {parameters,create}=require('./i18n.js');const {setRuntimeLanguage,t}=require('./i18n.cjs');
const MAX_BYTES=1024*1024,MAX_PACKS=100;
const ownObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const safeKey=key=>/^[A-Za-z][A-Za-z0-9_.-]{0,160}$/.test(key)&&!key.split('.').some(part=>['__proto__','constructor','prototype'].includes(part));
function canonical(code){if(typeof code!=='string'||! /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code))throw new Error('Invalid language code');return new Intl.Locale(code).toString();}
function validatePack(value,base={},filename){
 if(!ownObject(value))throw new Error('Expected a JSON language object');
 const code=canonical(value.code);if(filename&&canonical(path.basename(filename,path.extname(filename)))!==code)throw new Error('Filename and language code differ');
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80||/[<>\x00-\x1f]/.test(value.name))throw new Error('Invalid language name');
 const locale=new Intl.Locale(value.locale||code).toString();if(!ownObject(value.messages)||Object.keys(value.messages).length>4000)throw new Error('Invalid messages object');
 const messages=Object.create(null);
 for(const [key,text]of Object.entries(value.messages)){
  if(!safeKey(key)||typeof text!=='string'||text.length>16000||/[<\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new Error('Invalid text: '+key);
  if(Object.hasOwn(base,key)&&JSON.stringify(parameters(text))!==JSON.stringify(parameters(base[key])))throw new Error('Interpolation parameters differ: '+key);
  messages[key]=text;
 }
 // A partial plural override must provide both singular and general forms.
 for(const key of Object.keys(messages))if(/\.(one|other)$/.test(key)){const stem=key.replace(/\.(one|other)$/,'');if((Object.hasOwn(base,stem+'.one')||Object.hasOwn(base,stem+'.other'))&&(!Object.hasOwn(messages,stem+'.one')||!Object.hasOwn(messages,stem+'.other')))throw new Error('Incomplete plural forms: '+stem);}
 return{code,name:value.name.trim(),locale,messages};
}
class LanguageService{
 constructor({directory,settingsFile,osLocale='ko',onChanged=()=>{}}){this.directory=path.resolve(directory);this.settingsFile=path.resolve(settingsFile);this.osLocale=osLocale;this.onChanged=onChanged;this.queue=Promise.resolve();this.packs=new Map();this.warnings=[];this.builtins=new Map();this.preferred=null;this.current=null;this.stopped=false;this.timer=null;this.watcher=null;this.poll=null;}
 run(fn){const work=this.queue.then(fn);this.queue=work.catch(()=>{});return work;}
 async init(){
  for(const code of ['ko','en']){const value=JSON.parse(await fs.readFile(path.join(__dirname,'locales',code+'.json'),'utf8'));this.builtins.set(code,validatePack(value));}
  try{const saved=JSON.parse(await fs.readFile(this.settingsFile,'utf8'));this.preferred=canonical(saved.code);}catch(e){if(e.code!=='ENOENT')this.settingsWarning=true;}
  try{await fs.mkdir(this.directory,{recursive:true});}catch{}
  await this.refresh();
  try{this.watcher=watch(this.directory,()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>this.refresh().catch(()=>{}),250);this.timer.unref();});this.watcher.on('error',()=>{});}catch{}
  this.poll=setInterval(()=>this.refresh().catch(()=>{}),15000);this.poll.unref();return this;
 }
 stop(){this.stopped=true;this.watcher?.close();this.watcher=null;clearTimeout(this.timer);clearInterval(this.poll);}
 selectDefault(){let code;try{code=canonical(this.osLocale.replace(/_/g,'-'));}catch{code='ko';}return this.packs.has(code)?code:this.packs.has(code.split('-')[0])?code.split('-')[0]:'ko';}
 status(){const active=this.current||this.builtins.get('ko');const merged={...this.builtins.get('ko')?.messages,...active?.messages};const local=create({code:active?.code||'ko',locale:active?.locale||'ko-KR',messages:merged});return{code:active?.code||'ko',name:active?.name||'한국어',locale:active?.locale||'ko-KR',messages:merged,languages:[...this.packs.values()].sort((a,b)=>({ko:0,en:1}[a.code]??2)-({ko:0,en:1}[b.code]??2)||a.name.localeCompare(b.name)).map(({code,name})=>({code,name})),directory:this.directory,warnings:this.warnings.map(w=>local.t(w.key,w.params))};}
 publish(){const status=this.status(),fingerprint=JSON.stringify(status);setRuntimeLanguage(status);if(fingerprint!==this.fingerprint){this.fingerprint=fingerprint;if(!this.stopped)this.onChanged(structuredClone(status));}return status;}
 refresh(){return this.run(async()=>{
  const base=this.builtins.get('ko').messages;this.packs=new Map([...this.builtins].map(([code,p])=>[code,structuredClone(p)]));this.warnings=[];if(this.settingsWarning)this.warnings.push({key:'core.settingsUnreadable'});
  let entries;try{entries=await fs.readdir(this.directory,{withFileTypes:true});}catch(e){entries=[];this.warnings.push({key:'core.directoryUnavailable'});}
  const files=entries.filter(e=>e.name.toLowerCase().endsWith('.json')).sort((a,b)=>a.name.localeCompare(b.name));
  if(files.length>MAX_PACKS)this.warnings.push({key:'core.tooManyPacks',params:{count:MAX_PACKS}});
  for(const entry of files.slice(0,MAX_PACKS)){
   try{if(!entry.isFile()||entry.isSymbolicLink())throw new Error('Not a regular JSON file');const file=path.join(this.directory,entry.name),stat=await fs.lstat(file);if(stat.isSymbolicLink()||stat.size>MAX_BYTES)throw new Error('File is unsafe or too large');const source=await fs.readFile(file,'utf8');if(Buffer.byteLength(source)>MAX_BYTES)throw new Error('File is too large');const parsed=validatePack(JSON.parse(source.replace(/^\uFEFF/,'')),base,entry.name);const bundled=this.builtins.get(parsed.code);this.packs.set(parsed.code,{...parsed,messages:{...bundled?.messages,...parsed.messages}});
   }catch{this.warnings.push({key:'core.invalidPack',params:{file:entry.name}});}
  }
  const wanted=this.preferred||this.selectDefault();this.current=this.packs.get(wanted)||this.packs.get('ko');if(!this.packs.has(wanted))this.warnings.push({key:'core.packUnavailable',params:{code:wanted}});return this.publish();
 });}
 set(code){return this.run(async()=>{
  const normalized=canonical(code);if(!this.packs.has(normalized))throw new Error(t('core.languageUnavailable'));
  const temp=this.settingsFile+'.'+crypto.randomUUID()+'.tmp';await fs.mkdir(path.dirname(this.settingsFile),{recursive:true});try{await fs.writeFile(temp,JSON.stringify({code:normalized},null,2),{flag:'wx',mode:0o600});await fs.rename(temp,this.settingsFile);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}
  this.preferred=normalized;this.settingsWarning=false;this.current=this.packs.get(normalized);this.warnings=this.warnings.filter(w=>!['core.settingsUnreadable','core.packUnavailable'].includes(w.key));return this.publish();
 });}
}
module.exports={LanguageService,validatePack,canonical};
