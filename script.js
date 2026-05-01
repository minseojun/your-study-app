/* ============================================================
   StudyFlow v9 — script.js
   ============================================================ */
'use strict';

/* ── AI 코치 호출 ── */
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
async function callGemini(prompt) { return await callCoach(prompt); }

/* ── 상수 및 로컬스토리지 키 ── */
const SUNEUNG = new Date('2026-11-19T00:00:00');
const SUBJECTS = ['국어','영어','수학','사회문화','생활과윤리'];
const SUBJECT_COLORS = {
  '국어':'#ff6b6b','영어':'#51cf66','수학':'#339af0',
  '사회문화':'#ffa94d','생활과윤리':'#cc5de8'
};
const K = {
  TODAY_TASKS :'sf_today_tasks',
  TMRW_TASKS  :'sf_tmrw_tasks',
  TODAY_DATE  :'sf_today_date',
  TIMER_STATE :'sf_timer_state',
  HISTORY     :'sf_history',
  GOALS       :'sf_goals',
  NIGHT       :'sf_night',
  LAST_REPORT :'sf_last_report',
  SLEEP_LOGS  :'sf_sleep_logs',
};

/* ── 유틸리티 ── */
const pad2        = n => String(Math.floor(n)).padStart(2,'0');
const msToHMS     = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; return h>0?`${pad2(h)}:${pad2(m)}:${pad2(s)}`:`${pad2(m)}:${pad2(s)}`; };
const msToReadable= ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; if(h>0)return`${h}시간 ${pad2(m)}분`; if(m>0)return`${m}분 ${pad2(s)}초`; return`${s}초`; };
const getDday     = () => { const a=new Date();a.setHours(0,0,0,0);const b=new Date(SUNEUNG);b.setHours(0,0,0,0);return Math.max(0,Math.round((b-a)/86400000)); };
const todayStr    = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const lsGet       = k => { try{return JSON.parse(localStorage.getItem(k));}catch{return null;} };
const lsSet       = (k,v) => localStorage.setItem(k,JSON.stringify(v));

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

/* ── 날짜 롤오버 ── */
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
const DDAY = getDday();
document.getElementById('dDayCount').textContent = DDAY;
document.getElementById('ddayBadge').textContent  = `수능 D-${DDAY}`;

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
    if(tab==='stats') { renderWeeklyStats(); renderHeatmap(); renderSleepChart(); }
  });
});

/* ── 야간 모드 ── */
const nightToggle = document.getElementById('nightToggle');
const nightIcon   = document.getElementById('nightIcon');
function setNight(on){
  document.body.classList.toggle('night',on);
  nightIcon.textContent = on ? '☀️' : '🌙';
  const d = document.getElementById('sepiaDim');
  if(d) d.style.opacity = on ? '1' : '0';
}
(()=>{
  const s=lsGet(K.NIGHT);
  if(s==='on') setNight(true);
  else if(s==='off') setNight(false);
  else setNight(new Date().getHours()>=22);
})();
nightToggle.addEventListener('click',()=>{
  const on=!document.body.classList.contains('night');
  setNight(on); lsSet(K.NIGHT, on?'on':'off');
});

/* ══════════════════════════════════════════════════════════
   할 일 목록
   ══════════════════════════════════════════════════════════ */
let todayTasks    = lsGet(K.TODAY_TASKS) || [];
let tomorrowTasks = lsGet(K.TMRW_TASKS)  || [];
let selectedCat   = '국어';

