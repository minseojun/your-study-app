/* ============================================================
   StudyFlow v7 — script.js
   신규:
     1. 바텀 탭 네비게이션 (오늘/타이머/분석/코치)
     2. 헤더 실시간 집중 점수 위젯
     3. 시간대별 집중 히트맵 (세션에 시작시각 기록)
     4. 주간 리포트 자동 생성 모달
   ============================================================ */
'use strict';

/* ── Gemini API ─────────────────────────────────────────── */
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

/* ── 상수 ───────────────────────────────────────────────── */
const SUNEUNG = new Date('2026-11-19T00:00:00');
const SUBJECTS = ['국어','영어','수학','사회문화','생활과윤리'];
const SUBJECT_COLORS = {'국어':'#ff6b6b','영어':'#51cf66','수학':'#339af0','사회문화':'#ffa94d','생활과윤리':'#cc5de8'};
const K = {
  TODAY_TASKS :'sf_today_tasks',
  TMRW_TASKS  :'sf_tmrw_tasks',
  TODAY_DATE  :'sf_today_date',
  TIMER_STATE :'sf_timer_state',  // {elapsed,subjectTime,sessions,distractions,totalMs}
  HISTORY     :'sf_history',      // [{date,totalMs,subjectTime,distractions,doneTasks,totalTasks,sessions}]
  GOALS       :'sf_goals',
  NIGHT       :'sf_night',
  LAST_REPORT :'sf_last_report',  // 마지막 주간 리포트 표시 날짜
};

/* ── 유틸 ───────────────────────────────────────────────── */
const pad2   = n => String(Math.floor(n)).padStart(2,'0');
const msToHMS = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; return h>0?`${pad2(h)}:${pad2(m)}:${pad2(s)}`:`${pad2(m)}:${pad2(s)}`; };
const msToReadable = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; if(h>0)return`${h}시간 ${pad2(m)}분`; if(m>0)return`${m}분 ${pad2(s)}초`; return`${s}초`; };
const getDday = () => { const a=new Date();a.setHours(0,0,0,0);const b=new Date(SUNEUNG);b.setHours(0,0,0,0);return Math.max(0,Math.round((b-a)/86400000)); };
const todayStr = () => new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\.\s*/g,'-').replace(/-$/,'');
const lsGet = k => { try{return JSON.parse(localStorage.getItem(k));}catch{return null;} };
const lsSet = (k,v) => localStorage.setItem(k,JSON.stringify(v));

/* ── 집중 점수 계산 (로컬) ──────────────────────────────── */
function calcLiveScore(tMs, sess, dist, doneT, totalT, st) {
  if(tMs===0&&sess.length===0) return null; // 아직 공부 안 했으면 표시 안 함
  let score = 0;
  // 시간: 120분=40점
  score += Math.min(40, Math.round(tMs/60000/120*40));
  // 최장 세션: 45분=20점
  const longest = sess.length ? Math.max(...sess.map(s=>s.ms)) : 0;
  score += Math.min(20, Math.round(longest/60000/45*20));
  // 완료율: 20점
  if(totalT>0) score += Math.round(doneT/totalT*20);
  // 과목 균형: 15점
  const cats = Object.keys(st).filter(k=>st[k]>0).length;
  score += Math.round(cats/SUBJECTS.length*15);
  // 방해: -4점/회
  score -= dist*4;
  return Math.max(0, Math.min(100, score));
}

/* ══════════════════════════════════════════════════════════
   날짜 롤오버
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
      sessions:pt.sessions||[], // 시간대 히트맵용
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
const midnight=new Date(); midnight.setHours(24,0,5,0);
setTimeout(()=>{checkDateRollover();location.reload();}, midnight-new Date());

/* ══════════════════════════════════════════════════════════
   헤더 초기화
   ══════════════════════════════════════════════════════════ */
document.getElementById('dateBadge').textContent =
  new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'});
const DDAY=getDday();
document.getElementById('dDayCount').textContent=DDAY;
document.getElementById('ddayBadge').textContent=`수능 D-${DDAY}`;

/* ══════════════════════════════════════════════════════════
   바텀 탭 네비게이션
   ══════════════════════════════════════════════════════════ */
let activeTab = 'today';
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if(tab === activeTab) return;
    // 패널 전환
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    // 버튼 활성화
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = tab;
    // 탭 진입 시 데이터 렌더
    if(tab==='stats') { renderWeeklyStats(); renderHeatmap(); renderManualList(); }
    if(tab==='coach') { /* 코치 탭: 버튼 누를 때만 분석 */ }
  });
});

/* ══════════════════════════════════════════════════════════
   야간 모드
   ══════════════════════════════════════════════════════════ */
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
setInterval(()=>{if(lsGet(K.NIGHT)===null)setNight(new Date().getHours()>=22);},60000);

/* ══════════════════════════════════════════════════════════
   과목 칩
   ══════════════════════════════════════════════════════════ */
let selectedCat='국어';
document.getElementById('categoryChips').addEventListener('click',e=>{
  const chip=e.target.closest('.chip');
  if(!chip) return;
  document.querySelectorAll('#categoryChips .chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active');
  selectedCat=chip.dataset.cat;
});

/* ══════════════════════════════════════════════════════════
   할 일 관리
   ══════════════════════════════════════════════════════════ */
let todayTasks=lsGet(K.TODAY_TASKS)||[];
let tomorrowTasks=lsGet(K.TMRW_TASKS)||[];

