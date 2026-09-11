import { describe, it, expect } from 'vitest';
import { KnowledgeBase } from '../src/knowledge/knowledgeBase.js';
import type { KnowledgeDocument } from '../src/types.js';

const docs: KnowledgeDocument[] = [
  { id: 'd1', title: '组织规范', content: '公开的兵棋推演组织方法', clearance: 1, allow: [], deny: [] },
  { id: 'd2', title: 'OODA 方法', content: '观察判断决策行动', clearance: 2, allow: [], deny: [] },
  { id: 'd3', title: '方案拟制', content: '明确任务研判态势', clearance: 3, allow: ['director', 'staff'], deny: [] },
  { id: 'd4', title: '评估矩阵', content: '加权汇总排序', clearance: 4, allow: ['director', 'staff'], deny: [] },
  { id: 'd5', title: '核心参数', content: '绝密预置态势', clearance: 5, allow: ['director'], deny: [] },
];

describe('knowledge-base', () => {
  it('越权文档不参与检索且不出现在结果中', () => {
    const kb = new KnowledgeBase(docs);
    // 保障密级 2，检索仅命中密级 5 文档的关键词
    const result = kb.search({ id: 'support', clearance: 2 }, '绝密');
    expect(result).toEqual([]);
  });

  it('可见集内检索结果正确返回', () => {
    const kb = new KnowledgeBase(docs);
    const result = kb.search({ id: 'staff', clearance: 4 }, '评估');
    expect(result.map((d) => d.id)).toEqual(['d4']);
  });

  it('deny 优先级高于 allow', () => {
    const kb = new KnowledgeBase([
      { id: 'x', title: '冲突文档', content: '内容', clearance: 1, allow: ['staff'], deny: ['staff'] },
    ]);
    expect(kb.visibleDocuments({ id: 'staff', clearance: 5 }).map((d) => d.id)).toEqual([]);
  });

  it('同一知识库对不同角色呈现不同可见条数（总导演5/参谋4/保障2）', () => {
    const kb = new KnowledgeBase(docs);
    expect(kb.visibleCount({ id: 'director', clearance: 5 })).toBe(5);
    expect(kb.visibleCount({ id: 'staff', clearance: 4 })).toBe(4);
    expect(kb.visibleCount({ id: 'support', clearance: 2 })).toBe(2);
  });
});
