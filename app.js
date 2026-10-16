import {DATA} from './data.js';
import {MATERIALS,STATUS,COVERAGE_SECTIONS,initialState,industryOptions,lookupIndustry,assess,badgeClass} from './engine.js';

const STORAGE_KEY='care-ring-fire-simulator-draft-v1';
const $=(id)=>document.getElementById(id);
const htmlEscape=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=initialState();
let activePage='design';
let statusFilter='all';
let currentResult;

try{
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
  if(saved&&typeof saved==='object'&&DATA.industryTypes[saved.kind]){
    state={...state,...saved,answers:{...state.answers,...saved.answers}};
    if(!industryOptions(state.kind).includes(state.industry))state.industry=industryOptions(state.kind)[0];
  }
}catch{/* Storage can be disabled in private sessions; calculator still works. */}

function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{/* fail quietly */}}
function useOptions(element,entries,chosen){
  const fragment=document.createDocumentFragment();
  for(const val of entries){const option=new Option(val,val);if(val===chosen)option.selected=true;fragment.append(option);}
  element.replaceChildren(fragment);
}
function renderIndustrySelect(filter=''){
  const term=filter.trim().toLocaleLowerCase('ko');
  const list=industryOptions(state.kind).filter(name=>{
    if(!term)return true;
    const entry=lookupIndustry(name);
    return name.toLocaleLowerCase('ko').includes(term)||entry?.code.includes(term);
  });
  const items=list.includes(state.industry)?list:[state.industry,...list];
  useOptions($('industry'),[...new Set(items)],state.industry);
  if(list.length===0){$('industryFilter').setAttribute('aria-invalid','true');$('industryFilter').title='조건에 맞는 업종이 없습니다. 다른 단어로 검색하세요.';}
  else{$('industryFilter').removeAttribute('aria-invalid');$('industryFilter').title='';}
}

function mountInputs(){
  for(const id of ['kind','floor','pillar','roof','wall','entrance']){
    if(['pillar','roof','wall'].includes(id))useOptions($(id),MATERIALS[id],state[id]);
    else $(id).value=state[id];
  }
  $('area').value=state.area;
  $('approvedAt').value=state.approvedAt;
  renderIndustrySelect();
}

