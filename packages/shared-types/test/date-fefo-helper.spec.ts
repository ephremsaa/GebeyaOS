import { describe, it, expect } from 'vitest';
import {
  getAddisTodayString,
  computeDaysLeftInAddis,
  getExpiryStatus,
  getDatePlusOffset,
  validateExpiryDateInput,
  parseExcelExpiryDate,
  allocateFEFO,
  FEFOBatchCandidate,
  formatDaysLeftHuman,
  resolveEffectiveWarningDays,
} from '../src';

describe('date-fefo.helper.ts – Complete Timezone and Expiry Engine', () => {
  describe('Addis Ababa Timezone & Date String Boundaries (UTC+3)', () => {
    it('accurately resolves Africa/Addis_Ababa date across midnight edge hours', () => {
      // 2026-11-14 20:59:00 UTC is 2026-11-14 23:59:00 in Addis Ababa (same day)
      const date1 = new Date('2026-11-14T20:59:00.000Z');
      expect(getAddisTodayString(date1)).toBe('2026-11-14');

      // 2026-11-14 21:05:00 UTC is 2026-11-15 00:05:00 in Addis Ababa (next day!)
      const date2 = new Date('2026-11-14T21:05:00.000Z');
      expect(getAddisTodayString(date2)).toBe('2026-11-15');

      // 2026-11-14 23:00:00 UTC is 2026-11-15 02:00:00 in Addis Ababa (next day)
      const date3 = new Date('2026-11-14T23:00:00.000Z');
      expect(getAddisTodayString(date3)).toBe('2026-11-15');
    });

    it('handles Year-End and Month-End boundary crossovers in Addis Ababa', () => {
      // 2026-12-31 21:30:00 UTC is 2027-01-01 00:30:00 in Addis Ababa
      const newYearUtc = new Date('2026-12-31T21:30:00.000Z');
      expect(getAddisTodayString(newYearUtc)).toBe('2027-01-01');

      // 2026-02-28 22:00:00 UTC is 2026-03-01 01:00:00 in Addis Ababa
      const leapCheck = new Date('2026-02-28T22:00:00.000Z');
      expect(getAddisTodayString(leapCheck)).toBe('2026-03-01');
    });

    it('correctly handles Leap Year February 29th', () => {
      // 2028 is a leap year
      const leapDay = new Date('2028-02-29T10:00:00.000Z');
      expect(getAddisTodayString(leapDay)).toBe('2028-02-29');

      const days = computeDaysLeftInAddis('2028-02-29', '2028-02-28');
      expect(days).toBe(1);

      const daysAfterLeap = computeDaysLeftInAddis('2028-03-01', '2028-02-28');
      expect(daysAfterLeap).toBe(2);
    });
  });

  describe('Days Left Calculation & Expiry Tiers', () => {
    const today = '2026-11-14';

    it('calculates past dates as negative integers (Expired)', () => {
      expect(computeDaysLeftInAddis('2026-11-13', today)).toBe(-1);
      expect(computeDaysLeftInAddis('2026-11-01', today)).toBe(-13);
      expect(computeDaysLeftInAddis('2025-11-14', today)).toBe(-365);

      const status = getExpiryStatus('2026-11-13', 30, today);
      expect(status.tier).toBe('EXPIRED');
      expect(status.badgeColor).toBe('red');
      expect(status.isExpired).toBe(true);
      expect(status.labelEn).toBe('Expired 1 day ago');
      expect(status.labelAm).toBe('ከ1 ቀን በፊት አልፏል');
    });

    it('calculates same day as 0 (Expires Today)', () => {
      expect(computeDaysLeftInAddis('2026-11-14', today)).toBe(0);

      const status = getExpiryStatus('2026-11-14', 30, today);
      expect(status.tier).toBe('TODAY');
      expect(status.badgeColor).toBe('red');
      expect(status.isExpired).toBe(true);
      expect(status.labelEn).toBe('Expires Today');
      expect(status.labelAm).toBe('ዛሬ ያበቃል');
    });

    it('calculates 1-7 days left as Critical (Orange badge)', () => {
      expect(computeDaysLeftInAddis('2026-11-15', today)).toBe(1);
      expect(computeDaysLeftInAddis('2026-11-21', today)).toBe(7);

      const status1 = getExpiryStatus('2026-11-15', 30, today);
      expect(status1.tier).toBe('CRITICAL');
      expect(status1.badgeColor).toBe('orange');
      expect(status1.labelEn).toBe('1 day left');
      expect(status1.labelAm).toBe('1 ቀን ይቀራል');

      const status7 = getExpiryStatus('2026-11-21', 30, today);
      expect(status7.tier).toBe('CRITICAL');
      expect(status7.badgeColor).toBe('orange');
      expect(status7.labelEn).toBe('7 days left');
    });

    it('calculates 8-30 days left as Warning (Orange badge, stage 30D)', () => {
      expect(computeDaysLeftInAddis('2026-11-22', today)).toBe(8);
      expect(computeDaysLeftInAddis('2026-12-14', today)).toBe(30);

      const status8 = getExpiryStatus('2026-11-22', 90, today);
      expect(status8.tier).toBe('WARNING');
      expect(status8.stage).toBe('30D');
      expect(status8.badgeColor).toBe('orange');
      expect(status8.statusBadgeEn).toBe('Within 30 days');
      expect(status8.statusBadgeAm).toBe('በ30 ቀናት ውስጥ');

      const status30 = getExpiryStatus('2026-12-14', 90, today);
      expect(status30.tier).toBe('WARNING');
      expect(status30.stage).toBe('30D');
      expect(status30.badgeColor).toBe('orange');
    });

    it('calculates 31-90 days left as Alert 3 Months (Yellow badge, stage 90D)', () => {
      expect(computeDaysLeftInAddis('2026-12-15', today)).toBe(31);
      expect(computeDaysLeftInAddis('2027-02-12', today)).toBe(90);

      const status31 = getExpiryStatus('2026-12-15', 90, today);
      expect(status31.tier).toBe('ALERT_90D');
      expect(status31.stage).toBe('90D');
      expect(status31.badgeColor).toBe('yellow');
      expect(status31.statusBadgeEn).toBe('Within 3 months');
      expect(status31.statusBadgeAm).toBe('በ3 ወራት ውስጥ');

      const status90 = getExpiryStatus('2027-02-12', 90, today);
      expect(status90.tier).toBe('ALERT_90D');
      expect(status90.stage).toBe('90D');
      expect(status90.badgeColor).toBe('yellow');
    });

    it('calculates > 90 days left as Good (Green badge, stage OK)', () => {
      expect(computeDaysLeftInAddis('2027-02-13', today)).toBe(91);

      const status91 = getExpiryStatus('2027-02-13', 90, today);
      expect(status91.tier).toBe('GOOD');
      expect(status91.stage).toBe('OK');
      expect(status91.badgeColor).toBe('green');
      expect(status91.statusBadgeEn).toBe('OK');
      expect(status91.statusBadgeAm).toBe('ደህና');
      expect(status91.isExpired).toBe(false);
    });

    it('returns null/No Expiry for empty, null, or invalid strings', () => {
      expect(computeDaysLeftInAddis(null, today)).toBeNull();
      expect(computeDaysLeftInAddis('', today)).toBeNull();
      expect(computeDaysLeftInAddis('invalid-date', today)).toBeNull();

      const status = getExpiryStatus(null, 30, today);
      expect(status.tier).toBe('NO_EXPIRY');
      expect(status.badgeColor).toBe('slate');
      expect(status.labelEn).toBe('No Expiry');
      expect(status.labelAm).toBe('ማለቂያ የለውም');
    });
  });

  describe('Quick Date Offset Calculation', () => {
    const base = '2026-11-14';

    it('computes +7 days accurately', () => {
      expect(getDatePlusOffset({ days: 7 }, base)).toBe('2026-11-21');
    });

    it('computes +30 days accurately crossing month boundary', () => {
      expect(getDatePlusOffset({ days: 30 }, base)).toBe('2026-12-14');
    });

    it('computes +3 months accurately', () => {
      expect(getDatePlusOffset({ months: 3 }, base)).toBe('2027-02-14');
    });

    it('computes +6 months accurately', () => {
      expect(getDatePlusOffset({ months: 6 }, base)).toBe('2027-05-14');
    });

    it('computes +1 year accurately', () => {
      expect(getDatePlusOffset({ years: 1 }, base)).toBe('2027-11-14');
    });
  });

  describe('Date Input Validation', () => {
    const today = '2026-11-14';

    it('flags dates in the past with a warning', () => {
      const res = validateExpiryDateInput('2026-11-10', today);
      expect(res.isValid).toBe(true);
      expect(res.isPast).toBe(true);
      expect(res.warning).toContain('in the past');
    });

    it('flags dates more than 5 years away with a warning', () => {
      const res = validateExpiryDateInput('2033-01-01', today);
      expect(res.isValid).toBe(true);
      expect(res.isTooFarFuture).toBe(true);
      expect(res.warning).toContain('more than 5 years');
    });

    it('accepts valid future dates within 5 years without warning', () => {
      const res = validateExpiryDateInput('2027-05-10', today);
      expect(res.isValid).toBe(true);
      expect(res.isPast).toBe(false);
      expect(res.isTooFarFuture).toBe(false);
      expect(res.warning).toBeUndefined();
    });

    it('rejects invalid formatting', () => {
      const res = validateExpiryDateInput('14-11-2026', today);
      expect(res.isValid).toBe(false);
    });
  });

  describe('Excel Date Parser', () => {
    it('parses standard ISO strings', () => {
      const res = parseExcelExpiryDate('2027-06-15');
      expect(res.valid).toBe(true);
      expect(res.dateStr).toBe('2027-06-15');
    });

    it('parses DD/MM/YYYY text dates', () => {
      const res = parseExcelExpiryDate('25/12/2027');
      expect(res.valid).toBe(true);
      expect(res.dateStr).toBe('2027-12-25');
    });

    it('parses Excel numeric serial dates', () => {
      // 45000 is approx 2023-03-15
      const res = parseExcelExpiryDate(45000);
      expect(res.valid).toBe(true);
      expect(res.dateStr).toBe('2023-03-15');
    });

    it('parses JS Date objects directly without UTC day shift', () => {
      const d = new Date(2027, 3, 20); // 2027-04-20
      const res = parseExcelExpiryDate(d);
      expect(res.valid).toBe(true);
      expect(res.dateStr).toBe('2027-04-20');
    });

    it('flags unreadable dates as errors', () => {
      const res = parseExcelExpiryDate('invalid-text');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unrecognized date format');
    });
  });

  describe('FEFO Allocation & Expired Stock Protection', () => {
    const today = '2026-11-14';

    const testBatches: FEFOBatchCandidate[] = [
      {
        id: 'b-expired',
        batchNumber: 'EXP-01',
        expiryDate: '2026-11-10', // Expired 4 days ago
        unitCost: 50,
        currentQuantity: 10,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'b-soon',
        batchNumber: 'SOON-02',
        expiryDate: '2026-11-20', // Expiring in 6 days
        unitCost: 55,
        currentQuantity: 8,
        createdAt: '2026-10-05T00:00:00Z',
      },
      {
        id: 'b-fresh',
        batchNumber: 'FRESH-03',
        expiryDate: '2027-02-01', // Expiring in ~3 months
        unitCost: 60,
        currentQuantity: 20,
        createdAt: '2026-10-10T00:00:00Z',
      },
    ];

    it('blocks expired batches by default and takes earliest unexpired first', () => {
      const result = allocateFEFO(testBatches, 5, { todayStr: today, filterExpired: true });
      expect(result.fullyAllocated).toBe(true);
      expect(result.totalAllocated).toBe(5);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].batchId).toBe('b-soon'); // Takes earliest unexpired!
      expect(result.expiredBatchesBlocked).toHaveLength(1);
      expect(result.expiredBatchesBlocked?.[0].id).toBe('b-expired');
    });

    it('exhausts earliest unexpired batch before moving to next unexpired batch', () => {
      const result = allocateFEFO(testBatches, 15, { todayStr: today, filterExpired: true });
      expect(result.fullyAllocated).toBe(true);
      expect(result.totalAllocated).toBe(15);
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0].batchId).toBe('b-soon');
      expect(result.allocations[0].quantity).toBe(8);
      expect(result.allocations[1].batchId).toBe('b-fresh');
      expect(result.allocations[1].quantity).toBe(7);
      expect(result.expiredBatchesBlocked).toHaveLength(1);
    });

    it('leaves unallocated quantity rather than selling expired stock when unexpired stock is insufficient', () => {
      // Requested 35, but only 28 unexpired units exist (8 + 20)
      const result = allocateFEFO(testBatches, 35, { todayStr: today, allowNegativeStock: false, filterExpired: true });
      expect(result.fullyAllocated).toBe(false);
      expect(result.totalAllocated).toBe(28);
      expect(result.unallocatedQuantity).toBe(7);
      expect(result.allocations.some((a) => a.batchId === 'b-expired')).toBe(false);
      expect(result.expiredBatchesBlocked).toHaveLength(1);
    });

    it('allows expired batch when allowExpiredStock (manager override) is explicitly passed', () => {
      const result = allocateFEFO(testBatches, 5, { todayStr: today, filterExpired: false });
      expect(result.fullyAllocated).toBe(true);
      expect(result.totalAllocated).toBe(5);
      expect(result.allocations[0].batchId).toBe('b-expired'); // Takes expired with override
      expect(result.expiredBatchesBlocked).toHaveLength(0);
    });
  });

  describe('formatDaysLeftHuman – Bilingual formatting for days left', () => {
    it('formats expired dates in English and Amharic', () => {
      expect(formatDaysLeftHuman(-1, 'en')).toBe('Expired 1 day ago');
      expect(formatDaysLeftHuman(-1, 'am')).toBe('ከ1 ቀን በፊት አልፏል');
      expect(formatDaysLeftHuman(-5, 'en')).toBe('Expired 5 days ago');
      expect(formatDaysLeftHuman(-5, 'am')).toBe('ከ5 ቀናት በፊት አልፏል');
    });

    it('formats today (0) in English and Amharic', () => {
      expect(formatDaysLeftHuman(0, 'en')).toBe('Today');
      expect(formatDaysLeftHuman(0, 'am')).toBe('ዛሬ');
    });

    it('formats 1-30 days in English and Amharic', () => {
      expect(formatDaysLeftHuman(1, 'en')).toBe('1 day');
      expect(formatDaysLeftHuman(1, 'am')).toBe('1 ቀን');
      expect(formatDaysLeftHuman(12, 'en')).toBe('12 days');
      expect(formatDaysLeftHuman(12, 'am')).toBe('12 ቀናት');
      expect(formatDaysLeftHuman(30, 'en')).toBe('30 days');
      expect(formatDaysLeftHuman(30, 'am')).toBe('30 ቀናት');
    });

    it('formats long ranges (>30 days) with months and weeks in English and Amharic', () => {
      // 104 days = 3 months and 14 days (2 weeks)
      expect(formatDaysLeftHuman(104, 'en')).toBe('3 months 2 weeks');
      expect(formatDaysLeftHuman(104, 'am')).toBe('3 ወራት ከ2 ሳምንት');

      // 60 days = exactly 2 months
      expect(formatDaysLeftHuman(60, 'en')).toBe('2 months');
      expect(formatDaysLeftHuman(60, 'am')).toBe('2 ወራት');

      // 90 days = 3 months
      expect(formatDaysLeftHuman(90, 'en')).toBe('3 months');
      expect(formatDaysLeftHuman(90, 'am')).toBe('3 ወራት');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatDaysLeftHuman(null, 'en')).toBe('No Expiry');
      expect(formatDaysLeftHuman(null, 'am')).toBe('ማለቂያ የለውም');
    });
  });

  describe('resolveEffectiveWarningDays – Category and Item Overrides', () => {
    it('falls back to default 90 days when no overrides match', () => {
      const days = resolveEffectiveWarningDays(90, 'cat-1', 'prod-1', {});
      expect(days).toBe(90);
    });

    it('applies category override when present', () => {
      const days = resolveEffectiveWarningDays(90, 'cat-dairy', 'prod-1', {
        categoryOverrides: { 'cat-dairy': 14, 'cat-grains': 180 },
      });
      expect(days).toBe(14);
    });

    it('applies product override with highest precedence over category', () => {
      const days = resolveEffectiveWarningDays(90, 'cat-dairy', 'prod-milk-special', {
        categoryOverrides: { 'cat-dairy': 14 },
        productOverrides: { 'prod-milk-special': 7 },
      });
      expect(days).toBe(7);
    });
  });
});
