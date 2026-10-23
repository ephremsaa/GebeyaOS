import React, { useState, useRef } from 'react';
import { Printer, X, Tag, Copy, Sliders, Check } from 'lucide-react';
import { generateCode128Svg } from '../../utils/code128Svg';
import { useI18n } from '../../i18n/I18nContext';

export interface LabelProductItem {
  id: string;
  sku: string;
  barcode: string;
  nameEn: string;
  nameAm?: string | null;
  sellingPrice: number;
  isVatApplicable?: boolean;
}

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: LabelProductItem[];
}

export type LabelSize = '50x30' | '40x25' | 'a4_sheet';

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  products,
}) => {
  const { language } = useI18n();
  const [labelSize, setLabelSize] = useState<LabelSize>('50x30');
  const [copiesPerItem, setCopiesPerItem] = useState<number>(2);
  const [storeName, setStoreName] = useState<string>('GEBEYA SUPERMARKET');
  const [includeVatNote, setIncludeVatNote] = useState<boolean>(true);
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Expand products by copies
  const expandedList: LabelProductItem[] = [];
  products.forEach((prod) => {
    for (let i = 0; i < copiesPerItem; i++) {
      expandedList.push(prod);
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 flex items-center justify-center">
              <Printer size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'የባርኮድ መለያ ማተሚያ' : 'Barcode Shelf & Item Label Generator'}
              </h2>
              <p className="text-xs text-slate-500">
                {products.length} {language === 'am' ? 'እቃዎች ተመርጠዋል' : 'product(s) selected'} • {expandedList.length} total labels
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

        {/* Configuration Toolbar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {language === 'am' ? 'የመለያ መጠን:' : 'Format:'}
            </label>
            <div className="inline-flex rounded-xl bg-slate-200 dark:bg-slate-700 p-0.5 text-xs font-bold">
              <button
                onClick={() => setLabelSize('50x30')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  labelSize === '50x30'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                50×30 mm (Shelf Talker)
              </button>
              <button
                onClick={() => setLabelSize('40x25')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  labelSize === '40x25'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                40×25 mm (Item Tag)
              </button>
              <button
                onClick={() => setLabelSize('a4_sheet')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  labelSize === 'a4_sheet'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                A4 Sheet (24-up Grid)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {language === 'am' ? 'ቅጂዎች በእያንዳንዱ:' : 'Copies each:'}
              </span>
              <input
                type="number"
                min="1"
                max="50"
                value={copiesPerItem}
                onChange={(e) => setCopiesPerItem(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-center"
              />
            </div>

            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition active:scale-95"
            >
              <Printer size={15} />
              {language === 'am' ? 'አትም' : 'Print Labels (Ctrl+P)'}
            </button>
          </div>
        </div>

        {/* Live Printable Preview Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 flex justify-center">
          <div
            ref={printAreaRef}
            id="printable-labels-area"
            className={`w-full max-w-3xl ${
              labelSize === 'a4_sheet'
                ? 'grid grid-cols-3 gap-3 bg-white p-6 shadow-sm rounded-xl text-black'
                : 'flex flex-wrap gap-4 justify-center'
            }`}
          >
            {expandedList.map((item, idx) => {
              const barcodeValue = item.barcode || item.sku;
              const svgHtml = generateCode128Svg(barcodeValue, labelSize === '40x25' ? 180 : 220, labelSize === '40x25' ? 45 : 55);

              return (
                <div
                  key={`${item.id}-${idx}`}
                  className={`bg-white text-slate-900 border border-dashed border-slate-300 rounded-lg p-2.5 flex flex-col justify-between shadow-2xs relative print:border-none print:shadow-none ${
                    labelSize === '50x30'
                      ? 'w-[230px] h-[135px]'
                      : labelSize === '40x25'
                      ? 'w-[190px] h-[115px]'
                      : 'w-full h-[125px]'
                  }`}
                  style={{ pageBreakInside: 'avoid' }}
                >
                  {/* Store Name Header */}
                  <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-0.5 flex justify-between">
                    <span>{storeName}</span>
                    <span className="font-mono text-[8px] text-slate-400">{item.sku}</span>
                  </div>

                  {/* Product Title (English + Amharic) */}
                  <div className="my-1">
                    <div className="text-xs font-extrabold text-slate-900 leading-tight truncate">
                      {item.nameEn}
                    </div>
                    {item.nameAm && (
                      <div className="text-[10px] font-bold text-slate-600 truncate">
                        {item.nameAm}
                      </div>
                    )}
                  </div>

                  {/* Center: Vector SVG Barcode */}
                  <div
                    className="flex justify-center text-slate-950 my-0.5"
                    dangerouslySetInnerHTML={{ __html: svgHtml }}
                  />

                  {/* Footer: Human Readable Barcode + Big Price in ETB */}
                  <div className="flex items-end justify-between pt-0.5 border-t border-slate-100">
                    <span className="font-mono text-[10px] tracking-widest text-slate-600">
                      {barcodeValue}
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-950 leading-none">
                        {item.sellingPrice.toFixed(2)}{' '}
                        <span className="text-[10px] font-bold">ብር</span>
                      </div>
                      {includeVatNote && (
                        <div className="text-[7px] text-slate-400 leading-tight">
                          VAT Incl.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>Compatible with thermal barcode printers (Xprinter, Zebra, Rongta, Bixolon) and standard laser sheets.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-200 transition"
          >
            {language === 'am' ? 'ዝጋ' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
