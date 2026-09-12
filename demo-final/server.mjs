import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { WebSocketServer } from 'ws';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, 'public');
const PORT = Number(process.env.DEMO_PORT || 8790);
const HOST = process.env.DEMO_HOST || '127.0.0.1';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform';
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const sessions = new Map();
let runningDemo = false;
let state;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;

const roleCycle = ['staff', 'intelligence', 'operations', 'support', 'communications'];
function makeSeats() {
  const seats = [];
  seats.push({ id: 'seat-001', name: '总导演席', role: 'director', clearance: 5, groupId: null, agentStatus: 'idle', currentTask: '', memoryItems: 16, skillIds: ['task-decomposition','plan-drafting','simulation-analysis','approval-review'] });
  seats.push({ id: 'seat-002', name: 'A组组长席', role: 'leader', clearance: 4, groupId: 'group-a', agentStatus: 'idle', currentTask: '', memoryItems: 12, skillIds: ['task-decomposition','plan-drafting','risk-analysis'] });
  seats.push({ id: 'seat-003', name: 'A组情报席', role: 'intelligence', clearance: 4, groupId: 'group-a', agentStatus: 'idle', currentTask: '', memoryItems: 9, skillIds: ['intel-analysis','knowledge-search'] });
  seats.push({ id: 'seat-004', name: 'A组行动席', role: 'operations', clearance: 4, groupId: 'group-a', agentStatus: 'idle', currentTask: '', memoryItems: 8, skillIds: ['course-of-action','risk-analysis'] });
  seats.push({ id: 'seat-005', name: 'A组保障席', role: 'support', clearance: 3, groupId: 'group-a', agentStatus: 'idle', currentTask: '', memoryItems: 7, skillIds: ['resource-check','plan-drafting'] });
  seats.push({ id: 'seat-006', name: 'A组通信席', role: 'communications', clearance: 3, groupId: 'group-a', agentStatus: 'idle', currentTask: '', memoryItems: 7, skillIds: ['communication-plan','knowledge-search'] });
  seats.push({ id: 'seat-007', name: 'B组方案席', role: 'staff', clearance: 4, groupId: 'group-b', agentStatus: 'idle', currentTask: '', memoryItems: 11, skillIds: ['plan-drafting','peer-negotiation','risk-analysis'] });
  seats.push({ id: 'seat-008', name: 'B组情报席', role: 'intelligence', clearance: 4, groupId: 'group-b', agentStatus: 'idle', currentTask: '', memoryItems: 9, skillIds: ['intel-analysis','knowledge-search','peer-negotiation'] });
  seats.push({ id: 'seat-009', name: 'B组行动席', role: 'operations', clearance: 4, groupId: 'group-b', agentStatus: 'idle', currentTask: '', memoryItems: 10, skillIds: ['course-of-action','peer-negotiation'] });
  seats.push({ id: 'seat-010', name: 'B组保障席', role: 'support', clearance: 3, groupId: 'group-b', agentStatus: 'idle', currentTask: '', memoryItems: 6, skillIds: ['resource-check','peer-negotiation'] });
  seats.push({ id: 'seat-011', name: 'B组通信席', role: 'communications', clearance: 3, groupId: 'group-b', agentStatus: 'idle', currentTask: '', memoryItems: 6, skillIds: ['communication-plan','peer-negotiation'] });
  for (let i = 12; i <= 100; i++) {
    const role = roleCycle[(i - 12) % roleCycle.length];
    seats.push({
      id: `seat-${String(i).padStart(3,'0')}`,
      name: `席位${String(i).padStart(3,'0')}`,
      role,
      clearance: role === 'intelligence' || role === 'operations' ? 3 : 2,
      groupId: null,
      agentStatus: i % 9 === 0 ? 'executing' : 'idle',
      currentTask: i % 9 === 0 ? '整理活动态势摘要' : '',
      memoryItems: 3 + (i % 8),
      skillIds: role === 'intelligence' ? ['intel-analysis','knowledge-search'] : role === 'support' ? ['resource-check'] : ['knowledge-search'],
    });
  }
  return seats;
}

