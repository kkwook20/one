import React from 'react';

interface ProgressBarProps {
  progress: number;
  className?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'pink';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animated?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className = '',
  color = 'blue',
  size = 'md',
  showLabel = false,
  animated = true
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500'
  };
  
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };
  
  const getGradientColor = () => {
    if (clampedProgress < 33) return 'from-red-500 to-orange-500';
    if (clampedProgress < 66) return 'from-yellow-500 to-green-500';
    return 'from-green-500 to-emerald-500';
  };

  return (
    <div className={`relative ${className}`}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400">Progress</span>
          <span className="text-xs text-gray-300">{clampedProgress}%</span>
        </div>
      )}
      
      <div className={`w-full bg-gray-700 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`h-full transition-all duration-500 ease-out ${
            animated ? 'relative overflow-hidden' : ''
          } ${
            progress > 0 ? `bg-gradient-to-r ${getGradientColor()}` : colorClasses[color]
          }`}
          style={{ width: `${clampedProgress}%` }}
        >
          {animated && clampedProgress > 0 && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;