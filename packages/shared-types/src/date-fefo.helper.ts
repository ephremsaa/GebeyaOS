/**
 * date-fefo.helper.ts
 * Authoritative shared date, timezone (Africa/Addis_Ababa), and FEFO expiry helper.
 * Rules:
 *  - Store expiry strictly as DATE (YYYY-MM-DD). Never use UTC timestamps for calendar dates.
 *  - Compare against today in Africa/Addis_Ababa (UTC+3, EAT).
 *  - Days left = expiry date minus today.
 *  - Expired = daysLeft < 0.
 *  - Expiring today = daysLeft === 0.
 */

export type ExpiryTier = 'EXPIRED' | 'TODAY' | 'CRITICAL' | 'WARNING' | 'GOOD' | 'NO_EXPIRY';

export interface ExpiryStatusDetails {
  tier: ExpiryTier;
  daysLeft: number | null;
  badgeColor: 'red' | 'orange' | 'yellow' | 'green' | 'slate';
  badgeClass: string;
  labelEn: string;
  labelAm: string;
  iconName: 'AlertOctagon' | 'Clock' | 'AlertTriangle' | 'Calendar' | 'CheckCircle2' | 'HelpCircle';
  isExpired: boolean;
  isUrgent: boolean;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Africa/Addis_Ababa timezone.
 * Handles the UTC+3 offset accurately at any hour of the day (e.g. 11 PM or 1 AM).
 */
export function getAddisTodayString(referenceDate: Date = new Date()): string {
  // Use Intl with Canada locale (en-CA gives YYYY-MM-DD reliably) in Africa/Addis_Ababa
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(referenceDate);
}

/**
 * Computes exact calendar days difference: (expiryDate - today).
 * Pure calendar-day math using UTC midnight for the two date components to prevent any DST/TZ shifts.
 * Returns:
 *  - negative integer if expired (e.g. -1 for yesterday)
 *  - 0 if expiring today
 *  - positive integer if in the future (e.g. 1 for tomorrow)
 *  - null if expiryDate is invalid or null/undefined
 */
export function computeDaysLeftInAddis(
  expiryDateStr: string | null | undefined,
  todayStr: string = getAddisTodayString(),
): number | null {
  if (!expiryDateStr) return null;

  // Clean and sanitize to YYYY-MM-DD
  const cleanExp = String(expiryDateStr).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanExp)) return null;

  const [expY, expM, expD] = cleanExp.split('-').map(Number);
  const [todayY, todayM, todayD] = todayStr.split('-').map(Number);

  if (isNaN(expY) || isNaN(expM) || isNaN(expD) || isNaN(todayY) || isNaN(todayM) || isNaN(todayD)) {
    return null;
  }

  const expUtc = Date.UTC(expY, expM - 1, expD);
  const todayUtc = Date.UTC(todayY, todayM - 1, todayD);

  const diffMs = expUtc - todayUtc;
  return Math.round(diffMs / (86400 * 1000));
}

/**
 * Evaluates the full expiry status badge and details using the configured warning window.
 * Default warning window: 30 days.
 */
export function getExpiryStatus(
  expiryDateStr: string | null | undefined,
  warningDays = 30,
  todayStr: string = getAddisTodayString(),
): ExpiryStatusDetails {
  const days = computeDaysLeftInAddis(expiryDateStr, todayStr);

  if (days === null) {
    return {
      tier: 'NO_EXPIRY',
      daysLeft: null,
      badgeColor: 'slate',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300',
      labelEn: 'No Expiry',
      labelAm: 'ማለቂያ የለውም',
      iconName: 'HelpCircle',
      isExpired: false,
      isUrgent: false,
    };
  }

  if (days < 0) {
    const absDays = Math.abs(days);
    return {
      tier: 'EXPIRED',
      daysLeft: days,
      badgeColor: 'red',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      labelEn: absDays === 1 ? 'Expired 1 day ago' : `Expired ${absDays} days ago`,
      labelAm: absDays === 1 ? 'ከ1 ቀን በፊት አልፏል' : `ከ${absDays} ቀናት በፊት አልፏል`,
      iconName: 'AlertOctagon',
      isExpired: true,
      isUrgent: true,
    };
  }

  if (days === 0) {
    return {
      tier: 'TODAY',
      daysLeft: 0,
      badgeColor: 'red',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-bold animate-pulse',
      labelEn: 'Expires Today',
      labelAm: 'ዛሬ ያበቃል',
      iconName: 'Clock',
      isExpired: true, // Expiring today is treated as expired / do not sell
      isUrgent: true,
    };
  }

  if (days <= 7) {
    return {
      tier: 'CRITICAL',
      daysLeft: days,
      badgeColor: 'orange',
      badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      labelEn: days === 1 ? '1 day left' : `${days} days left`,
      labelAm: days === 1 ? '1 ቀን ይቀራል' : `${days} ቀናት ይቀራሉ`,
      iconName: 'AlertTriangle',
      isExpired: false,
      isUrgent: true,
    };
  }

  if (days <= warningDays) {
    return {
      tier: 'WARNING',
      daysLeft: days,
      badgeColor: 'yellow',
      badgeClass: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
      labelEn: `${days} days left`,
      labelAm: `${days} ቀናት ይቀራሉ`,
      iconName: 'Calendar',
      isExpired: false,
      isUrgent: false,
    };
  }

  return {
    tier: 'GOOD',
    daysLeft: days,
    badgeColor: 'green',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    labelEn: `${days} days left`,
    labelAm: `${days} ቀናት ይቀራሉ`,
    iconName: 'CheckCircle2',
    isExpired: false,
    isUrgent: false,
  };
}

