const app = document.querySelector('#app');
const API = '';
let token = localStorage.getItem('tydemo.token') || '';
let me = null;
let state = null;
let currentTab = 'overview';
let currentConversation = 'conv-director';
let seatFilter = '';
let ws = null;
let polling = null;

const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t = ts => new Date(ts).toLocaleTimeString();
async function api(path, opts={}) {
  const headers = new Headers(opts.headers || {});
  headers.set('content-type','application/json');
  if (token) headers.set('authorization',`Bearer ${token}`);
  const r = await fetch(API+path,{...opts,headers});
  const txt = await r.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) throw new Error(data?.error || data?.message || `${r.status}`);
  return data;
}
function toast(msg) { const x=document.querySelector('#toast'); if(x){x.textContent=msg; setTimeout(()=>{ if(x.textContent===msg) x.textContent='';},3500);} }

async function login(userId,password){
  const r=await api('/api/login',{method:'POST',body:JSON.stringify({userId,password})});
  token=r.token; localStorage.setItem('tydemo.token',token); me=r; await boot();
}
async function boot(){
  try { me = await api('/api/me'); state=await api('/api/state'); connectWs(); startPolling(); render(); }
  catch(e){ token=''; me=null; localStorage.removeItem('tydemo.token'); renderLogin(e.message); }
}
function connectWs(){
  if(ws) ws.close();
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
  ws.onmessage=async()=>{ try{state=await api('/api/state'); renderBodyOnly();}catch{} };
}
function startPolling(){
  clearInterval(polling);
  polling=setInterval(async()=>{ try{state=await api('/api/state'); renderBodyOnly();}catch{} },2500);
}
async function logout(){ try{await api('/api/logout',{method:'POST',body:'{}'});}catch{} token='';me=null;state=null;localStorage.removeItem('tydemo.token');clearInterval(polling);if(ws)ws.close();renderLogin(); }

function renderLogin(err=''){
  app.innerHTML=`<div class="login">
    <h1>多智能体协同决策平台 Demo</h1>
    <p>完整业务演示：想定 → 任务组 → Agent协同 → 方案 → 多仿真 → 人工决策 → 下发 → 复盘进化</p>
    <label>账号
      <select id="uid">
        <option value="director">director（总导演席）</option>
        <option value="leaderA">leaderA（A组组长席）</option>
        <option value="intelA">intelA（A组情报席）</option>
        <option value="peerB">peerB（B组方案席）</option>
      </select>
    </label>
    <label>密码<input id="pwd" type="password" value="demo123" /></label>
    <button class="primary" id="loginBtn">登录</button>
    <p class="small">演示账号密码统一为 demo123。可同时开多个浏览器窗口模拟不同席位。</p>
    ${err?`<pre>${esc(err)}</pre>`:''}
  </div>`;
  document.querySelector('#loginBtn').onclick=async()=>{try{await login(document.querySelector('#uid').value,document.querySelector('#pwd').value);}catch(e){renderLogin(e.message)}};
}

function shell(){
  return `<div class="shell">
    <div class="topbar">
      <div>
        <h1>多智能体协同决策平台</h1>
        <div>${esc(state.activity.name)} | 当前阶段：<strong>${esc(state.activity.phase)}</strong> | 参演人数：${state.activity.participants}</div>
        <div id="toast" class="statusline small"></div>
      </div>
      <div>
        当前用户：${esc(me.name)} / ${esc(me.seatId)}<br/>
        <button id="runDemo" class="primary">一键运行完整演示</button>
        <button id="resetDemo">重置演示</button>
        <button id="logout">退出</button>
      </div>
    </div>
    <div class="nav">
      ${navBtn('overview','总览')}${navBtn('agents','席位 / Agent')}${navBtn('chat','协同通信')}${navBtn('workflow','任务 / Workflow')}${navBtn('knowledge','知识库 / Skill')}${navBtn('plans','方案 / 仿真')}${navBtn('audit','审计 / 进化')}
    </div>
    <div id="mainBody"></div>
  </div>`;
}
const navBtn=(id,name)=>`<button data-tab="${id}" class="${currentTab===id?'active':''}">${name}</button>`;
function render(){ if(!token||!me||!state)return renderLogin(); app.innerHTML=shell(); wireShell(); renderBodyOnly(); }
function wireShell(){
  document.querySelector('#logout').onclick=logout;
  document.querySelector('#runDemo').onclick=async()=>{try{await api('/api/demo/run',{method:'POST',body:'{}'});toast('完整演示已启动，会自动推进到“等待人工最终确认”');}catch(e){toast(e.message)}};
  document.querySelector('#resetDemo').onclick=async()=>{if(confirm('确定重置演示数据？')){await api('/api/reset',{method:'POST',body:'{}'});state=await api('/api/state');renderBodyOnly();}};
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===currentTab));renderBodyOnly();});
}
function renderBodyOnly(){
  if(!state)return;
  const b=document.querySelector('#mainBody'); if(!b)return;
  const f={overview:overview,agents:agents,chat:chat,workflow:workflow,knowledge:knowledge,plans:plans,audit:auditView}[currentTab]||overview;
  b.innerHTML=f(); wireBody();
}
function phaseBar(){return `<div class="progress">${state.activity.steps.map((x,i)=>`<span class="${i+1===state.activity.currentStep?'current':''}">${i+1}. ${esc(x)}</span>`).join('')}</div>`}

