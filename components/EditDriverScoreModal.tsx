import React, { useState, useEffect } from 'react';
import { Person, DriverScore } from '../types';
import { supabaseService } from '../services/supabaseClient';
import { CloseIcon, EditIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface EditDriverScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  onScoreUpdated?: () => void;
}

export const EditDriverScoreModal: React.FC<EditDriverScoreModalProps> = ({
  isOpen,
  onClose,
  people,
  onScoreUpdated
}) => {
  const { t } = useTranslation();
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [currentScore, setCurrentScore] = useState<DriverScore | null>(null);
  const [editedScore, setEditedScore] = useState<Partial<DriverScore>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const drivers = people.filter(person => person.role === 'Driver');

  useEffect(() => {
    if (selectedDriver && isOpen) {
      loadDriverScore(selectedDriver);
    } else {
      setCurrentScore(null);
      setEditedScore({});
    }
  }, [selectedDriver, isOpen]);

  const loadDriverScore = async (driverId: number) => {
    setIsLoading(true);
    try {
      const scores = await supabaseService.getDriverScores();
      const driverScore = scores.find(score => score.driver_id === driverId);
      if (driverScore) {
        setCurrentScore(driverScore);
        setEditedScore({
          fuel_efficiency_score: driverScore.fuel_efficiency_score,
          customer_count_score: driverScore.customer_count_score,
          revenue_score: driverScore.revenue_score,
          perfect_rides_score: driverScore.perfect_rides_score,
          deer_collision_score: driverScore.deer_collision_score
        });
      } else {
        // No existing score, create default
        setCurrentScore(null);
        setEditedScore({
          fuel_efficiency_score: 0,
          customer_count_score: 0,
          revenue_score: 0,
          perfect_rides_score: 0,
          deer_collision_score: 0
        });
      }
    } catch (error) {
      console.error('Error loading driver score:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScoreChange = (field: keyof DriverScore, value: number) => {
    setEditedScore(prev => ({
      ...prev,
      [field]: Math.max(0, Math.min(100, value)) // Clamp between 0-100
    }));
  };

  const calculateTotalScore = (scores: Partial<DriverScore>): number => {
    const fuelEfficiencyScore = scores.fuel_efficiency_score || 0;
    const customerCountScore = scores.customer_count_score || 0;
    const revenueScore = scores.revenue_score || 0;
    const perfectRidesScore = scores.perfect_rides_score || 0;
    const deerCollisionScore = scores.deer_collision_score || 0;

    // Use same weighting as in gamificationService.ts
    return Math.round(
      fuelEfficiencyScore * 0.20 +
      customerCountScore * 0.15 +
      revenueScore * 0.15 +
      perfectRidesScore * 0.20 +
      deerCollisionScore * 0.10
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) return;

    setIsSubmitting(true);
    try {
      const driver = drivers.find(d => d.id === selectedDriver);
      if (!driver) return;

      const totalScore = calculateTotalScore(editedScore);

      const scoreData: DriverScore = {
        driver_id: selectedDriver,
        driver_name: driver.name,
        total_score: totalScore,
        fuel_efficiency_score: editedScore.fuel_efficiency_score || 0,
        customer_count_score: editedScore.customer_count_score || 0,
        revenue_score: editedScore.revenue_score || 0,
        perfect_rides_score: editedScore.perfect_rides_score || 0,
        deer_collision_score: editedScore.deer_collision_score || 0,
        rank: currentScore?.rank || 0,
        updated_at: new Date().toISOString()
      };

      await supabaseService.updateDriverScore(selectedDriver, scoreData);

      // Add manual entry to track this change
      const manualEntry = {
        id: `${selectedDriver}_manual_score_edit_${Date.now()}`,
        driver_id: selectedDriver,
        type: 'MANUAL_SCORE_EDIT' as any,
        title: 'Manuální úprava skóre',
        description: `Skóre upraveno: Efektivita: ${editedScore.fuel_efficiency_score}, Klienti: ${editedScore.customer_count_score}, Příjmy: ${editedScore.revenue_score}, Perfektní jízdy: ${editedScore.perfect_rides_score}, Srnky: ${editedScore.deer_collision_score}`,
        points: 0, // This is a score edit, not points addition
        created_at: new Date().toISOString(),
        notes: 'Manuální úprava skóre řidiče'
      };

      await supabaseService.addManualEntry(manualEntry);

      onScoreUpdated?.();
      onClose();
    } catch (error) {
      console.error('Error updating driver score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const totalScore = calculateTotalScore(editedScore);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-start pt-8 p-4 animate-fade-in overflow-y-auto">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <EditIcon className="text-blue-500 w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold text-white">Upravit skóre řidiče</h2>
              <p className="text-gray-400 text-sm">Manuálně upravte komponenty skóre řidiče</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Zavřít"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Driver Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Řidič *
            </label>
            <select
              value={selectedDriver || ''}
              onChange={(e) => setSelectedDriver(Number(e.target.value) || null)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Vyberte řidiče</option>
              {drivers.map(driver => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>

          {selectedDriver && (
            <>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-gray-400 mt-2">Načítání skóre...</p>
                </div>
              ) : (
                <>
                  {/* Current Total Score Display */}
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">Aktuální celkové skóre:</span>
                      <span className="text-2xl font-bold text-yellow-500">{currentScore?.total_score || 0}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-white font-medium">Nové celkové skóre:</span>
                      <span className="text-2xl font-bold text-green-500">{totalScore}</span>
                    </div>
                  </div>

                  {/* Score Components */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white">Komponenty skóre (0-100 bodů)</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          Efektivita paliva
                        </label>
                        <input
                          type="number"
                          value={editedScore.fuel_efficiency_score || 0}
                          onChange={(e) => handleScoreChange('fuel_efficiency_score', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="100"
                        />
                        <p className="text-xs text-gray-400 mt-1">Aktuální: {currentScore?.fuel_efficiency_score || 0}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          Počet klientů
                        </label>
                        <input
                          type="number"
                          value={editedScore.customer_count_score || 0}
                          onChange={(e) => handleScoreChange('customer_count_score', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="100"
                        />
                        <p className="text-xs text-gray-400 mt-1">Aktuální: {currentScore?.customer_count_score || 0}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          Příjmy
                        </label>
                        <input
                          type="number"
                          value={editedScore.revenue_score || 0}
                          onChange={(e) => handleScoreChange('revenue_score', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="100"
                        />
                        <p className="text-xs text-gray-400 mt-1">Aktuální: {currentScore?.revenue_score || 0}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          Perfektní jízdy
                        </label>
                        <input
                          type="number"
                          value={editedScore.perfect_rides_score || 0}
                          onChange={(e) => handleScoreChange('perfect_rides_score', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="100"
                        />
                        <p className="text-xs text-gray-400 mt-1">Aktuální: {currentScore?.perfect_rides_score || 0}</p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-white mb-2">
                          Sražené srnky (easter egg)
                        </label>
                        <input
                          type="number"
                          value={editedScore.deer_collision_score || 0}
                          onChange={(e) => handleScoreChange('deer_collision_score', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="100"
                        />
                        <p className="text-xs text-gray-400 mt-1">Aktuální: {currentScore?.deer_collision_score || 0}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedDriver}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Ukládám...' : 'Uložit skóre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
