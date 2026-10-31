import React, { useState } from 'react';
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
  const { t } = useI18n();
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
      title={reprintedText ? `DUPLICATE REPRINT: ${receiptNumber}` : `${t('receiptNo')}: ${receiptNumber}`}
      maxWidth="md"
    >
      <div className="flex flex-col gap-4">
        {/* Realistic ESC/POS Thermal Receipt Paper Simulation */}
        <div className="bg-surface-2 p-4 rounded-xl border border-border-subtle max-h-[460px] overflow-y-auto">
          <pre className="font-mono text-xs leading-relaxed text-text-main whitespace-pre select-text">
            {activeText}
          </pre>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            size="md"
            leftIcon={copied ? <Check size={16} /> : <Copy size={16} />}
            onClick={handleCopy}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>

          <Button
            variant="secondary"
            size="md"
            leftIcon={<Printer size={16} />}
            onClick={handlePrint}
          >
            {t('printReceipt')}
          </Button>

          {saleId && onReprint && (
            <Button
              variant="secondary"
              size="md"
              leftIcon={<RotateCcw size={16} />}
              onClick={() => setIsReprintPromptOpen(true)}
            >
              Audited Reprint
            </Button>
          )}
        </div>

        {/* Reprint Reason Prompt Modal */}
        {isReprintPromptOpen && (
          <div className="p-4 rounded-xl bg-surface border border-warning/30 flex flex-col gap-3 shadow-soft">
            <div className="flex items-center gap-2 text-warning font-semibold text-sm">
              <FileText size={16} />
              <span>Audited Duplicate Reprint Record</span>
            </div>
            <p className="text-xs text-text-muted">
              By Ethiopian commercial regulation, reprints must include a clear reason logged to the audit journal.
            </p>
            <Input
              label="Reprint Reason"
              value={reprintReason}
              onChange={(e) => setReprintReason(e.target.value)}
              placeholder="e.g. Printer paper jammed or customer copy request"
            />
            <div className="flex justify-end gap-2 mt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsReprintPromptOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteReprint}
                disabled={!reprintReason.trim() || isSubmittingReprint}
              >
                {isSubmittingReprint ? 'Logging...' : 'Confirm Reprint'}
              </Button>
            </div>
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={onClose}
        >
          {t('newSale')}
        </Button>
      </div>
    </Modal>
  );
};
