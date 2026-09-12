import type { TaskGroupManager, CreateTaskGroupInput } from './taskGroupManager.js';
import type { TaskGroup } from '../types.js';
import type { PostgresRepositories } from '../persistence/postgresRepositories.js';

export class PersistentTaskGroupService {
  constructor(
    private readonly manager: TaskGroupManager,
    private readonly repos: PostgresRepositories,
  ) {}

  async hydrate(activityId?: string): Promise<void> {
    const groups = await this.repos.listTaskGroups(activityId);
    this.manager.clearForRestore();
    for (const group of groups) this.manager.restoreGroup(group);
  }

  async createGroup(
    bySeatId: string,
    input: CreateTaskGroupInput,
  ): Promise<TaskGroup> {
    const group = this.manager.createGroup(bySeatId, input);
    try {
      await this.repos.saveTaskGroup(group);
      return group;
    } catch (error) {
      await this.hydrate(input.activityId);
      throw error;
    }
  }

  async save(groupId: string): Promise<TaskGroup> {
    const group = this.manager.getGroup(groupId);
    await this.repos.saveTaskGroup(group);
    return group;
  }
}