function showPage(page){
  activePage=page;
  document.querySelectorAll('.nav-tab').forEach(tab=>{
    const isActive=tab.dataset.page===page;
    tab.classList.toggle('active',isActive);
    if(isActive)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
  });
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  if(page==='facility')renderFacilityResults();
  if(page==='ksic')renderKsicResults();
  if(page==='questions')renderQuestions();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderResults(){
  currentResult=assess(state);
  const r=currentResult;
  const numericArea=Number(state.area);
  $('pyeong').textContent=state.area!==''&&Number.isFinite(numericArea)?`${(numericArea/3.3058).toFixed(1)} 평`:'—';
  $('age').textContent=r.age.reason==='날짜오류'?'날짜오류':r.age.age===null?'미입력':`${r.age.age}년`;
  $('grade').textContent=`${r.grading.grade}급`;
  $('gradeDetails').textContent=r.grading.grade===1?'기둥·지붕·외벽 전체 내화구조':r.grading.grade===2?'기둥·외벽 내화 + 지붕 불연':r.grading.grade===4?'가연재료가 있는 구조':'기둥·지붕·외벽 성능 기준';
  $('product').textContent=r.product;
  $('productDetails').textContent=r.product==='운전자상해보험'?'주택물건 1·2급 자동추천 · 성공파트너도 가능':'현재 파일 기준 자동추천 · 현행 인수 확인';
  const legalBox=$('legalBox');
  legalBox.textContent=r.legal;
  legalBox.className=`legal-result${r.legal.includes('🚨')?' important':r.legal.includes('확인')||r.legal.includes('별도')?' review':''}`;
  const summaries=[
    ['필수',r.counts.required,'required'],['권장',r.counts.recommended,'recommended'],['선택',r.counts.optional,'optional'],
    ['확인·제한',r.coverage.filter(x=>x.status!==STATUS.NONE&&![STATUS.REQUIRED,STATUS.RECOMMENDED,STATUS.OPTIONAL].includes(x.status)).length,'review'],
  ];
  $('summary').innerHTML=summaries.map(([label,count,type])=>`<div class="summary-card ${type}"><span>${label}</span><strong>${count}</strong></div>`).join('');
  renderCoverage();
}

function matchesFilter(item){
  if(statusFilter==='all')return true;
  if(statusFilter==='other')return item.status!==STATUS.NONE&&![STATUS.REQUIRED,STATUS.RECOMMENDED,STATUS.OPTIONAL].includes(item.status);
  return item.status===statusFilter;
}
function renderCoverage(){
  if(!currentResult)return;
  const filtered=currentResult.coverage.filter(matchesFilter);
  const groups=COVERAGE_SECTIONS.map(section=>({section,rows:filtered.filter(item=>item.section===section)})).filter(group=>group.rows.length);
  if(groups.length===0){$('coverages').innerHTML='<div class="empty">선택한 상태에 해당하는 담보가 없습니다.</div>';return;}
  $('coverages').innerHTML=groups.map(({section,rows})=>`
    <section class="coverage-section">
      <h3>${htmlEscape(section)}</h3>
      ${rows.map(item=>`
        <div class="coverage-item">
          <details>
            <summary><span class="coverage-name">${htmlEscape(item.name)}</span><span class="badge ${badgeClass(item.status)}">${htmlEscape(item.status)}</span></summary>
            <div class="coverage-detail">
              <p><strong>이런 사고에 필요해요</strong>${htmlEscape(item.example)}</p>
              <p><strong>신인 설계 포인트</strong>${htmlEscape(item.why)}</p>
              <p class="span-full"><strong>고객에게 확인할 질문</strong>${htmlEscape(item.question)}</p>
              <p class="span-full soft-note">${htmlEscape(item.acceptance)}</p>
            </div>
          </details>
        </div>`).join('')}
    </section>`).join('');
}

function questionControl(q){
  const answer=state.answers[q.id]??(q.kind==='count'?'':'미확인');
  if(q.kind==='count'){
    return `<input type="number" min="0" step="1" data-question="${htmlEscape(q.id)}" value="${htmlEscape(answer)}" placeholder="대수 입력" aria-label="${htmlEscape(q.prompt)}">`;
  }
  return `<div class="answer-group" role="group" aria-label="${htmlEscape(q.prompt)}">${['미확인','예','아니오'].map(choice=>`
    <label class="answer-choice"><input type="radio" name="answer-${htmlEscape(q.id)}" data-question="${htmlEscape(q.id)}" value="${choice}" ${answer===choice?'checked':''}><span>${choice}</span></label>`).join('')}</div>`;
}
function renderQuestions(){
  $('questionList').innerHTML=DATA.questions.map(q=>`
    <div class="question-item"><label class="prompt">${htmlEscape(q.prompt)}</label>${questionControl(q)}<p>${htmlEscape(q.hint)}</p></div>`).join('');
  const answered=DATA.questions.filter(q=>state.answers[q.id]!==''&&state.answers[q.id]!=='미확인').length;
  $('progressLabel').textContent=`${answered} / ${DATA.questions.length}개 답변`;
  $('answerCount').textContent=answered?`· ${answered}`:'';
}

function renderFacilityResults(){
  const term=$('facilitySearch').value.trim().toLocaleLowerCase('ko');
  const list=DATA.industries.filter(v=>!term||v.name.toLocaleLowerCase('ko').includes(term)||v.code.includes(term)).slice(0,60);
  $('facilityResults').innerHTML=list.map(v=>`
    <div class="lookup-result"><div class="lookup-main"><strong>${htmlEscape(v.name)}</strong>
      <small>직종코드 ${htmlEscape(v.code)} · 시설업종코드 ${htmlEscape(v.facilityCodes||'미확인')} · ${v.facilityCount}개 연결</small>
      ${v.legalNotes?`<small>법정 조건: ${htmlEscape(v.legalNotes)}</small>`:''}
    </div><button type="button" data-select-industry="${htmlEscape(v.code)}">설계에 적용</button></div>`).join('')||'<div class="empty">일치하는 업종이 없습니다.</div>';
  if(DATA.industries.length>60&&!term)$('facilityResults').insertAdjacentHTML('beforeend','<p class="lookup-caption">먼저 60개 업종을 표시합니다. 검색어를 입력하면 더 쉽게 찾을 수 있습니다.</p>');
}

function renderKsicResults(){
  const term=$('ksicSearch').value.trim().toLocaleLowerCase('ko');
  if(!term){$('ksicResults').innerHTML='<div class="empty">업종명이나 KSIC 코드를 입력하세요. 1,202개 참고 업종에서 검색합니다.</div>';return;}
  const rows=DATA.ksic.filter(v=>v.name.toLocaleLowerCase('ko').includes(term)||v.code.includes(term)||v.taxCode.includes(term)).slice(0,75);
  $('ksicResults').innerHTML=rows.map(v=>`<div class="lookup-result"><div class="lookup-main"><strong>${htmlEscape(v.name)}</strong><small>KSIC ${htmlEscape(v.code)} · 국세청 ${htmlEscape(v.taxCode)} · ${htmlEscape(v.major)} / ${htmlEscape(v.middle)}</small></div></div>`).join('')||'<div class="empty">검색 결과가 없습니다.</div>';
  if(rows.length===75)$('ksicResults').insertAdjacentHTML('beforeend','<p class="lookup-caption">최대 75개를 표시합니다. 검색어를 더 구체적으로 입력해주세요.</p>');
}

mountInputs();
renderQuestions();
renderResults();

document.querySelectorAll('.nav-tab').forEach(tab=>tab.addEventListener('click',()=>showPage(tab.dataset.page)));
for(const id of ['floor','pillar','roof','wall','entrance','industry']){
  $(id).addEventListener('change',event=>{state[id]=event.target.value;save();renderResults();});
}
for(const id of ['approvedAt','area']){
  $(id).addEventListener('input',event=>{state[id]=event.target.value;save();renderResults();});
}
$('kind').addEventListener('change',event=>{
  state.kind=event.target.value;
  state.industry=industryOptions(state.kind)[0];
  $('industryFilter').value='';
  renderIndustrySelect();save();renderResults();
});
$('industryFilter').addEventListener('input',event=>renderIndustrySelect(event.target.value));
document.querySelectorAll('.filter-pill').forEach(button=>button.addEventListener('click',()=>{
  statusFilter=button.dataset.status;
  document.querySelectorAll('.filter-pill').forEach(el=>el.classList.toggle('active',el===button));
  renderCoverage();
}));

$('questionList').addEventListener('change',event=>{
  const id=event.target.dataset.question;
  if(!id)return;
  state.answers[id]=event.target.value;
  save();renderResults();
  const answered=DATA.questions.filter(q=>state.answers[q.id]!==''&&state.answers[q.id]!=='미확인').length;
  $('progressLabel').textContent=`${answered} / ${DATA.questions.length}개 답변`;
  $('answerCount').textContent=answered?`· ${answered}`:'';
});
$('clearAnswers').addEventListener('click',()=>{
  state.answers=initialState().answers;save();renderQuestions();renderResults();
});
$('resetButton').addEventListener('click',()=>{
  if(!window.confirm('입력한 업종·건물·현장 답변을 모두 초기화할까요?'))return;
  state=initialState();statusFilter='all';
  document.querySelectorAll('.filter-pill').forEach(el=>el.classList.toggle('active',el.dataset.status==='all'));
  $('industryFilter').value='';mountInputs();save();renderQuestions();renderResults();window.scrollTo({top:0,behavior:'smooth'});
});
for(const id of ['questionsShortcut','backToDesign'])$(id).addEventListener('click',()=>showPage(id==='backToDesign'?'design':'questions'));
for(const id of ['printButton','bottomPrint'])$(id).addEventListener('click',()=>window.print());
$('facilitySearch').addEventListener('input',renderFacilityResults);
$('facilityResults').addEventListener('click',event=>{
  const button=event.target.closest('button[data-select-industry]');if(!button)return;
  const entry=DATA.industries.find(v=>v.code===button.dataset.selectIndustry);
  if(!entry)return;
  state.kind='일반물건';state.industry=entry.name;
  $('kind').value=state.kind;$('industryFilter').value='';renderIndustrySelect();save();renderResults();showPage('design');
});
$('ksicSearch').addEventListener('input',renderKsicResults);
