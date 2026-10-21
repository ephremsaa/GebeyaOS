import React from 'react';
import { Printer, Check, X } from 'lucide-react';

interface ReceiptModalProps {
  receiptText: string;
  receiptNumber: string;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receiptText,
  receiptNumber,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ width: '460px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Sale Completed</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{receiptNumber}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Realistic ESC/POS Thermal Receipt Paper Simulation */}
        <div className="thermal-receipt-paper">
          {receiptText}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="chip-btn"
            onClick={handlePrint}
            style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Printer size={18} /> Print ESC/POS
          </button>
          <button
            type="button"
            className="pay-btn"
            onClick={onClose}
            style={{ flex: 1, marginTop: 0, height: 'auto', padding: '12px' }}
          >
            <Check size={18} /> New Customer
          </button>
        </div>
      </div>
    </div>
  );
};