const S_POST = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v6.5L10 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 1L4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const S_DEL  = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const S_BACK = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5H2M6.5 2L2 6.5l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildItem(task, idx, isTomorrow){
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done?' done':'') + (isTomorrow?' tomorrow-item':'');
  if(!isTomorrow){
    const cb = document.createElement('input'); cb.type='checkbox'; cb.className='task-cb'; cb.checked=task.done;
    cb.addEventListener('change',()=>{ todayTasks[idx].done=!todayTasks[idx].done; lsSet(K.TODAY_TASKS,todayTasks); renderToday(); renderGoalBars(); updateLiveScore(); });
    li.appendChild(cb);
  }
  const dot = document.createElement('span'); dot.className=`cat-dot cat-${task.cat||'국어'}`; li.appendChild(dot);
  const txt = document.createElement('span'); txt.className='task-text'; txt.textContent=task.text; li.appendChild(txt);
  const badge = document.createElement('span'); badge.className='cat-badge'; badge.textContent=task.cat||'국어'; li.appendChild(badge);
  const acts = document.createElement('div'); acts.className='task-actions';
  if(!isTomorrow){
    const pb = document.createElement('button'); pb.className='postpone'; pb.title='내일로 미루기'; pb.innerHTML=S_POST;
    pb.addEventListener('click',()=>postponeTask(idx)); acts.appendChild(pb);
  } else {
    const bb = document.createElement('button'); bb.title='오늘로 되돌리기'; bb.innerHTML=S_BACK;
    bb.addEventListener('click',()=>{ todayTasks.push({text:task.text,cat:task.cat,done:false}); tomorrowTasks.splice(idx,1); lsSet(K.TODAY_TASKS,todayTasks); lsSet(K.TMRW_TASKS,tomorrowTasks); renderToday(); renderTomorrow(); });
    acts.appendChild(bb);
  }
  const db = document.createElement('button'); db.className='del'; db.title='삭제'; db.innerHTML=S_DEL;
  db.addEventListener('click',()=>{ if(isTomorrow){tomorrowTasks.splice(idx,1);lsSet(K.TMRW_TASKS,tomorrowTasks);renderTomorrow();}else{todayTasks.splice(idx,1);lsSet(K.TODAY_TASKS,todayTasks);renderToday();} });
  acts.appendChild(db); li.appendChild(acts);
  return li;
}

