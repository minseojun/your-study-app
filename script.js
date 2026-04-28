/* ============================================================
   StudyFlow v9 — script.js
   수정사항: 수면 차트 연동, 주간 리포트 버그 수정, AI 프롬프트 고도화
   ============================================================ */
'use strict';

/* ── AI 코치 호출 (서버리스 대응) ── */
async function callCoach(prompt) {
  try {
    const res = await fetch('/api/coach', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '백엔드 응답 오류');
    return data.text || '';
  } catch (err) {
    console.error("AI 호출 에러:", err);
    throw err;
  }
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
  SLEEP_LOGS  :'sf_sleep_logs'
};

/* ── 유틸리티 ── */
const pad2 = n => String(Math.floor(n)).padStart(2,'0');
const msToHMS = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; return h>0?`${pad2(h)}:${pad2(m)}:${pad2(s)}`:`${pad2(m)}:${pad2(s)}`; };
const msToReadable = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; if(h>0)return`${h}시간 ${pad2(m)}분`; if(m>0)return`${m}분 ${pad2(s)}초`; return`${s}초`; };
const getDday = () => { const a=new Date();a.setHours(0,0,0,0);const b=new Date(SUNEUNG);b.setHours(0,0,0,0);return Math.max(0,Math.round((b-a)/86400000)); };
const todayStr = () => new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\.\s*/g,'-').replace(/-$/,'');
const lsGet = k => { try{return JSON.parse(localStorage.getItem(k));}catch{return null;} };
const lsSet = (k,v) => localStorage.setItem(k,JSON.stringify(v));

/* ── 집중 점수 계산 ── */
function calcLiveScore(tMs, sess, dist, doneT, totalT, st) {
  if(tMs===0 && sess.length===0) return null;
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

/* ── 데이터 상태 초기화 ── */
let todayTasks=lsGet(K.TODAY_TASKS)||[];
let tomorrowTasks=lsGet(K.TMRW_TASKS)||[];
let goals=lsGet(K.GOALS)||{국어:60,영어:60,수학:90,사회문화:45,생활과윤리:45};
let timerState=lsGet(K.TIMER_STATE)||{elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0};
let elapsed=timerState.elapsed||0, sessions=timerState.sessions||[], distractions=timerState.distractions||0, totalMs=timerState.totalMs||0, subjectTime=timerState.subjectTime||{};
let ticker=null, startTime=null, running=false, sessionStart=null, selectedCat='국어';

/* ── 수면 관리 로직 ── */
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
});
document.getElementById('btnWakeUp').addEventListener('click', () => {
  if (!sleepStartTime) return;
  const duration = Math.round((Date.now() - sleepStartTime) / 60000);
  const logs = lsGet(K.SLEEP_LOGS) || [];
  logs.push({ date: todayStr(), durationMin: duration });
  lsSet(K.SLEEP_LOGS, logs.slice(-7)); sleepStartTime = null; localStorage.removeItem('sf_temp_sleep');
  updateSleepUI();
});

/* ── 분석 탭 차트 렌더링 ── */
let weeklyChartInst = null, sleepChartInst = null;
function getHistoryWithToday(){
  const history=lsGet(K.HISTORY)||[];
  const todayEntry={date:todayStr(),totalMs,subjectTime,distractions,sessions,doneTasks:todayTasks.filter(t=>t.done).length,totalTasks:todayTasks.length};
  return [...history,todayEntry].slice(-7);
}

function renderWeeklyStats(){
  const all=getHistoryWithToday(), weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  document.getElementById('weeklyTotal').textContent=msToReadable(weekTotal);
  const labels=all.map(d=>d.date.slice(-5)), mins=all.map(d=>Math.round(d.totalMs/60000));
  if(weeklyChartInst) weeklyChartInst.destroy();
  weeklyChartInst=new Chart(document.getElementById('weeklyChart'),{type:'bar',data:{labels,datasets:[{data:mins,backgroundColor:'#0071e3',borderRadius:6}]},options:{plugins:{legend:{display:false}}}});
}

function renderSleepChart() {
  const logs = lsGet(K.SLEEP_LOGS) || [];
  const labels = logs.map(l => l.date.slice(-5));
  const data = logs.map(l => (l.durationMin / 60).toFixed(1));
  const avg = logs.length ? (logs.reduce((s,l)=>s+l.durationMin,0)/logs.length/60).toFixed(1) : 0;
  document.getElementById('avgSleepLabel').textContent = `평균 ${avg}시간`;
  if(sleepChartInst) sleepChartInst.destroy();
  sleepChartInst = new Chart(document.getElementById('sleepChart'), {
    type: 'line',
    data: { labels, datasets: [{ label: '수면(h)', data, borderColor: '#cc5de8', backgroundColor: 'rgba(204,93,232,0.1)', fill: true, tension: 0.3 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 12 } } }
  });
}

function renderHeatmap(){
  const map=new Array(24).fill(0); getHistoryWithToday().forEach(day=>(day.sessions||[]).forEach(s=>map[s.startHour]+=s.ms));
  const grid=document.getElementById('heatmapGrid'), maxVal=Math.max(...map,1); grid.innerHTML='';
  map.forEach((ms,h)=>{
    const cell=document.createElement('div'); cell.className='hm-cell';
    const lvl=ms===0?0:ms<maxVal*.25?1:ms<maxVal*.5?2:ms<maxVal*.75?3:4;
    cell.setAttribute('data-lvl',lvl); grid.appendChild(cell);
  });
}

