'use strict';
// Only explicitly marked application messages are rebound. User content stays literal.
const uiI18n=MoahamI18n.create({code:'ko',messages:{}});
let languageState=null,languageFingerprint='',languageChangeQueue=Promise.resolve();
function t(key,params={}){return uiI18n.t(key,params);}
class UiMessage extends String{
 constructor(key,params={}){super('');this.key=key;this.params=params;}
 toString(){return t(this.key,this.params);}
 valueOf(){return this.toString();}
 [Symbol.toPrimitive](){return this.toString();}
}
function msg(key,params){return new UiMessage(key,params);}
function uiEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function encodeUiParams(value){if(value instanceof UiMessage)return{$message:value.key,params:encodeUiParams(value.params)};if(Array.isArray(value))return value.map(encodeUiParams);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,encodeUiParams(v)]));return value;}
function decodeUiParams(value){if(value&&typeof value==='object'&&Object.hasOwn(value,'$message'))return msg(value.$message,decodeUiParams(value.params||{}));if(Array.isArray(value))return value.map(decodeUiParams);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,decodeUiParams(v)]));return value;}
function uiBinding(message,attribute='text'){
 if(!(message instanceof UiMessage))return'';
 const suffix=attribute==='text'?'':'-'+attribute;
 return `data-i18n${suffix}="${uiEscape(message.key)}" data-i18n${suffix}-params="${uiEscape(JSON.stringify(encodeUiParams(message.params)))}"`;
}
function ht(key,params={}){const message=msg(key,params);return `<span ${uiBinding(message)}>${uiEscape(message)}</span>`;}
function localizedHTML(value){return value instanceof UiMessage?ht(value.key,value.params):uiEscape(value);}
function bindUiText(element,value){
 if(!element)return;
 if(typeof value==='string'&&(element.classList.contains('form-error')||(element.id==='toast'&&element.classList.contains('error'))))value=inferUiError(value)||value;
 if(value instanceof UiMessage){element.dataset.i18n=value.key;element.dataset.i18nParams=JSON.stringify(encodeUiParams(value.params));}else{delete element.dataset.i18n;delete element.dataset.i18nParams;}
 element.textContent=String(value??'');
}
function bindUiAttribute(element,attribute,value){if(value instanceof UiMessage){element.setAttribute('data-i18n-'+attribute,value.key);element.setAttribute('data-i18n-'+attribute+'-params',JSON.stringify(encodeUiParams(value.params)));}element.setAttribute(attribute,String(value??''));}
function translateBoundUI(root=document){
 for(const element of root.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-alt]')){
  for(const attribute of ['text','title','placeholder','aria-label','alt']){
   const name=attribute==='text'?'data-i18n':'data-i18n-'+attribute,key=element.getAttribute(name);if(!key)continue;
   let params={};try{params=decodeUiParams(JSON.parse(element.getAttribute(name+'-params')||'{}'));}catch{}
   const value=t(key,params);if(attribute==='text')element.textContent=value;else element.setAttribute(attribute,value);
  }
 }
}
function languageOptions(){return (languageState?.languages||[]).map(language=>`<option value="${uiEscape(language.code)}">${uiEscape(language.name)}</option>`).join('');}
function populateLanguageSelects(){const warning=document.querySelector('#languageWarning');if(warning){warning.hidden=!languageState?.warnings?.length;warning.title=(languageState?.warnings||[]).join('\n');}for(const select of document.querySelectorAll('.language-select')){select.innerHTML=languageOptions();select.value=languageState?.code||'ko';select.setAttribute('aria-label',t('ui.language.choose'));select.title=languageState?.directory||'';}}
function modalLanguageControl(){return `<label class="modal-language-control"><span data-i18n="ui.language.label">${uiEscape(t('ui.language.label'))}</span><select class="language-select" aria-label="${uiEscape(t('ui.language.choose'))}">${languageOptions()}</select></label>`;}
function captureUiInputs(){return [...document.querySelectorAll('main input[id],main textarea[id],main select[id],#details input[id],#details textarea[id]')].filter(el=>el.id!=='languageSelect').map(el=>({id:el.id,value:el.value,checked:el.checked,start:el.selectionStart,end:el.selectionEnd,focus:el===document.activeElement}));}
function restoreUiInputs(inputs){for(const input of inputs){const element=document.getElementById(input.id);if(!element)continue;element.value=input.value;if('checked'in element)element.checked=input.checked;if(input.focus){element.focus({preventScroll:true});if(input.start!==null&&typeof element.setSelectionRange==='function')try{element.setSelectionRange(input.start,input.end);}catch{}}}}
function applyLanguageState(state,{initial=false}={}){
 const job=languageChangeQueue.then(async()=>{
  if(!state?.messages)return;
  languageState=state;populateLanguageSelects();
  const fingerprint=state.code+'|'+JSON.stringify(state.messages);if(!initial&&fingerprint===languageFingerprint)return;
  languageFingerprint=fingerprint;uiI18n.set(state);try{document.documentElement.dir=new Intl.Locale(state.locale||state.code).textInfo?.direction||'ltr';}catch{document.documentElement.dir='ltr';}if(typeof searchTimer!=='undefined')clearTimeout(searchTimer);
  const inputs=typeof db==='undefined'?[]:captureUiInputs();
  if(!initial&&typeof appLocked!=='undefined'){
   if(!appLocked&&db.root){for(const item of db.items){if(item.linkErrorInfo)item.linkError=String(uiErrorMessage(item.linkErrorInfo));if(item.previewErrorInfo)item.previewError=String(uiErrorMessage(item.previewErrorInfo));}renderNav();renderFiles();renderDetails();restoreUiInputs(inputs);if(updateState.errorInfo)updateState.message=String(uiErrorMessage(updateState.errorInfo));renderUpdate(updateState);renderImportOptions();if(fileSettingsState?.watch){if(fileSettingsState.watch.lastErrorInfo)fileSettingsState.watch.lastError=String(uiErrorMessage(fileSettingsState.watch.lastErrorInfo));renderWatchStatus(fileSettingsState.watch);}}
   else{bindUiText(document.querySelector('#libraryName'),msg('ui.text.Locked_956f2f'));bindUiText(document.querySelector('#viewTitle'),msg('ui.text.LibraryLocked_78c0a5'));bindUiText(document.querySelector('#crumb'),msg('ui.text.Locked_956f2f'));bindUiText(document.querySelector('#status'),msg('ui.text.Locked_956f2f'));}
  }
  translateBoundUI();populateLanguageSelects();document.documentElement.lang=state.code;
 });languageChangeQueue=job.catch(()=>{});return job;
}
async function initializeLanguage(){await applyLanguageState(await window.moaham.languageStatus(),{initial:true});}
function selectLanguage(code){return window.moaham.languageSet(code).then(state=>applyLanguageState(state));}
document.addEventListener('change',event=>{if(event.target.matches('.language-select')){const select=event.target;select.disabled=true;selectLanguage(select.value).catch(error=>{if(typeof notify==='function')notify(error.message,true);}).finally(()=>{select.disabled=false;populateLanguageSelects();});}});
document.addEventListener('focusin',event=>{if(event.target.matches('.language-select'))window.moaham.languagesRefresh().then(state=>{if(state.code===uiI18n.code)return applyLanguageState(state);languageState={...languageState,languages:state.languages,warnings:state.warnings};populateLanguageSelects();}).catch(()=>{});});
window.moaham.onLanguageChanged(state=>applyLanguageState(state));
function uiErrorMessage(info){if(!info?.key)return'';const params={...(info.params||{})};if(info.cause)params.error=uiErrorMessage(info.cause);return msg(info.key,params);}

// Error-only recognition retains translation identity for IPC Error.message strings.
// It is never applied to file names, document text, notes, tags or form values.
function inferUiError(value){
 if(!value||!languageState?.messages)return null;
 for(const [key,template] of Object.entries(languageState.messages)){
  const names=[];let pattern='',at=0;
  for(const match of template.matchAll(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g)){
   pattern+=escapeUiRegex(template.slice(at,match.index))+'([\\s\\S]*?)';names.push(match[1]);at=match.index+match[0].length;
  }
  pattern+=escapeUiRegex(template.slice(at));const match=new RegExp('^'+pattern+'$').exec(value);if(!match)continue;
  const params=Object.fromEntries(names.map((name,index)=>[name,name==='count'&&/^[0-9,]+$/.test(match[index+1])?Number(match[index+1].replaceAll(',','')):match[index+1]]));return msg(key.replace(/\.(one|other)$/,''),params);
 }
 return null;
}
function escapeUiRegex(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
