/* ============================================================
   StudyFlow v10 — script.js
   기능: 타이머(백그라운드 보존/자동저장), 수동기록, 목표바,
         주간 캘린더, 반복 습관, 모의고사 타이머,
         과목별 시간대 히트맵, AI 코치
   ============================================================ */
'use strict';

/* ══════════════════════════════════════════════════════════
   1. 상수 & 유틸리티
   ══════════════════════════════════════════════════════════ */
const SUNEUNG = new Date('2026-11-19T00:00:00');
const SUBJECTS = ['국어','영어','수학','사회문화','생활과윤리'];
const SUBJECT_COLORS = {
  '국어':'#ff6b6b','영어':'#51cf66','수학':'#339af0',
  '사회문화':'#ffa94d','생활과윤리':'#cc5de8'
};
const DAYS_KO = ['일','월','화','수','목','금','토'];

const K = {
  TODAY_TASKS : 'sf_today_tasks',
  TMRW_TASKS  : 'sf_tmrw_tasks',
  TODAY_DATE  : 'sf_today_date',
  TIMER_STATE : 'sf_timer_state',
  HISTORY     : 'sf_history',
  GOALS       : 'sf_goals',
  NIGHT       : 'sf_night',
  SLEEP_LOGS  : 'sf_sleep_logs',
  HABITS      : 'sf_habits',
  CAL_TASKS   : 'sf_cal_tasks',
};

const pad2         = n => String(Math.floor(n)).padStart(2,'0');
const msToReadable = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; if(h>0)return`${h}시간 ${pad2(m)}분`; if(m>0)return`${m}분 ${pad2(s)}초`; return`${s}초`; };
const getDday      = () => { const a=new Date();a.setHours(0,0,0,0);const b=new Date(SUNEUNG);b.setHours(0,0,0,0);return Math.max(0,Math.round((b-a)/86400000)); };
const todayStr     = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const dateStrOf    = d  => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const lsGet        = k  => { try{return JSON.parse(localStorage.getItem(k));}catch{return null;} };
const lsSet        = (k,v) => localStorage.setItem(k,JSON.stringify(v));

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

/* ══════════════════════════════════════════════════════════
   2. 날짜 롤오버
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
    lsSet(K.HISTORY, history.slice(-30));
    const incompleteTasks=prevTasks.filter(t=>!t.done);
    const tmrw=lsGet(K.TMRW_TASKS)||[];
    lsSet(K.TMRW_TASKS,[...incompleteTasks,...tmrw]);
    lsSet(K.TODAY_TASKS, tmrw.map(t=>({...t,done:false})));
    lsSet(K.TMRW_TASKS,[]);
    lsSet(K.TIMER_STATE,{elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0});
  }
  lsSet(K.TODAY_DATE, now);
}
checkDateRollover();

function getHistoryWithToday(){
  return [...(lsGet(K.HISTORY)||[]), {
    date:todayStr(), totalMs, subjectTime, distractions, sessions,
    doneTasks:(lsGet(K.TODAY_TASKS)||[]).filter(t=>t.done).length,
    totalTasks:(lsGet(K.TODAY_TASKS)||[]).length
  }].slice(-30);
}

const DDAY = getDday();
document.getElementById('dateBadge').textContent = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'});
document.getElementById('dDayCount').textContent = DDAY;
document.getElementById('ddayBadge').textContent = `수능 D-${DDAY}`;

/* ══════════════════════════════════════════════════════════
   3. 탭 & 야간 모드
   ══════════════════════════════════════════════════════════ */
let activeTab = 'today';
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if(tab===activeTab) return;
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = tab;
    if(tab==='stats') { renderWeeklyStats(); renderHeatmap(); renderSubjectHeatmap(); renderSleepChart(); }
    if(tab==='today') { renderCalendar(); }
  });
});

function setNight(on){
  document.body.classList.toggle('night',on);
  document.getElementById('nightIcon').textContent = on?'☀️':'🌙';
  const d=document.getElementById('sepiaDim'); if(d) d.style.opacity=on?'1':'0';
}
(()=>{ const s=lsGet(K.NIGHT); if(s==='on')setNight(true); else if(s==='off')setNight(false); else setNight(new Date().getHours()>=22); })();
document.getElementById('nightToggle').addEventListener('click',()=>{ const on=!document.body.classList.contains('night'); setNight(on); lsSet(K.NIGHT,on?'on':'off'); });

/* ══════════════════════════════════════════════════════════
   4. 토스트 알림
   ══════════════════════════════════════════════════════════ */
function showNotif(msg, icon='🔔'){
  const t=document.getElementById('notifToast');
  document.getElementById('notifMsg').textContent=msg;
  document.getElementById('notifIcon').textContent=icon;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),5000);
}
let notifTimer=null;
function startNotifTimer(){ const tg=document.getElementById('notifToggle'),iv=document.getElementById('notifInterval'); if(tg&&iv&&tg.checked) notifTimer=setInterval(()=>new Notification('StudyFlow',{body:'공부하고 있으신가요?'}),parseInt(iv.value)*60000); }
function stopNotifTimer(){ clearInterval(notifTimer); }

/* ══════════════════════════════════════════════════════════
   5. 할 일 목록
   ══════════════════════════════════════════════════════════ */
let todayTasks    = lsGet(K.TODAY_TASKS)||[];
let tomorrowTasks = lsGet(K.TMRW_TASKS)||[];
let selectedCat   = lsGet('sf_last_subject')||'국어';

