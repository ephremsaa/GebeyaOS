import React, { useState, useEffect } from 'react';
import {
  Building2,
  Receipt,
  Store,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  FileSpreadsheet,
  Users,
  Key,
  Globe,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

interface TenantOnboardingWizardProps {
  token: string;
  onComplete: () => void;
}

export const TenantOnboardingWizard: React.FC<TenantOnboardingWizardProps> = ({
  token,
  onComplete,
}) => {
  const { setLanguage } = useI18n();
  const [step, setStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [inviteData, setInviteData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [tinNumber, setTinNumber] = useState('0012345678');
  const [defaultLanguage, setDefaultLanguageState] = useState<'am' | 'en'>('am');
  const [vatRate, setVatRate] = useState<number>(0.15);
  const [vatInclusive, setVatInclusive] = useState<boolean>(false);
  const [vatNumber, setVatNumber] = useState('');

  // Branding
  const [logoUrl, setLogoUrl] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('Thank you for shopping with us! / እናመሰግናለን!');

  // First Branch
  const [branchCode, setBranchCode] = useState('MAIN-01');
  const [branchName, setBranchName] = useState('');
  const [branchCity, setBranchCity] = useState('Addis Ababa');
  const [branchPhone, setBranchPhone] = useState('+251 11 123 4567');

  // Owner Credentials
  const [ownerUsername, setOwnerUsername] = useState('owner');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerPin, setOwnerPin] = useState('');

  // Completed Checklist State
  const [completedResult, setCompletedResult] = useState<any | null>(null);

  useEffect(() => {
    const fetchInvite = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/onboarding/invite/${token}`);
        const data = await res.json();
        if (res.ok) {
          setInviteData(data);
          setCompanyName(data.tenantName || '');
          setBranchName(`${data.tenantName} - Flagship Branch`);
          setReceiptHeader(`${data.tenantName}`);
          if (data.inviteeEmail && data.inviteeEmail.includes('@')) {
            // default email
          }
          if (data.inviteePhone) {
            setOwnerPhone(data.inviteePhone);
          }
          if (data.wizardState?.ownerName) {
            setOwnerFullName(data.wizardState.ownerName);
          }
        } else {
          setError(data.message || 'Invitation link is invalid or expired.');
        }
      } catch {
        setError('Cannot connect to server. Please ensure the LAN server is online.');
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchInvite();
    }
  }, [token]);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsValidating(true);

    try {
      const payload = {
        token,
        companyName,
        tradeName: tradeName || companyName,
        tinNumber,
        vatSettings: {
          rate: vatRate,
          inclusive: vatInclusive,
          vatNumber: vatNumber || undefined,
        },
        defaultLanguage,
        receiptHeader,
        receiptFooter,
        logoUrl: logoUrl || undefined,
        branchCode,
        branchName,
        branchCity,
        branchPhone,
        ownerUsername,
        ownerFullName,
        ownerPhone,
        ownerPassword,
        ownerPin,
      };

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        // Save session credentials
        sessionStorage.setItem('gebeyaos_token', data.accessToken);
        localStorage.setItem('gebeyaos_token', data.accessToken);
        setLanguage(defaultLanguage);
        setCompletedResult(data);
        setStep(5); // Show checklist step
      } else {
        setError(data.message || 'Failed to complete onboarding setup.');
      }
    } catch {
      setError('Network error while completing setup.');
    } finally {
      setIsValidating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans select-none">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-spin">
            <Building2 size={24} />
          </div>
          <p className="text-sm font-semibold text-slate-300">Validating supermarket onboarding invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans select-none">
        <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center mb-4">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Invalid or Expired Invitation</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            Return to POS Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans select-none overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl my-8 relative overflow-hidden">
        {/* Step Indicator */}
        {step < 5 && (
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
            <div>
              <div className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                Step {step} of 4 • Supermarket Onboarding
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
                {step === 1 && 'Company Profile & Fiscal Setup'}
                {step === 2 && 'Branding & Receipt Customization'}
                {step === 3 && 'First Branch & Terminal'}
                {step === 4 && 'Owner Account Credentials'}
              </h1>
            </div>

            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`w-7 h-2 rounded-full transition-all ${
                    i === step
                      ? 'bg-emerald-500 w-10'
                      : i < step
                      ? 'bg-emerald-700'
                      : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle size={16} className="shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Company Profile & Fiscal Details */}
        {step === 1 && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Supermarket / Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Maya Supermarket PLC"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Trade Name (Brand Name)</label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder="e.g., Maya Supermarket"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Ethiopian 10-Digit TIN Number</label>
                <input
                  type="text"
                  value={tinNumber}
                  maxLength={10}
                  onChange={(e) => setTinNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="0012345678"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Default System Language</label>
                <select
                  value={defaultLanguage}
                  onChange={(e) => setDefaultLanguageState(e.target.value as 'am' | 'en')}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="am">አማርኛ (Amharic)</option>
                  <option value="en">English (US)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Default VAT Rate</label>
                <select
                  value={vatRate}
                  onChange={(e) => setVatRate(parseFloat(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                >
                  <option value={0.15}>15% Standard Ethiopian VAT</option>
                  <option value={0.0}>0% Tax Exempt</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!companyName || !tinNumber}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              >
                Continue to Branding <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Branding & Receipt */}
        {step === 2 && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Supermarket Logo URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png (optional)"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Printed Receipt Header</label>
              <input
                type="text"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
                placeholder="e.g., Maya Supermarket - Bole Medhanialem"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Printed Receipt Footer</label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="e.g., Thank you for shopping with us! / እናመሰግናለን!"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Receipt Preview */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1 font-mono text-[11px] text-center text-slate-400">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">
                80mm Thermal Receipt Simulation
              </div>
              <div className="font-bold text-slate-200">{receiptHeader || companyName}</div>
              <div>TIN: {tinNumber} • VAT: 15%</div>
              <div className="border-t border-dashed border-slate-800 my-1 pt-1">==============================</div>
              <div className="flex justify-between px-2 text-[10px]">
                <span>1x Fresh Teff 5KG</span>
                <span>450.00 ETB</span>
              </div>
              <div className="border-b border-dashed border-slate-800 my-1 pb-1">==============================</div>
              <div className="text-slate-400">{receiptFooter}</div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold flex items-center gap-1.5"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-emerald-950/40"
              >
                Continue to First Branch <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: First Branch & Terminal */}
        {step === 3 && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">First Branch Code</label>
                <input
                  type="text"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  placeholder="e.g., MAIN-01 or BOLE-01"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Branch Name</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g., Bole Medhanialem Flagship"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">City / Region</label>
                <input
                  type="text"
                  value={branchCity}
                  onChange={(e) => setBranchCity(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Branch Contact Phone</label>
                <input
                  type="text"
                  value={branchPhone}
                  onChange={(e) => setBranchPhone(e.target.value)}
                  placeholder="+251 11 123 4567"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60 text-slate-400 text-xs">
              <span className="text-emerald-400 font-semibold">Automatic Lane Terminal:</span> A primary POS terminal (<code className="text-white font-mono">POS-01</code>) will be created automatically for this branch.
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold flex items-center gap-1.5"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={!branchCode || !branchName}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              >
                Owner Security Credentials <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Owner Credentials */}
        {step === 4 && (
          <form onSubmit={handleFinish} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Owner Full Name</label>
                <input
                  type="text"
                  value={ownerFullName}
                  onChange={(e) => setOwnerFullName(e.target.value)}
                  required
                  placeholder="e.g., Maya Hailu"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Owner Username</label>
                <input
                  type="text"
                  value={ownerUsername}
                  onChange={(e) => setOwnerUsername(e.target.value.toLowerCase())}
                  required
                  placeholder="e.g., maya_owner"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Master Password (min 8 chars)</label>
                <input
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Fast Cashier PIN (4-6 digits)</label>
                <input
                  type="password"
                  value={ownerPin}
                  onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                  required
                  minLength={4}
                  maxLength={6}
                  placeholder="••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono tracking-widest text-center focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold flex items-center gap-1.5"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="submit"
                disabled={isValidating || !ownerFullName || !ownerPassword || !ownerPin}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              >
                {isValidating ? 'Provisioning...' : 'Complete Supermarket Setup'} <Sparkles size={14} />
              </button>
            </div>
          </form>
        )}

        {/* STEP 5: Post-Setup Checklist */}
        {step === 5 && completedResult && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h2 className="text-xl font-bold text-white mb-1">
                {companyName} is Ready!
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Your isolated supermarket environment, branch LAN server, and master owner credentials have been created successfully.
              </p>
            </div>

            {/* Checklist */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 text-left space-y-3">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Recommended Setup Checklist:
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={16} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-xs text-slate-200">1. Import Products from Excel</div>
                  <div className="text-[11px] text-slate-400">Bulk upload your supermarket catalog, barcodes, and prices.</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <Users size={16} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-xs text-slate-200">2. Add Store Cashiers & Staff</div>
                  <div className="text-[11px] text-slate-400">Create staff logins and assign 4-digit POS quick PINs.</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                  <Store size={16} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-xs text-slate-200">3. Activate Additional Store Branches</div>
                  <div className="text-[11px] text-slate-400">Generate single-use branch activation codes from Settings.</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                window.location.hash = '';
                onComplete();
              }}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/40"
            >
              Enter Backoffice & Cashier POS
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