function renderToday(){
  const tl = document.getElementById('taskList'); tl.innerHTML='';
  todayTasks.forEach((t,i)=>tl.appendChild(buildItem(t,i,false)));
  const total=todayTasks.length, done=todayTasks.filter(t=>t.done).length;
  document.getElementById('emptyState').style.display   = total===0?'flex':'none';
  document.getElementById('taskCount').textContent       = `${total}개`;
  document.getElementById('progressRow').style.display   = total===0?'none':'flex';
  if(total>0){
    document.getElementById('doneCount').textContent  = done;
    document.getElementById('totalCount').textContent = total;
    document.getElementById('progressFill').style.width = Math.round(done/total*100)+'%';
  }
}
function renderTomorrow(){
  const tl = document.getElementById('tomorrowList'); tl.innerHTML='';
  tomorrowTasks.forEach((t,i)=>tl.appendChild(buildItem(t,i,true)));
  document.getElementById('tomorrowEmpty').style.display = tomorrowTasks.length===0?'flex':'none';
  document.getElementById('tomorrowCount').textContent   = `${tomorrowTasks.length}개`;
}
function postponeTask(idx){
  const t=todayTasks.splice(idx,1)[0];
  tomorrowTasks.push({text:t.text,cat:t.cat,done:false});
  lsSet(K.TODAY_TASKS,todayTasks); lsSet(K.TMRW_TASKS,tomorrowTasks);
  renderToday(); renderTomorrow();
}
function addTask(){
  const text=document.getElementById('taskInput').value.trim();
  if(!text){
    const inp=document.getElementById('taskInput');
    inp.classList.add('shake');
    inp.addEventListener('animationend',()=>inp.classList.remove('shake'),{once:true});
    return;
  }
  todayTasks.push({text,cat:selectedCat,done:false});
  lsSet(K.TODAY_TASKS,todayTasks);
  document.getElementById('taskInput').value='';
  renderToday();
}
document.getElementById('addBtn').addEventListener('click', addTask);
document.getElementById('taskInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addTask(); });

document.getElementById('categoryChips').addEventListener('click', e=>{
  const chip=e.target.closest('.chip'); if(!chip) return;
  selectedCat=chip.dataset.cat; syncSubjectChips(selectedCat);
});
const _timerChips = document.getElementById('timerCategoryChips');
if(_timerChips) _timerChips.addEventListener('click', e=>{
  const chip=e.target.closest('.chip'); if(!chip||chip.disabled) return;
  selectedCat=chip.dataset.cat; syncSubjectChips(selectedCat);
});

/* ══════════════════════════════════════════════════════════
   목표 설정
   ══════════════════════════════════════════════════════════ */
let goals = lsGet(K.GOALS) || {국어:60,영어:60,수학:90,사회문화:45,생활과윤리:45};

function renderGoalBars(){
  const bars = document.getElementById('goalBars'); bars.innerHTML='';
  SUBJECTS.forEach(sub=>{
    const goal   = goals[sub]||0; if(!goal) return;
    const actual = Math.round((subjectTime[sub]||0)/60000);
    const pct    = Math.min(100, goal>0 ? Math.round(actual/goal*100) : 0);
    const isComplete = pct >= 100;
    bars.innerHTML += `
      <div class="goal-bar-row">
        <span class="goal-bar-label">
          <span class="cat-dot cat-${sub}"></span>${sub}
        </span>
        <div class="goal-bar-track">
          <div class="goal-bar-fill" style="width:${pct}%;background:${isComplete?'var(--ok)':SUBJECT_COLORS[sub]}"></div>
        </div>
        <span class="goal-bar-stat${isComplete?' goal-complete':''}">
          ${actual}<span class="goal-stat-sep">/</span>${goal}분
        </span>
      </div>`;
  });
}

document.getElementById('goalEditBtn').addEventListener('click', ()=>{
  const p=document.getElementById('goalEditPanel'), inp=document.getElementById('goalInputs');
  if(p.style.display==='block'){ p.style.display='none'; return; }
  inp.innerHTML='';
  SUBJECTS.forEach(sub=>{
    inp.innerHTML+=`<div class="goal-input-row"><span class="goal-input-label"><span class="cat-dot cat-${sub}"></span>${sub}</span><input type="number" class="goal-input-field" data-sub="${sub}" value="${goals[sub]||0}" min="0"></div>`;
  });
  p.style.display='block';
});
document.getElementById('goalSave').addEventListener('click', ()=>{
  document.querySelectorAll('.goal-input-field').forEach(i=>{ goals[i.dataset.sub]=parseInt(i.value)||0; });
  lsSet(K.GOALS,goals);
  document.getElementById('goalEditPanel').style.display='none';
  renderGoalBars();
});
document.getElementById('goalCancel').addEventListener('click', ()=>{
  document.getElementById('goalEditPanel').style.display='none';
});

/* ══════════════════════════════════════════════════════════
   타이머
   ══════════════════════════════════════════════════════════ */
let timerState = lsGet(K.TIMER_STATE) || {elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0};
let elapsed    = timerState.elapsed    || 0;
let sessions   = timerState.sessions   || [];
let distractions = timerState.distractions || 0;
let totalMs    = timerState.totalMs    || 0;
let subjectTime = timerState.subjectTime || {};
let ticker=null, startTime=null, running=false;
let sessionStart = lsGet('sf_session_start') || null;
let sessionElapsedAtStart = lsGet('sf_session_elapsed_at_start');
if(sessionElapsedAtStart!==null) sessionElapsedAtStart=Number(sessionElapsedAtStart);

/* ── 인강 모드 ── */
let lectureMode = false;
function updateLectureModeBtn(){
  const btn = document.getElementById('lectureModeBtn');
  if(lectureMode){ btn.textContent='📺 인강 모드 ON · 탭하여 종료'; btn.classList.add('active'); }
  else           { btn.textContent='📺 인강 시청'; btn.classList.remove('active'); }
}
document.getElementById('lectureModeBtn').addEventListener('click', ()=>{
  lectureMode = !lectureMode;
  updateLectureModeBtn();
  showNotif(
    lectureMode ? '인강 모드 ON — 화면 이탈이 방해 횟수로 카운트되지 않아요' : '인강 모드 OFF — 집중 모드로 돌아왔어요',
    lectureMode ? '📺' : '✅'
  );
});

const saveTimerState = ()=>lsSet(K.TIMER_STATE,{elapsed,subjectTime,sessions,distractions,totalMs});
const nowMs = ()=>running ? elapsed+(Date.now()-startTime) : elapsed;

function tick(){
  const ms=nowMs(), t=Math.floor(ms/1000);
  document.getElementById('swHours').textContent   = pad2(Math.floor(t/3600));
  document.getElementById('swMinutes').textContent = pad2(Math.floor((t%3600)/60));
  document.getElementById('swSeconds').textContent = pad2(t%60);
  document.getElementById('swMs').textContent      = '.'+pad2(Math.floor((ms%1000)/10));
}
function updateAccumLabel(){ document.getElementById('swAccum').textContent = msToReadable(nowMs())||'0분'; }
function updateLiveScore(){
  const done  = todayTasks.filter(t=>t.done).length;
  const score = calcLiveScore(totalMs,sessions,distractions,done,todayTasks.length,subjectTime);
  const numEl = document.getElementById('liveScore');
  numEl.textContent = score===null ? '—' : score;
  if(score!==null) numEl.style.color = score>=80?'var(--ok)':score>=50?'var(--accent)':'var(--danger)';
}
function syncSubjectChips(cat){
  document.querySelectorAll('#timerCategoryChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
  document.querySelectorAll('#categoryChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
}
function updateTimerUI(){
  const btn    = document.getElementById('startStopBtn');
  const endBtn = document.getElementById('endBtn');
  const inSession = sessionElapsedAtStart!==null;
  if(running)        { btn.textContent='일시정지'; btn.classList.add('stop'); }
  else if(inSession) { btn.textContent='계속'; btn.classList.remove('stop'); }
  else               { btn.textContent='시작'; btn.classList.remove('stop'); }
  endBtn.disabled = !inSession;
  document.getElementById('swDisplay').classList.toggle('running',running);
  document.getElementById('brandDot').classList.toggle('pulse',running);
  document.getElementById('fsHint').textContent = running
    ? `🟢 ${selectedCat} 집중 중`
    : inSession ? `${selectedCat} 일시정지됨 · 종료하려면 종료를 눌러요`
    : '▶ 시작 버튼을 눌러 집중을 시작해요';
  document.querySelectorAll('#timerCategoryChips .chip').forEach(c=>{ c.disabled=inSession; });
}

function startTimer(){
  if(sessionElapsedAtStart===null){
    sessionElapsedAtStart = elapsed;
    sessionStart = Date.now();
    lsSet('sf_session_start', sessionStart);
    lsSet('sf_session_elapsed_at_start', sessionElapsedAtStart);
  }
  startTime = Date.now(); ticker = setInterval(tick,30); running = true;
  updateTimerUI(); startNotifTimer();
}
function pauseTimer(){
  elapsed += Date.now()-startTime; startTime=null;
  clearInterval(ticker); running=false;
  saveTimerState(); updateTimerUI(); updateAccumLabel(); stopNotifTimer();
}
function endSession(){
  if(running){ elapsed+=Date.now()-startTime; startTime=null; clearInterval(ticker); running=false; stopNotifTimer(); }
  const sMs = Math.max(0, elapsed-sessionElapsedAtStart);
  if(sMs>0){
    const startHour = new Date(sessionStart).getHours();
    sessions = [...sessions, {ms:sMs, startHour}];
    subjectTime[selectedCat] = (subjectTime[selectedCat]||0)+sMs;
  }
  totalMs = elapsed;
  sessionElapsedAtStart=null; sessionStart=null;
  localStorage.removeItem('sf_session_start');
  localStorage.removeItem('sf_session_elapsed_at_start');
  lectureMode=false; updateLectureModeBtn();
  updateTimerUI(); updateAccumLabel(); saveTimerState(); renderGoalBars(); updateLiveScore();
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  showReport();
}

document.getElementById('startStopBtn').addEventListener('click', ()=>running?pauseTimer():startTimer());
document.getElementById('endBtn').addEventListener('click', endSession);
document.getElementById('modalClose').addEventListener('click',    ()=>document.getElementById('modalBackdrop').classList.remove('show'));
document.getElementById('modalContinue').addEventListener('click', ()=>document.getElementById('modalBackdrop').classList.remove('show'));

/* ══════════════════════════════════════════════════════════
   수면 관리
   ══════════════════════════════════════════════════════════ */
let sleepStartTime = lsGet('sf_temp_sleep');
function updateSleepUI(){
  const status=document.getElementById('sleepStatus'), btnSleep=document.getElementById('btnSleepNow'), btnWake=document.getElementById('btnWakeUp');
  if(sleepStartTime){
    status.textContent='수면 중...'; status.className='badge accent';
    btnSleep.disabled=true; btnWake.disabled=false;
  } else {
    status.textContent='활동 중'; status.className='badge muted';
    btnSleep.disabled=false; btnWake.disabled=true;
  }
}
document.getElementById('btnSleepNow').addEventListener('click', ()=>{
  sleepStartTime=Date.now(); lsSet('sf_temp_sleep',sleepStartTime); updateSleepUI();
  showNotif('잘 자요! 푹 쉬고 내일 만나요 🌙','💤');
});
document.getElementById('btnWakeUp').addEventListener('click', ()=>{
  if(!sleepStartTime) return;
  const duration=Math.round((Date.now()-sleepStartTime)/60000);
  const logs=lsGet(K.SLEEP_LOGS)||[];
  logs.push({date:todayStr(),durationMin:duration});
  lsSet(K.SLEEP_LOGS,logs.slice(-7)); sleepStartTime=null; localStorage.removeItem('sf_temp_sleep');
  updateSleepUI(); showNotif('상쾌한 아침이에요! 오늘도 화이팅 ☀️','✨');
});

/* ══════════════════════════════════════════════════════════
   알림 / 토스트
   ══════════════════════════════════════════════════════════ */
let notifTimer = null;
function showNotif(msg, icon='🔔'){
  const t=document.getElementById('notifToast');
  document.getElementById('notifMsg').textContent  = msg;
  document.getElementById('notifIcon').textContent = icon;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 5000);
}
function startNotifTimer(){
  const toggle   = document.getElementById('notifToggle');
  const interval = document.getElementById('notifInterval');
  if(toggle && interval && toggle.checked)
    notifTimer = setInterval(()=>new Notification('StudyFlow 알림',{body:'공부하고 있으신가요?'}), parseInt(interval.value)*60000);
}
function stopNotifTimer(){ clearInterval(notifTimer); }

/* ══════════════════════════════════════════════════════════
   집중 오버레이 (백그라운드 복귀 포함)
   ══════════════════════════════════════════════════════════ */
const focusOverlay = document.getElementById('focusOverlay');
function showOverlay(){
  if(running && !lectureMode){
    distractions++;
    saveTimerState();
    focusOverlay.classList.add('show');
    updateLiveScore();
  }
}
document.getElementById('overlayBackBtn').addEventListener('click', ()=>focusOverlay.classList.remove('show'));

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    // 백그라운드 진입: 현재 시각 저장
    if(running){
      lsSet('sf_bg_start', Date.now());
      lsSet('sf_bg_elapsed', elapsed);
      showOverlay();
    }
  } else {
    // 포그라운드 복귀: 경과 시간 보정
    const bgStart   = lsGet('sf_bg_start');
    const bgElapsed = lsGet('sf_bg_elapsed');
    if(bgStart!==null && bgElapsed!==null && running){
      elapsed    = bgElapsed + (Date.now() - bgStart);
      startTime  = Date.now();
      localStorage.removeItem('sf_bg_start');
      localStorage.removeItem('sf_bg_elapsed');
    }
  }
});

