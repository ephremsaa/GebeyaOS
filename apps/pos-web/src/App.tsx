import React, { useState, useEffect } from 'react';
import { I18nProvider } from './i18n/I18nContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { TopBar } from './components/TopBar';
import { NavigationRail, NavTabId } from './components/NavigationRail';
import { DashboardView } from './components/DashboardView';
import { PosCheckout } from './components/PosCheckout';
import { ShiftManagement } from './components/ShiftManagement';
import { ProductCatalogView } from './components/catalog/ProductCatalogView';
import { InventoryView } from './components/InventoryView';
import { StockTakeView } from './components/inventory/StockTakeView';
import { ReorderSuggestionsView } from './components/inventory/ReorderSuggestionsView';
import { PurchasingView } from './components/PurchasingView';
import { ReportsView } from './components/ReportsView';
import { UserManagementView } from './components/auth/UserManagementView';
import { SettingsView } from './components/SettingsView';
import { BackupRestoreView } from './components/BackupRestoreView';
import { AuditLogView } from './components/AuditLogView';
import { SyncMonitor } from './components/SyncMonitor';
import { CommandPalette } from './components/CommandPalette';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { OnboardingHints } from './components/OnboardingHints';
import { SetupWizard } from './components/auth/SetupWizard';
import { LoginPage } from './components/auth/LoginPage';
import { PinPadModal } from './components/auth/PinPadModal';
import { SessionExpiredDialog } from './components/auth/SessionExpiredDialog';
import { PlatformAdminConsole } from './components/platform/PlatformAdminConsole';
import { TenantOnboardingWizard } from './components/onboarding/TenantOnboardingWizard';
import { RegisterApplicationPage } from './components/auth/RegisterApplicationPage';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLocked, setupStatus, currentUser, lockSession } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [isPlatformRoute, setIsPlatformRoute] = useState<boolean>(
    () => window.location.hash === '#platform' || window.location.pathname.startsWith('/platform'),
  );
  const [isRegisterRoute, setIsRegisterRoute] = useState<boolean>(
    () => window.location.hash === '#register' || window.location.pathname.startsWith('/register'),
  );

  // Sync hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const isPlatform = window.location.hash === '#platform' || window.location.pathname.startsWith('/platform');
      const isRegister = window.location.hash === '#register' || window.location.pathname.startsWith('/register');
      setIsPlatformRoute(isPlatform);
      setIsRegisterRoute(isRegister);
      if (isPlatform) {
        setActiveTab('platform');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Command Palette & Notifications state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Set initial tab based on role
  useEffect(() => {
    if (currentUser?.role === 'CASHIER') {
      setActiveTab('checkout');
    } else if (currentUser?.role === 'STOREKEEPER') {
      setActiveTab('inventory');
    } else {
      setActiveTab('dashboard');
    }
  }, [currentUser?.role]);

  // Global Keyboard Shortcuts (Ctrl+K, F1, F9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K -> Toggle Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === 'F1') {
        e.preventDefault();
        setActiveTab('checkout');
      } else if (e.key === 'F9') {
        e.preventDefault();
        lockSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lockSession]);

  // Check for Tenant Onboarding Token (#onboarding?token=... or /onboarding?token=...)
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

  // 0. Public Supermarket Registration Application (#register or /register)
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

  // 0. Platform Admin Console Route (#platform or activeTab === 'platform')
  if (isPlatformRoute || activeTab === 'platform') {
    return (
      <PlatformAdminConsole
        onExit={() => {
          window.location.hash = '';
          setIsPlatformRoute(false);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  // 1. First-Run Setup Wizard Gate
  if (setupStatus && !setupStatus.setupCompleted) {
    return <SetupWizard />;
  }

  // 2. Unauthenticated State (Login vs PIN Login)
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

  // 3. Authenticated POS Application
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden font-sans bg-page text-text-main">
      {/* 1. Slim Top Bar with Command Search, Notifications, Active Cashier, Menu, Language & Theme */}
      <TopBar
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        unreadNotificationsCount={unreadCount}
      />

      {/* 2. Main Workspace: Left Navigation Rail + Active Screen */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Navigation Rail with permission gates */}
        <NavigationRail
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Active Content Pane */}
        <main className="flex-1 flex overflow-hidden bg-page">
          {activeTab === 'dashboard'  && <DashboardView onNavigate={setActiveTab} />}
          {activeTab === 'checkout'   && <PosCheckout />}
          {activeTab === 'shifts'     && <ShiftManagement />}
          {activeTab === 'catalog'    && <ProductCatalogView />}
          {activeTab === 'inventory'  && <InventoryView />}
          {activeTab === 'stocktake'  && <StockTakeView />}
          {activeTab === 'reorder'    && <ReorderSuggestionsView onNavigateToPurchasing={() => setActiveTab('purchasing')} />}
          {activeTab === 'purchasing' && <PurchasingView />}
          {activeTab === 'reports'    && <ReportsView />}
          {activeTab === 'users'      && <UserManagementView />}
          {activeTab === 'audit'      && <AuditLogView />}
          {activeTab === 'settings'   && <SettingsView />}
          {activeTab === 'backup'     && <BackupRestoreView />}
          {activeTab === 'sync'       && <SyncMonitor />}
        </main>

        {/* 3. Inactivity Terminal Lock Overlay */}
        {isLocked && (
          <PinPadModal
            isOpen={true}
            isLockScreen={true}
          />
        )}
      </div>

      {/* 4. Global Command Palette Modal (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={setActiveTab}
      />

      {/* 5. Notifications Drawer */}
      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onNavigate={setActiveTab}
        onUnreadCountChange={setUnreadCount}
      />

      {/* 6. Contextual Onboarding Hints */}
      <OnboardingHints currentTab={activeTab} />

      {/* 7. Session Expired Dialog (preserves held basket/drafts) */}
      <SessionExpiredDialog />
    </div>
  );
};

export const App: React.FC = () => (
  <I18nProvider>
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  </I18nProvider>
);
