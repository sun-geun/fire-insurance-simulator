import { DATA } from './data.js';

// v9 엑셀의 C18:C50 / F6 / B14 / D7 판정식의 웹 이식.
// 실제 담보 인수 승인·약관 보상 판정이 아니라 신인 설계 순서 안내에 사용한다.
export const STATUS = Object.freeze({
  REQUIRED:'[필수]', RECOMMENDED:'[권장]', OPTIONAL:'[선택]',
  INELIGIBLE:'[인수불가]', NONE:'해당없음',
  NEED_INPUT:'[입력필요]', CONDITION:'[시설조건]',
});

export const MATERIALS = {
  pillar: ['철골철근콘크리트조','철근콘크리트조','벽돌/블록/석조','흙벽조','철골조','파이프조','목조'],
  roof: ['슬라브지붕','슬라브위 기와지붕','슬레이트지붕','판넬지붕','칼라피복철판지붕','기와지붕','천막지붕','목재지붕'],
  wall: ['콘크리트외벽','벽돌/블록외벽','판넬외벽','칼라피복철판외벽','슬레이트외벽','흙외벽','천막외벽','목재외벽'],
};

export const DEFAULT_STATE = Object.freeze({
  kind:'일반물건', industry:'휴게음식점', floor:'지하층', area:'115.5',
  pillar:'철근콘크리트조', roof:'슬라브지붕', wall:'콘크리트외벽',
  approvedAt:'', entrance:'미확인',
  answers:Object.fromEntries(DATA.questions.map(q=>[q.id,q.kind==='count'?'':'미확인'])),
});

export function initialState(){return {...DEFAULT_STATE,answers:{...DEFAULT_STATE.answers}};}
export function industryOptions(kind){return DATA.industryTypes[kind]??[];}
export function lookupIndustry(industry){return DATA.industries.find(v=>v.name===industry)??null;}

export function parseApproval(input, today=new Date()){
  const raw=String(input??'').trim();
  if(!raw)return {age:null,date:null,reason:'미입력'};
  const match=raw.match(/^(\d{4})(\d{2})(\d{2})$/)??raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return {age:null,date:null,reason:'날짜오류'};
  const year=Number(match[1]), month=Number(match[2]), day=Number(match[3]);
  if(year<1900||year>2999)return {age:null,date:null,reason:'날짜오류'};
  const date=new Date(year,month-1,day,12,0,0);
  if(date.getFullYear()!==year||date.getMonth()+1!==month||date.getDate()!==day)return {age:null,date:null,reason:'날짜오류'};
  const current=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12,0,0);
  if(date>current)return {age:null,date:null,reason:'날짜오류'};
  let age=current.getFullYear()-year;
  if(current.getMonth()+1<month||(current.getMonth()+1===month&&current.getDate()<day))age--;
  return {age,date:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,reason:''};
}

export function buildingGrade(state){
  const pillar=['철골철근콘크리트조','철근콘크리트조','벽돌/블록/석조','흙벽조'].includes(state.pillar)?'내화구조':['철골조','파이프조'].includes(state.pillar)?'불연재료':'가연재료';
  const roof=['슬라브지붕','슬라브위 기와지붕'].includes(state.roof)?'내화구조':['슬레이트지붕','판넬지붕','칼라피복철판지붕','기와지붕'].includes(state.roof)?'불연재료':'가연재료';
  const wall=['콘크리트외벽','벽돌/블록외벽'].includes(state.wall)?'내화구조':['판넬외벽','칼라피복철판외벽','슬레이트외벽','흙외벽'].includes(state.wall)?'불연재료':'가연재료';
  let grade=3;
  if([pillar,roof,wall].includes('가연재료'))grade=4;
  else if([pillar,roof,wall].every(x=>x==='내화구조'))grade=1;
  else if(pillar==='내화구조'&&roof==='불연재료'&&wall==='내화구조')grade=2;
  return {grade,components:{pillar,roof,wall}};
}

