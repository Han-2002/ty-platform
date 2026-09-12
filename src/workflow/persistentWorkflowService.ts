import type {
  WorkflowManager,
  WorkflowInstance,
  WorkflowChange,
  WorkflowChangeProposal,
} from './workflowManager.js';
import type { PostgresRepositories } from '../persistence/postgresRepositories.js';

export class PersistentWorkflowService {
  constructor(
    private readonly manager: WorkflowManager,
    private readonly repos: PostgresRepositories,
  ) {}

  async hydrate(activityId?: string): Promise<void> {
    const [workflows, proposals] = await Promise.all([
      this.repos.listWorkflows(activityId),
      this.repos.listWorkflowProposals(activityId),
    ]);

    this.manager.clearForRestore();
    for (const workflow of workflows) this.manager.restoreWorkflow(workflow);
    for (const proposal of proposals) this.manager.restoreProposal(proposal);
  }

  async createForGroup(groupId: string): Promise<WorkflowInstance> {
    const workflow = this.manager.createForGroup(groupId);
    try {
      await this.repos.saveWorkflow(workflow);
      return workflow;
    } catch (error) {
      await this.hydrate(workflow.activityId);
      throw error;
    }
  }

  async completeCurrentStep(
    workflowId: string,
    bySeatId: string,
  ): Promise<WorkflowInstance> {
    const workflow = this.manager.completeCurrentStep(workflowId, bySeatId);
    try {
      await this.repos.saveWorkflow(workflow);
      return workflow;
    } catch (error) {
      await this.hydrate(workflow.activityId);
      throw error;
    }
  }

  async proposeChange(
    workflowId: string,
    bySeatId: string,
    change: WorkflowChange,
    reason: string,
  ): Promise<WorkflowChangeProposal> {
    const proposal = this.manager.proposeChange(workflowId, bySeatId, change, reason);
    try {
      await this.repos.saveWorkflowProposal(proposal);
      return proposal;
    } catch (error) {
      const workflow = this.manager.getWorkflow(workflowId);
      await this.hydrate(workflow.activityId);
      throw error;
    }
  }

  async approveChange(
    bySeatId: string,
    proposalId: string,
  ): Promise<WorkflowChangeProposal> {
    const proposal = this.manager.approveChange(bySeatId, proposalId);
    const workflow = this.manager.getWorkflow(proposal.workflowId);
    try {
      await this.repos.saveWorkflow(workflow);
      await this.repos.saveWorkflowProposal(proposal);
      return proposal;
    } catch (error) {
      await this.hydrate(workflow.activityId);
      throw error;
    }
  }
}
