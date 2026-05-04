/* ============================================================
   main.js — 초기 실행 진입점
   모든 js/ 파일이 로드된 후 마지막으로 실행된다.
   ============================================================ */

/* ── 초기 렌더 ── */
renderToday();
renderTomorrow();
renderGoalBars();
updateAccumLabel();
updateLiveScore();
updateSleepUI();
updateTimerUI();
updateLectureModeBtn();
syncSubjectChips(selectedCat);

/* ── 타이머 복원 후 칩 UI 동기화 ── */
if(window._needChipSync){
  syncSubjectChips(selectedCat);
  window._needChipSync = false;
}

/* ── 타이머가 살아있으면 재개 ── */
if(running) tick();
