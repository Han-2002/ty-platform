
const API = 'http://127.0.0.1:8787';
const WS = 'ws://127.0.0.1:8787/ws';

const state = {
  token: localStorage.getItem('ty.token') || '',
  me: null,
  users: [],
  assignments: [],
  activities: [],
  seats: [],
  groups: [],
  workflows: [],
  grants: [],
  conversations: [],
  messages: [],
  plans: [],
  audit: [],
  evaluation: null,
  currentActivityId: localStorage.getItem('ty.activity') || '',
  currentSeatId: localStorage.getItem('ty.seat') || '',
  currentConversationId: '',
  route: 'home',
  consoleTab: 'overview',
  wsConnected: false,
  ws: null,
  lastEvents: [],
};

const qs = (s, root=document) => root.querySelector(s);
const qsa = (s, root=document) => [...root.querySelectorAll(s)];
const fmtTime = (n) => n ? new Date(n).toLocaleString() : '-';
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function toast(msg) {
  let el = qs('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.style.display = 'none', 3200);
}

async function api(path, options={}) {
  const headers = {...(options.headers || {})};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  if (options.business !== false && state.currentSeatId && state.currentActivityId) {
    headers['x-seat-id'] = state.currentSeatId;
    headers['x-activity-id'] = state.currentActivityId;
  }
  const res = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    if (res.status === 401) {
      state.token = '';
      localStorage.removeItem('ty.token');
      render();
    }
    throw err;
  }
  return data;
}

async function login(userId, password) {
  const data = await api('/api/auth/login', {method:'POST', business:false, body:{userId,password}});
  state.token = data.token;
  localStorage.setItem('ty.token', data.token);
  await loadAll();
  connectWs();
}