export function diagnoseLegal(state){
  const industry=String(state.industry??'');
  const industryData=lookupIndustry(industry);
  const multi=industryData?.multi??'-';
  const disaster=industryData?.disaster??'-';
  const special=state.answers?.SPECIAL==='예';
  const floor=state.floor, entrance=state.entrance;
  const area=String(state.area??'').trim()===''?null:Number(state.area);
  if(special)return '별도 법정의무보험 우선 (특수건물 등)';
  if(state.kind==='주택물건')return '✅ 일반가입 (주택 별도법정대상 조회)';
  if(multi==='음식'||industry==='제과점'||industry.includes('공유주방')){
    if(area===null||!Number.isFinite(area))return '면적 입력필요';
    if(floor==='지하층')return area>=66?'🚨 다중이용업소 의무 (지하 66㎡↑)':'✅ 일반가입';
    if(area<100)return '✅ 일반가입';
    if(floor==='1층'){
      if(entrance==='비직통 또는 내부복층')return '🚨 다중이용업소 의무 (1층 비직통·복층)';
      if(industry==='제과점'||industry.includes('공유주방'))return entrance==='외부지면 직통·단층'?'✅ 일반가입':'다중 시설조건 확인 (제과·공유주방 출입구)';
      return entrance==='미확인'?'🚨 재난배상 1차추천 (출입구 확인)':'🚨 재난배상 의무 (1층 100㎡↑)';
    }
    if(floor==='2층 이상'||floor==='건물전체')return entrance==='외부지면 직통·단층'?'재난 시설조건 확인 (지면접층 여부)':'🚨 다중이용업소 의무 (2층 이상 100㎡↑)';
    return '층수 입력필요';
  }
  if(multi==='의무')return '🚨 다중이용업소 의무';
  if(multi==='게임'){
    if(floor==='1층'&&entrance==='외부지면 직통·단층')return '다중 시설조건 확인 (PC방·방탈출 구분)';
    if(entrance==='미확인')return '🚨 다중이용업소 1차추천 (출입구·허가유형 확인)';
    return '🚨 다중이용업소 의무 (게임업)';
  }
  if(disaster==='의무')return '🚨 재난배상 의무';
  if(multi==='조건')return '다중 시설조건 확인';
  if(disaster==='조건')return '재난 시설조건 확인';
  return '✅ 일반가입';
}

const includesAny=(subject,words)=>words.some(w=>subject.includes(w));
const isYes=(answers,id)=>answers[id]==='예';
const isNo=(answers,id)=>answers[id]==='아니오';