/* ══════════════════════════════════════════════════════════
   리포트 모달
   ══════════════════════════════════════════════════════════ */
let weeklyChartInst=null, sleepChartInst=null, subjectChartInst=null;

function showReport(){
  document.getElementById('rTotalTime').textContent = msToReadable(totalMs)||'0초';
  document.getElementById('rSessions').textContent  = sessions.length+'회';
  const longest = sessions.length ? Math.max(...sessions.map(s=>s.ms)) : 0;
  document.getElementById('rLongest').textContent   = msToReadable(longest)||'0초';

  /* 집중 방해 수정 UI */
  const rDist = document.getElementById('rDistractions');
  rDist.innerHTML = `
    <button class="dist-adj-btn" id="distMinus">−</button>
    <span id="distCount">${distractions}</span>회
    <button class="dist-adj-btn" id="distPlus">+</button>`;
  document.getElementById('distMinus').addEventListener('click',()=>{
    if(distractions>0){ distractions--; saveTimerState(); document.getElementById('distCount').textContent=distractions; updateLiveScore(); }
  });
  document.getElementById('distPlus').addEventListener('click',()=>{
    distractions++; saveTimerState(); document.getElementById('distCount').textContent=distractions; updateLiveScore();
  });

  const timeline = document.getElementById('sessionTimeline'); timeline.innerHTML='';
  const maxMs = sessions.length ? Math.max(...sessions.map(s=>s.ms)) : 1;
  sessions.forEach((s,i)=>{
    const pct=Math.round(s.ms/maxMs*100);
    timeline.innerHTML+=`<div class="bar-row"><span class="bar-lbl">#${i+1}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-time">${msToReadable(s.ms)}</span></div>`;
  });

  document.getElementById('aiFeedback').textContent='';
  document.getElementById('modalBackdrop').classList.add('show');

  const subEntries = Object.entries(subjectTime).filter(([,v])=>v>0);
  const chartSection = document.getElementById('chartSection');
  setTimeout(()=>{
    if(subEntries.length>0){
      chartSection.style.display='flex';
      if(subjectChartInst) subjectChartInst.destroy();
      subjectChartInst = new Chart(document.getElementById('subjectChart'),{
        type:'doughnut',
        data:{
          labels:subEntries.map(([k])=>k),
          datasets:[{data:subEntries.map(([,v])=>Math.round(v/60000*10)/10||0.1),backgroundColor:subEntries.map(([k])=>SUBJECT_COLORS[k]),borderWidth:2,borderColor:'var(--card)'}]
        },
        options:{responsive:false,plugins:{legend:{display:false},tooltip:{enabled:true}},cutout:'58%'}
      });
      const legend=document.getElementById('chartLegend'); legend.innerHTML='';
      const tot=subEntries.reduce((s,[,v])=>s+v,0);
      subEntries.forEach(([k,v])=>{
        const pct=tot>0?Math.round(v/tot*100):0;
        legend.innerHTML+=`<div class="legend-item"><span class="legend-dot" style="background:${SUBJECT_COLORS[k]}"></span><span>${k}</span><span class="legend-pct">${pct}%</span></div>`;
      });
    } else {
      chartSection.style.display='none';
    }
  },60);
}