const S_POST=`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v6.5L10 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 10.5c.8 1.5 2.4 2.5 4.2 2.5 2.8 0 5-2.2 5-5S8 3 5.2 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const S_DEL=`<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const S_BACK=`<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5H2M6.5 2L2 6.5l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildItem(task,idx,isTomorrow){
  const li=document.createElement('li');
  li.className='task-item'+(task.done?' done':'')+(isTomorrow?' tomorrow-item':'');
  if(!isTomorrow){
    const cb=document.createElement('input');
    cb.type='checkbox';cb.className='task-cb';cb.checked=task.done;
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
  const n=tomorrowTasks.length;
  document.getElementById('tomorrowEmpty').style.display=n===0?'flex':'none';
  document.getElementById('tomorrowCount').textContent=`${n}개`;
}
function postponeTask(idx){ const t=todayTasks.splice(idx,1)[0]; tomorrowTasks.push({text:t.text,cat:t.cat,done:false}); lsSet(K.TODAY_TASKS,todayTasks); lsSet(K.TMRW_TASKS,tomorrowTasks); renderToday(); renderTomorrow(); }
function addTask(){
  const text=document.getElementById('taskInput').value.trim();
  if(!text){ const inp=document.getElementById('taskInput'); inp.classList.add('shake'); inp.addEventListener('animationend',()=>inp.classList.remove('shake'),{once:true}); return; }
  todayTasks.push({text,cat:selectedCat,done:false}); lsSet(K.TODAY_TASKS,todayTasks);
  document.getElementById('taskInput').value=''; document.getElementById('taskInput').focus();
  renderToday();
}
document.getElementById('addBtn').addEventListener('click',addTask);
document.getElementById('taskInput').addEventListener('keydown',e=>{ if(e.key==='Enter')addTask(); });
renderToday(); renderTomorrow();

/* ══════════════════════════════════════════════════════════
   목표 시간
   ══════════════════════════════════════════════════════════ */
let goals=lsGet(K.GOALS)||{국어:60,영어:60,수학:90,사회문화:45,생활과윤리:45};

function renderGoalBars(){
  const bars=document.getElementById('goalBars'); bars.innerHTML='';
  SUBJECTS.forEach(sub=>{
    const goal=goals[sub]||0; if(!goal) return;
    const actual=Math.round((subjectTime[sub]||0)/60000);
    const pct=Math.min(100,goal>0?Math.round(actual/goal*100):0);
    const bar=document.createElement('div'); bar.className='goal-bar-row';
    bar.innerHTML=`<span class="goal-bar-label">${sub}</span><div class="goal-bar-track"><div class="goal-bar-fill" style="width:0%;background:${SUBJECT_COLORS[sub]}" data-pct="${pct}"></div></div><span class="goal-bar-stat">${actual}/${goal}분</span>`;
    bars.appendChild(bar);
  });
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ document.querySelectorAll('.goal-bar-fill').forEach(el=>el.style.width=el.dataset.pct+'%'); }));
}
function renderGoalEditPanel(){
  const inp=document.getElementById('goalInputs'); inp.innerHTML='';
  SUBJECTS.forEach(sub=>{
    const row=document.createElement('div'); row.className='goal-input-row';
    row.innerHTML=`<span class="goal-input-label"><span class="cat-dot cat-${sub}"></span>${sub}</span><input type="number" class="goal-input-field" data-sub="${sub}" value="${goals[sub]||0}" min="0" max="480" step="15"/><span class="goal-input-unit">분</span>`;
    inp.appendChild(row);
  });
}
document.getElementById('goalEditBtn').addEventListener('click',()=>{ const p=document.getElementById('goalEditPanel'); if(p.style.display==='block'){p.style.display='none';}else{renderGoalEditPanel();p.style.display='block';} });
document.getElementById('goalSave').addEventListener('click',()=>{ document.querySelectorAll('.goal-input-field').forEach(i=>{goals[i.dataset.sub]=parseInt(i.value)||0;}); lsSet(K.GOALS,goals); document.getElementById('goalEditPanel').style.display='none'; renderGoalBars(); showNotif('목표가 저장됐어요 ✅',''); });
document.getElementById('goalCancel').addEventListener('click',()=>{ document.getElementById('goalEditPanel').style.display='none'; });

/* ══════════════════════════════════════════════════════════
   타이머 — startTime 기반 설계 (백그라운드 완전 복원)
   ──────────────────────────────────────────────────────────
   핵심 원칙:
     • elapsed    = 완료된 세션들의 누적 ms
     • startTime  = 현재 세션 시작 Unix ms → localStorage 저장
     • 현재 총 시간 = elapsed + (Date.now() - startTime)
     • JS가 백그라운드에서 완전히 죽어도 Date.now()는 정확함
     • setInterval은 화면 표시(tick)에만 사용, 시간 계산과 무관
   ══════════════════════════════════════════════════════════ */

let timerState   = lsGet(K.TIMER_STATE) || {};
let elapsed      = timerState.elapsed      || 0;
let sessions     = timerState.sessions     || [];
let distractions = timerState.distractions || 0;
let totalMs      = timerState.totalMs      || 0;
let subjectTime  = timerState.subjectTime  || {};
let startTime    = timerState.startTime    || null;
let sessionStart = timerState.sessionStart || null;
if (timerState.selectedCat) selectedCat = timerState.selectedCat;

let ticker = null, running = false, laps = [], lastLap = 0, isFS = false;

// ── 저장 ───────────────────────────────────────────────────
function saveTimerState() {
  lsSet(K.TIMER_STATE, {
    elapsed, subjectTime, sessions, distractions, totalMs,
    startTime:    startTime,    // 실행 중이면 값, 정지 중이면 null
    sessionStart: sessionStart, // 동일
    selectedCat,
  });
}

// ── 현재까지 총 경과 ms ────────────────────────────────────
function nowMs() {
  return startTime !== null ? elapsed + (Date.now() - startTime) : elapsed;
}

// ── 화면 표시 전용 ─────────────────────────────────────────
function tick() {
  const ms = nowMs(), t = Math.floor(ms / 1000);
  document.getElementById('swHours').textContent   = pad2(Math.floor(t / 3600));
  document.getElementById('swMinutes').textContent = pad2(Math.floor((t % 3600) / 60));
  document.getElementById('swSeconds').textContent = pad2(t % 60);
  document.getElementById('swMs').textContent      = '.' + pad2(Math.floor((ms % 1000) / 10));
}
function updateAccumLabel() {
  document.getElementById('swAccum').textContent = totalMs > 0 ? msToReadable(totalMs) : '0분';
}

// ── 집중 점수 ──────────────────────────────────────────────
function updateLiveScore() {
  const done  = todayTasks.filter(t => t.done).length;
  const score = calcLiveScore(totalMs, sessions, distractions, done, todayTasks.length, subjectTime);
  const el    = document.getElementById('liveScore');
  if (score === null) { el.textContent = '—'; el.style.color = ''; return; }
  el.textContent = score;
  el.style.color = score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--accent)' : 'var(--danger)';
}

// ── 앱 재시작 시 백그라운드 종료 복원 ──────────────────────
// startTime이 저장돼 있다 = 타이머 실행 중에 앱이 종료됐었음
// → 꺼져 있던 동안의 시간을 포함해 세션 완료 처리 후 정지 상태로 복원
if (startTime !== null && sessionStart !== null) {
  const killedMs  = Date.now() - startTime;
  const startHour = new Date(sessionStart).getHours();
  elapsed    += killedMs;
  totalMs    += killedMs;
  subjectTime[selectedCat] = (subjectTime[selectedCat] || 0) + killedMs;
  sessions    = [...sessions, { ms: killedMs, startHour }];
  startTime    = null;
  sessionStart = null;
  saveTimerState();
  // showNotif는 아래에서 정의되므로 setTimeout으로 지연
  setTimeout(() => showNotif(`자리 비운 동안 ${msToReadable(killedMs)} 기록됐어요 ✅`, '⏱'), 1200);
}

const startStopBtn = document.getElementById('startStopBtn');
const lapBtn       = document.getElementById('lapBtn');
const brandDot     = document.getElementById('brandDot');
const swDisplay    = document.getElementById('swDisplay');

// ── 시작 ───────────────────────────────────────────────────
function startTimer() {
  const el = document.documentElement;
  (el.requestFullscreen ? el.requestFullscreen()
    : el.webkitRequestFullscreen ? new Promise(r => { el.webkitRequestFullscreen(); r(); })
    : Promise.resolve()).catch(() => {});

  startTime    = Date.now();
  sessionStart = Date.now();
  running      = true;

  // ★ 즉시 저장 — 이 시점부터 앱이 죽어도 startTime으로 복원 가능
  saveTimerState();

  ticker = setInterval(tick, 30);  // 화면 표시용만 — 시간 계산과 무관

  startStopBtn.textContent = '정지';
  startStopBtn.classList.add('stop');
  lapBtn.disabled = false;
  swDisplay.classList.add('running');
  brandDot.classList.add('pulse');
  document.getElementById('fsHint').textContent = '🟢 집중 모드 실행 중';
  startNotifTimer();
}

// ── 정지 ───────────────────────────────────────────────────
function stopTimer() {
  const sMs       = Date.now() - sessionStart;
  const startHour = new Date(sessionStart).getHours();
  sessions    = [...sessions, { ms: sMs, startHour }];
  totalMs    += sMs;
  subjectTime[selectedCat] = (subjectTime[selectedCat] || 0) + sMs;
  elapsed    += Date.now() - startTime;
  startTime    = null;
  sessionStart = null;

  clearInterval(ticker); ticker = null; running = false;
  startStopBtn.textContent = '계속';
  startStopBtn.classList.remove('stop');
  lapBtn.disabled = true;
  swDisplay.classList.remove('running');
  brandDot.classList.remove('pulse');
  document.getElementById('fsHint').textContent = '▶ 시작 시 전체화면으로 전환돼요';

  tick(); updateAccumLabel(); saveTimerState();
  renderGoalBars(); updateLiveScore();
  stopNotifTimer();
  if (document.fullscreenElement || document.webkitFullscreenElement)
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  showReport();
}

// ── 초기화 ─────────────────────────────────────────────────
function resetTimer() {
  clearInterval(ticker); stopNotifTimer();
  elapsed = 0; startTime = null; sessionStart = null; running = false;
  laps = []; lastLap = 0; sessions = []; totalMs = 0;
  distractions = 0; subjectTime = {}; isFS = false;
  saveTimerState();
  startStopBtn.textContent = '시작'; startStopBtn.classList.remove('stop');
  lapBtn.disabled = true;
  swDisplay.classList.remove('running'); brandDot.classList.remove('pulse');
  document.getElementById('fsHint').textContent = '▶ 시작 시 전체화면으로 전환돼요';
  ['swHours','swMinutes','swSeconds'].forEach(id => document.getElementById(id).textContent = '00');
  document.getElementById('swMs').textContent = '.00';
  updateAccumLabel(); updateLiveScore(); renderGoalBars();
  document.getElementById('lapsList').innerHTML = '';
  document.getElementById('lapsHeader').classList.remove('show');
  if (document.fullscreenElement || document.webkitFullscreenElement)
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
}

// ── 탭 복귀 시 화면 즉시 갱신 ─────────────────────────────
// iOS에서 앱으로 돌아오면 tick이 멈춰있으므로 즉시 갱신
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && startTime !== null) {
    tick(); updateAccumLabel(); updateLiveScore();
  }
});

function addLap() {
  if (!running) return;
  const now = nowMs(), t = now - lastLap;
  lastLap = now; laps = [...laps, t]; renderLaps();
}
function renderLaps() {
  const ll = document.getElementById('lapsList'), lh = document.getElementById('lapsHeader');
  ll.innerHTML = '';
  if (!laps.length) { lh.classList.remove('show'); return; }
  lh.classList.add('show');
  const mn = Math.min(...laps), mx = Math.max(...laps);
  [...laps].reverse().forEach((t, ri) => {
    const idx = laps.length - 1 - ri;
    const li  = document.createElement('li'); li.className = 'lap-item';
    if (laps.length >= 2) { if (t === mn) li.classList.add('fastest'); else if (t === mx) li.classList.add('slowest'); }
    const cs = Math.floor((t%1000)/10), ts = Math.floor(t/1000), m = Math.floor(ts/60), s = ts%60;
    li.innerHTML = `<span class="lap-num">랩 ${idx+1}</span><span class="lap-time">${(m>0?pad2(m)+':':'')+pad2(s)+'.'+pad2(cs)}</span>`;
    ll.appendChild(li);
  });
}

startStopBtn.addEventListener('click', () => running ? stopTimer() : startTimer());
lapBtn.addEventListener('click', addLap);
document.getElementById('resetBtn').addEventListener('click', resetTimer);
tick(); updateAccumLabel(); renderGoalBars(); updateLiveScore();

/* ══════════════════════════════════════════════════════════
   토스트 알림 (인앱 전용 — 공부 알림 UI 제거됨)
   ══════════════════════════════════════════════════════════ */
function showNotif(msg, icon='🔔') {
  const t = document.getElementById('notifToast');
  document.getElementById('notifMsg').textContent  = msg;
  document.getElementById('notifIcon').textContent = icon || '🔔';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 5000);
}
document.getElementById('notifClose').addEventListener('click', () =>
  document.getElementById('notifToast').classList.remove('show')
);
// 타이머 시작/정지에서 호출하는 빈 stub (알림 UI 제거됨)
function startNotifTimer() {}
function stopNotifTimer()  {}

/* ══════════════════════════════════════════════════════════
   집중 오버레이 / 토스트
   ══════════════════════════════════════════════════════════ */
const focusOverlay=document.getElementById('focusOverlay');
let alertLoop=null,toastTimer=null,overlayOn=false;
function beep(){ try{const ctx=new(window.AudioContext||window.webkitAudioContext)();[[0,880],[.22,1100],[.44,880]].forEach(([d,f])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type='square';o.frequency.value=f;const t=ctx.currentTime+d;g.gain.setValueAtTime(.15,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.start(t);o.stop(t+.2);});}catch(_){} }
function showOverlay(){ if(overlayOn)return;overlayOn=true;distractions++;saveTimerState();focusOverlay.classList.add('show');beep();alertLoop=setInterval(beep,2200); }
function hideOverlay(){ overlayOn=false;focusOverlay.classList.remove('show');clearInterval(alertLoop);alertLoop=null; }
function showFocusToast(){ const t=document.getElementById('focusToast');t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4500); }
document.getElementById('overlayBackBtn').addEventListener('click',()=>{hideOverlay();document.getElementById('focusToast').classList.remove('show');});
document.getElementById('focusToastClose').addEventListener('click',()=>document.getElementById('focusToast').classList.remove('show'));
function onFSChange(){ const nowFS=!!(document.fullscreenElement||document.webkitFullscreenElement);if(isFS&&!nowFS&&running)showOverlay();if(nowFS)hideOverlay();isFS=nowFS; }
document.addEventListener('fullscreenchange',onFSChange);
document.addEventListener('webkitfullscreenchange',onFSChange);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)showOverlay();if(!document.hidden&&overlayOn)hideOverlay();});
window.addEventListener('blur',()=>{if(running)showFocusToast();});

/* ══════════════════════════════════════════════════════════
   주간 통계 차트
   ══════════════════════════════════════════════════════════ */
let weeklyChartInst=null;
function getHistoryWithToday(){
  const history=lsGet(K.HISTORY)||[];
  const todayEntry={date:todayStr(),totalMs,subjectTime,distractions,sessions,doneTasks:todayTasks.filter(t=>t.done).length,totalTasks:todayTasks.length};
  return [...history,todayEntry].slice(-7);
}

function renderWeeklyStats(){
  const all=getHistoryWithToday();
  const weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  document.getElementById('weeklyTotal').textContent=msToReadable(weekTotal)||'0분';
  const labels=all.map(d=>d.date.slice(-5));
  const mins=all.map(d=>Math.round(d.totalMs/60000));
  if(weeklyChartInst){weeklyChartInst.destroy();weeklyChartInst=null;}
  weeklyChartInst=new Chart(document.getElementById('weeklyChart'),{
    type:'bar',
    data:{labels,datasets:[{label:'공부(분)',data:mins,backgroundColor:mins.map((_,i)=>i===all.length-1?'#0071e3':'#c7dff7'),borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.y}분`}}},scales:{y:{beginAtZero:true,ticks:{color:'#aeaeb2',font:{size:10}},grid:{color:'rgba(0,0,0,.05)'}},x:{ticks:{color:'#aeaeb2',font:{size:10}},grid:{display:false}}}}
  });
  const subTotals={};
  all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>{subTotals[k]=(subTotals[k]||0)+v;}));
  const ws=document.getElementById('weeklySubjects'); ws.innerHTML='';
  SUBJECTS.forEach(sub=>{
    if(!subTotals[sub])return;
    const item=document.createElement('div');item.className='weekly-subject-item';
    item.innerHTML=`<span class="cat-dot cat-${sub}"></span><span class="ws-name">${sub}</span><span class="ws-time">${msToReadable(subTotals[sub])}</span>`;
    ws.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════════
   시간대별 히트맵
   ── 세션의 startHour를 기록해서 7일치 집계
   ══════════════════════════════════════════════════════════ */
function buildHourMap(){
  // 24시간 배열, 각 칸 = 해당 시간대 총 공부 ms
  const map=new Array(24).fill(0);
  const all=getHistoryWithToday();
  all.forEach(day=>{
    (day.sessions||[]).forEach(s=>{
      const h=s.startHour;
      if(h!=null&&h>=0&&h<24) map[h]+=s.ms;
    });
  });
  return map;
}

function renderHeatmap(){
  const map=buildHourMap();
  const maxVal=Math.max(...map,1);
  const grid=document.getElementById('heatmapGrid'); grid.innerHTML='';

  // 시간 레이블 + 셀 (24개)
  for(let h=0;h<24;h++){
    const cell=document.createElement('div');
    cell.className='hm-cell';
    const lvl=map[h]===0?0:map[h]<maxVal*.25?1:map[h]<maxVal*.5?2:map[h]<maxVal*.75?3:4;
    cell.setAttribute('data-lvl',lvl);
    cell.title=`${h}시: ${msToReadable(map[h])||'0분'}`;
    grid.appendChild(cell);
  }

  // 시간 레이블 행
  let labelRow=document.querySelector('.heatmap-labels');
  if(!labelRow){ labelRow=document.createElement('div'); labelRow.className='heatmap-labels'; grid.parentNode.insertBefore(labelRow,grid); }
  labelRow.innerHTML='';
  for(let h=0;h<24;h++){
    const lbl=document.createElement('div'); lbl.className='hm-label'; lbl.textContent=h%3===0?`${h}시`:'';
    labelRow.appendChild(lbl);
  }

  // 최고 집중 시간대
  const bestH=map.indexOf(maxVal);
  const bestEl=document.getElementById('bestHour');
  if(map[bestH]>0){
    bestEl.innerHTML=`집중이 가장 잘 되는 시간대는 <strong>${bestH}시~${bestH+1}시</strong>예요. 이 시간에 어려운 과목을 배치해봐요! 🎯`;
  } else {
    bestEl.innerHTML='아직 공부 기록이 없어요. 타이머를 사용하면 패턴이 보여요 📊';
  }
}

/* ══════════════════════════════════════════════════════════
   주간 리포트 모달
   ══════════════════════════════════════════════════════════ */
document.getElementById('weeklyReportBtn').addEventListener('click',()=>showWeeklyReport());
document.getElementById('weeklyReportClose').addEventListener('click',()=>document.getElementById('weeklyReportBackdrop').classList.remove('show'));
document.getElementById('weeklyReportBackdrop').addEventListener('click',e=>{if(e.target===document.getElementById('weeklyReportBackdrop'))document.getElementById('weeklyReportBackdrop').classList.remove('show');});

function showWeeklyReport(){
  const all=getHistoryWithToday();
  const weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  const studyDays=all.filter(d=>d.totalMs>0).length;
  const avgMin=studyDays>0?Math.round(weekTotal/60000/studyDays):0;
  const weekDist=all.reduce((s,d)=>s+d.distractions,0);
  const weekDone=all.reduce((s,d)=>s+d.doneTasks,0);
  const weekTasks=all.reduce((s,d)=>s+d.totalTasks,0);

  // 과목별 합산
  const subTotals={};
  all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>{subTotals[k]=(subTotals[k]||0)+v;}));
  const subMax=Math.max(...Object.values(subTotals),1);

  // 인사이트 생성
  const topSub=Object.entries(subTotals).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const missingSub=SUBJECTS.filter(s=>!subTotals[s]||subTotals[s]<60000);
  let insight='';
  if(studyDays===0) insight='이번 주 공부 기록이 없어요. 다음 주에는 꼭 시작해봐요! 💪';
  else if(missingSub.length>0) insight=`이번 주 <strong>${missingSub[0]}</strong> 공부가 부족했어요. 다음 주에는 ${missingSub[0]}를 먼저 챙겨봐요!`;
  else if(studyDays>=5) insight=`대단해요! 이번 주 ${studyDays}일이나 공부했어요. 수능이 D-${DDAY}일인 만큼 이 페이스 유지해봐요 🔥`;
  else insight=`이번 주 ${studyDays}일 공부했고 ${topSub||''}에 가장 집중했어요. 꾸준함이 실력이 돼요! ✨`;

  // 공부 연속 기록
  let streak=0, maxStreak=0, curStreak=0;
  all.forEach(d=>{ if(d.totalMs>0){curStreak++;maxStreak=Math.max(maxStreak,curStreak);}else curStreak=0; });
  streak=curStreak;

  const body=document.getElementById('weeklyReportBody');
  body.innerHTML='';

  // 핵심 지표
  const statsSection=document.createElement('div'); statsSection.className='weekly-report-section';
  statsSection.innerHTML=`<h3>이번 주 핵심 지표</h3><div class="wr-stat-row">
    <div class="wr-stat"><div class="wr-stat-val">${msToReadable(weekTotal)||'0분'}</div><div class="wr-stat-lbl">총 공부 시간</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${studyDays}일</div><div class="wr-stat-lbl">공부한 날</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${avgMin}분</div><div class="wr-stat-lbl">일 평균</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${weekDone}/${weekTasks}</div><div class="wr-stat-lbl">할 일 완료</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${weekDist}회</div><div class="wr-stat-lbl">집중 방해</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${streak}일 🔥</div><div class="wr-stat-lbl">연속 공부</div></div>
  </div>`;
  body.appendChild(statsSection);

  // 과목별 막대
  if(Object.keys(subTotals).length>0){
    const subSection=document.createElement('div'); subSection.className='weekly-report-section';
    let subHtml='<h3>과목별 시간</h3><div class="wr-subject-bars">';
    SUBJECTS.forEach(sub=>{
      if(!subTotals[sub])return;
      const pct=Math.round(subTotals[sub]/subMax*100);
      subHtml+=`<div class="wr-sub-row"><span class="wr-sub-name"><span class="cat-dot cat-${sub}" style="margin-right:4px"></span>${sub}</span><div class="wr-sub-track"><div class="wr-sub-fill" style="width:0%;background:${SUBJECT_COLORS[sub]}" data-pct="${pct}"></div></div><span class="wr-sub-time">${msToReadable(subTotals[sub])}</span></div>`;
    });
    subHtml+='</div>';
    subSection.innerHTML=subHtml;
    body.appendChild(subSection);
    requestAnimationFrame(()=>requestAnimationFrame(()=>body.querySelectorAll('.wr-sub-fill').forEach(el=>el.style.width=el.dataset.pct+'%')));
  }

  // 7일 공부 여부 캘린더
  const calSection=document.createElement('div'); calSection.className='weekly-report-section';
  let calHtml='<h3>이번 주 달력</h3><div class="wr-streak">';
  all.forEach((d,i)=>{
    const isToday=i===all.length-1;
    const cls=isToday?'wr-day today':d.totalMs>0?'wr-day studied':'wr-day empty';
    const label=d.date.slice(-5);
    calHtml+=`<div class="${cls}" title="${label}">${label.slice(3)}</div>`;
  });
  calHtml+='</div>';
  calSection.innerHTML=calHtml;
  body.appendChild(calSection);

  // 인사이트
  const insightEl=document.createElement('div'); insightEl.className='wr-insight';
  insightEl.innerHTML=insight;
  body.appendChild(insightEl);

  document.getElementById('weeklyReportBackdrop').classList.add('show');

  // 일요일 밤 자동 팝업 체크
  lsSet(K.LAST_REPORT,todayStr());
}

