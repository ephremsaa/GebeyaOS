import React, { useState } from 'react';
import { Terminal, Shield, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

interface TerminalPairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TerminalPairModal: React.FC<TerminalPairModalProps> = ({ isOpen, onClose }) => {
  const { terminalConfig, pairTerminal, currentUser, assignedBranches } = useAuth();
  const { t } = useI18n();

  const [terminalCode, setTerminalCode] = useState(terminalConfig?.terminalCode || 'POS-01');
  const [terminalName, setTerminalName] = useState(terminalConfig?.terminalName || 'Express Lane 1');
  const [branchId, setBranchId] = useState(
    terminalConfig?.branchId || currentUser?.branchId || (assignedBranches[0]?.id ?? ''),
  );
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(
    terminalConfig?.autoLockMinutes || 3,
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const res = await pairTerminal({
      terminalCode: terminalCode.trim().toUpperCase(),
      terminalName: terminalName.trim(),
      branchId,
      autoLockMinutes,
    });

    setIsLoading(false);

    if (res.success && res.terminal) {
      setSuccessResult(res.terminal);
    } else {
      setError(res.error || 'Failed to pair terminal');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md select-none animate-in fade-in"
      style={{ background: 'rgba(15, 23, 42, 0.75)' }}
    >
      <div className="w-full max-w-md bg-surface border border-border-subtle rounded-3xl p-6 shadow-modal flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
              <Terminal size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">{t('pairTerminalTitle')}</h2>
              <p className="text-[11px] text-text-muted">{t('pairTerminalDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-xs flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successResult ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 size={18} />
                <span>Terminal Paired Successfully!</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This physical POS device is now securely paired with branch register{' '}
                <strong>{successResult.terminalCode}</strong> ({successResult.terminalName}).
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-surface-2 border border-border-subtle text-xs flex flex-col gap-2">
              <div>
                <span className="text-text-muted">Terminal ID:</span>
                <p className="font-mono text-text-main">{successResult.terminalId}</p>
              </div>
              <div>
                <span className="text-text-muted">Device Token (Hashed at HQ):</span>
                <p className="font-mono text-[11px] text-primary truncate">
                  {successResult.deviceToken}
                </p>
              </div>
              <div>
                <span className="text-text-muted">Auto-Lock Inactivity:</span>
                <p className="font-bold text-text-main">{successResult.autoLockMinutes} minutes</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn-primary w-full py-2.5 rounded-2xl font-bold text-xs"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                {t('terminalCodeLabel')}
              </label>
              <input
                type="text"
                required
                value={terminalCode}
                onChange={(e) => setTerminalCode(e.target.value.toUpperCase())}
                placeholder="POS-01"
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main focus:outline-hidden focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                {t('terminalNameLabel')}
              </label>
              <input
                type="text"
                required
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="Front Checkout Lane 1"
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main focus:outline-hidden focus:border-primary"
              />
            </div>

            {assignedBranches.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Branch Assignment
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main focus:outline-hidden focus:border-primary"
                >
                  {assignedBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                {t('autoLockMinutesLabel')}
              </label>
              <select
                value={autoLockMinutes}
                onChange={(e) => setAutoLockMinutes(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main focus:outline-hidden focus:border-primary"
              >
                <option value={1}>1 Minute (Strict Security)</option>
                <option value={3}>3 Minutes (Standard Retail)</option>
                <option value={5}>5 Minutes (Busy Store)</option>
                <option value={10}>10 Minutes (Extended)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isLoading || !terminalCode.trim()}
              className="btn-primary w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider mt-1"
            >
              {isLoading ? 'Pairing Terminal...' : t('pairTerminalAction')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

