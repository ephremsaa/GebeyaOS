import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  CreditCard,
  Scale,
} from 'lucide-react';
import { SAMPLE_PRODUCTS, SAMPLE_CATEGORIES, SampleProduct } from '../sample-data';
import {
  BarcodeParser,
  calculatePricing,
  formatEscPosThermalReceipt,
  generateReceiptNumber,
  PaymentMethod,
} from '@gebeyaos/shared-types';
import { PaymentModal } from './PaymentModal';
import { ReceiptModal } from './ReceiptModal';

export interface CartItem {
  product: SampleProduct;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  isVat: boolean;
  scaleWeightGrams?: number;
}

export const PosCheckout: React.FC = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPaymentOpen, setIsPaymentOpen] = useState<boolean>(false);
  const [completedReceiptText, setCompletedReceiptText] = useState<string | null>(null);
  const [completedReceiptNo, setCompletedReceiptNo] = useState<string>('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search/scanner input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filter products by category and search query
  const filteredProducts = SAMPLE_PRODUCTS.filter((p) => {
    const matchesCategory =
      selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchesQuery =
      p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.nameAm && p.nameAm.includes(searchQuery)) ||
      p.barcode.includes(searchQuery) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const addToCart = (product: SampleProduct, quantity = 1, scaleWeightGrams?: number) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.product.id === product.id);
      if (existingIdx >= 0 && !product.isWeighed) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + quantity;
        updated[existingIdx].quantity = newQty;
        updated[existingIdx].lineTotal = Math.round(newQty * product.price * 100) / 100;
        return updated;
      } else {
        const lineTotal = Math.round(quantity * product.price * 100) / 100;
        return [
          ...prev,
          {
            product,
            quantity,
            unitPrice: product.price,
            discount: 0,
            lineTotal,
            isVat: product.isVat,
            scaleWeightGrams,
          },
        ];
      }
    });
  };

  const updateQuantity = (idx: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = Math.max(0.001, updated[idx].quantity + delta);
      updated[idx].quantity = Math.round(newQty * 1000) / 1000;
      updated[idx].lineTotal =
        Math.round(updated[idx].quantity * updated[idx].unitPrice * 100) / 100;
      return updated;
    });
  };

  const removeFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearCart = () => setCart([]);

  // Barcode enter handler (supports scale barcodes 20-PLU-WEIGHT and 02-PLU-PRICE)
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = searchQuery.trim();
    if (!code) return;

    // Check if it is an in-store scale barcode (starts with 20 or 02)
    if (code.startsWith('20') || code.startsWith('02')) {
      const parsed = BarcodeParser.parse(code);
      if (parsed.isScaleBarcode && parsed.embeddedQuantity) {
        // Find product with scale PLU or match bananas/beef sample
        const matched =
          SAMPLE_PRODUCTS.find((p) => p.isWeighed && code.startsWith(p.barcode.slice(0, 4))) ||
          SAMPLE_PRODUCTS.find((p) => p.isWeighed);

        if (matched) {
          addToCart(matched, parsed.embeddedQuantity, parsed.embeddedQuantity * 1000);
          setSearchQuery('');
          return;
        }
      }
    }

    // Direct standard EAN lookup
    const found = SAMPLE_PRODUCTS.find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
    if (found) {
      addToCart(found, 1);
      setSearchQuery('');
    }
  };

  // Calculate cart financials with Ethiopian tax-inclusive standard
  let subtotal = 0;
  let taxableSubtotal = 0;
  let taxExemptSubtotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;

  for (const item of cart) {
    const pricing = calculatePricing(item.lineTotal, item.isVat, 0.15);
    subtotal += item.lineTotal;
    taxableSubtotal += pricing.taxableSubtotal;
    taxExemptSubtotal += pricing.taxExemptSubtotal;
    taxTotal += pricing.taxAmount;
    grandTotal += pricing.total;
  }

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  subtotal = r2(subtotal);
  taxableSubtotal = r2(taxableSubtotal);
  taxExemptSubtotal = r2(taxExemptSubtotal);
  taxTotal = r2(taxTotal);
  grandTotal = r2(grandTotal);

  const handleCompleteSale = (
    payments: Array<{ method: PaymentMethod; amount: number; reference?: string }>,
    changeGiven: number,
  ) => {
    const seq = Math.floor(Math.random() * 900) + 100;
    const receiptNo = generateReceiptNumber('BOLE01', 'POS01', new Date(), 1, seq);

    const receiptString = formatEscPosThermalReceipt({
      storeName: 'GEBEYA HYPERMARKET',
      storeTin: '0012345678',
      storeVatNumber: 'ETH-VAT-987654',
      branchName: 'BOLE ROAD BRANCH',
      branchAddress: 'Cameroon Street, Addis Ababa',
      branchPhone: '+251 11 661 0000',
      terminalCode: 'POS-01',
      cashierName: 'Abebe B. (Cashier)',
      receiptNumber: receiptNo,
      saleDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
      items: cart.map((i) => ({
        name: i.product.nameEn,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        isVat: i.isVat,
      })),
      subtotal,
      discountTotal: 0,
      taxableSubtotal,
      vatAmount: taxTotal,
      exemptSubtotal: taxExemptSubtotal,
      grandTotal,
      payments,
      changeGiven,
      fiscalMrc: 'MOR-ETH-BOLE01-01',
      fiscalReceiptNo: `FRN-${receiptNo}`,
      fiscalSignature: '9A8B7C6D5E4F3A2B1C0D9988',
    });

    setCompletedReceiptText(receiptString);
    setCompletedReceiptNo(receiptNo);
    setIsPaymentOpen(false);
    clearCart();
  };

  return (
    <div className="pos-layout">
      {/* Catalog & Scanning Pane */}
      <div className="pos-catalog-pane">
        {/* Search & Barcode Wedge Input */}
        <form onSubmit={handleBarcodeSubmit} className="search-bar-wrapper">
          <Barcode size={22} color="var(--primary)" />
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Scan barcode or type SKU / item name (e.g. 6001234567890 or 2010450000000 for weighed scale)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="chip-btn active" style={{ padding: '6px 16px' }}>
            Enter
          </button>
        </form>

        {/* Category Filter Chips */}
        <div className="category-chips">
          {SAMPLE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Quick Grid */}
        <div className="product-grid">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              className="product-card"
              onClick={() => addToCart(p, 1)}
            >
              <div>
                <div className="prod-name">{p.nameEn}</div>
                {p.nameAm && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {p.nameAm}
                  </div>
                )}
                <div className="prod-sku">
                  {p.isWeighed && <Scale size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                  {p.sku}
                </div>
              </div>
              <div className="prod-footer">
                <span className="prod-price">{p.price.toFixed(2)} ETB</span>
                <span className="prod-vat-tag">{p.isVat ? '(A) 15%' : '(B) Exempt'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart & Total Checkout Pane */}
      <div className="pos-cart-pane">
        <div className="cart-header">
          <div className="cart-title">
            <ShoppingCart size={20} color="var(--primary)" />
            <span>Active Basket</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>({cart.length})</span>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              style={{ background: 'transparent', color: 'var(--accent-red)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Trash2 size={14} /> Clear
            </button>
          )}
        </div>

        {/* Cart Item Rows */}
        <div className="cart-items-list">
          {cart.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-dim)' }}>
              <ShoppingCart size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <div>Basket is empty</div>
              <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Scan barcode or tap items to sell</div>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={`${item.product.id}-${idx}`} className="cart-item-row">
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.product.nameEn}</div>
                  <div className="cart-item-meta">
                    {item.unitPrice.toFixed(2)} ETB {item.isVat ? '(A)' : '(B)'}
                    {item.scaleWeightGrams && ` • Scale: ${item.scaleWeightGrams}g`}
                  </div>
                </div>

                <div className="cart-qty-ctrl">
                  <button type="button" className="qty-btn" onClick={() => updateQuantity(idx, -1)}>
                    <Minus size={14} />
                  </button>
                  <span className="qty-val">{item.quantity}</span>
                  <button type="button" className="qty-btn" onClick={() => updateQuantity(idx, 1)}>
                    <Plus size={14} />
                  </button>
                </div>

                <div className="cart-item-total">{item.lineTotal.toFixed(2)} ETB</div>

                <button
                  type="button"
                  onClick={() => removeFromCart(idx)}
                  style={{ background: 'transparent', color: 'var(--text-dim)', marginLeft: '8px' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Bill Breakdown & Pay Button */}
        <div className="cart-footer">
          <div className="summary-row">
            <span>Subtotal:</span>
            <span>{subtotal.toFixed(2)} ETB</span>
          </div>
          <div className="summary-row">
            <span>Taxable (15% VAT):</span>
            <span>{taxableSubtotal.toFixed(2)} ETB</span>
          </div>
          <div className="summary-row">
            <span>15% VAT Amount:</span>
            <span>{taxTotal.toFixed(2)} ETB</span>
          </div>
          {taxExemptSubtotal > 0 && (
            <div className="summary-row">
              <span>Tax Exempt:</span>
              <span>{taxExemptSubtotal.toFixed(2)} ETB</span>
            </div>
          )}
          <div className="summary-row total-row">
            <span>TOTAL:</span>
            <span style={{ color: '#34d399' }}>{grandTotal.toFixed(2)} ETB</span>
          </div>

          <button
            type="button"
            className="pay-btn"
            disabled={cart.length === 0}
            onClick={() => setIsPaymentOpen(true)}
          >
            <CreditCard size={20} /> PAY NOW ({grandTotal.toFixed(2)} ETB)
          </button>
        </div>
      </div>

      {/* Payment Tender Modal */}
      {isPaymentOpen && (
        <PaymentModal
          grandTotal={grandTotal}
          onClose={() => setIsPaymentOpen(false)}
          onCompletePayment={handleCompleteSale}
        />
      )}

      {/* ESC/POS Fiscal Receipt Modal */}
      {completedReceiptText && (
        <ReceiptModal
          receiptText={completedReceiptText}
          receiptNumber={completedReceiptNo}
          onClose={() => setCompletedReceiptText(null)}
        />
      )}
    </div>
  );
};
