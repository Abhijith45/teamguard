export function Brand({ size = 28, showText = true, className = "" }) {
  return (
    <div className={`brand-lockup ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="brand-logo-icon"
      >
        <rect width="32" height="32" rx="8" fill="#0A5C36" />
        <path
          d="M16 6L24.6603 11V21L16 26L7.33975 21V11L16 6Z"
          stroke="#4ADE80"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M16 11L20.3301 13.5V18.5L16 21L11.6699 18.5V13.5L16 11Z"
          fill="#22C55E"
        />
      </svg>
      {showText && <span className="brand-title">TeamGuard</span>}
    </div>
  );
}
