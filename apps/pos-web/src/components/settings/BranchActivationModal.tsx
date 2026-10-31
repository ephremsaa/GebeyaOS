import React, { useState, useEffect } from 'react';
import {
  Store,
  Key,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Clock,
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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-6 shadow-2xl relative text-slate-100">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <Store size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Branch Server Activation</h3>
              <p className="text-[11px] text-slate-400">Single-use activation codes for remote store branches</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold mb-5">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              activeTab === 'generate' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Generate Activation Code (HQ Owner)
          </button>
          <button
            onClick={() => setActiveTab('activate')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              activeTab === 'activate' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Register Branch LAN Server
          </button>
        </div>

        {activeTab === 'generate' && (
          <div className="space-y-5 text-xs">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-300 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {generatedCodeResult ? (
              <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/30 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 mx-auto flex items-center justify-center">
                  <Key size={20} />
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  One-Time Branch Activation Code:
                </div>
                <div className="font-mono text-2xl font-bold tracking-widest text-emerald-300 bg-slate-900 py-3 rounded-xl border border-slate-800 select-all">
                  {generatedCodeResult.code}
                </div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Assigned for <strong>{generatedCodeResult.branchName}</strong>. Valid for {generatedCodeResult.expiresInHours} hours. Single-use only.
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    onClick={() => copyCode(generatedCodeResult.code)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy Code'}
                  </button>
                  <button
                    onClick={() => setGeneratedCodeResult(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">New Branch Name</label>
                  <input
                    type="text"
                    required
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="e.g., Megenagna Branch"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Code Expiration</label>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value={24}>24 Hours</option>
                    <option value={72}>72 Hours (Default)</option>
                    <option value={168}>7 Days</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !branchName.trim()}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-950/40 disabled:opacity-50"
                >
                  {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                  Generate Activation Code
                </button>
              </form>
            )}

            {/* List of Recent Codes */}
            {codesList.length > 0 && (
              <div className="pt-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Recent Activation Codes
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                  {codesList.map((c) => (
                    <div
                      key={c.id}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white tracking-wider">{c.code}</span>
                        <span className="text-slate-400 font-sans">• {c.branchName}</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                          c.isUsed
                            ? 'bg-slate-800 text-slate-400'
                            : c.isExpired
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-emerald-500/20 text-emerald-400'
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
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-300 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{activationError}</span>
              </div>
            )}

            {activationSuccess ? (
              <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/30 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="font-bold text-white text-base">Branch Server Activated!</h4>
                <p className="text-slate-400 text-xs">
                  This branch server is now connected to <strong>{activationSuccess.tenantName}</strong> as branch{' '}
                  <strong className="text-emerald-300 font-mono">{activationSuccess.branchCode} ({activationSuccess.branchName})</strong>.
                </p>
                <button
                  onClick={() => {
                    setActivationSuccess(null);
                    onClose();
                  }}
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Close & Start Operations
                </button>
              </div>
            ) : (
              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    8-Character Activation Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="e.g., K7X2P9QA"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 font-mono tracking-widest text-center text-base focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Branch Code Identifier (Optional)
                  </label>
                  <input
                    type="text"
                    value={inputBranchCode}
                    onChange={(e) => setInputBranchCode(e.target.value.toUpperCase())}
                    placeholder="e.g., MEG-01"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-400 text-xs">
                  <ShieldCheck size={16} className="text-emerald-400 mb-1" />
                  Upon activation, this server will authenticate to HQ with branch-scoped credentials and sync that tenant's catalog.
                </div>

                <button
                  type="submit"
                  disabled={isActivating || inputCode.trim().length !== 8}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-950/40 disabled:opacity-50"
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

