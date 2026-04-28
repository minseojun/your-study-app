/* ============================================================
   StudyFlow v8 — script.js
   기본 기능 유지 + 수면 관리 + 취약 과목 탐지 전략가 모드
   ============================================================ */
'use strict';

/* ── AI 코치 호출 (Claude 서버리스 대응) ── */
async function callCoach(prompt) {
  const res = await fetch('/api/coach', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error || 'AI 코치와 연결할 수 없습니다.');
  }

  const data = await res.json();
  return data.text || '';
}

// 기존 callGemini 참조 유지
async function callGemini(prompt) {
  return await callCoach(prompt);
}

/* ── 상수 및 로컬스토리지 키 ── */
const SUNEUNG = new Date('2026-11-19T00:00:00');
const SUBJECTS = ['국어','영어','수학','사회문화','생활과윤리'];
const SUBJECT_COLORS = {'국어':'#ff6b6b','영어':'#51cf66','수학':'#339af0','사회문화':'#ffa94d','생활과윤리':'#cc5de8'};
const K = {
  TODAY_TASKS :'sf_today_tasks',
  TMRW_TASKS  :'sf_tmrw_tasks',
  TODAY_DATE  :'sf_today_date',
  TIMER_STATE :'sf_timer_state',
  HISTORY     :'sf_history',
  GOALS       :'sf_goals',
  NIGHT       :'sf_night',
  LAST_REPORT :'sf_last_report',
  SLEEP_LOGS  :'sf_sleep_logs', // 수면 기록 데이터
};

/* ── 유틸리티 ── */
const pad2   = n => String(Math.floor(n)).padStart(2,'0');
const msToHMS = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; return h>0?`${pad2(h)}:${pad2(m)}:${pad2(s)}`:`${pad2(m)}:${pad2(s)}`; };
const msToReadable = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; if(h>0)return`${h}시간 ${pad2(m)}분`; if(m>0)return`${m}분 ${pad2(s)}초`; return`${s}초`; };
const getDday = () => { const a=new Date();a.setHours(0,0,0,0);const b=new Date(SUNEUNG);b.setHours(0,0,0,0);return Math.max(0,Math.round((b-a)/86400000)); };
const todayStr = () => new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\.\s*/g,'-').replace(/-$/,'');
const lsGet = k => { try{return JSON.parse(localStorage.getItem(k));}catch{return null;} };
const lsSet = (k,v) => localStorage.setItem(k,JSON.stringify(v));

/* ── 집중 점수 계산 ── */
function calcLiveScore(tMs, sess, dist, doneT, totalT, st) {
  if(tMs===0&&sess.length===0) return null;
  let score = 0;
  score += Math.min(40, Math.round(tMs/60000/120*40));
  const longest = sess.length ? Math.max(...sess.map(s=>s.ms)) : 0;
  score += Math.min(20, Math.round(longest/60000/45*20));
  if(totalT>0) score += Math.round(doneT/totalT*20);
  const cats = Object.keys(st).filter(k=>st[k]>0).length;
  score += Math.round(cats/SUBJECTS.length*15);
  score -= dist*4;
  return Math.max(0, Math.min(100, score));
}

/* ══════════════════════════════════════════════════════════
   날짜 및 초기화
   ══════════════════════════════════════════════════════════ */
function checkDateRollover() {
  const last=lsGet(K.TODAY_DATE), now=todayStr();
  if(last===now) return;
  if(last){
    const pt=lsGet(K.TIMER_STATE)||{}, prevTasks=lsGet(K.TODAY_TASKS)||[];
    const history=lsGet(K.HISTORY)||[];
    history.push({
      date:last, totalMs:pt.totalMs||0,
      subjectTime:pt.subjectTime||{}, distractions:pt.distractions||0,
      doneTasks:prevTasks.filter(t=>t.done).length, totalTasks:prevTasks.length,
      sessions:pt.sessions||[],
    });
    lsSet(K.HISTORY, history.slice(-7));
    const incompleteTasks=prevTasks.filter(t=>!t.done);
    const tmrw=lsGet(K.TMRW_TASKS)||[];
    lsSet(K.TMRW_TASKS,[...incompleteTasks,...tmrw]);
    lsSet(K.TODAY_TASKS, tmrw.map(t=>({...t,done:false})));
    lsSet(K.TMRW_TASKS,[]);
    lsSet(K.TIMER_STATE,{elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0});
  }
  lsSet(K.TODAY_DATE,now);
}
checkDateRollover();