function overview(){
  const executing=state.seats.filter(s=>s.agentStatus==='executing').length;
  const pending=state.approvals.filter(a=>a.status==='waiting_human').length;
  return `${phaseBar()}
  <div class="grid3">
    <div class="kpi"><div>席位 / Agent</div><div class="value">${state.seats.length}</div><div class="small">每席位一个独立Agent上下文</div></div>
    <div class="kpi"><div>执行中 Agent</div><div class="value">${executing}</div><div class="small">任务中自动检索知识和调用Skill</div></div>
    <div class="kpi"><div>待人工审批</div><div class="value">${pending}</div><div class="small">关键动作保留人工最终确认</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>活动目标</h2><div>${esc(state.activity.objective)}</div><h3>核心机制</h3><div>层级组：组长拆分 / 审核 / 汇总</div><div>平级组：多Agent协商 / 评分 / 意见收敛</div><div>权限：人 + 席位 + 活动上下文</div><div>关键动作：人工审批</div></div>
    <div class="panel"><h2>当前状态</h2>
      <div>活动状态：${esc(state.activity.status)}</div>
      <div>任务组：${state.taskGroups.map(g=>`${esc(g.name)} [${esc(g.status)}]`).join('；')}</div>
      <div>候选方案：${state.plans.length}</div><div>仿真结果：${state.simulations.length}</div>
      <div>最终下发：${state.dispatch?esc(state.dispatch.planName):'尚未下发'}</div>
      ${state.recommendation?`<h3>系统推荐</h3><div>${esc(state.plans.find(p=>p.id===state.recommendation.planId)?.name||state.recommendation.planId)}</div><div>${esc(state.recommendation.reason)}</div>`:''}
    </div>
  </div>
  <div class="panel"><h2>最近 Agent 活动</h2><div class="scroll agent-log">${state.agentLogs.slice(-20).reverse().map(l=>`<div class="logline">[${t(l.at)}] ${esc(l.seatName)} · ${esc(l.action)} · ${esc(l.detail)}</div>`).join('')||'暂无'}</div></div>`;
}

