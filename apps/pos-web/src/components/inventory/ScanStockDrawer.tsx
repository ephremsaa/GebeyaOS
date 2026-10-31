import React, { useState, useEffect, useRef } from 'react';
import {
  Scan,
  Camera,
  CameraOff,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  X,
  Volume2,
  Calendar,
} from 'lucide-react';
import { audioFeedback } from '../../utils/audioFeedback';

export interface ScanProductItem {
  id: string;
  sku: string;
  barcode?: string;
  barcodes?: string[];
  nameEn: string;
  nameAm?: string;
  category?: string;
  price?: number;
  costPrice?: number;
  stockOnHand?: number;
  minStock?: number;
  isWeighed?: boolean;
}

interface ScannedIntakeRow {
  barcode: string;
  productId: string;
  sku: string;
  nameEn: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  batchNumber: string;
  expiryDate: string;
  isPerishable: boolean;
  highlighted?: boolean;
}

interface ScanStockDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCommitSuccess: (message: string, updatedProducts: any[]) => void;
  existingProducts: any[];
}

export const ScanStockDrawer: React.FC<ScanStockDrawerProps> = ({
  isOpen,
  onClose,
  onCommitSuccess,
  existingProducts,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [items, setItems] = useState<ScannedIntakeRow[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick Create State for unknown barcode
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Dairy & Eggs');
  const [newUnit, setNewUnit] = useState('PCS');
  const [newCost, setNewCost] = useState<number>(50);
  const [newPrice, setNewPrice] = useState<number>(65);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastKeyTimeRef = useRef<number>(0);
  const keyBufferRef = useRef<string>('');

  // Keep focus on scan input
  useEffect(() => {
    if (isOpen && !unknownBarcode) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [isOpen, unknownBarcode]);

  // Handle hardware USB/Bluetooth barcode scanner wedges
  useEffect(() => {
    if (!isOpen || unknownBarcode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is editing a form field other than scan input, ignore
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== scanInputRef.current && activeEl.tagName === 'INPUT') {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 4) {
          processBarcode(keyBufferRef.current.trim());
          keyBufferRef.current = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1) {
        // Fast keystrokes (< 45ms between keys) characteristic of hardware scanners
        if (diff < 45 || keyBufferRef.current.length === 0) {
          keyBufferRef.current += e.key;
        } else {
          keyBufferRef.current = e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, unknownBarcode, existingProducts]);

  const processBarcode = (scannedCode: string) => {
    if (!scannedCode) return;
    setBarcodeInput('');

    // Check if already in scanned intake list
    const existingIndex = items.findIndex((i) => i.barcode === scannedCode);
    if (existingIndex >= 0) {
      // Increment quantity
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: item.quantity + 1, highlighted: true }
            : { ...item, highlighted: false },
        ),
      );
      audioFeedback.playSuccess();
      return;
    }

    // Lookup in store catalog
    const product = existingProducts.find(
      (p) => p.barcode === scannedCode || p.sku.toLowerCase() === scannedCode.toLowerCase(),
    );

    if (product) {
      const isPerishable =
        product.category.includes('Dairy') ||
        product.category.includes('Produce') ||
        product.category.includes('Bakery') ||
        product.category.includes('Meat');

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);

      const newRow: ScannedIntakeRow = {
        barcode: scannedCode,
        productId: product.id,
        sku: product.sku,
        nameEn: product.nameEn,
        category: product.category,
        unit: product.isWeighed ? 'KG' : 'PCS',
        quantity: 1,
        unitCost: product.costPrice,
        sellingPrice: product.price,
        batchNumber: `BATCH-${Date.now().toString().slice(-4)}`,
        expiryDate: futureDate.toISOString().slice(0, 10),
        isPerishable,
        highlighted: true,
      };

      setItems((prev) => [newRow, ...prev.map((i) => ({ ...i, highlighted: false }))]);
      audioFeedback.playSuccess();
    } else {
      // Unknown barcode
      audioFeedback.playError();
      setUnknownBarcode(scannedCode);
      setNewName('');
      setNewCost(50);
      setNewPrice(65);
    }
  };

  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      processBarcode(barcodeInput.trim());
    }
  };

  const handleSaveUnknownProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unknownBarcode || !newName) return;

    const isPerishable =
      newCategory.includes('Dairy') ||
      newCategory.includes('Produce') ||
      newCategory.includes('Bakery');

    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);

    const newProdRow: ScannedIntakeRow = {
      barcode: unknownBarcode,
      productId: `prod-new-${Date.now()}`,
      sku: `SKU-${unknownBarcode.slice(-6)}`,
      nameEn: newName,
      category: newCategory,
      unit: newUnit,
      quantity: 1,
      unitCost: newCost,
      sellingPrice: newPrice,
      batchNumber: `B-${Date.now().toString().slice(-4)}`,
      expiryDate: futureDate.toISOString().slice(0, 10),
      isPerishable,
      highlighted: true,
    };

    setItems((prev) => [newProdRow, ...prev]);
    audioFeedback.playSuccess();
    setUnknownBarcode(null);
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const handleCommit = () => {
    if (items.length === 0) return;

    // Validate perishables have future expiry
    for (const item of items) {
      if (item.isPerishable) {
        if (!item.expiryDate || new Date(item.expiryDate) < new Date()) {
          setErrorMsg(`Expiry date is required for perishable item: ${item.nameEn}`);
          return;
        }
      }
    }

    // Update catalog balances
    const updated = [...existingProducts];
    let totalQty = 0;

    for (const item of items) {
      totalQty += item.quantity;
      const idx = updated.findIndex((p) => p.id === item.productId || p.barcode === item.barcode);
      if (idx >= 0) {
        updated[idx] = {
          ...updated[idx],
          stockOnHand: updated[idx].stockOnHand + item.quantity,
          costPrice: item.unitCost,
        };
      } else {
        updated.push({
          id: item.productId,
          sku: item.sku,
          barcode: item.barcode,
          nameEn: item.nameEn,
          category: item.category,
          price: item.sellingPrice,
          costPrice: item.unitCost,
          isVat: true,
          stockOnHand: item.quantity,
          minStock: 10,
        });
      }
    }

    onCommitSuccess(
      `Scan-to-Add committed: ${items.length} items (${totalQty} units added to append-only stock ledger)`,
      updated,
    );
    setItems([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay select-none animate-in fade-in duration-100"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content max-w-4xl max-h-[92vh] flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gebeya-600 text-white flex items-center justify-center shadow-md shadow-gebeya-600/30">
              <Scan size={20} />
            </div>
            <div>
              <h2 className="modal-title">Scan-to-Add Stock</h2>
              <p className="text-xs text-slate-500">
                Continuous hardware or camera barcode intake with instant auto-increment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scan Input Bar & Camera Toggle */}
        <div className="flex items-center gap-2 my-4">
          <form onSubmit={handleManualScanSubmit} className="search-bar-wrapper flex-1">
            <Scan size={18} className="text-gebeya-600 animate-pulse" />
            <input
              ref={scanInputRef}
              type="text"
              placeholder="Barcode scanner active... (or type barcode & hit Enter)"
              className="search-input text-base font-mono"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
            />
            {barcodeInput && (
              <button
                type="button"
                onClick={() => setBarcodeInput('')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={() => setIsCameraActive(!isCameraActive)}
            className={`btn-secondary flex items-center gap-1.5 text-xs font-bold ${
              isCameraActive ? 'bg-gebeya-50 border-gebeya-500 text-gebeya-700' : ''
            }`}
            title="Toggle Device Camera Scanner"
          >
            {isCameraActive ? <CameraOff size={16} /> : <Camera size={16} />}
            {isCameraActive ? 'Stop Camera' : 'Camera'}
          </button>
        </div>

        {/* Camera Viewfinder View */}
        {isCameraActive && (
          <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 mb-4 flex items-center justify-center">
            <div className="absolute inset-4 border-2 border-dashed border-gebeya-500 rounded-xl z-10 animate-pulse flex items-center justify-center">
              <span className="text-xs font-bold text-white bg-slate-900/80 px-3 py-1 rounded-full">
                Align barcode within viewfinder
              </span>
            </div>
            <div className="text-slate-500 text-xs flex flex-col items-center gap-1">
              <Camera size={24} />
              <span>Camera BarcodeDetector active</span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="alert-danger text-xs p-3 rounded-xl mb-3 flex items-center gap-2">
            <AlertTriangle size={15} />
            {errorMsg}
          </div>
        )}

        {/* Scanned Items Table */}
        <div className="flex-1 overflow-y-auto glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl min-h-[220px]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-2">
              <Scan size={36} className="text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold">No items scanned yet.</p>
              <p className="text-xs max-w-sm">
                Scan any shelf item with your barcode gun or enter barcode manually above.
              </p>
            </div>
          ) : (
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Barcode</th>
                  <th className="text-right">Unit Cost</th>
                  <th className="text-center">Quantity</th>
                  <th>Batch / Expiry</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      item.highlighted ? 'bg-gebeya-50/50 dark:bg-gebeya-950/20' : ''
                    }`}
                  >
                    <td>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {item.nameEn}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.sku}</span>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-slate-600 dark:text-slate-300">
                        {item.barcode}
                      </span>
                    </td>
                    <td className="text-right tabular">
                      <input
                        type="number"
                        step="0.01"
                        className="field-input w-20 py-1 text-right text-xs"
                        value={item.unitCost}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setItems((prev) =>
                            prev.map((i, pIdx) => (pIdx === idx ? { ...i, unitCost: val } : i)),
                          );
                        }}
                      />
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.quantity > 1) {
                              setItems((prev) =>
                                prev.map((i, pIdx) =>
                                  pIdx === idx ? { ...i, quantity: i.quantity - 1 } : i,
                                ),
                              );
                            }
                          }}
                          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold"
                        >
                          <Minus size={11} />
                        </button>
                        <input
                          type="number"
                          step="1"
                          className="field-input w-14 py-1 text-center font-bold text-xs"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setItems((prev) =>
                              prev.map((i, pIdx) => (pIdx === idx ? { ...i, quantity: val } : i)),
                            );
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setItems((prev) =>
                              prev.map((i, pIdx) =>
                                pIdx === idx ? { ...i, quantity: i.quantity + 1 } : i,
                              ),
                            );
                          }}
                          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Batch"
                          className="field-input w-20 py-1 text-[11px]"
                          value={item.batchNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((i, pIdx) => (pIdx === idx ? { ...i, batchNumber: val } : i)),
                            );
                          }}
                        />
                        <input
                          type="date"
                          className={`field-input w-28 py-1 text-[11px] ${
                            item.isPerishable && !item.expiryDate ? 'border-red-500' : ''
                          }`}
                          value={item.expiryDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((i, pIdx) => (pIdx === idx ? { ...i, expiryDate: val } : i)),
                            );
                          }}
                        />
                      </div>
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, pIdx) => pIdx !== idx))}
                        className="text-red-500 hover:text-red-700 p-1 rounded-lg"
                        title="Remove line"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
          <span className="text-xs font-semibold text-slate-500">
            Total Scanned: <strong>{items.reduce((acc, i) => acc + i.quantity, 0)} units</strong> ({items.length} items)
          </span>

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={items.length === 0}
              onClick={handleCommit}
              className="btn-primary"
            >
              <CheckCircle2 size={16} />
              Commit Stock Inflow
            </button>
          </div>
        </div>

        {/* ─── Unknown Barcode Quick Create Modal ─── */}
        {unknownBarcode && (
          <div
            className="modal-overlay z-60"
            onClick={(e) => e.target === e.currentTarget && setUnknownBarcode(null)}
          >
            <div className="modal-content max-w-md animate-in zoom-in-95 duration-100">
              <h2 className="modal-title">Unknown Barcode Detected</h2>
              <p className="text-xs text-slate-500 mb-4">
                Barcode <strong className="font-mono text-gebeya-600">{unknownBarcode}</strong> is not in your catalog. Quickly create it to continue scanning.
              </p>

              <form onSubmit={handleSaveUnknownProduct} className="flex flex-col gap-3">
                <div>
                  <label className="field-label">Product Name</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Omo Detergent 500g"
                    className="field-input mt-1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label">Category</label>
                    <select
                      className="field-select mt-1"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                    >
                      <option value="Dairy & Eggs">Dairy &amp; Eggs</option>
                      <option value="Bakery & Grains">Bakery &amp; Grains</option>
                      <option value="Fresh Produce">Fresh Produce</option>
                      <option value="Beverages">Beverages</option>
                      <option value="Household">Household</option>
                      <option value="Meat & Butchery">Meat &amp; Butchery</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label">Unit</label>
                    <select
                      className="field-select mt-1"
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                    >
                      <option value="PCS">PCS (Pieces)</option>
                      <option value="KG">KG (Kilograms)</option>
                      <option value="L">L (Liters)</option>
                      <option value="PACK">PACK</option>
                      <option value="BOX">BOX</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label">Cost Price (ETB)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="field-input mt-1 font-mono"
                      value={newCost}
                      onChange={(e) => setNewCost(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="field-label">Shelf Price (ETB)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="field-input mt-1 font-mono"
                      value={newPrice}
                      onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => setUnknownBarcode(null)}
                  >
                    Skip
                  </button>
                  <button type="submit" className="btn-primary flex-1">
                    Add &amp; Resume Scanning
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
