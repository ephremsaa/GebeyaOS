import React, { useState, useEffect } from 'react';
import {
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Clock,
  Store,
  Monitor,
  GitBranch,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

interface RegisterApplicationPageProps {
  onBackToLogin: () => void;
}

const RESERVED_SLUGS = new Set([
  'gebeyaos',
  'admin',
  'platform',
  'system',
  'root',
  'api',
  'superadmin',
  'official',
  'support',
  'auth',
]);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export const RegisterApplicationPage: React.FC<RegisterApplicationPageProps> = ({
  onBackToLogin,
}) => {
  const { language, setLanguage } = useI18n();
  const isAm = language === 'am';

  const [supermarketName, setSupermarketName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [ownerFullName, setOwnerFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Addis Ababa');
  const [address, setAddress] = useState('');
  const [branchesCount, setBranchesCount] = useState<number>(1);
  const [terminalsCount, setTerminalsCount] = useState<number>(2);
  const [notes, setNotes] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedApp, setSubmittedApp] = useState<{ id: string; status: string } | null>(null);

  // Auto-generate company code slug from supermarket name unless manually edited
  useEffect(() => {
    if (!codeManuallyEdited && supermarketName) {
      const generated = slugify(supermarketName);
      setCompanyCode(generated);
    }
  }, [supermarketName, codeManuallyEdited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = supermarketName.trim();
    if (!trimmedName) {
      setError(isAm ? 'እባክዎ የሱፐርማርኬቱን ስም ያስገቡ' : 'Supermarket name is required');
      return;
    }

    const trimmedCode = (companyCode || slugify(trimmedName)).trim().toLowerCase();
    if (RESERVED_SLUGS.has(trimmedCode)) {
      setError(
        isAm
          ? 'ይህ የስርዓት መለያ የተጠበቀ ነው፤ እባክዎ ሌላ መለያ ይምረጡ'
          : 'This company code is reserved by the platform. Please choose another code.',
      );
      return;
    }

    if (!ownerFullName.trim()) {
      setError(isAm ? 'እባክዎ የባለቤቱን ሙሉ ስም ያስገቡ' : 'Owner full name is required');
      return;
    }
    if (!phone.trim()) {
      setError(isAm ? 'እባክዎ ስልክ ቁጥር ያስገቡ' : 'Phone number is required');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError(isAm ? 'እባክዎ ትክክለኛ ኢሜይል ያስገቡ' : 'Valid email address is required');
      return;
    }
    if (!acceptTerms) {
      setError(
        isAm
          ? 'እባክዎ የአገልግሎት ውሎችን እና ደንቦችን ይቀበሉ'
          : 'Please accept the terms and conditions to proceed',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/platform/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supermarketName: trimmedName,
          ownerFullName: ownerFullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          city: city.trim(),
          address: address.trim() || undefined,
          notes: `[Code: ${trimmedCode} | Branches: ${branchesCount} | Terminals: ${terminalsCount}] ${notes.trim()}`,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSubmittedApp(data);
      } else {
        setError(data.message || (isAm ? 'ማመልከቻውን መላክ አልተቻለም' : 'Failed to submit application'));
      }
    } catch {
      setError(isAm ? 'የኔትወርክ ስህተት አጋጥሟል' : 'Network error submitting application');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans select-none overflow-y-auto">
      {/* Top Brand & Language Bar */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black shadow-lg">
            <Store size={22} />
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              GebeyaOS <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Enterprise</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isAm ? 'የሱፐርማርኬት ምዝገባ ማመልከቻ' : 'Supermarket Onboarding Application'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setLanguage(isAm ? 'en' : 'am')}
          className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 transition-all"
        >
          {isAm ? 'English' : 'አማርኛ'}
        </button>
      </div>

      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {submittedApp ? (
          <div className="text-center py-6 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center mb-5 shadow-xl">
              <CheckCircle2 size={32} />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              {isAm ? 'ማመልከቻዎ በተሳካ ሁኔታ ደርሷል!' : 'Application Submitted Successfully!'}
            </h2>

            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed mb-6">
              {isAm
                ? `ለሱፐርማርኬት "${supermarketName}" የቀረበው ማመልከቻ በደህንነት ተቀብለናል። የፕላትፎርም አስተዳዳሪዎች ዝርዝሩን ካረጋገጡ በኋላ የማስጀመሪያ ሊንክ ወደ ${email} እና ${phone} ይልካሉ።`
                : `Your application for "${supermarketName}" has been received. Our platform team will review your business credentials and dispatch a secure setup activation link to ${email} and ${phone}.`}
            </p>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 max-w-md mx-auto text-left mb-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAm ? 'የሱፐርማርኬት ስም' : 'Supermarket'}:</span>
                <span className="font-bold text-white text-xs">{supermarketName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAm ? 'የስርዓት መለያ ኮድ' : 'Company Code'}:</span>
                <span className="font-mono font-bold text-emerald-400 text-xs">{companyCode || slugify(supermarketName)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAm ? 'የማመልከቻ መለያ' : 'Application Reference'}:</span>
                <span className="font-mono font-bold text-slate-300 text-[11px]">{submittedApp.id}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAm ? 'ሁኔታ' : 'Status'}:</span>
                <span className="inline-flex items-center gap-1 font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px] border border-amber-500/20">
                  <Clock size={12} /> {isAm ? 'ግምገማ ላይ' : 'Under Review'}
                </span>
              </div>
            </div>

            <button
              onClick={onBackToLogin}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-md"
            >
              <ArrowLeft size={14} />
              {isAm ? 'ወደ መግቢያ ገጽ ተመለስ' : 'Return to Login'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h1 className="text-lg font-bold text-white">
                {isAm ? 'ሱፐርማርኬትዎን በGebeyaOS ያስመዝግቡ' : 'Apply to Join GebeyaOS'}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {isAm
                  ? 'የሱፐርማርኬትዎን እና የባለቤቱን መረጃ ያስገቡ። ጥያቄዎ በፕላትፎርም አስተዳዳሪዎች ተገምግሞ የማስጀመሪያ ሊንክ ይላክልዎታል።'
                  : 'Submit your supermarket and ownership details. Once verified by our platform team, you will receive an activation link to set up your store.'}
              </p>
            </div>

            {/* Live Branding Preview */}
            {supermarketName.trim() && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-md">
                    {supermarketName.trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[11px] text-emerald-400 font-semibold">
                      {isAm ? 'ሲስተምዎ የሚታየው እንዲህ ነው:' : 'Your system will appear as:'}
                    </div>
                    <div className="text-sm font-extrabold text-white tracking-wide">
                      {supermarketName.trim()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-mono block">
                    code: <span className="text-emerald-300 font-bold">{companyCode || slugify(supermarketName)}</span>
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Building2 size={13} className="text-emerald-400" />
                  {isAm ? 'የሱፐርማርኬት ስም' : 'Supermarket Name'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kerod Supermarket"
                  value={supermarketName}
                  onChange={(e) => setSupermarketName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Store size={13} className="text-emerald-400" />
                  {isAm ? 'የስርዓት አድራሻ / ኮድ' : 'Company Address Code (slug)'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. kerod"
                  value={companyCode}
                  onChange={(e) => {
                    setCodeManuallyEdited(true);
                    setCompanyCode(slugify(e.target.value));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-400 placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <User size={13} className="text-emerald-400" />
                  {isAm ? 'የባለቤቱ ሙሉ ስም' : 'Owner Full Name'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dawit Yohannes"
                  value={ownerFullName}
                  onChange={(e) => setOwnerFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Phone size={13} className="text-emerald-400" />
                  {isAm ? 'ስልክ ቁጥር' : 'Phone Number'} *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+251 91 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Mail size={13} className="text-emerald-400" />
                  {isAm ? 'ኢሜይል አድራሻ' : 'Email Address'} *
                </label>
                <input
                  type="email"
                  required
                  placeholder="owner@supermarket.et"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <MapPin size={13} className="text-emerald-400" />
                  {isAm ? 'ከተማ' : 'City / Region'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Addis Ababa"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <GitBranch size={13} className="text-emerald-400" />
                  {isAm ? 'የቅርንጫፎች ብዛት' : 'Number of Branches'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={branchesCount}
                  onChange={(e) => setBranchesCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Monitor size={13} className="text-emerald-400" />
                  {isAm ? 'የመሸጫ ተርሚናሎች ብዛት' : 'Terminals / POS Counters'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={terminalsCount}
                  onChange={(e) => setTerminalsCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" />
                {isAm ? 'ክፍለ ከተማ / አድራሻ' : 'Street / Subcity Address'}
              </label>
              <input
                type="text"
                placeholder="e.g. Bole Medhanialem, Mega Mall"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Terms and conditions */}
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <span>
                  {isAm
                    ? 'የአገልግሎት ውሎችን እና የውሂብ ደህንነት ደንቦችን ተቀብያለሁ።'
                    : 'I agree to the Terms of Service and Privacy Policy.'}
                </span>
              </label>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-800">
              <button
                type="button"
                onClick={onBackToLogin}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft size={14} />
                {isAm ? 'ወደ መግቢያ ተመለስ' : 'Back to Login'}
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !acceptTerms}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-950"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{isAm ? 'በመላክ ላይ...' : 'Submitting...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isAm ? 'ማመልከቻ አስገባ' : 'Submit Application'}</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 text-center text-[11px] text-slate-500">
        GebeyaOS Ethiopian Supermarket Operating System • Enterprise Multi-Tenant Platform
      </div>
    </div>
  );
};
