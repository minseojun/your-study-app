/* ============================================================
   sleep.js — 수면 관리
   ============================================================ */

let sleepStartTime = lsGet('sf_temp_sleep');

function updateSleepUI(){
  const status   = document.getElementById('sleepStatus');
  const btnSleep = document.getElementById('btnSleepNow');
  const btnWake  = document.getElementById('btnWakeUp');
  if(sleepStartTime){
    status.textContent='수면 중...'; status.className='badge accent';
    btnSleep.disabled=true; btnWake.disabled=false;
  } else {
    status.textContent='활동 중'; status.className='badge muted';
    btnSleep.disabled=false; btnWake.disabled=true;
  }
}

document.getElementById('btnSleepNow').addEventListener('click', ()=>{
  sleepStartTime=Date.now();
  lsSet('sf_temp_sleep',sleepStartTime);
  updateSleepUI();
  showNotif('잘 자요! 푹 쉬고 내일 만나요 🌙','💤');
});

document.getElementById('btnWakeUp').addEventListener('click', ()=>{
  if(!sleepStartTime) return;
  const duration = Math.round((Date.now()-sleepStartTime)/60000);
  const logs = lsGet(K.SLEEP_LOGS)||[];
  logs.push({date:todayStr(), durationMin:duration});
  lsSet(K.SLEEP_LOGS, logs.slice(-30));
  sleepStartTime=null;
  localStorage.removeItem('sf_temp_sleep');
  updateSleepUI();
  showNotif('상쾌한 아침이에요! 오늘도 화이팅 ☀️','✨');
});
