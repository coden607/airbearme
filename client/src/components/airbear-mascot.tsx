import React from 'react';

interface AirBearMascotProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
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
};

export const AirBearMascot: React.FC<AirBearMascotProps> = React.memo(({
  size = 'md',
  className = '',
  animated = false,
}) => {
  return (
    <img
      src="/airbear-mascot.png"
      alt="AirBear Mascot"
      className={`${sizeMap[size]} object-contain ${animated ? 'animate-bounce' : ''} ${className}`}
    />
  );
});

AirBearMascot.displayName = 'AirBearMascot';

export default AirBearMascot;
