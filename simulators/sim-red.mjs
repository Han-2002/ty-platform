#!/usr/bin/env node
// 红方仿真引擎（mock MCP 服务端，JSON-RPC 2.0 over stdio）
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
function ok(id, result) {
  write({ jsonrpc: '2.0', id, result });
}
function err(id, code, message) {
  write({ jsonrpc: '2.0', id, error: { code, message } });
}

function computeScore(plan) {
  const s = JSON.stringify(plan);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 40 + (h % 61); // 40..100
}

rl.on('line', (line) => {
  const l = line.trim();
  if (!l) return;
  let msg;
  try {
    msg = JSON.parse(l);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'sim-red', version: '1.0.0' },
    });
  } else if (method === 'tools/list') {
    ok(id, {
      tools: [
        {
          name: 'run_simulation',
          description: '运行推演仿真',
          inputSchema: {
            type: 'object',
            properties: {
              plan_id: { type: 'string' },
              plan_name: { type: 'string' },
              plan_content: { type: 'string' },
            },
          },
        },
      ],
    });
  } else if (method === 'tools/call') {
    const args = params?.arguments ?? {};
    const score = computeScore(args);
    const result = {
      score,
      metrics: { effectiveness: score, risk: 100 - score },
      narrative: `红方仿真：方案「${args.plan_name ?? ''}」推演得分 ${score}`,
      success: true,
    };
    ok(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
  } else if (method === 'ping') {
    ok(id, {});
  } else {
    err(id, -32601, 'Method not found');
  }
});
