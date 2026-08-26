import { useId } from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

export function BrandMark({ size = 36, className = '', title }: BrandMarkProps) {
  const titleId = useId();
  return (
    <svg
      className={`brand-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <rect className="brand-mark__field" width="64" height="64" rx="16" />
      <path
        className="brand-mark__path"
        d="M13 45C22 45 18 34 28 34C38 34 34 19 50 19"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle className="brand-mark__node" cx="14" cy="45" r="4" />
      <circle className="brand-mark__node" cx="28" cy="34" r="4" />
      <circle className="brand-mark__final" cx="50" cy="19" r="7" />
    </svg>
  );
}
