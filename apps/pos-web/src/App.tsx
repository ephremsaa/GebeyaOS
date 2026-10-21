import React, { useState } from 'react';
import {
  ShoppingCart,
  Clock,
  Package,
  Truck,
  BarChart3,
  RefreshCw,
  Store,
  User,
  Monitor,
  Wifi,
} from 'lucide-react';
import { PosCheckout } from './components/PosCheckout';
import { ShiftManagement } from './components/ShiftManagement';
import { InventoryView } from './components/InventoryView';
import { PurchasingView } from './components/PurchasingView';
import { ReportsView } from './components/ReportsView';
import { SyncMonitor } from './components/SyncMonitor';

export type ActiveTab = 'checkout' | 'shifts' | 'inventory' | 'purchasing' | 'reports' | 'sync';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('checkout');

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <header className="top-nav">
        {/* Left: Brand & Branch */}
        <div className="brand-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
              }}
            >
              <Store size={18} color="#ffffff" />
            </div>
            <div>
              <span className="brand-logo">GebeyaOS</span>
              <span style={{ fontSize: '0.65rem', color: '#10b981', marginLeft: '6px', fontWeight: 600 }}>
                ገበያ 1.0
              </span>
            </div>
          </div>

          <div className="branch-badge">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }} />
            Bole Medhanialem (BR-ADDIS-01)
          </div>
        </div>

        {/* Center: Main Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'checkout' ? 'active' : ''}`}
            onClick={() => setActiveTab('checkout')}
          >
            <ShoppingCart size={16} />
            POS Checkout
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'shifts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shifts')}
          >
            <Clock size={16} />
            Cashier Shift
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            <Package size={16} />
            Inventory & Stock
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'purchasing' ? 'active' : ''}`}
            onClick={() => setActiveTab('purchasing')}
          >
            <Truck size={16} />
            Purchasing & GRN
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <BarChart3 size={16} />
            Reports & Tax
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            <RefreshCw size={16} />
            HQ Sync
          </button>
        </nav>

        {/* Right: Cashier, Terminal, & LAN Status */}
        <div className="status-section">
          <div className="status-pill">
            <Monitor size={14} color="var(--text-dim)" />
            <span>Term #1</span>
          </div>

          <div className="status-pill">
            <User size={14} color="var(--text-dim)" />
            <span>Bethlehem T.</span>
          </div>

          <div className="status-pill" title="Connected to Local Branch Server LAN">
            <span className="status-indicator online" />
            <span style={{ color: '#34d399', fontWeight: 600 }}>LAN Local Server</span>
          </div>
        </div>
      </header>

      {/* Main View Container */}
      <main className="main-view">
        {activeTab === 'checkout' && <PosCheckout />}
        {activeTab === 'shifts' && <ShiftManagement />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'purchasing' && <PurchasingView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'sync' && <SyncMonitor />}
      </main>
    </div>
  );
};