document.getElementById('dateBadge').textContent = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'});
const DDAY=getDday();
document.getElementById('dDayCount').textContent=DDAY;
document.getElementById('ddayBadge').textContent=`수능 D-${DDAY}`;

/* ── 바텀 탭 ── */
let activeTab = 'today';
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if(tab === activeTab) return;
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = tab;
    if(tab==='stats') { renderWeeklyStats(); renderHeatmap(); }
  });
});

/* ── 야간 모드 ── */
const nightToggle=document.getElementById('nightToggle');
const nightIcon=document.getElementById('nightIcon');
function setNight(on){
  document.body.classList.toggle('night',on);
  nightIcon.textContent=on?'☀️':'🌙';
  const d=document.getElementById('sepiaDim');
  if(d) d.style.opacity=on?'1':'0';
}
(()=>{const s=lsGet(K.NIGHT);if(s==='on')setNight(true);else if(s==='off')setNight(false);else setNight(new Date().getHours()>=22);})();
nightToggle.addEventListener('click',()=>{const on=!document.body.classList.contains('night');setNight(on);lsSet(K.NIGHT,on?'on':'off');});

/* ══════════════════════════════════════════════════════════
   할 일 및 목표 관리
   ══════════════════════════════════════════════════════════ */
let todayTasks=lsGet(K.TODAY_TASKS)||[];
let tomorrowTasks=lsGet(K.TMRW_TASKS)||[];
let selectedCat='국어';

