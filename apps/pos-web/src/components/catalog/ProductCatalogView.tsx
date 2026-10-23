import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Printer,
  Edit2,
  Tag,
  Filter,
  Check,
  AlertTriangle,
  RefreshCw,
  Scale,
  Percent,
  X,
  Package,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { BarcodeLabelModal, LabelProductItem } from './BarcodeLabelModal';

interface ProductItem {
  id: string;
  sku: string;
  name_en: string;
  name_am?: string | null;
  category_id: string;
  category_name?: string;
  uom_code: string;
  base_price: string | number;
  cost_price: string | number;
  is_vat_applicable: boolean;
  vat_rate: string | number;
  is_weighed: boolean;
  scale_plu?: string | null;
  min_stock_level: string | number;
  max_stock_level?: string | number | null;
  allow_discount: boolean;
  is_active: boolean;
  stock_on_hand?: string | number;
  barcodes?: string[];
}

interface CategoryOption {
  id: string;
  code: string;
  name_en: string;
  name_am?: string | null;
}

interface UomOption {
  code: string;
  name_en: string;
}

export const ProductCatalogView: React.FC = () => {
  const { t, language } = useI18n();
  const { hasPermission } = useAuth();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [lowStockFilter, setLowStockFilter] = useState<boolean>(false);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState<boolean>(false);
  const [selectedForLabels, setSelectedForLabels] = useState<LabelProductItem[]>([]);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    sku: '',
    name_en: '',
    name_am: '',
    category_id: '',
    uom_code: 'PCS',
    base_price: 0,
    cost_price: 0,
    is_vat_applicable: true,
    vat_rate: 0.15,
    is_weighed: false,
    scale_plu: '',
    min_stock_level: 5,
    max_stock_level: 50,
    allow_discount: true,
    is_active: true,
    barcode: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const fetchDropdowns = async () => {
    try {
      const [catRes, uomRes] = await Promise.all([
        fetch('/api/products/categories'),
        fetch('/api/products/uoms'),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (uomRes.ok) setUoms(await uomRes.json());
    } catch (err) {
      console.error('Failed to load categories/uoms', err);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedCategory) params.append('category_id', selectedCategory);
      if (lowStockFilter) params.append('low_stock_only', 'true');
      params.append('limit', '100');

      const res = await fetch(`/api/products?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.rows || []);
      }
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 250);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, lowStockFilter]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      name_en: '',
      name_am: '',
      category_id: categories[0]?.id || '',
      uom_code: 'PCS',
      base_price: 0,
      cost_price: 0,
      is_vat_applicable: true,
      vat_rate: 0.15,
      is_weighed: false,
      scale_plu: '',
      min_stock_level: 5,
      max_stock_level: 50,
      allow_discount: true,
      is_active: true,
      barcode: '',
    });
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (p: ProductItem) => {
    setEditingProduct(p);
    setFormData({
      sku: p.sku,
      name_en: p.name_en,
      name_am: p.name_am || '',
      category_id: p.category_id,
      uom_code: p.uom_code,
      base_price: Number(p.base_price),
      cost_price: Number(p.cost_price),
      is_vat_applicable: p.is_vat_applicable,
      vat_rate: Number(p.vat_rate),
      is_weighed: p.is_weighed,
      scale_plu: p.scale_plu || '',
      min_stock_level: Number(p.min_stock_level),
      max_stock_level: p.max_stock_level ? Number(p.max_stock_level) : 50,
      allow_discount: p.allow_discount,
      is_active: p.is_active,
      barcode: p.barcodes?.[0] || '',
    });
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name_en || !formData.sku) {
      setFormError('Please provide product SKU and English name.');
      return;
    }
    if (formData.base_price < 0) {
      setFormError('Price cannot be negative.');
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        // Update product
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Failed to update product');
        }
      } else {
        // Create product
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Failed to create product');
        }
        const created = await res.json();

        // If barcode entered, attach it
        if (formData.barcode) {
          await fetch(`/api/products/${created.id}/barcodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              barcode: formData.barcode,
              barcode_type: 'CODE128',
              is_primary: true,
            }),
          });
        }
      }

      setIsEditModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintSingle = (p: ProductItem) => {
    const item: LabelProductItem = {
      id: p.id,
      sku: p.sku,
      barcode: p.barcodes?.[0] || p.sku,
      nameEn: p.name_en,
      nameAm: p.name_am,
      sellingPrice: Number(p.base_price),
      isVatApplicable: p.is_vat_applicable,
    };
    setSelectedForLabels([item]);
    setIsLabelModalOpen(true);
  };

  const handlePrintAll = () => {
    const labelItems: LabelProductItem[] = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      barcode: p.barcodes?.[0] || p.sku,
      nameEn: p.name_en,
      nameAm: p.name_am,
      sellingPrice: Number(p.base_price),
      isVatApplicable: p.is_vat_applicable,
    }));
    setSelectedForLabels(labelItems);
    setIsLabelModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Tag className="text-gebeya-600" size={24} />
            {language === 'am' ? 'የእቃዎች ካታሎግ እና ዋጋ' : 'Product Master Catalog'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'የእቃዎች ዝርዝር፣ የዋጋ ማስተካከያ እና የባርኮድ መለያ ማተሚያ'
              : 'SKU registry, pricing, VAT status, scale PLUs, and thermal barcode labels.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handlePrintAll}
            disabled={products.length === 0}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50"
          >
            <Printer size={15} />
            {language === 'am' ? 'ባርኮዶችን አትም' : 'Print Visible Labels'}
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Plus size={16} />
            {language === 'am' ? 'አዲስ እቃ መዝግብ' : 'Add Product'}
          </button>
        </div>
      </div>

      {/* 2. Filters Bar */}
      <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              language === 'am'
                ? 'በስም፣ በባርኮድ ወይም በ SKU ፈልግ...'
                : 'Search products by name, barcode, or SKU...'
            }
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-hidden focus:ring-2 focus:ring-gebeya-500/30 font-medium"
          />
        </div>

        {/* Category Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden"
          >
            <option value="">{language === 'am' ? 'ሁሉም ምድቦች' : 'All Categories'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {language === 'am' && c.name_am ? c.name_am : c.name_en}
              </option>
            ))}
          </select>

          {/* Low Stock Toggle */}
          <button
            onClick={() => setLowStockFilter(!lowStockFilter)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
              lowStockFilter
                ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle size={14} className={lowStockFilter ? 'text-amber-600' : 'text-slate-400'} />
            {language === 'am' ? 'የቀነሰ ክምችት ብቻ' : 'Low Stock Only'}
          </button>
        </div>
      </div>

      {/* 3. Products Data Table */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">SKU / Barcode</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">UOM</th>
                <th className="py-3 px-4 text-right">Cost (ETB)</th>
                <th className="py-3 px-4 text-right">Selling Price</th>
                <th className="py-3 px-4 text-center">Tax (VAT)</th>
                <th className="py-3 px-4 text-right">Stock On Hand</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Loading products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No products found matching your search.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const soh = Number(p.stock_on_hand || 0);
                  const minStock = Number(p.min_stock_level || 0);
                  const isLow = soh <= minStock;
                  const primaryBarcode = p.barcodes?.[0] || '—';

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition group"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          {p.sku}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                          {primaryBarcode}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {p.name_en}
                        </div>
                        {p.name_am && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            {p.name_am}
                          </div>
                        )}
                        {p.is_weighed && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
                            <Scale size={11} /> Scale PLU: {p.scale_plu || 'Auto'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">
                          {p.category_name || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-500">
                        {p.uom_code}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {Number(p.cost_price).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                        {Number(p.base_price).toFixed(2)} ETB
                      </td>
                      <td className="py-3 px-4 text-center">
                        {p.is_vat_applicable ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                            15% VAT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium text-[10px]">
                            Exempt
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={`font-black ${
                            soh <= 0
                              ? 'text-rose-600'
                              : isLow
                              ? 'text-amber-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {soh.toLocaleString('en-US')}
                        </span>
                        {isLow && (
                          <div className="text-[9px] text-amber-500 font-bold">
                            &le; {minStock} (Min)
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handlePrintSingle(p)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-cyan-600 transition"
                            title="Print Barcode Label"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-gebeya-600 transition"
                            title="Edit Product"
                          >
                            <Edit2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Count */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex justify-between items-center">
          <span>Showing {products.length} products</span>
          <span className="text-[11px] text-slate-400">Gebeya Central Branch Catalog</span>
        </div>
      </div>

      {/* 4. Add / Edit Product Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="text-gebeya-600" size={18} />
                {editingProduct
                  ? language === 'am'
                    ? 'እቃውን አሻሽል'
                    : 'Edit Product Details'
                  : language === 'am'
                  ? 'አዲስ እቃ መዝግብ'
                  : 'Register New Product'}
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle size={15} />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SKU */}
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-gebeya-500/30"
                  />
                </div>

                {/* Barcode */}
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Primary Barcode
                  </label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Scan or type barcode"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-gebeya-500/30"
                  />
                </div>
              </div>

              {/* Names (En & Amharic) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Product Name (English) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name_en}
                    onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                    placeholder="e.g. Sunflower Cooking Oil 5L"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-gebeya-500/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    የእቃ ስም (አማርኛ)
                  </label>
                  <input
                    type="text"
                    value={formData.name_am}
                    onChange={(e) => setFormData({ ...formData, name_am: e.target.value })}
                    placeholder="ምሳሌ፡ የሱፍ ዘይት 5 ሊትር"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-gebeya-500/30"
                  />
                </div>
              </div>

              {/* Category & UOM */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {language === 'am' && c.name_am ? c.name_am : c.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Unit of Measure (UOM) *
                  </label>
                  <select
                    value={formData.uom_code}
                    onChange={(e) => setFormData({ ...formData, uom_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden"
                  >
                    {uoms.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.name_en} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing (Cost & Selling) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Base Selling Price (ETB) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.base_price}
                    onChange={(e) =>
                      setFormData({ ...formData, base_price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Purchase Cost Price (ETB)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_price}
                    onChange={(e) =>
                      setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Stock Thresholds */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Min Stock Level (Reorder trigger)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.min_stock_level}
                    onChange={(e) =>
                      setFormData({ ...formData, min_stock_level: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Max Stock Level (Capacity)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_stock_level}
                    onChange={(e) =>
                      setFormData({ ...formData, max_stock_level: parseInt(e.target.value) || 50 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Toggles (VAT, Weighed, Discount) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_vat_applicable}
                    onChange={(e) => setFormData({ ...formData, is_vat_applicable: e.target.checked })}
                    className="w-4 h-4 rounded text-gebeya-600"
                  />
                  <span className="text-xs font-bold">15% VAT Applicable</span>
                </label>

                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_weighed}
                    onChange={(e) => setFormData({ ...formData, is_weighed: e.target.checked })}
                    className="w-4 h-4 rounded text-gebeya-600"
                  />
                  <span className="text-xs font-bold">Weighed / Scale Item</span>
                </label>

                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.allow_discount}
                    onChange={(e) => setFormData({ ...formData, allow_discount: e.target.checked })}
                    className="w-4 h-4 rounded text-gebeya-600"
                  />
                  <span className="text-xs font-bold">Allow POS Discounts</span>
                </label>
              </div>

              {/* Scale PLU if weighed */}
              {formData.is_weighed && (
                <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800">
                  <label className="text-xs font-bold text-cyan-900 dark:text-cyan-200 block mb-1">
                    Dibal / Digi Scale PLU Code
                  </label>
                  <input
                    type="text"
                    value={formData.scale_plu}
                    onChange={(e) => setFormData({ ...formData, scale_plu: e.target.value })}
                    placeholder="e.g. 104"
                    className="w-48 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-cyan-300 text-xs font-mono font-bold"
                  />
                </div>
              )}
            </form>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProduct}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold transition active:scale-95 shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Barcode Label Modal */}
      <BarcodeLabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        products={selectedForLabels}
      />
    </div>
  );
};
