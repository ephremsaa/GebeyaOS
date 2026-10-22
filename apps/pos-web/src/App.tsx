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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
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

        {/* Active Content Pane */}
        <main className="flex-1 flex overflow-hidden bg-slate-50 dark:bg-slate-950">
          {activeTab === 'checkout' && <PosCheckout />}
          {activeTab === 'shifts' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <ShiftManagement />
            </div>
          )}
          {activeTab === 'inventory' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <InventoryView />
            </div>
          )}
          {activeTab === 'purchasing' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <PurchasingView />
            </div>
          )}
          {activeTab === 'reports' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <ReportsView />
            </div>
          )}
          {activeTab === 'sync' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <SyncMonitor />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <MainApp />
    </I18nProvider>
  );
};
