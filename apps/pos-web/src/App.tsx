import React, { useState } from 'react';
import { I18nProvider } from './i18n/I18nContext';
import { TopBar } from './components/TopBar';
import { NavigationRail, NavTabId } from './components/NavigationRail';
import { PosCheckout } from './components/PosCheckout';
import { ShiftManagement } from './components/ShiftManagement';
import { InventoryView } from './components/InventoryView';
import { PurchasingView } from './components/PurchasingView';
import { ReportsView } from './components/ReportsView';
import { SyncMonitor } from './components/SyncMonitor';

const MainApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTabId>('checkout');

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden font-sans"
         style={{ background: 'var(--bg-page)', color: 'var(--text-main)' }}>
      {/* 1. Slim Top Bar */}
      <TopBar />

      {/* 2. Main Workspace: Left Navigation Rail + Active Screen */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Rail */}
        <NavigationRail
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole="manager"
        />

        {/* Active Content Pane — pages manage their own padding via page-container */}
        <main className="flex-1 flex overflow-hidden" style={{ background: 'var(--bg-page)' }}>
          {activeTab === 'checkout'   && <PosCheckout />}
          {activeTab === 'shifts'     && <ShiftManagement />}
          {activeTab === 'inventory'  && <InventoryView />}
          {activeTab === 'purchasing' && <PurchasingView />}
          {activeTab === 'reports'    && <ReportsView />}
          {activeTab === 'sync'       && <SyncMonitor />}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => (
  <I18nProvider>
    <MainApp />
  </I18nProvider>
);
