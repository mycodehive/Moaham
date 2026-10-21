const {t}=require('./i18n.cjs');
// Persist only translation identity for app-generated status text. File names,
// paths, tags, notes and operating-system diagnostics are never translated.
function localizedError(key,params={}){const error=new Error(t(key,params));error.translationKey=key;error.translationParams=structuredClone(params);return error;}
function errorInfo(error){return typeof error?.translationKey==='string'?{key:error.translationKey,params:structuredClone(error.translationParams||{})}:null;}
function errorText(info,fallback=''){if(!info||typeof info.key!=='string')return fallback;const params={...info.params};if(info.cause)params.error=errorText(info.cause,params.error);return t(info.key,params);}
module.exports={localizedError,errorInfo,errorText};