const S_POST=`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v6.5L10 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 10.5c.8 1.5 2.4 2.5 4.2 2.5 2.8 0 5-2.2 5-5S8 3 5.2 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const S_DEL=`<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const S_BACK=`<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5H2M6.5 2L2 6.5l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildItem(task,idx,isTomorrow){
  const li=document.createElement('li');
  li.className='task-item'+(task.done?' done':'')+(isTomorrow?' tomorrow-item':'');
  if(!isTomorrow){
    const cb=document.createElement('input'); cb.type='checkbox'; cb.className='task-cb'; cb.checked=task.done;
    cb.addEventListener('change',()=>{ todayTasks[idx].done=!todayTasks[idx].done; lsSet(K.TODAY_TASKS,todayTasks); renderToday(); renderGoalBars(); updateLiveScore(); });
    li.appendChild(cb);
  }
  const dot=document.createElement('span'); dot.className=`cat-dot cat-${task.cat||'국어'}`; li.appendChild(dot);
  const txt=document.createElement('span'); txt.className='task-text'; txt.textContent=task.text; li.appendChild(txt);
  const badge=document.createElement('span'); badge.className='cat-badge'; badge.textContent=task.cat||'국어'; li.appendChild(badge);
  const acts=document.createElement('div'); acts.className='task-actions';
  if(!isTomorrow){
    const pb=document.createElement('button'); pb.className='postpone'; pb.title='내일로 미루기'; pb.innerHTML=S_POST;
    pb.addEventListener('click',()=>postponeTask(idx)); acts.appendChild(pb);
  } else {
    const bb=document.createElement('button'); bb.title='오늘로 되돌리기'; bb.innerHTML=S_BACK;
    bb.addEventListener('click',()=>{ todayTasks.push({text:task.text,cat:task.cat,done:false}); tomorrowTasks.splice(idx,1); lsSet(K.TODAY_TASKS,todayTasks); lsSet(K.TMRW_TASKS,tomorrowTasks); renderToday(); renderTomorrow(); });
    acts.appendChild(bb);
  }
  const db=document.createElement('button'); db.className='del'; db.title='삭제'; db.innerHTML=S_DEL;
  db.addEventListener('click',()=>{ if(isTomorrow){tomorrowTasks.splice(idx,1);lsSet(K.TMRW_TASKS,tomorrowTasks);renderTomorrow();}else{todayTasks.splice(idx,1);lsSet(K.TODAY_TASKS,todayTasks);renderToday();} });
  acts.appendChild(db); li.appendChild(acts);
  return li;
}

function renderToday(){
  const tl=document.getElementById('taskList'); tl.innerHTML='';
  todayTasks.forEach((t,i)=>tl.appendChild(buildItem(t,i,false)));
  const total=todayTasks.length,done=todayTasks.filter(t=>t.done).length;
  document.getElementById('emptyState').style.display=total===0?'flex':'none';
  document.getElementById('taskCount').textContent=`${total}개`;
  document.getElementById('progressRow').style.display=total===0?'none':'flex';
  if(total>0){ document.getElementById('doneCount').textContent=done; document.getElementById('totalCount').textContent=total; document.getElementById('progressFill').style.width=Math.round(done/total*100)+'%'; }
}
function renderTomorrow(){
  const tl=document.getElementById('tomorrowList'); tl.innerHTML='';
  tomorrowTasks.forEach((t,i)=>tl.appendChild(buildItem(t,i,true)));
  document.getElementById('tomorrowEmpty').style.display=tomorrowTasks.length===0?'flex':'none';
  document.getElementById('tomorrowCount').textContent=`${tomorrowTasks.length}개`;
}
function postponeTask(idx){ const t=todayTasks.splice(idx,1)[0]; tomorrowTasks.push({text:t.text,cat:t.cat,done:false}); lsSet(K.TODAY_TASKS,todayTasks); lsSet(K.TMRW_TASKS,tomorrowTasks); renderToday(); renderTomorrow(); }
function addTask(){
  const text=document.getElementById('taskInput').value.trim();
  if(!text){ const inp=document.getElementById('taskInput'); inp.classList.add('shake'); inp.addEventListener('animationend',()=>inp.classList.remove('shake'),{once:true}); return; }
  todayTasks.push({text,cat:selectedCat,done:false}); lsSet(K.TODAY_TASKS,todayTasks);
  document.getElementById('taskInput').value=''; renderToday();
}
document.getElementById('addBtn').addEventListener('click',addTask);
document.getElementById('taskInput').addEventListener('keydown',e=>{ if(e.key==='Enter')addTask(); });
document.getElementById('categoryChips').addEventListener('click',e=>{
  const chip=e.target.closest('.chip'); if(!chip) return;
  document.querySelectorAll('#categoryChips .chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active'); selectedCat=chip.dataset.cat;
});

/* ── 목표 설정 ── */
let goals=lsGet(K.GOALS)||{국어:60,영어:60,수학:90,사회문화:45,생활과윤리:45};
function renderGoalBars(){
  const bars=document.getElementById('goalBars'); bars.innerHTML='';
  SUBJECTS.forEach(sub=>{
    const goal=goals[sub]||0; if(!goal) return;
    const actual=Math.round((subjectTime[sub]||0)/60000);
    const pct=Math.min(100,goal>0?Math.round(actual/goal*100):0);
    bars.innerHTML+=`<div class="goal-bar-row"><span class="goal-bar-label">${sub}</span><div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%;background:${SUBJECT_COLORS[sub]}"></div></div><span class="goal-bar-stat">${actual}/${goal}분</span></div>`;
  });
}
document.getElementById('goalEditBtn').addEventListener('click',()=>{
  const p=document.getElementById('goalEditPanel'), inp=document.getElementById('goalInputs');
  if(p.style.display==='block'){ p.style.display='none'; return; }
  inp.innerHTML=''; SUBJECTS.forEach(sub=>{
    inp.innerHTML+=`<div class="goal-input-row"><span class="goal-input-label"><span class="cat-dot cat-${sub}"></span>${sub}</span><input type="number" class="goal-input-field" data-sub="${sub}" value="${goals[sub]||0}" min="0" max="480" step="15"/><span class="goal-input-unit">분</span></div>`;
  });
  p.style.display='block';
});
document.getElementById('goalSave').addEventListener('click',()=>{ document.querySelectorAll('.goal-input-field').forEach(i=>{goals[i.dataset.sub]=parseInt(i.value)||0;}); lsSet(K.GOALS,goals); document.getElementById('goalEditPanel').style.display='none'; renderGoalBars(); showNotif('목표가 저장됐어요 ✅'); });
document.getElementById('goalCancel').addEventListener('click',()=>{ document.getElementById('goalEditPanel').style.display='none'; });

