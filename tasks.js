/* ============================================================
   tasks.js — 오늘 할 일, 내일로 미루기, 과목 칩
   ============================================================ */

let todayTasks    = lsGet(K.TODAY_TASKS) || [];
let tomorrowTasks = lsGet(K.TMRW_TASKS)  || [];
let selectedCat   = lsGet('sf_last_subject') || '국어';

/* ── SVG 아이콘 ── */
const S_POST = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v6.5L10 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 1L4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const S_DEL  = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const S_BACK = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5H2M6.5 2L2 6.5l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ── 할 일 아이템 생성 ── */
function buildItem(task, idx, isTomorrow){
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done?' done':'') + (isTomorrow?' tomorrow-item':'');

  if(!isTomorrow){
    const cb = document.createElement('input');
    cb.type='checkbox'; cb.className='task-cb'; cb.checked=task.done;
    cb.addEventListener('change',()=>{
      todayTasks[idx].done = !todayTasks[idx].done;
      lsSet(K.TODAY_TASKS,todayTasks);
      renderToday(); renderGoalBars(); updateLiveScore();
    });
    li.appendChild(cb);
  }

  const dot   = document.createElement('span'); dot.className=`cat-dot cat-${task.cat||'국어'}`; li.appendChild(dot);
  const txt   = document.createElement('span'); txt.className='task-text'; txt.textContent=task.text; li.appendChild(txt);
  const badge = document.createElement('span'); badge.className='cat-badge'; badge.textContent=task.cat||'국어'; li.appendChild(badge);

  const acts = document.createElement('div'); acts.className='task-actions';

  if(!isTomorrow){
    const pb = document.createElement('button'); pb.className='postpone'; pb.title='내일로 미루기'; pb.innerHTML=S_POST;
    pb.addEventListener('click',()=>postponeTask(idx));
    acts.appendChild(pb);
  } else {
    const bb = document.createElement('button'); bb.title='오늘로 되돌리기'; bb.innerHTML=S_BACK;
    bb.addEventListener('click',()=>{
      todayTasks.push({text:task.text,cat:task.cat,done:false});
      tomorrowTasks.splice(idx,1);
      lsSet(K.TODAY_TASKS,todayTasks); lsSet(K.TMRW_TASKS,tomorrowTasks);
      renderToday(); renderTomorrow();
    });
    acts.appendChild(bb);
  }

  const db = document.createElement('button'); db.className='del'; db.title='삭제'; db.innerHTML=S_DEL;
  db.addEventListener('click',()=>{
    if(isTomorrow){ tomorrowTasks.splice(idx,1); lsSet(K.TMRW_TASKS,tomorrowTasks); renderTomorrow(); }
    else          { todayTasks.splice(idx,1);    lsSet(K.TODAY_TASKS,todayTasks);    renderToday();   }
  });
  acts.appendChild(db);
  li.appendChild(acts);
  return li;
}

/* ── 렌더 ── */
function renderToday(){
  const tl = document.getElementById('taskList'); tl.innerHTML='';
  todayTasks.forEach((t,i)=>tl.appendChild(buildItem(t,i,false)));
  const total=todayTasks.length, done=todayTasks.filter(t=>t.done).length;
  document.getElementById('emptyState').style.display  = total===0?'flex':'none';
  document.getElementById('taskCount').textContent      = `${total}개`;
  document.getElementById('progressRow').style.display  = total===0?'none':'flex';
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
  todayTasks.push({text, cat:selectedCat, done:false});
  lsSet(K.TODAY_TASKS,todayTasks);
  document.getElementById('taskInput').value='';
  renderToday();
}

/* ── 과목 칩 동기화 ── */
function syncSubjectChips(cat){
  document.querySelectorAll('#timerCategoryChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
  document.querySelectorAll('#categoryChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
}

function syncSubjectChipsAndSave(cat){
  selectedCat = cat;
  syncSubjectChips(cat);
  lsSet('sf_last_subject', cat);
}

/* ── 이벤트 리스너 ── */
document.getElementById('addBtn').addEventListener('click', addTask);
document.getElementById('taskInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addTask(); });

document.getElementById('categoryChips').addEventListener('click', e=>{
  const chip=e.target.closest('.chip'); if(!chip) return;
  syncSubjectChipsAndSave(chip.dataset.cat);
});

const _timerChips = document.getElementById('timerCategoryChips');
if(_timerChips) _timerChips.addEventListener('click', e=>{
  const chip=e.target.closest('.chip'); if(!chip||chip.disabled) return;
  syncSubjectChipsAndSave(chip.dataset.cat);
});

// capture로 등록해서 다른 리스너보다 먼저 저장
document.getElementById('timerCategoryChips').addEventListener('click', e=>{
  const chip=e.target.closest('.chip'); if(!chip||chip.disabled) return;
  lsSet('sf_last_subject', chip.dataset.cat);
}, true);
