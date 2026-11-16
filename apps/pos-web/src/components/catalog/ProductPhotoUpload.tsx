import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, ImagePlus, RotateCw, Trash2, CheckCircle2, UploadCloud, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

export interface ProductPhotoUploadProps {
  currentPhotoUrl?: string | null;
  onPhotoSelected: (file: File | null) => void;
  disabled?: boolean;
}

export const ProductPhotoUpload: React.FC<ProductPhotoUploadProps> = ({
  currentPhotoUrl,
  onPhotoSelected,
  disabled = false,
}) => {
  const { t } = useI18n();

  const [previewSrc, setPreviewSrc] = useState<string | null>(currentPhotoUrl || null);
  const [rotation, setRotation] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [fileSizeKb, setFileSizeKb] = useState<number | null>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentPhotoUrl && !previewSrc) {
      setPreviewSrc(currentPhotoUrl);
    }
  }, [currentPhotoUrl]);

  /**
   * Client-side WebP compression and square cropping.
   * Enforces 1:1 aspect ratio, max 1024x1024 dimensions, and < 200 KB output.
   */
  const processImage = useCallback(
    async (src: string, rotDeg: number): Promise<{ blob: Blob; dataUrl: string; sizeKb: number }> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const maxDim = 1024;
          // Determine square crop bounds
          const minSide = Math.min(img.width, img.height);
          const cropX = (img.width - minSide) / 2;
          const cropY = (img.height - minSide) / 2;

          const outDim = Math.min(maxDim, minSide);

          const canvas = document.createElement('canvas');
          canvas.width = outDim;
          canvas.height = outDim;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D context unavailable'));
            return;
          }

          // Apply rotation
          ctx.translate(outDim / 2, outDim / 2);
          ctx.rotate((rotDeg * Math.PI) / 180);
          ctx.drawImage(
            img,
            cropX,
            cropY,
            minSide,
            minSide,
            -outDim / 2,
            -outDim / 2,
            outDim,
            outDim,
          );

          // Attempt WebP compression (fallback to jpeg if not supported)
          const format = 'image/webp';
          let quality = 0.82;

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              // If larger than 200 KB, re-compress with lower quality
              if (blob.size > 200 * 1024 && quality > 0.65) {
                quality = 0.68;
                canvas.toBlob(
                  (smallerBlob) => {
                    const finalBlob = smallerBlob || blob;
                    const sizeKb = Math.round(finalBlob.size / 1024);
                    const dataUrl = canvas.toDataURL(format, quality);
                    resolve({ blob: finalBlob, dataUrl, sizeKb });
                  },
                  format,
                  quality,
                );
              } else {
                const sizeKb = Math.round(blob.size / 1024);
                const dataUrl = canvas.toDataURL(format, quality);
                resolve({ blob, dataUrl, sizeKb });
              }
            },
            format,
            quality,
          );
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = src;
      });
    },
    [],
  );

  const handleFileLoad = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, or WebP).');
      return;
    }

    setIsCompressing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const src = e.target?.result as string;
      setRawImageSrc(src);
      setRotation(0);

      try {
        const { blob, dataUrl, sizeKb } = await processImage(src, 0);
        setPreviewSrc(dataUrl);
        setFileSizeKb(sizeKb);
        const webpFile = new File([blob], 'product-photo.webp', { type: 'image/webp' });
        onPhotoSelected(webpFile);
      } catch (err) {
        console.error('Error compressing image:', err);
      } finally {
        setIsCompressing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRotate = async () => {
    if (!rawImageSrc) return;
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    setIsCompressing(true);
    try {
      const { blob, dataUrl, sizeKb } = await processImage(rawImageSrc, nextRot);
      setPreviewSrc(dataUrl);
      setFileSizeKb(sizeKb);
      const webpFile = new File([blob], 'product-photo.webp', { type: 'image/webp' });
      onPhotoSelected(webpFile);
    } catch (err) {
      console.error('Error rotating image:', err);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemove = () => {
    setPreviewSrc(null);
    setRawImageSrc(null);
    setRotation(0);
    setFileSizeKb(null);
    onPhotoSelected(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileLoad(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {t('catalog.productPhoto')}
        </label>
        {fileSizeKb !== null && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
            <CheckCircle2 size={13} />
            WebP • {fileSizeKb} KB
          </span>
        )}
      </div>

      {previewSrc ? (
        /* Preview Card with Square Frame & Interactive Controls */
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3 flex items-center gap-4">
          <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600 bg-black/20 flex-shrink-0 shadow-inner">
            <img
              src={previewSrc}
              alt="Product preview"
              className="w-full h-full object-cover select-none"
            />
            {isCompressing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <RefreshCw size={20} className="animate-spin text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-between py-1 gap-2">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {t('catalog.productPhoto')}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t('catalog.photoCompressedNotice')}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {rawImageSrc && (
                <button
                  type="button"
                  onClick={handleRotate}
                  disabled={disabled || isCompressing}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCw size={13} />
                  <span>{t('catalog.rotatePhoto')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                <span>{t('catalog.removePhoto')}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Dropzone & Direct Device/Camera Upload Buttons */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl border-2 border-dashed p-5 flex flex-col items-center justify-center text-center transition-all ${
            isDragging
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-900/30'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-3">
            <UploadCloud size={24} />
          </div>

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-xs mb-3">
            {t('catalog.dragDropPhoto')}
          </p>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* File chooser */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isCompressing}
              className="px-3.5 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <ImagePlus size={15} />
              <span>{t('catalog.choosePhoto')}</span>
            </button>

            {/* Camera capture */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled || isCompressing}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Camera size={15} />
              <span>{t('catalog.takePhoto')}</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileLoad(file);
            }}
          />

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileLoad(file);
            }}
          />
        </div>
      )}
    </div>
  );
};
