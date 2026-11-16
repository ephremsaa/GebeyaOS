import React, { useState, useEffect } from 'react';
import { I18nProvider } from './i18n/I18nContext';
import { BrandProvider } from './brand/BrandContext';
import { BrandThemeProvider } from './theme/BrandThemeContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ShiftProvider } from './context/ShiftContext';
import { TopBar } from './components/TopBar';
import { NavigationRail, NavTabId } from './components/NavigationRail';
import { CommandPalette } from './components/CommandPalette';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { OnboardingHints } from './components/OnboardingHints';
import { SessionExpiredDialog } from './components/auth/SessionExpiredDialog';
import { LoginPage } from './components/auth/LoginPage';
import { PinPadModal } from './components/auth/PinPadModal';
import { SetupWizard } from './components/auth/SetupWizard';
import { PlatformAdminConsole } from './components/platform/PlatformAdminConsole';
import { TenantOnboardingWizard } from './components/onboarding/TenantOnboardingWizard';
import { RegisterApplicationPage } from './components/auth/RegisterApplicationPage';
import { GebeyaOSPublicSite } from './components/public/GebeyaOSPublicSite';

// ── The 7 pages ──
import { PosCheckout } from './components/PosCheckout';        // Sales (checkout + day control)
import { ProductCatalogView } from './components/catalog/ProductCatalogView'; // Items
import { StockAndExpiryView } from './components/StockAndExpiryView'; // Stock & Expiry
import { SuppliersView } from './components/SuppliersView';        // Suppliers
import { ReportsView } from './components/ReportsView';        // Reports
import { UserManagementView } from './components/auth/UserManagementView'; // Staff
import { SettingsView } from './components/SettingsView';      // Settings

/**
 * Legacy → new page redirect map.
 * When an old NavTabId lands in state (via hash param or legacy bookmark),
 * it is immediately mapped to the matching new id.
 */
const LEGACY_REDIRECT: Partial<Record<NavTabId, NavTabId>> = {
  checkout:  'sales',
  shifts:    'sales',
  catalog:   'items',
  inventory: 'stock',
  stocktake: 'stock',
  reorder:   'stock',
  purchasing:'suppliers',
  users:     'staff',
  audit:     'reports',
  backup:    'settings',
  sync:      'settings',
  dashboard: 'sales',   // manager/owner will override below
};

/** Resolve the hash fragment (#checkout, #sales …) into a NavTabId.
 * Returns null if the hash is a special route (platform, register, onboarding). */
function resolveHashTab(): NavTabId | null {
  const raw = window.location.hash.replace('#', '').split('?')[0].trim();
  if (!raw) return null;
  // Special routes handled before this function is called
  if (
    raw === 'platform' ||
    raw === 'register' ||
    raw === 'website' ||
    raw === 'landing' ||
    raw.startsWith('onboarding')
  ) {
    return null;
  }
  return raw as NavTabId;
}

/** Default landing tab per role (after legacy redirect). */
function defaultTabForRole(role: string | undefined): NavTabId {
  switch (role) {
    case 'CASHIER':      return 'sales';
    case 'STOREKEEPER':  return 'items';
    case 'ACCOUNTANT':   return 'reports';
    default:             return 'sales'; // Manager, Owner, HQ_ADMIN
  }
}

