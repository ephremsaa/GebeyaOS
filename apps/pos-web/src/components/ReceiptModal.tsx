import React, { useState, useEffect } from 'react';
import { Printer, RotateCcw, Copy, Check, FileText } from 'lucide-react';
import { Modal, Button, Input } from './ui';
import { useI18n } from '../i18n/I18nContext';

export interface ReceiptModalProps {
  receiptText: string;
  receiptNumber: string;
  saleId?: string;
  onClose: () => void;
  onReprint?: (saleId: string, reason: string) => Promise<string | void>;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receiptText,
  receiptNumber,
  saleId,
  onClose,
  onReprint,
}) => {
  const { t, language } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isReprintPromptOpen, setIsReprintPromptOpen] = useState(false);
  const [reprintReason, setReprintReason] = useState('Customer requested duplicate copy');
  const [reprintedText, setReprintedText] = useState<string | null>(null);
  const [isSubmittingReprint, setIsSubmittingReprint] = useState(false);

  const activeText = reprintedText || receiptText;

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyboard shortcut: Enter for new sale, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isReprintPromptOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isReprintPromptOpen]);

  const handleExecuteReprint = async () => {
    if (!saleId || !onReprint) return;
    setIsSubmittingReprint(true);
    try {
      const res = await onReprint(saleId, reprintReason);
      if (typeof res === 'string') {
        setReprintedText(res);
      }
      setIsReprintPromptOpen(false);
    } finally {
      setIsSubmittingReprint(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={reprintedText ? `${t('checkout.duplicateCopy')}: ${receiptNumber}` : `${t('checkout.receiptNo')}: ${receiptNumber}`}
      maxWidth="lg"
      bodyPadding="p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4">
        {/* Realistic ESC/POS Thermal Receipt Paper Simulation */}
        <div className="flex justify-center w-full py-1">
          <div className="bg-white text-slate-950 p-4 sm:p-5 rounded-2xl shadow-md border border-slate-200 w-full max-w-[380px] overflow-x-auto select-text">
            <pre className="text-[12px] leading-relaxed whitespace-pre font-mono text-slate-950 tracking-tight select-text text-left">
              {activeText}
            </pre>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          {/* Copy Button */}
          <Button
            variant="secondary"
            size="md"
            leftIcon={copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
            onClick={handleCopy}
            className="text-xs sm:text-sm font-bold"
          >
            {copied ? (language === 'am' ? 'ተቀድቷል!' : 'Copied!') : (language === 'am' ? 'ቅዳ' : 'Copy')}
          </Button>

          {/* Print Button (Primary Emerald) */}
          <Button
            variant="primary"
            size="md"
            leftIcon={<Printer size={16} />}
            onClick={handlePrint}
            className="text-xs sm:text-sm font-bold"
          >
            {language === 'am' ? 'ደረሰኝ አትም' : 'Print Receipt'}
          </Button>

          {/* Audited Reprint */}
          {saleId && onReprint ? (
            <Button
              variant="secondary"
              size="md"
              leftIcon={<RotateCcw size={15} />}
              onClick={() => setIsReprintPromptOpen(true)}
              className="text-xs font-bold leading-tight"
            >
              {language === 'am' ? 'ዳግም ህትመት' : 'Audited Reprint'}
            </Button>
          ) : (
            <div />
          )}
        </div>

        {/* Reprint Reason Prompt Modal */}
        {isReprintPromptOpen && (
          <div className="p-4 rounded-xl bg-surface border border-warning/30 flex flex-col gap-3 shadow-soft">
            <div className="flex items-center gap-2 text-warning font-semibold text-sm">
              <FileText size={16} />
              <span>{t('checkout.auditedDuplicateRecord')}</span>
            </div>
            <p className="text-xs text-text-muted">
              {t('checkout.reprintRegulationNotice')}
            </p>
            <Input
              label={t('checkout.reprintReason')}
              value={reprintReason}
              onChange={(e) => setReprintReason(e.target.value)}
              placeholder={t('checkout.reprintPlaceholder')}
            />
            <div className="flex justify-end gap-2 mt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsReprintPromptOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteReprint}
                disabled={!reprintReason.trim() || isSubmittingReprint}
              >
                {isSubmittingReprint ? t('checkout.logging') : t('checkout.confirmReprint')}
              </Button>
            </div>
          </div>
        )}

        {/* New Sale Button */}
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          onClick={onClose}
          className="font-bold text-[15px]"
        >
          {language === 'am' ? 'አዲስ ሽያጭ (Enter)' : 'New Sale (Enter)'}
        </Button>
      </div>
    </Modal>
  );
};
