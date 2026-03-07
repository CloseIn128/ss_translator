import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { LegacyTranslationService } = require('../../../electron/services/legacyTranslation');

describe('LegacyTranslationService', () => {
  let service;

  beforeEach(() => {
    service = new LegacyTranslationService();
  });

  describe('initial state', () => {
    it('has no legacy data initially', () => {
      expect(service.getLegacyInfo()).toBeNull();
      expect(service.getLegacyEntries()).toEqual([]);
    });
  });

  describe('matchEntries', () => {
    it('returns all entries as unmatched when no legacy data is loaded', () => {
      const newEntries = [
        { id: 'file.csv::ship1::name', original: 'Aurora', context: 'ship_data.csv' },
      ];
      const result = service.matchEntries(newEntries);
      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].entryId).toBe('file.csv::ship1::name');
    });

    it('matches entries by exact ID', () => {
      // Manually load legacy entries
      service.legacyEntries = [
        { id: 'data/hulls/ship_data.csv::aurora::name', file: 'data/hulls/ship_data.csv', original: '极光号', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv', context: 'ship_data.csv - name' },
      ];
      service.legacyModPath = '/test/legacy';
      service.legacyModInfo = { name: 'TestMod', version: '1.0' };

      const newEntries = [
        { id: 'data/hulls/ship_data.csv::aurora::name', file: 'data/hulls/ship_data.csv', original: 'Aurora', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv', context: 'ship_data.csv - name' },
      ];

      const result = service.matchEntries(newEntries);
      expect(result.matches).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
      expect(result.matches[0].matchType).toBe('exact');
      expect(result.matches[0].legacyText).toBe('极光号');
      expect(result.matches[0].entryId).toBe('data/hulls/ship_data.csv::aurora::name');
    });

    it('matches entries by structural key (different path, same rowId+field)', () => {
      service.legacyEntries = [
        { id: 'old_path/ship_data.csv::aurora::name', file: 'old_path/ship_data.csv', original: '极光号', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];
      service.legacyModPath = '/test/legacy';

      const newEntries = [
        { id: 'new_path/ship_data.csv::aurora::name', file: 'new_path/ship_data.csv', original: 'Aurora', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];

      const result = service.matchEntries(newEntries);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchType).toBe('structural');
      expect(result.matches[0].legacyText).toBe('极光号');
    });

    it('matches JSON entries by file basename + field', () => {
      service.legacyEntries = [
        { id: 'old/hulls/aurora.ship::aurora::hullName', file: 'old/hulls/aurora.ship', original: '极光号', field: 'hullName', fileType: 'json' },
      ];
      service.legacyModPath = '/test/legacy';

      const newEntries = [
        { id: 'new/hulls/aurora.ship::aurora::hullName', file: 'new/hulls/aurora.ship', original: 'Aurora', field: 'hullName', fileType: 'json' },
      ];

      const result = service.matchEntries(newEntries);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchType).toBe('structural');
      expect(result.matches[0].legacyText).toBe('极光号');
    });

    it('separates matched and unmatched entries correctly', () => {
      service.legacyEntries = [
        { id: 'data/ship_data.csv::aurora::name', file: 'data/ship_data.csv', original: '极光号', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
        { id: 'data/ship_data.csv::omen::name', file: 'data/ship_data.csv', original: '预兆号', field: 'name', rowId: 'omen', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];
      service.legacyModPath = '/test/legacy';

      const newEntries = [
        { id: 'data/ship_data.csv::aurora::name', file: 'data/ship_data.csv', original: 'Aurora', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
        { id: 'data/ship_data.csv::paragon::name', file: 'data/ship_data.csv', original: 'Paragon', field: 'name', rowId: 'paragon', csvFileName: 'ship_data.csv', fileType: 'csv' },
        { id: 'data/ship_data.csv::omen::name', file: 'data/ship_data.csv', original: 'Omen', field: 'name', rowId: 'omen', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];

      const result = service.matchEntries(newEntries);
      expect(result.matches).toHaveLength(2);
      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].entryId).toBe('data/ship_data.csv::paragon::name');
    });

    it('prefers exact match over structural match', () => {
      service.legacyEntries = [
        { id: 'data/ship_data.csv::aurora::name', file: 'data/ship_data.csv', original: '极光号(精确)', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];
      service.legacyModPath = '/test/legacy';

      const newEntries = [
        { id: 'data/ship_data.csv::aurora::name', file: 'data/ship_data.csv', original: 'Aurora', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];

      const result = service.matchEntries(newEntries);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchType).toBe('exact');
      expect(result.matches[0].legacyText).toBe('极光号(精确)');
    });

    it('handles empty legacy entries with original field', () => {
      service.legacyEntries = [
        { id: 'data/ship_data.csv::aurora::name', file: 'data/ship_data.csv', original: '', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];
      service.legacyModPath = '/test/legacy';

      const newEntries = [
        { id: 'data/ship_data.csv::aurora::name', file: 'data/ship_data.csv', original: 'Aurora', field: 'name', rowId: 'aurora', csvFileName: 'ship_data.csv', fileType: 'csv' },
      ];

      const result = service.matchEntries(newEntries);
      // Empty original should not match
      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toHaveLength(1);
    });
  });

  describe('getLegacyInfo', () => {
    it('returns info after manually setting data', () => {
      service.legacyModPath = '/test/mod';
      service.legacyModInfo = { name: 'TestMod', version: '2.0' };
      service.legacyEntries = [{ id: 'test', original: '测试' }];

      const info = service.getLegacyInfo();
      expect(info.modPath).toBe('/test/mod');
      expect(info.modInfo.name).toBe('TestMod');
      expect(info.entryCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('clears all loaded data', () => {
      service.legacyModPath = '/test/mod';
      service.legacyModInfo = { name: 'Test' };
      service.legacyEntries = [{ id: 'test' }];

      service.clear();
      expect(service.getLegacyInfo()).toBeNull();
      expect(service.getLegacyEntries()).toEqual([]);
    });
  });
});
