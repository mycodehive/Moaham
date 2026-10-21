'use strict';
// Persist visual preferences per Windows profile, alongside existing card sizing.
const appearanceDefaults={
 dark:{background:'#111318',panel:'#1b1d25',card:'#222631',text:'#e7e9ef',muted:'#929bad',accent:'#b7a2ff',border:'#343845'},
 light:{background:'#f5f6fa',panel:'#ffffff',card:'#edf0f6',text:'#202534',muted:'#586479',accent:'#7051cf',border:'#d6dce8'}
};
const contextActions=[
 ['preview','미리보기'],['open','연결 프로그램으로 열기'],['reveal','탐색기에서 보기'],
 ['rename','제목 변경'],['favorite','즐겨찾기 추가 / 해제'],['tags','태그 편집'],
 ['folders','폴더 분류'],['export','파일 내보내기'],['trash','휴지통으로 이동'],
 ['restore','복원'],['purge','영구 삭제']
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
}
function savePreferences(value){localStorage.setItem('moaham.preferences',JSON.stringify(value));visualPreferences=structuredClone(value);applyAppearance();}
function appearanceSettings(){
 if(appLocked)return;
 const draft=structuredClone(visualPreferences);
 const labels={background:'전체 배경',panel:'사이드바·패널',card:'파일 카드·미리보기',text:'본문 글자',muted:'보조 글자',accent:'강조색·버튼',border:'테두리'};
 modal('화면 색상 · 라이트 / 다크', '<p>모드별 색상을 따로 저장합니다. 변경 사항을 미리 보고 저장하세요.</p><label for="themeMode">화면 모드</label><select id="themeMode"><option value="dark">다크 모드</option><option value="light">라이트 모드</option></select><div id="themeColors" class="theme-colors"></div><button id="resetTheme" class="button quiet">현재 모드 기본 색상</button>',
 [['취소',()=>{applyAppearance();closeModal();}],['저장',()=>{savePreferences(draft);closeModal();notify('화면 설정을 저장했습니다.');}]]);
 const dialog=$('#modal');
 const rollback=()=>{applyAppearance();dialog.removeEventListener('close',rollback);};
 dialog.addEventListener('close',rollback,{once:true});
 const draw=()=>{
  $('#themeMode').value=draft.mode;
  $('#themeColors').innerHTML=Object.entries(labels).map(([key,label])=>'<label for="color-'+key+'">'+label+'<span><input id="color-'+key+'" type="color" data-color="'+key+'" value="'+draft.colors[draft.mode][key]+'"><output>'+draft.colors[draft.mode][key]+'</output></span></label>').join('');
  $('#themeColors').querySelectorAll('[data-color]').forEach(input=>{input.oninput=()=>{draft.colors[draft.mode][input.dataset.color]=input.value;input.nextElementSibling.textContent=input.value;applyAppearance(draft);};});
  applyAppearance(draft);
 };
 $('#themeMode').onchange=e=>{draft.mode=e.target.value;draw();};
 $('#resetTheme').onclick=()=>{draft.colors[draft.mode]={...appearanceDefaults[draft.mode]};draw();};
 draw();
}
function contextMenuSettings(){
 if(appLocked)return;
 const draft=structuredClone(visualPreferences);
 modal('오른쪽 클릭 메뉴 설정','<p>파일 메뉴에 표시할 항목을 선택하고 위·아래 버튼으로 순서를 바꾸세요. 선택한 파일 수와 휴지통 상태에 맞는 항목만 표시합니다.</p><div id="contextOptions"></div><button id="resetContext" class="button quiet">메뉴 기본값 복원</button>',
 [['취소',closeModal],['저장',()=>{savePreferences(draft);closeModal();notify('오른쪽 클릭 메뉴 설정을 저장했습니다.');}]]);
 const draw=()=>{
  $('#contextOptions').innerHTML=draft.menu.map((item,index)=>'<div class="context-option" data-option="'+item.id+'"><label><input type="checkbox" data-menu-toggle="'+item.id+'" '+(item.enabled?'checked':'')+'>'+contextActions.find(([id])=>id===item.id)[1]+'</label><button data-move="-1" data-index="'+index+'" '+(index===0?'disabled':'')+' aria-label="위로 이동">↑</button><button data-move="1" data-index="'+index+'" '+(index===draft.menu.length-1?'disabled':'')+' aria-label="아래로 이동">↓</button></div>').join('');
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
const contextBox=document.createElement('div');contextBox.id='fileContextMenu';contextBox.className='file-context-menu';contextBox.setAttribute('role','menu');contextBox.setAttribute('aria-label','파일 작업');contextBox.hidden=true;document.body.append(contextBox);
function hideFileContext(restoreFocus=false){contextBox.hidden=true;contextBox.replaceChildren();if(restoreFocus)contextOrigin?.focus();contextOrigin=null;}
async function executeFileContext(action,ids){
 if(appLocked)return;
 const items=ids.map(id=>db.items.find(i=>i.id===id)).filter(Boolean);if(items.length!==ids.length)return;
 if(action==='preview')return showPreview(ids[0]);
 if(action==='open'||action==='reveal')return api[action](ids[0]);
 if(action==='rename')return askText('파일 제목 변경',items[0].title,async title=>{await api.update(ids,{title});await refresh();});
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
 const allowed=action=>['preview','open','reveal','rename'].includes(action)?single:
  ['restore','purge'].includes(action)?trashed:action==='trash'?!trashed:true;
 const actions=visualPreferences.menu.filter(x=>x.enabled&&allowed(x.id));
 contextOrigin=$('#gallery [data-id="'+id+'"]');
 contextBox.setAttribute('aria-label',ids.length+'개 파일 작업');
 for(const item of actions){
  const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.dataset.contextAction=item.id;
  button.textContent=item.id==='favorite'?(items.every(i=>i.favorite)?'즐겨찾기 해제':'즐겨찾기 추가'):contextActions.find(([key])=>key===item.id)[1];
  if(['trash','purge'].includes(item.id))button.className='danger-text';
  button.onclick=()=>{hideFileContext(true);attempt(()=>executeFileContext(item.id,ids));};contextBox.append(button);
 }
 const settingsButton=document.createElement('button');settingsButton.type='button';settingsButton.setAttribute('role','menuitem');settingsButton.dataset.contextAction='settings';settingsButton.textContent='메뉴 설정…';settingsButton.onclick=()=>{hideFileContext(true);contextMenuSettings();};contextBox.append(settingsButton);
 contextBox.hidden=false;contextBox.style.left='0px';contextBox.style.top='0px';
 const r=card.getBoundingClientRect(),x=event.clientX||r.left+20,y=event.clientY||r.top+20;
 contextBox.style.left=Math.max(6,Math.min(x,innerWidth-contextBox.offsetWidth-6))+'px';
 contextBox.style.top=Math.max(6,Math.min(y,innerHeight-contextBox.offsetHeight-6))+'px';
 contextBox.querySelector('button')?.focus();
}
$('#gallery').addEventListener('contextmenu',showFileContext);
$('#gallery').addEventListener('keydown',event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))showFileContext(event);});
contextBox.addEventListener('keydown',event=>{
 const buttons=[...contextBox.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
 if(event.key==='Escape'){event.preventDefault();hideFileContext(true);}
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}
});
document.addEventListener('pointerdown',event=>{if(!contextBox.contains(event.target))hideFileContext();},true);
document.addEventListener('scroll',()=>hideFileContext(),true);window.addEventListener('resize',()=>hideFileContext());
api.onLocked(()=>hideFileContext());
applyAppearance();

for(const [selector,name]of [['#settings','settings'],['#help','help'],['#gridMode','gallery'],['#listMode','list'],['.search>span','search'],['.inspector-title>span','info'],['#addFolder','plus']])$(selector).innerHTML=uiIcon(name);
