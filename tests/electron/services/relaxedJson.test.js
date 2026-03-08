import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { relaxedJsonToJson, parseRelaxedJson } = require('../../../electron/services/relaxedJson');

describe('relaxedJsonToJson', () => {
  it('strips line comments starting with #', () => {
    const input = '{\n  # this is a comment\n  "key": "value"\n}';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('handles unquoted keys', () => {
    const input = '{ name: "test", value: 42 }';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual({ name: 'test', value: 42 });
  });

  it('removes trailing commas before }', () => {
    const input = '{ "a": 1, "b": 2, }';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it('removes trailing commas before ]', () => {
    const input = '[ 1, 2, 3, ]';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });

  it('handles boolean and null values', () => {
    const input = '{ enabled: true, disabled: false, data: null }';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual({ enabled: true, disabled: false, data: null });
  });

  it('converts newlines in strings to \\n', () => {
    const input = '{ "key": "line1\nline2" }';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual({ key: 'line1\nline2' });
  });

  it('preserves escaped characters in strings', () => {
    const input = '{ "key": "say \\"hello\\"" }';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual({ key: 'say "hello"' });
  });

  it('handles comments after trailing commas', () => {
    const input = '{\n  "a": 1,\n  # trailing comma above, closing below\n}';
    const result = relaxedJsonToJson(input);
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });
});

describe('parseRelaxedJson', () => {
  it('parses standard JSON without issues', () => {
    const result = parseRelaxedJson('{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  it('parses relaxed JSON with all features', () => {
    const input = `{
      # Ship data
      name: "Onslaught",
      type: "Capital Ship",
      weapons: [
        "Plasma Cannon",
        "Missile Launcher",
      ],
      isCapital: true,
    }`;
    const result = parseRelaxedJson(input);
    expect(result).toEqual({
      name: 'Onslaught',
      type: 'Capital Ship',
      weapons: ['Plasma Cannon', 'Missile Launcher'],
      isCapital: true,
    });
  });

  it('strips Java float suffix f from number literals', () => {
    const input = '{ "prob": 1f, "rate": 0.5f, "neg": -2.5f }';
    const result = parseRelaxedJson(input);
    expect(result).toEqual({ prob: 1, rate: 0.5, neg: -2.5 });
  });

  it('handles float suffix in complex Starsector faction data', () => {
    const input = `{
      id: "test",
      "aggression": 2,
      "officerSkillsShuffleProbability": 1f,
      "autofitRandomizeProbability": 0.1,
    }`;
    const result = parseRelaxedJson(input);
    expect(result.officerSkillsShuffleProbability).toBe(1);
    expect(result.autofitRandomizeProbability).toBe(0.1);
  });

  it('throws a descriptive error for invalid JSON', () => {
    expect(() => parseRelaxedJson('{invalid')).toThrow();
  });
});
