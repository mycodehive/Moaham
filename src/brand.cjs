const fs=require('node:fs');
const path=require('node:path');
// Keep the legacy profile in place: it includes the password, library path,
// Chromium local storage (card sizing) and session state. Never copy half of it.
function directoryExists(file){try{if(!fs.statSync(file).isDirectory())throw new Error('설정 경로가 폴더가 아닙니다: '+file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function profilePath(appData,override){if(override)return path.resolve(override);for(const name of ['orgFiles','orgfiles']){const legacy=path.join(appData,name);if(directoryExists(legacy))return legacy;}return path.join(appData,'Moaham');}
function libraryPath(documents,override){if(override)return path.resolve(override);const legacy=path.join(documents,'orgFiles Library');return directoryExists(legacy)?legacy:path.join(documents,'Moaham Library');}
module.exports={profilePath,libraryPath};