// 일요일 밤 21시 이후 자동 주간 리포트
(function autoWeeklyReport(){
  const now=new Date();
  const lastReport=lsGet(K.LAST_REPORT)||'';
  if(now.getDay()===0&&now.getHours()>=21&&lastReport!==todayStr()){
    setTimeout(()=>showWeeklyReport(), 2000);
  }
})();

/* ══════════════════════════════════════════════════════════
   공부 리포트 모달
   ══════════════════════════════════════════════════════════ */
const modalBackdrop=document.getElementById('modalBackdrop');
let pieChart=null;

function simpleFeedback(st){
  const entries=Object.entries(st).sort((a,b)=>b[1]-a[1]);
  if(!entries.length)return'오늘 공부 기록이 없어요. 내일은 꼭 시작해봐요! 💪';
  const total=entries.reduce((s,[,v])=>s+v,0);
  const top=entries[0][0],topPct=Math.round(entries[0][1]/total*100);
  const missing=SUBJECTS.filter(s=>!st[s]);
  if(missing.length)return`${missing[0]} 공부 비중이 낮아요. 내일은 ${missing[0]}을 먼저 해봐요! 🎯`;
  if(topPct>=60)return`${top}에 집중했군요(${topPct}%)! 균형을 위해 내일은 다른 과목도 챙겨봐요 👍`;
  return`오늘 균형 있게 공부했어요! 이 페이스 유지해봐요 🔥`;
}

