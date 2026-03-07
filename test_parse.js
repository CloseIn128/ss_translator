const path = require('path');
const { parseModFolder } = require('./electron/services/modParser');

const modPath = path.resolve(__dirname, 'example/Volantian-Starsector-Mod-0.6.3b');

parseModFolder(modPath).then(r => {
  console.log('=== Mod Parser Test ===');
  console.log('Mod:', r.modInfo.name, 'v' + r.modInfo.version);
  console.log('Total entries:', r.entries.length);
  console.log('');

  // Stats by type
  console.log('--- By type ---');
  for (const [type, stats] of Object.entries(r.stats.byType)) {
    console.log('  ' + type + ': ' + stats.total);
  }

  // Show some samples
  console.log('');
  console.log('--- Sample entries ---');
  const samples = r.entries.filter(e => e.original.length > 20).slice(0, 5);
  for (const s of samples) {
    console.log('  [' + s.context + ']');
    console.log('  ' + s.original.slice(0, 100) + (s.original.length > 100 ? '...' : ''));
    console.log('');
  }

  console.log('=== Test PASSED ===');
}).catch(e => {
  console.error('=== Test FAILED ===');
  console.error(e);
  process.exit(1);
});

