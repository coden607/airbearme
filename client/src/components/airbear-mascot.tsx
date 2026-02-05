import React, { useState } from 'react';

interface AirBearMascotProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  className?: string;
  animated?: boolean;
  showFallback?: boolean;
}

const sizeMap = {
  xs: { class: 'w-4 h-4', px: 16 },
  sm: { class: 'w-6 h-6', px: 24 },
  md: { class: 'w-8 h-8', px: 32 },
  lg: { class: 'w-10 h-10', px: 40 },
  xl: { class: 'w-12 h-12', px: 48 },
  '2xl': { class: 'w-16 h-16', px: 64 },
  '3xl': { class: 'w-24 h-24', px: 96 },
  '4xl': { class: 'w-32 h-32', px: 128 },
};

// SVG Fallback - A simple bear face that will ALWAYS render
const BearFallback: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Background circle */}
    <circle cx="50" cy="50" r="48" fill="#8B5A2B" />
    {/* Ears */}
    <circle cx="20" cy="20" r="15" fill="#6B4423" />
    <circle cx="80" cy="20" r="15" fill="#6B4423" />
    <circle cx="20" cy="20" r="8" fill="#D4A574" />
    <circle cx="80" cy="20" r="8" fill="#D4A574" />
    {/* Face */}
    <circle cx="50" cy="55" r="35" fill="#A0522D" />
    {/* Snout */}
    <ellipse cx="50" cy="65" rx="18" ry="14" fill="#D4A574" />
    {/* Nose */}
    <ellipse cx="50" cy="60" rx="8" ry="6" fill="#2C1810" />
    {/* Eyes */}
    <circle cx="35" cy="48" r="6" fill="#2C1810" />
    <circle cx="65" cy="48" r="6" fill="#2C1810" />
    <circle cx="37" cy="46" r="2" fill="white" />
    <circle cx="67" cy="46" r="2" fill="white" />
    {/* Smile */}
    <path d="M 40 70 Q 50 78 60 70" stroke="#2C1810" strokeWidth="2" fill="none" />
    {/* Pilot goggles strap */}
    <path d="M 15 40 Q 50 30 85 40" stroke="#4A5568" strokeWidth="3" fill="none" />
    {/* Goggles */}
    <ellipse cx="35" cy="45" rx="12" ry="10" fill="none" stroke="#718096" strokeWidth="3" />
    <ellipse cx="65" cy="45" rx="12" ry="10" fill="none" stroke="#718096" strokeWidth="3" />
    <rect x="47" y="42" width="6" height="6" fill="#718096" />
  </svg>
);

export const AirBearMascot: React.FC<AirBearMascotProps> = React.memo(({
  size = 'md',
  className = '',
  animated = false,
  showFallback = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const sizeInfo = sizeMap[size];
  const animationClass = animated ? 'animate-bounce' : '';

  // If image failed to load or showFallback is true, show the SVG fallback
  if (imageError || showFallback) {
    return (
      <BearFallback
        size={sizeInfo.px}
        className={`${animationClass} ${className}`}
      />
    );
  }

  return (
    <img
      src="/airbear-mascot.png"
      alt="AirBear Mascot"
      className={`${sizeInfo.class} object-contain ${animationClass} ${className}`}
      onError={() => setImageError(true)}
      loading="eager"
      decoding="sync"
    />
  );
});

AirBearMascot.displayName = 'AirBearMascot';

export default AirBearMascot;