function showReport(){
  document.getElementById('rTotalTime').textContent=totalMs>0?msToReadable(totalMs):'0초';
  document.getElementById('rSessions').textContent=`${sessions.length}회`;
  document.getElementById('rLongest').textContent=sessions.length?msToReadable(Math.max(...sessions.map(s=>s.ms))):'—';
  document.getElementById('rDistractions').textContent=`${distractions}회`;
  const chartData={...subjectTime};
  if(!Object.keys(chartData).length)todayTasks.forEach(t=>{if(t.done)chartData[t.cat||'국어']=(chartData[t.cat||'국어']||0)+60000;});
  const labels=[],data=[],colors=[];
  SUBJECTS.forEach(s=>{if(chartData[s]&&chartData[s]>0){labels.push(s);data.push(Math.round(chartData[s]/1000));colors.push(SUBJECT_COLORS[s]);}});
  if(data.length){
    document.getElementById('chartSection').style.display='flex';
    const tot=data.reduce((a,b)=>a+b,0);
    document.getElementById('chartLegend').innerHTML='';
    labels.forEach((l,i)=>{const pct=Math.round(data[i]/tot*100);document.getElementById('chartLegend').innerHTML+=`<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span><span>${l}</span><span class="legend-pct">${pct}%</span></div>`;});
    document.getElementById('aiFeedback').textContent=simpleFeedback(chartData);
    if(pieChart){pieChart.destroy();pieChart=null;}
    pieChart=new Chart(document.getElementById('subjectChart'),{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderColor:colors,borderWidth:2,hoverOffset:8}]},options:{responsive:false,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const p=Math.round(c.parsed/tot*100);return` ${c.label}: ${msToReadable(c.parsed*1000)} (${p}%)`;}}}}}});
  }else document.getElementById('chartSection').style.display='none';
  const st=document.getElementById('sessionTimeline'); st.innerHTML='';
  if(sessions.length&&totalMs>0){
    document.getElementById('timelineSection').style.display='flex';
    sessions.forEach((s,i)=>{const pct=Math.max(4,Math.round(s.ms/totalMs*100));const row=document.createElement('div');row.className='bar-row';row.innerHTML=`<span class="bar-lbl">#${i+1}</span><div class="bar-track"><div class="bar-fill" style="width:0%"></div></div><span class="bar-time">${msToHMS(s.ms)}</span>`;st.appendChild(row);requestAnimationFrame(()=>requestAnimationFrame(()=>{row.querySelector('.bar-fill').style.width=pct+'%';}));});
  }else document.getElementById('timelineSection').style.display='none';
  modalBackdrop.classList.add('show');
}
document.getElementById('modalClose').addEventListener('click',()=>modalBackdrop.classList.remove('show'));
document.getElementById('modalContinue').addEventListener('click',()=>{modalBackdrop.classList.remove('show');setTimeout(startTimer,220);});
document.getElementById('modalReset').addEventListener('click',()=>{modalBackdrop.classList.remove('show');setTimeout(resetTimer,220);});
modalBackdrop.addEventListener('click',e=>{if(e.target===modalBackdrop)modalBackdrop.classList.remove('show');});