function agents(){
  const rows=state.seats.filter(s=>!seatFilter||s.id.includes(seatFilter)||s.name.includes(seatFilter)||s.role.includes(seatFilter)).slice(0,100);
  return `<div class="toolbar">筛选：<input id="seatFilter" value="${esc(seatFilter)}" placeholder="席位/角色"/> <span class="small">共100席位，当前显示${rows.length}</span></div>
  <table><thead><tr><th>席位</th><th>角色</th><th>组</th><th>密级</th><th>Agent状态</th><th>当前任务</th><th>记忆</th><th>Skill</th><th>操作</th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td>${esc(s.name)}<br/><span class="small">${s.id}</span></td><td>${esc(s.role)}</td><td>${esc(s.groupId||'-')}</td><td>${s.clearance}</td><td>${statusTag(s.agentStatus)}</td><td>${esc(s.currentTask||'-')}</td><td>${s.memoryItems}条</td><td>${s.skillIds.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</td><td>${(me.seatId==='seat-001'||me.seatId===s.id)?`<button data-agent="${s.id}">运行Agent</button>`:'-'}</td></tr>`).join('')}
  </tbody></table>
  <div class="panel"><h2>Agent执行轨迹</h2><div class="scroll">${state.agentLogs.slice(-80).reverse().map(l=>`<div class="logline">[${t(l.at)}] ${esc(l.seatName)} | ${esc(l.action)} | ${esc(l.detail)}</div>`).join('')||'暂无'}</div></div>`;
}
const statusTag=s=>`<span class="tag ${s==='idle'?'ok':s==='executing'?'warn':''}">${esc(s)}</span>`;

function chat(){
  const available=state.conversations.filter(c=>c.memberSeatIds.includes(me.seatId));
  if(!available.some(c=>c.id===currentConversation)) currentConversation=available[0]?.id||'';
  const msgs=state.messages.filter(m=>m.conversationId===currentConversation).slice(-100);
  return `<div class="two-col-chat">
    <div class="conversations panel"><h2>会话</h2>${available.map(c=>`<button data-conv="${c.id}" class="${c.id===currentConversation?'active':''}">${esc(c.name)}</button>`).join('')}
      ${me.seatId==='seat-001'?`<hr/><button id="grantCross">临时授权A/B组跨组协同 30min</button>`:''}
    </div>
    <div class="panel"><h2>${esc(available.find(c=>c.id===currentConversation)?.name||'会话')}</h2>
      <div class="scroll" id="chatScroll">${msgs.map(m=>`<div class="chatline">[${t(m.at)}] <strong>${esc(m.sender)}</strong> <span class="tag">${esc(m.actorType)}</span>：${esc(m.content)}</div>`).join('')||'暂无消息'}</div>
      <div class="toolbar"><input id="chatInput" style="flex:1" placeholder="输入消息，回车发送"/><button id="sendChat">发送</button></div>
    </div>
  </div>`;
}

function workflow(){
  return `<div class="grid2">
    ${state.taskGroups.map(g=>`<div class="panel"><h2>${esc(g.name)}</h2><div>模式：${esc(g.mode)} | 决策：${esc(g.decisionMode)} | 状态：${esc(g.status)}</div><div>成员：${g.memberSeatIds.map(x=>esc(state.seats.find(s=>s.id===x)?.name||x)).join('、')}</div><div>Leader：${esc(g.leaderSeatId?state.seats.find(s=>s.id===g.leaderSeatId)?.name:'无（平级）')}</div></div>`).join('')}
  </div>
  <div class="grid2">${state.workflows.map(w=>`<div class="panel"><h2>${esc(w.name)}</h2><div>状态：${esc(w.status)}</div><ol>${w.steps.map((s,i)=>`<li><strong>${i===w.current?'→ ':''}</strong>${esc(s)}</li>`).join('')}</ol></div>`).join('')||'<div class="panel">尚未启动工作流。点击“一键运行完整演示”。</div>'}</div>
  <div class="panel"><h2>子任务</h2><table><thead><tr><th>任务</th><th>任务组</th><th>席位</th><th>状态</th><th>产出</th></tr></thead><tbody>${state.tasks.map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.groupId)}</td><td>${esc(state.seats.find(s=>s.id===x.seatId)?.name||x.seatId)}</td><td>${esc(x.status)}</td><td>${esc(x.output||'-')}</td></tr>`).join('')||'<tr><td colspan="5">暂无</td></tr>'}</tbody></table></div>`;
}

function knowledge(){
  const mySeat=state.seats.find(s=>s.id===me.seatId);
  return `<div class="grid2"><div class="panel"><h2>知识库（按席位密级）</h2><table><thead><tr><th>文档</th><th>分类</th><th>密级</th><th>当前席位</th></tr></thead><tbody>${state.knowledge.map(k=>`<tr><td>${esc(k.title)}<br/><span class="small">${esc(k.summary)}</span></td><td>${esc(k.category)}</td><td>${k.clearance}</td><td>${mySeat&&mySeat.clearance>=k.clearance?'<span class="tag ok">可访问</span>':'<span class="tag bad">拒绝</span>'}</td></tr>`).join('')}</tbody></table></div>
  <div class="panel"><h2>Skill库</h2>${state.skills.map(s=>`<div class="logline"><strong>${esc(s.name)}</strong> <span class="tag ok">${esc(s.status)}</span><br/><span class="small">${esc(s.description)}</span></div>`).join('')}</div></div>
  <div class="panel"><h2>权限状态</h2><div>跨组通信默认策略：<strong>${esc(state.permissions.crossGroupDefault)}</strong></div><div>临时授权：${state.permissions.temporaryGrants.length}</div>${state.permissions.temporaryGrants.map(g=>`<div>[有效至 ${new Date(g.expiresAt).toLocaleTimeString()}] ${esc(g.fromGroupId)} → ${esc(g.toGroupId)}，${esc(g.reason)}</div>`).join('')}</div>`;
}

