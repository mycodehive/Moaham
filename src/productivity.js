'use strict';
let advancedRules={},latestImport=null,internalDrag=null,previewList=null,previewId=null;
function tagColor(name){const value=(db.tagStyles||[]).find(t=>t.name===name)?.color;return /^#[a-f0-9]{6}$/i.test(value||'')?value:null;}
function applyExtraFilters(items){
 const saved=view.startsWith('smart:')?(db.savedSearches||[]).find(s=>s.id===view.slice(6)):null;
 return items.filter(i=>(!saved||MoahamQuery.matches(i,saved.rules,db.folders))&&MoahamQuery.matches(i,advancedRules,db.folders));
}
function renderProductivityNav(){
 const list=db.savedSearches||[];
 $('#smartNav').innerHTML=list.map(s=>navButton('smart:'+s.id,s.name,uiIcon('search'),active().filter(i=>MoahamQuery.matches(i,s.rules,db.folders)).length)).join('')||'<div class="tag-empty">검색 조건을 저장해 보세요</div>';
 if(view.startsWith('smart:')){const saved=list.find(s=>s.id===view.slice(6));$('#viewTitle').textContent=$('#crumb').textContent=saved?.name||'스마트 보관함';$('#viewSubtitle').textContent='저장한 조건에 맞는 파일이 자동으로 모입니다.';}
 for(const el of $('#tagNav').querySelectorAll('[data-view]')){const color=tagColor(el.dataset.view.slice(4));if(color){el.style.borderColor=color;el.style.boxShadow='inset 3px 0 '+color;}}
 if($('#advancedSummary'))$('#advancedSummary').textContent=Object.keys(advancedRules).length?'고급 검색 적용 중 · 초기화':'';
}
function resetAdvancedFilter(){advancedRules={};if($('#advancedSummary'))$('#advancedSummary').textContent='';}
function readRulesForm(){
 const value={query:$('#ruleQuery').value,kind:$('#ruleKind').value,tags:$('#ruleTags').value.split(',').map(t=>t.trim()).filter(Boolean),tagMode:$('#ruleTagMode').value,missingTags:$('#ruleMissingTags').checked,favorite:$('#ruleFavorite').checked,folderId:$('#ruleFolder').value,dateFrom:$('#ruleFrom').value,dateTo:$('#ruleTo').value,minRating:$('#ruleRating').value};
 for(const [key,id]of [['minSize','ruleMinSize'],['maxSize','ruleMaxSize']])if($('#'+id).value!=='')value[key]=Number($('#'+id).value)*1024*1024;
 return MoahamQuery.normalize(value);
}
function advancedSearch(saved=null){
 if(appLocked)return;
 const base=saved?.rules||{...advancedRules};if(!saved){base.query=$('#search').value||base.query||'';if(view.startsWith('type:'))base.kind=view.slice(5);if(view.startsWith('folder:'))base.folderId=view.slice(7);if(view.startsWith('tag:'))base.tags=[view.slice(4)];}
 modal(saved?'스마트 보관함 편집':'고급 검색 · 스마트 보관함',`<div class="filter-grid"><label>검색어<input id="ruleQuery" value="${esc(base.query||'')}"></label><label>파일 유형<select id="ruleKind"><option value="">모든 유형</option>${Object.entries(kinds).map(([k,v])=>`<option value="${k}" ${base.kind===k?'selected':''}>${esc(v[1])}</option>`).join('')}</select></label><label>태그 · 쉼표 구분<input id="ruleTags" value="${esc((base.tags||[]).join(', '))}"></label><label>태그 일치<select id="ruleTagMode"><option value="all">모두 포함</option><option value="any" ${base.tagMode==='any'?'selected':''}>하나 이상 포함</option></select></label><label>추가일 시작<input id="ruleFrom" type="date" value="${esc(base.dateFrom||'')}"></label><label>추가일 종료<input id="ruleTo" type="date" value="${esc(base.dateTo||'')}"></label><label>최소 크기 MB<input id="ruleMinSize" type="number" min="0" step="any" value="${base.minSize===undefined?'':base.minSize/1048576}"></label><label>최대 크기 MB<input id="ruleMaxSize" type="number" min="0" step="any" value="${base.maxSize===undefined?'':base.maxSize/1048576}"></label><label>최소 별점<select id="ruleRating"><option value="">제한 없음</option>${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${base.minRating===n?'selected':''}>${n}점 이상</option>`).join('')}</select></label><label>폴더 · 하위 포함<select id="ruleFolder"><option value="">모든 폴더</option>${db.folders.map(f=>`<option value="${f.id}" ${base.folderId===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label></div><div class="filter-checks"><label><input type="checkbox" id="ruleMissingTags" ${base.missingTags?'checked':''}>태그 없는 파일만</label><label><input type="checkbox" id="ruleFavorite" ${base.favorite?'checked':''}>즐겨찾기만</label></div><label>스마트 보관함 이름<input id="ruleName" value="${esc(saved?.name||'')}" placeholder="예: 최근 보고서"></label><p id="ruleError" class="form-error"></p>`,[
 ['취소',closeModal],['조건 초기화',()=>{closeModal();resetAdvancedFilter();$('#search').value='';setView('all');}],
 ['검색 적용',()=>attempt(async()=>{const rules=readRulesForm();advancedRules=rules;view='all';$('#search').value='';selected.clear();limit=300;closeModal();await refresh();})],
 ['스마트 보관함 저장',async()=>{try{const rules=readRulesForm();const name=$('#ruleName').value.trim();if(!name)throw new Error('스마트 보관함 이름을 입력하세요.');await api.savedSearch('save',{id:saved?.id,name,rules});closeModal();resetAdvancedFilter();$('#search').value='';await refresh();const found=(db.savedSearches||[]).find(s=>saved?s.id===saved.id:s.name===name);if(found)setView('smart:'+found.id);}catch(e){$('#ruleError').textContent=e.message;}}]
 ]);
}
function smartMenu(id){const saved=(db.savedSearches||[]).find(s=>s.id===id);if(!saved)return;modal(saved.name,'<p>스마트 보관함은 조건을 저장하며 원본 파일을 이동하지 않습니다.</p>',[['닫기',closeModal],['조건 편집',()=>advancedSearch(saved)],['스마트 보관함 삭제',async()=>{await api.savedSearch('delete',{id});closeModal();setView('all');await refresh();}]]);}
function tagManager(){
 const tags=[...new Set([...db.items.flatMap(i=>i.tags),...(db.tagStyles||[]).map(t=>t.name)])].sort((a,b)=>a.localeCompare(b,'ko'));
 modal('태그 관리',`<p>이름 변경·통합·삭제는 휴지통을 포함한 모든 파일에 반영됩니다. 파일 자체는 삭제하지 않습니다.</p><label>대상 태그<select id="tagSource">${tags.map(t=>`<option value="${esc(t)}">${esc(t)} (${db.items.filter(i=>i.tags.includes(t)).length})</option>`).join('')}</select></label><label>변경·통합할 태그 이름<input id="tagTarget" list="tagNames" maxlength="60"></label><datalist id="tagNames">${tags.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist><label>태그 색상<input id="tagColor" type="color" value="${tagColor(tags[0])||'#8c72dd'}"></label><p id="tagManagerError" class="form-error"></p>`,[['닫기',closeModal],['이름 변경',()=>applyTag('rename')],['통합',()=>applyTag('merge')],['색상 저장',()=>applyTag('color')],['태그 삭제',()=>{
 const name=$('#tagSource').value;if(!name)return;
 modal('태그 삭제',`<p>“${esc(name)}” 태그를 모든 파일에서 제거할까요? 파일은 유지됩니다. 실행 취소로 되돌릴 수 있습니다.</p>`,[['취소',tagManager],['태그 삭제',async()=>{await api.manageTag('delete',{name});if(view==='tag:'+name)view='all';await refresh();tagManager();}]]);
 }]]);
 $('#tagSource').onchange=()=>$('#tagColor').value=tagColor($('#tagSource').value)||'#8c72dd';
 async function applyTag(action){try{const name=$('#tagSource').value;if(!name)throw new Error('태그가 없습니다. 먼저 파일에 태그를 추가하세요.');await api.manageTag(action,{name,target:$('#tagTarget').value,color:$('#tagColor').value});if((action==='rename'||action==='merge')&&view==='tag:'+name)view='tag:'+$('#tagTarget').value.trim();await refresh();tagManager();}catch(e){$('#tagManagerError').textContent=e.message;}}
}
async function undoFileAction(){if(appLocked)return;const restored=await api.undo();if(view.startsWith('tag:')&&!restored.items.some(i=>i.tags.includes(view.slice(4))))view='all';await refresh();notify('최근 파일 작업을 실행 취소했습니다.');}
function showImportResults(result=latestImport){
 if(!result){notify('이번 실행에서 가져온 이력이 없습니다.');return;}latestImport=result;
 const filters=[['all','전체'],['added','추가'],['duplicate','중복'],['error','실패']];
 const entries=[...(result.entries||[]),...result.errors.map(e=>({...e,status:'error'}))];
 modal('가져오기 결과',`<p>${result.mode==='link'?'↗ 원본 위치 연결':'▣ 라이브러리 복사'} · ${result.added}개 추가 · ${result.duplicates}개 중복 · ${result.errors.length}개 실패</p><div id="importResultFilters" class="preview-tools">${filters.map(([key,label])=>`<button data-result-filter="${key}">${label}</button>`).join('')}</div><div id="importResultRows" class="import-result-rows"></div>`,[['닫기',closeModal],['실패 항목만 재시도',async()=>{const paths=[...new Set(result.errors.map(e=>e.path).filter(Boolean))];if(!paths.length){notify('재시도할 실패 항목이 없습니다.');return;}closeModal();$('#importMode').value=result.mode||'copy';if(['content','keep','name'].includes(result.duplicatesPolicy))$('#duplicatePolicy').value=result.duplicatesPolicy;renderImportOptions();await doImport(false,paths);}]]);
 const draw=filter=>{$('#importResultRows').innerHTML=entries.filter(e=>filter==='all'||(filter==='duplicate'?['duplicate','trashed'].includes(e.status):e.status===filter)).map(e=>`<div class="import-result-row"><b>${esc(e.name)}</b><span>${esc(({added:'추가됨',duplicate:'중복 건너뜀',trashed:'휴지통 중복 · 복원 필요',error:'실패'})[e.status])}</span><small>${esc(e.message||e.path||'')}</small></div>`).join('')||'<p>해당 항목이 없습니다.</p>';};
 $('#importResultFilters').onclick=e=>{const b=e.target.closest('[data-result-filter]');if(b)draw(b.dataset.resultFilter);};draw('all');
}
async function backupSettings(){
 const status=await api.backupStatus();let destination=status.destination;
 const statusText=s=>`마지막 성공: ${s.lastSuccess?date(s.lastSuccess)+' '+new Date(s.lastSuccess).toLocaleTimeString('ko-KR'):'아직 없음'}${s.lastError?' · 최근 오류: '+s.lastError:''}`;
 modal('자동 백업 · 복구',`<p>앱이 실행되고 잠금이 해제된 동안 지정 주기에 전체 백업을 만듭니다. 놓친 백업은 다음 실행 시 처리합니다. 다른 작업 중에는 미룹니다. 링크 항목은 경로만 백업하므로 원본 파일은 별도로 백업하세요.</p><label class="filter-checks"><input id="backupEnabled" type="checkbox" ${status.enabled?'checked':''}>자동 백업 사용</label><label>주기<select id="backupDays">${[1,3,7,14,30].map(n=>`<option value="${n}" ${status.days===n?'selected':''}>${n}일마다</option>`).join('')}</select></label><p id="backupDestination" class="detail-source">${esc(destination||'백업 폴더를 선택하세요.')}</p><button id="chooseBackup" class="button quiet">백업 폴더 선택</button><p id="scheduledBackupStatus">${esc(statusText(status))}</p><p class="preview-hint">완료된 백업은 자동 삭제하지 않습니다. 저장 공간을 확인하세요. 외장 디스크 등 보관함과 분리된 위치를 권장합니다.</p><details><summary>백업에서 복구하는 방법</summary><p>1. 마지막 백업 위치를 열어 catalog.json과 files 폴더를 확인합니다.<br>2. 백업 폴더 전체를 사용할 위치로 복사합니다.<br>3. 환경설정 → 다른 보관함 / 전체 백업 열기에서 복사한 폴더를 선택합니다.<br>앱 비밀번호 설정은 보관함 백업에 포함되지 않습니다. .partial 폴더는 완료된 백업이 아닙니다.</p></details><p id="backupSettingsError" class="form-error"></p>`,[
 ['닫기',closeModal],['마지막 백업 위치',()=>api.backupLatest()],['설정 저장',()=>save(false)],['지금 백업',()=>save(true)]
 ]);
 $('#chooseBackup').onclick=()=>attempt(async()=>{const chosen=await api.backupChoose();if(chosen){destination=chosen;$('#backupDestination').textContent=chosen;}});
 async function save(run){const buttons=[...$('#modalActions').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await api.backupConfigure({enabled:$('#backupEnabled').checked,days:Number($('#backupDays').value),destination});if(run){const next=await api.backupNow();$('#scheduledBackupStatus').textContent=statusText(next);notify('전체 백업을 완료했습니다.');}else{closeModal();notify('자동 백업 설정을 저장했습니다.');}}catch(e){$('#backupSettingsError').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
}
// Internal drags contain only catalog IDs. OS file drops continue through preload.
$('#gallery').addEventListener('dragstart',e=>{
 const card=e.target.closest('[data-id]');if(!card||appLocked||view==='trash')return e.preventDefault();
 if(!selected.has(card.dataset.id)){selected=new Set([card.dataset.id]);renderDetails();}
 internalDrag=[...selected];e.dataTransfer.setData('application/x-moaham-items',JSON.stringify(internalDrag));e.dataTransfer.effectAllowed='copyMove';
});
document.addEventListener('dragend',()=>{internalDrag=null;document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));});
for(const selector of ['#folderNav','#favoriteFolderNav']){
 const nav=$(selector);nav.addEventListener('dragover',e=>{const target=e.target.closest('[data-view^="folder:"]');if(internalDrag&&target){e.preventDefault();e.dataTransfer.dropEffect=e.shiftKey?'move':'copy';target.classList.add('drop-target');}});
 nav.addEventListener('dragleave',e=>{e.target.closest('[data-view]')?.classList.remove('drop-target');});
 nav.addEventListener('drop',e=>{const target=e.target.closest('[data-view^="folder:"]');if(!internalDrag||!target||appLocked)return;e.preventDefault();e.stopPropagation();const ids=internalDrag;internalDrag=null;target.classList.remove('drop-target');attempt(async()=>{await api.assignFolder(ids,target.dataset.view.slice(7),e.shiftKey);await refresh();notify(e.shiftKey?'선택한 파일을 폴더로 이동했습니다.':'선택한 파일을 폴더에 추가 분류했습니다.');});});
}
const originalPreview=showPreview;
showPreview=async function(id,navigation=false){
 if(!navigation)previewList=filtered().map(i=>i.id);previewId=id;
 await originalPreview(id);const host=$('#previewBody');if(!host||appLocked||previewId!==id)return;
 const tools=document.createElement('div');tools.className='preview-tools';tools.id='previewNavigation';
 const index=previewList.indexOf(id);tools.innerHTML=`<button id="previewPrevious" ${index<=0?'disabled':''}>← 이전</button><span>${index+1} / ${previewList.length}</span><button id="previewNext" ${index>=previewList.length-1?'disabled':''}>다음 →</button>`;
 host.before(tools);
 $('#previewPrevious').onclick=()=>attempt(()=>showPreview(previewList[index-1],true));$('#previewNext').onclick=()=>attempt(()=>showPreview(previewList[index+1],true));
 const image=host.querySelector('img');if(image){
  let zoom=1;const controls=document.createElement('div');controls.className='preview-tools';controls.innerHTML='<button id="previewZoomOut">− 축소</button><output id="previewZoomLabel">화면 맞춤</output><button id="previewZoomIn">＋ 확대</button><button id="previewZoomFit">화면 맞춤</button>';tools.after(controls);host.classList.add('image-stage');
  const resize=async step=>{await image.decode().catch(()=>{});if(!image.naturalWidth)return;zoom=Math.max(.25,Math.min(4,zoom+step));image.style.maxWidth='none';image.style.maxHeight='none';image.style.width=Math.round(image.naturalWidth*zoom)+'px';$('#previewZoomLabel').textContent=Math.round(zoom*100)+'%';};
  $('#previewZoomOut').onclick=()=>resize(-.25);$('#previewZoomIn').onclick=()=>resize(.25);$('#previewZoomFit').onclick=()=>{zoom=1;image.style.width='';image.style.maxWidth='';image.style.maxHeight='';$('#previewZoomLabel').textContent='화면 맞춤';};
 }
 const pre=host.querySelector('.document-text');if(pre){const search=document.createElement('div');search.className='preview-tools';search.innerHTML='<input id="previewTextQuery" placeholder="이 문서 본문에서 찾기"><button id="previewTextFind">찾기</button><span id="previewTextCount"></span>';tools.after(search);const text=pre.textContent;
  const find=()=>{const term=$('#previewTextQuery').value.trim();pre.replaceChildren();if(!term){pre.textContent=text;$('#previewTextCount').textContent='';return;}let pos=0,count=0,first;const lower=text.toLocaleLowerCase(),needle=term.toLocaleLowerCase();while(count<2000){const at=lower.indexOf(needle,pos);if(at<0)break;pre.append(document.createTextNode(text.slice(pos,at)));const mark=document.createElement('mark');mark.textContent=text.slice(at,at+term.length);pre.append(mark);first??=mark;pos=at+term.length;count++;}pre.append(document.createTextNode(text.slice(pos)));$('#previewTextCount').textContent=(count>=2000?'2000+':count)+'건';first?.scrollIntoView({block:'nearest'});};
  $('#previewTextFind').onclick=find;$('#previewTextQuery').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();find();}};
 }
};
document.addEventListener('keydown',e=>{
 if(appLocked)return;const typing=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing&&!$('#modal').open){e.preventDefault();attempt(undoFileAction);}
 if($('#previewNavigation')&&!typing&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const button=$(e.key==='ArrowLeft'?'#previewPrevious':'#previewNext');if(button&&!button.disabled)button.click();}
});
$('#advancedSearch').onclick=()=>advancedSearch();$('#addSmart').onclick=()=>advancedSearch();$('#manageTags').onclick=tagManager;$('#undoFile').onclick=()=>attempt(undoFileAction);$('#importHistory').onclick=()=>showImportResults();
$('#smartNav').onclick=e=>{const button=e.target.closest('[data-view]');if(button){$('#search').value='';setView(button.dataset.view);}};
$('#smartNav').oncontextmenu=e=>{const button=e.target.closest('[data-view]');if(button){e.preventDefault();smartMenu(button.dataset.view.slice(6));}};
api.onMenu(name=>{if(name==='undo'){const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);attempt(typing?()=>api.undoText():undoFileAction);}});
api.onBackupStatus(status=>{if(!appLocked)notify(status.lastError?'자동 백업 실패: '+status.lastError:'자동 백업을 완료했습니다.',!!status.lastError);});

$('#advancedSummary').onclick=()=>{resetAdvancedFilter();$('#search').value='';setView('all');};
