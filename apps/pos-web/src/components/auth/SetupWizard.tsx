import React, { useState } from 'react';
import { Store, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

export const SetupWizard: React.FC = () => {
  const { executeSetup, isLoading } = useAuth();
  const { t, language, setLanguage } = useI18n();

  const [step, setStep] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [currency] = useState('ETB');
  const [defaultVatRate] = useState(0.15);
  const [receiptHeader, setReceiptHeader] = useState('Gebeya Supermarket - Bole Medhanialem');
  const [receiptFooter, setReceiptFooter] = useState('Thank you for shopping with us! / እናመሰግናለን!');

  // Owner state
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerPin, setOwnerPin] = useState('');

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ownerFullName || !ownerPassword || !ownerPin) {
      setError(language === 'am' ? 'እባክዎ ሁሉንም የባለቤት መለያ መስኮች ይሙሉ' : 'Please fill in all owner account fields.');
      return;
    }
    if (ownerPassword.length < 10) {
      setError(language === 'am' ? 'የይለፍ ቃል ቢያንስ 10 ፊደላት/ቁጥሮች መሆን አለበት' : 'Password must be at least 10 characters long.');
      return;
    }
    if (ownerPin.length < 4 || ownerPin.length > 6) {
      setError(language === 'am' ? 'የገንዘብ ተቀባይ ፒን ከ4 እስከ 6 አሃዝ መሆን አለበት' : 'Cashier PIN must be 4 to 6 digits.');
      return;
    }

    const payload = {
      companyName,
      tradeName,
      branchCode,
      branchName,
      tinNumber,
      currency,
      defaultVatRate,
      language,
      receiptHeader,
      receiptFooter,
      ownerFullName,
      ownerUsername,
      ownerPhone,
      ownerPassword,
      ownerPin,
    };

    const res = await executeSetup(payload);
    if (!res.success) {
      setError(res.error || (language === 'am' ? 'ማዋቀሩን ማጠናቀቅ አልተቻለም' : 'Failed to complete setup.'));
    }
  };

  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center p-4 select-none bg-page text-text-main"
    >
      <div className="w-full max-w-2xl bg-surface border border-border-subtle rounded-3xl shadow-modal p-6 sm:p-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg">
              <Store size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-text-main">{t('auth.setupWizardTitle')}</h1>
              <p className="text-xs text-text-muted">{t('auth.setupWizardSubtitle')}</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-secondary text-primary border border-primary/20">
            {language === 'am' ? `ደረጃ ${step} ከ 3` : `Step ${step} of 3`}
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-danger/10 text-danger border border-danger/20">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Store & Branch */}
        {step === 1 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-150">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2">
              <Store size={18} className="text-primary" />
              {t('auth.setupStep1')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.companyName')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main text-sm focus:outline-hidden focus:border-primary"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('settings.tradeName')}</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main text-sm focus:outline-hidden focus:border-primary"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.branchCode')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main font-mono uppercase text-sm focus:outline-hidden focus:border-primary"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.branchNameLabel')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main text-sm focus:outline-hidden focus:border-primary"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.tinNumber')}</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main font-mono text-sm focus:outline-hidden focus:border-primary"
                  value={tinNumber}
                  onChange={(e) => setTinNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('settings.tabFiscal')}</label>
                <div className="flex gap-2">
                  <span className="w-24 px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-center font-bold text-sm text-text-main">
                    ETB (ብር)
                  </span>
                  <span className="flex-1 px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-center font-bold text-sm text-text-main">
                    15% VAT (ተ.እ.ታ)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => {
                  if (!companyName || !branchCode || !tinNumber) {
                    setError(language === 'am' ? 'እባክዎ የመደብር ስም፣ የቅርንጫፍ ኮድ እና የግብር ከፋይ ቁጥር (TIN) ይሙሉ' : 'Please complete store name, branch code, and TIN.');
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
                className="btn-primary px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm cursor-pointer"
              >
                {t('common.next')} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Language & Receipts */}
        {step === 2 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-150">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2">
              <CheckCircle2 size={18} className="text-primary" />
              {t('auth.setupStep2')}
            </h2>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">{t('common.language')}</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`flex-1 py-3 rounded-2xl border font-bold text-sm transition-all cursor-pointer ${
                    language === 'en'
                      ? 'border-primary bg-secondary/40 text-primary shadow-xs'
                      : 'border-border-subtle text-text-muted hover:text-text-main bg-surface-2'
                  }`}
                >
                  English (EN)
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('am')}
                  className={`flex-1 py-3 rounded-2xl border font-bold text-sm transition-all cursor-pointer ${
                    language === 'am'
                      ? 'border-primary bg-secondary/40 text-primary shadow-xs'
                      : 'border-border-subtle text-text-muted hover:text-text-main bg-surface-2'
                  }`}
                >
                  አማርኛ (Amharic)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">{t('settings.greetingMessage')}</label>
              <input
                type="text"
                className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main text-sm focus:outline-hidden focus:border-primary"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">{t('settings.returnPolicy')}</label>
              <input
                type="text"
                className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main text-sm focus:outline-hidden focus:border-primary"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
              />
            </div>

            <div className="flex justify-between mt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-secondary px-4 py-2.5 rounded-xl flex items-center gap-1.5 font-semibold text-sm cursor-pointer"
              >
                <ArrowLeft size={16} /> {t('common.back')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(3);
                }}
                className="btn-primary px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm cursor-pointer"
              >
                {t('common.next')} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Owner Credentials */}
        {step === 3 && (
          <form onSubmit={handleFinish} className="flex flex-col gap-4 animate-in fade-in duration-150">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              {t('auth.setupStep3')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.ownerFullName')}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dawit Haile"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main text-sm focus:outline-hidden focus:border-primary"
                  value={ownerFullName}
                  onChange={(e) => setOwnerFullName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.ownerPhone')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main font-mono text-sm focus:outline-hidden focus:border-primary"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.ownerUsername')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main font-mono text-sm focus:outline-hidden focus:border-primary"
                  value={ownerUsername}
                  onChange={(e) => setOwnerUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.ownerPin')}</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main font-mono tracking-widest text-center text-sm focus:outline-hidden focus:border-primary"
                  value={ownerPin}
                  onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-text-muted mb-1">{t('auth.ownerPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={10}
                  placeholder="Min 10 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main text-sm focus:outline-hidden focus:border-primary font-mono"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2 mt-1">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{t('auth.permanentLockNotice')}</span>
            </div>

            <div className="flex justify-between mt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-secondary px-4 py-2.5 rounded-xl flex items-center gap-1.5 font-semibold text-sm cursor-pointer"
              >
                <ArrowLeft size={16} /> {t('common.back')}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm cursor-pointer shadow-md"
              >
                {isLoading ? (language === 'am' ? 'ስርዓቱን በማዋቀር ላይ...' : 'Configuring System...') : t('auth.finishSetup')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
