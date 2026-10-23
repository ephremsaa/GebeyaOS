import React, { useState } from 'react';
import { I18nProvider } from './i18n/I18nContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { TopBar } from './components/TopBar';
import { NavigationRail, NavTabId } from './components/NavigationRail';
import { PosCheckout } from './components/PosCheckout';
import { ShiftManagement } from './components/ShiftManagement';
import { InventoryView } from './components/InventoryView';
import { PurchasingView } from './components/PurchasingView';
import { ReportsView } from './components/ReportsView';
import { SyncMonitor } from './components/SyncMonitor';
import { UserManagementView } from './components/auth/UserManagementView';
import { SetupWizard } from './components/auth/SetupWizard';
import { LoginPage } from './components/auth/LoginPage';
import { PinPadModal } from './components/auth/PinPadModal';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLocked, setupStatus } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTabId>('checkout');
  const [showPinModal, setShowPinModal] = useState<boolean>(false);

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
    <div
      className="flex flex-col h-screen w-screen overflow-hidden font-sans"
      style={{ background: 'var(--bg-page)', color: 'var(--text-main)' }}
    >
      {/* 1. Slim Top Bar with Active Cashier, Menu, Language & Theme */}
      <TopBar />

      {/* 2. Main Workspace: Left Navigation Rail + Active Screen */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Navigation Rail with permission gates */}
        <NavigationRail
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Active Content Pane */}
        <main className="flex-1 flex overflow-hidden" style={{ background: 'var(--bg-page)' }}>
          {activeTab === 'checkout'   && <PosCheckout />}
          {activeTab === 'shifts'     && <ShiftManagement />}
          {activeTab === 'inventory'  && <InventoryView />}
          {activeTab === 'purchasing' && <PurchasingView />}
          {activeTab === 'reports'    && <ReportsView />}
          {activeTab === 'users'      && <UserManagementView />}
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
