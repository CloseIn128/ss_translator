import { GlossaryManager } from '../../../electron/services/glossary';

describe('GlossaryManager', () => {
  let gm;

  beforeEach(() => {
    gm = new GlossaryManager();
  });

  describe('add', () => {
    it('adds a glossary entry and returns it with id', () => {
      const entry = gm.add({
        projectId: 'proj1',
        source: 'Hegemony',
        target: '霸主',
        category: '势力名称',
      });

      expect(entry.id).toBeDefined();
      expect(entry.source).toBe('Hegemony');
      expect(entry.target).toBe('霸主');
      expect(entry.category).toBe('势力名称');
      expect(entry.createdAt).toBeDefined();
    });

    it('defaults category to 通用', () => {
      const entry = gm.add({ projectId: 'proj1', source: 'test', target: '测试' });
      expect(entry.category).toBe('通用');
    });
  });

  describe('getAll', () => {
    it('returns empty array for unknown project', () => {
      expect(gm.getAll('unknown')).toEqual([]);
    });

    it('returns all entries for a project', () => {
      gm.add({ projectId: 'proj1', source: 'a', target: '甲' });
      gm.add({ projectId: 'proj1', source: 'b', target: '乙' });
      gm.add({ projectId: 'proj2', source: 'c', target: '丙' });

      expect(gm.getAll('proj1')).toHaveLength(2);
      expect(gm.getAll('proj2')).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('updates an existing entry', () => {
      const entry = gm.add({ projectId: 'proj1', source: 'old', target: '旧' });
      const updated = gm.update({
        projectId: 'proj1',
        id: entry.id,
        source: 'new',
        target: '新',
        category: '其他',
      });

      expect(updated.source).toBe('new');
      expect(updated.target).toBe('新');
      expect(updated.category).toBe('其他');
    });

    it('returns null for non-existent entry', () => {
      expect(gm.update({ projectId: 'proj1', id: 'fake', source: 'x', target: 'y' })).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes an existing entry', () => {
      const entry = gm.add({ projectId: 'proj1', source: 'test', target: '测试' });
      expect(gm.remove(entry.id)).toBe(true);
      expect(gm.getAll('proj1')).toHaveLength(0);
    });

    it('returns false for non-existent entry', () => {
      expect(gm.remove('fake')).toBe(false);
    });
  });

  describe('loadForProject', () => {
    it('loads entries for a project', () => {
      const entries = [
        { id: '1', source: 'a', target: '甲', category: '通用', createdAt: 1 },
      ];
      gm.loadForProject('proj1', entries);
      expect(gm.getAll('proj1')).toEqual(entries);
    });

    it('handles null/undefined entries', () => {
      gm.loadForProject('proj1', null);
      expect(gm.getAll('proj1')).toEqual([]);
    });
  });

  describe('getAsPromptText', () => {
    it('returns empty string for no entries', () => {
      expect(gm.getAsPromptText('proj1')).toBe('');
    });

    it('formats entries grouped by category', () => {
      gm.add({ projectId: 'proj1', source: 'Hegemony', target: '霸主', category: '势力名称' });
      gm.add({ projectId: 'proj1', source: 'Onslaught', target: '猛攻', category: '舰船名称' });
      const text = gm.getAsPromptText('proj1');

      expect(text).toContain('【名词对照表/术语库】');
      expect(text).toContain('[势力名称]');
      expect(text).toContain('"Hegemony" → "霸主"');
      expect(text).toContain('[舰船名称]');
      expect(text).toContain('"Onslaught" → "猛攻"');
    });
  });
});
