import React, { useState } from 'react';
import { FolderPlus, X, Tag, Check, AlertCircle, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { posApi } from '../../utils/pos-api';

interface CategoryItem {
  id: string;
  code: string;
  name_en: string;
  name_am?: string | null;
  product_count?: number | string;
}

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryItem[];
  onCategoryCreated: (category: CategoryItem) => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onCategoryCreated,
}) => {
  const { language } = useI18n();
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!nameEn.trim()) {
      setError('Please provide a category name in English.');
      return;
    }

    const categoryCode = (code.trim() || nameEn.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16));

    setLoading(true);
    try {
      const created = await posApi.createCategory({
        code: categoryCode,
        name_en: nameEn.trim(),
        name_am: nameAm.trim() || undefined,
      });

      setSuccess(`Category "${created.name_en}" created successfully!`);
      setCode('');
      setNameEn('');
      setNameAm('');
      onCategoryCreated(created);
    } catch (err: any) {
      setError(err.message || 'Failed to create category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gebeya-100 dark:bg-gebeya-950/60 text-gebeya-600 flex items-center justify-center">
              <FolderPlus size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'የእቃ ምድቦች ማስተዳደሪያ' : 'Category Management'}
              </h2>
              <p className="text-xs text-slate-500">
                {categories.length} {language === 'am' ? 'ምድቦች ተመዝግበዋል' : 'registered categories'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create New Category Form */}
          <form onSubmit={handleCreate} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Plus size={14} className="text-gebeya-600" />
                {language === 'am' ? 'አዲስ ምድብ ጨምር' : 'Add New Category'}
              </h3>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            {success && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 text-xs flex items-center gap-2">
                <Check size={15} />
                {success}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  {language === 'am' ? 'የምድብ ስም (እንግሊዝኛ) *' : 'Name (EN) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Beverages"
                  value={nameEn}
                  onChange={(e) => {
                    setNameEn(e.target.value);
                    if (!code) {
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  {language === 'am' ? 'የምድብ ስም (አማርኛ)' : 'Name (Amharic)'}
                </label>
                <input
                  type="text"
                  placeholder="ለምሳሌ መጠጦች"
                  value={nameAm}
                  onChange={(e) => setNameAm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  {language === 'am' ? 'ኮድ' : 'Category Code'}
                </label>
                <input
                  type="text"
                  placeholder="BEV"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={loading || !nameEn.trim()}
                className="px-4 py-2 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Plus size={14} />
                {loading ? 'Creating...' : (language === 'am' ? 'ምድብ መዝግብ' : 'Save Category')}
              </button>
            </div>
          </form>

          {/* Existing Categories List */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              {language === 'am' ? 'ያሉ ምድቦች' : 'Existing Categories'}
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {categories.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No categories found. Create one above!
                </div>
              ) : (
                categories.map((c) => (
                  <div key={c.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center font-bold text-xs">
                        <Tag size={14} />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                          {c.name_en}
                          {c.name_am && (
                            <span className="text-slate-500 text-[11px] font-normal font-sans">
                              ({c.name_am})
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          CODE: {c.code}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {c.product_count !== undefined ? `${c.product_count} products` : 'Active'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
          >
            {language === 'am' ? 'ዝጋ' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
