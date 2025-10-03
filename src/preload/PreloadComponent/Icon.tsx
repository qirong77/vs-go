interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

export function BackIcon({ size = 16, className = "", color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ transition: "stroke 0.2s ease-in-out" }}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ForwardIcon({ size = 16, className = "", color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ transition: "stroke 0.2s ease-in-out" }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, className = "", color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{
        transition: "stroke 0.2s ease-in-out, transform 0.2s ease-in-out",
        transformOrigin: "center",
      }}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