function baseState() {
  const seats = makeSeats();
  return {
    version: 1,
    updatedAt: now(),
    activity: {
      id: 'activity-honglan-2026',
      name: '洪兰对抗筹划活动',
      phase: '想定准备',
      status: 'ready',
      objective: '围绕既定想定形成多套候选方案，经多仿真系统验证后由人最终选择下发。',
      participants: 100,
      currentStep: 1,
      steps: ['想定准备','任务组织','席位协同','方案形成','仿真推演','人工决策','方案下发','复盘进化'],
    },
    seats,
    taskGroups: [
      { id: 'group-a', name: 'A组（层级组）', mode: 'hierarchical', leaderSeatId: 'seat-002', memberSeatIds: ['seat-002','seat-003','seat-004','seat-005','seat-006'], decisionMode: 'leader_integrate', status: 'forming' },
      { id: 'group-b', name: 'B组（平级组）', mode: 'peer', leaderSeatId: null, memberSeatIds: ['seat-007','seat-008','seat-009','seat-010','seat-011'], decisionMode: 'multi_round_negotiation', status: 'forming' },
    ],
    tasks: [],
    workflows: [],
    agentLogs: [],
    conversations: [
      { id: 'conv-director', name: '导演部活动群', type: 'activity', memberSeatIds: seats.map(s=>s.id) },
      { id: 'conv-a', name: 'A组协作群', type: 'group', memberSeatIds: ['seat-001','seat-002','seat-003','seat-004','seat-005','seat-006'] },
      { id: 'conv-b', name: 'B组协作群', type: 'group', memberSeatIds: ['seat-001','seat-007','seat-008','seat-009','seat-010','seat-011'] },
    ],
    messages: [
      { id: id('msg'), conversationId: 'conv-director', seatId: 'seat-001', sender: '总导演席', actorType: 'human', content: '活动已创建，准备进入想定与方案筹划。', at: now() },
    ],
    knowledge: [
      { id: 'kb-1', title: '兵棋推演组织规范', clearance: 1, category: '规范', summary: '活动组织、席位协同、方案提交与审批要求。' },
      { id: 'kb-2', title: 'OODA 决策循环方法', clearance: 2, category: '方法', summary: '观察、判断、决策、行动循环及席位协同应用。' },
      { id: 'kb-3', title: '对抗想定与地形资料', clearance: 3, category: '想定', summary: '本次演练的任务背景、约束、地形和初始态势。' },
      { id: 'kb-4', title: '核心推演参数', clearance: 5, category: '参数', summary: '高密级仿真参数，仅审批/高密级席位可访问。' },
      { id: 'kb-5', title: '历史活动复盘经验库', clearance: 3, category: '经验', summary: '历次活动中的方案优缺点、风险与修正经验。' },
    ],
    skills: [
      { id: 'task-decomposition', name: '任务拆解', description: '将总任务拆分为组内可执行子任务', status: 'enabled' },
      { id: 'intel-analysis', name: '态势研判', description: '从想定与知识库提取关键情报与风险', status: 'enabled' },
      { id: 'plan-drafting', name: '方案拟制', description: '根据子任务产出汇总形成候选方案', status: 'enabled' },
      { id: 'peer-negotiation', name: '多Agent协商', description: '平级组多轮协商、评分和意见收敛', status: 'enabled' },
      { id: 'simulation-analysis', name: '仿真结果分析', description: '汇总多仿真结果并形成解释性建议', status: 'enabled' },
      { id: 'risk-analysis', name: '风险分析', description: '识别关键风险、冲突与资源瓶颈', status: 'enabled' },
      { id: 'resource-check', name: '资源核验', description: '核验资源、保障与约束条件', status: 'enabled' },
      { id: 'knowledge-search', name: '知识检索', description: '按席位密级检索授权知识库', status: 'enabled' },
    ],
    permissions: {
      crossGroupDefault: 'deny',
      temporaryGrants: [],
    },
    plans: [],
    simulations: [],
    recommendation: null,
    selectedPlanId: null,
    dispatch: null,
    approvals: [],
    evolution: [],
    audit: [
      { id: id('audit'), at: now(), actor: 'system', action: 'activity.create', target: '洪兰对抗筹划活动', result: 'success' },
    ],
  };
}

