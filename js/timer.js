/* ============================================================
   timer.js — 집중 타이머, 세션 관리, 백그라운드 복원, 자동저장
              인강 모드, 모의고사 타이머
   ============================================================ */

/* ── 타이머 상태 초기화 ── */
let timerState   = lsGet(K.TIMER_STATE) || {elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0};
let elapsed      = timerState.elapsed      || 0;
let sessions     = timerState.sessions     || [];
let distractions = timerState.distractions || 0;
let totalMs      = timerState.totalMs      || 0;
let subjectTime  = timerState.subjectTime  || {};
let ticker=null, startTime=null, running=false;
let sessionStart          = lsGet('sf_session_start') || null;
let sessionElapsedAtStart = lsGet('sf_session_elapsed_at_start');
if(sessionElapsedAtStart!==null) sessionElapsedAtStart=Number(sessionElapsedAtStart);

/* ── 앱 재시작 시 미완료 세션 복원 ──────────────────────────
   iOS 강제종료 / 스와이프 킬 대응.
   visibilitychange 없이 재시작될 때 sf_bg_start로 elapsed 보정.
   sessionElapsedAtStart는 유지 → "계속" 버튼 상태로 표시.     */
(()=>{
  if(sessionElapsedAtStart === null) return;

  const bgStart      = lsGet('sf_bg_start');
  const bgElapsed    = lsGet('sf_bg_elapsed');
  const savedSubject = lsGet('sf_autosave_subject') || lsGet('sf_last_subject') || '국어';

  if(bgStart !== null && bgElapsed !== null){
    const corrected = bgElapsed + (Date.now() - bgStart);
    if(corrected > elapsed){
      elapsed = corrected;
      totalMs = corrected;
      lsSet(K.TIMER_STATE, {elapsed, subjectTime, sessions, distractions, totalMs});
    }
    localStorage.removeItem('sf_bg_start');
    localStorage.removeItem('sf_bg_elapsed');
  }

  selectedCat = savedSubject;
  window._needChipSync = true;
  localStorage.removeItem('sf_autosave_subject');
})();

/* ── 저장 / 현재 시간 ── */
const saveTimerState = () => lsSet(K.TIMER_STATE,{elapsed,subjectTime,sessions,distractions,totalMs});
const nowMs          = () => running ? elapsed+(Date.now()-startTime) : elapsed;

/* ── 디스플레이 업데이트 ── */
function tick(){
  const ms=nowMs(), t=Math.floor(ms/1000);
  document.getElementById('swHours').textContent   = pad2(Math.floor(t/3600));
  document.getElementById('swMinutes').textContent = pad2(Math.floor((t%3600)/60));
  document.getElementById('swSeconds').textContent = pad2(t%60);
  document.getElementById('swMs').textContent      = '.'+pad2(Math.floor((ms%1000)/10));
}

function updateAccumLabel(){
  document.getElementById('swAccum').textContent = msToReadable(nowMs())||'0분';
}

/* ── 타이머 UI 상태 ── */
function updateTimerUI(){
  const btn       = document.getElementById('startStopBtn');
  const endBtn    = document.getElementById('endBtn');
  const inSession = sessionElapsedAtStart !== null;

  if(running)        { btn.textContent='일시정지'; btn.classList.add('stop'); }
  else if(inSession) { btn.textContent='계속';     btn.classList.remove('stop'); }
  else               { btn.textContent='시작';     btn.classList.remove('stop'); }

  endBtn.disabled = !inSession;
  document.getElementById('swDisplay').classList.toggle('running', running);
  document.getElementById('brandDot').classList.toggle('pulse', running);
  document.getElementById('fsHint').textContent = running
    ? `🟢 ${selectedCat} 집중 중`
    : inSession ? `${selectedCat} 일시정지됨 · 종료하려면 종료를 눌러요`
    : '▶ 시작 버튼을 눌러 집중을 시작해요';

  // 실제 타이머 돌 때만 과목 잠금 (일시정지/복원 시엔 변경 가능)
  document.querySelectorAll('#timerCategoryChips .chip').forEach(c=>{ c.disabled=running; });
}

/* ── 자동저장 (30초마다) ── */
let autoSaveTicker = null;

function startAutoSave(){
  stopAutoSave();
  autoSaveTicker = setInterval(()=>{
    if(!running) return;
    const liveElapsed = elapsed + (Date.now() - startTime);
    lsSet(K.TIMER_STATE,{elapsed:liveElapsed, subjectTime, sessions, distractions, totalMs:liveElapsed});
    lsSet('sf_autosave_subject', selectedCat);
  }, 30000);
}
function stopAutoSave(){
  if(autoSaveTicker){ clearInterval(autoSaveTicker); autoSaveTicker=null; }
}

