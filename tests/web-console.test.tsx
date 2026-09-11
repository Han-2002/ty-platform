// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../web/src/App.js';
import { ConversationList } from '../web/src/components/ConversationList.js';
import { SeatClusterView } from '../web/src/components/SeatClusterView.js';
import { MessageStream } from '../web/src/components/MessageStream.js';
import { ApprovalQueue } from '../web/src/components/ApprovalQueue.js';
import { SimulationComparison } from '../web/src/components/SimulationComparison.js';
import { KnowledgePermissionView } from '../web/src/components/KnowledgePermissionView.js';
import { SkillManager } from '../web/src/components/SkillManager.js';
import { McpManager } from '../web/src/components/McpManager.js';
import { TrajectoryView, RuntimeMetrics } from '../web/src/components/TrajectoryView.js';
import {
  conversations,
  seats,
  messages,
  approvals,
  planScores,
  knowledgeItems,
  skills,
  mcpServices,
  trajectory,
  metrics,
} from '../web/src/data.js';

describe('web-console', () => {
  it('未选活动时输入不可用，选中后可用', () => {
    render(<App />);
    const composer = screen.getByTestId('composer') as HTMLTextAreaElement;
    expect(composer).toBeDisabled();
    fireEvent.change(screen.getByTestId('activity-select'), { target: { value: 'act-blue' } });
    expect(composer).not.toBeDisabled();
  });

  it('会话列表区分群聊与直达', () => {
    const { container } = render(<ConversationList conversations={conversations} />);
    expect(container.querySelectorAll('[data-type=group]').length).toBe(2);
    expect(container.querySelectorAll('[data-type=direct]').length).toBe(1);
  });

  it('席位集群视图展示空闲/执行中/待审', () => {
    const { container } = render(<SeatClusterView seats={seats} />);
    expect(container.querySelector('[data-status=idle]')).not.toBeNull();
    expect(container.querySelector('[data-status=executing]')).not.toBeNull();
    expect(container.querySelector('[data-status=waiting_approval]')).not.toBeNull();
  });

  it('协同消息流按类型区分（指令/汇报/主动提示）', () => {
    const { container } = render(<MessageStream messages={messages} />);
    expect(container.querySelectorAll('[data-type=instruction]').length).toBe(1);
    expect(container.querySelectorAll('[data-type=report]').length).toBe(1);
    expect(container.querySelectorAll('[data-type=proactive]').length).toBe(1);
  });

  it('人工审核队列支持通过与打回', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<ApprovalQueue items={approvals} onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByTestId('approve-a1'));
    fireEvent.click(screen.getByTestId('reject-a2'));
    expect(onApprove).toHaveBeenCalledWith('a1');
    expect(onReject).toHaveBeenCalledWith('a2');
  });

  it('审核通过使产出从待审队列移除', () => {
    render(<App />);
    expect(screen.getByTestId('approval-a1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('approve-a1'));
    expect(screen.queryByTestId('approval-a1')).toBeNull();
  });

  it('方案推演对比呈现多仿真评分与择优', () => {
    render(<SimulationComparison plans={planScores} />);
    expect(screen.getByTestId('plan-p1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('weighted-p1')).toHaveTextContent('74');
    expect(screen.getByText(/择优/)).toBeInTheDocument();
  });

  it('越权文档在知识库视图中被屏蔽', () => {
    render(<KnowledgePermissionView role="参谋" documents={knowledgeItems} />);
    expect(screen.getByTestId('knowledge-d1')).toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-d3')).toBeNull();
  });

  it('Skill 管理支持上传/启停/角色装配', () => {
    const onUpload = vi.fn();
    const onToggle = vi.fn();
    const onAssign = vi.fn();
    render(<SkillManager skills={skills} onUpload={onUpload} onToggle={onToggle} onAssign={onAssign} />);
    fireEvent.click(screen.getByTestId('skill-upload'));
    fireEvent.click(screen.getByTestId('toggle-sk2'));
    fireEvent.click(screen.getByTestId('assign-sk1'));
    expect(onUpload).toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledWith('sk2');
    expect(onAssign).toHaveBeenCalledWith('sk1');
  });

  it('MCP 服务显示连接状态且可启停', () => {
    const onToggle = vi.fn();
    const { container } = render(<McpManager services={mcpServices} onToggle={onToggle} />);
    expect(container.querySelector('[data-connected=false]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('mcp-toggle-sim-blue'));
    expect(onToggle).toHaveBeenCalledWith('sim-blue');
  });

  it('执行轨迹被呈现', () => {
    render(<TrajectoryView steps={trajectory} />);
    expect(screen.getByTestId('trajectory-view').children.length).toBe(4);
  });

  it('运行时指标被呈现（turns/steps/TTFT/tokens/上下文占用）', () => {
    render(<RuntimeMetrics metrics={metrics} />);
    expect(screen.getByTestId('metric-turns')).toHaveTextContent('4');
    expect(screen.getByTestId('metric-steps')).toHaveTextContent('12');
    expect(screen.getByTestId('metric-ttft')).toHaveTextContent('320');
    expect(screen.getByTestId('metric-tokens')).toHaveTextContent('4821');
    expect(screen.getByTestId('metric-context')).toHaveTextContent('0.42');
  });
});
