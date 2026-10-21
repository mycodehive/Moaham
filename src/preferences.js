'use strict';
// Persist visual preferences per Windows profile, alongside existing card sizing.
const appearanceDefaults={
 dark:{background:'#111318',panel:'#1b1d25',card:'#222631',text:'#e7e9ef',muted:'#929bad',accent:'#b7a2ff',border:'#343845'},
 light:{background:'#f5f6fa',panel:'#ffffff',card:'#edf0f6',text:'#202534',muted:'#586479',accent:'#7051cf',border:'#d6dce8'}
};
const contextActions=[
 ['importWatched',msg('ui.source.importToLibrary')],['preview',msg("ui.text.Preview_2f1c9d")],['open',msg("ui.text.OpenInDefaultApp_26b7f7")],['reveal',msg("ui.text.ShowInExplorer_0cef19")],
 ['source',msg("ui.text.OpenOriginalLocation_881ab3")],['relink',msg("ui.text.ReconnectOriginal_4610be")],['rename',msg("ui.text.RenameTitle_2a9f93")],['favorite',msg("ui.text.AddRemoveFavorite_d136a8")],['tags',msg("ui.text.EditTags_8c3a40")],
 ['folders',msg("ui.text.AssignFolders_26ace3")],['export',msg("ui.text.ExportFiles_809306")],['trash',msg("ui.text.MoveToTrash_13c664")],
 ['restore',msg("ui.text.Restore_cc5987")],['purge',msg("ui.text.DeletePermanently_36ed46")]
];
function readPreferences(){
 let raw={};try{raw=JSON.parse(localStorage.getItem('moaham.preferences')||'{}')||{};}catch{}
 const result={mode:raw.mode==='light'?'light':'dark',colors:{},menu:[]};
 for(const mode of ['dark','light']){
  result.colors[mode]={...appearanceDefaults[mode]};
  for(const key of Object.keys(appearanceDefaults[mode]))if(/^#[a-f0-9]{6}$/i.test(raw.colors?.[mode]?.[key]||''))result.colors[mode][key]=raw.colors[mode][key];
 }
 const seen=new Set();
 for(const item of Array.isArray(raw.menu)?raw.menu:[]){
  if(item&&contextActions.some(([id])=>id===item.id)&&!seen.has(item.id)){seen.add(item.id);result.menu.push({id:item.id,enabled:item.enabled!==false});}
 }
 for(const [id]of contextActions)if(!seen.has(id))result.menu.push({id,enabled:true});
 return result;
}
let visualPreferences=readPreferences();
function mixColor(a,b,weight){
 const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
 return '#'+rgb(a).map((v,i)=>Math.round(v*(1-weight)+rgb(b)[i]*weight).toString(16).padStart(2,'0')).join('');
}
function contrastInk(hex){
 const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*c[0]+.7152*c[1]+.0722*c[2]>.4?'#111318':'#ffffff';
}
function applyAppearance(value=visualPreferences){
 const c=value.colors[value.mode],style=document.documentElement.style;
 document.documentElement.dataset.theme=value.mode;style.colorScheme=value.mode;
 const tokens={bg:c.background,panel:c.panel,card:c.card,text:c.text,muted:c.muted,accent:c.accent,line:c.border,
  raised:mixColor(c.panel,c.text,.05),selected:mixColor(c.panel,c.accent,.18),soft:mixColor(c.panel,c.accent,.09),
  'on-accent':contrastInk(c.accent),danger:value.mode==='light'?'#b42342':'#ef9eaa',star:value.mode==='light'?'#956300':'#e3bd72'};
 for(const [key,color]of Object.entries(tokens))style.setProperty('--'+key,color);
 api.theme({mode:value.mode,background:c.background}).catch(()=>{});
}
function savePreferences(value){localStorage.setItem('moaham.preferences',JSON.stringify(value));visualPreferences=structuredClone(value);applyAppearance();}
function appearanceSettings(){
 if(appLocked)return;
 const draft=structuredClone(visualPreferences);
 const labels={background:msg("ui.text.Background_240430"),panel:msg("ui.text.SidebarAndPanels_9bc875"),card:msg("ui.text.FileCardsAndPreviews_d3d143"),text:msg("ui.text.MainText_9a8566"),muted:msg("ui.text.SecondaryText_fc38d8"),accent:msg("ui.text.AccentAndButtons_6f2547"),border:msg("ui.text.Borders_743c66")};
 modal(msg("ui.text.AppearanceLightDark_424368"), `<p>${ht("ui.text.SaveColorsSeparatelyForEachModePreviewYourChanges_3222ae")}</p><label for="themeMode">${ht("ui.text.AppearanceMode_dd9a9c")}</label><select id="themeMode"><option value="dark" data-i18n="ui.text.DarkMode_86749a">${esc(msg("ui.text.DarkMode_86749a"))}</option><option value="light" data-i18n="ui.text.LightMode_c08604">${esc(msg("ui.text.LightMode_c08604"))}</option></select><div id="themeColors" class="theme-colors"></div><button id="resetTheme" class="button quiet">${ht("ui.text.ResetCurrentModeColors_e4da6d")}</button>`,
 [[msg("ui.text.Cancel_19b2d1"),()=>{applyAppearance();closeModal();}],[msg("ui.text.Save_1f1712"),()=>{savePreferences(draft);closeModal();notify(msg("ui.text.AppearanceSettingsSaved_d6681e"));}]]);
 const dialog=$('#modal');
 const rollback=()=>{applyAppearance();dialog.removeEventListener('close',rollback);};
 dialog.addEventListener('close',rollback,{once:true});
 const draw=()=>{
  $('#themeMode').value=draft.mode;
  $('#themeColors').innerHTML=Object.entries(labels).map(([key,label])=>'<label for="color-'+key+'">'+localizedHTML(label)+'<span><input id="color-'+key+'" type="color" data-color="'+key+'" value="'+draft.colors[draft.mode][key]+'"><output>'+draft.colors[draft.mode][key]+'</output></span></label>').join('');
  $('#themeColors').querySelectorAll('[data-color]').forEach(input=>{input.oninput=()=>{draft.colors[draft.mode][input.dataset.color]=input.value;bindUiText(input.nextElementSibling,input.value);applyAppearance(draft);};});
  applyAppearance(draft);
 };
 $('#themeMode').onchange=e=>{draft.mode=e.target.value;draw();};
 $('#resetTheme').onclick=()=>{draft.colors[draft.mode]={...appearanceDefaults[draft.mode]};draw();};
 draw();
}
function contextMenuSettings(){
 if(appLocked)return;
 const draft=structuredClone(visualPreferences);
 modal(msg("ui.text.CustomizeContextMenu_48f28c"),`<p>${ht("ui.text.ChooseFileMenuActionsAndReorderThemWithThe_e7e593")}</p><div id="contextOptions"></div><button id="resetContext" class="button quiet">${ht("ui.text.ResetMenuDefaults_5b2298")}</button>`,
 [[msg("ui.text.Cancel_19b2d1"),closeModal],[msg("ui.text.Save_1f1712"),()=>{savePreferences(draft);closeModal();notify(msg("ui.text.ContextMenuSettingsSaved_dd0036"));}]]);
 const draw=()=>{
  $('#contextOptions').innerHTML=draft.menu.map((item,index)=>'<div class="context-option" data-option="'+item.id+'"><label><input type="checkbox" data-menu-toggle="'+item.id+'" '+(item.enabled?'checked':'')+'>'+localizedHTML(contextActions.find(([id])=>id===item.id)[1])+'</label><button data-move="-1" data-index="'+index+'" '+(index===0?'disabled':'')+` aria-label="${esc(msg("ui.text.MoveUp_0de151"))}" data-i18n-aria-label="ui.text.MoveUp_0de151">↑</button><button data-move="1" data-index="`+index+'" '+(index===draft.menu.length-1?'disabled':'')+` aria-label="${esc(msg("ui.text.MoveDown_763e79"))}" data-i18n-aria-label="ui.text.MoveDown_763e79">↓</button></div>`).join('');
  $('#contextOptions').querySelectorAll('[data-menu-toggle]').forEach(input=>input.onchange=()=>{draft.menu.find(x=>x.id===input.dataset.menuToggle).enabled=input.checked;});
  $('#contextOptions').querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{
   const index=Number(button.dataset.index),next=index+Number(button.dataset.move);
   if(next<0||next>=draft.menu.length)return;
   [draft.menu[index],draft.menu[next]]=[draft.menu[next],draft.menu[index]];draw();
  });
 };
 $('#resetContext').onclick=()=>{draft.menu=contextActions.map(([id])=>({id,enabled:true}));draw();};draw();
}
let contextOrigin=null;
const contextBox=document.createElement('div');contextBox.id='fileContextMenu';contextBox.className='file-context-menu';contextBox.setAttribute('role','menu');contextBox.setAttribute('aria-label',msg("ui.text.FileActions_d57d70"));contextBox.hidden=true;document.body.append(contextBox);
function hideFileContext(restoreFocus=false){contextBox.hidden=true;contextBox.replaceChildren();if(restoreFocus)contextOrigin?.focus({preventScroll:true});contextOrigin=null;}
async function executeFileContext(action,ids){
 if(appLocked)return;
 const items=ids.map(id=>db.items.find(i=>i.id===id)).filter(Boolean);if(items.length!==ids.length)return;
 if(action==='importWatched')return importWatchedToLibrary(ids);if(items.some(pendingSource)&&!['source','preview','open','reveal'].includes(action)){notify(msg('ui.source.importFirst'));return;}if(action==='source')return api.sourceLocation(ids[0]);
 if(action==='relink'){const result=await api.relink(ids[0]);if(result)return refresh();return;}
 if(action==='preview')return showPreview(ids[0]);
 if(action==='open'||action==='reveal')return api[action](ids[0]);
 if(action==='rename')return askText(msg("ui.text.RenameFileTitle_9b5302"),items[0].title,async title=>{await api.update(ids,{title});await refresh();});
 if(action==='favorite'){await api.update(ids,{favorite:!items.every(i=>i.favorite)});return refresh();}
 selected=new Set(ids);
 if(action==='tags')return runAction('batchTags');
 if(action==='folders')return chooseFolders(ids);
 return runAction(action);
}
function showFileContext(event){
 if(appLocked||$('#modal').open)return;
 const card=event.target.closest('[data-id]');
 if(!card)return;
 event.preventDefault();hideFileContext();
 const id=card.dataset.id;
 if(!selected.has(id)){selected=new Set([id]);renderFiles();renderDetails();}
 const ids=[...selected],items=ids.map(id=>db.items.find(i=>i.id===id));
 const single=ids.length===1,trashed=items.every(i=>i.deletedAt);
 const hasPending=items.some(pendingSource);const allowed=action=>action==='importWatched'?hasPending:hasPending&&!['source','preview','open','reveal'].includes(action)?false:action==='source'?single&&items[0].storage==='link':action==='relink'?single&&items[0].storage==='link'&&!items[0].watchId:['preview','open','reveal','rename'].includes(action)?single:
  ['restore','purge'].includes(action)?trashed:action==='trash'?!trashed:true;
 const actions=visualPreferences.menu.filter(x=>x.enabled&&allowed(x.id));
 contextOrigin=$('#gallery [data-id="'+id+'"]');
 bindUiAttribute(contextBox,'aria-label',msg('ui.count.actions',{count:ids.length}));
 for(const item of actions){
  const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.dataset.contextAction=item.id;
  bindUiText(button,item.id==='favorite'?(items.every(i=>i.favorite)?msg("ui.text.RemoveFavorite_40e258"):msg("ui.text.AddFavorite_c54074")):contextActions.find(([key])=>key===item.id)[1]);
  if(['trash','purge'].includes(item.id))button.className='danger-text';
  button.onclick=()=>{hideFileContext(true);attempt(()=>executeFileContext(item.id,ids));};contextBox.append(button);
 }
 const settingsButton=document.createElement('button');settingsButton.type='button';settingsButton.setAttribute('role','menuitem');settingsButton.dataset.contextAction='settings';bindUiText(settingsButton,msg("ui.text.CustomizeMenu_ee688e"));settingsButton.onclick=()=>{hideFileContext(true);contextMenuSettings();};contextBox.append(settingsButton);
 contextBox.hidden=false;contextBox.style.left='0px';contextBox.style.top='0px';
 const r=card.getBoundingClientRect(),x=event.clientX||r.left+20,y=event.clientY||r.top+20;
 contextBox.style.left=Math.max(6,Math.min(x,innerWidth-contextBox.offsetWidth-6))+'px';
 contextBox.style.top=Math.max(6,Math.min(y,innerHeight-contextBox.offsetHeight-6))+'px';
 contextBox.querySelector('button')?.focus({preventScroll:true});
}
$('#gallery').addEventListener('contextmenu',showFileContext);
$('#gallery').addEventListener('keydown',event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))showFileContext(event);});
contextBox.addEventListener('keydown',event=>{
 const buttons=[...contextBox.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideFileContext(true);}
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}
});
document.addEventListener('pointerdown',event=>{if(!contextBox.contains(event.target))hideFileContext();},true);
document.addEventListener('wheel',event=>{if(!contextBox.contains(event.target))hideFileContext();},{capture:true,passive:true});window.addEventListener('resize',()=>hideFileContext());
api.onLocked(()=>hideFileContext());
applyAppearance();

for(const [selector,name]of [['#settings','settings'],['#help','help'],['#gridMode','gallery'],['#listMode','list'],['.search>span','search'],['.inspector-title>span','info'],['#addFolder','plus']])$(selector).innerHTML=uiIcon(name);
