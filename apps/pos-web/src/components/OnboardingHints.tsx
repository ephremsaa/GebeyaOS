import React, { useState, useEffect } from 'react';
import { Lightbulb, X, Check, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

interface OnboardingHintsProps {
  currentTab: string;
}

export const OnboardingHints: React.FC<OnboardingHintsProps> = ({ currentTab }) => {
  const { currentUser } = useAuth();
  const { language } = useI18n();
  const [dismissed, setDismissed] = useState<boolean>(true);
  const [step, setStep] = useState<number>(0);

  const storageKey = `gebeyaos_hints_dismissed_${currentUser?.id || 'anon'}_${currentTab}`;

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === 'true';
    setDismissed(isDismissed);
    setStep(0);
  }, [currentTab, currentUser]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  // Contextual hints by role & tab
  let hints: Array<{ title: string; desc: string }> = [];

  if (currentTab === 'checkout') {
    hints = [
      {
        title: language === 'am' ? 'የባርኮድ አንባቢ' : 'Fast Barcode Wedge Scanning',
        desc: language === 'am'
          ? 'እቃዎችን በማንኛውም ጊዜ በባርኮድ ስካነር ያንብቡ። የኪቦርድ አቋራጭ ሳያስፈልግ በቀጥታ ይገባል።'
          : 'USB and Bluetooth barcode scanners automatically scan items instantly into the cart without clicking into an input field.',
      },
      {
        title: language === 'am' ? 'ፈጣን የክፍያ ቁልፎች' : 'Express Payment Shortcuts',
        desc: language === 'am'
          ? 'ለጥሬ ገንዘብ F2፣ ለቴሌብር F3 ይጫኑ። ግብይቱ ወዲያውኑ ይፈጸማል።'
          : 'Press F2 for Cash, F3 for Telebirr, or F4 for Commercial Bank of Ethiopia (CBE) Birr to complete sales in 1 second.',
      },
      {
        title: language === 'am' ? 'የመዝገብ መቆለፊያ' : 'Register Inactivity Lock',
        desc: language === 'am'
          ? 'ከመመዝገቢያው ሲርቁ F9 በመጫን ቆልፈው ይሂዱ። በካሺየር ፒን ኮድ ወዲያውኑ ይከፈታል።'
          : 'Press F9 anytime you step away from the cash register. Cashiers unlock instantly using their 4-6 digit touch PIN.',
      },
    ];
  } else if (currentTab === 'inventory') {
    hints = [
      {
        title: language === 'am' ? 'ክምችት መጨመሪያ መንገዶች' : 'Unified Add Stock Intakes',
        desc: language === 'am'
          ? 'እቃዎችን በባርኮድ ስካን፣ በእጅ መዝገብ ወይም በ Excel ፋይል በቀላሉ ወደ ክምችት ማስገባት ይችላሉ።'
          : 'Choose between rapid continuous barcode scanning, multi-row manual entry, or bilingual Excel spreadsheet bulk import.',
      },
      {
        title: language === 'am' ? 'የተሳሳተ ማስገቢያን መቀልበስ' : 'Undo Import Rollback',
        desc: language === 'am'
          ? 'የተሳሳተ የኤክሴል ፋይል ካስገቡ በ"Import History" ውስጥ በአንድ ክሊክ ሙሉውን ወደ ነበረበት መመለስ ይቻላል።'
          : 'If a wrong spreadsheet was imported, store managers can click "Undo Import" to post compensating ledger reversals.',
      },
    ];
  } else if (currentTab === 'dashboard') {
    hints = [
      {
        title: language === 'am' ? 'የቅርንጫፍ LAN ሉዓላዊነት' : 'Branch LAN Sovereign Operation',
        desc: language === 'am'
          ? 'የኢንተርኔት ግንኙነት ቢቋረጥም ሁሉም የሱቅ ሽያጮች እና የክምችት ስራዎች ያለማቋረጥ ይሰራሉ።'
          : 'GebeyaOS operates 100% offline on the branch server. All sales and inventories are safe and sync automatically when internet restores.',
      },
      {
        title: language === 'am' ? 'ፈጣን የትእዛዝ ሳጥን' : 'Command Palette (Ctrl+K)',
        desc: language === 'am'
          ? 'በማንኛውም ጊዜ Ctrl+K በመጫን ወደ ማንኛውም ገጽ፣ እቃ ወይም ተግባር በ2 ኪይ ይሂዱ።'
          : 'Press Ctrl+K anytime anywhere to jump across screens, look up products, or toggle dark mode in 2 keystrokes.',
      },
    ];
  }

  if (hints.length === 0) return null;

  const currentHint = hints[step] || hints[0];

  return (
    <div className="fixed bottom-5 right-5 z-40 max-w-sm bg-slate-900 text-white rounded-3xl p-4 shadow-2xl border border-slate-700 animate-in slide-in-from-bottom duration-300 select-none">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
            <Sparkles size={15} />
          </div>
          <span className="text-[10px] uppercase font-extrabold tracking-wider text-amber-400">
            Guided Tip ({step + 1}/{hints.length})
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white p-1"
          title="Don't show again"
        >
          <X size={14} />
        </button>
      </div>

      <div className="text-xs font-black text-white mb-1">
        {currentHint.title}
      </div>
      <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
        {currentHint.desc}
      </p>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <button
          onClick={handleDismiss}
          className="text-[10px] text-slate-400 hover:text-white font-bold"
        >
          {language === 'am' ? 'አያስፈልገኝም' : "Don't show again"}
        </button>

        <div className="flex items-center gap-1.5">
          {step < hints.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-3 py-1 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white font-bold text-xs flex items-center gap-1 transition"
            >
              Next <ArrowRight size={11} />
            </button>
          ) : (
            <button
              onClick={handleDismiss}
              className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition"
            >
              Got it! <Check size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