export function assess(state,today=new Date()){
  const kind=state.kind;
  const housing=kind==='주택물건',factory=kind==='공장물건',general=kind==='일반물건';
  const industry=String(state.industry??'');
  const answers=state.answers??{};
  const age=parseApproval(state.approvedAt,today);
  const grading=buildingGrade(state);
  const product=housing&&(grading.grade===1||grading.grade===2)?'운전자상해보험':'성공파트너';
  const legal=diagnoseLegal(state);
  const result={};
  const R=STATUS.REQUIRED,O=STATUS.OPTIONAL,G=STATUS.RECOMMENDED,N=STATUS.NONE,X=STATUS.INELIGIBLE,I=STATUS.NEED_INPUT;
  const get=(id)=>result[id];

  result[18]=isNo(answers,'BUILDING')?N:R;
  result[19]=housing||isNo(answers,'STOCK')?N:R;
  result[20]=housing||isNo(answers,'FACILITY')?N:R;
  result[21]=housing||isNo(answers,'EQUIPMENT')?N:R;
  result[22]=factory&&!isNo(answers,'MACHINE')?R:N;
  result[23]=housing&&!isNo(answers,'HOUSEHOLD')?R:N;

  result[25]=legal.includes('🚨 다중')?R:legal.includes('다중 시설조건')?STATUS.CONDITION:legal==='면적 입력필요'?I:N;
  result[26]=legal.includes('🚨 재난')?R:legal.includes('재난 시설조건')?STATUS.CONDITION:legal==='면적 입력필요'?I:N;
  result[24]=isYes(answers,'SPECIAL')?'[중복확인]':housing?R:[get(25),get(26)].includes(R)?N:R;
  result[27]=housing?N:isYes(answers,'CHILD')?R:isNo(answers,'CHILD')?N:includesAny(industry,['아동','보육','유치원','놀이터'])?'[시설확인]':N;
  result[28]=housing||isNo(answers,'ACADEMY')?N:isYes(answers,'ACADEMY')||includesAny(industry,['학원','교습소'])?R:N;
  result[29]=housing||isNo(answers,'GAS')?N:isYes(answers,'GAS')?G:factory?O:includesAny(industry,['음식점','다방','제과','주점'])?G:N;
  result[30]=housing||isNo(answers,'MEDICAL')?N:isYes(answers,'MEDICAL')||includesAny(industry,['의약','의원','병원','의료시설'])?G:N;
  result[31]=housing||isNo(answers,'FOOD')?N:isYes(answers,'FOOD')?R:isYes(answers,'FOOD_RETAIL')?G:includesAny(industry,['음식점','제과','다방','주점'])?R:includesAny(industry,['판매시설','슈퍼마켓','소매점'])?O:N;
  result[32]=housing||isNo(answers,'BEAUTY')?N:isYes(answers,'BEAUTY')||includesAny(industry,['이용원','미용원','미용관련'])?R:N;

  if(housing||!(isYes(answers,'FUEL')||industry.includes('주유소('))){result[33]=N;}
  else {
    const total=answers.PUMPS_TOTAL===''||answers.PUMPS_TOTAL==null?null:Number(answers.PUMPS_TOTAL);
    const protectedCount=answers.PUMPS_PROTECTED===''||answers.PUMPS_PROTECTED==null?null:Number(answers.PUMPS_PROTECTED);
    if(total!==null&&protectedCount!==null&&Number.isFinite(total)&&Number.isFinite(protectedCount)){
      result[33]=total<=0||protectedCount>total?'[입력오류]':protectedCount<total?X:isYes(answers,'PUMPS_PROOF')?R:'[증빙확인]';
    } else result[33]='[필수·설치확인]';
  }
  const facility=lookupIndustry(industry);
  result[34]=!general?N:!facility||facility.facilityCount===0?X:includesAny(industry,['학원','미용','이용원'])?O:R;
  result[35]=housing||isNo(answers,'CUSTODY')?N:isYes(answers,'CUSTODY')||includesAny(industry,['세탁','목욕장','찜질','숙박','호텔','여관','펜션'])?G:N;
  result[36]=housing||factory||isNo(answers,'PARK')?N:industry.includes('주차전용건물')?R:isYes(answers,'PARK')?G:O;
  result[37]=housing||isNo(answers,'AUTO_REPAIR')?N:isYes(answers,'AUTO_REPAIR')?R:includesAny(industry,['세차장','정비학원'])?N:includesAny(industry,['경정비','검사장','자동차수리'])?R:N;
  result[38]=!housing||isNo(answers,'LANDLORD')?N:age.reason?I:age.age>=20?X:isYes(answers,'LANDLORD')?G:O;

  result[39]=O;
  result[40]=O;
  result[41]=housing?N:isNo(answers,'GAS')&&isNo(answers,'EXPLOSION')?O:G;
  result[42]=housing||isNo(answers,'REFRIG')?N:isYes(answers,'REFRIG')||includesAny(industry,['음식점','도매','시장','제과','휴게','판매','슈퍼','마트'])?G:O;
  result[43]=housing?N:factory?G:O;
  result[44]=general&&!isNo(answers,'STORE')?G:N;
  result[45]=housing||isNo(answers,'GLASS')?N:state.floor==='1층'||isYes(answers,'GLASS')?G:O;
  result[46]=housing||isNo(answers,'VEHICLE_APPROACH')?N:isYes(answers,'VEHICLE_APPROACH')?G:state.floor==='1층'?O:N;
  result[47]=industry==='주거용 오피스텔'?N:R;
  result[48]=factory||isNo(answers,'SPRINKLER')?N:O;
  result[49]=factory?X:housing?isNo(answers,'PIPE')?N:R:general?isNo(answers,'PIPE')?N:age.reason?I:age.age>=20?X:G:N;
  result[50]=housing&&industry!=='주거용 오피스텔'?R:N;

  const coverage=DATA.coverages.map(item=>({...item,status:result[item.id]}));
  return {kind,industry,age,grading,product,legal,coverage,facility,byId:result,
    counts:{required:coverage.filter(v=>v.status===R).length,recommended:coverage.filter(v=>v.status===G).length,optional:coverage.filter(v=>v.status===O).length,review:coverage.filter(v=>v.status.startsWith('[')&&![R,G,O,X].includes(v.status)).length}};
}

export const COVERAGE_SECTIONS=[
  '1. 화재손해','2. 배상책임','3. 건물','4. 기타특약',
];

export function badgeClass(status){
  if(status===STATUS.REQUIRED)return 'required';
  if(status===STATUS.RECOMMENDED)return 'recommended';
  if(status===STATUS.OPTIONAL)return 'optional';
  if(status===STATUS.INELIGIBLE)return 'ineligible';
  if(status===STATUS.NONE)return 'none';
  return 'review';
}