/* ── 타이머 제어 ── */
function startTimer(){
  if(sessionElapsedAtStart===null){
    sessionElapsedAtStart = elapsed;
    sessionStart = Date.now();
    lsSet('sf_session_start', sessionStart);
    lsSet('sf_session_elapsed_at_start', sessionElapsedAtStart);
  }
  startTime=Date.now(); ticker=setInterval(tick,30); running=true;
  updateTimerUI(); startNotifTimer(); startAutoSave();
}

function pauseTimer(){
  elapsed += Date.now()-startTime; startTime=null;
  clearInterval(ticker); running=false;
  stopAutoSave(); saveTimerState(); updateTimerUI(); updateAccumLabel(); stopNotifTimer();
}

function endSession(){
  if(running){ elapsed+=Date.now()-startTime; startTime=null; clearInterval(ticker); running=false; stopNotifTimer(); }
  stopAutoSave();

  const sMs = Math.max(0, elapsed-sessionElapsedAtStart);
  if(sMs>0){
    const startHour = new Date(sessionStart).getHours();
    sessions = [...sessions, {ms:sMs, startHour, cat:selectedCat}];
    subjectTime[selectedCat] = (subjectTime[selectedCat]||0)+sMs;
  }
  totalMs = elapsed;
  sessionElapsedAtStart=null; sessionStart=null;
  localStorage.removeItem('sf_session_start');
  localStorage.removeItem('sf_session_elapsed_at_start');
  localStorage.removeItem('sf_autosave_subject');
  lectureMode=false; updateLectureModeBtn();
  updateTimerUI(); updateAccumLabel(); saveTimerState(); renderGoalBars(); updateLiveScore();
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  showReport();
}

document.getElementById('startStopBtn').addEventListener('click', ()=>running?pauseTimer():startTimer());
document.getElementById('endBtn').addEventListener('click', endSession);

/* ── 백그라운드 visibilitychange 처리 ── */
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    if(running){
      lsSet('sf_bg_start', Date.now());
      lsSet('sf_bg_elapsed', elapsed);
      lsSet('sf_autosave_subject', selectedCat);
      showOverlay();
    }
  } else {
    // 포그라운드 복귀: running 여부 무관하게 보정
    const bgStart   = lsGet('sf_bg_start');
    const bgElapsed = lsGet('sf_bg_elapsed');
    if(bgStart !== null && bgElapsed !== null){
      const corrected = bgElapsed + (Date.now() - bgStart);
      elapsed  = corrected;
      totalMs  = corrected;
      if(running) startTime = Date.now();
      saveTimerState();
      localStorage.removeItem('sf_bg_start');
      localStorage.removeItem('sf_bg_elapsed');
      updateAccumLabel();
      renderGoalBars();
    }
  }
});

/* ── 집중 오버레이 ── */
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

/* ── 인강 모드 ── */
let lectureMode = false;

function updateLectureModeBtn(){
  const btn = document.getElementById('lectureModeBtn');
  if(!btn) return;
  if(lectureMode){ btn.textContent='📺 인강 모드 ON · 탭하여 종료'; btn.classList.add('active'); }
  else           { btn.textContent='📺 인강 시청';                   btn.classList.remove('active'); }
}

document.getElementById('lectureModeBtn').addEventListener('click', ()=>{
  lectureMode = !lectureMode;
  updateLectureModeBtn();
  showNotif(
    lectureMode ? '인강 모드 ON — 화면 이탈이 방해 횟수로 카운트되지 않아요' : '인강 모드 OFF — 집중 모드로 돌아왔어요',
    lectureMode ? '📺' : '✅'
  );
});

/* ══════════════════════════════════════════════════════════
   모의고사 타이머
   수능 시간표 기준 (분):
     국어 80, 수학 100, 영어 70, 한국사 30,
     사회문화 30, 생활과윤리 30, (제2외국어/한문 40)
   ══════════════════════════════════════════════════════════ */
const MOCK_SUBJECTS = [
  { label:'국어',     minutes:80  },
  { label:'수학',     minutes:100 },
  { label:'영어',     minutes:70  },
  { label:'한국사',   minutes:30  },
  { label:'사회문화', minutes:30  },
  { label:'생활과윤리',minutes:30 },
];

let mockTimer      = null;
let mockRemaining  = 0;   // ms
let mockRunning    = false;
let mockSubject    = null;

