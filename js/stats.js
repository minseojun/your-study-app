/* ============================================================
   stats.js — 주간 차트, 시간대 히트맵, 과목별 히트맵, 수면 차트, 주간 리포트
   ============================================================ */

let weeklyChartInst=null, sleepChartInst=null;

/* ── 주간 공부 시간 차트 ── */
function renderWeeklyStats(){
  const all       = getHistoryWithToday();
  const weekTotal = all.reduce((s,d)=>s+d.totalMs,0);
  document.getElementById('weeklyTotal').textContent = msToReadable(weekTotal);

  const labels = all.map(d=>d.date.slice(-5));
  const mins   = all.map(d=>Math.round(d.totalMs/60000));

  if(weeklyChartInst) weeklyChartInst.destroy();
  weeklyChartInst = new Chart(document.getElementById('weeklyChart'),{
    type:'bar',
    data:{labels, datasets:[{data:mins, backgroundColor:'#0071e3', borderRadius:6}]},
    options:{responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}
  });
}

/* ── 시간대별 집중 히트맵 (24h) ── */
function renderHeatmap(){
  const map = new Array(24).fill(0);
  getHistoryWithToday().forEach(day=>(day.sessions||[]).forEach(s=>map[s.startHour]+=s.ms));
  const grid   = document.getElementById('heatmapGrid');
  const maxVal = Math.max(...map,1);
  grid.innerHTML='';
  map.forEach((ms,h)=>{
    const cell = document.createElement('div'); cell.className='hm-cell';
    const lvl  = ms===0?0:ms<maxVal*.25?1:ms<maxVal*.5?2:ms<maxVal*.75?3:4;
    cell.setAttribute('data-lvl',lvl);
    cell.title=`${h}시: ${msToReadable(ms)}`;
    grid.appendChild(cell);
  });
  const bestHour = map.indexOf(Math.max(...map));
  document.getElementById('bestHour').innerHTML = `💡 <strong>${bestHour}시</strong>에 가장 집중이 잘 됐어요!`;
}

/* ── 과목별 시간대 히트맵 ── */
function renderSubjectHeatmap(){
  const container = document.getElementById('subjectHeatmapGrid');
  if(!container) return;
  container.innerHTML='';

  // 과목별 시간대별 ms 집계
  const subMap = {};
  SUBJECTS.forEach(sub=>{ subMap[sub] = new Array(24).fill(0); });

  getHistoryWithToday().forEach(day=>{
    (day.sessions||[]).forEach(s=>{
      const cat = s.cat || null;
      if(cat && subMap[cat]) subMap[cat][s.startHour] += s.ms;
    });
  });

  SUBJECTS.forEach(sub=>{
    const row   = document.createElement('div'); row.className='subject-hm-row';
    const label = document.createElement('span'); label.className='subject-hm-label';
    label.innerHTML=`<span class="cat-dot cat-${sub}"></span>${sub}`;
    row.appendChild(label);

    const cells = document.createElement('div'); cells.className='subject-hm-cells';
    const maxVal = Math.max(...subMap[sub], 1);

    subMap[sub].forEach((ms,h)=>{
      const cell = document.createElement('div'); cell.className='hm-cell hm-cell-sm';
      const lvl  = ms===0?0:ms<maxVal*.25?1:ms<maxVal*.5?2:ms<maxVal*.75?3:4;
      cell.setAttribute('data-lvl',lvl);
      cell.style.setProperty('--hm-color', SUBJECT_COLORS[sub]);
      cell.title=`${sub} ${h}시: ${msToReadable(ms)}`;
      cells.appendChild(cell);
    });
    row.appendChild(cells);
    container.appendChild(row);
  });

  // 시간 레이블
  const labelRow = document.createElement('div'); labelRow.className='subject-hm-label-row';
  labelRow.innerHTML='<span class="subject-hm-label"></span>';
  const labelCells = document.createElement('div'); labelCells.className='subject-hm-cells';
  for(let h=0;h<24;h++){
    const l=document.createElement('div'); l.className='hm-hour-label';
    l.textContent = h%6===0?`${h}시`:'';
    labelCells.appendChild(l);
  }
  labelRow.appendChild(labelCells);
  container.appendChild(labelRow);
}

