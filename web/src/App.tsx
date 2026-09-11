import { useState } from 'react';
import {
  activities,
  conversations,
  seats,
  messages,
  approvals as initialApprovals,
  planScores,
  knowledgeItems,
  skills as initialSkills,
  mcpServices as initialMcp,
  trajectory,
  metrics,
} from './data.js';
import { ActivitySelector, Composer } from './components/ActivitySelector.js';
import { ConversationList } from './components/ConversationList.js';
import { SeatClusterView } from './components/SeatClusterView.js';
import { MessageStream } from './components/MessageStream.js';
import { ApprovalQueue } from './components/ApprovalQueue.js';
import { SimulationComparison } from './components/SimulationComparison.js';
import { KnowledgePermissionView } from './components/KnowledgePermissionView.js';
import { SkillManager } from './components/SkillManager.js';
import { McpManager } from './components/McpManager.js';
import { TrajectoryView, RuntimeMetrics } from './components/TrajectoryView.js';
import type { ApprovalItem, SkillItem, McpServiceItem } from './types.js';

export default function App() {
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialApprovals);
  const [skills, setSkills] = useState<SkillItem[]>(initialSkills);
  const [mcp, setMcp] = useState<McpServiceItem[]>(initialMcp);

  return (
    <div>
      <ActivitySelector activities={activities} selected={selectedActivity} onSelect={setSelectedActivity} />
      <Composer disabled={!selectedActivity} />
      <ConversationList conversations={conversations} />
      <SeatClusterView seats={seats} />
      <MessageStream messages={messages} />
      <ApprovalQueue
        items={approvals}
        onApprove={(id) => setApprovals((a) => a.filter((x) => x.id !== id))}
        onReject={(id) => setApprovals((a) => a.filter((x) => x.id !== id))}
      />
      <SimulationComparison plans={planScores} />
      <KnowledgePermissionView role="参谋" documents={knowledgeItems} />
      <SkillManager
        skills={skills}
        onUpload={() => {}}
        onToggle={(id) => setSkills((s) => s.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)))}
        onAssign={() => {}}
      />
      <McpManager
        services={mcp}
        onToggle={(id) => setMcp((s) => s.map((x) => (x.id === id ? { ...x, connected: !x.connected } : x)))}
      />
      <TrajectoryView steps={trajectory} />
      <RuntimeMetrics metrics={metrics} />
    </div>
  );
}
