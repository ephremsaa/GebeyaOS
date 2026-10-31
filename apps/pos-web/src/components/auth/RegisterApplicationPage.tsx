import React, { useState } from 'react';
import {
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Clock,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

interface RegisterApplicationPageProps {
  onBackToLogin: () => void;
}

export const RegisterApplicationPage: React.FC<RegisterApplicationPageProps> = ({
  onBackToLogin,
}) => {
  const { language, setLanguage } = useI18n();

  const [supermarketName, setSupermarketName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Addis Ababa');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedApp, setSubmittedApp] = useState<{ id: string; status: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supermarketName.trim()) {
      setError(language === 'am' ? 'እባክዎ የሱፐርማርኬቱን ስም ያስገቡ' : 'Supermarket name is required');
      return;
    }
    if (!ownerFullName.trim()) {
      setError(language === 'am' ? 'እባክዎ የባለቤቱን ሙሉ ስም ያስገቡ' : 'Owner full name is required');
      return;
    }
    if (!phone.trim()) {
      setError(language === 'am' ? 'እባክዎ ስልክ ቁጥር ያስገቡ' : 'Phone number is required');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError(language === 'am' ? 'እባክዎ ትክክለኛ ኢሜይል ያስገቡ' : 'Valid email address is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/platform/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supermarketName: supermarketName.trim(),
          ownerFullName: ownerFullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          city: city.trim(),
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSubmittedApp(data);
      } else {
        setError(data.message || (language === 'am' ? 'ማመልከቻውን መላክ አልተቻለም' : 'Failed to submit application'));
      }
    } catch {
      setError(language === 'am' ? 'የኔትወርክ ስህተት አጋጥሟል' : 'Network error submitting application');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans select-none overflow-y-auto">
      {/* Top Brand & Language Bar */}
      <div className="w-full max-w-xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black shadow-lg">
            <Store size={22} />
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              GebeyaOS <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Enterprise</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {language === 'am' ? 'የሱፐርማርኬት ምዝገባ ማመልከቻ' : 'Supermarket Onboarding Application'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setLanguage(language === 'am' ? 'en' : 'am')}
          className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 transition-all"
        >
          {language === 'am' ? 'English' : 'አማርኛ'}
        </button>
      </div>

      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {submittedApp ? (
          <div className="text-center py-6 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center mb-5 shadow-xl">
              <CheckCircle2 size={32} />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              {language === 'am' ? 'ማመልከቻዎ በተሳካ ሁኔታ ደርሷል!' : 'Application Submitted Successfully!'}
            </h2>

            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed mb-6">
              {language === 'am'
                ? `ለሱፐርማርኬት "${supermarketName}" የቀረበው ማመልከቻ በደህንነት ተቀብለናል። የፕላትፎርም ኦፕሬተሮች ዝርዝሩን ካረጋገጡ በኋላ የማስጀመሪያ ሊንክ ወደ ${email} እና ${phone} ይልካሉ።`
                : `Your application for "${supermarketName}" has been received. Our platform team will review your business credentials and dispatch a secure setup activation link to ${email} and ${phone}.`}
            </p>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 max-w-md mx-auto text-left mb-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{language === 'am' ? 'የማመልከቻ መለያ' : 'Application Reference'}:</span>
                <span className="font-mono font-bold text-emerald-400 text-[11px]">{submittedApp.id}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{language === 'am' ? 'ሁኔታ' : 'Status'}:</span>
                <span className="inline-flex items-center gap-1 font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px] border border-amber-500/20">
                  <Clock size={12} /> {language === 'am' ? 'ግምገማ ላይ' : 'Under Review'}
                </span>
              </div>
            </div>

            <button
              onClick={onBackToLogin}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-md"
            >
              <ArrowLeft size={14} />
              {language === 'am' ? 'ወደ መግቢያ ገጽ ተመለስ' : 'Return to Login'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h1 className="text-lg font-bold text-white">
                {language === 'am' ? 'ሱፐርማርኬትዎን በGebeyaOS ያስመዝግቡ' : 'Apply to Join GebeyaOS'}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {language === 'am'
                  ? 'የሱፐርማርኬትዎን እና የባለቤቱን መረጃ ያስገቡ። ጥያቄዎ በፕላትፎርም አስተዳዳሪዎች ተገምግሞ የማስጀመሪያ ሊንክ ይላክልዎታል።'
                  : 'Submit your supermarket and ownership details. Once verified by our platform team, you will receive a 72-hour invite link to set up your store.'}
              </p>
            </div>

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
                  {language === 'am' ? 'የሱፐርማርኬት ስም' : 'Supermarket Name'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Friendship Hypermarket"
                  value={supermarketName}
                  onChange={(e) => setSupermarketName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <User size={13} className="text-emerald-400" />
                  {language === 'am' ? 'የባለቤቱ ሙሉ ስም' : 'Owner Full Name'} *
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
                  {language === 'am' ? 'ስልክ ቁጥር' : 'Phone Number'} *
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
                  {language === 'am' ? 'ኢሜይል አድራሻ' : 'Email Address'} *
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
                  {language === 'am' ? 'ከተማ' : 'City / Region'} *
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
                  <MapPin size={13} className="text-emerald-400" />
                  {language === 'am' ? 'ክፍለ ከተማ / አድራሻ' : 'Street / Subcity Address'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bole Medhanialem, Mega Mall"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <FileText size={13} className="text-slate-400" />
                {language === 'am' ? 'ተጨማሪ ማስታወሻ ወይም መስፈርቶች' : 'Additional Notes / Expected Branches'}
              </label>
              <textarea
                rows={2}
                placeholder={language === 'am' ? 'ስለ ቅርንጫፎች ብዛት ወይም ልዩ ፍላጎት ካለ እዚህ ይግለጹ...' : 'Mention expected number of branches, POS counters, or specific requirements...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 transition-colors resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <button
                type="button"
                onClick={onBackToLogin}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft size={14} />
                {language === 'am' ? 'ወደ መግቢያ ተመለስ' : 'Back to Login'}
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-950"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{language === 'am' ? 'በመላክ ላይ...' : 'Submitting...'}</span>
                  </>
                ) : (
                  <>
                    <span>{language === 'am' ? 'ማመልከቻ አስገባ' : 'Submit Application'}</span>
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

