import React from 'react';
import { Scan, Edit3, FileSpreadsheet, FileEdit, X, ChevronRight, History } from 'lucide-react';

interface AddStockChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScan: () => void;
  onSelectManual: () => void;
  onSelectExcel: () => void;
  onSelectAdjustment: () => void;
  onOpenHistory: () => void;
}

export const AddStockChooserModal: React.FC<AddStockChooserModalProps> = ({
  isOpen,
  onClose,
  onSelectScan,
  onSelectManual,
  onSelectExcel,
  onSelectAdjustment,
  onOpenHistory,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay select-none animate-in fade-in duration-100"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content max-w-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="modal-title">Add Stock to Inventory</h2>
            <p className="text-xs text-slate-500">
              Select your preferred intake workflow for adding products and stock
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 3 Main Inflow Methods */}
        <div className="grid grid-cols-1 gap-3 my-4">
          {/* Method A: SCAN */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectScan();
            }}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-gebeya-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-gebeya-50/40 dark:hover:bg-gebeya-950/20 text-left transition-all flex items-center justify-between group active:scale-98"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gebeya-600 text-white flex items-center justify-center shadow-md shadow-gebeya-600/30 group-hover:scale-105 transition-transform">
                <Scan size={24} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  A. Scan-to-Add
                  <span className="badge-success text-[10px] px-2 py-0.5">Fastest</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Rapid continuous scanning via USB/Bluetooth barcode gun or mobile camera. Auto-increments quantities.
                </span>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 group-hover:text-gebeya-600 group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Method B: MANUAL */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectManual();
            }}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-left transition-all flex items-center justify-between group active:scale-98"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 group-hover:scale-105 transition-transform">
                <Edit3 size={24} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  B. Manual Multi-Line Entry
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Search by product name or SKU, set custom batches, costs, and expiry dates before committing.
                </span>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Method C: EXCEL / CSV IMPORT */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectExcel();
            }}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 text-left transition-all flex items-center justify-between group active:scale-98"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30 group-hover:scale-105 transition-transform">
                <FileSpreadsheet size={24} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  C. Excel / CSV Spreadsheet Import
                  <span className="badge-warning text-[10px] px-2 py-0.5">Bulk</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Upload .xlsx or .csv files, auto-map headers, preview &amp; edit errors in browser, and atomic transaction commit.
                </span>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>

        {/* Footer actions: Write-off adjustment & Import History */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenHistory();
            }}
            className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <History size={14} className="text-slate-400" />
            View Past Import Batches &amp; Undo
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectAdjustment();
            }}
            className="flex items-center gap-1.5 font-semibold text-red-600 hover:text-red-700 transition-colors"
          >
            <FileEdit size={14} />
            Loss / Damage Write-Off
          </button>
        </div>
      </div>
    </div>
  );
};
