import React from 'react';
import { MASCOT_DATA_URL } from '@/lib/mascot-data';

interface AirBearMascotProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  className?: string;
  animated?: boolean;
}

const sizeMap = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
  '2xl': 'w-16 h-16',
  '3xl': 'w-24 h-24',
  '4xl': 'w-32 h-32',
};

// The mascot is EMBEDDED directly in the code - it can NEVER be cached incorrectly
export const AirBearMascot: React.FC<AirBearMascotProps> = React.memo(({
  size = 'md',
  className = '',
  animated = false,
}) => {
  const sizeClass = sizeMap[size];
  const animationClass = animated ? 'animate-bounce' : '';

  return (
    <img
      src={MASCOT_DATA_URL}
      alt="AirBear Mascot"
      className={`${sizeClass} object-contain ${animationClass} ${className}`}
      loading="eager"
      decoding="sync"
    />
  );
});

AirBearMascot.displayName = 'AirBearMascot';

export default AirBearMascot;
