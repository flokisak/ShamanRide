import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface BarChartData {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartData[];
  title: string;
}

export const BarChart: React.FC<BarChartProps> = ({ data, title }) => {
  const { t } = useTranslation();
  const maxValue = Math.max(...data.map(item => item.value), 0);
  if (data.length === 0) {
    return (
      <div className="bg-slate-700 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">{title}</h3>
        <p className="text-gray-400 text-center py-8">{t('analytics.noChartData')}</p>
      </div>
    );
  }

  return (
  <div className="glass-card p-4 sm:p-6 rounded-2xl">
      <h3 className="text-lg font-medium text-gray-200 mb-6 font-sans">{title}</h3>
      <div className="flex justify-around items-end h-64 space-x-2 sm:space-x-4">
        {data.map((item, index) => (
          <div key={index} className="flex-1 flex flex-col items-center justify-end h-full group">
            <div
              className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md hover:from-emerald-500 hover:to-emerald-300 transition-all duration-300 relative shadow-lg hover:shadow-emerald-500/50"
              style={{
                height: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
                boxShadow: '0 0 10px rgba(52, 211, 153, 0.3)'
              }}
              title={`${item.label}: ${item.value}`}
            >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 px-2 py-1 rounded">
                    {item.value}
                </span>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center break-words font-sans" style={{writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)'}}>
                {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};