async function loadAll() {
  if (!state.token) return;
  const me = await api('/api/me', {business:false});
  state.me = me;
  state.assignments = me.assignments || [];

  if (!state.currentSeatId || !state.currentActivityId) {
    const a = state.assignments.find(x => x.active) || state.assignments[0];
    if (a) {
      state.currentSeatId = a.seatId;
      state.currentActivityId = a.activityId;
      localStorage.setItem('ty.seat', a.seatId);
      localStorage.setItem('ty.activity', a.activityId);
    }
  }

  const [activities, seats, users] = await Promise.all([
    api('/api/activities', {business:false}),
    api('/api/seats', {business:false}),
    api('/api/users', {business:false}),
  ]);
  state.activities = activities;
  state.seats = seats;
  state.users = users;

  if (state.currentActivityId) {
    const [groups, workflows, grants, conversations, plans] = await Promise.all([
      api(`/api/task-groups?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
      api(`/api/workflows?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
      api(`/api/permissions/grants?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
      api(`/api/conversations?activityId=${encodeURIComponent(state.currentActivityId)}`),
      api(`/api/plans?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
    ]);
    state.groups = groups;
    state.workflows = workflows;
    state.grants = grants;
    state.conversations = conversations;
    state.plans = plans;
  }
}

async function safeAudit() {
  try {
    state.audit = await api(`/api/audit?activityId=${encodeURIComponent(state.currentActivityId)}`);
  } catch (e) {
    state.audit = [];
    if (e.status !== 403) throw e;
  }
}

function connectWs() {
  if (!state.token || !state.currentActivityId || !state.currentSeatId) return;
  try { state.ws?.close(); } catch {}
  const url = `${WS}?token=${encodeURIComponent(state.token)}&activityId=${encodeURIComponent(state.currentActivityId)}&seatId=${encodeURIComponent(state.currentSeatId)}`;
  const ws = new WebSocket(url);
  state.ws = ws;
  ws.onopen = () => { state.wsConnected = true; render(); };
  ws.onclose = () => { state.wsConnected = false; render(); };
  ws.onerror = () => { state.wsConnected = false; render(); };
  ws.onmessage = async (ev) => {
    try {
      const event = JSON.parse(ev.data);
      state.lastEvents.unshift(event);
      state.lastEvents = state.lastEvents.slice(0, 20);
      if (event.type !== 'heartbeat') {
        await refreshContextData();
        if (state.currentConversationId && event.type === 'chat.message.created') {
          await loadMessages(state.currentConversationId);
        }
        render();
      }
    } catch {}
  };
}

async function refreshContextData() {
  if (!state.token || !state.currentActivityId) return;
  const [groups, workflows, grants, conversations, plans] = await Promise.all([
    api(`/api/task-groups?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
    api(`/api/workflows?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
    api(`/api/permissions/grants?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
    api(`/api/conversations?activityId=${encodeURIComponent(state.currentActivityId)}`),
    api(`/api/plans?activityId=${encodeURIComponent(state.currentActivityId)}`, {business:false}),
  ]);
  Object.assign(state, {groups,workflows,grants,conversations,plans});
}

async function loadMessages(conversationId) {
  state.messages = await api(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
}

function currentSeat() { return state.seats.find(s => s.id === state.currentSeatId); }
function currentActivity() { return state.activities.find(a => a.id === state.currentActivityId); }
function currentAssignment() {
  return state.assignments.find(a => a.seatId===state.currentSeatId && a.activityId===state.currentActivityId && a.active)
      || state.assignments.find(a => a.seatId===state.currentSeatId && a.activityId===state.currentActivityId);
}

function setContext(seatId, activityId) {
  state.currentSeatId = seatId;
  state.currentActivityId = activityId;
  localStorage.setItem('ty.seat', seatId);
  localStorage.setItem('ty.activity', activityId);
  state.currentConversationId = '';
  state.messages = [];
  state.evaluation = null;
  refreshContextData().then(() => {
    connectWs();
    render();
  }).catch(e => toast(e.message));
}

function route(name) {
  state.route = name;
  render();
  if (name === 'console' && state.consoleTab === 'audit') safeAudit().then(render).catch(e=>toast(e.message));
}

function render() {
  const app = qs('#app');
  app.innerHTML = shellHtml();
  bindGlobal();
  if (!state.token) loginOverlay();
}

function shellHtml() {
  return `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">智能推演平台</div>
      <button class="new-chat" id="newConversation">⊕ 新会话</button>
      <div class="side-section-title">工作区</div>
      <nav class="nav">
        <button data-route="home" class="${state.route==='home'?'active':''}">▢ 智能推演平台</button>
        <button data-route="plans" class="${state.route==='plans'?'active':''}">▱ 推演方案</button>
        <button data-route="chat" class="${state.route==='chat'?'active':''}">▢ 协同会话</button>
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-bottom">
        <button data-route="console" class="${state.route==='console'?'active':''}">推演控制台</button>
        <button data-route="settings" class="${state.route==='settings'?'active':''}">⚙ 设置</button>
      </div>
    </aside>
    <main class="main">${pageHtml()}</main>
  </div>`;
}

function pageHtml() {
  if (state.route === 'console') return consoleHtml();
  if (state.route === 'chat') return chatHtml();
  if (state.route === 'plans') return planWorkspaceHtml();
  if (state.route === 'settings') return settingsHtml();
  return homeHtml();
}

function homeHtml() {
  const assignmentOpts = state.assignments
    .filter(a => a.active)
    .map(a => {
      const s = state.seats.find(x=>x.id===a.seatId);
      const act = state.activities.find(x=>x.id===a.activityId);
      return `<option value="${esc(a.seatId)}|${esc(a.activityId)}" ${(a.seatId===state.currentSeatId&&a.activityId===state.currentActivityId)?'selected':''}>${esc(act?.name||a.activityId)} · ${esc(s?.name||a.seatId)}</option>`;
    }).join('');
  return `
  <div class="page home">
    <div class="home-title-row"><h1 class="home-title">智能推演平台</h1><span class="preview-badge">自主版</span></div>
    <div class="context-bar">
      <span>▢</span>
      <select id="contextSelect">${assignmentOpts || '<option>暂无席位编配</option>'}</select>
      <span>⌄</span>
      <span style="margin-left:14px">⌘ 标准模式</span>
    </div>
    <div class="composer">
      <textarea id="homeComposer" placeholder="${state.currentConversationId ? '向当前会话发送消息' : '选择或创建一个会话后开始'}"></textarea>
      <div class="composer-footer">
        <div class="composer-left">
          <span>＋</span><span>附件</span>
          <span>当前：${esc(currentActivity()?.name || '-')} / ${esc(currentSeat()?.name || '-')}</span>
        </div>
        <button id="homeSend" class="send">↑</button>
      </div>
    </div>
    <div class="muted" style="margin-top:14px">${state.currentConversationId ? `当前会话：${esc(state.conversations.find(c=>c.id===state.currentConversationId)?.name || state.currentConversationId)}` : '左侧“新会话”可创建真实席位协同会话'}</div>
  </div>`;
}

function consoleHtml() {
  const tabs = [
    ['overview','总览'],['seats','席位/组织'],['groups','任务组'],['workflow','工作流'],
    ['permissions','审批/权限'],['plans','方案/仿真'],['audit','审计/复盘']
  ];
  return `
  <div class="page console">
    <div class="console-header">
      <div class="console-head-row">
        <div>
          <div class="console-title">推演控制台</div>
          <div class="muted">${esc(currentActivity()?.name || '未选择活动')} · ${esc(currentSeat()?.name || '未选择席位')}</div>
        </div>
        <div class="header-actions">
          <span class="status-dot ${state.wsConnected?'':'off'}"></span>
          <span class="muted">${state.wsConnected?'实时连接':'实时连接断开'}</span>
          <button class="btn" id="refreshAll">刷新</button>
        </div>
      </div>
      <div class="tabs">${tabs.map(([id,label])=>`<button data-tab="${id}" class="${state.consoleTab===id?'active':''}">${label}</button>`).join('')}</div>
    </div>
    <div class="console-body">${consoleTabHtml()}</div>
  </div>`;
}

function consoleTabHtml() {
  switch(state.consoleTab) {
    case 'seats': return seatsHtml();
    case 'groups': return groupsHtml();
    case 'workflow': return workflowHtml();
    case 'permissions': return permissionsHtml();
    case 'plans': return plansHtml();
    case 'audit': return auditHtml();
    default: return overviewHtml();
  }
}

function overviewHtml() {
  const running = state.workflows.filter(w=>w.status==='running').length;
  const selected = state.plans.filter(p=>p.status==='selected'||p.status==='dispatched').length;
  const activeGrants = state.grants.filter(g=>!g.revokedAt && g.expiresAt>Date.now()).length;
  return `
  <div class="section">
    <div class="cards">
      ${summaryCard('席位',state.seats.length,`${state.assignments.filter(a=>a.active).length} 个有效编配`)}
      ${summaryCard('任务组',state.groups.length,`${state.groups.filter(g=>g.mode==='hierarchical').length} 层级 / ${state.groups.filter(g=>g.mode==='peer').length} 平级`)}
      ${summaryCard('工作流',state.workflows.length,`${running} 运行中`)}
      ${summaryCard('方案版本',state.plans.length,`${selected} 已选择/下发`)}
      ${summaryCard('临时授权',activeGrants,`${state.grants.length} 条历史`)}
    </div>
  </div>
  <div class="section grid2">
    <div class="panel">
      <h3 class="section-title">任务组状态</h3>
      <div class="list">${state.groups.length ? state.groups.slice(0,8).map(groupCard).join('') : '<div class="empty">暂无任务组</div>'}</div>
    </div>
    <div class="panel">
      <h3 class="section-title">工作流状态</h3>
      <div class="list">${state.workflows.length ? state.workflows.slice(0,8).map(workflowMini).join('') : '<div class="empty">暂无工作流</div>'}</div>
    </div>
  </div>
  <div class="section panel">
    <h3 class="section-title">实时事件</h3>
    ${state.lastEvents.length ? `<div class="table-wrap"><table><thead><tr><th>时间</th><th>事件</th><th>活动</th><th>席位</th></tr></thead><tbody>${state.lastEvents.map(e=>`<tr><td>${fmtTime(e.at)}</td><td>${esc(e.type)}</td><td>${esc(e.activityId||'-')}</td><td>${esc(e.seatId||'-')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">等待 WebSocket 事件</div>'}
  </div>`;
}

function summaryCard(label,value,note) {
  return `<div class="card"><div class="card-label">${esc(label)}</div><div class="card-value">${esc(value)}</div><div class="card-note">${esc(note)}</div></div>`;
}

function groupCard(g) {
  return `<div class="list-item">
    <div class="list-item-head"><strong>${esc(g.name)}</strong><span class="badge ${g.mode==='peer'?'blue':''}">${g.mode==='hierarchical'?'层级组':'平级组'}</span></div>
    <div class="muted">${esc(g.status)} · ${g.memberSeatIds?.length||0} 席位 ${g.leaderSeatId?`· leader ${esc(g.leaderSeatId)}`:''}</div>
  </div>`;
}

function workflowMini(w) {
  const done = w.steps?.filter(s=>s.status==='completed').length || 0;
  const total = w.steps?.length || 1;
  const pct = Math.round(done/total*100);
  const current = w.steps?.find(s=>s.status==='active');
  return `<div class="list-item">
    <div class="list-item-head"><strong>${esc(w.template)}</strong><span>${pct}%</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="muted">当前：${esc(current?.name || (w.status==='completed'?'已完成':'-'))}</div>
  </div>`;
}

function seatsHtml() {
  const activeAssignments = state.assignments.filter(a=>a.active);
  return `
  <div class="section">
    <h3 class="section-title">席位与人员编配</h3>
    <div class="section-sub">权限由 人 + 席位 + 活动 上下文共同决定。</div>
    <div class="table-wrap panel">
      <table><thead><tr><th>席位</th><th>角色</th><th>层级</th><th>密级</th><th>分派</th><th>审批</th><th>当前人员</th></tr></thead>
      <tbody>${state.seats.map(s=>{
        const a=activeAssignments.find(x=>x.seatId===s.id&&x.activityId===state.currentActivityId);
        const u=state.users.find(x=>x.id===a?.userId);
        return `<tr><td><strong>${esc(s.name)}</strong><div class="muted mono">${esc(s.id)}</div></td><td>${esc(s.roleName)}</td><td>${esc(s.parentId||'-')}</td><td>${s.clearance}</td><td>${s.canDispatch?'是':'-'}</td><td>${s.canApprove?'是':'-'}</td><td>${esc(u?.name||a?.userId||'-')}</td></tr>`;
      }).join('')}</tbody></table>
    </div>
  </div>`;
}

function groupsHtml() {
  const canDispatch = currentSeat()?.canDispatch;
  return `
  <div class="section">
    <div class="grid2">
      <div class="panel">
        <h3 class="section-title">创建任务组</h3>
        ${canDispatch ? groupFormHtml() : '<div class="error-box">当前席位没有分派权限，不能创建任务组。</div>'}
      </div>
      <div class="panel">
        <h3 class="section-title">当前任务组</h3>
        <div class="list">${state.groups.length ? state.groups.map(groupCard).join('') : '<div class="empty">暂无任务组</div>'}</div>
      </div>
    </div>
  </div>`;
}

function groupFormHtml() {
  return `
  <div class="form-grid">
    <label class="field">组名<input id="groupName" class="input" value="联合筹划组"></label>
    <label class="field">模式<select id="groupMode" class="select"><option value="hierarchical">层级组</option><option value="peer">平级组</option></select></label>
    <label class="field" id="leaderWrap">组长<select id="groupLeader" class="select">${state.seats.filter(s=>s.canDispatch).map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.id)}</option>`).join('')}</select></label>
    <label class="field" id="decisionWrap" style="display:none">群体决策<select id="groupDecision" class="select"><option value="negotiate">多轮协商</option><option value="vote">投票</option><option value="score">评分</option></select></label>
  </div>
  <div class="muted" style="margin-top:10px">成员席位</div>
  <div class="members">${state.seats.map(s=>`<label class="member"><input type="checkbox" class="groupMember" value="${esc(s.id)}"> ${esc(s.name)}</label>`).join('')}</div>
  <button id="createGroup" class="btn primary">创建任务组</button>`;
}

function workflowHtml() {
  return `<div class="section">
    <h3 class="section-title">工作流</h3>
    <div class="section-sub">层级组和平级组使用不同标准骨架；关键步骤必须由满足角色规则的席位推进。</div>
    <div class="list">${state.groups.length ? state.groups.map(g=>{
      const w=state.workflows.find(x=>x.groupId===g.id);
      if(!w) return `<div class="panel"><div class="list-item-head"><strong>${esc(g.name)}</strong><span class="badge">未创建工作流</span></div><div style="margin-top:10px"><button class="btn createWorkflow" data-group="${esc(g.id)}">创建标准工作流</button></div></div>`;
      const current=w.steps.find(s=>s.status==='active');
      const done=w.steps.filter(s=>s.status==='completed').length;
      const pct=Math.round(done/w.steps.length*100);
      const candidates = g.memberSeatIds.map(id=>state.seats.find(s=>s.id===id)).filter(Boolean);
      return `<div class="panel">
        <div class="list-item-head"><strong>${esc(g.name)}</strong><span class="badge ${w.status==='completed'?'green':'blue'}">${w.status==='completed'?'已完成':pct+'%'}</span></div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="steps">${w.steps.map((s,i)=>`<div class="step ${s.status}"><span class="step-index">${i+1}</span><span>${esc(s.name)}</span><span class="muted">${esc(s.actorRule)} · ${esc(s.status)}</span></div>`).join('')}</div>
        ${current?`<div class="toolbar" style="margin-top:12px"><select class="select workflowActor" data-workflow="${esc(w.id)}" style="width:auto">${candidates.map(s=>`<option value="${esc(s.id)}" ${s.id===state.currentSeatId?'selected':''}>${esc(s.name)}</option>`).join('')}</select><button class="btn primary advanceWorkflow" data-workflow="${esc(w.id)}">完成当前步骤：${esc(current.name)}</button></div>`:''}
      </div>`;
    }).join('') : '<div class="empty panel">请先创建任务组。</div>'}</div>
  </div>`;
}

function permissionsHtml() {
  const canApprove = currentSeat()?.canApprove;
  return `<div class="section grid2">
    <div class="panel">
      <h3 class="section-title">临时授权</h3>
      ${canApprove ? grantFormHtml() : '<div class="error-box">当前席位没有审批权限；可以查看已有授权，但不能签发/撤销。</div>'}
    </div>
    <div class="panel">
      <h3 class="section-title">授权记录</h3>
      <div class="list">${state.grants.length?state.grants.map(g=>`<div class="list-item">
        <div class="list-item-head"><strong>${esc(g.action)}</strong><span class="badge ${g.revokedAt?'red':(g.expiresAt>Date.now()?'green':'')}">${g.revokedAt?'已撤销':(g.expiresAt>Date.now()?'有效':'已过期')}</span></div>
        <div class="muted">用户 ${esc(g.userId)} · 席位 ${esc(g.seatId)} · 到期 ${fmtTime(g.expiresAt)}</div>
        <div class="muted">${esc(g.reason||'')}</div>
        ${canApprove && !g.revokedAt ? `<button class="btn danger revokeGrant" data-id="${esc(g.id)}" style="margin-top:8px">撤销</button>`:''}
      </div>`).join(''):'<div class="empty">暂无授权</div>'}</div>
    </div>
  </div>`;
}

function grantFormHtml() {
  const actions=['knowledge.read','message.send','message.cross_group','task.dispatch','workflow.propose_change','workflow.approve_change','plan.submit','plan.approve','simulation.run','plan.dispatch','seat.assign'];
  return `
  <div class="form-grid">
    <label class="field">用户<select id="grantUser" class="select">${state.users.map(u=>`<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.id)}</option>`).join('')}</select></label>
    <label class="field">席位<select id="grantSeat" class="select">${state.seats.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field">动作<select id="grantAction" class="select">${actions.map(a=>`<option value="${a}">${a}</option>`).join('')}</select></label>
    <label class="field">有效小时<input id="grantHours" class="input" type="number" value="2" min="1"></label>
    <label class="field">目标任务组<select id="grantTargetGroup" class="select"><option value="">不限定</option>${state.groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></label>
    <label class="field">理由<input id="grantReason" class="input" value="临时业务需要"></label>
  </div>
  <button id="issueGrant" class="btn primary" style="margin-top:10px">签发临时授权</button>`;
}

function plansHtml() {
  const canApprove = currentSeat()?.canApprove;
  const evalHtml = state.evaluation ? evaluationHtml(state.evaluation, canApprove) : '';
  return `<div class="section">
    <div class="panel">
      <div class="list-item-head"><div><h3 class="section-title" style="margin:0">候选方案与仿真</h3><div class="muted">选择一个或多个方案版本，提交到现有 SimulationService 进行评估。</div></div><button class="btn" id="refreshPlans">刷新</button></div>
      ${state.plans.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>方案</th><th>版本</th><th>任务组</th><th>状态</th><th>提交席位</th></tr></thead><tbody>${state.plans.map(p=>`<tr><td><input type="checkbox" class="planPick" value="${esc(p.id)}" ${p.status==='candidate'||p.status==='evaluated'?'checked':''}></td><td><strong>${esc(p.name)}</strong><div class="muted mono">${esc(p.id)}</div></td><td>v${p.version}</td><td>${esc(p.groupId)}</td><td>${esc(p.status)}</td><td>${esc(p.submittedBySeatId)}</td></tr>`).join('')}</tbody></table></div><button id="runEvaluation" class="btn primary" style="margin-top:12px">运行多仿真评估</button>` : '<div class="empty">目前没有方案版本。方案产生后会自动出现在这里。</div>'}
    </div>
    ${evalHtml}
  </div>`;
}

function evaluationHtml(ev, canApprove) {
  const run=ev.run; const results=ev.results||[];
  return `<div class="panel" style="margin-top:14px">
    <h3 class="section-title">本轮评估</h3>
    <div class="muted">Run ${esc(run.id)} · 系统推荐 ${esc(run.recommendedPlanVersionId||'-')}</div>
    <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>排名</th><th>方案版本</th><th>加权分</th><th>各仿真结果</th></tr></thead><tbody>${results.map(r=>`<tr><td>${r.rank??'-'}</td><td>${esc(r.plan?.plan_name||r.plan?.plan_id||'-')}<div class="muted mono">${esc(r.plan?.plan_id||'')}</div></td><td><strong>${r.weightedScore??'-'}</strong></td><td>${(r.outcomes||[]).map(o=>`${esc(o.simulatorId)}: ${o.connected ? (o.result?.score ?? 'ok') : '断开'}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>
    ${canApprove ? `<div class="toolbar" style="margin-top:12px"><select id="confirmPlanVersion" class="select" style="width:auto">${results.map(r=>`<option value="${esc(r.plan.plan_id)}" ${r.plan.plan_id===run.recommendedPlanVersionId?'selected':''}>${esc(r.plan.plan_name)} ${r.plan.plan_id===run.recommendedPlanVersionId?'（系统推荐）':''}</option>`).join('')}</select><input id="confirmReason" class="input" style="width:320px" value="综合仿真结果与人工判断"><button class="btn primary" id="confirmSelection">人工确认</button>${run.confirmedAt?`<button class="btn primary" id="dispatchSelection">正式下发</button>`:''}</div>`:'<div class="error-box" style="margin-top:10px">当前席位没有审批权限，不能进行最终方案确认和下发。</div>'}
  </div>`;
}

function auditHtml() {
  const canApprove = currentSeat()?.canApprove;
  return `<div class="section panel">
    <div class="list-item-head"><div><h3 class="section-title" style="margin:0">全链路审计</h3><div class="muted">查询需要审批席位权限。</div></div><button class="btn" id="loadAudit" ${canApprove?'':'disabled'}>刷新审计</button></div>
    ${!canApprove?'<div class="error-box" style="margin-top:12px">当前席位没有审计查询权限。</div>':''}
    ${state.audit.length?`<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>#</th><th>时间</th><th>主体</th><th>动作</th><th>目标</th><th>结果</th><th>Hash</th></tr></thead><tbody>${[...state.audit].reverse().slice(0,150).map(a=>`<tr><td>${a.sequence}</td><td>${fmtTime(a.at)}</td><td>${esc(a.seatId||a.userId||a.actorType)}</td><td>${esc(a.action)}</td><td>${esc(a.targetType||'-')} ${esc(a.targetId?.slice?.(0,8)||'')}</td><td>${esc(a.result)}</td><td class="mono">${esc(a.hash?.slice?.(0,12)||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">暂无已加载的审计记录</div>'}
  </div>`;
}

function chatHtml() {
  const conv = state.conversations.find(c=>c.id===state.currentConversationId);
  return `<div class="page chat-layout">
    <div class="chat-list">
      <div class="chat-list-head"><strong>协同会话</strong><div class="muted">${state.conversations.length} 个会话</div></div>
      ${state.conversations.map(c=>`<button class="chat-conv ${c.id===state.currentConversationId?'active':''}" data-conv="${esc(c.id)}"><strong>${esc(c.name||c.id)}</strong><div class="muted">${esc(c.kind||c.type||'group')} · ${(c.memberSeatIds||c.members||[]).length} 人</div></button>`).join('')}
    </div>
    <div class="chat-main">
      <div class="chat-main-head"><strong>${esc(conv?.name||'请选择会话')}</strong><div class="muted">${conv?esc(conv.id):''}</div></div>
      <div class="messages">${state.currentConversationId ? (state.messages.length ? state.messages.map(m=>`<div class="message"><div class="message-meta">${esc(m.seatId||m.from||'-')} · ${fmtTime(m.createdAt||m.timestamp||m.at)}</div><div>${esc(m.content)}</div></div>`).join('') : '<div class="empty">暂无消息</div>') : '<div class="empty">从左侧选择会话，或点击“新会话”。</div>'}</div>
      <div class="chat-input"><textarea id="chatText" class="textarea" placeholder="发送真实协同消息" ${state.currentConversationId?'':'disabled'}></textarea><button id="chatSend" class="btn primary" ${state.currentConversationId?'':'disabled'}>发送</button></div>
    </div>
  </div>`;
}

function planWorkspaceHtml() {
  return `<div class="page" style="padding:28px;background:#f8f9fb">${plansHtml()}</div>`;
}

function settingsHtml() {
  return `<div class="page settings-page">
    <h2>设置</h2>
    <div class="panel">
      <div class="field">业务 API<input class="input" value="${API}" disabled></div>
      <div style="margin-top:12px" class="field">当前用户<input class="input" value="${esc(state.me?.userName||'-')} (${esc(state.me?.userId||'-')})" disabled></div>
      <div style="margin-top:12px" class="field">当前活动<input class="input" value="${esc(currentActivity()?.name||state.currentActivityId||'-')}" disabled></div>
      <div style="margin-top:12px" class="field">当前席位<input class="input" value="${esc(currentSeat()?.name||state.currentSeatId||'-')}" disabled></div>
      <div style="margin-top:16px" class="toolbar"><button id="logout" class="btn danger">退出登录</button></div>
    </div>
  </div>`;
}

function bindGlobal() {
  qsa('[data-route]').forEach(b=>b.onclick=()=>route(b.dataset.route));
  const nc=qs('#newConversation'); if(nc) nc.onclick=createConversationDialog;
  const cs=qs('#contextSelect'); if(cs) cs.onchange=()=>{
    const [seat,act]=cs.value.split('|'); if(seat&&act) setContext(seat,act);
  };
  const hs=qs('#homeSend'); if(hs) hs.onclick=async()=> {
    const ta=qs('#homeComposer'); const text=ta.value.trim(); if(!text) return;
    if(!state.currentConversationId){ toast('请先创建或选择一个会话'); route('chat'); return; }
    try{ await api(`/api/conversations/${encodeURIComponent(state.currentConversationId)}/messages`,{method:'POST',body:{content:text}}); ta.value=''; await loadMessages(state.currentConversationId); render(); }catch(e){toast(e.message);}
  };
  const tabs=qsa('[data-tab]'); tabs.forEach(b=>b.onclick=async()=>{
    state.consoleTab=b.dataset.tab;
    if(state.consoleTab==='audit') await safeAudit().catch(e=>toast(e.message));
    render();
  });
  const rr=qs('#refreshAll'); if(rr) rr.onclick=async()=>{try{await loadAll(); if(state.consoleTab==='audit')await safeAudit(); render(); toast('已刷新');}catch(e){toast(e.message)}};
  bindGroups();
  bindWorkflow();
  bindPermissions();
  bindPlans();
  bindAudit();
  bindChat();
  const logout=qs('#logout'); if(logout) logout.onclick=async()=> {
    try{await api('/api/auth/logout',{method:'POST',business:false});}catch{}
    state.token=''; state.me=null; localStorage.removeItem('ty.token'); try{state.ws?.close();}catch{} render();
  };
}

function bindGroups() {
  const mode=qs('#groupMode'); if(mode) mode.onchange=()=>{
    qs('#leaderWrap').style.display=mode.value==='hierarchical'?'flex':'none';
    qs('#decisionWrap').style.display=mode.value==='peer'?'flex':'none';
  };
  const create=qs('#createGroup'); if(create) create.onclick=async()=>{
    try{
      const m=qs('#groupMode').value;
      const leader=qs('#groupLeader')?.value;
      const members=qsa('.groupMember:checked').map(x=>x.value);
      if(m==='hierarchical'&&leader&&!members.includes(leader)) members.push(leader);
      if(!members.length) throw new Error('至少选择一个成员');
      const body={activityId:state.currentActivityId,name:qs('#groupName').value.trim()||'未命名任务组',mode:m,memberSeatIds:members};
      if(m==='hierarchical') body.leaderSeatId=leader;
      else body.peerDecisionMode=qs('#groupDecision').value;
      await api('/api/task-groups',{method:'POST',body});
      await refreshContextData(); render(); toast('任务组创建成功');
    }catch(e){toast(e.message)}
  };
}

function bindWorkflow() {
  qsa('.createWorkflow').forEach(b=>b.onclick=async()=>{
    try{await api(`/api/task-groups/${encodeURIComponent(b.dataset.group)}/workflow`,{method:'POST',body:{}});await refreshContextData();render();toast('工作流已创建');}catch(e){toast(e.message)}
  });
  qsa('.advanceWorkflow').forEach(b=>b.onclick=async()=>{
    try{
      const sel=qs(`.workflowActor[data-workflow="${CSS.escape(b.dataset.workflow)}"]`);
      const actor=sel?.value;
      if(actor && actor!==state.currentSeatId){
        const assignment=state.assignments.find(a=>a.seatId===actor&&a.activityId===state.currentActivityId&&a.active);
        if(!assignment || assignment.userId!==state.me?.userId) throw new Error('当前登录用户没有被编配到所选执行席位，不能冒用该席位推进');
        setContext(actor,state.currentActivityId);
        await new Promise(r=>setTimeout(r,150));
      }
      await api(`/api/workflows/${encodeURIComponent(b.dataset.workflow)}/complete`,{method:'POST',body:{}});
      await refreshContextData();render();toast('当前步骤已完成');
    }catch(e){toast(e.message)}
  });
}

function bindPermissions() {
  const issue=qs('#issueGrant'); if(issue) issue.onclick=async()=>{
    try{
      const body={
        userId:qs('#grantUser').value,
        seatId:qs('#grantSeat').value,
        activityId:state.currentActivityId,
        action:qs('#grantAction').value,
        expiresAt:Date.now()+Number(qs('#grantHours').value||2)*3600_000,
        reason:qs('#grantReason').value||'临时业务需要'
      };
      const tg=qs('#grantTargetGroup').value; if(tg) body.targetGroupId=tg;
      await api('/api/permissions/grants',{method:'POST',body});
      await refreshContextData();render();toast('临时授权已签发');
    }catch(e){toast(e.message)}
  };
  qsa('.revokeGrant').forEach(b=>b.onclick=async()=>{
    try{await api(`/api/permissions/grants/${encodeURIComponent(b.dataset.id)}/revoke`,{method:'POST',body:{}});await refreshContextData();render();toast('授权已撤销');}catch(e){toast(e.message)}
  });
}

function bindPlans() {
  const rp=qs('#refreshPlans'); if(rp) rp.onclick=async()=>{await refreshContextData();render();};
  const run=qs('#runEvaluation'); if(run) run.onclick=async()=>{
    try{
      const versionIds=qsa('.planPick:checked').map(x=>x.value);
      if(!versionIds.length) throw new Error('至少选择一个方案版本');
      state.evaluation=await api('/api/evaluations',{method:'POST',body:{versionIds}});
      await refreshContextData();render();toast('仿真评估完成');
    }catch(e){toast(e.message)}
  };
  const confirm=qs('#confirmSelection'); if(confirm) confirm.onclick=async()=>{
    try{
      const runId=state.evaluation.run.id;
      const versionId=qs('#confirmPlanVersion').value;
      const reason=qs('#confirmReason').value;
      const r=await api(`/api/evaluations/${encodeURIComponent(runId)}/confirm`,{method:'POST',body:{versionId,reason}});
      state.evaluation.run=r;
      await refreshContextData();render();toast('人工方案已确认');
    }catch(e){toast(e.message)}
  };
  const dispatch=qs('#dispatchSelection'); if(dispatch) dispatch.onclick=async()=>{
    try{
      await api(`/api/evaluations/${encodeURIComponent(state.evaluation.run.id)}/dispatch`,{method:'POST',body:{}});
      await refreshContextData();render();toast('方案已正式下发');
    }catch(e){toast(e.message)}
  };
}

function bindAudit() {
  const la=qs('#loadAudit'); if(la) la.onclick=async()=>{try{await safeAudit();render();toast('审计已刷新');}catch(e){toast(e.message)}};
}

function bindChat() {
  qsa('[data-conv]').forEach(b=>b.onclick=async()=>{
    state.currentConversationId=b.dataset.conv;
    try{await loadMessages(state.currentConversationId);render();}catch(e){toast(e.message)}
  });
  const send=qs('#chatSend'); if(send) send.onclick=async()=>{
    const text=qs('#chatText').value.trim(); if(!text) return;
    try{await api(`/api/conversations/${encodeURIComponent(state.currentConversationId)}/messages`,{method:'POST',body:{content:text}});await loadMessages(state.currentConversationId);render();}catch(e){toast(e.message)}
  };
}

function createConversationDialog() {
  if(!state.token){return;}
  const names = state.seats.map(s=>`${s.id}:${s.name}`).join('\n');
  const name = prompt('会话名称：','新会话');
  if(!name) return;
  const raw = prompt(`成员席位 ID，用逗号分隔。\n可选席位：\n${names}`, state.currentSeatId);
  if(raw===null) return;
  const memberSeatIds=[...new Set(raw.split(',').map(x=>x.trim()).filter(Boolean))];
  if(!memberSeatIds.includes(state.currentSeatId)) memberSeatIds.push(state.currentSeatId);
  api('/api/conversations',{method:'POST',body:{name,kind:'group',memberSeatIds}})
    .then(async c=>{await refreshContextData();state.currentConversationId=c.id;await loadMessages(c.id);state.route='chat';render();toast('会话已创建');})
    .catch(e=>toast(e.message));
}

function loginOverlay() {
  const el=document.createElement('div');
  el.className='login-overlay';
  el.innerHTML=`<div class="login-card">
    <h2>登录智能推演平台</h2>
    <p>使用根目录业务后端账号。数据会直接进入 PostgreSQL，不再依赖 deepseek-harness。</p>
    <label class="field">用户 ID<input id="loginUser" class="input" placeholder="例如 admin"></label>
    <label class="field" style="margin-top:10px">密码<input id="loginPass" class="input" type="password" placeholder="请输入密码"></label>
    <button id="loginBtn" class="btn primary" style="width:100%;margin-top:16px">登录</button>
    <div id="loginErr" class="error-box" style="display:none;margin-top:12px"></div>
  </div>`;
  document.body.appendChild(el);
  qs('#loginBtn').onclick=async()=>{
    const b=qs('#loginBtn'); b.disabled=true; b.textContent='登录中…';
    try{await login(qs('#loginUser').value.trim(),qs('#loginPass').value);el.remove();render();}
    catch(e){const er=qs('#loginErr');er.style.display='block';er.textContent=e.message;b.disabled=false;b.textContent='登录';}
  };
  qs('#loginPass').onkeydown=e=>{if(e.key==='Enter')qs('#loginBtn').click();};
}

async function boot() {
  try {
    const h=await fetch(`${API}/api/health`).then(r=>r.json());
    if(h.status!=='ok') throw new Error('业务后端未就绪');
  } catch(e) {
    toast('8787 业务后端未启动');
  }
  if(state.token) {
    try { await loadAll(); connectWs(); }
    catch { state.token=''; localStorage.removeItem('ty.token'); }
  }
  render();
}

boot();
