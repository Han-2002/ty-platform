import { PermissionDenied } from '../errors.js';
import type { Organization } from '../org/organization.js';

export interface ActivityTemplate {
  id: string;
  name: string;
  phases: string[];
  hierarchicalWorkflow: string[];
  peerWorkflow: string[];
  requireFinalHumanApproval: boolean;
}

export interface ActivityTemplateBinding {
  activityId: string;
  templateId: string;
  currentPhase: string;
  boundAt: number;
  boundBySeatId: string;
}

export class ActivityTemplateManager {
  private readonly templates = new Map<string, ActivityTemplate>();
  private readonly bindings = new Map<string, ActivityTemplateBinding>();

  constructor(private readonly org: Organization) {}

  registerTemplate(template: ActivityTemplate): ActivityTemplate {
    if (this.templates.has(template.id)) {
      throw new Error(`活动模板已存在: ${template.id}`);
    }
    if (template.phases.length === 0) throw new Error('活动模板至少需要一个阶段');
    const copy: ActivityTemplate = {
      ...template,
      phases: [...template.phases],
      hierarchicalWorkflow: [...template.hierarchicalWorkflow],
      peerWorkflow: [...template.peerWorkflow],
    };
    this.templates.set(copy.id, copy);
    return copy;
  }

  getTemplate(templateId: string): ActivityTemplate {
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`活动模板不存在: ${templateId}`);
    return template;
  }

  bindActivity(bySeatId: string, activityId: string, templateId: string): ActivityTemplateBinding {
    this.assertCanManage(bySeatId);
    this.org.getActivity(activityId);
    const template = this.getTemplate(templateId);

    if (this.bindings.has(activityId)) {
      throw new Error(`活动 ${activityId} 已绑定活动模板`);
    }

    const binding: ActivityTemplateBinding = {
      activityId,
      templateId,
      currentPhase: template.phases[0],
      boundAt: Date.now(),
      boundBySeatId: bySeatId,
    };
    this.bindings.set(activityId, binding);
    return binding;
  }

  templateForActivity(activityId: string): ActivityTemplate {
    const binding = this.bindingForActivity(activityId);
    return this.getTemplate(binding.templateId);
  }

  bindingForActivity(activityId: string): ActivityTemplateBinding {
    const binding = this.bindings.get(activityId);
    if (!binding) throw new Error(`活动 ${activityId} 尚未绑定模板`);
    return binding;
  }

  setPhase(bySeatId: string, activityId: string, phase: string): ActivityTemplateBinding {
    this.assertCanManage(bySeatId);
    const binding = this.bindingForActivity(activityId);
    const template = this.getTemplate(binding.templateId);
    if (!template.phases.includes(phase)) {
      throw new Error(`阶段 ${phase} 不属于活动模板 ${template.id}`);
    }
    binding.currentPhase = phase;
    return binding;
  }

  workflowForGroupMode(
    activityId: string,
    mode: 'hierarchical' | 'peer',
  ): string[] {
    const template = this.templateForActivity(activityId);
    return mode === 'hierarchical'
      ? [...template.hierarchicalWorkflow]
      : [...template.peerWorkflow];
  }

  private assertCanManage(bySeatId: string): void {
    const actor = this.org.getSeat(bySeatId);
    if (!actor.can_dispatch && !actor.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无活动配置权限`);
    }
  }
}