/* ══════════════════════════════════════════════════════════
   타이머 엔진
   ══════════════════════════════════════════════════════════ */
let timerState=lsGet(K.TIMER_STATE)||{elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0};
let elapsed=timerState.elapsed||0, sessions=timerState.sessions||[], distractions=timerState.distractions||0, totalMs=timerState.totalMs||0, subjectTime=timerState.subjectTime||{};
let ticker=null, startTime=null, running=false, sessionStart=null, laps=[], lastLap=0, isFS=false;

const saveTimerState=()=>lsSet(K.TIMER_STATE,{elapsed,subjectTime,sessions,distractions,totalMs});
const nowMs=()=>running?elapsed+(Date.now()-startTime):elapsed;

function tick(){
  const ms=nowMs(),t=Math.floor(ms/1000);
  document.getElementById('swHours').textContent=pad2(Math.floor(t/3600));
  document.getElementById('swMinutes').textContent=pad2(Math.floor((t%3600)/60));
  document.getElementById('swSeconds').textContent=pad2(t%60);
  document.getElementById('swMs').textContent='.'+pad2(Math.floor((ms%1000)/10));
}
function updateAccumLabel(){ document.getElementById('swAccum').textContent=msToReadable(totalMs)||'0분'; }
function updateLiveScore(){
  const done=todayTasks.filter(t=>t.done).length;
  const score=calcLiveScore(totalMs,sessions,distractions,done,todayTasks.length,subjectTime);
  const numEl=document.getElementById('liveScore');
  numEl.textContent=score===null?'—':score;
  if(score!==null) numEl.style.color=score>=80?'var(--ok)':score>=50?'var(--accent)':'var(--danger)';
}

function startTimer(){
  const el=document.documentElement; if(el.requestFullscreen) el.requestFullscreen().catch(()=>{});
  startTime=Date.now(); sessionStart=Date.now(); ticker=setInterval(tick, 30); running=true;
  const btn=document.getElementById('startStopBtn'); btn.textContent='정지'; btn.classList.add('stop');
  document.getElementById('lapBtn').disabled=false; document.getElementById('swDisplay').classList.add('running');
  document.getElementById('brandDot').classList.add('pulse'); document.getElementById('fsHint').textContent='🟢 집중 모드 실행 중';
  startNotifTimer();
}
function stopTimer(){
  const sMs=Date.now()-sessionStart, startHour=new Date(sessionStart).getHours();
  sessions=[...sessions,{ms:sMs,startHour}]; totalMs+=sMs; subjectTime[selectedCat]=(subjectTime[selectedCat]||0)+sMs;
  elapsed+=Date.now()-startTime; clearInterval(ticker); running=false;
  const btn=document.getElementById('startStopBtn'); btn.textContent='계속'; btn.classList.remove('stop');
  document.getElementById('lapBtn').disabled=true; document.getElementById('swDisplay').classList.remove('running');
  document.getElementById('brandDot').classList.remove('pulse'); document.getElementById('fsHint').textContent='▶ 시작 시 전체화면으로 전환돼요';
  updateAccumLabel(); saveTimerState(); renderGoalBars(); updateLiveScore(); stopNotifTimer();
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  showReport();
}
function resetTimer(){
  elapsed=0; sessions=[]; totalMs=0; distractions=0; subjectTime={}; saveTimerState();
  ['swHours','swMinutes','swSeconds'].forEach(id=>document.getElementById(id).textContent='00');
  document.getElementById('swMs').textContent='.00'; updateAccumLabel(); updateLiveScore(); renderGoalBars();
  document.getElementById('startStopBtn').textContent='시작';
}
document.getElementById('startStopBtn').addEventListener('click',()=>running?stopTimer():startTimer());
document.getElementById('resetBtn').addEventListener('click',resetTimer);