/* ══════════════════════════════════════════════════════════
   통계
   ══════════════════════════════════════════════════════════ */
function getHistoryWithToday(){
  return [...(lsGet(K.HISTORY)||[]), {date:todayStr(),totalMs,subjectTime,distractions,sessions,doneTasks:todayTasks.filter(t=>t.done).length,totalTasks:todayTasks.length}].slice(-7);
}

function renderWeeklyStats(){
  const all=getHistoryWithToday(), weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  document.getElementById('weeklyTotal').textContent=msToReadable(weekTotal);
  const labels=all.map(d=>d.date.slice(-5)), mins=all.map(d=>Math.round(d.totalMs/60000));
  if(weeklyChartInst) weeklyChartInst.destroy();
  weeklyChartInst=new Chart(document.getElementById('weeklyChart'),{
    type:'bar',
    data:{labels,datasets:[{data:mins,backgroundColor:'#0071e3',borderRadius:6}]},
    options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}
  });
}

function renderHeatmap(){
  const map=new Array(24).fill(0);
  getHistoryWithToday().forEach(day=>(day.sessions||[]).forEach(s=>map[s.startHour]+=s.ms));
  const grid=document.getElementById('heatmapGrid'), maxVal=Math.max(...map,1); grid.innerHTML='';
  map.forEach((ms,h)=>{
    const cell=document.createElement('div'); cell.className='hm-cell';
    const lvl=ms===0?0:ms<maxVal*.25?1:ms<maxVal*.5?2:ms<maxVal*.75?3:4;
    cell.setAttribute('data-lvl',lvl); cell.title=`${h}시: ${msToReadable(ms)}`; grid.appendChild(cell);
  });
  const bestHour=map.indexOf(Math.max(...map));
  document.getElementById('bestHour').innerHTML=`💡 <strong>${bestHour}시</strong>에 가장 집중이 잘 됐어요!`;
}

