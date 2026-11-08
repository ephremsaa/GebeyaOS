import React, { useEffect, useState, useRef } from 'react';
import { useBrandTheme } from '../../theme/BrandThemeContext';

export interface CountUpNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  formatThousands?: boolean;
  className?: string;
}

export const CountUpNumber: React.FC<CountUpNumberProps> = ({
  value,
  duration = 600,
  decimals = 0,
  prefix = '',
  suffix = '',
  formatThousands = true,
  className = '',
}) => {
  const { animationMode } = useBrandTheme();
  const [displayValue, setDisplayValue] = useState<number>(value);
  const prevValueRef = useRef<number>(value);
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // If animations are off or reduced, skip ticking and set immediately
    if (animationMode === 'off' || animationMode === 'reduced') {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    const startVal = prevValueRef.current;
    const endVal = value;
    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad: 1 - (1 - t) * (1 - t)
      const easeProgress = 1 - (1 - progress) * (1 - progress);
      const current = startVal + (endVal - startVal) * easeProgress;

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
        prevValueRef.current = endVal;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [value, duration, animationMode]);

  const formattedNumber = () => {
    const fixed = displayValue.toFixed(decimals);
    if (!formatThousands) return fixed;

    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  return (
    <span className={`tabular-nums font-mono tracking-tight ${className}`}>
      {prefix}
      {formattedNumber()}
      {suffix}
    </span>
  );
};
