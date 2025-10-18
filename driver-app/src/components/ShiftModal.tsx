import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartShift: (startOdo: number) => void;
  onEndShift: (endOdo: number) => void;
  isShiftActive: boolean;
  currentOdo?: number;
  vehicleMileage?: number;
}

export const ShiftModal: React.FC<ShiftModalProps> = ({
  isOpen,
  onClose,
  onStartShift,
  onEndShift,
  isShiftActive,
  currentOdo,
  vehicleMileage
}) => {
  const { t } = useTranslation();
  const [odoReading, setOdoReading] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      // For starting shift, use vehicle mileage; for ending shift, use current shift odo
      const defaultOdo = isShiftActive ? (currentOdo?.toString() || '') : (vehicleMileage?.toString() || '');
      setOdoReading(defaultOdo);
      setError('');
    }
  }, [isOpen, currentOdo, vehicleMileage, isShiftActive]);

  const handleSubmit = () => {
    const odoValue = parseFloat(odoReading);
    if (isNaN(odoValue) || odoValue < 0) {
      setError('Zadejte platné číslo pro stav tachometru');
      return;
    }

    if (isShiftActive) {
      // Ending shift - validate that end odo is greater than start odo
      if (currentOdo !== undefined && odoValue <= currentOdo) {
        setError('Konečný stav tachometru musí být vyšší než počáteční');
        return;
      }
      onEndShift(odoValue);
    } else {
      // Starting shift
      onStartShift(odoValue);
    }

    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 max-w-sm mx-4 w-full">
        <h3 className="text-lg font-semibold text-white mb-4">
          {isShiftActive ? 'Ukončit směnu' : 'Začít směnu'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Stav tachometru (km)
            </label>
            <input
              type="number"
              value={odoReading}
              onChange={(e) => setOdoReading(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Např. 125430"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-primary"
              min="0"
              step="1"
            />
            {isShiftActive && currentOdo && (
              <p className="text-xs text-slate-400 mt-1">
                Počáteční stav: {currentOdo} km
              </p>
            )}
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="text-sm text-slate-400">
            {isShiftActive
              ? 'Zadejte aktuální stav tachometru pro ukončení směny.'
              : 'Zadejte aktuální stav tachometru pro začátek směny.'
            }
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
          >
            Zrušit
          </button>
          <button
            onClick={handleSubmit}
            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
              isShiftActive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isShiftActive ? 'Ukončit směnu' : 'Začít směnu'}
          </button>
        </div>
      </div>
    </div>
  );
};