export type DateOffsetShortcut = '+7d' | '+30d' | '+3m' | '+6m' | '+1y';

/**
 * Calculates a future date offset from today in Africa/Addis_Ababa.
 * Supports quick buttons: +7 days, +30 days, +3 months, +6 months, +1 year.
 */
export function getDatePlusOffset(
  offset: DateOffsetShortcut | { days?: number; months?: number; years?: number },
  baseDateStr?: string,
): string {
  const baseStr = baseDateStr || getAddisTodayString();
  const [y, m, d] = baseStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  let offsetObj: { days?: number; months?: number; years?: number } = {};
  if (typeof offset === 'string') {
    switch (offset) {
      case '+7d':
        offsetObj = { days: 7 };
        break;
      case '+30d':
        offsetObj = { days: 30 };
        break;
      case '+3m':
        offsetObj = { months: 3 };
        break;
      case '+6m':
        offsetObj = { months: 6 };
        break;
      case '+1y':
        offsetObj = { years: 1 };
        break;
    }
  } else {
    offsetObj = offset;
  }

  if (offsetObj.years) {
    date.setUTCFullYear(date.getUTCFullYear() + offsetObj.years);
  }
  if (offsetObj.months) {
    date.setUTCMonth(date.getUTCMonth() + offsetObj.months);
  }
  if (offsetObj.days) {
    date.setUTCDate(date.getUTCDate() + offsetObj.days);
  }

  const outY = date.getUTCFullYear();
  const outM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const outD = String(date.getUTCDate()).padStart(2, '0');

  return `${outY}-${outM}-${outD}`;
}

/**
 * Validates an expiry date string for form input.
 */
export function validateExpiryDateInput(
  dateStr: string,
  todayStr: string = getAddisTodayString(),
): {
  isValid: boolean;
  isPast: boolean;
  isTooFarFuture: boolean;
  warning?: string;
  warningAm?: string;
} {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return {
      isValid: false,
      isPast: false,
      isTooFarFuture: false,
      warning: 'Invalid date format (must be YYYY-MM-DD)',
      warningAm: 'ልክ ያልሆነ የቀን አቀራረብ (ዓዓዓዓ-ወወ-ቀቀ መሆን አለበት)',
    };
  }

  const daysLeft = computeDaysLeftInAddis(dateStr, todayStr);
  if (daysLeft === null) {
    return {
      isValid: false,
      isPast: false,
      isTooFarFuture: false,
      warning: 'Invalid calendar date',
      warningAm: 'ትክክለኛ ያልሆነ የቀን መቁጠሪያ ቀን',
    };
  }

  const isPast = daysLeft < 0;
  const isTooFarFuture = daysLeft > 365 * 5; // > 5 years

  let warning: string | undefined;
  let warningAm: string | undefined;

  if (isPast) {
    warning = 'Warning: Expiry date is in the past';
    warningAm: 'ማስጠንቀቂያ፡ የማለቂያው ቀን ያለፈ ነው';
  } else if (isTooFarFuture) {
    warning = 'Warning: Expiry date is more than 5 years away';
    warningAm: 'ማስጠንቀቂያ፡ የማለቂያው ቀን ከ5 ዓመት በላይ ይርቃል';
  }

  return {
    isValid: true,
    isPast,
    isTooFarFuture,
    warning,
    warningAm,
  };
}

/**
 * Parses raw dates from Excel imports (supports numbers/serials, strings, and Date objects).
 */
export function parseExcelExpiryDate(raw: any): {
  valid: boolean;
  dateStr?: string;
  error?: string;
} {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { valid: false, error: 'Empty expiry date' };
  }

  // 1. If raw is Date object
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { valid: false, error: 'Invalid Date object' };
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return { valid: true, dateStr: `${y}-${m}-${d}` };
  }

  // 2. If raw is Excel Serial Number (e.g. 45000 -> approx 2023)
  if (typeof raw === 'number' || (!isNaN(Number(raw)) && Number(raw) > 20000 && Number(raw) < 100000)) {
    const serial = Number(raw);
    // Excel leap year 1900 bug offset is 25569 from Unix Epoch (1970-01-01)
    const utcDays = serial - 25569;
    const date = new Date(utcDays * 86400 * 1000);
    if (isNaN(date.getTime())) return { valid: false, error: 'Malformed Excel date serial' };
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return { valid: true, dateStr: `${y}-${m}-${d}` };
  }

  const str = String(raw).trim();

  // 3. YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(str)) {
    const parts = str.split(/[-/.]/);
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return { valid: true, dateStr: `${y}-${m}-${d}` };
  }

  // 4. DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(str)) {
    const parts = str.split(/[-/.]/);
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    // Check reasonable ranges
    if (Number(m) > 12) {
      // Possible MM/DD/YYYY
      return { valid: true, dateStr: `${y}-${d}-${m}` };
    }
    return { valid: true, dateStr: `${y}-${m}-${d}` };
  }

  return { valid: false, error: `Unrecognized date format: "${str}"` };
}

/**
 * Formats a Gregorian YYYY-MM-DD into Ethiopian calendar string if calendar is set to 'ethiopic'.
 */
export function formatEthiopianDisplayDate(
  dateStr: string,
  language: 'en' | 'am' = 'en',
): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const jsDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const locale = language === 'am' ? 'am-ET-u-ca-ethiopic' : 'en-ET-u-ca-ethiopic';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(jsDate);
  } catch {
    return dateStr;
  }
}
