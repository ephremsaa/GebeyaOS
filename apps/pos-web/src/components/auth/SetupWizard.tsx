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
      setError('Please fill in all owner account fields.');
      return;
    }
    if (ownerPassword.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }
    if (ownerPin.length < 4 || ownerPin.length > 6) {
      setError('Cashier PIN must be 4 to 6 digits.');
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
      setError(res.error || 'Failed to complete setup.');
    }
  };

  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center p-4 select-none"
      style={{ background: 'var(--bg-page)', color: 'var(--text-main)' }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gebeya-600 text-white flex items-center justify-center shadow-lg shadow-gebeya-600/30">
              <Store size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{t('setupWizardTitle')}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('setupWizardSubtitle')}</p>
            </div>
          </div>
          <span className="badge-warning text-xs font-bold px-3 py-1">Step {step} of 3</span>
        </div>

        {error && (
          <div className="alert-danger flex items-center gap-2 text-sm p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Store & Branch */}
        {step === 1 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-150">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Store size={18} className="text-gebeya-600" />
              1. Store Identity &amp; Fiscal Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">{t('companyName')}</label>
                <input
                  type="text"
                  required
                  className="field-input mt-1"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Trade / Legal Name</label>
                <input
                  type="text"
                  className="field-input mt-1"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">{t('branchCode')}</label>
                <input
                  type="text"
                  required
                  className="field-input mt-1 font-mono uppercase"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="field-label">{t('branchNameLabel')}</label>
                <input
                  type="text"
                  required
                  className="field-input mt-1"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">{t('tinNumber')}</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  className="field-input mt-1 font-mono"
                  value={tinNumber}
                  onChange={(e) => setTinNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Default Currency &amp; VAT</label>
                <div className="flex gap-2 mt-1">
                  <span className="field-input w-24 bg-slate-100 dark:bg-slate-800 text-center font-bold">
                    ETB (ብር)
                  </span>
                  <span className="field-input flex-1 bg-slate-100 dark:bg-slate-800 text-center font-bold">
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
                    setError('Please complete store name, branch code, and TIN.');
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
                className="btn-primary"
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Language & Receipts */}
        {step === 2 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-150">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-gebeya-600" />
              2. Language &amp; Receipt Template
            </h2>

            <div>
              <label className="field-label">System Language</label>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`flex-1 py-3 rounded-2xl border font-bold text-sm transition-all ${
                    language === 'en'
                      ? 'border-gebeya-600 bg-gebeya-50 dark:bg-gebeya-950/40 text-gebeya-600'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  English (EN)
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('am')}
                  className={`flex-1 py-3 rounded-2xl border font-bold text-sm transition-all ${
                    language === 'am'
                      ? 'border-gebeya-600 bg-gebeya-50 dark:bg-gebeya-950/40 text-gebeya-600'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  አማርኛ (Amharic)
                </button>
              </div>
            </div>

            <div>
              <label className="field-label">Receipt Header Message</label>
              <input
                type="text"
                className="field-input mt-1"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Receipt Footer Message</label>
              <input
                type="text"
                className="field-input mt-1"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
              />
            </div>

            <div className="flex justify-between mt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-secondary"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(3);
                }}
                className="btn-primary"
              >
                Next: Owner Account <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Owner Credentials */}
        {step === 3 && (
          <form onSubmit={handleFinish} className="flex flex-col gap-4 animate-in fade-in duration-150">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <ShieldCheck size={18} className="text-gebeya-600" />
              3. {t('ownerAccount')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">{t('ownerFullName')}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dawit Haile"
                  className="field-input mt-1"
                  value={ownerFullName}
                  onChange={(e) => setOwnerFullName(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">{t('ownerPhone')}</label>
                <input
                  type="text"
                  required
                  className="field-input mt-1 font-mono"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">{t('ownerUsername')}</label>
                <input
                  type="text"
                  required
                  className="field-input mt-1 font-mono"
                  value={ownerUsername}
                  onChange={(e) => setOwnerUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">{t('ownerPin')}</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="••••"
                  className="field-input mt-1 font-mono tracking-widest text-center"
                  value={ownerPin}
                  onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">{t('ownerPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={10}
                  placeholder="Min 10 characters"
                  className="field-input mt-1"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 mt-1">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>Permanent Lock:</strong> Once completed, the setup wizard will lock permanently. All additional staff members must be invited by the Owner through the Staff Directory.
              </span>
            </div>

            <div className="flex justify-between mt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-secondary"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
              >
                {isLoading ? 'Configuring System...' : t('finishSetup')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
