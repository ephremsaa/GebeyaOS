import React, { useEffect, useState } from 'react';
import { useBrandTheme } from '../../theme/BrandThemeContext';

export interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  viewKey?: string;
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  className = '',
  viewKey,
}) => {
  const { animationMode } = useBrandTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    const id = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, [viewKey]);

  if (animationMode === 'off') {
    return <div className={`w-full h-full ${className}`}>{children}</div>;
  }

  if (animationMode === 'reduced') {
    return (
      <div
        className={`w-full h-full transition-opacity duration-100 ${
          mounted ? 'opacity-100' : 'opacity-0'
        } ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full transition-all duration-200 ease-out transform ${
        mounted
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-1 scale-[0.995]'
      } ${className}`}
    >
      {children}
    </div>
  );
};