const MainApp: React.FC = () => {
  const { isAuthenticated, isLocked, setupStatus, currentUser, lockSession } = useAuth();

  // ── Special route flags ──
  const [isPlatformRoute, setIsPlatformRoute] = useState<boolean>(
    () => window.location.hash === '#platform' || window.location.pathname.startsWith('/platform'),
  );
  const [isRegisterRoute, setIsRegisterRoute] = useState<boolean>(
    () => window.location.hash === '#register' || window.location.pathname.startsWith('/register'),
  );
  const [isWebsiteRoute, setIsWebsiteRoute] = useState<boolean>(
    () =>
      window.location.hash === '#website' ||
      window.location.hash === '#landing' ||
      window.location.pathname.startsWith('/landing'),
  );

  // Sync route flags on hash change
  useEffect(() => {
    const handleHashChange = () => {
      setIsPlatformRoute(
        window.location.hash === '#platform' || window.location.pathname.startsWith('/platform'),
      );
      setIsRegisterRoute(
        window.location.hash === '#register' || window.location.pathname.startsWith('/register'),
      );
      setIsWebsiteRoute(
        window.location.hash === '#website' ||
          window.location.hash === '#landing' ||
          window.location.pathname.startsWith('/landing'),
      );
      const hashTab = resolveHashTab();
      if (hashTab) {
        const resolved = LEGACY_REDIRECT[hashTab] ?? hashTab;
        setActiveTabRaw(resolved);
        if (window.location.hash !== '#' + resolved) {
          window.location.hash = resolved;
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // ── Active page state ──
  const [activeTab, setActiveTabRaw] = useState<NavTabId>('sales');

  /** Wrap setActiveTab so legacy ids are silently redirected. */
  const setActiveTab = (tab: NavTabId) => {
    const resolved = LEGACY_REDIRECT[tab] ?? tab;
    setActiveTabRaw(resolved);
    window.location.hash = resolved;
  };

  // Set initial tab from hash OR role, once user is known
  useEffect(() => {
    const hashTab = resolveHashTab();
    if (hashTab) {
      const resolved = LEGACY_REDIRECT[hashTab] ?? hashTab;
      setActiveTabRaw(resolved);
      if (window.location.hash !== '#' + resolved) {
        window.location.hash = resolved;
      }
    } else if (currentUser?.role) {
      const def = defaultTabForRole(currentUser.role);
      setActiveTabRaw(def);
      window.location.hash = def;
    }
  }, [currentUser?.role]);

  // ── Global modals ──
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [criticalCount, setCriticalCount] = useState<number>(0);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === 'F1') {
        e.preventDefault();
        setActiveTab('sales');
      } else if (e.key === 'F9') {
        e.preventDefault();
        lockSession();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lockSession]);

  // ── Onboarding token check ──
  const getOnboardingToken = () => {
    const hash = window.location.hash;
    const search = window.location.search;
    if (hash.startsWith('#onboarding') && hash.includes('token=')) {
      const match = hash.match(/token=([^&]+)/);
      return match ? match[1] : null;
    }
    if (window.location.pathname.startsWith('/onboarding') || search.includes('token=')) {
      const params = new URLSearchParams(search);
      return params.get('token');
    }
    return null;
  };

  const onboardingToken = getOnboardingToken();
  if (onboardingToken) {
    return (
      <TenantOnboardingWizard
        token={onboardingToken}
        onComplete={() => {
          window.location.hash = '';
          window.location.href = '/';
        }}
      />
    );
  }

  if (isWebsiteRoute) {
    return (
      <GebeyaOSPublicSite
        onRegister={() => {
          window.location.hash = 'register';
          setIsRegisterRoute(true);
          setIsWebsiteRoute(false);
        }}
        onLogin={() => {
          window.location.hash = '';
          setIsWebsiteRoute(false);
        }}
      />
    );
  }

  if (isRegisterRoute) {
    return (
      <RegisterApplicationPage
        onBackToLogin={() => {
          window.location.hash = '';
          setIsRegisterRoute(false);
        }}
      />
    );
  }

  if (isPlatformRoute) {
    return (
      <PlatformAdminConsole
        onExit={() => {
          window.location.hash = '';
          setIsPlatformRoute(false);
          setActiveTabRaw('sales');
        }}
      />
    );
  }

  if (setupStatus && !setupStatus.setupCompleted) {
    return <SetupWizard />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onSwitchToPin={() => setShowPinModal(true)} />
        <PinPadModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          onSwitchToPassword={() => setShowPinModal(false)}
        />
      </>
    );
  }

  // ── Authenticated POS application ──
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden font-sans bg-page text-text-main">
      {/* Top bar */}
      <TopBar
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        unreadNotificationsCount={unreadCount}
      />

      {/* Main workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        <NavigationRail
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasCriticalAlerts={criticalCount > 0}
        />

        <main className="flex-1 flex overflow-hidden bg-page">
          {/* PAGE 1 — Sales (checkout + day control strip added in Step 2) */}
          {activeTab === 'sales' && <PosCheckout />}

          {/* PAGE 2 — Items (catalog: products + categories) */}
          {activeTab === 'items' && <ProductCatalogView />}

          {/* PAGE 3 — Stock & Expiry */}
          {activeTab === 'stock' && <StockAndExpiryView />}

          {/* PAGE 4 — Suppliers (Suppliers & Received Items) */}
          {activeTab === 'suppliers' && <SuppliersView />}

          {/* PAGE 5 — Reports */}
          {activeTab === 'reports' && <ReportsView />}

          {/* PAGE 6 — Staff */}
          {activeTab === 'staff' && <UserManagementView />}

          {/* PAGE 7 — Settings (absorbs Backup + Sync in Step 7) */}
          {activeTab === 'settings' && <SettingsView />}
        </main>

        {/* Terminal lock overlay */}
        {isLocked && (
          <PinPadModal
            isOpen={true}
            isLockScreen={true}
          />
        )}
      </div>

      {/* Command palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={setActiveTab}
      />

      {/* Notifications drawer */}
      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onNavigate={setActiveTab}
        onUnreadCountChange={setUnreadCount}
        onCriticalCountChange={setCriticalCount}
      />

      {/* Contextual onboarding hints */}
      <OnboardingHints currentTab={activeTab} />

      {/* Session expired dialog */}
      <SessionExpiredDialog />
    </div>
  );
};

export const App: React.FC = () => (
  <I18nProvider>
    <BrandProvider>
      <BrandThemeProvider>
        <AuthProvider>
          <ShiftProvider>
            <MainApp />
          </ShiftProvider>
        </AuthProvider>
      </BrandThemeProvider>
    </BrandProvider>
  </I18nProvider>
);