function plans(){
  const byPlan=p=>state.simulations.filter(s=>s.planId===p.id);
  return `<div class="panel"><h2>候选方案</h2>${state.plans.length?`<div class="grid3">${state.plans.map(p=>`<div class="panel plan ${state.selectedPlanId===p.id?'selected':''}"><h3>${esc(p.name)}</h3><div>${esc(p.summary)}</div><div>状态：${esc(p.status)}</div><div class="score">综合得分：${p.aggregateScore??'-'}</div>${me.seatId==='seat-001'&&state.recommendation?`<button data-select-plan="${p.id}" class="${state.recommendation.planId===p.id?'primary':''}">人工选定并下发</button>`:''}</div>`).join('')}</div>`:'尚无方案。先运行完整演示。'}</div>
  ${state.recommendation?`<div class="panel"><h2>系统推荐（仅建议，最终由人确认）</h2><div>推荐：<strong>${esc(state.plans.find(p=>p.id===state.recommendation.planId)?.name)}</strong></div><div>置信度：${Math.round(state.recommendation.confidence*100)}%</div><div>${esc(state.recommendation.reason)}</div></div>`:''}
  <div class="panel"><h2>多仿真系统结果</h2><table><thead><tr><th>方案</th><th>仿真系统</th><th>任务完成</th><th>安全</th><th>资源</th><th>综合</th><th>解释</th></tr></thead><tbody>${state.simulations.map(s=>`<tr><td>${esc(state.plans.find(p=>p.id===s.planId)?.name||s.planId)}</td><td>${esc(s.name)}</td><td>${s.successRate}</td><td>${s.safety}</td><td>${s.resource}</td><td><strong>${s.score}</strong></td><td>${esc(s.narrative)}</td></tr>`).join('')||'<tr><td colspan="7">暂无仿真结果</td></tr>'}</tbody></table></div>
  ${state.dispatch?`<div class="panel"><h2>已下发</h2><div><strong>${esc(state.dispatch.planName)}</strong></div><div>时间：${new Date(state.dispatch.at).toLocaleString()} | 审批席位：${esc(state.dispatch.by)}</div></div>`:''}`;
}

function auditView(){
  return `<div class="grid2"><div class="panel"><h2>全链路审计</h2><div class="scroll">${state.audit.slice(-120).reverse().map(a=>`<div class="auditline">[${t(a.at)}] ${esc(a.actor)} | ${esc(a.action)} | ${esc(a.target)} | ${esc(a.result)} ${a.detail?`| ${esc(a.detail)}`:''}</div>`).join('')}</div></div>
  <div class="panel"><h2>Agent自进化建议（人工审批后才能固化）</h2>${state.evolution.length?state.evolution.map(e=>`<div class="panel"><strong>${esc(e.title)}</strong><br/>类型：${esc(e.type)} | 状态：${esc(e.status)}<br/><span class="small">${esc(e.reason)}</span>${me.seatId==='seat-001'&&e.status==='pending_human'?`<br/><button data-evo="${e.id}">批准固化</button>`:''}</div>`).join(''):'方案下发并复盘后生成进化建议。'}</div></div>`;
}

function wireBody(){
  const sf=document.querySelector('#seatFilter'); if(sf) sf.oninput=e=>{seatFilter=e.target.value;renderBodyOnly();};
  document.querySelectorAll('[data-agent]').forEach(b=>b.onclick=async()=>{try{await api('/api/agent/run',{method:'POST',body:JSON.stringify({seatId:b.dataset.agent})});toast('Agent已开始执行');}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-conv]').forEach(b=>b.onclick=()=>{currentConversation=b.dataset.conv;renderBodyOnly();});
  const send=async()=>{const i=document.querySelector('#chatInput');if(!i||!i.value.trim())return;try{await api('/api/chat',{method:'POST',body:JSON.stringify({conversationId:currentConversation,content:i.value})});i.value='';}catch(e){toast(e.message)}};
  const sb=document.querySelector('#sendChat'); if(sb)sb.onclick=send;
  const ci=document.querySelector('#chatInput'); if(ci)ci.onkeydown=e=>{if(e.key==='Enter')send();};
  const gc=document.querySelector('#grantCross'); if(gc)gc.onclick=async()=>{try{await api('/api/permission/grant',{method:'POST',body:JSON.stringify({fromGroupId:'group-a',toGroupId:'group-b',reason:'方案协同复核'})});toast('临时跨组授权已签发30分钟');}catch(e){toast(e.message)}};
  document.querySelectorAll('[data-select-plan]').forEach(b=>b.onclick=async()=>{const p=state.plans.find(x=>x.id===b.dataset.selectPlan);if(confirm(`人工确认选定并下发：${p.name}？`)){try{await api('/api/plan/select',{method:'POST',body:JSON.stringify({planId:p.id,reason:'总导演席综合仿真结果人工确认'})});toast('方案已人工确认并下发');}catch(e){toast(e.message)}}});
  document.querySelectorAll('[data-evo]').forEach(b=>b.onclick=async()=>{try{await api('/api/evolution/approve',{method:'POST',body:JSON.stringify({id:b.dataset.evo})});toast('进化建议已批准');}catch(e){toast(e.message)}});
  const cs=document.querySelector('#chatScroll'); if(cs)cs.scrollTop=cs.scrollHeight;
}

if(token) boot(); else renderLogin();
