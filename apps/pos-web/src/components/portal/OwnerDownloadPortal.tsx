import React, { useState } from 'react';
import {
  Store,
  KeyRound,
  Download,
  Lock,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  LogOut,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

interface PortalApplication {
  id: string;
  supermarketName: string;
  ownerFullName: string;
  email: string;
  phone: string;
  city: string;
  address?: string | null;
  businessLicenseNo?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  licenseKey?: string | null;
  downloadReady: boolean;
}

interface OwnerDownloadPortalProps {
  onBackToLogin: () => void;
}

export const OwnerDownloadPortal: React.FC<OwnerDownloadPortalProps> = ({ onBackToLogin }) => {
  const { language, setLanguage } = useI18n();
  const isAm = language === 'am';

  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [portalToken, setPortalToken] = useState<string | null>(() =>
    sessionStorage.getItem('gebeyaos_portal_token'),
  );
  const [application, setApplication] = useState<PortalApplication | null>(() => {
    try {
      const raw = sessionStorage.getItem('gebeyaos_portal_app');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [copiedKey, setCopiedKey] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/platform/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: emailOrPhone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || (isAm ? 'መግባት አልተቻለም' : 'Invalid credentials'));
      }
      setPortalToken(data.portalToken);
      setApplication(data.application);
      sessionStorage.setItem('gebeyaos_portal_token', data.portalToken);
      sessionStorage.setItem('gebeyaos_portal_app', JSON.stringify(data.application));
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!portalToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/portal/status', {
        headers: { Authorization: `Bearer ${portalToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
        }
        throw new Error(data.message || 'Failed to refresh status');
      }
      setApplication(data);
      sessionStorage.setItem('gebeyaos_portal_app', JSON.stringify(data));
    } catch (err: any) {
      setError(err.message || 'Could not refresh status');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!portalToken || !application?.downloadReady) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/portal/download', {
        headers: { Authorization: `Bearer ${portalToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Download is locked until approval.');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match ? match[1] : 'GebeyaOS-Installer.exe';

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyKey = () => {
    if (!application?.licenseKey) return;
    navigator.clipboard.writeText(application.licenseKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleLogout = () => {
    setPortalToken(null);
    setApplication(null);
    sessionStorage.removeItem('gebeyaos_portal_token');
    sessionStorage.removeItem('gebeyaos_portal_app');
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans select-none overflow-y-auto">
      {/* Top Bar */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg">
            <Store size={22} />
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-white flex items-center gap-2">
              GebeyaOS
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {isAm ? 'የባለቤት ፖርታል' : 'Owner Portal'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isAm ? 'የማመልከቻ ሁኔታ፣ የፈቃድ ቁልፍ እና የመጫኛ ፋይል ማውረጃ' : 'Verification Status, License Key & Installer Download'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLanguage(isAm ? 'en' : 'am')}
            className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
          >
            {isAm ? 'English' : 'አማርኛ'}
          </button>
          {application && (
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut size={13} />
              <span>{isAm ? 'ውጣ' : 'Sign Out'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!application ? (
          /* ── Portal Sign-In Form ── */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-white">
                {isAm ? 'ወደ የሱፐርማርኬት ባለቤት ፖርታል ይግቡ' : 'Sign in to Owner Download Portal'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isAm
                  ? 'የማመልከቻዎን ሁኔታ ለማየት እና ሲፈቀድ የፈቃድ ቁልፍዎን እና መጫኛውን ለማውረድ በምዝገባ ወቅት የሞሉትን ኢሜይል/ስልክ እና የይለፍ ቃል ያስገቡ።'
                  : 'Enter the email or phone number and portal password you created during registration.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {isAm ? 'ኢሜይል ወይም ስልክ ቁጥር' : 'Email or Phone Number'}
              </label>
              <input
                type="text"
                required
                placeholder="owner@supermarket.et"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {isAm ? 'የፖርታል የይለፍ ቃል' : 'Portal Password'}
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onBackToLogin}
                className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} />
                {isAm ? 'ወደ መግቢያ ተመለስ' : 'Back to POS Login'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = '#register';
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  {isAm ? 'አዲስ ምዝገባ' : 'New Registration'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {loading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{isAm ? 'ግባ' : 'Check Status & Download'}</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* ── Logged-in Status & Verified Download View ── */
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-black text-white">{application.supermarketName}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {application.ownerFullName} • {application.city}
                  {application.businessLicenseNo ? ` • License: ${application.businessLicenseNo}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {application.status === 'APPROVED' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                    <CheckCircle2 size={14} /> {isAm ? 'ተፈቅዷል' : 'APPROVED'}
                  </span>
                ) : application.status === 'REJECTED' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold">
                    <XCircle size={14} /> {isAm ? 'ውድቅ ተደርጓል' : 'REJECTED'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold">
                    <Clock size={14} /> {isAm ? 'በመጠባበቅ ላይ' : 'PENDING REVIEW'}
                  </span>
                )}

                <button
                  onClick={handleRefreshStatus}
                  disabled={loading}
                  title="Refresh Status"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {application.status === 'APPROVED' ? (
              <div className="space-y-5">
                {/* License Key Box */}
                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <KeyRound size={15} />
                      {isAm ? 'የእርስዎ የማስጀመሪያ ፈቃድ ቁልፍ (License Key)' : 'Your Unique Activation / License Key'}
                    </span>
                    <ShieldCheck size={16} className="text-emerald-400" />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-emerald-500/40 font-mono text-lg font-black tracking-widest text-white text-center select-all">
                      {application.licenseKey || 'GBY-PENDING'}
                    </div>
                    <button
                      onClick={handleCopyKey}
                      className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      {copiedKey ? <Check size={15} /> : <Copy size={15} />}
                      <span>{copiedKey ? (isAm ? 'ተቀድቷል' : 'Copied') : isAm ? 'ቅዳ' : 'Copy'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-300">
                    {isAm
                      ? 'መተግበሪያውን ከጫኑ በኋላ ለመጀመሪያ ጊዜ ሲከፍቱት ይህን የፈቃድ ቁልፍ በSetup Wizard ደረጃ 1 ላይ ያስገቡ።'
                      : 'Keep this key safe. You will enter it in Step 1 of the Setup Wizard when you open GebeyaOS for the first time.'}
                  </p>
                </div>

                {/* Download Installer Card */}
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Download size={16} className="text-emerald-400" />
                      {isAm ? 'GebeyaOS የሱፐርማርኬት መጫኛ (Windows)' : 'GebeyaOS Local-Server Installer (Windows)'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {isAm
                        ? 'ያለምንም ውስብስብ የዳታቤዝ ማስተካከያ በቀላሉ የሚጫን ሙሉ ስርዓት'
                        : 'Zero-config local server & POS package ready for your shop PC'}
                    </p>
                  </div>

                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {downloading ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                    <span>{isAm ? 'መጫኛውን አውርድ' : 'Download Installer'}</span>
                  </button>
                </div>
              </div>
            ) : application.status === 'REJECTED' ? (
              <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
                <XCircle size={32} className="mx-auto text-rose-400" />
                <h3 className="text-base font-bold text-white">
                  {isAm ? 'ማመልከቻዎ አልተፈቀደም' : 'Application Not Approved'}
                </h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  {application.rejectionReason ||
                    (isAm
                      ? 'የንግድ ፈቃድ ወይም የተሰጠው መረጃ ማረጋገጫ አላለፈም።'
                      : 'Your submitted business details could not be verified.')}
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                  <Lock size={13} />
                  <span>{isAm ? 'ማውረድ ተቆልፏል' : 'Download Access Locked'}</span>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
                <Clock size={32} className="mx-auto text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  {isAm ? 'የአስተዳዳሪ ማረጋገጫ በመጠባበቅ ላይ' : 'Waiting for Admin Approval'}
                </h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                  {isAm
                    ? 'የንግድ ፈቃድዎ እና የሱፐርማርኬት መረጃዎ በቡድናችን እየተገመገመ ነው። እንደተፈቀደ የፈቃድ ቁልፍዎ እና የመጫኛ ፋይሉ እዚህ ይከፈታሉ።'
                    : 'Our admin team is reviewing your business license and store details. Once approved, your License Key and installer download will unlock right here.'}
                </p>
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-400">
                  <Lock size={14} className="text-amber-400" />
                  <span>{isAm ? 'ማውረድ እስኪፈቀድ ድረስ ተቆልፏል' : 'Download locked until admin verification'}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
