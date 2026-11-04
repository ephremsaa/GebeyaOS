import React, { useState, useEffect } from 'react';
import {
  Store,
  Key,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  X,
  Server,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface BranchActivationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BranchActivationModal: React.FC<BranchActivationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'activate'>('generate');
  const [branchName, setBranchName] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCodeResult, setGeneratedCodeResult] = useState<any | null>(null);
  const [codesList, setCodesList] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  // Activate Tab Form
  const [inputCode, setInputCode] = useState('');
  const [inputBranchCode, setInputBranchCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<any | null>(null);

  const token = sessionStorage.getItem('gebeyaos_token') || localStorage.getItem('gebeyaos_token');

  const loadCodes = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/branches/activation/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCodesList(data);
      }
    } catch (err) {
      console.error('Failed to load activation codes:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCodes();
    }
  }, [isOpen]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/branches/activation/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          branchName: branchName.trim(),
          expiresInHours,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedCodeResult(data);
        setBranchName('');
        loadCodes();
      } else {
        setError(data.message || 'Failed to generate branch activation code.');
      }
    } catch {
      setError('Network error generating activation code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivationError(null);
    setIsActivating(true);
    try {
      const res = await fetch('/api/branches/activation/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activationCode: inputCode.trim(),
          branchCode: inputBranchCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActivationSuccess(data);
        setInputCode('');
        setInputBranchCode('');
      } else {
        setActivationError(data.message || 'Branch activation failed.');
      }
    } catch {
      setActivationError('Network error connecting to HQ activation server.');
    } finally {
      setIsActivating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs font-sans select-none">
      <div className="bg-surface border border-border-subtle rounded-3xl w-full max-w-xl p-6 shadow-2xl relative text-text-main">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Store size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-main">Branch Server Activation</h3>
              <p className="text-[11px] text-text-muted">Single-use activation codes for remote store branches</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-main p-1 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-surface-2 p-1 rounded-xl border border-border-subtle text-xs font-semibold mb-5">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              activeTab === 'generate' ? 'bg-surface text-primary shadow-xs font-bold' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Generate Activation Code (HQ Owner)
          </button>
          <button
            onClick={() => setActiveTab('activate')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              activeTab === 'activate' ? 'bg-surface text-primary shadow-xs font-bold' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Register Branch LAN Server
          </button>
        </div>

        {activeTab === 'generate' && (
          <div className="space-y-5 text-xs">
            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {generatedCodeResult ? (
              <div className="p-5 rounded-2xl bg-surface-2 border border-primary/30 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                  <Key size={20} />
                </div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  One-Time Branch Activation Code:
                </div>
                <div className="font-mono text-2xl font-bold tracking-widest text-primary bg-surface py-3 rounded-xl border border-border-subtle select-all">
                  {generatedCodeResult.code}
                </div>
                <p className="text-[11px] text-text-muted max-w-sm mx-auto">
                  Assigned for <strong className="text-text-main">{generatedCodeResult.branchName}</strong>. Valid for {generatedCodeResult.expiresInHours} hours. Single-use only.
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    onClick={() => copyCode(generatedCodeResult.code)}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy Code'}
                  </button>
                  <button
                    onClick={() => setGeneratedCodeResult(null)}
                    className="px-4 py-2 rounded-xl bg-surface-2 border border-border-subtle text-text-main hover:bg-surface font-semibold transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label className="block font-semibold text-text-muted mb-1">New Branch Name</label>
                  <input
                    type="text"
                    required
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="e.g., Megenagna Branch"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main placeholder-text-dim text-sm focus:outline-hidden focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-text-muted mb-1">Code Expiration</label>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-text-main focus:outline-hidden focus:border-primary transition-colors"
                  >
                    <option value={24}>24 Hours</option>
                    <option value={72}>72 Hours (Default)</option>
                    <option value={168}>7 Days</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !branchName.trim()}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 transition-colors"
                >
                  {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                  Generate Activation Code
                </button>
              </form>
            )}

            {/* List of Recent Codes */}
            {codesList.length > 0 && (
              <div className="pt-2">
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Recent Activation Codes
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                  {codesList.map((c) => (
                    <div
                      key={c.id}
                      className="p-2 rounded-lg bg-surface-2 border border-border-subtle flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-main tracking-wider">{c.code}</span>
                        <span className="text-text-muted font-sans">• {c.branchName}</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                          c.isUsed
                            ? 'bg-surface-2 text-text-dim'
                            : c.isExpired
                            ? 'bg-danger/10 text-danger'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {c.isUsed ? 'Used' : c.isExpired ? 'Expired' : 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activate' && (
          <div className="space-y-4 text-xs">
            {activationError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{activationError}</span>
              </div>
            )}

            {activationSuccess ? (
              <div className="p-5 rounded-2xl bg-surface-2 border border-primary/30 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="font-bold text-text-main text-base">Branch Server Activated!</h4>
                <p className="text-text-muted text-xs">
                  This branch server is now connected to <strong className="text-text-main">{activationSuccess.tenantName}</strong> as branch{' '}
                  <strong className="text-primary font-mono">{activationSuccess.branchCode} ({activationSuccess.branchName})</strong>.
                </p>
                <button
                  onClick={() => {
                    setActivationSuccess(null);
                    onClose();
                  }}
                  className="px-6 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold transition-colors"
                >
                  Close & Start Operations
                </button>
              </div>
            ) : (
              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <label className="block font-semibold text-text-muted mb-1">
                    8-Character Activation Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="e.g., K7X2P9QA"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-text-main placeholder-text-dim font-mono tracking-widest text-center text-base focus:outline-hidden focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-text-muted mb-1">
                    Branch Code Identifier (Optional)
                  </label>
                  <input
                    type="text"
                    value={inputBranchCode}
                    onChange={(e) => setInputBranchCode(e.target.value.toUpperCase())}
                    placeholder="e.g., MEG-01"
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-text-main font-mono focus:outline-hidden focus:border-primary transition-colors"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-surface-2 border border-border-subtle text-text-muted text-xs flex items-start gap-2">
                  <ShieldCheck size={16} className="text-primary shrink-0 mt-0.5" />
                  <span>Upon activation, this server will authenticate to HQ with branch-scoped credentials and sync that tenant's catalog.</span>
                </div>

                <button
                  type="submit"
                  disabled={isActivating || inputCode.trim().length !== 8}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 transition-colors"
                >
                  {isActivating ? <RefreshCw size={14} className="animate-spin" /> : <Server size={14} />}
                  Activate Branch Server
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
