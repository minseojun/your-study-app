/* ============================================================
   coach.js — AI 학습 코치 (Claude)
   ============================================================ */

async function callCoach(prompt){
  const res = await fetch('/api/coach',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({prompt})
  });
  if(!res.ok){
    const e=await res.json().catch(()=>({}));
    throw new Error(e?.error||'AI 코치와 연결할 수 없습니다.');
  }
  const data=await res.json();
  return data.text||'';
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
  const subStatus = Object.entries(d.goalMin)
    .map(([k,v])=>{
      const actual=d.weekSubjectMin[k]||0;
      const pct=v>0?Math.round(actual/v*100):0;
      return `${k} ${actual}/${v}분(${pct}%)`;
    }).join(', ');
  const todayStatus = Object.entries(d.todaySubjectMin)
    .filter(([,v])=>v>0).map(([k,v])=>`${k} ${v}분`).join(', ')||'없음';
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
  document.getElementById('inlineScoreNum').textContent = `${parsed.score}점`;
  document.getElementById('liveScore').textContent      = parsed.score;
  const cs=document.getElementById('inlineCoachSections'); cs.innerHTML='';
  parsed.sections.forEach(sec=>{
    cs.innerHTML+=`<div class="coach-card"><div class="coach-card-head"><span>${sec.icon}</span><span>${sec.title}</span></div><div class="coach-card-body">${sec.body}</div></div>`;
  });
  document.getElementById('inlineMissionText').textContent=parsed.mission;
  document.getElementById('inlineCoachState').style.display ='none';
  document.getElementById('inlineCoachResult').style.display='block';
}

async function runCoachAnalysis(){
  document.getElementById('coachRunBtn').style.display     ='none';
  document.getElementById('inlineCoachState').style.display='flex';
  try{
    const raw     = await callCoach(buildPrompt(collectData()));
    const cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    let parsed;
    try{ parsed=JSON.parse(cleaned); }
    catch{ throw new Error('응답이 잘렸습니다. 잠시 후 다시 시도해주세요.'); }
    renderCoachInline(parsed);
  } catch(err){
    document.getElementById('inlineCoachState').style.display ='none';
    document.getElementById('inlineCoachError').style.display ='flex';
    document.getElementById('inlineCoachErrorMsg').textContent=`오류: ${err.message}`;
    document.getElementById('coachRunBtn').style.display='block';
  }
}

document.getElementById('coachRunBtn').addEventListener('click', runCoachAnalysis);
