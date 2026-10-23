// Assemble reviewed source dictionaries into standalone, editable language packs.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),source=path.join(root,'translations'),output=path.join(root,'src','locales');
const languages={ko:{code:'ko',name:'한국어',locale:'ko-KR'},en:{code:'en',name:'English',locale:'en-US'},ja:{code:'ja',name:'日本語',locale:'ja-JP'}};
function buildLocales(){
 fs.mkdirSync(output,{recursive:true});const fragments=fs.readdirSync(source).filter(name=>/\.(ko|en|ja)\.json$/.test(name)).sort();
 for(const [code,metadata] of Object.entries(languages)){
  const messages=Object.create(null),owners=new Map();
  for(const name of fragments.filter(name=>name.endsWith('.'+code+'.json'))){const dictionary=JSON.parse(fs.readFileSync(path.join(source,name),'utf8'));if(!dictionary||Array.isArray(dictionary)||typeof dictionary!=='object')throw new Error(name+': expected a message dictionary');for(const [key,value] of Object.entries(dictionary)){if(typeof value!=='string')throw new Error(name+': '+key+' must be a string');if(owners.has(key)&&messages[key]!==value)throw new Error('Conflicting translation key '+key+' in '+owners.get(key)+' and '+name);messages[key]=value;owners.set(key,name);}}
  const ordered=Object.fromEntries(Object.keys(messages).sort().map(key=>[key,messages[key]]));fs.writeFileSync(path.join(output,code+'.json'),JSON.stringify({...metadata,messages:ordered},null,2)+'\n');
 }
 return Object.keys(languages);
}
if(require.main===module){const codes=buildLocales();console.log('Built language packs: '+codes.join(', '));}
module.exports={buildLocales};
