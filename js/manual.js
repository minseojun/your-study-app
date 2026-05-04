/* ============================================================
   manual.js — 수동 공부기록 추가
   ============================================================ */

(function initManualAdd(){
  const dateInput = document.getElementById('manualDate');
  if(dateInput){
    const today = new Date().toISOString().slice(0,10);
    dateInput.value = today;
    dateInput.max   = today;
  }

  /* 토글 열기/닫기 */
  document.getElementById('manualToggleBtn').addEventListener('click', ()=>{
    const panel = document.getElementById('manualInlinePanel');
    const btn   = document.getElementById('manualToggleBtn');
    const wrap  = btn.closest('.manual-inline-wrap');
    const isClosed = !panel.style.display || panel.style.display==='none';
    panel.style.display = isClosed ? 'block' : 'none';
    btn.classList.toggle('open', isClosed);
    if(wrap) wrap.classList.toggle('open', isClosed);
  });

  /* 과목 칩 */
  let manualSelectedCat = '국어';
  document.getElementById('manualSubjectChips').addEventListener('click', e=>{
    const chip=e.target.closest('.chip'); if(!chip) return;
    document.querySelectorAll('#manualSubjectChips .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    manualSelectedCat = chip.dataset.cat;
  });

  /* 추가 버튼 */
  document.getElementById('manualAddBtn').addEventListener('click', ()=>{
    const dateRaw = document.getElementById('manualDate').value;
    if(!dateRaw){ showNotif('날짜를 선택해주세요','⚠️'); return; }
    const hours     = parseInt(document.getElementById('manualHours').value)   || 0;
    const mins      = parseInt(document.getElementById('manualMinutes').value) || 0;
    const totalMins = hours*60 + mins;
    if(totalMins < 1){ showNotif('시간을 입력해주세요','⚠️'); return; }
    const ms       = totalMins * 60000;
    const todayKey = todayStr();

    if(dateRaw === todayKey){
      subjectTime[manualSelectedCat] = (subjectTime[manualSelectedCat]||0)+ms;
      totalMs += ms; elapsed += ms;
      saveTimerState(); updateAccumLabel(); renderGoalBars(); updateLiveScore();
    } else {
      const history = lsGet(K.HISTORY)||[];
      const idx = history.findIndex(h=>h.date===dateRaw);
      if(idx>=0){
        history[idx].subjectTime[manualSelectedCat] = (history[idx].subjectTime[manualSelectedCat]||0)+ms;
        history[idx].totalMs += ms;
      } else {
        history.push({date:dateRaw, totalMs:ms, subjectTime:{[manualSelectedCat]:ms}, distractions:0, sessions:[], doneTasks:0, totalTasks:0});
      }
      lsSet(K.HISTORY, history.slice(-30));
    }

    document.getElementById('manualHours').value   = '';
    document.getElementById('manualMinutes').value = '';
    const label = totalMins>=60 ? `${Math.floor(totalMins/60)}시간 ${totalMins%60}분` : `${totalMins}분`;
    showNotif(`${manualSelectedCat} ${label} 추가됐어요`,'📝');
    if(activeTab==='stats'){ renderWeeklyStats(); renderHeatmap(); renderSubjectHeatmap(); }
  });
})();