const S_POST=`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v6.5L10 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 1L4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
  const total=todayTasks.length, done=todayTasks.filter(t=>t.done).length;
  document.getElementById('emptyState').style.display=total===0?'flex':'none';
  document.getElementById('taskCount').textContent=`${total}개`;
  document.getElementById('progressRow').style.display=total===0?'none':'flex';
  if(total>0){ document.getElementById('doneCount').textContent=done; document.getElementById('totalCount').textContent=total; document.getElementById('progressFill').style.width=Math.round(done/total*100)+'%'; }
}
function renderTomorrow(){
  // 내일로 미룬 것들 카드 제거됨 — 호환성 유지용 빈 함수
}
function postponeTask(idx){
  const t=todayTasks.splice(idx,1)[0];
  // tomorrowTasks에 저장 (날짜 이월용)
  tomorrowTasks.push({text:t.text,cat:t.cat,done:false});
  lsSet(K.TODAY_TASKS,todayTasks); lsSet(K.TMRW_TASKS,tomorrowTasks);
  // calTasks의 내일 날짜에도 저장 (캘린더 패널용)
  const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tmrwStr=dateStrOf(tomorrow);
  const tmrwTasks=getTasksForDate(tmrwStr);
  // 이미 있으면 중복 추가 방지
  if(!tmrwTasks.find(x=>x.text===t.text&&x.cat===t.cat)){
    tmrwTasks.push({text:t.text,cat:t.cat,done:false});
    saveCalTask(tmrwStr,tmrwTasks);
  }
  renderDayPanel(); renderCalendar();
}
function addTask(){
  const text=document.getElementById('taskInput').value.trim();
  if(!text){ const inp=document.getElementById('taskInput'); inp.classList.add('shake'); inp.addEventListener('animationend',()=>inp.classList.remove('shake'),{once:true}); return; }
  const isToday=calSelectedDate===todayStr();
  if(isToday){
    todayTasks.push({text,cat:selectedCat,done:false});
    lsSet(K.TODAY_TASKS,todayTasks);
  } else {
    // calTasks의 non-habit 항목에만 추가
    const saved=calTasks[calSelectedDate]||[];
    saved.push({text,cat:selectedCat,done:false});
    calTasks[calSelectedDate]=saved;
    lsSet(K.CAL_TASKS,calTasks);
  }
  document.getElementById('taskInput').value='';
  renderDayPanel(); renderCalendar();
}
document.getElementById('addBtn').addEventListener('click',addTask);
document.getElementById('taskInput').addEventListener('keydown',e=>{ if(e.key==='Enter')addTask(); });
document.getElementById('categoryChips').addEventListener('click',e=>{ const chip=e.target.closest('.chip'); if(!chip)return; syncSubjectChips(chip.dataset.cat); });

function syncSubjectChips(cat){
  selectedCat=cat;
  document.querySelectorAll('#timerCategoryChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
  document.querySelectorAll('#categoryChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
  lsSet('sf_last_subject',cat);
}
const _tc=document.getElementById('timerCategoryChips');
if(_tc) _tc.addEventListener('click',e=>{ const chip=e.target.closest('.chip'); if(!chip||chip.disabled)return; syncSubjectChips(chip.dataset.cat); });

/* ══════════════════════════════════════════════════════════
   6. 주간 캘린더 & 반복 습관
   ══════════════════════════════════════════════════════════ */
let habits   = lsGet(K.HABITS)||[];
let calTasks = lsGet(K.CAL_TASKS)||{};
let calSelectedDate = todayStr();

function getWeekDates(){
  const today=new Date(); today.setHours(0,0,0,0);
  const dow=today.getDay();
  const mon=new Date(today); mon.setDate(today.getDate()-(dow===0?6:dow-1));
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
}

function getTasksForDate(dateStr){
  const d=new Date(dateStr); const dow=d.getDay();
  const manual=calTasks[dateStr]||[];
  const habitTasks=habits.filter(h=>h.days.includes(dow)).map(h=>{
    const saved=manual.find(m=>m.habitId===h.id);
    return saved ? saved : {text:h.text,cat:h.cat,done:false,habitId:h.id};
  });
  const nonHabit=manual.filter(m=>!m.habitId);
  return [...habitTasks,...nonHabit];
}

function saveCalTask(dateStr,tasks){ calTasks[dateStr]=tasks; lsSet(K.CAL_TASKS,calTasks); }

/* 캘린더 스트립 — 날짜 셀만, 클릭하면 아래 패널 업데이트 */
function renderCalendar(){
  const wrap=document.getElementById('calendarWrap'); if(!wrap)return;
  const weeks=getWeekDates();
  const history=lsGet(K.HISTORY)||[];

  let html='<div class="cal-strip-scroll"><div class="cal-strip">';
  weeks.forEach(d=>{
    const ds=dateStrOf(d);
    const isToday=ds===todayStr(), isSel=ds===calSelectedDate;
    const hist=history.find(h=>h.date===ds)||(ds===todayStr()?{totalMs}:null);
    const mins=hist?Math.round(hist.totalMs/60000):0;
    const tasks=getTasksForDate(ds);
    const doneCnt=tasks.filter(t=>t.done).length;
    const totalCnt=tasks.length;
    html+=`<button class="cal-day-btn${isToday?' is-today':''}${isSel?' is-selected':''}" data-date="${ds}">
      <span class="cal-strip-day">${DAYS_KO[d.getDay()]}</span>
      <span class="cal-strip-num">${d.getDate()}</span>
      <span class="cal-strip-time">${mins>0?mins+'분':''}</span>
      ${totalCnt>0?`<span class="cal-strip-dot" style="opacity:${doneCnt===totalCnt?1:.4}"></span>`:'<span class="cal-strip-dot" style="opacity:0"></span>'}
    </button>`;
  });
  html+='</div></div>';
  wrap.innerHTML=html;

  wrap.addEventListener('click',e=>{
    const btn=e.target.closest('.cal-day-btn'); if(!btn)return;
    calSelectedDate=btn.dataset.date;
    renderCalendar();
    renderDayPanel();
  });
}

/* 선택 날짜 패널 — 오늘/다른 날 모두 getTasksForDate 기반으로 통일 */
function renderDayPanel(){
  const ds=calSelectedDate;
  const isToday=ds===todayStr();
  const d=new Date(ds);
  const dateLabel=`${d.getMonth()+1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})${isToday?' · 오늘':''}`;
  const el=document.getElementById('dayPanelDate');
  if(el) el.textContent=dateLabel;
  const inp=document.getElementById('taskInput');
  if(inp) inp.placeholder=isToday?'할 일 추가':`${d.getMonth()+1}/${d.getDate()} 할 일 추가`;

  // 오늘은 todayTasks + 습관, 다른 날은 calTasks + 습관 모두 합쳐서 렌더
  let tasks;
  if(isToday){
    // 오늘의 습관(해당 요일)을 todayTasks에 없는 것만 추가해서 표시
    const dow=d.getDay();
    const habitTasks=habits.filter(h=>h.days.includes(dow)).map(h=>{
      // todayTasks에 이미 같은 habitId가 있으면 그걸 쓰고, 없으면 새로 생성
      const existing=todayTasks.find(t=>t.habitId===h.id);
      return existing || {text:h.text,cat:h.cat,done:false,habitId:h.id,_virtual:true};
    });
    // todayTasks 중 habitId 없는 것 + 위에서 만든 habitTasks 합치기
    tasks=[...habitTasks, ...todayTasks.filter(t=>!t.habitId)];
  } else {
    tasks=getTasksForDate(ds);
  }

  const tl=document.getElementById('taskList'); if(!tl)return;
  tl.innerHTML='';
  tasks.forEach((t,i)=>{
    tl.appendChild(buildDayItem(t,i,ds,isToday));
  });
  const total=tasks.length, done=tasks.filter(t=>t.done).length;
  document.getElementById('emptyState').style.display=total===0?'flex':'none';
  document.getElementById('taskCount').textContent=`${total}개`;
  document.getElementById('progressRow').style.display=total===0?'none':'flex';
  if(total>0){
    document.getElementById('doneCount').textContent=done;
    document.getElementById('totalCount').textContent=total;
    document.getElementById('progressFill').style.width=Math.round(done/total*100)+'%';
  }
}

function buildDayItem(task,idx,dateStr,isToday){
  const li=document.createElement('li');
  li.className='task-item'+(task.done?' done':'')+(task.habitId?' habit-task':'');
  const cb=document.createElement('input'); cb.type='checkbox'; cb.className='task-cb'; cb.checked=task.done;
  cb.addEventListener('change',()=>{
    if(isToday){
      if(task.habitId){
        // 가상 habitTask면 todayTasks에 실체화
        const existing=todayTasks.findIndex(t=>t.habitId===task.habitId);
        if(existing>=0){ todayTasks[existing].done=!todayTasks[existing].done; }
        else { todayTasks.push({text:task.text,cat:task.cat,done:!task.done,habitId:task.habitId}); }
        lsSet(K.TODAY_TASKS, todayTasks.filter(t=>!t._virtual));
      } else {
        todayTasks[todayTasks.findIndex(t=>t===task||t.text===task.text)].done=!task.done;
        lsSet(K.TODAY_TASKS,todayTasks);
      }
    } else {
      // calTasks에 완료 상태 저장
      const saved=calTasks[dateStr]||[];
      if(task.habitId){
        const hi=saved.findIndex(m=>m.habitId===task.habitId);
        if(hi>=0) saved[hi].done=!saved[hi].done;
        else saved.push({...task,done:!task.done});
      } else {
        // non-habit: idx 기준으로 찾기 (habitTasks 제외한 nonHabit 인덱스)
        const nonHabitSaved=saved.filter(m=>!m.habitId);
        const dow=new Date(dateStr).getDay();
        const habitCount=habits.filter(h=>h.days.includes(dow)).length;
        const nonHabitIdx=idx-habitCount;
        if(nonHabitIdx>=0&&nonHabitSaved[nonHabitIdx]) nonHabitSaved[nonHabitIdx].done=!task.done;
        // 전체 calTasks 재구성
        const habitSaved=saved.filter(m=>m.habitId);
        calTasks[dateStr]=[...habitSaved,...nonHabitSaved];
      }
      lsSet(K.CAL_TASKS,calTasks);
    }
    renderDayPanel(); renderCalendar();
  });
  li.appendChild(cb);
  if(task.habitId){
    const icon=document.createElement('span'); icon.className='habit-task-icon'; icon.textContent='🔁'; li.appendChild(icon);
  }
  const dot=document.createElement('span'); dot.className=`cat-dot cat-${task.cat||'국어'}`; li.appendChild(dot);
  const txt=document.createElement('span'); txt.className='task-text'; txt.textContent=task.text; li.appendChild(txt);
  const badge=document.createElement('span'); badge.className='cat-badge'; badge.textContent=task.cat||'국어'; li.appendChild(badge);
  const acts=document.createElement('div'); acts.className='task-actions';
  if(!task.habitId){
    // 습관 항목은 삭제 불가 (습관 관리에서 삭제)
    const db=document.createElement('button'); db.className='del'; db.title='삭제'; db.innerHTML=S_DEL;
    db.addEventListener('click',()=>{
      if(isToday){
        const fi=todayTasks.indexOf(task);
        if(fi>=0){ todayTasks.splice(fi,1); lsSet(K.TODAY_TASKS,todayTasks); }
      } else {
        const saved=calTasks[dateStr]||[];
        const ni=saved.filter(m=>!m.habitId).indexOf(task);
        if(ni>=0){ saved.filter(m=>!m.habitId).splice(ni,1); lsSet(K.CAL_TASKS,calTasks); }
      }
      renderDayPanel(); renderCalendar();
    });
    acts.appendChild(db);
  }
  if(isToday&&!task.habitId){
    const pb=document.createElement('button'); pb.className='postpone'; pb.title='내일로 미루기'; pb.innerHTML=S_POST;
    const taskIdx=todayTasks.indexOf(task);
    pb.addEventListener('click',()=>postponeTask(taskIdx>=0?taskIdx:idx));
    acts.appendChild(pb);
  }
  li.appendChild(acts);
  return li;
}
// 이전 buildCalItem 호환용
function buildCalItem(task,idx,dateStr){ return buildDayItem(task,idx,dateStr,dateStr===todayStr()); }

function openCalAddModal(dateStr){
  const bd=document.getElementById('calAddModalBackdrop');
  const modal=document.getElementById('calAddModal'); if(!modal||!bd)return;
  document.getElementById('calAddDateLabel').textContent=dateStr;
  modal.dataset.targetDate=dateStr;
  bd.style.display='flex';
  requestAnimationFrame(()=>bd.classList.add('show'));
  document.getElementById('calAddInput').value='';
  setTimeout(()=>document.getElementById('calAddInput').focus(),100);
  document.querySelectorAll('#calAddChips .chip').forEach((c,i)=>c.classList.toggle('active',i===0));
}
function closeCalAddModal(){
  const bd=document.getElementById('calAddModalBackdrop'); if(!bd)return;
  bd.classList.remove('show');
  setTimeout(()=>{ bd.style.display='none'; },240);
}
document.getElementById('calAddModalBackdrop')?.addEventListener('click',closeCalAddModal);
document.getElementById('calAddCancel')?.addEventListener('click',closeCalAddModal);
document.getElementById('calAddConfirm')?.addEventListener('click',()=>{
  const modal=document.getElementById('calAddModal'); if(!modal)return;
  const ds=modal.dataset.targetDate;
  const text=document.getElementById('calAddInput').value.trim(); if(!text)return;
  const cat=document.querySelector('#calAddChips .chip.active')?.dataset.cat||'국어';
  const tasks=getTasksForDate(ds);
  tasks.push({text,cat,done:false});
  saveCalTask(ds,tasks); closeCalAddModal(); renderCalendar();
});
document.getElementById('calAddInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('calAddConfirm')?.click(); });
document.getElementById('calAddChips')?.addEventListener('click',e=>{ const chip=e.target.closest('.chip'); if(!chip)return; document.querySelectorAll('#calAddChips .chip').forEach(c=>c.classList.remove('active')); chip.classList.add('active'); });

/* 반복 습관 */
function renderHabits(){
  const list=document.getElementById('habitList'); if(!list)return;
  list.innerHTML='';
  if(habits.length===0){ list.innerHTML='<p class="habit-empty">등록된 습관이 없어요</p>'; return; }
  habits.forEach((h,i)=>{
    const daysLabel=h.days.sort((a,b)=>a-b).map(d=>DAYS_KO[d]).join('·');
    const div=document.createElement('div'); div.className='habit-item';
    div.innerHTML=`<span class="cat-dot cat-${h.cat}"></span>
      <div class="habit-info"><span class="habit-text">${h.text}</span><span class="habit-days">${daysLabel}요일</span></div>
      <button class="habit-del-btn" data-idx="${i}">${S_DEL}</button>`;
    div.querySelector('.habit-del-btn').addEventListener('click',()=>{ habits.splice(i,1); lsSet(K.HABITS,habits); renderHabits(); renderCalendar(); });
    list.appendChild(div);
  });
}

document.getElementById('habitAddBtn')?.addEventListener('click',()=>{
  const text=document.getElementById('habitInput')?.value.trim(); if(!text)return;
  const cat=document.querySelector('#habitCatChips .chip.active')?.dataset.cat||'국어';
  const days=[...document.querySelectorAll('.habit-day-btn.active')].map(b=>parseInt(b.dataset.day));
  if(days.length===0){ showNotif('요일을 선택해주세요','⚠️'); return; }
  habits.push({id:Date.now(),text,cat,days});
  lsSet(K.HABITS,habits);
  document.getElementById('habitInput').value='';
  document.querySelectorAll('.habit-day-btn').forEach(b=>b.classList.remove('active'));
  renderHabits(); renderCalendar(); renderDayPanel();
  showNotif(`"${text}" 습관 등록됐어요`,'🔁');
  // 폼 닫기
  const form=document.getElementById('habitAddForm');
  const btn=document.getElementById('habitAddToggleBtn');
  const outer=document.getElementById('habitOuterWrap');
  if(form) form.style.display='none';
  if(btn)  btn.classList.remove('open');
  if(outer) outer.classList.remove('open');
});
document.querySelectorAll('.habit-day-btn').forEach(btn=>btn.addEventListener('click',()=>btn.classList.toggle('active')));
document.getElementById('habitCatChips')?.addEventListener('click',e=>{ const chip=e.target.closest('.chip'); if(!chip)return; document.querySelectorAll('#habitCatChips .chip').forEach(c=>c.classList.remove('active')); chip.classList.add('active'); });

/* 반복 습관 패널 토글 */
document.getElementById('habitAddToggleBtn')?.addEventListener('click',()=>{
  const form  = document.getElementById('habitAddForm');
  const btn   = document.getElementById('habitAddToggleBtn');
  const outer = document.getElementById('habitOuterWrap');
  const isOpen = !form.style.display || form.style.display==='none';
  form.style.display = isOpen ? 'flex' : 'none';
  btn.classList.toggle('open', isOpen);
  if(outer) outer.classList.toggle('open', isOpen);
});

/* ══════════════════════════════════════════════════════════
   7. 목표 설정
   ══════════════════════════════════════════════════════════ */
let goals = lsGet(K.GOALS)||{국어:60,영어:60,수학:90,사회문화:45,생활과윤리:45};

function renderGoalBars(){
  const bars=document.getElementById('goalBars'); if(!bars)return; bars.innerHTML='';
  SUBJECTS.forEach(sub=>{
    const goal=goals[sub]||0; if(!goal)return;
    const actual=Math.round((subjectTime[sub]||0)/60000);
    const pct=Math.min(100,goal>0?Math.round(actual/goal*100):0);
    const isComplete=pct>=100;
    bars.innerHTML+=`<div class="goal-bar-row">
      <span class="goal-bar-label"><span class="cat-dot cat-${sub}"></span>${sub}</span>
      <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%;background:${isComplete?'var(--ok)':SUBJECT_COLORS[sub]}"></div></div>
      <span class="goal-bar-stat${isComplete?' goal-complete':''}">${actual}<span class="goal-stat-sep">/</span>${goal}분</span>
    </div>`;
  });
}

document.getElementById('goalEditBtn').addEventListener('click',()=>{
  const p=document.getElementById('goalEditPanel'),inp=document.getElementById('goalInputs');
  if(p.style.display==='block'){p.style.display='none';return;}
  inp.innerHTML='';
  SUBJECTS.forEach(sub=>{ inp.innerHTML+=`<div class="goal-input-row"><span class="goal-input-label"><span class="cat-dot cat-${sub}"></span>${sub}</span><input type="number" class="goal-input-field" data-sub="${sub}" value="${goals[sub]||0}" min="0"><span class="goal-input-unit">분</span></div>`; });
  p.style.display='block';
});
document.getElementById('goalSave').addEventListener('click',()=>{ document.querySelectorAll('.goal-input-field').forEach(i=>{goals[i.dataset.sub]=parseInt(i.value)||0;}); lsSet(K.GOALS,goals); document.getElementById('goalEditPanel').style.display='none'; renderGoalBars(); });
document.getElementById('goalCancel').addEventListener('click',()=>{ document.getElementById('goalEditPanel').style.display='none'; });

/* ══════════════════════════════════════════════════════════
   8. 타이머 (백그라운드 복원 + 자동저장)
   ══════════════════════════════════════════════════════════ */
let timerState   = lsGet(K.TIMER_STATE)||{elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0};
let elapsed      = timerState.elapsed||0;
let sessions     = timerState.sessions||[];
let distractions = timerState.distractions||0;
let totalMs      = timerState.totalMs||0;
let subjectTime  = timerState.subjectTime||{};
let ticker=null, startTime=null, running=false;
let sessionStart          = lsGet('sf_session_start')||null;
let sessionElapsedAtStart = lsGet('sf_session_elapsed_at_start');
if(sessionElapsedAtStart!==null) sessionElapsedAtStart=Number(sessionElapsedAtStart);

/* 앱 재시작 시 미완료 세션 복원 */
(()=>{
  if(sessionElapsedAtStart===null) return;
  const bgStart=lsGet('sf_bg_start'), bgElapsed=lsGet('sf_bg_elapsed');
  const savedSubject=lsGet('sf_autosave_subject')||lsGet('sf_last_subject')||'국어';
  if(bgStart!==null&&bgElapsed!==null){
    const corrected=bgElapsed+(Date.now()-bgStart);
    if(corrected>elapsed){ elapsed=corrected; totalMs=corrected; lsSet(K.TIMER_STATE,{elapsed,subjectTime,sessions,distractions,totalMs}); }
    localStorage.removeItem('sf_bg_start'); localStorage.removeItem('sf_bg_elapsed');
  }
  selectedCat=savedSubject; window._needChipSync=true;
  localStorage.removeItem('sf_autosave_subject');
})();

const saveTimerState=()=>lsSet(K.TIMER_STATE,{elapsed,subjectTime,sessions,distractions,totalMs});
const nowMs=()=>running?elapsed+(Date.now()-startTime):elapsed;

function tick(){
  const ms=nowMs(),t=Math.floor(ms/1000);
  document.getElementById('swHours').textContent=pad2(Math.floor(t/3600));
  document.getElementById('swMinutes').textContent=pad2(Math.floor((t%3600)/60));
  document.getElementById('swSeconds').textContent=pad2(t%60);
  document.getElementById('swMs').textContent='.'+pad2(Math.floor((ms%1000)/10));
}
function updateAccumLabel(){ document.getElementById('swAccum').textContent=msToReadable(nowMs())||'0분'; }
function updateLiveScore(){
  const done=todayTasks.filter(t=>t.done).length;
  const score=calcLiveScore(totalMs,sessions,distractions,done,todayTasks.length,subjectTime);
  const numEl=document.getElementById('liveScore');
  numEl.textContent=score===null?'—':score;
  if(score!==null) numEl.style.color=score>=80?'var(--ok)':score>=50?'var(--accent)':'var(--danger)';
}

function updateTimerUI(){
  const btn=document.getElementById('startStopBtn'), endBtn=document.getElementById('endBtn');
  const inSession=sessionElapsedAtStart!==null;
  if(running){btn.textContent='일시정지';btn.classList.add('stop');}
  else if(inSession){btn.textContent='계속';btn.classList.remove('stop');}
  else{btn.textContent='시작';btn.classList.remove('stop');}
  endBtn.disabled=!inSession;
  document.getElementById('swDisplay').classList.toggle('running',running);
  document.getElementById('brandDot').classList.toggle('pulse',running);
  document.getElementById('fsHint').textContent=running?`🟢 ${selectedCat} 집중 중`:inSession?`${selectedCat} 일시정지됨 · 종료하려면 종료를 눌러요`:'▶ 시작 버튼을 눌러 집중을 시작해요';
  document.querySelectorAll('#timerCategoryChips .chip').forEach(c=>{c.disabled=running;});
}

let autoSaveTicker=null;
function startAutoSave(){
  stopAutoSave();
  autoSaveTicker=setInterval(()=>{
    if(!running)return;
    const liveElapsed=elapsed+(Date.now()-startTime);
    lsSet(K.TIMER_STATE,{elapsed:liveElapsed,subjectTime,sessions,distractions,totalMs:liveElapsed});
    lsSet('sf_autosave_subject',selectedCat);
  },30000);
}
function stopAutoSave(){ if(autoSaveTicker){clearInterval(autoSaveTicker);autoSaveTicker=null;} }

function startTimer(){
  if(sessionElapsedAtStart===null){
    sessionElapsedAtStart=elapsed; sessionStart=Date.now();
    lsSet('sf_session_start',sessionStart); lsSet('sf_session_elapsed_at_start',sessionElapsedAtStart);
  }
  startTime=Date.now(); ticker=setInterval(tick,30); running=true;
  updateTimerUI(); startNotifTimer(); startAutoSave();
}
function pauseTimer(){
  elapsed+=Date.now()-startTime; startTime=null; clearInterval(ticker); running=false;
  stopAutoSave(); saveTimerState(); updateTimerUI(); updateAccumLabel(); stopNotifTimer();
}
function endSession(){
  if(running){elapsed+=Date.now()-startTime;startTime=null;clearInterval(ticker);running=false;stopNotifTimer();}
  stopAutoSave();
  const sMs=Math.max(0,elapsed-sessionElapsedAtStart);
  if(sMs>0){ const startHour=new Date(sessionStart).getHours(); sessions=[...sessions,{ms:sMs,startHour,cat:selectedCat}]; subjectTime[selectedCat]=(subjectTime[selectedCat]||0)+sMs; }
  totalMs=elapsed;
  sessionElapsedAtStart=null; sessionStart=null;
  localStorage.removeItem('sf_session_start'); localStorage.removeItem('sf_session_elapsed_at_start'); localStorage.removeItem('sf_autosave_subject');
  lectureMode=false; updateLectureModeBtn();
  updateTimerUI(); updateAccumLabel(); saveTimerState(); renderGoalBars(); updateLiveScore();
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  showReport();
}

document.getElementById('startStopBtn').addEventListener('click',()=>running?pauseTimer():startTimer());
document.getElementById('endBtn').addEventListener('click',endSession);
document.getElementById('modalClose').addEventListener('click',()=>document.getElementById('modalBackdrop').classList.remove('show'));
document.getElementById('modalContinue').addEventListener('click',()=>document.getElementById('modalBackdrop').classList.remove('show'));

/* 집중 오버레이 */
const focusOverlay=document.getElementById('focusOverlay');
let lectureMode=false;
function showOverlay(){
  if(running&&!lectureMode){ distractions++; saveTimerState(); focusOverlay.classList.add('show'); updateLiveScore(); }
}
document.getElementById('overlayBackBtn').addEventListener('click',()=>focusOverlay.classList.remove('show'));

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(running){ lsSet('sf_bg_start',Date.now()); lsSet('sf_bg_elapsed',elapsed); lsSet('sf_autosave_subject',selectedCat); showOverlay(); }
  } else {
    const bgStart=lsGet('sf_bg_start'),bgElapsed=lsGet('sf_bg_elapsed');
    if(bgStart!==null&&bgElapsed!==null){
      const corrected=bgElapsed+(Date.now()-bgStart);
      elapsed=corrected; totalMs=corrected;
      if(running) startTime=Date.now();
      saveTimerState(); localStorage.removeItem('sf_bg_start'); localStorage.removeItem('sf_bg_elapsed');
      updateAccumLabel(); renderGoalBars();
    }
  }
});

function updateLectureModeBtn(){
  const btn=document.getElementById('lectureModeBtn'); if(!btn)return;
  if(lectureMode){btn.textContent='📺 인강 모드 ON · 탭하여 종료';btn.classList.add('active');}
  else{btn.textContent='📺 인강 시청';btn.classList.remove('active');}
}
document.getElementById('lectureModeBtn')?.addEventListener('click',()=>{
  lectureMode=!lectureMode; updateLectureModeBtn();
  if(lectureMode){
    showNotif('인강 모드 ON — 화면 이탈이 방해 횟수로 카운트되지 않아요','📺');
    document.getElementById('lectureModeBtn').textContent='📺 인강 모드 ON · 다시 탭하여 종료';
  } else {
    showNotif('인강 모드 OFF — 집중 모드로 돌아왔어요','✅');
    document.getElementById('lectureModeBtn').textContent='📺 인강 시청 시작';
  }
});

/* ══════════════════════════════════════════════════════════
   9. 모의고사 타이머
   ══════════════════════════════════════════════════════════ */
const MOCK_EXAMS=[
  {label:'국어',      cat:'국어',       minutes:80},
  {label:'수학',      cat:'수학',       minutes:100},
  {label:'영어',      cat:'영어',       minutes:70},
  {label:'한국사',    cat:null,         minutes:30},
  {label:'사회문화',  cat:'사회문화',   minutes:30},
  {label:'생활과윤리',cat:'생활과윤리', minutes:30},
];
let mockTicker=null, mockRemaining=0, mockRunning=false, mockSubject=null;

function renderMockBtns(){
  const wrap=document.getElementById('mockSubjectBtns'); if(!wrap)return;
  wrap.innerHTML='';
  MOCK_EXAMS.forEach(s=>{
    const btn=document.createElement('button');
    btn.className='chip mock-chip'; btn.dataset.label=s.label;
    btn.textContent=`${s.label} ${s.minutes}분`;
    btn.addEventListener('click',()=>selectMockSubject(s));
    wrap.appendChild(btn);
  });
}
function selectMockSubject(s){
  clearInterval(mockTicker); mockTicker=null; mockRunning=false;
  mockSubject=s; mockRemaining=s.minutes*60000;
  document.querySelectorAll('.mock-chip').forEach(c=>c.classList.toggle('active',c.dataset.label===s.label));
  const panel=document.getElementById('mockPanel'); if(panel)panel.style.display='block';
  updateMockDisplay();
  const sb=document.getElementById('mockStartBtn'); if(sb){sb.textContent='시작';sb.classList.remove('stop');}
  const hint=document.getElementById('mockHint'); if(hint) hint.textContent=`${s.label} · ${s.minutes}분`;
}
function updateMockDisplay(){
  if(!mockSubject)return;
  const t=Math.ceil(mockRemaining/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;
  const dh=document.getElementById('mockH'),dm=document.getElementById('mockM'),ds=document.getElementById('mockS');
  if(dh)dh.textContent=pad2(h); if(dm)dm.textContent=pad2(m); if(ds)ds.textContent=pad2(s);
  const pct=mockSubject?mockRemaining/(mockSubject.minutes*60000):1;
  const color=pct>0.3?'var(--accent)':pct>0.1?'var(--warn)':'var(--danger)';
  const ring=document.getElementById('mockTimerRing'); if(ring)ring.style.color=color;
}
function startMockTimer(){
  if(!mockSubject)return; mockRunning=true;
  const sb=document.getElementById('mockStartBtn'); if(sb){sb.textContent='일시정지';sb.classList.add('stop');}
  document.getElementById('mockTimerRing')?.classList.add('running');
  const startAt=Date.now(), startRem=mockRemaining;
  mockTicker=setInterval(()=>{
    mockRemaining=Math.max(0,startRem-(Date.now()-startAt)); updateMockDisplay();
    if(mockRemaining===0){clearInterval(mockTicker);mockRunning=false;finishMockTimer();}
  },200);
}
function pauseMockTimer(){
  mockRunning=false; clearInterval(mockTicker); mockTicker=null;
  const sb=document.getElementById('mockStartBtn'); if(sb){sb.textContent='계속';sb.classList.remove('stop');}
  document.getElementById('mockTimerRing')?.classList.remove('running');
}
function finishMockTimer(){
  if(!mockSubject)return;
  const ms=mockSubject.minutes*60000;
  if(mockSubject.cat&&SUBJECTS.includes(mockSubject.cat)){
    subjectTime[mockSubject.cat]=(subjectTime[mockSubject.cat]||0)+ms;
    totalMs+=ms; elapsed+=ms;
    // sessions에도 추가 → 히트맵 반영
    sessions=[...sessions,{ms, startHour:new Date().getHours(), cat:mockSubject.cat, mock:true}];
    saveTimerState(); updateAccumLabel(); renderGoalBars(); updateLiveScore();
  }
  showNotif(`${mockSubject.label} 모의고사 완료! ${mockSubject.minutes}분 기록됐어요 🎉`,'📝');
  // 모의고사 패널 닫기 및 상태 초기화
  const panel=document.getElementById('mockPanel'); if(panel)panel.style.display='none';
  // 타이머 wrap도 닫기
  const wrap=document.getElementById('mockTimerWrap');
  const outer=document.getElementById('mockOuterWrap');
  const btn=document.getElementById('mockTimerToggle');
  if(wrap) wrap.style.display='none';
  if(btn)  btn.classList.remove('open');
  if(outer) outer.classList.remove('open');
  // 기능 탭도 닫기
  switchTimerTab(null);
  mockSubject=null; mockRemaining=0;
  document.querySelectorAll('.mock-chip').forEach(c=>c.classList.remove('active'));
}
document.getElementById('mockStartBtn')?.addEventListener('click',()=>mockRunning?pauseMockTimer():startMockTimer());
document.getElementById('mockResetBtn')?.addEventListener('click',()=>{
  clearInterval(mockTicker); mockTicker=null; mockRunning=false;
  if(mockSubject){mockRemaining=mockSubject.minutes*60000;updateMockDisplay();}
  const sb=document.getElementById('mockStartBtn'); if(sb){sb.textContent='시작';sb.classList.remove('stop');}
});


/* ══════════════════════════════════════════════════════════
   10. 수면 관리
   ══════════════════════════════════════════════════════════ */
let sleepStartTime=lsGet('sf_temp_sleep');
function updateSleepUI(){
  const status=document.getElementById('sleepStatus'),btnSleep=document.getElementById('btnSleepNow'),btnWake=document.getElementById('btnWakeUp');
  if(sleepStartTime){status.textContent='수면 중...';status.className='badge accent';btnSleep.disabled=true;btnWake.disabled=false;}
  else{status.textContent='활동 중';status.className='badge muted';btnSleep.disabled=false;btnWake.disabled=true;}
}
document.getElementById('btnSleepNow').addEventListener('click',()=>{ sleepStartTime=Date.now(); lsSet('sf_temp_sleep',sleepStartTime); updateSleepUI(); showNotif('잘 자요! 푹 쉬고 내일 만나요 🌙','💤'); });
document.getElementById('btnWakeUp').addEventListener('click',()=>{
  if(!sleepStartTime)return;
  const duration=Math.round((Date.now()-sleepStartTime)/60000);
  const logs=lsGet(K.SLEEP_LOGS)||[]; logs.push({date:todayStr(),durationMin:duration});
  lsSet(K.SLEEP_LOGS,logs.slice(-30)); sleepStartTime=null; localStorage.removeItem('sf_temp_sleep');
  updateSleepUI(); showNotif('상쾌한 아침이에요! 오늘도 화이팅 ☀️','✨');
});

/* ══════════════════════════════════════════════════════════
   11. 리포트 모달
   ══════════════════════════════════════════════════════════ */
let subjectChartInst=null;
function showReport(){
  document.getElementById('rTotalTime').textContent=msToReadable(totalMs)||'0초';
  document.getElementById('rSessions').textContent=sessions.length+'회';
  const longest=sessions.length?Math.max(...sessions.map(s=>s.ms)):0;
  document.getElementById('rLongest').textContent=msToReadable(longest)||'0초';
  const rDist=document.getElementById('rDistractions');
  rDist.innerHTML=`<button class="dist-adj-btn" id="distMinus">−</button><span id="distCount">${distractions}</span>회<button class="dist-adj-btn" id="distPlus">+</button>`;
  document.getElementById('distMinus').addEventListener('click',()=>{ if(distractions>0){distractions--;saveTimerState();document.getElementById('distCount').textContent=distractions;updateLiveScore();} });
  document.getElementById('distPlus').addEventListener('click',()=>{ distractions++;saveTimerState();document.getElementById('distCount').textContent=distractions;updateLiveScore(); });
  const timeline=document.getElementById('sessionTimeline'); timeline.innerHTML='';
  const maxMs=sessions.length?Math.max(...sessions.map(s=>s.ms)):1;
  sessions.forEach((s,i)=>{ timeline.innerHTML+=`<div class="bar-row"><span class="bar-lbl">#${i+1}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(s.ms/maxMs*100)}%"></div></div><span class="bar-time">${msToReadable(s.ms)}</span></div>`; });
  document.getElementById('aiFeedback').textContent='';
  document.getElementById('modalBackdrop').classList.add('show');
  const subEntries=Object.entries(subjectTime).filter(([,v])=>v>0);
  const chartSection=document.getElementById('chartSection');
  setTimeout(()=>{
    if(subEntries.length>0){
      chartSection.style.display='flex';
      if(subjectChartInst)subjectChartInst.destroy();
      subjectChartInst=new Chart(document.getElementById('subjectChart'),{type:'doughnut',data:{labels:subEntries.map(([k])=>k),datasets:[{data:subEntries.map(([,v])=>Math.round(v/60000*10)/10||0.1),backgroundColor:subEntries.map(([k])=>SUBJECT_COLORS[k]),borderWidth:2,borderColor:'var(--card)'}]},options:{responsive:false,plugins:{legend:{display:false},tooltip:{enabled:true}},cutout:'58%'}});
      const legend=document.getElementById('chartLegend'); legend.innerHTML='';
      const tot=subEntries.reduce((s,[,v])=>s+v,0);
      subEntries.forEach(([k,v])=>{ legend.innerHTML+=`<div class="legend-item"><span class="legend-dot" style="background:${SUBJECT_COLORS[k]}"></span><span>${k}</span><span class="legend-pct">${tot>0?Math.round(v/tot*100):0}%</span></div>`; });
    } else { chartSection.style.display='none'; }
  },60);
}

