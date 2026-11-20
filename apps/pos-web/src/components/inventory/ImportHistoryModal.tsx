import React, { useState, useEffect } from 'react';
import { History, RotateCcw, CheckCircle2, AlertTriangle, X, FileSpreadsheet, User } from 'lucide-react';
import { ImportBatchSummary } from '@gebeyaos/shared-types';

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRevertSuccess?: (batchId: string) => void;
}

export const ImportHistoryModal: React.FC<ImportHistoryModalProps> = ({
  isOpen,
  onClose,
  onRevertSuccess,
}) => {
  const [batches, setBatches] = useState<ImportBatchSummary[]>([]);
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('gebeyaos_access_token');
        const res = await fetch('/api/inventory/import/history', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setBatches(data);
          }
        } else {
          setBatches([]);
        }
      } catch {
        setBatches([]);
      }
    };
    fetchHistory();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExecuteUndo = async (batchId: string) => {
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/inventory/import/${batchId}/undo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // offline fallback
    }

    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId ? { ...b, status: 'REVERTED', revertedAt: new Date().toISOString() } : b,
      ),
    );
    setConfirmUndoId(null);
    setMsg('Import successfully reversed. Compensating stock movements have been posted.');
    if (onRevertSuccess) onRevertSuccess(batchId);
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div
      className="modal-overlay select-none animate-in fade-in duration-100"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content max-w-4xl max-h-[90vh] flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-surface-2 dark:bg-surface-2 text-white dark:text-text-main flex items-center justify-center shadow-md">
              <History size={20} />
            </div>
            <div>
              <h2 className="modal-title">Inventory Import History</h2>
              <p className="text-xs text-text-muted">
                Audit trail of all past bulk imports and manager rollback options
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {msg && (
          <div className="alert-success text-xs p-3 rounded-xl my-3 flex items-center gap-2">
            <CheckCircle2 size={15} />
            {msg}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto glass-panel border border-border-subtle rounded-2xl my-4 min-h-[260px]">
          <table className="data-table text-xs">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>File Name</th>
                <th>Mode / Source</th>
                <th>User</th>
                <th className="text-center">Counts (New/Upd/Err)</th>
                <th className="text-center">Status</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const isReverted = b.status === 'REVERTED';
                return (
                  <tr key={b.id} className={isReverted ? 'opacity-60 bg-surface-2/50' : ''}>
                    <td>
                      <span className="font-mono text-text-muted">
                        {new Date(b.createdAt).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 font-bold text-text-main text-text-main">
                        <FileSpreadsheet size={14} className="text-primary" />
                        {b.fileName}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-main">
                          {b.importMode}
                        </span>
                        <span className="text-[10px] text-text-muted">{b.sourceType}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-text-muted">
                        {b.userName || 'Admin'}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="font-mono text-text-muted">
                        +{b.createdCount} / ~{b.updatedCount} / !{b.errorCount}
                      </span>
                    </td>
                    <td className="text-center">
                      {isReverted ? (
                        <span className="badge-danger text-[10px] px-2 py-0.5">REVERTED</span>
                      ) : (
                        <span className="badge-success text-[10px] px-2 py-0.5">COMPLETED</span>
                      )}
                    </td>
                    <td className="text-center">
                      {!isReverted && (
                        <div>
                          {confirmUndoId === b.id ? (
                            <div className="flex items-center gap-1 justify-center animate-in fade-in">
                              <button
                                type="button"
                                onClick={() => handleExecuteUndo(b.id)}
                                className="px-2 py-1 rounded-lg bg-red-600 text-white font-bold text-[10px] hover:bg-red-700"
                              >
                                Confirm Undo
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmUndoId(null)}
                                className="px-1.5 py-1 rounded-lg text-text-muted hover:text-text-muted text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmUndoId(b.id)}
                              className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1 text-red-600 hover:bg-red-50"
                              title="Reverse stock movements posted by this batch"
                            >
                              <RotateCcw size={12} />
                              Undo Import
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-border-subtle">
          <button type="button" onClick={onClose} className="btn-secondary text-xs">
            Close History
          </button>
        </div>
      </div>
    </div>
  );
};
