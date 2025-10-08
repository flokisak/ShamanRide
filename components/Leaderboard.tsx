import React, { useState, useEffect } from 'react';
import { GamificationService } from '../services/gamificationService';
import { DriverScore, Achievement } from '../types';
import { TrophyIcon, MedalIcon, StarIcon, DeerIcon } from './icons';

interface LeaderboardProps {
  className?: string;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ className }) => {
  const [scores, setScores] = useState<DriverScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<'total' | 'fuel' | 'customers' | 'revenue' | 'perfect' | 'deer'>('total');

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const leaderboard = await GamificationService.getLeaderboard();
      setScores(leaderboard);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <TrophyIcon className="text-yellow-500 w-6 h-6" />;
      case 2:
        return <MedalIcon className="text-gray-400 w-6 h-6" />;
      case 3:
        return <MedalIcon className="text-amber-600 w-6 h-6" />;
      default:
        return <span className="text-gray-500 font-bold w-6 text-center">#{rank}</span>;
    }
  };

  const getScoreValue = (score: DriverScore) => {
    switch (selectedMetric) {
      case 'fuel':
        return score.fuel_efficiency_score;
      case 'customers':
        return score.customer_count_score;
      case 'revenue':
        return score.revenue_score;
      case 'perfect':
        return score.perfect_rides_score;
      case 'deer':
        return score.deer_collision_score;
      default:
        return score.total_score;
    }
  };

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'fuel':
        return 'Úspora paliva';
      case 'customers':
        return 'Klienti';
      case 'revenue':
        return 'Příjmy';
      case 'perfect':
        return 'Perfektní jízdy';
      case 'deer':
        return 'Sražené srnky 🦌';
      default:
        return 'Celkové skóre';
    }
  };

  const sortedScores = [...scores].sort((a, b) => getScoreValue(b) - getScoreValue(a));

  if (loading) {
    return (
      <div className={`bg-slate-800 rounded-lg p-6 ${className}`}>
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400">Načítání leaderboardu...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-800 rounded-lg p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <TrophyIcon className="text-yellow-500 w-6 h-6" />
          Leaderboard řidičů
        </h3>
        <button
          onClick={loadLeaderboard}
          className="px-3 py-1 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-md transition-colors"
        >
          Aktualizovat
        </button>
      </div>

      {/* Metriky selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: 'total', label: 'Celkové', icon: '🏆' },
          { key: 'fuel', label: 'Palivo', icon: '⛽' },
          { key: 'customers', label: 'Klienti', icon: '👥' },
          { key: 'revenue', label: 'Příjmy', icon: '💰' },
          { key: 'perfect', label: 'Perfektní', icon: '⭐' },
          { key: 'deer', label: 'Srnky', icon: '🦌' }
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setSelectedMetric(key as any)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              selectedMetric === key
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="space-y-3">
        {sortedScores.slice(0, 10).map((score, index) => {
          const rank = index + 1;
          const isTopThree = rank <= 3;

          return (
            <div
              key={score.driver_id}
              className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                isTopThree
                  ? 'bg-gradient-to-r from-yellow-900 to-amber-900 border border-yellow-500'
                  : 'bg-slate-700 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10">
                  {getRankIcon(rank)}
                </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white truncate">{score.driver_name}</div>
                    <div className="text-sm text-gray-400 truncate">
                      {getMetricLabel()}: {getScoreValue(score)} bodů
                    </div>
                  </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-bold text-cyan-400">
                  {getScoreValue(score)}
                </div>
                {selectedMetric === 'total' && (
                  <div className="text-xs text-gray-500">
                    #{score.rank} celkově
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sortedScores.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            Žádná data pro leaderboard nejsou k dispozici
          </div>
        )}
      </div>

      {/* Achievement preview */}
      {sortedScores.length > 0 && (
        <div className="mt-6 p-4 bg-slate-700 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
            <StarIcon className="w-4 h-4" />
            Achievement systému
          </h4>
          <div className="text-xs text-gray-400">
            Řidiči získávají achievement za dosažení různých milníků:
            Šetřílek (úspora paliva), Oblíbenec (počet klientů), Dokonalý řidič (perfektní jízdy), atd.
          </div>
        </div>
      )}
    </div>
  );
};