/* ══════════════════════════════════════════════════════════
   12. 통계 탭
   ══════════════════════════════════════════════════════════ */
let weeklyChartInst=null, sleepChartInst=null;

function renderWeeklyStats(){
  const all=getHistoryWithToday(), weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  document.getElementById('weeklyTotal').textContent=msToReadable(weekTotal);
  const recent=all.slice(-7);
  const labels=recent.map(d=>d.date.slice(-5)), mins=recent.map(d=>Math.round(d.totalMs/60000));
  if(weeklyChartInst)weeklyChartInst.destroy();
  weeklyChartInst=new Chart(document.getElementById('weeklyChart'),{type:'bar',data:{labels,datasets:[{data:mins,backgroundColor:'#0071e3',borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
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

function renderSubjectHeatmap(){
  const container=document.getElementById('subjectHeatmapGrid'); if(!container)return;
  container.innerHTML='';
  // 2시간 버킷으로 집계 (12칸)
  const subMap={};
  SUBJECTS.forEach(sub=>{subMap[sub]=new Array(12).fill(0);});
  getHistoryWithToday().forEach(day=>(day.sessions||[]).forEach(s=>{
    if(s.cat&&subMap[s.cat]) subMap[s.cat][Math.floor(s.startHour/2)]+=s.ms;
  }));

  SUBJECTS.forEach(sub=>{
    const total=subMap[sub].reduce((a,b)=>a+b,0); if(total===0)return;
    const maxVal=Math.max(...subMap[sub],1);
    const row=document.createElement('div'); row.className='subject-hm-row';
    const lbl=document.createElement('span'); lbl.className='subject-hm-label';
    lbl.innerHTML=`<span class="cat-dot cat-${sub}"></span>${sub}`;
    row.appendChild(lbl);
    const cells=document.createElement('div'); cells.className='subject-hm-cells';
    subMap[sub].forEach((ms,i)=>{
      const cell=document.createElement('div'); cell.className='hm-cell hm-cell-sm';
      const lvl=ms===0?0:ms<maxVal*.25?1:ms<maxVal*.5?2:ms<maxVal*.75?3:4;
      const alphas=['00','44','88','bb','ff'];
      cell.style.background=ms===0?'var(--border)':`${SUBJECT_COLORS[sub]}${alphas[lvl]}`;
      cell.title=`${sub} ${i*2}~${i*2+2}시: ${msToReadable(ms)}`;
      cells.appendChild(cell);
    });
    row.appendChild(cells); container.appendChild(row);
  });

  // 시간 레이블
  const labelRow=document.createElement('div'); labelRow.className='subject-hm-row';
  const emptyLbl=document.createElement('span'); emptyLbl.className='subject-hm-label'; labelRow.appendChild(emptyLbl);
  const labelCells=document.createElement('div'); labelCells.className='subject-hm-cells';
  for(let i=0;i<12;i++){
    const l=document.createElement('div'); l.className='hm-hour-label';
    l.textContent=i%3===0?`${i*2}시`:''; labelCells.appendChild(l);
  }
  labelRow.appendChild(labelCells); container.appendChild(labelRow);
}

function renderSleepChart(){
  const sleepLogs=lsGet(K.SLEEP_LOGS)||[];
  const canvas=document.getElementById('sleepChart'),noData=document.getElementById('sleepNoData');
  if(!canvas)return;
  if(sleepLogs.length===0){canvas.style.display='none';if(noData)noData.style.display='flex';return;}
  canvas.style.display='block';if(noData)noData.style.display='none';
  const recent=sleepLogs.slice(-7);
  const labels=recent.map(l=>l.date.slice(-5)), data=recent.map(l=>Math.round(l.durationMin/60*10)/10);
  if(sleepChartInst)sleepChartInst.destroy();
  sleepChartInst=new Chart(canvas,{type:'bar',data:{labels,datasets:[{label:'수면시간',data,backgroundColor:'rgba(204,93,232,.2)',borderColor:'#cc5de8',borderWidth:2,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:12,ticks:{callback:v=>v+'h',font:{size:11}}},x:{ticks:{font:{size:11}}}}}});
}

function renderWeeklyReportContent(){
  const all=getHistoryWithToday(), sleepLogs=lsGet(K.SLEEP_LOGS)||[];
  const weekTotal=all.reduce((s,d)=>s+d.totalMs,0);
  const avgSleep=sleepLogs.length?Math.round(sleepLogs.reduce((s,l)=>s+l.durationMin,0)/sleepLogs.length):0;
  let html=`<div class="weekly-report-section"><h3>📊 주간 통계</h3><div class="wr-stat-row">
    <div class="wr-stat"><div class="wr-stat-val">${msToReadable(weekTotal)}</div><div class="wr-stat-lbl">총 공부시간</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${all.length}</div><div class="wr-stat-lbl">활동일수</div></div>
    <div class="wr-stat"><div class="wr-stat-val">${avgSleep}분</div><div class="wr-stat-lbl">평균수면</div></div>
  </div></div><div class="weekly-report-section"><h3>📚 과목별 학습시간</h3><div class="wr-subject-bars">`;
  const weekSubMs={};
  all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>weekSubMs[k]=(weekSubMs[k]||0)+v));
  SUBJECTS.forEach(sub=>{
    const min=Math.round((weekSubMs[sub]||0)/60000),goalMin=goals[sub]||0,pct=goalMin>0?Math.round(min/goalMin*100):0;
    html+=`<div class="wr-sub-row"><span class="wr-sub-name">${sub}</span><div class="wr-sub-track"><div class="wr-sub-fill" style="width:${Math.min(100,pct)}%;background:${SUBJECT_COLORS[sub]}"></div></div><span class="wr-sub-time">${min}분</span></div>`;
  });
  html+=`</div></div>`;
  const avgScore=all.length>0?Math.round(all.reduce((s,d)=>s+(calcLiveScore(d.totalMs,d.sessions,d.distractions,d.doneTasks,d.totalTasks,d.subjectTime)||0),0)/all.length):0;
  html+=`<div class="wr-insight">주간 평균 집중점수: <strong>${avgScore}점</strong></div>`;
  document.getElementById('weeklyReportBody').innerHTML=html;
}
document.getElementById('weeklyReportBtn').addEventListener('click',()=>{ document.getElementById('weeklyReportBackdrop').classList.add('show'); renderWeeklyReportContent(); });
document.getElementById('weeklyReportClose').addEventListener('click',()=>document.getElementById('weeklyReportBackdrop').classList.remove('show'));
document.getElementById('weeklyReportBackdrop').addEventListener('click',e=>{ if(e.target===document.getElementById('weeklyReportBackdrop'))document.getElementById('weeklyReportBackdrop').classList.remove('show'); });

/* ══════════════════════════════════════════════════════════
   13. 수동 기록 추가
   ══════════════════════════════════════════════════════════ */
/* ── 타이머 기능 탭 전환 ── */
let activeTimerTab = null;

function switchTimerTab(tab){
  ['lecture','mock','manual'].forEach(t=>{
    const panel=document.getElementById('timerPanel'+t.charAt(0).toUpperCase()+t.slice(1));
    const btn=document.getElementById('funcTab'+t.charAt(0).toUpperCase()+t.slice(1));
    if(panel) panel.style.display=(tab===t)?'block':'none';
    if(btn)   btn.classList.toggle('active', tab===t);
  });
  activeTimerTab=tab;
  // 모의고사 탭 닫을 때 타이머 일시정지
  if(tab!=='mock' && mockRunning) pauseMockTimer();
  // 인강 탭 닫을 때 모드 해제
  if(tab!=='lecture' && lectureMode){ lectureMode=false; updateLectureModeBtn(); }
}

document.querySelectorAll('.timer-func-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const t=btn.dataset.tab;
    switchTimerTab(activeTimerTab===t?null:t);
  });
});

(function initManualAdd(){
  const dateInput=document.getElementById('manualDate'); if(!dateInput)return;
  const today=new Date().toISOString().slice(0,10); dateInput.value=today; dateInput.max=today;
  
  let manualCat='국어';
  document.getElementById('manualSubjectChips').addEventListener('click',e=>{ const chip=e.target.closest('.chip');if(!chip)return; document.querySelectorAll('#manualSubjectChips .chip').forEach(c=>c.classList.remove('active')); chip.classList.add('active'); manualCat=chip.dataset.cat; });
  document.getElementById('manualAddBtn').addEventListener('click',()=>{
    const dateRaw=document.getElementById('manualDate').value; if(!dateRaw){showNotif('날짜를 선택해주세요','⚠️');return;}
    const hours=parseInt(document.getElementById('manualHours').value)||0, mins=parseInt(document.getElementById('manualMinutes').value)||0, totalMins=hours*60+mins;
    if(totalMins<1){showNotif('시간을 입력해주세요','⚠️');return;}
    const ms=totalMins*60000, todayKey=todayStr();
    if(dateRaw===todayKey){
      subjectTime[manualCat]=(subjectTime[manualCat]||0)+ms; totalMs+=ms; elapsed+=ms;
      saveTimerState(); updateAccumLabel(); renderGoalBars(); updateLiveScore();
    } else {
      const history=lsGet(K.HISTORY)||[], idx=history.findIndex(h=>h.date===dateRaw);
      if(idx>=0){history[idx].subjectTime[manualCat]=(history[idx].subjectTime[manualCat]||0)+ms;history[idx].totalMs+=ms;}
      else history.push({date:dateRaw,totalMs:ms,subjectTime:{[manualCat]:ms},distractions:0,sessions:[],doneTasks:0,totalTasks:0});
      lsSet(K.HISTORY,history.slice(-30));
    }
    document.getElementById('manualHours').value=''; document.getElementById('manualMinutes').value='';
    const label=totalMins>=60?`${Math.floor(totalMins/60)}시간 ${totalMins%60}분`:`${totalMins}분`;
    showNotif(`${manualCat} ${label} 추가됐어요`,'📝');
    if(activeTab==='stats'){renderWeeklyStats();renderHeatmap();renderSubjectHeatmap();}
  });
})();

/* ══════════════════════════════════════════════════════════
   14. AI 코치
   ══════════════════════════════════════════════════════════ */
async function callCoach(prompt){
  const res=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error||'AI 코치와 연결할 수 없습니다.');}
  const data=await res.json(); return data.text||'';
}
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
  const subStatus=Object.entries(d.goalMin).map(([k,v])=>{const actual=d.weekSubjectMin[k]||0;const pct=v>0?Math.round(actual/v*100):0;return`${k} ${actual}/${v}분(${pct}%)`;}).join(', ');
  const todayStatus=Object.entries(d.todaySubjectMin).filter(([,v])=>v>0).map(([k,v])=>`${k} ${v}분`).join(', ')||'없음';
  return `너는 대한민국 수능 고3 수험생 전담 AI 학습 전략가다. 아래 데이터를 분석하고 반드시 JSON만 출력하라. 응답은 반드시 { 로 시작해서 } 로 끝나야 한다. JSON 앞뒤에 어떤 텍스트도 붙이지 마라.

[오늘] D-${d.dday}일, 공부${d.todayMin}분, 할일${d.doneTasks}/${d.totalTasks}완료, 집중방해${d.distractions}회, 오늘과목: ${todayStatus}
[주간] 과목별 달성(실제/목표/달성률): ${subStatus}
[수면] 평균${d.avgSleepMin}분

[점수 산정 기준] 오늘 공부시간(40점): 120분=만점. 할일완료율(20점). 집중방해(감점: 1회당 4점). 과목균형(15점): 오늘 2과목이상=만점. 주간목표달성(25점): 전과목 평균달성률 기준.

[분석 지침]
1. 취약과목: 주간 달성률이 가장 낮은 과목을 특정하고, 왜 부족한지 원인을 추론한 뒤 구체적 보완 전략을 제시하라.
2. 수면분석: 평균수면 기반으로 학습 컨디션을 평가하고 개선 방향을 제시하라. 수면 데이터 없으면 수면 기록을 권장하라.
3. 오늘의 평가: 오늘 공부량과 집중도를 종합 평가하고 내일 개선점을 제시하라.

[출력 규칙] 이모지 금지. 한글과 숫자만 사용. 각 body는 3문장 이내. mission은 내일 실천할 구체적 행동 1문장.

{"score":정수(0-100),"sections":[{"icon":"","title":"취약 과목 분석","body":"3문장이내"},{"icon":"","title":"수면 및 컨디션","body":"3문장이내"},{"icon":"","title":"오늘의 평가","body":"3문장이내"}],"mission":"구체적행동1문장"}`;
}
function renderCoachInline(parsed){
  document.getElementById('inlineScoreNum').textContent=`${parsed.score}점`;
  document.getElementById('liveScore').textContent=parsed.score;
  const cs=document.getElementById('inlineCoachSections'); cs.innerHTML='';
  parsed.sections.forEach(sec=>{ cs.innerHTML+=`<div class="coach-card"><div class="coach-card-head"><span>${sec.icon}</span><span>${sec.title}</span></div><div class="coach-card-body">${sec.body}</div></div>`; });
  document.getElementById('inlineMissionText').textContent=parsed.mission;
  document.getElementById('inlineCoachState').style.display='none'; document.getElementById('inlineCoachResult').style.display='block';
}
async function runCoachAnalysis(){
  document.getElementById('coachRunBtn').style.display='none'; document.getElementById('inlineCoachState').style.display='flex';
  try{
    const raw=await callCoach(buildPrompt(collectData()));
    const cleaned=raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    let parsed; try{parsed=JSON.parse(cleaned);}catch{throw new Error('응답이 잘렸습니다. 잠시 후 다시 시도해주세요.');}
    renderCoachInline(parsed);
  }catch(err){
    document.getElementById('inlineCoachState').style.display='none'; document.getElementById('inlineCoachError').style.display='flex';
    document.getElementById('inlineCoachErrorMsg').textContent=`오류: ${err.message}`; document.getElementById('coachRunBtn').style.display='block';
  }
}
document.getElementById('coachRunBtn').addEventListener('click',runCoachAnalysis);