/* ══════════════════════════════════════════════════════════
   AI 코치 (코치 탭 인라인)
   ══════════════════════════════════════════════════════════ */
function collectData(){
  const all=getHistoryWithToday();
  const weekSubjectMs={};let weekTotal=0,weekDist=0,studyDays=0;
  all.forEach(d=>{weekTotal+=d.totalMs;weekDist+=d.distractions;if(d.totalMs>0)studyDays++;Object.entries(d.subjectTime||{}).forEach(([k,v])=>{weekSubjectMs[k]=(weekSubjectMs[k]||0)+v;});});
  const weekSubjectMin={};Object.entries(weekSubjectMs).forEach(([k,v])=>{weekSubjectMin[k]=Math.round(v/60000);});
  const catAll={},catDone={};todayTasks.forEach(t=>{catAll[t.cat]=(catAll[t.cat]||0)+1;if(t.done)catDone[t.cat]=(catDone[t.cat]||0)+1;});
  return{dday:getDday(),todayMin:Math.round(totalMs/60000),sessionCount:sessions.length,longestMin:sessions.length?Math.round(Math.max(...sessions.map(s=>s.ms))/60000):0,distractions,doneTasks:todayTasks.filter(t=>t.done).length,totalTasks:todayTasks.length,postponed:tomorrowTasks.length,catAll,catDone,todaySubjectMin:Object.fromEntries(Object.entries(subjectTime).map(([k,v])=>[k,Math.round(v/60000)])),weekTotalMin:Math.round(weekTotal/60000),weekSubjectMin,weekDistractions:weekDist,studyDays,goalMin:goals,dailyMins:all.map(d=>({date:d.date,min:Math.round(d.totalMs/60000)}))};
}

