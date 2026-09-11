import type { SkillItem } from '../types.js';

export function SkillManager({
  skills,
  onUpload,
  onToggle,
  onAssign,
}: {
  skills: SkillItem[];
  onUpload: () => void;
  onToggle: (id: string) => void;
  onAssign: (id: string) => void;
}) {
  return (
    <div data-testid="skill-manager">
      <button data-testid="skill-upload" onClick={onUpload}>
        上传技能包
      </button>
      <ul>
        {skills.map((s) => (
          <li key={s.id} data-testid={`skill-${s.id}`}>
            <span>
              {s.name} [{s.enabled ? '启用' : '停用'}]
            </span>
            <button data-testid={`toggle-${s.id}`} onClick={() => onToggle(s.id)}>
              {s.enabled ? '停用' : '启用'}
            </button>
            <button data-testid={`assign-${s.id}`} onClick={() => onAssign(s.id)}>
              角色装配
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
