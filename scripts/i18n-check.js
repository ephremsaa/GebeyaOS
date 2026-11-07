const path = require('path');
const fs = require('fs');

// Simple TypeScript to object loader for locales
function loadNamespace(lang, ns) {
  const filePath = path.resolve(__dirname, `../apps/pos-web/src/i18n/locales/${lang}/${ns}.ts`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract key-value pairs using regex (supporting both unquoted and quoted keys)
  const kvRegex = /^\s*["']?([a-zA-Z0-9_]+)["']?\s*:\s*['"`]([\s\S]*?)['"`],?$/gm;
  const dict = {};
  let match;
  while ((match = kvRegex.exec(content)) !== null) {
    dict[match[1]] = match[2];
  }
  return dict;
}

const namespaces = [
  'common',
  'auth',
  'checkout',
  'shift',
  'catalog',
  'inventory',
  'stocktake',
  'purchasing',
  'reports',
  'sync',
  'staff',
  'settings',
  'errors'
];

let hasErrors = false;
console.log('--- GebeyaOS i18n Parity & Integrity Check ---');

namespaces.forEach(ns => {
  const enDict = loadNamespace('en', ns);
  const amDict = loadNamespace('am', ns);

  const enKeys = Object.keys(enDict);
  const amKeys = Object.keys(amDict);

  const missingInAm = enKeys.filter(k => !amKeys.includes(k));
  const missingInEn = amKeys.filter(k => !enKeys.includes(k));

  if (missingInAm.length > 0) {
    console.error(`❌ [${ns}] Missing Amharic keys (${missingInAm.length}):`, missingInAm);
    hasErrors = true;
  }
  if (missingInEn.length > 0) {
    console.error(`❌ [${ns}] Missing English keys (${missingInEn.length}):`, missingInEn);
    hasErrors = true;
  }

  // Check for interpolation consistency: ensure {{var}} in en also exists in am
  enKeys.forEach(k => {
    if (amDict[k]) {
      const enParams = (enDict[k].match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g) || []).sort();
      const amParams = (amDict[k].match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g) || []).sort();
      if (enParams.join(',') !== amParams.join(',')) {
        console.error(`❌ [${ns}.${k}] Interpolation mismatch: EN=[${enParams}] vs AM=[${amParams}]`);
        hasErrors = true;
      }
    }
  });

  if (missingInAm.length === 0 && missingInEn.length === 0) {
    console.log(`✅ [${ns}] Parity verified: ${enKeys.length} keys in sync.`);
  }
});

if (hasErrors) {
  console.error('\n❌ i18n:check failed with errors.');
  process.exit(1);
} else {
  console.log('\n✨ All namespaces passed i18n parity check with 100% Amharic & English coverage!');
  process.exit(0);
}

