const assert = require('assert');

// Test formatMoney
const { formatMoney } = require('../packages/shared-types/dist/money-formatter');
assert.strictEqual(formatMoney(12500, 'en'), '12,500.00 ETB');
assert.strictEqual(formatMoney(12500, 'am'), '12,500.00 ብር');
assert.strictEqual(formatMoney(0, 'am'), '0.00 ብር');
assert.strictEqual(formatMoney(-500.5, 'en'), '-500.50 ETB');
console.log('✅ formatMoney tests passed.');

// Test Ethiopian Calendar Intl formatting
const testDate = new Date('2026-11-07T06:30:00Z');
const etFormatter = new Intl.DateTimeFormat('am-ET-u-ca-ethiopic', {
  timeZone: 'Africa/Addis_Ababa',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
const formattedEt = etFormatter.format(testDate);
assert(formattedEt.includes('2019') || formattedEt.includes('ጥቅምት'), 'Should format in Ethiopic calendar');
console.log(`✅ Intl Ethiopic calendar test passed: "${formattedEt}"`);

// Test Pluralization and Interpolation
function interpolate(template, params) {
  let res = template;
  for (const [k, v] of Object.entries(params)) {
    res = res.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
  }
  const unreplaced = res.match(/{{\s*([a-zA-Z0-9_]+)\s*}}/);
  if (unreplaced) {
    throw new Error(`Missing interpolation value for {{${unreplaced[1]}}}`);
  }
  return res;
}

const enTemplate = 'Gross Sales Total ({{count}} sales)';
assert.strictEqual(interpolate(enTemplate, { count: 14 }), 'Gross Sales Total (14 sales)');

const amTemplate = 'ጠቅላላ የሽያጭ ድምር ({{count}} ሽያጮች)';
assert.strictEqual(interpolate(amTemplate, { count: 14 }), 'ጠቅላላ የሽያጭ ድምር (14 ሽያጮች)');

assert.throws(() => {
  interpolate(enTemplate, {});
}, /Missing interpolation value/);
console.log('✅ Plural & Interpolation tests passed.');

console.log('✨ All i18n foundation unit checks passed!');
