'use strict';
const fileHasThumbnail=item=>['jpg','jpeg','png','webp','gif','bmp','svg','avif','ico','tif','tiff','heic','psd','psb','ai','eps','sketch','fig','xd','afdesign','afphoto','indd','blend'].includes(item.ext);
const isImageFile=item=>['jpg','jpeg','png','webp','gif','bmp','svg','avif','ico'].includes(item.ext);
async function fileTypesSettings(){
 const request=settingsRequest(),state=await api.typeSettings();if(!settingsRequestValid(request))return;
 settingsModal('fileTypes',msg('ui.types.title'),`<p>${ht('ui.types.hint')}</p><p>${ht('ui.types.safetyHint')}</p><div id="fileTypeRows">${Object.entries(state.groups).map(([key,extensions])=>`<label class="file-type-row" for="type-${key}"><span>${localizedHTML(kinds[key][1])}</span><input id="type-${key}" data-file-type="${key}" value="${esc(extensions.join(', '))}" spellcheck="false" autocapitalize="off" placeholder="${esc(msg('ui.types.placeholder'))}" data-i18n-placeholder="ui.types.placeholder"></label>`).join('')}</div><p id="fileTypesError" class="form-error" role="status"></p><button id="resetFileTypes" class="button quiet">${ht('ui.types.reset')}</button>`,[[msg('ui.text.Close_94b7db'),closeModal],[msg('ui.text.Save_1f1712'),async()=>{
  const value=Object.fromEntries([...$('#fileTypeRows').querySelectorAll('[data-file-type]')].map(input=>[input.dataset.fileType,input.value]));try{await api.typeConfigure(value);await refresh();bindUiText($('#fileTypesError'),'');notify(msg('ui.types.saved'));}catch(e){bindUiText($('#fileTypesError'),e.message);}
 }]]);
 $('#resetFileTypes').onclick=()=>{for(const input of $('#fileTypeRows').querySelectorAll('[data-file-type]'))input.value=state.defaults[input.dataset.fileType].join(', ');bindUiText($('#fileTypesError'),msg('ui.types.resetHint'));};
}
