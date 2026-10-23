import React, { useState } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  CheckCircle2,
  HardDrive,
  Copy,
  Check,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';

export const BackupRestoreView: React.FC = () => {
  const { language } = useI18n();
  const { currentUser } = useAuth();

  // Backup state
  const [generating, setGenerating] = useState<boolean>(false);
  const [latestBackup, setLatestBackup] = useState<any | null>(null);
  const [copiedSha, setCopiedSha] = useState<boolean>(false);

  // Restore state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedPayload, setParsedPayload] = useState<any | null>(null);
  const [computedSha, setComputedSha] = useState<string | null>(null);
  const [shaMatch, setShaMatch] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const handleGenerateBackup = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/system/backup');
      if (res.ok) {
        const data = await res.json();
        setLatestBackup(data);

        // Download as JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const filename = `gebeyaos-backup-${data.metadata.branchId.slice(0, 8)}-${new Date()
          .toISOString()
          .replace(/[:.]/g, '-')}.json`;
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('Failed to generate backup.');
      }
    } catch (err) {
      alert('Error generating backup');
    } finally {
      setGenerating(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setRestoreSuccess(null);
    setRestoreError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        setParsedPayload(parsed);

        // Verify SHA-256 in browser via Web Crypto API
        const tablesString = JSON.stringify(parsed.tables);
        const msgBuffer = new TextEncoder().encode(tablesString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

        setComputedSha(hashHex);
        const isMatch = hashHex === parsed.metadata?.sha256;
        setShaMatch(isMatch);
      } catch (err: any) {
        setRestoreError('Invalid backup file format. Must be a valid JSON backup file.');
        setParsedPayload(null);
        setShaMatch(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!parsedPayload) return;
    if (!shaMatch) {
      if (!confirm('Warning: SHA-256 integrity checksum does not match! The file may be corrupted. Continue anyway?')) {
        return;
      }
    } else {
      if (!confirm('Are you sure you want to restore? This will update system settings and categories from the backup.')) {
        return;
      }
    }

    setRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);
    try {
      const res = await fetch('/api/system/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupPayload: parsedPayload }),
      });

      if (res.ok) {
        const data = await res.json();
        setRestoreSuccess(data.message || 'Restored successfully!');
      } else {
        const err = await res.json();
        setRestoreError(err.message || 'Failed to restore backup');
      }
    } catch (err: any) {
      setRestoreError(err.message || 'Error executing restore');
    } finally {
      setRestoring(false);
    }
  };

  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-y-auto select-none">
      {/* 1. Header Toolbar */}
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <HardDrive className="text-emerald-600" size={24} />
          {language === 'am' ? 'የመረጃ ቅጂ እና መልሶ ማግኛ' : 'Disaster Recovery: Backup & Restore'}
        </h1>
        <p className="text-xs text-slate-500">
          {language === 'am'
            ? 'የቅርንጫፍ ዳታቤዝ ወደ ዩኤስቢ/ኮምፒውተር በ1-ክሊክ ማስቀመጥ እና የ SHA-256 ማረጋገጫ'
            : 'One-click local/USB encrypted snapshot export, cryptographic SHA-256 verification, and disaster recovery restore drill.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL A: ONE-CLICK BACKUP */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                <Download size={20} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  1-Click Local & USB Backup
                </h2>
                <p className="text-xs text-slate-400">
                  Exports branch catalog, ledger, transactions, users, and settings.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              GebeyaOS creates complete standalone JSON snapshots containing all branch tables. Backups can be copied directly to USB flash drives or external drives for disaster recovery during catastrophic hardware failure.
            </p>

            {latestBackup && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 mb-6 text-xs space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-500">Timestamp:</span>
                  <span className="font-mono">{new Date(latestBackup.metadata.timestamp).toLocaleString()}</span>
                </div>

                <div>
                  <div className="font-bold text-slate-500 mb-1 flex items-center justify-between">
                    <span>SHA-256 Checksum:</span>
                    <button
                      onClick={() => handleCopySha(latestBackup.metadata.sha256)}
                      className="text-emerald-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      {copiedSha ? <Check size={12} /> : <Copy size={12} />}
                      {copiedSha ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 text-emerald-400 font-mono text-[11px] break-all select-all">
                    {latestBackup.metadata.sha256}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500 block mb-1">Archived Table Counts:</span>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {Object.entries(latestBackup.metadata.recordCounts || {}).map(([tbl, cnt]) => (
                      <div key={tbl} className="flex justify-between">
                        <span className="text-slate-400">{tbl}:</span>
                        <span className="font-mono font-bold">{cnt as any}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleGenerateBackup}
            disabled={generating}
            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <Download size={16} />
            {generating ? 'Generating Backup Snapshot...' : 'Export & Download Branch Backup (JSON)'}
          </button>
        </div>

        {/* PANEL B: RESTORE DRILL & INTEGRITY CHECK */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center">
                <Upload size={20} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Backup Verification & Restore Drill
                </h2>
                <p className="text-xs text-slate-400">
                  Verifies cryptographic hash before applying database changes.
                </p>
              </div>
            </div>

            {/* File Dropzone */}
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer relative mb-6">
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <FileCheck size={28} className="mx-auto text-purple-500 mb-2" />
              <div className="text-xs font-bold text-slate-800 dark:text-white">
                {uploadedFile ? uploadedFile.name : 'Click or drag a GebeyaOS backup JSON file here'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {uploadedFile ? `${(uploadedFile.size / 1024).toFixed(1)} KB` : 'Supports .json snapshots'}
              </div>
            </div>

            {/* Verification Status */}
            {parsedPayload && (
              <div className="space-y-3 mb-6">
                <div
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2.5 ${
                    shaMatch
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800'
                  }`}
                >
                  {shaMatch ? (
                    <>
                      <ShieldCheck size={18} className="text-emerald-600 flex-shrink-0" />
                      <div>
                        <div>Integrity Verified (SHA-256 Matched)</div>
                        <div className="text-[10px] font-mono opacity-80 mt-0.5">
                          Payload matches original signature {parsedPayload.metadata?.sha256?.slice(0, 16)}...
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
                      <div>
                        <div>Warning: SHA-256 Checksum Mismatch</div>
                        <div className="text-[10px] opacity-80 mt-0.5">
                          File contents may have been modified or corrupted.
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Backup Branch:</span>
                    <span className="font-mono font-bold">{parsedPayload.metadata?.branchId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Created At:</span>
                    <span className="font-mono">{new Date(parsedPayload.metadata?.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Version:</span>
                    <span className="font-mono">{parsedPayload.metadata?.version}</span>
                  </div>
                </div>
              </div>
            )}

            {restoreSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 text-xs font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 size={16} />
                {restoreSuccess}
              </div>
            )}

            {restoreError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 text-xs font-bold mb-4 flex items-center gap-2">
                <AlertTriangle size={16} />
                {restoreError}
              </div>
            )}
          </div>

          <button
            onClick={handleExecuteRestore}
            disabled={restoring || !parsedPayload}
            className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <Upload size={16} />
            {restoring ? 'Executing Restore Drill...' : 'Confirm & Execute Database Restore'}
          </button>
        </div>
      </div>
    </div>
  );
};
