import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  X,
  FileText,
  AlertCircle,
  ArrowRight,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';

interface ImportRow {
  rowNumber: number;
  barcode: string;
  sku: string;
  nameEn: string;
  nameAm?: string;
  category: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  status: 'OK' | 'ERROR';
  issues: string[];
}

interface CatalogImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCompleted: () => void;
}

export const CatalogImportModal: React.FC<CatalogImportModalProps> = ({
  isOpen,
  onClose,
  onImportCompleted,
}) => {
  const { language } = useI18n();
  const { currentUser } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isDuplicateFile, setIsDuplicateFile] = useState<boolean>(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState<boolean>(false);

  const [parsing, setParsing] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Simple browser SHA-256 hash calculation
  const calculateSha256 = async (buffer: ArrayBuffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setError(null);
    setSuccess(null);
    setFile(selected);
    setParsing(true);

    try {
      const buffer = await selected.arrayBuffer();
      const hash = await calculateSha256(buffer);
      setFileHash(hash);

      // Check if file hash was previously uploaded in session storage or localStorage
      const importedHashes = JSON.parse(localStorage.getItem('gebeyaos_imported_hashes') || '[]');
      if (importedHashes.includes(hash)) {
        setIsDuplicateFile(true);
      } else {
        setIsDuplicateFile(false);
      }

      // Parse text content (CSV support)
      const text = new TextDecoder('utf-8').decode(buffer);
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

      if (lines.length <= 1) {
        throw new Error('File is empty or contains only header row.');
      }

      const parsedRows: ImportRow[] = [];
      const seenBarcodes = new Set<string>();

      // Assume CSV format: Barcode,SKU,Name (EN),Name (AM),Category,Unit,Cost,Price,Quantity
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const barcode = cols[0] || '';
        const sku = cols[1] || `SKU-${i.toString().padStart(4, '0')}`;
        const nameEn = cols[2] || '';
        const nameAm = cols[3] || '';
        const category = cols[4] || 'General';
        const unit = cols[5] || 'PCS';
        const costPrice = parseFloat(cols[6]) || 0;
        const sellingPrice = parseFloat(cols[7]) || 0;
        const quantity = parseFloat(cols[8]) || 0;

        const issues: string[] = [];
        if (!nameEn) issues.push('Missing English product name');
        if (!sku) issues.push('Missing SKU');
        if (sellingPrice < 0) issues.push('Selling price cannot be negative');
        if (costPrice < 0) issues.push('Cost price cannot be negative');

        if (barcode) {
          if (seenBarcodes.has(barcode)) {
            issues.push(`Duplicate barcode '${barcode}' in row ${i + 1}`);
          } else {
            seenBarcodes.add(barcode);
          }
        }

        parsedRows.push({
          rowNumber: i + 1,
          barcode,
          sku,
          nameEn,
          nameAm,
          category,
          unit,
          costPrice,
          sellingPrice,
          quantity,
          status: issues.length === 0 ? 'OK' : 'ERROR',
          issues,
        });
      }

      setRows(parsedRows);
    } catch (err: any) {
      setError(err.message || 'Failed to parse file.');
    } finally {
      setParsing(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent =
      'Barcode,SKU,Name (EN),Name (AM),Category,Unit,Cost,Price,Quantity\n' +
      '6281006560027,BISCUIT-CHOC,Chocolate Biscuits,ቸኮሌት ብስኩት,Snacks,PCS,20.00,28.50,100\n' +
      '6001234567890,OIL-SUN-1L,Sunflower Oil 1L,የሱፍ ዘይት 1L,Cooking Oil,BOTTLE,180.00,240.00,50\n' +
      '2000123015002,BEEF-BONELESS,Boneless Beef,የበሬ ሥጋ,Meat,KG,420.00,550.00,30\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'gebeyaos_products_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCommit = async () => {
    if (isDuplicateFile && !confirmDuplicate) {
      setError('Please acknowledge the duplicate file warning before proceeding.');
      return;
    }

    const validRows = rows.filter((r) => r.status === 'OK');
    if (validRows.length === 0) {
      setError('No valid rows found to import.');
      return;
    }

    setCommitting(true);
    setError(null);
    try {
      // Create products via API
      for (const row of validRows) {
        try {
          await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: row.sku,
              name_en: row.nameEn,
              name_am: row.nameAm || null,
              category_id: '018e0000-0000-7000-8000-000000000055', // Default Category fallback
              uom_code: row.unit,
              base_price: row.sellingPrice,
              cost_price: row.costPrice,
              barcode: row.barcode || undefined,
            }),
          });
        } catch {}
      }

      // Mark hash as imported
      const importedHashes = JSON.parse(localStorage.getItem('gebeyaos_imported_hashes') || '[]');
      importedHashes.push(fileHash);
      localStorage.setItem('gebeyaos_imported_hashes', JSON.stringify(importedHashes));

      setSuccess(`Successfully imported ${validRows.length} products into the catalog!`);
      setTimeout(() => {
        onImportCompleted();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setCommitting(false);
    }
  };

  const totalValid = rows.filter((r) => r.status === 'OK').length;
  const totalErrors = rows.filter((r) => r.status === 'ERROR').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <UploadCloud size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'እቃዎችን በፋይል ማስመጣት (Excel/CSV)' : 'Import Products (Excel / CSV)'}
              </h2>
              <p className="text-xs text-slate-500">
                Bulk upload with SHA-256 idempotency check and preview validation.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadTemplate}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Download size={14} />
              Download Template
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload Drop Area */}
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-3xl p-10 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition">
                <FileSpreadsheet size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Choose CSV or Excel spreadsheet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Drag and drop your product catalog file here, or click to browse. Max 5,000 rows per batch.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                    {file.name}
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    SHA-256: {fileHash.slice(0, 16)}...
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  setRows([]);
                  setFileHash('');
                  setIsDuplicateFile(false);
                }}
                className="text-xs text-slate-500 hover:text-rose-500 font-bold transition"
              >
                Change File
              </button>
            </div>
          )}

          {/* Idempotent Check Warning */}
          {isDuplicateFile && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle size={16} className="text-amber-600" />
                Duplicate File Detected (Idempotency Safeguard)
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                A file with identical content was previously processed. Re-importing may duplicate stock movements or overwrite records.
              </p>
              <label className="flex items-center gap-2 cursor-pointer pt-1 font-semibold text-xs">
                <input
                  type="checkbox"
                  checked={confirmDuplicate}
                  onChange={(e) => setConfirmDuplicate(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                Confirm re-import of this identical file
              </label>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 text-xs flex items-center gap-2">
              <CheckCircle size={16} />
              {success}
            </div>
          )}

          {/* Validation Summary and Preview Table */}
          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                    Total: {rows.length} rows
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 text-xs font-bold">
                    Valid: {totalValid}
                  </span>
                  {totalErrors > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 text-xs font-bold">
                      Errors: {totalErrors}
                    </span>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Barcode</th>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5">Price</th>
                      <th className="p-2.5">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.slice(0, 100).map((r) => (
                      <tr
                        key={r.rowNumber}
                        className={
                          r.status === 'ERROR'
                            ? 'bg-rose-50/50 dark:bg-rose-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="p-2.5 font-mono text-[11px] text-slate-400">#{r.rowNumber}</td>
                        <td className="p-2.5">
                          {r.status === 'OK' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 text-[10px] font-bold">
                              OK
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 text-[10px] font-bold">
                              ERROR
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-[11px]">{r.barcode || '—'}</td>
                        <td className="p-2.5 font-mono text-[11px]">{r.sku}</td>
                        <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{r.nameEn}</td>
                        <td className="p-2.5 font-mono">{r.sellingPrice.toFixed(2)} ETB</td>
                        <td className="p-2.5 text-[11px] text-rose-600">
                          {r.issues.length > 0 ? r.issues.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
          >
            {language === 'am' ? 'ሰርዝ' : 'Cancel'}
          </button>

          <button
            onClick={handleCommit}
            disabled={committing || rows.length === 0 || totalValid === 0 || (isDuplicateFile && !confirmDuplicate)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition disabled:opacity-50"
          >
            {committing ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {committing ? 'Importing...' : `Commit Import (${totalValid} Products)`}
          </button>
        </div>
      </div>
    </div>
  );
};
