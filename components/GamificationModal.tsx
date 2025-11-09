import React, { useState, useEffect } from 'react';
import { RideLog, Person, ManualEntry } from '../types';
import { DailyStats } from './DailyStats';
import { Leaderboard } from './Leaderboard';
import { ManualEntryModal } from './ManualEntryModal';
import { EditDriverScoreModal } from './EditDriverScoreModal';
import { TrophyIcon, CloseIcon, PlusIcon, EditIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import { supabaseService } from '../services/supabaseClient';

interface GamificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  rideLog: RideLog[];
  people: Person[];
}

export const GamificationModal: React.FC<GamificationModalProps> = ({
  isOpen,
  onClose,
  rideLog,
  people
}) => {
  const { t } = useTranslation();
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
  const [isEditScoreModalOpen, setIsEditScoreModalOpen] = useState(false);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchManualEntries();
    }
  }, [isOpen]);

  const fetchManualEntries = async () => {
    try {
      const entries = await supabaseService.getManualEntries();
      setManualEntries(entries);
    } catch (error) {
      console.error('Error fetching manual entries:', error);
    }
  };

  const handleManualEntryAdded = () => {
    fetchManualEntries();
    // Also refresh leaderboard
    window.location.reload(); // Simple refresh for now
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-start pt-8 p-4 animate-fade-in overflow-y-auto">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <TrophyIcon className="text-yellow-500 w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold text-white">Gamifikace řidičů</h2>
              <p className="text-gray-400 text-sm">Soutěžte, získávejte achievement a sledujte svůj výkon</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsManualEntryModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Přidat záznam
            </button>
            <button
              onClick={() => setIsEditScoreModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <EditIcon className="w-4 h-4" />
              Upravit skóre
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Zavřít"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Daily Stats */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrophyIcon className="text-cyan-400 w-5 h-5" />
              Dnešní šampioni
            </h3>
            <DailyStats rideLog={rideLog} people={people} />
          </div>

          {/* Leaderboard */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrophyIcon className="text-yellow-500 w-5 h-5" />
              Celkové pořadí řidičů
            </h3>
            <Leaderboard />
          </div>

          {/* Achievement Info */}
          <div className="bg-slate-700 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-white mb-4">🏆 Achievement systém</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl mb-2">🚗</div>
                <h5 className="font-medium text-white">Šetřílek</h5>
                <p className="text-sm text-gray-300">Dosáhněte skóre efektivity paliva 80+ bodů</p>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl mb-2">👥</div>
                <h5 className="font-medium text-white">Oblíbenec</h5>
                <p className="text-sm text-gray-300">Přepravte 800+ klientů</p>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl mb-2">⭐</div>
                <h5 className="font-medium text-white">Dokonalý řidič</h5>
                <p className="text-sm text-gray-300">90%+ jízd přijatých do 1 minuty a dokončených bez zrušení</p>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl mb-2">🦌</div>
                <h5 className="font-medium text-white">Mistr srnek</h5>
                <p className="text-sm text-gray-300">Sražte 5+ srnek (nebo je viděli hodně)</p>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl mb-2">💰</div>
                <h5 className="font-medium text-white">Revenue Champion</h5>
                <p className="text-sm text-gray-300">Vysoké příjmy z jízd</p>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl mb-2">🏃</div>
                <h5 className="font-medium text-white">Streak Master</h5>
                <p className="text-sm text-gray-300">Dlouhé série úspěšných jízd</p>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl mb-2">⚡</div>
                <h5 className="font-medium text-white">Bleskový reakční čas</h5>
                <p className="text-sm text-gray-300">Průměrné skóre rychlosti přijetí 80+ bodů</p>
              </div>
            </div>
          </div>

          {/* Manual Entries */}
          <div className="bg-slate-700 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-white mb-4">📝 Manuální záznamy</h4>
            {manualEntries.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {manualEntries.slice(0, 10).map(entry => {
                  const driver = people.find(p => p.id === entry.driver_id);
                  return (
                    <div key={entry.id} className="bg-slate-600 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-white">{entry.title}</span>
                            <span className={`text-sm px-2 py-1 rounded ${
                              entry.points > 0 ? 'bg-green-600 text-green-100' : 'bg-red-600 text-red-100'
                            }`}>
                              {entry.points > 0 ? '+' : ''}{entry.points} bodů
                            </span>
                          </div>
                          <p className="text-sm text-gray-300">{entry.description}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                            <span>{driver?.name || 'Neznámý řidič'}</span>
                            <span>•</span>
                            <span>{new Date(entry.created_at).toLocaleDateString('cs-CZ')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {manualEntries.length > 10 && (
                  <p className="text-sm text-gray-400 text-center">
                    A {manualEntries.length - 10} dalších záznamů...
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-4">
                Žádné manuální záznamy zatím nebyly přidány.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Manual Entry Modal */}
      <ManualEntryModal
        isOpen={isManualEntryModalOpen}
        onClose={() => setIsManualEntryModalOpen(false)}
        people={people}
        onEntryAdded={handleManualEntryAdded}
      />

      {/* Edit Driver Score Modal */}
      <EditDriverScoreModal
        isOpen={isEditScoreModalOpen}
        onClose={() => setIsEditScoreModalOpen(false)}
        people={people}
        onScoreUpdated={handleManualEntryAdded}
      />
    </div>
  );
};
