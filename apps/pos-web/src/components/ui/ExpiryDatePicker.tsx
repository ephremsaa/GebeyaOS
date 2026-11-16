import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  AlertTriangle,
  AlertOctagon,
  Clock,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import {
  getAddisTodayString,
  computeDaysLeftInAddis,
  formatDaysLeftHuman,
  formatEthiopianDisplayDate,
  validateExpiryDateInput,
  getDatePlusOffset,
} from '@gebeyaos/shared-types';

export interface ExpiryDatePickerProps {
  value: string | null; // ISO 'YYYY-MM-DD'
  onChange: (date: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  error?: string | null;
  className?: string;
}

const GREGORIAN_MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const GREGORIAN_MONTHS_AM = [
  'ጃንዋሪ (ጥር/የካቲት)', 'ፌብሩዋሪ (የካቲት/መጋቢት)', 'ማርች (መጋቢት/ሚያዝያ)',
  'ኤፕሪል (ሚያዝያ/ግንቦት)', 'ሜይ (ግንቦት/ሰኔ)', 'ጁን (ሰኔ/ሐምሌ)',
  'ጁላይ (ሐምሌ/ነሐሴ)', 'ኦገስት (ነሐሴ/ጳጉሜን/መስከረም)', 'ሴፕቴምበር (መስከረም/ጥቅምት)',
  'ኦክቶበር (ጥቅምት/ህዳር)', 'ኖቬምበር (ህዳር/ታህሳስ)', 'ዲሴምበር (ታህሳስ/ጥር)',
];

const ETHIOPIAN_MONTHS = [
  { num: 1, nameEn: 'Meskerem', nameAm: 'መስከረም' },
  { num: 2, nameEn: 'Tikimt', nameAm: 'ጥቅምት' },
  { num: 3, nameEn: 'Hidar', nameAm: 'ህዳር' },
  { num: 4, nameEn: 'Tahsas', nameAm: 'ታህሳስ' },
  { num: 5, nameEn: 'Tir', nameAm: 'ጥር' },
  { num: 6, nameEn: 'Yakatit', nameAm: 'የካቲት' },
  { num: 7, nameEn: 'Magabit', nameAm: 'መጋቢት' },
  { num: 8, nameEn: 'Miyazya', nameAm: 'ሚያዝያ' },
  { num: 9, nameEn: 'Ginbot', nameAm: 'ግንቦት' },
  { num: 10, nameEn: 'Sene', nameAm: 'ሰኔ' },
  { num: 11, nameEn: 'Hamle', nameAm: 'ሐምሌ' },
  { num: 12, nameEn: 'Nehase', nameAm: 'ነሐሴ' },
  { num: 13, nameEn: 'Pagume', nameAm: 'ጳጉሜን' },
];

/**
 * Checks how many days are in a given Gregorian month/year
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const ExpiryDatePicker: React.FC<ExpiryDatePickerProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  label,
  error,
  className = '',
}) => {
  const { language, calendar } = useI18n();
  const isAm = language === 'am';
  const isEthiopicCalendar = calendar === 'ethiopic';

  const datePickerInputRef = useRef<HTMLInputElement>(null);

  // Parse YYYY-MM-DD into local day, month, year state
  const parsed = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { year: '', month: '', day: '' };
    }
    const [y, m, d] = value.split('-');
    return { year: y, month: String(parseInt(m, 10)), day: String(parseInt(d, 10)) };
  }, [value]);

  const [day, setDay] = useState(parsed.day);
  const [month, setMonth] = useState(parsed.month);
  const [year, setYear] = useState(parsed.year);

  // Sync internal state when prop value changes
  useEffect(() => {
    setDay(parsed.day);
    setMonth(parsed.month);
    setYear(parsed.year);
  }, [parsed.day, parsed.month, parsed.year]);

  // Compute available years (current year - 1 to current year + 10)
  const todayStr = getAddisTodayString();
  const currentAddisYear = parseInt(todayStr.slice(0, 4), 10);
  const availableYears = useMemo(() => {
    const list: number[] = [];
    for (let y = currentAddisYear; y <= currentAddisYear + 10; y++) {
      list.push(y);
    }
    return list;
  }, [currentAddisYear]);

  // Validate internal values
  const dateValidation = useMemo(() => {
    if (!value) {
      return { isValid: false, warning: undefined, warningAm: undefined, isPast: false, isTooFar: false };
    }
    const val = validateExpiryDateInput(value, todayStr);
    const daysLeft = computeDaysLeftInAddis(value, todayStr);
    return {
      isValid: val.isValid,
      warning: val.warning,
      warningAm: val.warningAm,
      isPast: val.isPast,
      isTooFar: val.isTooFarFuture,
      daysLeft,
    };
  }, [value, todayStr]);

  // Update parent when user edits day, month, or year
  const handlePartChange = (newDay: string, newMonth: string, newYear: string) => {
    setDay(newDay);
    setMonth(newMonth);
    setYear(newYear);

    if (!newDay || !newMonth || !newYear) {
      onChange(null);
      return;
    }

    const yNum = parseInt(newYear, 10);
    const mNum = parseInt(newMonth, 10);
    const dNum = parseInt(newDay, 10);

    if (isNaN(yNum) || isNaN(mNum) || isNaN(dNum)) {
      onChange(null);
      return;
    }

    const maxDays = getDaysInMonth(yNum, mNum);
    const clampedDay = Math.min(Math.max(1, dNum), maxDays);

    const formattedM = String(mNum).padStart(2, '0');
    const formattedD = String(clampedDay).padStart(2, '0');
    const isoDate = `${yNum}-${formattedM}-${formattedD}`;

    onChange(isoDate);
  };

  // Quick button helpers
  const applyOffset = (offset: { days?: number; months?: number; years?: number }) => {
    const futureDate = getDatePlusOffset(offset, todayStr);
    onChange(futureDate);
  };

  // Written-out date string
  const writtenOutDate = useMemo(() => {
    if (!value || !dateValidation.isValid) return null;
    const [y, m, d] = value.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const gregStr = dateObj.toLocaleDateString(isAm ? 'am-ET' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    if (isEthiopicCalendar) {
      const ethiopicStr = formatEthiopianDisplayDate(value, isAm ? 'am' : 'en');
      return `${ethiopicStr} (${gregStr})`;
    }
    return gregStr;
  }, [value, dateValidation.isValid, isAm, isEthiopicCalendar]);

  // Days left relative text
  const relativeText = useMemo(() => {
    if (dateValidation.daysLeft === null || dateValidation.daysLeft === undefined) return null;
    return formatDaysLeftHuman(dateValidation.daysLeft, isAm ? 'am' : 'en');
  }, [dateValidation.daysLeft, isAm]);

  return (
    <div className={`space-y-2 select-none ${className}`}>
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-text-main flex items-center gap-1.5">
          <CalendarIcon size={16} className="text-primary" />
          <span>{label || (isAm ? 'የጊዜ ማብቂያ ቀን (Expiry Date)' : 'Expiry Date')}</span>
          {required && <span className="text-danger font-bold">*</span>}
        </label>

        {isEthiopicCalendar && (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
            {isAm ? 'የኢትዮጵያ ቀን መቁጠሪያ' : 'Ethiopian Calendar'}
          </span>
        )}
      </div>

      {/* Main 3 Inputs: Day, Month, Year + Calendar Picker Button */}
      <div className="grid grid-cols-12 gap-2">
        {/* Day */}
        <div className="col-span-3">
          <select
            value={day}
            disabled={disabled}
            onChange={(e) => handlePartChange(e.target.value, month, year)}
            className="w-full h-11 px-3 rounded-xl border border-border-subtle bg-surface text-text-main text-base font-semibold focus:outline-hidden focus:border-primary disabled:opacity-50"
          >
            <option value="">{isAm ? 'ቀን' : 'Day'}</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Month */}
        <div className="col-span-5">
          <select
            value={month}
            disabled={disabled}
            onChange={(e) => handlePartChange(day, e.target.value, year)}
            className="w-full h-11 px-3 rounded-xl border border-border-subtle bg-surface text-text-main text-base font-semibold focus:outline-hidden focus:border-primary disabled:opacity-50"
          >
            <option value="">{isAm ? 'ወር' : 'Month'}</option>
            {GREGORIAN_MONTHS_EN.map((mName, idx) => {
              const num = idx + 1;
              const display = isAm ? GREGORIAN_MONTHS_AM[idx] : `${num} - ${mName}`;
              return (
                <option key={num} value={num}>
                  {display}
                </option>
              );
            })}
          </select>
        </div>

        {/* Year */}
        <div className="col-span-3">
          <select
            value={year}
            disabled={disabled}
            onChange={(e) => handlePartChange(day, month, e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-border-subtle bg-surface text-text-main text-base font-semibold focus:outline-hidden focus:border-primary disabled:opacity-50 font-mono"
          >
            <option value="">{isAm ? 'ዓመት' : 'Year'}</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Mini Native Calendar Button */}
        <div className="col-span-1 flex items-center justify-center relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => datePickerInputRef.current?.showPicker?.()}
            className="w-full h-11 rounded-xl border border-border-subtle bg-surface-2 hover:bg-surface text-text-muted hover:text-primary flex items-center justify-center transition-colors disabled:opacity-50"
            title={isAm ? 'ቀን መቁጠሪያ ክፈት' : 'Open calendar picker'}
          >
            <CalendarIcon size={18} />
          </button>
          <input
            ref={datePickerInputRef}
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value || null)}
            className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
            tabIndex={-1}
          />
        </div>
      </div>

      {/* Quick Buttons: +1mo, +3mo, +6mo, +1yr, +2yr */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-semibold text-text-muted mr-1">
          {isAm ? 'ፈጣን ምርጫ:' : 'Quick add:'}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyOffset({ months: 1 })}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-2 hover:bg-surface border border-border-subtle text-text-muted hover:text-text-main transition-colors"
        >
          {isAm ? '+1 ወር' : '+1 mo'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyOffset({ months: 3 })}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-2 hover:bg-surface border border-border-subtle text-text-muted hover:text-text-main transition-colors"
        >
          {isAm ? '+3 ወራት' : '+3 mo'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyOffset({ months: 6 })}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-2 hover:bg-surface border border-border-subtle text-text-muted hover:text-text-main transition-colors"
        >
          {isAm ? '+6 ወራት' : '+6 mo'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyOffset({ years: 1 })}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-2 hover:bg-surface border border-border-subtle text-text-muted hover:text-text-main transition-colors"
        >
          {isAm ? '+1 ዓመት' : '+1 yr'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyOffset({ years: 2 })}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-2 hover:bg-surface border border-border-subtle text-text-muted hover:text-text-main transition-colors"
        >
          {isAm ? '+2 ዓመታት' : '+2 yr'}
        </button>
        {value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="px-2 py-1 rounded-lg text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors ml-auto"
          >
            {isAm ? 'አጽዳ' : 'Clear'}
          </button>
        )}
      </div>

      {/* Written-out Date & Days Left Summary */}
      {writtenOutDate && (
        <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-primary shrink-0" />
            <span className="font-semibold text-text-main">{writtenOutDate}</span>
          </div>
          {relativeText && (
            <span
              className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                dateValidation.isPast
                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                  : (dateValidation.daysLeft ?? 0) <= 30
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {relativeText}
            </span>
          )}
        </div>
      )}

      {/* Warnings & Errors */}
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
          <AlertOctagon size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {dateValidation.warning && (
        <div
          className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
            dateValidation.isPast
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-500'
              : 'bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400'
          }`}
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>{isAm ? dateValidation.warningAm : dateValidation.warning}</span>
        </div>
      )}
    </div>
  );
};
