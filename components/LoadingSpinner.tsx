import React from 'react';

export const LoadingSpinner: React.FC<{className?: string; text?: string}> = ({ className, text = "Loading..." }) => {
  return (
    <div className={`flex flex-col items-center justify-center bg-slate-800 p-6 rounded-lg shadow-2xl ${className || ''}`}>
      <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-4 text-lg font-semibold text-gray-300">{text}</p>
    </div>
  );
};