/* ── 주간 리포트 (데이터 부재 시 오류 수정) ── */
function showWeeklyReport() {
  const all = getHistoryWithToday();
  const weekTotal = all.reduce((s,d)=>s+(d.totalMs||0),0);
  const subTotals = {}; 
  all.forEach(d => Object.entries(d.subjectTime || {}).forEach(([k,v]) => subTotals[k] = (subTotals[k]||0)+v));
  const subMax = Math.max(...Object.values(subTotals), 0) || 1;

  const body = document.getElementById('weeklyReportBody');
  body.innerHTML = `<h3>주간 핵심 지표</h3><div class="wr-stat-row">
    <div class="wr-stat"><div class="wr-stat-val">${msToReadable(weekTotal)}</div><div class="wr-stat-lbl">총 공부 시간</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${all.filter(d=>d.totalMs>0).length}일</div><div class="wr-stat-lbl">공부한 날</div></div>
  </div>`;
  
  if(Object.keys(subTotals).length > 0) {
    let subHtml = '<div class="wr-subject-bars" style="margin-top:20px">';
    SUBJECTS.forEach(sub => {
      const pct = subTotals[sub] ? Math.round(subTotals[sub] / subMax * 100) : 0;
      if(pct > 0) subHtml += `<div class="wr-sub-row"><span class="wr-sub-name">${sub}</span><div class="wr-sub-track"><div class="wr-sub-fill" style="width:${pct}%;background:${SUBJECT_COLORS[sub]}"></div></div></div>`;
    });
    body.innerHTML += subHtml + '</div>';
  }
  document.getElementById('weeklyReportBackdrop').classList.add('show');
}

/* ── AI 분석 (취약 과목 & 수면 통합) ── */
function collectData(){
  const all = getHistoryWithToday(), sleepLogs = lsGet(K.SLEEP_LOGS)||[];
  const avgSleep = sleepLogs.length ? Math.round(sleepLogs.reduce((s,l)=>s+l.durationMin,0)/sleepLogs.length) : 0;
  const weekSubMin = {}; all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>weekSubMin[k]=(weekSubMin[k]||0)+Math.round(v/60000)));
  return {
    dday:getDday(), todayMin:Math.round(totalMs/60000), distractions,
    doneTasks:todayTasks.filter(t=>t.done).length, totalTasks:todayTasks.length,
    weekSubMin, goalMin:goals, avgSleepMin:avgSleep
  };
}

function buildPrompt(d){
  const subStatus = Object.entries(d.goalMin).map(([k,v])=>`${k}:실제${d.weekSubMin[k]||0}분(목표${v}분)`).join(', ');
  return `고3 수험생 AI 전략가입니다. [데이터] D-${d.dday} / 오늘${d.todayMin}분 / 방해${d.distractions}회 / 평균수면${d.avgSleepMin}분. [과목현황] ${subStatus}. 지침: 1.성취도 낮은 '취약 과목' 분석. 2.수면 기반 학습 효율 조언. JSON만 반환: {"score":숫자, "sections":[{"icon":"🔍","title":"취약 과목 탐지","body":"..."},{"icon":"💤","title":"수면 분석","body":"..."},{"icon":"🎯","title":"전략","body":"..."}], "mission":"..."}`;
}

async function runCoachAnalysis(){
  document.getElementById('coachRunBtn').style.display='none';
  document.getElementById('inlineCoachState').style.display='flex';
  try {
    const raw = await callCoach(buildPrompt(collectData()));
    const cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const parsed = JSON.parse(cleaned);
    document.getElementById('inlineScoreNum').textContent=`${parsed.score}점`;
    const cs=document.getElementById('inlineCoachSections'); cs.innerHTML='';
    parsed.sections.forEach(sec => {
      cs.innerHTML+=`<div class="coach-card"><div class="coach-card-head"><span>${sec.icon}</span><span>${sec.title}</span></div><div class="coach-card-body">${sec.body}</div></div>`;
    });
    document.getElementById('inlineMissionText').textContent=parsed.mission;
    document.getElementById('inlineCoachState').style.display='none';
    document.getElementById('inlineCoachResult').style.display='block';
  } catch(err) {
    document.getElementById('inlineCoachState').style.display='none';
    document.getElementById('inlineCoachError').style.display='flex';
    document.getElementById('inlineCoachErrorMsg').textContent=`오류: ${err.message}`;
  }
}

/* ── 이벤트 연결 ── */
document.getElementById('weeklyReportBtn').addEventListener('click', showWeeklyReport);
document.getElementById('weeklyReportClose').addEventListener('click', () => document.getElementById('weeklyReportBackdrop').classList.remove('show'));
document.getElementById('coachRunBtn').addEventListener('click', runCoachAnalysis);
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(tab==='stats') { renderWeeklyStats(); renderHeatmap(); renderSleepChart(); }
  });
});

updateSleepUI();