function buildPrompt(d){
  const todaySub=Object.keys(d.todaySubjectMin).length?Object.entries(d.todaySubjectMin).map(([k,v])=>`${k} ${v}분`).join(', '):'기록 없음';
  const weekSub=Object.keys(d.weekSubjectMin).length?Object.entries(d.weekSubjectMin).map(([k,v])=>`${k} ${v}분`).join(', '):'기록 없음';
  return`당신은 대한민국 수능 고3 수험생의 AI 학습 코치입니다.
수강 과목: 국어, 영어, 수학, 사회문화, 생활과윤리

[오늘] D-${d.dday}일 / 공부 ${d.todayMin}분 / 세션 ${d.sessionCount}회 / 최장 ${d.longestMin}분 / 방해 ${d.distractions}회
할 일 ${d.doneTasks}/${d.totalTasks}개 완료 / 미룬 항목 ${d.postponed}개 / 과목별: ${todaySub}
[7일 누적] 총 ${d.weekTotalMin}분 (${d.studyDays}일) / 방해 ${d.weekDistractions}회 / ${weekSub}
[일별] ${d.dailyMins.map(x=>`${x.date.slice(-5)}:${x.min}분`).join(', ')}
[목표] ${Object.entries(d.goalMin).map(([k,v])=>`${k}:${v}분`).join(', ')}

점수 기준: 시간(120분=40점), 최장세션(45분=20점), 완료율(20점), 과목균형(15점), 방해(-4점/회)

JSON만 반환(마크다운 없이):
{"score":숫자,"sections":[{"icon":"이모지","title":"제목","body":"2~3문장"},{"icon":"이모지","title":"제목","body":"2~3문장"},{"icon":"이모지","title":"제목","body":"2~3문장"}],"mission":"내일 미션 1문장(과목+분량)"}

조언은 7일 트렌드 반영, 따뜻하고 구체적으로.`;
}