function accountInfo(userId) {
  const map = {
    director: { password: 'demo123', seatId: 'seat-001', name: '导演员' },
    leaderA: { password: 'demo123', seatId: 'seat-002', name: 'A组组长' },
    intelA: { password: 'demo123', seatId: 'seat-003', name: 'A组情报员' },
    peerB: { password: 'demo123', seatId: 'seat-007', name: 'B组方案员' },
  };
  return map[userId];
}

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS demo_snapshot (
    id TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at BIGINT NOT NULL
  )`);
}
async function loadState() {
  const { rows } = await pool.query(`SELECT state FROM demo_snapshot WHERE id='main'`);
  if (rows[0]?.state) return rows[0].state;
  const fresh = baseState();
  await saveState(fresh);
  return fresh;
}
async function saveState(next = state) {
  next.updatedAt = now();
  await pool.query(`INSERT INTO demo_snapshot(id,state,updated_at) VALUES('main',$1::jsonb,$2)
    ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,updated_at=EXCLUDED.updated_at`, [JSON.stringify(next), next.updatedAt]);
}

function seat(seatId) { return state.seats.find(s => s.id === seatId); }
function group(groupId) { return state.taskGroups.find(g => g.id === groupId); }
function audit(actor, action, target, result='success', detail='') {
  state.audit.push({ id: id('audit'), at: now(), actor, action, target, result, detail });
  if (state.audit.length > 300) state.audit = state.audit.slice(-300);
}
function logAgent(seatId, action, detail, status='done') {
  const s = seat(seatId);
  state.agentLogs.push({ id: id('alog'), at: now(), seatId, seatName: s?.name ?? seatId, action, detail, status });
  if (state.agentLogs.length > 400) state.agentLogs = state.agentLogs.slice(-400);
}
function addMessage(conversationId, seatId, content, actorType='agent') {
  const s = seat(seatId);
  const msg = { id: id('msg'), conversationId, seatId, sender: s?.name ?? seatId, actorType, content, at: now() };
  state.messages.push(msg);
  return msg;
}
function broadcast(event) {
  const payload = JSON.stringify({ ...event, at: event.at ?? now() });
  for (const client of wss.clients) if (client.readyState === 1) client.send(payload);
}
async function persistAndBroadcast(type, payload={}) {
  await saveState();
  broadcast({ type, payload });
}
function setPhase(index) {
  state.activity.currentStep = index + 1;
  state.activity.phase = state.activity.steps[index];
  state.activity.status = index >= 6 ? 'completed' : 'running';
}
function resetFlow() {
  const fresh = baseState();
  // Preserve user-generated chat? For demo reset, no.
  state = fresh;
}

async function demoStep(label, fn, wait=650) {
  fn();
  audit('system', 'demo.step', label, 'success');
  await persistAndBroadcast('state.updated', { label });
  await sleep(wait);
}

async function runDemo() {
  if (runningDemo) return;
  runningDemo = true;
  try {
    resetFlow();
    await persistAndBroadcast('demo.started', {});

    await demoStep('想定准备', () => {
      setPhase(0);
      logAgent('seat-001', '读取活动想定', '加载对抗背景、约束条件、参演席位与活动流程');
      addMessage('conv-director','seat-001','系统已加载想定。请A组按层级模式、B组按平级模式分别形成候选方案。','human');
    });

    await demoStep('任务组织', () => {
      setPhase(1);
      state.taskGroups.forEach(g => g.status = 'ready');
      state.workflows = [
        { id:'wf-a', groupId:'group-a', name:'A组层级标准流程', current:0, steps:['接收任务','组长拆解','成员并行执行','组长审核','汇总方案','提交方案'], status:'running' },
        { id:'wf-b', groupId:'group-b', name:'B组平级协商流程', current:0, steps:['接收任务','Agent协商分工','成员并行执行','共享结果','多轮协商/评分','提交方案'], status:'running' },
      ];
      state.tasks = [
        {id:'task-a-intel',groupId:'group-a',seatId:'seat-003',title:'识别关键态势与威胁',status:'assigned'},
        {id:'task-a-ops',groupId:'group-a',seatId:'seat-004',title:'拟制行动路线与关键节点',status:'assigned'},
        {id:'task-a-support',groupId:'group-a',seatId:'seat-005',title:'核验保障资源与约束',status:'assigned'},
        {id:'task-a-comms',groupId:'group-a',seatId:'seat-006',title:'拟制通信协同方案',status:'assigned'},
        {id:'task-b-plan',groupId:'group-b',seatId:'seat-007',title:'提出主方案框架',status:'assigned'},
        {id:'task-b-intel',groupId:'group-b',seatId:'seat-008',title:'提出态势与风险判断',status:'assigned'},
        {id:'task-b-ops',groupId:'group-b',seatId:'seat-009',title:'提出行动方案建议',status:'assigned'},
        {id:'task-b-support',groupId:'group-b',seatId:'seat-010',title:'提出资源保障建议',status:'assigned'},
        {id:'task-b-comms',groupId:'group-b',seatId:'seat-011',title:'提出通信组织建议',status:'assigned'},
      ];
      addMessage('conv-a','seat-002','已完成任务拆解，各席位Agent按分工执行，产出后由我汇总审核。');
      addMessage('conv-b','seat-007','B组采用平级模式，先并行分析，再进行多轮协商形成统一方案。');
    });

    await demoStep('席位Agent执行', () => {
      setPhase(2);
      for (const t of state.tasks) {
        const s = seat(t.seatId);
        s.agentStatus = 'executing';
        s.currentTask = t.title;
        t.status = 'executing';
        logAgent(t.seatId, '检索知识库', `按席位密级访问授权文档，任务：${t.title}`,'running');
        logAgent(t.seatId, '调用Skill', `选择 ${s.skillIds.slice(0,2).join(' + ')} 处理任务`,'running');
      }
    });

    await demoStep('Agent产出并协同', () => {
      for (const t of state.tasks) {
        const s = seat(t.seatId);
        s.agentStatus = 'idle';
        s.currentTask = '';
        t.status = 'completed';
        t.output = `${s.name}完成：${t.title}。已形成结构化结论、风险点和建议。`;
        logAgent(t.seatId, '完成任务', t.output);
      }
      state.workflows[0].current = 4;
      state.workflows[1].current = 4;
      addMessage('conv-a','seat-003','情报分析完成：发现东侧通道风险较高，建议主攻方向避开高暴露区。');
      addMessage('conv-a','seat-004','行动方案完成：建议两阶段推进，并设置备用路线。');
      addMessage('conv-a','seat-002','已收到各席位产出，正在审核并汇总A组方案。');
      addMessage('conv-b','seat-008','我建议优先选择风险更低的中线方案。');
      addMessage('conv-b','seat-009','行动角度看中线更稳，但速度略慢。');
      addMessage('conv-b','seat-007','进入第2轮协商：安全性权重0.4、任务完成度0.35、资源消耗0.25。');
      addMessage('conv-b','seat-010','保障侧支持中线方案，资源压力最低。');
      addMessage('conv-b','seat-007','协商收敛：B组统一采用中线稳健方案。');
    });

    await demoStep('形成多套方案', () => {
      setPhase(3);
      state.taskGroups.forEach(g => g.status = 'plan_submitted');
      state.workflows.forEach(w => { w.current = w.steps.length-1; w.status = 'completed'; });
      state.plans = [
        { id:'plan-a', groupId:'group-a', name:'A组方案：快速穿插', version:1, status:'candidate', summary:'以速度和主动权为核心，两阶段快速穿插，风险较高。', authorSeatId:'seat-002' },
        { id:'plan-b', groupId:'group-b', name:'B组方案：中线稳健', version:1, status:'candidate', summary:'多Agent协商形成，兼顾安全、完成度与资源消耗。', authorSeatId:'seat-007' },
        { id:'plan-c', groupId:'group-a', name:'A组备选：侧翼牵制', version:1, status:'candidate', summary:'侧翼牵制与主方向联动，资源需求较大。', authorSeatId:'seat-002' },
      ];
      addMessage('conv-director','seat-002','A组已提交2套候选方案，请进入仿真验证。');
      addMessage('conv-director','seat-007','B组已完成多轮协商并提交中线稳健方案。');
      state.approvals.push({ id:'ap-plan', type:'plan_submission', title:'3套候选方案进入仿真', status:'approved', by:'seat-001' });
    });

    await demoStep('多仿真推演', () => {
      setPhase(4);
      state.simulations = [
        { simulatorId:'sim-red', name:'红方仿真引擎', planId:'plan-a', successRate:76, safety:61, resource:68, score:69.8, narrative:'速度优势明显，但暴露风险偏高。' },
        { simulatorId:'sim-blue', name:'蓝方仿真引擎', planId:'plan-a', successRate:73, safety:58, resource:71, score:67.4, narrative:'对手反制后稳定性下降。' },
        { simulatorId:'sim-joint', name:'联合评估系统', planId:'plan-a', successRate:74, safety:62, resource:65, score:68.2, narrative:'总体可行，风险容忍度要求高。' },
        { simulatorId:'sim-red', name:'红方仿真引擎', planId:'plan-b', successRate:84, safety:86, resource:82, score:84.2, narrative:'任务完成度高且波动较小。' },
        { simulatorId:'sim-blue', name:'蓝方仿真引擎', planId:'plan-b', successRate:81, safety:88, resource:84, score:84.1, narrative:'面对反制仍保持较高稳定性。' },
        { simulatorId:'sim-joint', name:'联合评估系统', planId:'plan-b', successRate:83, safety:85, resource:86, score:84.4, narrative:'综合指标最优，推荐。' },
        { simulatorId:'sim-red', name:'红方仿真引擎', planId:'plan-c', successRate:79, safety:70, resource:55, score:68.8, narrative:'牵制效果好，但资源代价较大。' },
        { simulatorId:'sim-blue', name:'蓝方仿真引擎', planId:'plan-c', successRate:77, safety:73, resource:52, score:67.3, narrative:'资源约束下持续性不足。' },
        { simulatorId:'sim-joint', name:'联合评估系统', planId:'plan-c', successRate:78, safety:72, resource:57, score:69.0, narrative:'可作为备选，但不建议主选。' },
      ];
      const avg = planId => {
        const xs = state.simulations.filter(x => x.planId === planId);
        return Math.round(xs.reduce((a,b)=>a+b.score,0)/xs.length*10)/10;
      };
      state.plans.forEach(p => p.aggregateScore = avg(p.id));
      state.recommendation = { planId:'plan-b', reason:'三套仿真系统均表现稳定；安全性、任务完成度和资源消耗综合最优。', confidence:0.89 };
      state.approvals.push({ id:'ap-select', type:'final_selection', title:'最终方案选择', status:'waiting_human', recommendedPlanId:'plan-b' });
      logAgent('seat-001','分析仿真结果','对3套方案×3套仿真系统进行加权汇总，推荐B组方案。');
      addMessage('conv-director','seat-001','仿真完成。系统推荐B组“中线稳健”方案，等待人工最终确认。');
    });

    await demoStep('等待人工决策', () => {
      setPhase(5);
      state.activity.status = 'waiting_human';
    }, 100);
  } finally {
    runningDemo = false;
  }
}

async function simulateSingleAgent(seatId) {
  const s = seat(seatId);
  if (!s) throw new Error('席位不存在');
  s.agentStatus = 'executing';
  s.currentTask = s.currentTask || '主动整理本席位重要信息';
  logAgent(seatId,'主动整理','Agent检测到空闲，开始整理活动态势与待办。','running');
  await persistAndBroadcast('agent.updated',{seatId});
  await sleep(550);
  logAgent(seatId,'检索知识库',`按密级${s.clearance}检索可见知识，并结合记忆${s.memoryItems}条。`,'running');
  await persistAndBroadcast('agent.updated',{seatId});
  await sleep(550);
  s.agentStatus = 'idle'; s.currentTask='';
  logAgent(seatId,'主动推送','发现1条重要信息：当前活动存在待确认方案或流程节点。');
  addMessage('conv-director',seatId,`主动提示：${s.name}已完成空闲整理，发现当前活动有待处理流程节点。`);
  await persistAndBroadcast('agent.completed',{seatId});
}

async function handleApi(req,res,url) {
  const json = (code,data) => { const text=JSON.stringify(data); res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(text); };
  const readBody = async () => { let raw=''; for await (const c of req) { raw += c; if (raw.length>2_000_000) throw new Error('请求过大'); } return raw ? JSON.parse(raw) : {}; };
  const token = (req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const session = sessions.get(token);
  const requireAuth = () => { if (!session) { const e=new Error('未登录或Session已失效'); e.status=401; throw e; } return session; };

  if (req.method==='GET' && url.pathname==='/api/health') return json(200,{status:'ok',database:'connected',demo:'complete-v1',wsClients:wss.clients.size});
  if (req.method==='POST' && url.pathname==='/api/login') {
    const b=await readBody(); const info=accountInfo(b.userId);
    if (!info || b.password!==info.password) return json(401,{error:'用户名或密码错误'});
    const t=randomBytes(24).toString('base64url'); sessions.set(t,{userId:b.userId,...info,createdAt:now()});
    return json(200,{token:t,userId:b.userId,name:info.name,seatId:info.seatId});
  }
  if (req.method==='POST' && url.pathname==='/api/logout') { if(token) sessions.delete(token); return json(200,{ok:true}); }

  const me=requireAuth();
  if (req.method==='GET' && url.pathname==='/api/me') return json(200,{...me,password:undefined});
  if (req.method==='GET' && url.pathname==='/api/state') return json(200,state);
  if (req.method==='POST' && url.pathname==='/api/reset') { resetFlow(); await persistAndBroadcast('state.reset',{}); return json(200,{ok:true}); }
  if (req.method==='POST' && url.pathname==='/api/demo/run') { if(runningDemo) return json(409,{error:'演示正在运行'}); runDemo(); return json(202,{ok:true}); }
  if (req.method==='POST' && url.pathname==='/api/chat') {
    const b=await readBody(); const s=seat(me.seatId); const conv=state.conversations.find(c=>c.id===b.conversationId);
    if(!conv || !conv.memberSeatIds.includes(me.seatId)) { const e=new Error('当前席位不属于该会话'); e.status=403; throw e; }
    const msg=addMessage(b.conversationId,me.seatId,String(b.content||'').slice(0,5000),'human');
    audit(me.seatId,'chat.send',b.conversationId,'success'); await persistAndBroadcast('chat.message',{message:msg}); return json(201,msg);
  }
  if (req.method==='POST' && url.pathname==='/api/agent/run') {
    const b=await readBody(); const target=String(b.seatId||me.seatId);
    if(me.seatId!=='seat-001' && target!==me.seatId) { const e=new Error('只能运行本席位Agent'); e.status=403; throw e; }
    simulateSingleAgent(target); return json(202,{ok:true,seatId:target});
  }
  if (req.method==='POST' && url.pathname==='/api/permission/grant') {
    if(me.seatId!=='seat-001') { const e=new Error('只有总导演席可以签发临时跨组授权'); e.status=403; throw e; }
    const b=await readBody(); const grant={id:id('grant'),fromGroupId:b.fromGroupId,toGroupId:b.toGroupId,expiresAt:now()+30*60_000,issuedBy:me.seatId,reason:b.reason||'临时协同'};
    state.permissions.temporaryGrants.push(grant); audit(me.seatId,'permission.grant','cross_group','success',grant.reason); await persistAndBroadcast('permission.granted',{grant}); return json(201,grant);
  }
  if (req.method==='POST' && url.pathname==='/api/plan/select') {
    if(me.seatId!=='seat-001') { const e=new Error('最终方案必须由总导演席人工确认'); e.status=403; throw e; }
    const b=await readBody(); const p=state.plans.find(x=>x.id===b.planId); if(!p) throw new Error('方案不存在');
    state.selectedPlanId=p.id; state.plans.forEach(x=>x.status=x.id===p.id?'selected':'evaluated');
    state.approvals=state.approvals.map(a=>a.id==='ap-select'?{...a,status:'approved',selectedPlanId:p.id,approvedBy:me.seatId}:a);
    setPhase(6); state.activity.status='dispatched'; state.dispatch={planId:p.id,planName:p.name,at:now(),by:me.seatId,status:'issued'};
    addMessage('conv-director',me.seatId,`人工确认：选定“${p.name}”作为最终方案，现已下发。`,'human');
    audit(me.seatId,'plan.select_and_dispatch',p.id,'success',b.reason||'人工最终确认');
    // evolution suggestion after dispatch
    state.evolution=[
      {id:'evo-1',type:'skill',title:'建议增强平级组协商Skill',reason:'B组多轮协商后的方案在3套仿真中稳定性最好。',status:'pending_human'},
      {id:'evo-2',type:'workflow',title:'建议在层级组增加“风险复核”步骤',reason:'A组快速方案在仿真中暴露风险偏高。',status:'pending_human'},
    ];
    setPhase(7); await persistAndBroadcast('plan.dispatched',{planId:p.id}); return json(200,state.dispatch);
  }
  if (req.method==='POST' && url.pathname==='/api/evolution/approve') {
    if(me.seatId!=='seat-001') { const e=new Error('进化建议需要人工审批'); e.status=403; throw e; }
    const b=await readBody(); const item=state.evolution.find(x=>x.id===b.id); if(!item) throw new Error('建议不存在'); item.status='approved'; item.approvedBy=me.seatId; item.approvedAt=now();
    audit(me.seatId,'evolution.approve',item.id,'success'); await persistAndBroadcast('evolution.approved',{id:item.id}); return json(200,item);
  }
  json(404,{error:'NOT_FOUND'});
}

const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
const server = http.createServer(async (req,res) => {
  try {
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname.startsWith('/api/')) return await handleApi(req,res,url);
    let rel=url.pathname==='/'?'index.html':url.pathname.replace(/^\//,'');
    if(rel.includes('..')) { res.writeHead(400); return res.end('bad path'); }
    try { const file=await readFile(join(publicDir,rel)); res.writeHead(200,{'content-type':mime[extname(rel)]||'application/octet-stream','cache-control':'no-store'}); res.end(file); }
    catch { const file=await readFile(join(publicDir,'index.html')); res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); res.end(file); }
  } catch(e) { res.writeHead(e.status||500,{'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify({error:e.message})); }
});
const wss = new WebSocketServer({server,path:'/ws'});
wss.on('connection',(ws,req)=>{ const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const token=url.searchParams.get('token'); if(!sessions.has(token)){ws.close(1008,'unauthorized');return;} ws.send(JSON.stringify({type:'connected',at:now()})); });

async function main(){
  await pool.query('SELECT 1'); await migrate(); state=await loadState();
  server.listen(PORT,HOST,()=>{
    console.log(''); console.log('TY Platform Complete Demo V1');
    console.log(`Demo: http://${HOST}:${PORT}`);
    console.log(`Health: http://${HOST}:${PORT}/api/health`);
    console.log('Accounts: director / leaderA / intelA / peerB');
    console.log('Password: demo123'); console.log('');
  });
}
main().catch(e=>{console.error('启动失败:',e);process.exit(1);});
process.on('SIGINT',async()=>{try{await saveState();await pool.end();}finally{process.exit(0);}});