function renderSleepChart(){
  const sleepLogs=lsGet(K.SLEEP_LOGS)||[];
  const canvas=document.getElementById('sleepChart'), noData=document.getElementById('sleepNoData');
  if(!canvas) return;
  if(sleepLogs.length===0){ canvas.style.display='none'; if(noData) noData.style.display='flex'; return; }
  canvas.style.display='block'; if(noData) noData.style.display='none';
  const labels=sleepLogs.map(l=>l.date.slice(-5)), data=sleepLogs.map(l=>Math.round(l.durationMin/60*10)/10);
  if(sleepChartInst) sleepChartInst.destroy();
  sleepChartInst=new Chart(canvas,{
    type:'bar',
    data:{labels,datasets:[{label:'수면 시간',data,backgroundColor:'rgba(204,93,232,.2)',borderColor:'#cc5de8',borderWidth:2,borderRadius:6}]},
    options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:12,ticks:{callback:v=>v+'h',font:{size:11}}},x:{ticks:{font:{size:11}}}}}
  });
}

/* ══════════════════════════════════════════════════════════
   주간 리포트 모달
   ══════════════════════════════════════════════════════════ */
function renderWeeklyReportContent(){
  const all=getHistoryWithToday(), sleepLogs=lsGet(K.SLEEP_LOGS)||[];
  const weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  const avgSleep=sleepLogs.length?Math.round(sleepLogs.reduce((s,l)=>s+l.durationMin,0)/sleepLogs.length):0;
  let html=`
    <div class="weekly-report-section">
      <h3>📊 주간 통계</h3>
      <div class="wr-stat-row">
        <div class="wr-stat"><div class="wr-stat-val">${msToReadable(weekTotal)}</div><div class="wr-stat-lbl">총 공부시간</div></div>
        <div class="wr-stat"><div class="wr-stat-val">${all.length}</div><div class="wr-stat-lbl">활동일수</div></div>
        <div class="wr-stat"><div class="wr-stat-val">${avgSleep}분</div><div class="wr-stat-lbl">평균수면</div></div>
      </div>
    </div>
    <div class="weekly-report-section">
      <h3>📚 과목별 학습시간</h3>
      <div class="wr-subject-bars">`;
  const weekSubMs={};
  all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>weekSubMs[k]=(weekSubMs[k]||0)+v));
  SUBJECTS.forEach(sub=>{
    const min=Math.round((weekSubMs[sub]||0)/60000), goalMin=goals[sub]||0;
    const pct=goalMin>0?Math.round(min/goalMin*100):0;
    html+=`<div class="wr-sub-row"><span class="wr-sub-name">${sub}</span><div class="wr-sub-track"><div class="wr-sub-fill" style="width:${Math.min(100,pct)}%;background:${SUBJECT_COLORS[sub]}"></div></div><span class="wr-sub-time">${min}분</span></div>`;
  });
  html+=`</div></div>`;
  const avgScore=all.length>0?Math.round(all.reduce((s,d)=>s+(calcLiveScore(d.totalMs,d.sessions,d.distractions,d.doneTasks,d.totalTasks,d.subjectTime)||0),0)/all.length):0;
  html+=`<div class="wr-insight">주간 평균 집중점수: <strong>${avgScore}점</strong></div>`;
  document.getElementById('weeklyReportBody').innerHTML=html;
}