/* ══════════════════════════════════════════════════════════
   [신규] 수면 관리 기능
   ══════════════════════════════════════════════════════════ */
let sleepStartTime = lsGet('sf_temp_sleep'); 
function updateSleepUI() {
  const status = document.getElementById('sleepStatus'), btnSleep = document.getElementById('btnSleepNow'), btnWake = document.getElementById('btnWakeUp');
  if (sleepStartTime) {
    status.textContent = '수면 중...'; status.className = 'badge accent';
    btnSleep.disabled = true; btnWake.disabled = false;
  } else {
    status.textContent = '활동 중'; status.className = 'badge muted';
    btnSleep.disabled = false; btnWake.disabled = true;
  }
}
document.getElementById('btnSleepNow').addEventListener('click', () => {
  sleepStartTime = Date.now(); lsSet('sf_temp_sleep', sleepStartTime); updateSleepUI();
  showNotif('잘 자요! 푹 쉬고 내일 만나요 🌙', '💤');
});
document.getElementById('btnWakeUp').addEventListener('click', () => {
  if (!sleepStartTime) return;
  const duration = Math.round((Date.now() - sleepStartTime) / 60000);
  const logs = lsGet(K.SLEEP_LOGS) || [];
  logs.push({ date: todayStr(), durationMin: duration });
  lsSet(K.SLEEP_LOGS, logs.slice(-7)); sleepStartTime = null; localStorage.removeItem('sf_temp_sleep');
  updateSleepUI(); showNotif('상쾌한 아침이에요! 오늘도 화이팅 ☀️', '✨');
});

/* ══════════════════════════════════════════════════════════
   알림 및 집중 오버레이
   ══════════════════════════════════════════════════════════ */
let notifTimer=null;
function showNotif(msg,icon='🔔'){
  const t=document.getElementById('notifToast'); document.getElementById('notifMsg').textContent=msg;
  document.getElementById('notifIcon').textContent=icon; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),5000);
}
function startNotifTimer(){ const mins=parseInt(document.getElementById('notifInterval').value); if(document.getElementById('notifToggle').checked) notifTimer=setInterval(()=>new Notification('StudyFlow ⏰', {body:`${mins}분 공부 완료! 5분 쉬어가세요.`}), mins*60000); }
function stopNotifTimer(){ clearInterval(notifTimer); }

const focusOverlay=document.getElementById('focusOverlay');
function showOverlay(){ if(running) { distractions++; saveTimerState(); focusOverlay.classList.add('show'); updateLiveScore(); } }
document.getElementById('overlayBackBtn').addEventListener('click',()=>focusOverlay.classList.remove('show'));
document.addEventListener('visibilitychange',()=>{ if(document.hidden && running) showOverlay(); });

/* ══════════════════════════════════════════════════════════
   통계 및 히트맵
   ══════════════════════════════════════════════════════════ */
let weeklyChartInst=null;
function getHistoryWithToday(){
  return [...(lsGet(K.HISTORY)||[]), {date:todayStr(), totalMs, subjectTime, distractions, sessions, doneTasks:todayTasks.filter(t=>t.done).length, totalTasks:todayTasks.length}].slice(-7);
}
function renderWeeklyStats(){
  const all=getHistoryWithToday(), weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  document.getElementById('weeklyTotal').textContent=msToReadable(weekTotal);
  const labels=all.map(d=>d.date.slice(-5)), mins=all.map(d=>Math.round(d.totalMs/60000));
  if(weeklyChartInst) weeklyChartInst.destroy();
  weeklyChartInst=new Chart(document.getElementById('weeklyChart'),{type:'bar',data:{labels,datasets:[{data:mins,backgroundColor:'#0071e3',borderRadius:6}]},options:{plugins:{legend:{display:false}}}});
}
function renderHeatmap(){
  const map=new Array(24).fill(0); getHistoryWithToday().forEach(day=>(day.sessions||[]).forEach(s=>map[s.startHour]+=s.ms));
  const grid=document.getElementById('heatmapGrid'), maxVal=Math.max(...map,1); grid.innerHTML='';
  map.forEach((ms,h)=>{
    const cell=document.createElement('div'); cell.className='hm-cell';
    const lvl=ms===0?0:ms<maxVal*.25?1:ms<maxVal*.5?2:ms<maxVal*.75?3:4;
    cell.setAttribute('data-lvl',lvl); cell.title=`${h}시: ${msToReadable(ms)}`; grid.appendChild(cell);
  });
}

