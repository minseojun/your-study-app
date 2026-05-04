/* ============================================================
   goals.js — 오늘 목표 설정 및 진행 바
   ============================================================ */

let goals = lsGet(K.GOALS) || {국어:60,영어:60,수학:90,사회문화:45,생활과윤리:45};

function renderGoalBars(){
  const bars = document.getElementById('goalBars');
  if(!bars) return;
  bars.innerHTML='';
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

/* ── 목표 편집 패널 ── */
document.getElementById('goalEditBtn').addEventListener('click', ()=>{
  const p   = document.getElementById('goalEditPanel');
  const inp = document.getElementById('goalInputs');
  if(p.style.display==='block'){ p.style.display='none'; return; }
  inp.innerHTML='';
  SUBJECTS.forEach(sub=>{
    inp.innerHTML+=`
      <div class="goal-input-row">
        <span class="goal-input-label"><span class="cat-dot cat-${sub}"></span>${sub}</span>
        <input type="number" class="goal-input-field" data-sub="${sub}" value="${goals[sub]||0}" min="0">
        <span class="goal-input-unit">분</span>
      </div>`;
  });
  p.style.display='block';
});

document.getElementById('goalSave').addEventListener('click', ()=>{
  document.querySelectorAll('.goal-input-field').forEach(i=>{
    goals[i.dataset.sub] = parseInt(i.value)||0;
  });
  lsSet(K.GOALS,goals);
  document.getElementById('goalEditPanel').style.display='none';
  renderGoalBars();
});

document.getElementById('goalCancel').addEventListener('click', ()=>{
  document.getElementById('goalEditPanel').style.display='none';
});
