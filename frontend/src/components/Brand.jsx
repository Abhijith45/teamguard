import { useState } from "react";

export function Brand({ size = 28, showText = true, className = "", variant = "auto" }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className={`brand-lockup ${variant === "light" ? "brand-light" : ""} ${className}`.trim()}>
      {!imgFailed ? (
        <img
          src="/apple-touch-icon.png"
          alt="TeamGuard Logo"
          width={size}
          height={size}
          className="brand-logo-img"
          onError={() => setImgFailed(true)}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            objectFit: "contain",
            borderRadius: `${Math.max(4, Math.round(size * 0.22))}px`,
            flexShrink: 0,
          }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="brand-logo-icon"
        >
          <rect width="32" height="32" rx="8" fill="#0F172A" />
          <path
            d="M16 6.5L24 10.5V17.5C24 22 20.5 25.5 16 27C11.5 25.5 8 22 8 17.5V10.5L16 6.5Z"
            stroke="#2563EB"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M16 11V22M12 15L16 11L20 15"
            stroke="#10B981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {showText && <span className="brand-title">TeamGuard</span>}
    </div>
  );
}

