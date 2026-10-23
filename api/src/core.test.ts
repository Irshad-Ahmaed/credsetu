import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { businessToday, isCalendarDate, isLoanOverdue } from './dates.js';
import { formatPaise, rupeesToPaise } from './money.js';
import { createLoanSchema, uuidV4Schema } from './validators.js';

const require = createRequire(import.meta.url);
const decodeUriComponent = require('decode-uri-component') as (value: string) => string;

test('business date uses India calendar at UTC boundaries', () => {
  assert.equal(businessToday(new Date('2026-10-21T18:29:59.000Z')), '2026-10-21');
  assert.equal(businessToday(new Date('2026-10-21T18:30:00.000Z')), '2026-10-22');
});

test('calendar date validation rejects impossible dates', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2025-02-29'), false);
  assert.equal(isCalendarDate('2026-13-01'), false);
  assert.equal(isCalendarDate('2026-1-01'), false);
  assert.equal(isCalendarDate('0099-01-01'), true);
  assert.equal(isCalendarDate('0000-01-01'), false);
});

test('overdue applies only to pending loans due before the India business date', () => {
  assert.equal(isLoanOverdue('pending', '2026-10-21', '2026-10-22'), true);
  assert.equal(isLoanOverdue('pending', '2026-10-22', '2026-10-22'), false);
  assert.equal(isLoanOverdue('pending', '2026-10-23', '2026-10-22'), false);
  assert.equal(isLoanOverdue('repaid', '2026-10-21', '2026-10-22'), false);
  assert.equal(isLoanOverdue('pending', new Date('2026-10-20T00:00:00Z'), '2026-10-22'), false);
});

test('rupees convert to exact paise and reject invalid money', () => {
  assert.equal(rupeesToPaise('2500.5'), '250050');
  assert.equal(rupeesToPaise('0.01'), '1');
  assert.equal(rupeesToPaise('10000000.00'), '1000000000');
  assert.equal(rupeesToPaise('0'), null);
  assert.equal(rupeesToPaise('-1'), null);
  assert.equal(rupeesToPaise('1.001'), null);
  assert.equal(rupeesToPaise('1e3'), null);
  assert.equal(formatPaise('250050'), '₹2,500.50');
  assert.equal(formatPaise('1000000000'), '₹1,00,00,000.00');
});

test('loan validation requires a trimmed name, paise string and due date', () => {
  assert.equal(createLoanSchema.safeParse({ friend_name: '  Al  ', amount_paise: '250', due_on: '2026-10-22' }).success, true);
  assert.equal(createLoanSchema.safeParse({ friend_name: 'A', amount_paise: '250', due_on: '2026-10-22' }).success, false);
  assert.equal(createLoanSchema.safeParse({ friend_name: 'Ali', amount_paise: '0', due_on: '2026-10-22' }).success, false);
  assert.equal(createLoanSchema.safeParse({ friend_name: 'Ali', amount_paise: 'not-money', due_on: '2026-10-22' }).success, false);
  assert.equal(createLoanSchema.safeParse({ friend_name: 'Ali', amount_paise: '99999999999', due_on: '2026-10-22' }).success, false);
  assert.equal(createLoanSchema.safeParse({ friend_name: 'Ali', amount_paise: '250', due_on: '2026-10-22', user_id: 'forbidden' }).success, false);
});

test('submission identifiers must be canonical UUID v4 values', () => {
  assert.equal(uuidV4Schema.safeParse('f47ac10b-58cc-4372-a567-0e02b2c3d479').success, true);
  assert.equal(uuidV4Schema.safeParse('not-a-uuid').success, false);
  assert.equal(uuidV4Schema.safeParse('f47ac10b-58cc-1372-a567-0e02b2c3d479').success, false);
});

test('patched CommonJS URI decoder preserves valid and malformed query values', () => {
  assert.equal(require('decode-uri-component/package.json').version, '0.5.0-miniledger.1');
  assert.equal(decodeUriComponent('%7Bhello%7D'), '{hello}');
  assert.equal(decodeUriComponent('%%7Bst%C3%A5le%7D%'), '%{ståle}%');
  assert.equal(decodeUriComponent('%FE%FF'), '\ufffd\ufffd');
  assert.equal(decodeUriComponent('%E0%A4%A'), '%E0%A4%A');
  assert.equal(decodeUriComponent('%E0%A4%A'.repeat(20_000)).length, 160_000);
});
