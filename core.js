/* ============================================================
   core.js — 상수, 유틸리티, 로컬스토리지, 날짜 롤오버
   ============================================================ */
'use strict';

/* ── 상수 ── */
const SUNEUNG = new Date('2026-11-19T00:00:00');
const SUBJECTS = ['국어','영어','수학','사회문화','생활과윤리'];
const SUBJECT_COLORS = {
  '국어':'#ff6b6b','영어':'#51cf66','수학':'#339af0',
  '사회문화':'#ffa94d','생활과윤리':'#cc5de8'
};
const K = {
  TODAY_TASKS  : 'sf_today_tasks',
  TMRW_TASKS   : 'sf_tmrw_tasks',
  TODAY_DATE   : 'sf_today_date',
  TIMER_STATE  : 'sf_timer_state',
  HISTORY      : 'sf_history',
  GOALS        : 'sf_goals',
  NIGHT        : 'sf_night',
  LAST_REPORT  : 'sf_last_report',
  SLEEP_LOGS   : 'sf_sleep_logs',
  HABITS       : 'sf_habits',       // 반복 습관 (추후 사용)
};

/* ── 유틸리티 ── */
const pad2         = n => String(Math.floor(n)).padStart(2,'0');
const msToHMS      = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; return h>0?`${pad2(h)}:${pad2(m)}:${pad2(s)}`:`${pad2(m)}:${pad2(s)}`; };
const msToReadable = ms => { const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60; if(h>0)return`${h}시간 ${pad2(m)}분`; if(m>0)return`${m}분 ${pad2(s)}초`; return`${s}초`; };
const getDday      = () => { const a=new Date();a.setHours(0,0,0,0);const b=new Date(SUNEUNG);b.setHours(0,0,0,0);return Math.max(0,Math.round((b-a)/86400000)); };
const todayStr     = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const dateStrOf    = d  => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const lsGet        = k  => { try{return JSON.parse(localStorage.getItem(k));}catch{return null;} };
const lsSet        = (k,v) => localStorage.setItem(k,JSON.stringify(v));

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
    lsSet(K.HISTORY, history.slice(-30)); // 30일치 보관
    const incompleteTasks=prevTasks.filter(t=>!t.done);
    const tmrw=lsGet(K.TMRW_TASKS)||[];
    lsSet(K.TMRW_TASKS,[...incompleteTasks,...tmrw]);
    lsSet(K.TODAY_TASKS, tmrw.map(t=>({...t,done:false})));
    lsSet(K.TMRW_TASKS,[]);
    lsSet(K.TIMER_STATE,{elapsed:0,subjectTime:{},sessions:[],distractions:0,totalMs:0});
  }
  lsSet(K.TODAY_DATE,now);
}

/* ── 전체 히스토리 (오늘 포함) 반환 ── */
// timer.js에서 totalMs, subjectTime 등이 초기화된 이후에 사용해야 함
function getHistoryWithToday(){
  return [...(lsGet(K.HISTORY)||[]), {
    date:todayStr(), totalMs, subjectTime, distractions, sessions,
    doneTasks:todayTasks.filter(t=>t.done).length,
    totalTasks:todayTasks.length
  }].slice(-30);
}

/* ── D-Day 초기화 ── */
checkDateRollover();
const DDAY = getDday();
document.getElementById('dateBadge').textContent = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'});
document.getElementById('dDayCount').textContent = DDAY;
document.getElementById('ddayBadge').textContent  = `수능 D-${DDAY}`;
