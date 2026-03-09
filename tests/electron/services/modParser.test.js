import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const { parseModFolder } = require('../../../electron/services/modParser');

// Helper to create a temporary mod folder with specific files
function createTempMod(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modparser-test-'));
  // Always create mod_info.json
  if (!files['mod_info.json']) {
    files['mod_info.json'] = JSON.stringify({
      id: 'test_mod', name: 'Test Mod', version: '1.0',
      description: 'A test mod', gameVersion: '0.97',
    });
  }
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');
  }
  return tmpDir;
}

function cleanupTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('parseModFolder', () => {
  describe('mod_info.json', () => {
    it('extracts name and description from mod_info.json', async () => {
      const dir = createTempMod({
        'mod_info.json': JSON.stringify({
          id: 'test', name: 'My Mod', version: '1.0',
          description: 'A great mod', gameVersion: '0.97',
        }),
      });
      try {
        const result = await parseModFolder(dir);
        const nameEntry = result.entries.find(e => e.id === 'mod_info::name');
        const descEntry = result.entries.find(e => e.id === 'mod_info::description');
        expect(nameEntry).toBeDefined();
        expect(nameEntry.original).toBe('My Mod');
        expect(descEntry).toBeDefined();
        expect(descEntry.original).toBe('A great mod');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('CSV parsing', () => {
    it('parses abilities.csv', async () => {
      const csv = 'name,id,desc\nTransponder,transponder,Broadcast identity\n';
      const dir = createTempMod({ 'campaign/abilities.csv': csv });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '能力');
        expect(entries.length).toBe(2);
        expect(entries.find(e => e.field === 'name').original).toBe('Transponder');
        expect(entries.find(e => e.field === 'desc').original).toBe('Broadcast identity');
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses submarkets.csv', async () => {
      const csv = 'id,name,desc\nopen_market,Open Market,The open market\n';
      const dir = createTempMod({ 'campaign/submarkets.csv': csv });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '子市场');
        expect(entries.length).toBe(2);
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses personalities.csv', async () => {
      const csv = 'id,name,desc\ntimid,Timid,Avoids combat\n';
      const dir = createTempMod({ 'characters/personalities.csv': csv });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '性格');
        expect(entries.length).toBe(2);
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses skill_data.csv with name, description and author', async () => {
      const csv = 'id,name,description,author\nhelm,Helmsmanship,A great skill,Someone\n';
      const dir = createTempMod({ 'characters/skills/skill_data.csv': csv });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '技能' && e.csvFileName === 'skill_data.csv');
        expect(entries.length).toBe(3);
        expect(entries.find(e => e.field === 'name').original).toBe('Helmsmanship');
        expect(entries.find(e => e.field === 'description').original).toBe('A great skill');
        expect(entries.find(e => e.field === 'author').original).toBe('Someone');
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses aptitude_data.csv', async () => {
      const csv = 'id,name,description\ncombat,Combat,Improves combat\n';
      const dir = createTempMod({ 'characters/skills/aptitude_data.csv': csv });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '能力分支');
        expect(entries.length).toBe(2);
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses ship_systems.csv', async () => {
      const csv = 'name,id\nFlare Launcher,flarelauncher\n';
      const dir = createTempMod({ 'shipsystems/ship_systems.csv': csv });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '舰船系统');
        expect(entries.length).toBe(1);
        expect(entries[0].original).toBe('Flare Launcher');
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses reports.csv with event_type as ID', async () => {
      const csv = 'event_type,event_stage,subject,summary,assessment\nfood_shortage,possible,Food shortage,Analysis suggests shortage,Increased prices\n';
      const dir = createTempMod({ 'campaign/reports.csv': csv });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '事件报告');
        expect(entries.length).toBe(3);
        expect(entries[0].rowId).toBe('food_shortage');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('JSON config file parsing', () => {
    it('parses planets.json with name field', async () => {
      const json = JSON.stringify({
        nebula_center: { name: 'Nebula', tilt: 0 },
        star_yellow: { name: 'Yellow Star', rotation: 1 },
      });
      const dir = createTempMod({ 'config/planets.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '星球类型');
        expect(entries.length).toBe(2);
        expect(entries.find(e => e.objectKey === 'nebula_center').original).toBe('Nebula');
        expect(entries.find(e => e.objectKey === 'star_yellow').original).toBe('Yellow Star');
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses battle_objectives.json', async () => {
      const json = JSON.stringify({
        nav_buoy: { name: 'Nav Buoy', captureTime: 10 },
      });
      const dir = createTempMod({ 'config/battle_objectives.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '战斗目标');
        expect(entries.length).toBe(1);
        expect(entries[0].original).toBe('Nav Buoy');
      } finally {
        cleanupTempDir(dir);
      }
    });

    it('parses custom_entities.json with multiple fields', async () => {
      const json = JSON.stringify({
        comm_relay: {
          defaultName: 'Comm Relay',
          nameInText: 'comm relay',
          shortName: 'relay',
          aOrAn: 'a',
          isOrAre: 'is',
        },
      });
      const dir = createTempMod({ 'config/custom_entities.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '自定义实体');
        expect(entries.length).toBe(5);
        expect(entries.find(e => e.field === 'defaultName').original).toBe('Comm Relay');
        expect(entries.find(e => e.field === 'nameInText').original).toBe('comm relay');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('JSON flat string map parsing', () => {
    it('parses default_fleet_type_names.json', async () => {
      const json = JSON.stringify({
        trade: 'Mercantile Convoy',
        patrolSmall: 'Fast Picket',
      });
      const dir = createTempMod({ 'world/factions/default_fleet_type_names.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '舰队类型');
        expect(entries.length).toBe(2);
        expect(entries.find(e => e.field === 'trade').original).toBe('Mercantile Convoy');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('default_ranks.json parsing', () => {
    it('parses ranks and posts sections', async () => {
      const json = JSON.stringify({
        ranks: {
          factionLeader: { name: 'High Commander' },
          spaceSailor: { name: 'Spacer' },
        },
        posts: {
          patrolCommander: { name: 'Patrol Commander' },
        },
      });
      const dir = createTempMod({ 'world/factions/default_ranks.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '军衔');
        expect(entries.length).toBe(3);
        expect(entries.find(e => e.objectKey === 'factionLeader').original).toBe('High Commander');
        expect(entries.find(e => e.section === 'posts').original).toBe('Patrol Commander');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('strings.json deep parsing', () => {
    it('extracts nested string values', async () => {
      const json = JSON.stringify({
        fleetInteractionDialog: {
          initialAggressive: 'The fleet maneuvers to prevent disengaging.',
          nested: {
            deep: 'Deep nested value',
          },
        },
      });
      const dir = createTempMod({ 'strings/strings.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === 'UI字符串');
        expect(entries.length).toBe(2);
        expect(entries.find(e => e.field === 'fleetInteractionDialog.initialAggressive')).toBeDefined();
        expect(entries.find(e => e.field === 'fleetInteractionDialog.nested.deep')).toBeDefined();
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('tooltips.json parsing', () => {
    it('extracts title and body from tooltip objects', async () => {
      const json = JSON.stringify({
        codex: {
          damage_kinetic: {
            title: 'Kinetic Damage',
            body: 'Great against shields.',
          },
        },
      });
      const dir = createTempMod({ 'strings/tooltips.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '提示信息');
        expect(entries.length).toBe(2);
        expect(entries.find(e => e.field === 'codex.damage_kinetic.title').original).toBe('Kinetic Damage');
        expect(entries.find(e => e.field === 'codex.damage_kinetic.body').original).toBe('Great against shields.');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('mission descriptor parsing', () => {
    it('extracts title and difficulty from descriptor.json', async () => {
      const json = JSON.stringify({
        title: 'Ambush',
        difficulty: 'MEDIUM',
        icon: 'icon.jpg',
      });
      const dir = createTempMod({ 'missions/ambush/descriptor.json': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '任务');
        expect(entries.length).toBe(2);
        expect(entries.find(e => e.field === 'title').original).toBe('Ambush');
        expect(entries.find(e => e.field === 'difficulty').original).toBe('MEDIUM');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('.skill file parsing', () => {
    it('extracts name from effectGroups', async () => {
      const json = JSON.stringify({
        id: 'helmsmanship',
        effectGroups: [
          { requiredSkillLevel: 1, effects: [] },
          { name: 'Elite', requiredSkillLevel: 2, effects: [] },
        ],
      });
      const dir = createTempMod({ 'characters/skills/helmsmanship.skill': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.fileType === 'json_skill');
        expect(entries.length).toBe(1);
        expect(entries[0].original).toBe('Elite');
        expect(entries[0].arrayIndex).toBe(1);
      } finally {
        cleanupTempDir(dir);
      }
    });
  });

  describe('.variant file parsing', () => {
    it('extracts displayName from variant files', async () => {
      const json = JSON.stringify({
        displayName: 'Elite',
        hullId: 'paragon',
        fluxCapacitors: 35,
      });
      const dir = createTempMod({ 'variants/paragon/paragon_Elite.variant': json });
      try {
        const result = await parseModFolder(dir);
        const entries = result.entries.filter(e => e.category === '变体');
        expect(entries.length).toBe(1);
        expect(entries[0].original).toBe('Elite');
      } finally {
        cleanupTempDir(dir);
      }
    });
  });
});
