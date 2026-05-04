/* ============================================================
   ui.js — 탭 전환, 야간 모드, 토스트 알림
   ============================================================ */

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
    if(tab==='stats')  { renderWeeklyStats(); renderHeatmap(); renderSleepChart(); renderSubjectHeatmap(); }
    if(tab==='today')  { renderCalendar(); }
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
  if(s==='on')        setNight(true);
  else if(s==='off')  setNight(false);
  else                setNight(new Date().getHours()>=22);
})();
nightToggle.addEventListener('click',()=>{
  const on=!document.body.classList.contains('night');
  setNight(on); lsSet(K.NIGHT, on?'on':'off');
});

/* ── 토스트 알림 ── */
let notifTimer = null;

function showNotif(msg, icon='🔔'){
  const t   = document.getElementById('notifToast');
  document.getElementById('notifMsg').textContent  = msg;
  document.getElementById('notifIcon').textContent = icon;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 5000);
}

/* ── 알림 타이머 (공부알림 토글 있을 경우 대비) ── */
function startNotifTimer(){
  const toggle   = document.getElementById('notifToggle');
  const interval = document.getElementById('notifInterval');
  if(toggle && interval && toggle.checked)
    notifTimer = setInterval(()=>new Notification('StudyFlow 알림',{body:'공부하고 있으신가요?'}), parseInt(interval.value)*60000);
}
function stopNotifTimer(){ clearInterval(notifTimer); }

/* ── 헤더 점수 업데이트 ── */
function updateLiveScore(){
  const done  = todayTasks.filter(t=>t.done).length;
  const score = calcLiveScore(totalMs, sessions, distractions, done, todayTasks.length, subjectTime);
  const numEl = document.getElementById('liveScore');
  numEl.textContent = score===null ? '—' : score;
  if(score!==null) numEl.style.color = score>=80?'var(--ok)':score>=50?'var(--accent)':'var(--danger)';
}
