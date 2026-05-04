/* ============================================================
   report.js — 세션 종료 리포트 모달
   ============================================================ */

let subjectChartInst = null;

function showReport(){
  document.getElementById('rTotalTime').textContent = msToReadable(totalMs)||'0초';
  document.getElementById('rSessions').textContent  = sessions.length+'회';
  const longest = sessions.length ? Math.max(...sessions.map(s=>s.ms)) : 0;
  document.getElementById('rLongest').textContent   = msToReadable(longest)||'0초';

  /* 집중 방해 수정 UI */
  const rDist = document.getElementById('rDistractions');
  rDist.innerHTML = `
    <button class="dist-adj-btn" id="distMinus">−</button>
    <span id="distCount">${distractions}</span>회
    <button class="dist-adj-btn" id="distPlus">+</button>`;
  document.getElementById('distMinus').addEventListener('click',()=>{
    if(distractions>0){ distractions--; saveTimerState(); document.getElementById('distCount').textContent=distractions; updateLiveScore(); }
  });
  document.getElementById('distPlus').addEventListener('click',()=>{
    distractions++; saveTimerState(); document.getElementById('distCount').textContent=distractions; updateLiveScore();
  });

  /* 세션 타임라인 */
  const timeline = document.getElementById('sessionTimeline'); timeline.innerHTML='';
  const maxMs    = sessions.length ? Math.max(...sessions.map(s=>s.ms)) : 1;
  sessions.forEach((s,i)=>{
    const pct=Math.round(s.ms/maxMs*100);
    timeline.innerHTML+=`<div class="bar-row"><span class="bar-lbl">#${i+1}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-time">${msToReadable(s.ms)}</span></div>`;
  });

  document.getElementById('aiFeedback').textContent='';
  document.getElementById('modalBackdrop').classList.add('show');

  /* 도넛 차트 */
  const subEntries   = Object.entries(subjectTime).filter(([,v])=>v>0);
  const chartSection = document.getElementById('chartSection');
  setTimeout(()=>{
    if(subEntries.length>0){
      chartSection.style.display='flex';
      if(subjectChartInst) subjectChartInst.destroy();
      subjectChartInst = new Chart(document.getElementById('subjectChart'),{
        type:'doughnut',
        data:{
          labels:subEntries.map(([k])=>k),
          datasets:[{data:subEntries.map(([,v])=>Math.round(v/60000*10)/10||0.1), backgroundColor:subEntries.map(([k])=>SUBJECT_COLORS[k]), borderWidth:2, borderColor:'var(--card)'}]
        },
        options:{responsive:false, plugins:{legend:{display:false},tooltip:{enabled:true}}, cutout:'58%'}
      });
      const legend = document.getElementById('chartLegend'); legend.innerHTML='';
      const tot    = subEntries.reduce((s,[,v])=>s+v,0);
      subEntries.forEach(([k,v])=>{
        const pct=tot>0?Math.round(v/tot*100):0;
        legend.innerHTML+=`<div class="legend-item"><span class="legend-dot" style="background:${SUBJECT_COLORS[k]}"></span><span>${k}</span><span class="legend-pct">${pct}%</span></div>`;
      });
    } else {
      chartSection.style.display='none';
    }
  },60);
}

document.getElementById('modalClose').addEventListener('click',    ()=>document.getElementById('modalBackdrop').classList.remove('show'));
document.getElementById('modalContinue').addEventListener('click', ()=>document.getElementById('modalBackdrop').classList.remove('show'));
