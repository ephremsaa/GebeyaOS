import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Smartphone, CreditCard, Banknote } from 'lucide-react';
import { PaymentMethod } from '@gebeyaos/shared-types';

interface PaymentModalProps {
  grandTotal: number;
  onClose: () => void;
  onCompletePayment: (payments: Array<{ method: PaymentMethod; amount: number; reference?: string }>, changeGiven: number) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  grandTotal,
  onClose,
  onCompletePayment,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [cashAmount, setCashAmount] = useState<number>(grandTotal);
  const [telebirrAmount, setTelebirrAmount] = useState<number>(0);
  const [telebirrRef, setTelebirrRef] = useState<string>('');
  const [cbeAmount, setCbeAmount] = useState<number>(0);
  const [cbeRef, setCbeRef] = useState<string>('');
  const [cardAmount, setCardAmount] = useState<number>(0);

  const totalPaid = Math.round((cashAmount + telebirrAmount + cbeAmount + cardAmount + Number.EPSILON) * 100) / 100;
  const remaining = Math.max(0, Math.round((grandTotal - totalPaid + Number.EPSILON) * 100) / 100);
  const changeGiven = Math.max(0, Math.round((totalPaid - grandTotal + Number.EPSILON) * 100) / 100);

  const handleQuickCash = (added: number) => {
    setCashAmount((prev) => prev + added);
  };

  const handleExactCash = () => {
    setCashAmount(grandTotal);
    setTelebirrAmount(0);
    setCbeAmount(0);
    setCardAmount(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalPaid < grandTotal) return;

    // Validate that change given does not exceed cash paid
    if (changeGiven > 0 && cashAmount < changeGiven) {
      alert('Cannot give cash change on electronic-only payment!');
      return;
    }

    const payments: Array<{ method: PaymentMethod; amount: number; reference?: string }> = [];
    if (cashAmount > 0) payments.push({ method: 'CASH', amount: cashAmount });
    if (telebirrAmount > 0) payments.push({ method: 'TELEBIRR', amount: telebirrAmount, reference: telebirrRef || 'TB-SMS-VERIFIED' });
    if (cbeAmount > 0) payments.push({ method: 'CBE_BIRR', amount: cbeAmount, reference: cbeRef || 'CBE-SMS-VERIFIED' });
    if (cardAmount > 0) payments.push({ method: 'CARD_POS', amount: cardAmount, reference: 'POS-SLIP-APPROVED' });

    onCompletePayment(payments, changeGiven);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ width: '480px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Tender / Settle Bill</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ background: 'var(--bg-elevated)', padding: '16px', borderRadius: '10px', marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>TOTAL DUE</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399' }}>{grandTotal.toFixed(2)} ETB</div>
        </div>

        {/* Method Switcher */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '16px' }}>
          <button
            type="button"
            className={`chip-btn ${selectedMethod === 'CASH' ? 'active' : ''}`}
            onClick={() => setSelectedMethod('CASH')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 4px' }}
          >
            <Banknote size={16} /> Cash
          </button>
          <button
            type="button"
            className={`chip-btn ${selectedMethod === 'TELEBIRR' ? 'active' : ''}`}
            onClick={() => { setSelectedMethod('TELEBIRR'); if (telebirrAmount === 0 && remaining > 0) setTelebirrAmount(remaining); }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 4px' }}
          >
            <Smartphone size={16} /> Telebirr
          </button>
          <button
            type="button"
            className={`chip-btn ${selectedMethod === 'CBE_BIRR' ? 'active' : ''}`}
            onClick={() => { setSelectedMethod('CBE_BIRR'); if (cbeAmount === 0 && remaining > 0) setCbeAmount(remaining); }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 4px' }}
          >
            <Smartphone size={16} /> CBE Birr
          </button>
          <button
            type="button"
            className={`chip-btn ${selectedMethod === 'CARD_POS' ? 'active' : ''}`}
            onClick={() => { setSelectedMethod('CARD_POS'); if (cardAmount === 0 && remaining > 0) setCardAmount(remaining); }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 4px' }}
          >
            <CreditCard size={16} /> Card Slip
          </button>
        </div>

        {/* Inputs per Method */}
        {selectedMethod === 'CASH' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cash Tendered (ETB)</label>
              <button type="button" onClick={handleExactCash} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'transparent', textDecoration: 'underline' }}>
                Exact Amount
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              value={cashAmount || ''}
              onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: '#ffffff', fontSize: '1.2rem', fontWeight: 700, borderRadius: '8px' }}
            />
            {/* Quick Bill Denominations */}
            <div className="tender-grid">
              <button type="button" className="tender-btn" onClick={() => handleQuickCash(50)}>+50 ETB</button>
              <button type="button" className="tender-btn" onClick={() => handleQuickCash(100)}>+100 ETB</button>
              <button type="button" className="tender-btn" onClick={() => handleQuickCash(200)}>+200 ETB</button>
              <button type="button" className="tender-btn" onClick={() => handleQuickCash(500)}>+500 ETB</button>
              <button type="button" className="tender-btn" onClick={() => handleQuickCash(1000)}>+1000 ETB</button>
              <button type="button" className="tender-btn" onClick={() => setCashAmount(0)}>Clear</button>
            </div>
          </div>
        )}

        {selectedMethod === 'TELEBIRR' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Telebirr Amount (ETB)</label>
            <input
              type="number"
              step="0.01"
              value={telebirrAmount || ''}
              onChange={(e) => setTelebirrAmount(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px' }}
            />
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>SMS/USSD Transaction Reference</label>
            <input
              type="text"
              placeholder="e.g. TB98765432"
              value={telebirrRef}
              onChange={(e) => setTelebirrRef(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px' }}
            />
          </div>
        )}

        {selectedMethod === 'CBE_BIRR' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>CBE Birr Amount (ETB)</label>
            <input
              type="number"
              step="0.01"
              value={cbeAmount || ''}
              onChange={(e) => setCbeAmount(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px' }}
            />
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>CBE Birr Approval Code</label>
            <input
              type="text"
              placeholder="e.g. CBE-55443322"
              value={cbeRef}
              onChange={(e) => setCbeRef(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px' }}
            />
          </div>
        )}

        {selectedMethod === 'CARD_POS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Card Amount (ETB)</label>
            <input
              type="number"
              step="0.01"
              value={cardAmount || ''}
              onChange={(e) => setCardAmount(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px' }}
            />
          </div>
        )}

        {/* Payment Summary Footer */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '20px', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>Total Tendered:</span>
            <span style={{ fontWeight: 600, color: '#ffffff' }}>{totalPaid.toFixed(2)} ETB</span>
          </div>

          {remaining > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#f59e0b', fontWeight: 700 }}>
              <span>Remaining Due:</span>
              <span>{remaining.toFixed(2)} ETB</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: '#34d399', fontWeight: 800 }}>
              <span>Change Given:</span>
              <span>{changeGiven.toFixed(2)} ETB</span>
            </div>
          )}

          <button
            type="button"
            className="pay-btn"
            disabled={totalPaid < grandTotal}
            onClick={handleSubmit}
          >
            <CheckCircle2 size={20} /> Complete Sale ({grandTotal.toFixed(2)} ETB)
          </button>
        </div>
      </div>
    </div>
  );
};
