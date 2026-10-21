const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
function placeholders(value){return [...new Set([...value.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map(match=>match[1]))].sort();}
function checkLocales(){
 const packs=['ko','en'].map(code=>JSON.parse(fs.readFileSync(path.join(root,'src','locales',code+'.json'),'utf8'))),base=packs[0].messages,errors=[];
 for(const pack of packs){try{require('../src/language.cjs').validatePack(pack,base,pack.code+'.json');}catch(error){errors.push(pack.code+': invalid runtime pack: '+error.message);}const keys=Object.keys(pack.messages);for(const key of new Set([...Object.keys(base),...keys])){if(!(key in base))errors.push(pack.code+': unknown key '+key);else if(!(key in pack.messages))errors.push(pack.code+': missing key '+key);else if(JSON.stringify(placeholders(base[key]))!==JSON.stringify(placeholders(pack.messages[key])))errors.push(pack.code+': parameter mismatch '+key);if(/\.(one|other)$/.test(key)){const stem=key.replace(/\.(one|other)$/,'');for(const form of ['one','other'])if(!(stem+'.'+form in pack.messages))errors.push(pack.code+': missing plural form '+stem+'.'+form);}}
 }
 const sourceFiles=fs.readdirSync(path.join(root,'src')).filter(name=>/\.(?:js|cjs|html)$/.test(name));
 for(const name of sourceFiles){const source=fs.readFileSync(path.join(root,'src',name),'utf8');for(const match of source.matchAll(/\b(?:t|msg|ht)\(\s*['"]((?:ui|backend|core)\.[^'"]+)['"]/g)){const key=match[1];if(!(key in base)&&!(key+'.other' in base))errors.push(name+': undefined translation key '+key);}for(const match of source.matchAll(/data-i18n(?:-[\w-]+)?=["']((?:ui|backend|core)\.[^"']+)["']/g))if(!(match[1] in base)&&!(match[1]+'.other' in base))errors.push(name+': undefined HTML key '+match[1]);}
 if(errors.length)throw new Error([...new Set(errors)].join('\n'));
 console.log('Validated '+Object.keys(base).length+' translation keys, parameters, plural forms and source references.');return Object.keys(base).length;
}
if(require.main===module)checkLocales();
module.exports={checkLocales,placeholders};
