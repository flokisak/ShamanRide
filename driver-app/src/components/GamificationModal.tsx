import React, { useState, useEffect } from 'react';
import { DriverScore, Achievement, ManualEntry } from '../types';
import { supabaseService } from '../supabaseClient';
import { useTranslation } from '../contexts/LanguageContext';
import { TrophyIcon, CloseIcon } from '../icons';

interface GamificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverId: number;
  driverName: string;
}

export const GamificationModal: React.FC<GamificationModalProps> = ({
  isOpen,
  onClose,
  driverId,
  driverName
}) => {
  const { t } = useTranslation();
  const [driverScore, setDriverScore] = useState<DriverScore | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [leaderboard, setLeaderboard] = useState<DriverScore[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && driverId) {
      loadGamificationData();
    }
  }, [isOpen, driverId]);

  const loadGamificationData = async () => {
    setLoading(true);
    try {
      const [scoreData, achievementsData, leaderboardData, entriesData] = await Promise.all([
        supabaseService.getDriverScore(driverId),
        supabaseService.getDriverAchievements(driverId),
        supabaseService.getLeaderboard(),
        supabaseService.getManualEntries(driverId)
      ]);

      setDriverScore(scoreData);
      setAchievements(achievementsData);
      setLeaderboard(leaderboardData);
      setManualEntries(entriesData);
    } catch (error) {
      console.error('Error loading gamification data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-start pt-8 p-4 overflow-y-auto">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <TrophyIcon className="text-yellow-500 w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold text-white">Gamifikace</h2>
              <p className="text-gray-400 text-sm">Vaše skóre a achievement</p>
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

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : (
            <>
              {/* Driver Score */}
              <div className="bg-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TrophyIcon className="text-cyan-400 w-5 h-5" />
                  Vaše skóre
                </h3>
                {driverScore ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div className="bg-slate-600 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-white">{driverScore.total_score}</div>
                      <div className="text-sm text-gray-300">Celkové skóre</div>
                      <div className="text-xs text-gray-400">#{driverScore.rank}</div>
                    </div>
                    <div className="bg-slate-600 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-400">{driverScore.fuel_efficiency_score}</div>
                      <div className="text-sm text-gray-300">Úspora paliva</div>
                    </div>
                    <div className="bg-slate-600 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-400">{driverScore.customer_count_score}</div>
                      <div className="text-sm text-gray-300">Klienti</div>
                    </div>
                    <div className="bg-slate-600 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-purple-400">{driverScore.perfect_rides_score}</div>
                      <div className="text-sm text-gray-300">Perfektní jízdy</div>
                    </div>
                    <div className="bg-slate-600 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-orange-400">{driverScore.acceptance_time_score}</div>
                      <div className="text-sm text-gray-300">Rychlost přijetí</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-4">Žádné skóre zatím nebylo vypočítáno.</p>
                )}
              </div>

              {/* Achievements */}
              <div className="bg-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TrophyIcon className="text-yellow-500 w-5 h-5" />
                  Vaše achievement ({achievements.length})
                </h3>
                {achievements.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {achievements.map(achievement => (
                      <div key={achievement.id} className="bg-slate-600 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-2xl">{achievement.icon}</div>
                          <div className="flex-1">
                            <h4 className="font-medium text-white">{achievement.title}</h4>
                            <p className="text-sm text-gray-300">{achievement.description}</p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">
                          Získáno: {new Date(achievement.unlocked_at).toLocaleDateString('cs-CZ')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-4">Žádná achievement zatím nezískána.</p>
                )}
              </div>

              {/* Leaderboard Position */}
              <div className="bg-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TrophyIcon className="text-yellow-500 w-5 h-5" />
                  Pořadí řidičů
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {leaderboard.slice(0, 10).map((score, index) => (
                    <div
                      key={score.driver_id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        score.driver_id === driverId ? 'bg-yellow-600/20 border border-yellow-500/30' : 'bg-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0 ? 'bg-yellow-500 text-black' :
                          index === 1 ? 'bg-gray-400 text-black' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-slate-500 text-white'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-white">{score.driver_name}</div>
                          {score.driver_id === driverId && (
                            <div className="text-xs text-yellow-400">(Vy)</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white">{score.total_score}</div>
                        <div className="text-xs text-gray-400">bodů</div>
                      </div>
                    </div>
                  ))}
                  {leaderboard.length > 10 && (
                    <p className="text-sm text-gray-400 text-center py-2">
                      A {leaderboard.length - 10} dalších řidičů...
                    </p>
                  )}
                </div>
              </div>

              {/* Recent Manual Entries */}
              {manualEntries.length > 0 && (
                <div className="bg-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">📝 Poslední záznamy</h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {manualEntries.slice(0, 5).map(entry => (
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
                              <span>{new Date(entry.created_at).toLocaleDateString('cs-CZ')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {manualEntries.length > 5 && (
                      <p className="text-sm text-gray-400 text-center">
                        A {manualEntries.length - 5} dalších záznamů...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};