/* ══════════════════════════════════════════════════════════
   AI 코치 (취약 과목 탐지 전략 포함)
   ══════════════════════════════════════════════════════════ */
function collectData(){
  const all=getHistoryWithToday(), sleepLogs=lsGet(K.SLEEP_LOGS)||[];
  const avgSleep = sleepLogs.length ? Math.round(sleepLogs.reduce((s,l)=>s+l.durationMin,0)/sleepLogs.length) : 0;
  const weekSubMs={}; all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>weekSubMs[k]=(weekSubMs[k]||0)+v));
  return {
    dday:DDAY, todayMin:Math.round(totalMs/60000), distractions,
    doneTasks:todayTasks.filter(t=>t.done).length, totalTasks:todayTasks.length,
    todaySubjectMin:Object.fromEntries(Object.entries(subjectTime).map(([k,v])=>[k,Math.round(v/60000)])),
    weekSubjectMin:Object.fromEntries(Object.entries(weekSubMs).map(([k,v])=>[k,Math.round(v/60000)])),
    goalMin:goals, avgSleepMin:avgSleep
  };
}

function buildPrompt(d){
  const subStatus = Object.entries(d.goalMin).map(([k,v])=>`${k}:실제${d.weekSubjectMin[k]||0}분(목표${v}분)`).join(', ');
  return `당신은 대한민국 수능 고3 수험생의 AI 학습 전략가입니다.
[데이터] D-${d.dday} / 오늘${d.todayMin}분 / 할일${d.doneTasks}/${d.totalTasks} / 방해${d.distractions}회 / 평균수면${d.avgSleepMin}분
[주간 과목 현황] ${subStatus}

지침:
1. '취약 과목 탐지': 주간 목표 대비 달성률이 가장 낮은 과목을 찾아 분석하고 대책을 줄 것.
2. '수면 및 컨디션': 수면 데이터 기반으로 학습 효율 조언.
3. JSON만 반환: {"score":숫자, "sections":[{"icon":"🔍","title":"취약 과목 탐지","body":"..."},{"icon":"💤","title":"수면 분석","body":"..."},{"icon":"🎯","title":"내일의 전략","body":"..."}], "mission":"..."}`;
}

function renderCoachInline(parsed){
  document.getElementById('inlineScoreNum').textContent=`${parsed.score}점`;
  document.getElementById('liveScore').textContent=parsed.score;
  const cs=document.getElementById('inlineCoachSections'); cs.innerHTML='';
  parsed.sections.forEach(sec => {
    cs.innerHTML+=`<div class="coach-card"><div class="coach-card-head"><span>${sec.icon}</span><span>${sec.title}</span></div><div class="coach-card-body">${sec.body}</div></div>`;
  });
  document.getElementById('inlineMissionText').textContent=parsed.mission;
  document.getElementById('inlineCoachState').style.display='none'; document.getElementById('inlineCoachResult').style.display='block';
}

async function runCoachAnalysis(){
  document.getElementById('coachRunBtn').style.display='none'; document.getElementById('inlineCoachState').style.display='flex';
  try {
    const raw = await callCoach(buildPrompt(collectData()));
    const cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    renderCoachInline(JSON.parse(cleaned));
  } catch(err) {
    document.getElementById('inlineCoachState').style.display='none'; document.getElementById('inlineCoachError').style.display='flex';
    document.getElementById('inlineCoachErrorMsg').textContent=`오류: ${err.message}`; document.getElementById('coachRunBtn').style.display='block';
  }
}
document.getElementById('coachRunBtn').addEventListener('click', runCoachAnalysis);

/* ── 초기 실행 ── */
renderToday(); renderTomorrow(); renderGoalBars(); updateAccumLabel(); updateLiveScore(); updateSleepUI();
