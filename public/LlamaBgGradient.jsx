export default function LlamaBgGradient({ children, className = '' }) {
  return (
    <div className={`relative w-full min-h-screen overflow-hidden ${className}`}>
      {/* SVG Background */}
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
      >
        <defs>
          <linearGradient id="darkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f0f0f" />
            <stop offset="35%" stopColor="#1a1a1a" />
            <stop offset="70%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#1f1f1f" />
          </linearGradient>

          {/* Diagonal line pattern */}
          <pattern
            id="diagonalLines"
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="40"
              stroke="#ffffff"
              strokeWidth="0.5"
              opacity="0.03"
            />
          </pattern>
        </defs>

        {/* Base gradient */}
        <rect width="1440" height="900" fill="url(#darkGradient)" />

        {/* Diagonal line texture overlay */}
        <rect width="1440" height="900" fill="url(#diagonalLines)" />

        {/* Subtle accent glow (optional — remove if too much) */}
        <circle cx="1000" cy="150" r="400" fill="#3a3a3a" opacity="0.1" />
        <circle cx="200" cy="700" r="350" fill="#2a2a2a" opacity="0.08" />
      </svg>

      {/* Content layer */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* USAGE:
  <LlamaBgGradient>
    <div className="flex items-center justify-center h-screen">
      <h1 className="text-white text-4xl">Your content here</h1>
    </div>
  </LlamaBgGradient>

  CUSTOMIZATION:
  - Adjust stopColor values in linearGradient for different grays
  - Change strokeOpacity="0.03" to 0.05 or 0.1 for stronger diagonal lines
  - Modify circle opacity values for subtle accent glows
  - Use className prop to add additional Tailwind classes
*/