/* ══════════════════════════════════════════════════════════
   15. 초기 실행
   ══════════════════════════════════════════════════════════ */
renderToday();
renderTomorrow();
renderGoalBars();
updateAccumLabel();
updateLiveScore();
updateSleepUI();
updateTimerUI();
updateLectureModeBtn();
syncSubjectChips(selectedCat);
renderMockBtns();
renderHabits();
renderCalendar();
renderDayPanel();
if(window._needChipSync){ syncSubjectChips(selectedCat); window._needChipSync=false; }
if(running) tick();

/* ══════════════════════════════════════════════════════════
   16. 시간표 탭 (1~7교시)
   ══════════════════════════════════════════════════════════ */
(function(){
  const TIMETABLE_KEY = 'TIMETABLE_V2';
  const PERIODS = [1,2,3,4,5,6,7];
  const DAY_LABELS = ['월','화','수','목','금','토','일'];

  function buildTable(){
    const inner = document.getElementById('timetableTabInner');
    if(!inner || inner.querySelector('.card')) return;

    const card = document.createElement('section'); card.className = 'card';
    const header = document.createElement('div'); header.className = 'card-header';
    header.innerHTML = '<h2 class="card-title">📅 시간표</h2><span class="badge muted">셀을 눌러 입력</span>';
    card.appendChild(header);

    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch';
    const table = document.createElement('table');
    table.className = 'timetable-grid';

    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    trHead.innerHTML = '<th class="tt-th tt-th-period">교시</th>' +
      DAY_LABELS.map(d => `<th class="tt-th">${d}</th>`).join('');
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    PERIODS.forEach(p => {
      const tr = document.createElement('tr');
      const periodTd = document.createElement('td');
      periodTd.className = 'tt-period-label';
      periodTd.textContent = `${p}교시`;
      tr.appendChild(periodTd);
      DAY_LABELS.forEach((_, dayIdx) => {
        const td = document.createElement('td');
        td.className = 'tt-cell';
        td.dataset.period = p;
        td.dataset.day = dayIdx;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    card.appendChild(tableWrap);
    inner.appendChild(card);

    table.addEventListener('click', e => {
      const cell = e.target.closest('.tt-cell'); if(!cell) return;
      openTTEdit(cell);
    });
  }

  function renderTimetable(){
    const store = lsGet(TIMETABLE_KEY) || {};
    document.querySelectorAll('.tt-cell').forEach(cell => {
      const key = `${cell.dataset.period}-${cell.dataset.day}`;
      const val = store[key] || '';
      cell.textContent = val;
      cell.classList.toggle('tt-cell-filled', val !== '');
    });
  }

  let _editCell = null;
  function openTTEdit(cell){
    _editCell = cell;
    const p = cell.dataset.period, d = parseInt(cell.dataset.day);
    document.getElementById('ttEditLabel').textContent = `${p}교시 · ${DAY_LABELS[d]}요일`;
    const store = lsGet(TIMETABLE_KEY) || {};
    const input = document.getElementById('ttEditInput');
    input.value = store[`${p}-${d}`] || '';
    const bd = document.getElementById('ttEditBackdrop');
    bd.style.display = 'flex';
    requestAnimationFrame(() => bd.classList.add('show'));
    setTimeout(() => input.focus(), 80);
  }

  function closeTTEdit(){
    const bd = document.getElementById('ttEditBackdrop'); if(!bd) return;
    bd.classList.remove('show');
    setTimeout(() => { bd.style.display = 'none'; }, 240);
    _editCell = null;
  }

  function saveTTEdit(del){
    if(!_editCell) return;
    const p = _editCell.dataset.period, d = _editCell.dataset.day, key = `${p}-${d}`;
    const store = lsGet(TIMETABLE_KEY) || {};
    const val = document.getElementById('ttEditInput').value.trim();
    if(del || !val){ delete store[key]; }
    else { store[key] = val; }
    lsSet(TIMETABLE_KEY, store);
    renderTimetable();
    closeTTEdit();
  }

  document.getElementById('ttEditBackdrop')?.addEventListener('click', e => {
    if(e.target === document.getElementById('ttEditBackdrop')) closeTTEdit();
  });
  document.getElementById('ttEditCancel')?.addEventListener('click', closeTTEdit);
  document.getElementById('ttEditDelete')?.addEventListener('click', () => saveTTEdit(true));
  document.getElementById('ttEditConfirm')?.addEventListener('click', () => saveTTEdit(false));
  document.getElementById('ttEditInput')?.addEventListener('keydown', e => {
    if(e.key === 'Enter') saveTTEdit(false);
    if(e.key === 'Escape') closeTTEdit();
  });

  function init(){
    try{ buildTable(); renderTimetable(); }catch(e){ console.error('Timetable init failed', e); }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
