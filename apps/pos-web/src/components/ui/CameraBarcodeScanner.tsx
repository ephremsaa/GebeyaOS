import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Camera, X, Flashlight, AlertCircle, Keyboard } from 'lucide-react';

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  title?: string;
}

export const CameraBarcodeScanner: React.FC<CameraBarcodeScannerProps> = ({
  isOpen,
  onClose,
  onDetected,
  title = 'Scan Product Barcode',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;

  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let handled = false;
    const reader = new BrowserMultiFormatReader();

    const startScanner = async () => {
      setError(null);
      setTorchOn(false);
      setHasTorch(false);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Camera access requires HTTPS or a supported mobile browser.');
        return;
      }

      if (!videoRef.current) return;

      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          videoRef.current,
          (result) => {
            if (cancelled || handled || !result) return;
            const code = result.getText()?.trim();
            if (code) {
              handled = true;
              try {
                navigator.vibrate?.([60]);
              } catch {}
              controlsRef.current?.stop();
              onDetectedRef.current(code);
              onCloseRef.current();
            }
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;

        // Check torch capability on active stream
        try {
          const stream = videoRef.current?.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()?.[0];
          const caps = track?.getCapabilities?.() as any;
          if (caps?.torch) {
            setHasTorch(true);
          }
        } catch {}
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : 'Unable to start camera. You can still type the barcode below.',
        );
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
        controlsRef.current = null;
      } catch {}
      try {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
      } catch {}
    };
  }, [isOpen]);

  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      // torch not supported
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-border-subtle rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border-subtle flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-main">{title}</h3>
              <p className="text-[11px] text-text-muted">Point rear camera at product barcode</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  torchOn
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-surface-2 border-border-subtle text-text-muted'
                }`}
                title="Toggle Flashlight"
              >
                <Flashlight size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-surface-2 hover:bg-border-subtle text-text-muted hover:text-text-main transition-colors cursor-pointer"
              aria-label="Close scanner"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Camera Viewport */}
        <div className="relative bg-black aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
          {/* Target Reticle */}
          {!error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-36 border-2 border-emerald-400/90 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] relative">
                <div className="absolute inset-x-3 top-1/2 h-0.5 bg-emerald-400/80 animate-pulse" />
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center gap-2">
              <AlertCircle size={32} className="text-amber-400" />
              <p className="text-xs text-slate-300 leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Fallback / Quick Manual Entry */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim()) {
              onDetected(manualCode.trim());
              setManualCode('');
              onClose();
            }
          }}
          className="p-4 bg-surface border-t border-border-subtle flex flex-col gap-2.5"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Keyboard size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Or type barcode manually..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-input border border-border-subtle text-xs font-mono text-text-main focus:outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold cursor-pointer"
            >
              Use Code
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
