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
  Archive,
  Image as ImageIcon,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { calculateItemVatBreakdown } from '@gebeyaos/shared-types';

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
  const { language, t } = useI18n();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'excel' | 'zip'>('excel');

  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isDuplicateFile, setIsDuplicateFile] = useState<boolean>(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState<boolean>(false);

  const [parsing, setParsing] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ZIP Photo Import State
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipUploading, setZipUploading] = useState<boolean>(false);
  const [zipResult, setZipResult] = useState<{
    totalInZip: number;
    matchedCount: number;
    unmatchedCount: number;
    unmatchedFiles: string[];
    errors: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

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
      const formData = new FormData();
      formData.append('file', selected);

      const token = localStorage.getItem('gebeyaos_access_token');
      const branchId = currentUser?.branchId || '';

      const res = await fetch('/api/inventory/import/validate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(branchId ? { 'x-branch-id': branchId } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to validate file.');
      }

      const data = await res.json();
      setFileHash(data.fileHash);
      setIsDuplicateFile(data.duplicateFileWarning);
      setRows(
        data.rows.map((r: any) => ({
          rowNumber: r.rowNumber,
          barcode: r.barcode,
          sku: r.sku,
          nameEn: r.nameEn,
          nameAm: r.nameAm,
          category: r.category,
          unit: r.unit,
          costPrice: r.costPrice,
          sellingPrice: r.sellingPrice,
          quantity: r.quantity,
          status: r.status,
          issues: r.issues || [],
        })),
      );
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

  const handleUploadZip = async () => {
    if (!zipFile) return;
    setZipUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append('zip', zipFile);
      const res = await fetch('/api/media/products/bulk-zip', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('gebeyaos_access_token') || ''}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'ZIP upload failed.');
      }

      const data = await res.json();
      setZipResult(data);
      if (data.matchedCount > 0) {
        onImportCompleted();
      }
    } catch (err: any) {
      setError(err.message || 'ZIP import failed');
    } finally {
      setZipUploading(false);
    }
  };

  const handleCommit = async () => {
    if (isDuplicateFile && !confirmDuplicate) {
      setError('Please acknowledge the duplicate file warning before proceeding.');
      return;
    }

    const validRows = rows.filter((r) => r.status !== 'ERROR');
    if (validRows.length === 0) {
      setError('No valid rows found to import.');
      return;
    }

    setCommitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const branchId = currentUser?.branchId || '';

      const res = await fetch('/api/inventory/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(branchId ? { 'x-branch-id': branchId } : {}),
        },
        body: JSON.stringify({
          fileName: file?.name || 'catalog_import.xlsx',
          fileHash,
          importMode: 'CREATE_OR_UPDATE',
          sourceType: 'OPENING_BALANCE',
          confirmDuplicate,
          rows: validRows,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Import failed.');
      }

      const result = await res.json();
      setSuccess(`Successfully imported ${result.createdCount + result.updatedCount} products into the catalog!`);
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
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <UploadCloud size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'እቃዎችን በጅምላ ማስመጣት' : 'Catalog Bulk Import'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'am'
                  ? 'የምርት መረጃዎችን በኤክሴል ወይም የምስል ፋይሎችን በZIP ጥቅል ያስገቡ'
                  : 'Import product items via Excel/CSV or bulk photos via ZIP package'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'excel' && (
              <button
                onClick={downloadTemplate}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download size={14} />
                Download Template
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('excel')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'excel'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>{language === 'am' ? 'የኤክሴል / ሲኤስቪ ፋይል' : 'Excel / CSV Spreadsheet'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('zip')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'zip'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Archive size={14} />
            <span>{t('catalog.bulkPhotoZipTitle')}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'zip' ? (
            /* ZIP Photos Import Flow */
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 text-xs flex items-center gap-3">
                <ImageIcon size={24} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                <p>{t('catalog.bulkPhotoZipDesc')}</p>
              </div>

              {error && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!zipFile ? (
                <div
                  onClick={() => zipInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-3xl p-10 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition group"
                >
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const sel = e.target.files?.[0];
                      if (sel) {
                        setZipFile(sel);
                        setZipResult(null);
                        setError(null);
                      }
                    }}
                  />
                  <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition">
                    <Archive size={32} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    {language === 'am' ? 'የፎቶዎች ZIP ፋይል ይምረጡ' : 'Choose ZIP Archive containing photos'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {language === 'am'
                      ? 'ፎቶዎችን በባርኮድ ወይም በSKU ይሰይሙ (ለምሳሌ፡ 690123.jpg, BREAD-01.png)። እስከ 50MB በአንድ ጊዜ።'
                      : 'Photos should be named with product barcode or SKU (e.g. 690123.jpg, BREAD-01.png). Up to 50MB.'}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
                      <Archive size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                        {zipFile.name}
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({(zipFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">Ready for automated barcode matching</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setZipFile(null);
                      setZipResult(null);
                      setError(null);
                    }}
                    className="text-xs text-slate-500 hover:text-rose-500 font-bold transition"
                  >
                    Change ZIP
                  </button>
                </div>
              )}

              {/* ZIP Import Results */}
              {zipResult && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 font-bold">
                    <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                    <span>
                      {t('catalog.zipImportSuccess', {
                        matched: zipResult.matchedCount,
                        total: zipResult.totalInZip,
                      })}
                    </span>
                  </div>

                  {zipResult.unmatchedCount > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                        <span>
                          {t('catalog.zipUnmatchedNotice', { count: zipResult.unmatchedCount })}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                        {zipResult.unmatchedFiles.map((f) => (
                          <span
                            key={f}
                            className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[11px] font-mono text-amber-900 dark:text-amber-300"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Original Excel Spreadsheet Flow */
            <>
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
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
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
              <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Barcode</th>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5 text-right">Net Price</th>
                      <th className="p-2.5 text-right">15% VAT</th>
                      <th className="p-2.5 text-right">Gross Price</th>
                      <th className="p-2.5">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.slice(0, 100).map((r) => {
                      const vat = calculateItemVatBreakdown({
                        typedPrice: r.sellingPrice,
                        priceIncludesVat: true,
                        isVatApplicable: true,
                        vatRate: 0.15,
                        costPrice: r.costPrice,
                      });
                      return (
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
                          <td className="p-2.5 font-mono text-right text-slate-700 dark:text-slate-300">
                            {vat.netPrice.toFixed(2)}
                          </td>
                          <td className="p-2.5 font-mono text-right text-emerald-600">
                            {vat.vatAmount.toFixed(2)}
                          </td>
                          <td className="p-2.5 font-mono text-right font-bold text-slate-900 dark:text-white">
                            {vat.grossPrice.toFixed(2)} ETB
                          </td>
                          <td className="p-2.5 text-[11px] text-rose-600">
                            {r.issues.length > 0 ? r.issues.join(', ') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
          >
            {language === 'am' ? 'ዝጋ' : 'Close'}
          </button>

          {activeTab === 'zip' ? (
            <button
              onClick={zipResult ? onClose : handleUploadZip}
              disabled={zipUploading || !zipFile}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition disabled:opacity-50"
            >
              {zipUploading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <CheckCircle size={14} />
              )}
              {zipUploading
                ? 'Processing ZIP...'
                : zipResult
                ? (language === 'am' ? 'ተጠናቋል' : 'Done')
                : t('catalog.importZipBtn')}
            </button>
          ) : (
            <button
              onClick={handleCommit}
              disabled={committing || rows.length === 0 || totalValid === 0 || (isDuplicateFile && !confirmDuplicate)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition disabled:opacity-50"
            >
              {committing ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {committing ? 'Importing...' : `Commit Import (${totalValid} Products)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