async function callGemini(prompt){
  const res=await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.8,maxOutputTokens:1024}})});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`HTTP ${res.status}`);}
  return(await res.json()).candidates?.[0]?.content?.parts?.[0]?.text||'';
}

function renderCoachInline(parsed){
  const score=Math.max(0,Math.min(100,Number(parsed.score)||50));
  document.getElementById('inlineScoreNum').textContent=`${score}점`;
  document.getElementById('inlineDday').textContent=`D-${getDday()}`;
  document.getElementById('inlineScoreNum').style.color=score>=80?'var(--ok)':score>=50?'var(--accent)':'var(--danger)';
  // 점수 위젯도 동기화
  document.getElementById('liveScore').textContent=score;
  document.getElementById('liveScore').style.color=score>=80?'var(--ok)':score>=50?'var(--accent)':'var(--danger)';
  const cs=document.getElementById('inlineCoachSections'); cs.innerHTML='';
  (parsed.sections||[]).forEach((sec,i)=>{
    const div=document.createElement('div');div.className='coach-card';div.style.animationDelay=`${i*80}ms`;
    div.innerHTML=`<div class="coach-card-head"><span class="coach-card-icon">${sec.icon||'💡'}</span><span>${sec.title||''}</span></div><div class="coach-card-body">${sec.body||''}</div>`;
    cs.appendChild(div);
  });
  document.getElementById('inlineMissionText').textContent=parsed.mission||'내일도 화이팅!';
  document.getElementById('inlineCoachState').style.display='none';
  document.getElementById('inlineCoachError').style.display='none';
  document.getElementById('inlineCoachResult').style.display='block';
  document.getElementById('coachRunBtn').style.display='none';
}

async function runCoachAnalysis(){
  document.getElementById('coachRunBtn').style.display='none';
  document.getElementById('inlineCoachState').style.display='flex';
  document.getElementById('inlineCoachError').style.display='none';
  document.getElementById('inlineCoachResult').style.display='none';
  try{
    const raw=await callGemini(buildPrompt(collectData()));
    const cleaned=raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    let parsed;try{parsed=JSON.parse(cleaned);}catch{parsed={score:70,sections:[{icon:'📝',title:'AI 코치 조언',body:raw.slice(0,400)}],mission:'내일도 화이팅!'};}
    renderCoachInline(parsed);
  }catch(err){
    document.getElementById('inlineCoachState').style.display='none';
    document.getElementById('inlineCoachError').style.display='flex';
    document.getElementById('inlineCoachErrorMsg').textContent=err.message.includes('API_KEY_INVALID')?'API 키를 확인해주세요.':err.message.includes('QUOTA')?'API 할당량 초과. 잠시 후 다시 시도해주세요.':`오류: ${err.message}`;
    document.getElementById('coachRunBtn').style.display='block';
  }
}

document.getElementById('coachRunBtn').addEventListener('click',runCoachAnalysis);

/* ══════════════════════════════════════════════════════════
   수동 공부 기록
   ──────────────────────────────────────────────────────────
   • 날짜 / 과목 / 시간(h+m) / 메모 입력
   • 오늘 날짜면 현재 세션 데이터(subjectTime, totalMs)에 합산
   • 다른 날짜면 history에서 해당 날짜 항목을 찾아 합산
   • 기록 목록에서 삭제 가능
   ══════════════════════════════════════════════════════════ */

const K_MANUAL = 'sf_manual_records'; // [{id,date,cat,ms,memo}]