function renderMockSubjectBtns(){
  const wrap = document.getElementById('mockSubjectBtns');
  if(!wrap) return;
  wrap.innerHTML = '';
  MOCK_SUBJECTS.forEach(s=>{
    const btn = document.createElement('button');
    btn.className   = 'chip mock-subject-chip';
    btn.textContent = `${s.label} ${s.minutes}분`;
    btn.dataset.label   = s.label;
    btn.dataset.minutes = s.minutes;
    btn.addEventListener('click', ()=>selectMockSubject(s));
    wrap.appendChild(btn);
  });
}

function selectMockSubject(s){
  // 진행 중이면 리셋
  stopMockTimer(false);
  mockSubject   = s;
  mockRemaining = s.minutes * 60000;
  document.querySelectorAll('.mock-subject-chip').forEach(c=>c.classList.toggle('active', c.dataset.label===s.label));
  renderMockDisplay();
  document.getElementById('mockPanel').style.display='block';
  document.getElementById('mockStartBtn').textContent='시작';
  document.getElementById('mockStartBtn').classList.remove('stop');
  document.getElementById('mockHint').textContent=`${s.label} · ${s.minutes}분 타이머`;
}

function renderMockDisplay(){
  const t = Math.ceil(mockRemaining/1000);
  const h = Math.floor(t/3600), m=Math.floor((t%3600)/60), s=t%60;
  document.getElementById('mockH').textContent = pad2(h);
  document.getElementById('mockM').textContent = pad2(m);
  document.getElementById('mockS').textContent = pad2(s);

  // 남은 시간 비율로 링 색상 경고
  const pct = mockSubject ? mockRemaining/(mockSubject.minutes*60000) : 1;
  const color = pct > 0.3 ? 'var(--accent)' : pct > 0.1 ? 'var(--warn)' : 'var(--danger)';
  document.getElementById('mockTimerRing').style.setProperty('--ring-color', color);
}

function startMockTimer(){
  if(!mockSubject) return;
  mockRunning = true;
  document.getElementById('mockStartBtn').textContent='일시정지';
  document.getElementById('mockStartBtn').classList.add('stop');
  const startAt = Date.now();
  const startRemaining = mockRemaining;
  mockTimer = setInterval(()=>{
    mockRemaining = Math.max(0, startRemaining - (Date.now()-startAt));
    renderMockDisplay();
    if(mockRemaining === 0){
      stopMockTimer(true);
    }
  }, 200);
}

function pauseMockTimer(){
  mockRunning = false;
  clearInterval(mockTimer); mockTimer=null;
  document.getElementById('mockStartBtn').textContent='계속';
  document.getElementById('mockStartBtn').classList.remove('stop');
}

function stopMockTimer(completed){
  clearInterval(mockTimer); mockTimer=null;
  if(completed && mockSubject){
    // 공부기록에 합산
    const ms = mockSubject.minutes * 60000;
    const cat = SUBJECTS.includes(mockSubject.label) ? mockSubject.label : null;
    if(cat){
      subjectTime[cat] = (subjectTime[cat]||0) + ms;
      totalMs += ms; elapsed += ms;
      saveTimerState(); updateAccumLabel(); renderGoalBars(); updateLiveScore();
    }
    showNotif(`${mockSubject.label} 모의고사 종료! ${mockSubject.minutes}분 기록됐어요 🎉`, '📝');
    document.getElementById('mockPanel').style.display='none';
    mockSubject=null; mockRemaining=0; mockRunning=false;
    document.querySelectorAll('.mock-subject-chip').forEach(c=>c.classList.remove('active'));
  }
}

// 모의고사 버튼 이벤트
document.addEventListener('DOMContentLoaded', ()=>{
  renderMockSubjectBtns();

  const startBtn  = document.getElementById('mockStartBtn');
  const resetBtn  = document.getElementById('mockResetBtn');
  if(startBtn) startBtn.addEventListener('click', ()=>mockRunning?pauseMockTimer():startMockTimer());
  if(resetBtn) resetBtn.addEventListener('click', ()=>{
    stopMockTimer(false);
    if(mockSubject){ mockRemaining=mockSubject.minutes*60000; renderMockDisplay(); }
    document.getElementById('mockStartBtn').textContent='시작';
    document.getElementById('mockStartBtn').classList.remove('stop');
  });

  // 모의고사 토글 버튼
  const mockToggle = document.getElementById('mockTimerToggle');
  const mockWrap   = document.getElementById('mockTimerWrap');
  if(mockToggle && mockWrap){
    mockToggle.addEventListener('click', ()=>{
      const open = mockWrap.style.display==='none' || !mockWrap.style.display;
      mockWrap.style.display = open ? 'block' : 'none';
      mockToggle.classList.toggle('open', open);
    });
  }
});