document.getElementById('weeklyReportBtn').addEventListener('click',()=>{
  document.getElementById('weeklyReportBackdrop').classList.add('show');
  renderWeeklyReportContent();
});
document.getElementById('weeklyReportClose').addEventListener('click',()=>document.getElementById('weeklyReportBackdrop').classList.remove('show'));
document.getElementById('weeklyReportBackdrop').addEventListener('click',e=>{
  if(e.target===document.getElementById('weeklyReportBackdrop')) document.getElementById('weeklyReportBackdrop').classList.remove('show');
});

/* ══════════════════════════════════════════════════════════
   수동 공부기록 추가 (타이머 탭 인라인)
   ══════════════════════════════════════════════════════════ */
(function initManualAdd(){
  // 날짜 기본값
  const dateInput = document.getElementById('manualDate');
  if(dateInput){
    const today = new Date().toISOString().slice(0,10);
    dateInput.value = today;
    dateInput.max   = today;
  }

  // 토글 열기/닫기
  document.getElementById('manualToggleBtn').addEventListener('click', ()=>{
    const panel = document.getElementById('manualInlinePanel');
    const btn   = document.getElementById('manualToggleBtn');
    const wrap  = btn.closest('.manual-inline-wrap');
    // display가 'none' 이거나 비어있으면(HTML inline style 없을 때) 닫힌 상태로 간주
    const isClosed = !panel.style.display || panel.style.display === 'none';
    panel.style.display = isClosed ? 'block' : 'none';
    btn.classList.toggle('open', isClosed);
    if(wrap) wrap.classList.toggle('open', isClosed);
  });

  // 과목 칩
  let manualSelectedCat = '국어';
  document.getElementById('manualSubjectChips').addEventListener('click', e=>{
    const chip = e.target.closest('.chip'); if(!chip) return;
    document.querySelectorAll('#manualSubjectChips .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    manualSelectedCat = chip.dataset.cat;
  });

  // 추가 버튼
  document.getElementById('manualAddBtn').addEventListener('click', ()=>{
    const dateRaw = document.getElementById('manualDate').value;
    if(!dateRaw){ showNotif('날짜를 선택해주세요','⚠️'); return; }
    const hours = parseInt(document.getElementById('manualHours').value)   || 0;
    const mins  = parseInt(document.getElementById('manualMinutes').value) || 0;
    const totalMins = hours*60 + mins;
    if(totalMins < 1){ showNotif('시간을 입력해주세요','⚠️'); return; }
    const ms       = totalMins * 60000;
    const todayKey = todayStr();

    if(dateRaw === todayKey){
      subjectTime[manualSelectedCat] = (subjectTime[manualSelectedCat]||0) + ms;
      totalMs += ms;
      elapsed += ms;
      saveTimerState(); updateAccumLabel(); renderGoalBars(); updateLiveScore();
    } else {
      const history = lsGet(K.HISTORY)||[];
      const idx = history.findIndex(h=>h.date===dateRaw);
      if(idx>=0){
        history[idx].subjectTime[manualSelectedCat] = (history[idx].subjectTime[manualSelectedCat]||0)+ms;
        history[idx].totalMs += ms;
      } else {
        history.push({date:dateRaw,totalMs:ms,subjectTime:{[manualSelectedCat]:ms},distractions:0,sessions:[],doneTasks:0,totalTasks:0});
      }
      lsSet(K.HISTORY, history.slice(-7));
    }

    // 입력 초기화
    document.getElementById('manualHours').value   = '';
    document.getElementById('manualMinutes').value = '';

    const label = totalMins>=60 ? `${Math.floor(totalMins/60)}시간 ${totalMins%60}분` : `${totalMins}분`;
    showNotif(`${manualSelectedCat} ${label} 추가됐어요`,'📝');
    if(activeTab==='stats'){ renderWeeklyStats(); renderHeatmap(); }
  });
})();

/* ══════════════════════════════════════════════════════════
   AI 코치
   ══════════════════════════════════════════════════════════ */
function collectData(){
  const all=getHistoryWithToday(), sleepLogs=lsGet(K.SLEEP_LOGS)||[];
  const avgSleep=sleepLogs.length?Math.round(sleepLogs.reduce((s,l)=>s+l.durationMin,0)/sleepLogs.length):0;
  const weekSubMs={};
  all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>weekSubMs[k]=(weekSubMs[k]||0)+v));
  return {
    dday:DDAY, todayMin:Math.round(totalMs/60000), distractions,
    doneTasks:todayTasks.filter(t=>t.done).length, totalTasks:todayTasks.length,
    todaySubjectMin:Object.fromEntries(Object.entries(subjectTime).map(([k,v])=>[k,Math.round(v/60000)])),
    weekSubjectMin:Object.fromEntries(Object.entries(weekSubMs).map(([k,v])=>[k,Math.round(v/60000)])),
    goalMin:goals, avgSleepMin:avgSleep
  };
}
function buildPrompt(d){
  const subStatus=Object.entries(d.goalMin).map(([k,v])=>`${k}:실제${d.weekSubjectMin[k]||0}분(목표${v}분)`).join(', ');
  return `당신은 대한민국 수능 고3 수험생의 AI 학습 전략가입니다.
[데이터] D-${d.dday} / 오늘${d.todayMin}분 / 할일${d.doneTasks}/${d.totalTasks} / 방해${d.distractions}회 / 평균수면${d.avgSleepMin}분
[주간 과목 현황] ${subStatus}

지침:
1. '취약 과목 탐지': 주간 목표 대비 달성률이 가장 낮은 과목을 찾아 분석하고 대책을 줄 것.
2. '수면 및 컨디션': 수면 데이터 기반으로 학습 효율 조언.
3. 이모지 사용 금지. 모든 텍스트는 한글 또는 숫자만 사용할 것.
4. JSON만 반환: {"score":숫자, "sections":[{"icon":"","title":"취약 과목 탐지","body":"..."},{"icon":"","title":"수면 분석","body":"..."},{"icon":"","title":"내일의 미션","body":"..."}], "mission":"..."}`;
}
function renderCoachInline(parsed){
  document.getElementById('inlineScoreNum').textContent = `${parsed.score}점`;
  document.getElementById('liveScore').textContent      = parsed.score;
  const cs=document.getElementById('inlineCoachSections'); cs.innerHTML='';
  parsed.sections.forEach(sec=>{
    cs.innerHTML+=`<div class="coach-card"><div class="coach-card-head"><span>${sec.icon}</span><span>${sec.title}</span></div><div class="coach-card-body">${sec.body}</div></div>`;
  });
  document.getElementById('inlineMissionText').textContent = parsed.mission;
  document.getElementById('inlineCoachState').style.display  = 'none';
  document.getElementById('inlineCoachResult').style.display = 'block';
}
async function runCoachAnalysis(){
  document.getElementById('coachRunBtn').style.display    = 'none';
  document.getElementById('inlineCoachState').style.display = 'flex';
  try {
    const raw     = await callCoach(buildPrompt(collectData()));
    const cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { throw new Error('응답이 잘렸습니다. 잠시 후 다시 시도해주세요.'); }
    renderCoachInline(parsed);
  } catch(err){
    document.getElementById('inlineCoachState').style.display = 'none';
    document.getElementById('inlineCoachError').style.display = 'flex';
    document.getElementById('inlineCoachErrorMsg').textContent = `오류: ${err.message}`;
    document.getElementById('coachRunBtn').style.display = 'block';
  }
}
document.getElementById('coachRunBtn').addEventListener('click', runCoachAnalysis);

/* ── 초기 실행 ── */
renderToday(); renderTomorrow(); renderGoalBars();
updateAccumLabel(); updateLiveScore(); updateSleepUI();
updateTimerUI(); updateLectureModeBtn();
if(running) tick();
