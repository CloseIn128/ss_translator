import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { v4 } = require('../../../electron/services/uuid');

describe('uuid', () => {
  it('generates a valid v4 UUID string', () => {
    const id = v4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => v4()));
    expect(ids.size).toBe(100);
  });
});