// 날짜 입력 기본값: 오늘
(function initManualDate() {
  const inp = document.getElementById('manualDate');
  // YYYY-MM-DD 형식으로 오늘 날짜 설정
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  inp.value = `${yyyy}-${mm}-${dd}`;
  inp.max   = `${yyyy}-${mm}-${dd}`;   // 미래 날짜 막기
})();

// 수동 과목 칩
let manualCat = '국어';
document.getElementById('manualChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#manualChips .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  manualCat = chip.dataset.cat;
});

// 수동 기록 불러오기
function getManualRecords() { return lsGet(K_MANUAL) || []; }
function saveManualRecords(arr) { lsSet(K_MANUAL, arr); }

// 분석 탭 진입 시 렌더
function renderManualList() {
  const list = document.getElementById('manualList');
  if (!list) return;
  const records = getManualRecords();
  list.innerHTML = '';
  if (!records.length) return;

  // 최신순 정렬
  [...records].reverse().forEach(rec => {
    const item = document.createElement('div');
    item.className = 'manual-item';

    const timeStr = (() => {
      const t = Math.floor(rec.ms / 60000);
      const h = Math.floor(t / 60), m = t % 60;
      return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    })();

    item.innerHTML = `
      <span class="manual-item-dot cat-${rec.cat}" style="background:${SUBJECT_COLORS[rec.cat]||'#aaa'}"></span>
      <div class="manual-item-info">
        <div class="manual-item-title">${rec.memo || rec.cat}</div>
        <div class="manual-item-meta">${rec.date} · ${rec.cat}</div>
      </div>
      <span class="manual-item-time">${timeStr}</span>
      <button class="manual-item-del" data-id="${rec.id}" title="삭제">✕</button>
    `;

    item.querySelector('.manual-item-del').addEventListener('click', () => {
      deleteManualRecord(rec.id);
    });

    list.appendChild(item);
  });
}

// 저장 버튼
document.getElementById('manualSaveBtn').addEventListener('click', () => {
  const dateVal  = document.getElementById('manualDate').value;
  const hours    = parseInt(document.getElementById('manualHours').value) || 0;
  const mins     = parseInt(document.getElementById('manualMins').value)  || 0;
  const memo     = document.getElementById('manualMemo').value.trim();
  const totalMin = hours * 60 + mins;

  if (!dateVal)       { showNotif('날짜를 선택해주세요', '⚠️'); return; }
  if (totalMin <= 0)  { showNotif('시간을 1분 이상 입력해주세요', '⚠️'); return; }
  if (totalMin > 720) { showNotif('한 번에 최대 12시간까지 입력할 수 있어요', '⚠️'); return; }

  const ms  = totalMin * 60 * 1000;
  const rec = {
    id   : Date.now().toString(),
    date : dateVal,
    cat  : manualCat,
    ms,
    memo : memo || manualCat,
  };

  // 기록 저장
  const records = getManualRecords();
  records.push(rec);
  saveManualRecords(records);

  // 오늘 날짜면 현재 세션 데이터에 합산
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  })();

  if (dateVal === today) {
    totalMs   += ms;
    subjectTime[manualCat] = (subjectTime[manualCat] || 0) + ms;
    saveTimerState();
    updateAccumLabel();
    updateLiveScore();
    renderGoalBars();
    renderWeeklyStats();
  } else {
    // 다른 날짜면 history에서 해당 날짜를 찾아 합산
    const history = lsGet(K.HISTORY) || [];
    const entry   = history.find(d => d.date === dateVal);
    if (entry) {
      entry.totalMs = (entry.totalMs || 0) + ms;
      entry.subjectTime = entry.subjectTime || {};
      entry.subjectTime[manualCat] = (entry.subjectTime[manualCat] || 0) + ms;
      lsSet(K.HISTORY, history);
    } else {
      // history에 없는 날짜면 새 항목 추가
      history.push({
        date        : dateVal,
        totalMs     : ms,
        subjectTime : { [manualCat]: ms },
        distractions: 0,
        doneTasks   : 0,
        totalTasks  : 0,
        sessions    : [],
      });
      lsSet(K.HISTORY, history.slice(-14)); // 최근 14일
    }
  }

  // 입력 초기화
  document.getElementById('manualHours').value = '0';
  document.getElementById('manualMins').value  = '30';
  document.getElementById('manualMemo').value  = '';

  renderManualList();
  renderWeeklyStats();
  renderHeatmap();
  showNotif(`${timeStr(ms)} 기록됐어요 ✅`, '📝');

  function timeStr(ms) {
    const t = Math.floor(ms/60000), h = Math.floor(t/60), m = t%60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  }
});

// 삭제
function deleteManualRecord(id) {
  const records = getManualRecords();
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  // 데이터에서 제거
  const newRecords = records.filter(r => r.id !== id);
  saveManualRecords(newRecords);

  // 오늘 것이면 현재 세션에서 차감
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  })();

  if (rec.date === today) {
    totalMs   = Math.max(0, totalMs - rec.ms);
    subjectTime[rec.cat] = Math.max(0, (subjectTime[rec.cat] || 0) - rec.ms);
    saveTimerState();
    updateAccumLabel();
    updateLiveScore();
    renderGoalBars();
  } else {
    const history = lsGet(K.HISTORY) || [];
    const entry   = history.find(d => d.date === rec.date);
    if (entry) {
      entry.totalMs = Math.max(0, (entry.totalMs||0) - rec.ms);
      if (entry.subjectTime) entry.subjectTime[rec.cat] = Math.max(0, (entry.subjectTime[rec.cat]||0) - rec.ms);
      lsSet(K.HISTORY, history);
    }
  }

  renderManualList();
  renderWeeklyStats();
  renderHeatmap();
  showNotif('기록이 삭제됐어요', '🗑️');
}

// 분석 탭 진입 시 렌더 (기존 탭 전환 이벤트에 추가)
const _origTabClick = document.querySelectorAll('.nav-item');
// renderManualList는 renderWeeklyStats 안에서도 호출되므로
// stats 탭 진입 시 자동 렌더됨 — 이미 처리됨
// 초기 렌더 (혹시 stats 탭이 기본이면 실행)
renderManualList();
