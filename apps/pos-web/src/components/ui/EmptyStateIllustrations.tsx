import React from 'react';

interface IllustrationProps {
  className?: string;
  size?: number;
}

export const EmptyCartIllustration: React.FC<IllustrationProps> = ({
  className = '',
  size = 120,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none ${className}`}
  >
    <circle cx="60" cy="60" r="54" className="fill-primary/5 dark:fill-primary/10 stroke-primary/15" strokeWidth="2" strokeDasharray="4 4" />
    <path
      d="M32 38H40L48 72H84L92 48H44"
      className="stroke-primary"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="50" cy="84" r="5" className="fill-primary stroke-surface" strokeWidth="2" />
    <circle cx="82" cy="84" r="5" className="fill-primary stroke-surface" strokeWidth="2" />
    <path
      d="M56 54L68 54M62 48L62 60"
      className="stroke-primary/50"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export const EmptyProductsIllustration: React.FC<IllustrationProps> = ({
  className = '',
  size = 120,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none ${className}`}
  >
    <rect x="18" y="24" width="84" height="76" rx="16" className="fill-surface-2/60 stroke-border-subtle" strokeWidth="2" />
    <line x1="26" y1="58" x2="94" y2="58" className="stroke-border-subtle" strokeWidth="2" strokeLinecap="round" />
    {/* Product boxes */}
    <rect x="30" y="36" width="16" height="18" rx="4" className="fill-primary/15 stroke-primary" strokeWidth="2" />
    <rect x="52" y="32" width="16" height="22" rx="4" className="fill-secondary/20 stroke-secondary" strokeWidth="2" />
    <rect x="74" y="38" width="16" height="16" rx="4" className="fill-accent/20 stroke-amber-500" strokeWidth="2" />
    {/* Bottom shelf */}
    <rect x="36" y="66" width="22" height="24" rx="4" className="fill-primary/20 stroke-primary" strokeWidth="2" />
    <rect x="64" y="70" width="20" height="20" rx="4" className="fill-info/20 stroke-info" strokeWidth="2" />
  </svg>
);

export const EmptyOrdersIllustration: React.FC<IllustrationProps> = ({
  className = '',
  size = 120,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none ${className}`}
  >
    <path
      d="M36 22H84C88.4 22 92 25.6 92 30V94L82 88L72 94L60 88L48 94L38 88L28 94V30C28 25.6 31.6 22 36 22Z"
      className="fill-surface-2 stroke-border-subtle"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <line x1="42" y1="38" x2="78" y2="38" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
    <line x1="42" y1="48" x2="68" y2="48" className="stroke-text-dim" strokeWidth="2" strokeLinecap="round" />
    <line x1="42" y1="58" x2="74" y2="58" className="stroke-text-dim" strokeWidth="2" strokeLinecap="round" />
    <line x1="42" y1="68" x2="56" y2="68" className="stroke-text-dim" strokeWidth="2" strokeLinecap="round" />
    <circle cx="76" cy="68" r="8" className="fill-primary/20 stroke-primary" strokeWidth="2" />
    <path d="M73 68L75 70L79 66" className="stroke-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const EmptySearchIllustration: React.FC<IllustrationProps> = ({
  className = '',
  size = 120,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none ${className}`}
  >
    <circle cx="52" cy="52" r="28" className="fill-primary/5 stroke-primary" strokeWidth="3" strokeDasharray="3 3" />
    <path d="M72 72L96 96" className="stroke-primary" strokeWidth="4" strokeLinecap="round" />
    <circle cx="52" cy="52" r="14" className="stroke-primary/40" strokeWidth="2" />
    <line x1="46" y1="52" x2="58" y2="52" className="stroke-primary/60" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const EmptySyncIllustration: React.FC<IllustrationProps> = ({
  className = '',
  size = 120,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none ${className}`}
  >
    <circle cx="60" cy="60" r="48" className="stroke-primary/20" strokeWidth="2" strokeDasharray="6 6" />
    <rect x="42" y="44" width="36" height="32" rx="8" className="fill-surface stroke-primary" strokeWidth="2.5" />
    <path d="M54 60L60 66L68 54" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="60" cy="24" r="4" className="fill-accent" />
    <circle cx="96" cy="60" r="4" className="fill-primary" />
    <circle cx="60" cy="96" r="4" className="fill-secondary" />
  </svg>
);