/* ── 수면 차트 ── */
function renderSleepChart(){
  const sleepLogs = lsGet(K.SLEEP_LOGS)||[];
  const canvas    = document.getElementById('sleepChart');
  const noData    = document.getElementById('sleepNoData');
  if(!canvas) return;
  if(sleepLogs.length===0){
    canvas.style.display='none'; if(noData) noData.style.display='flex'; return;
  }
  canvas.style.display='block'; if(noData) noData.style.display='none';

  const labels = sleepLogs.slice(-7).map(l=>l.date.slice(-5));
  const data   = sleepLogs.slice(-7).map(l=>Math.round(l.durationMin/60*10)/10);

  if(sleepChartInst) sleepChartInst.destroy();
  sleepChartInst = new Chart(canvas,{
    type:'bar',
    data:{labels, datasets:[{label:'수면 시간', data, backgroundColor:'rgba(204,93,232,.2)', borderColor:'#cc5de8', borderWidth:2, borderRadius:6}]},
    options:{responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, max:12, ticks:{callback:v=>v+'h', font:{size:11}}}, x:{ticks:{font:{size:11}}}}}
  });
}

/* ── 주간 리포트 모달 ── */
function renderWeeklyReportContent(){
  const all      = getHistoryWithToday();
  const sleepLogs= lsGet(K.SLEEP_LOGS)||[];
  const weekTotal= all.reduce((s,d)=>s+d.totalMs,0);
  const avgSleep = sleepLogs.length ? Math.round(sleepLogs.reduce((s,l)=>s+l.durationMin,0)/sleepLogs.length) : 0;

  let html = `
    <div class="weekly-report-section">
      <h3>📊 주간 통계</h3>
      <div class="wr-stat-row">
        <div class="wr-stat"><div class="wr-stat-val">${msToReadable(weekTotal)}</div><div class="wr-stat-lbl">총 공부시간</div></div>
        <div class="wr-stat"><div class="wr-stat-val">${all.length}</div><div class="wr-stat-lbl">활동일수</div></div>
        <div class="wr-stat"><div class="wr-stat-val">${avgSleep}분</div><div class="wr-stat-lbl">평균수면</div></div>
      </div>
    </div>
    <div class="weekly-report-section">
      <h3>📚 과목별 학습시간</h3>
      <div class="wr-subject-bars">`;

  const weekSubMs = {};
  all.forEach(d=>Object.entries(d.subjectTime||{}).forEach(([k,v])=>weekSubMs[k]=(weekSubMs[k]||0)+v));
  SUBJECTS.forEach(sub=>{
    const min    = Math.round((weekSubMs[sub]||0)/60000);
    const goalMin= goals[sub]||0;
    const pct    = goalMin>0?Math.round(min/goalMin*100):0;
    html+=`<div class="wr-sub-row"><span class="wr-sub-name">${sub}</span><div class="wr-sub-track"><div class="wr-sub-fill" style="width:${Math.min(100,pct)}%;background:${SUBJECT_COLORS[sub]}"></div></div><span class="wr-sub-time">${min}분</span></div>`;
  });
  html+=`</div></div>`;

  const avgScore = all.length > 0
    ? Math.round(all.reduce((s,d)=>s+(calcLiveScore(d.totalMs,d.sessions,d.distractions,d.doneTasks,d.totalTasks,d.subjectTime)||0),0)/all.length)
    : 0;
  html += `<div class="wr-insight">주간 평균 집중점수: <strong>${avgScore}점</strong></div>`;
  document.getElementById('weeklyReportBody').innerHTML = html;
}

document.getElementById('weeklyReportBtn').addEventListener('click',()=>{
  document.getElementById('weeklyReportBackdrop').classList.add('show');
  renderWeeklyReportContent();
});
document.getElementById('weeklyReportClose').addEventListener('click',()=>
  document.getElementById('weeklyReportBackdrop').classList.remove('show'));
document.getElementById('weeklyReportBackdrop').addEventListener('click',e=>{
  if(e.target===document.getElementById('weeklyReportBackdrop'))
    document.getElementById('weeklyReportBackdrop').classList.remove('show');
});
