import React from 'react';
import {
  Store,
  WifiOff,
  Languages,
  CalendarCheck,
  Users,
  ShieldCheck,
  ArrowRight,
  LogIn,
  CheckCircle,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

interface GebeyaOSPublicSiteProps {
  onRegister: () => void;
  onLogin: () => void;
}

export const GebeyaOSPublicSite: React.FC<GebeyaOSPublicSiteProps> = ({
  onRegister,
  onLogin,
}) => {
  const { language, setLanguage } = useI18n();
  const isAm = language === 'am';

  const benefits = [
    {
      icon: <WifiOff className="w-8 h-8 text-emerald-400" />,
      title: isAm ? 'ከኢንተርኔት ውጭ ይሰራል (Offline-First)' : 'Works Completely Offline',
      desc: isAm
        ? 'የኢንተርኔት መቆራረጥ ስራዎን አያስተጓጉልም። በቅርንጫፍ አገልጋይ ላይ በሙሉ አቅም መሸጥና ማስተዳደር ይቀጥሉ።'
        : 'Never lose a sale to internet outages. Local LAN servers keep your checkout, inventory, and staff running 100% offline.',
    },
    {
      icon: <Languages className="w-8 h-8 text-blue-400" />,
      title: isAm ? 'በአማርኛ እና እንግሊዝኛ (Bilingual)' : 'Native Amharic & English',
      desc: isAm
        ? 'ለካሸሮች እና ለስራ አስኪያጆች ቀላልና ግልጽ የሆነ አማርኛ በሁሉም ገጾች፣ ደረሰኞችና ሪፖርቶች ላይ ይገኛል።'
        : 'Full Amharic interface, receipts, and reports tailored for local supermarket cashiers and floor managers.',
    },
    {
      icon: <CalendarCheck className="w-8 h-8 text-amber-400" />,
      title: isAm ? 'የጊዜ ማብቂያ ማስጠንቀቂያ (FEFO & Expiry)' : 'Smart Expiry Alerts & FEFO',
      desc: isAm
        ? 'እቃዎች ጊዜያቸው ከማለቁ 3 ወር በፊት ያሳውቃል፤ የዋጋ ቅናሽ (Clearance) እና መጥፋት መከላከያ ያቀርባል።'
        : 'Automated 3-month warnings, FEFO batch tracking, and clearance discounting stop expired product losses before they happen.',
    },
    {
      icon: <Users className="w-8 h-8 text-purple-400" />,
      title: isAm ? 'ለሰራተኞች በጣም ቀላል' : 'Intuitive & Easy for Staff',
      desc: isAm
        ? 'በ4 አሃዝ ፒን (PIN) በፍጥነት መግባት፣ ቀላል የመሸጫ ስክሪን፣ እና ፈጣን ስልጠና ለካሸሮች።'
        : 'Rapid 4-digit PIN unlock, large touch targets, barcode scanner support, and zero clutter make cashier onboarding instant.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black shadow-lg">
              <Store size={22} />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white">
                Gebeya<span className="text-emerald-400">OS</span>
              </span>
              <span className="ml-2 text-xs text-slate-400 font-medium hidden sm:inline">
                {isAm ? 'ዘመናዊ የሱፐርማርኬት ስርዓት' : 'Supermarket Operating System'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(isAm ? 'en' : 'am')}
              className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
            >
              {isAm ? 'English' : 'አማርኛ'}
            </button>

            <button
              onClick={onLogin}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors flex items-center gap-1.5 border border-slate-700"
            >
              <LogIn size={16} />
              {isAm ? 'ግባ' : 'Login'}
            </button>

            <button
              onClick={onRegister}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all shadow-lg shadow-emerald-950 flex items-center gap-1.5"
            >
              <Store size={16} />
              {isAm ? 'ሱፐርማርኬትዎን ያስመዝግቡ' : 'Register your supermarket'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-6 text-center max-w-4xl mx-auto flex-1 flex flex-col justify-center items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-6">
          <ShieldCheck size={14} />
          {isAm ? 'ለኢትዮጵያ ሱፐርማርኬቶች እና ሃይፐርማርኬቶች የተዘጋጀ' : 'Built for Ethiopian Retail & Supermarkets'}
        </div>

        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-tight mb-6">
          {isAm ? (
            <>
              ሱፐርማርኬትዎን በዘመናዊና <br className="hidden md:block" />
              <span className="text-emerald-400">ቀላል ስርዓት</span> ያስተዳድሩ
            </>
          ) : (
            <>
              The Complete Operating System for{' '}
              <span className="text-emerald-400">Modern Supermarkets</span>
            </>
          )}
        </h1>

        <p className="text-lg md:text-xl text-slate-300 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
          {isAm
            ? 'ሽያጭ፣ ክምችት፣ የጊዜ ማብቂያ ቁጥጥር እና ሰራተኞችን በአንድ ላይ ያቀናጁ። ከኢንተርኔት ነፃ የሚሰራ፣ በአማርኛ የተዘጋጀ እና 100% አስተማማኝ።'
            : 'POS checkout, inventory control, automated expiry alerts, and staff management — engineered for zero downtime even during full network blackouts.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center max-w-md">
          <button
            onClick={onRegister}
            className="px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base transition-all shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2"
          >
            <Store size={20} />
            {isAm ? 'ሱፐርማርኬትዎን አሁኑኑ ያስመዝግቡ' : 'Register your supermarket'}
            <ArrowRight size={18} />
          </button>

          <button
            onClick={onLogin}
            className="px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-base border border-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <LogIn size={20} />
            {isAm ? 'ወደ ሲስተምዎ ይግቡ' : 'Login to your store'}
          </button>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-16 px-6 bg-slate-900/40 border-t border-slate-800/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
              {isAm ? 'ለምን GebeyaOS ይመረጣል?' : 'Why Top Supermarkets Choose GebeyaOS'}
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              {isAm
                ? 'ለሀገር ውስጥ ሱፐርማርኬቶች ፍላጎት በልዩ ሁኔታ የተዘጋጁ ኃይለኛ ባህሪያት'
                : 'Built from the ground up for high-velocity checkout, local tax regulations, and zero-loss inventory.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {benefits.map((b, i) => (
              <div
                key={i}
                className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex gap-4"
              >
                <div className="p-3 rounded-2xl bg-slate-800/80 h-fit border border-slate-700/60">
                  {b.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">{b.title}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed font-normal">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-400">
            <Store size={16} className="text-emerald-400" />
            GebeyaOS Enterprise
          </div>
          <div>
            &copy; {new Date().getFullYear()} GebeyaOS. {isAm ? 'መብቱ በህግ የተጠበቀ ነው።' : 'All rights reserved.'}
          </div>
        </div>
      </footer>
    </div>
  );
};
