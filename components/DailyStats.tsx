import React, { useState, useEffect } from 'react';
import { RideLog, Person } from '../types';
import { TrophyIcon, MedalIcon, StarIcon, CalendarIcon } from './icons';

interface DailyStatsProps {
  rideLog: RideLog[];
  people: Person[];
  className?: string;
}

interface DailyDriverStats {
  driverId: number;
  driverName: string;
  ridesToday: number;
  revenueToday: number;
  perfectRidesToday: number;
  paidKmToday: number;
  emptyKmToday: number;
}

export const DailyStats: React.FC<DailyStatsProps> = ({ rideLog, people, className }) => {
  const [dailyStats, setDailyStats] = useState<DailyDriverStats[]>([]);

  useEffect(() => {
    calculateDailyStats();
  }, [rideLog, people]);

  const calculateDailyStats = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTimestamp = tomorrow.getTime();

    // Filter today's completed rides
    const todaysRides = rideLog.filter(ride =>
      ride.status === 'COMPLETED' &&
      ride.timestamp >= todayTimestamp &&
      ride.timestamp < tomorrowTimestamp &&
      ride.driverName
    );

    // Group by driver
    const driverStatsMap = new Map<number, DailyDriverStats>();

    todaysRides.forEach(ride => {
      const driver = people.find(p => p.name === ride.driverName);
      if (!driver) return;

      const existing = driverStatsMap.get(driver.id) || {
        driverId: driver.id,
        driverName: driver.name,
        ridesToday: 0,
        revenueToday: 0,
        perfectRidesToday: 0,
        paidKmToday: 0,
        emptyKmToday: 0
      };

      existing.ridesToday++;
      existing.revenueToday += ride.estimatedPrice || 0;
      if (ride.smsSent) {
        existing.perfectRidesToday++;
      }
      if (ride.passengers && ride.passengers > 0) {
        existing.paidKmToday += ride.distance || 0;
      } else {
        existing.emptyKmToday += ride.distance || 0;
      }

      driverStatsMap.set(driver.id, existing);
    });

    // Convert to array and sort by rides today (descending)
    const stats = Array.from(driverStatsMap.values())
      .sort((a, b) => b.ridesToday - a.ridesToday);

    setDailyStats(stats);
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-yellow-600 text-white text-xs font-bold rounded-full">
            <TrophyIcon className="w-3 h-3" />
            #1
          </div>
        );
      case 2:
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-400 text-white text-xs font-bold rounded-full">
            <MedalIcon className="w-3 h-3" />
            #2
          </div>
        );
      case 3:
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-amber-600 text-white text-xs font-bold rounded-full">
            <MedalIcon className="w-3 h-3" />
            #3
          </div>
        );
      default:
        return null;
    }
  };

  const getPerformanceBadge = (stats: DailyDriverStats) => {
    const perfectRatio = stats.perfectRidesToday / stats.ridesToday;

    if (perfectRatio >= 0.9 && stats.ridesToday >= 3) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs rounded-full">
          <StarIcon className="w-3 h-3" />
          Perfektní den
        </div>
      );
    }

    if (stats.ridesToday >= 10) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
          <TrophyIcon className="w-3 h-3" />
          Maratonista
        </div>
      );
    }

    return null;
  };

  const today = new Date().toLocaleDateString('cs-CZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className={`bg-slate-800 rounded-lg p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <CalendarIcon className="text-cyan-400 w-6 h-6" />
        <h3 className="text-xl font-semibold text-white">
          Dnešní šampioni - {today}
        </h3>
      </div>

      {dailyStats.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Dnes zatím žádné dokončené jízdy</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dailyStats.slice(0, 5).map((stats, index) => {
            const rank = index + 1;
            const isTopThree = rank <= 3;

            return (
              <div
                key={stats.driverId}
                className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                  isTopThree
                    ? 'bg-gradient-to-r from-cyan-900 to-blue-900 border border-cyan-500'
                    : 'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {getRankBadge(rank)}
                    <div className="font-medium text-white truncate max-w-32">{stats.driverName}</div>
                  </div>

                  <div className="flex gap-2">
                    {getPerformanceBadge(stats)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold text-cyan-400">
                    {stats.ridesToday} jízd
                  </div>
                  <div className="text-sm text-gray-400">
                    {stats.revenueToday} Kč | {stats.perfectRidesToday}/{stats.ridesToday} perfektních
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dailyStats.length > 0 && (
        <div className="mt-6 p-4 bg-slate-700 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            🏆 Dnešní statistiky
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Celkem jízd:</span>
              <span className="ml-2 font-bold text-cyan-400">
                {dailyStats.reduce((sum, s) => sum + s.ridesToday, 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Celkem příjmů:</span>
              <span className="ml-2 font-bold text-green-400">
                {dailyStats.reduce((sum, s) => sum + s.revenueToday, 0)} Kč
              </span>
            </div>
            <div>
              <span className="text-gray-400">Placené km:</span>
              <span className="ml-2 font-bold text-blue-400">
                {dailyStats.reduce((sum, s) => sum + s.paidKmToday, 0).toFixed(1)} km
              </span>
            </div>
            <div>
              <span className="text-gray-400">Prázdné km:</span>
              <span className="ml-2 font-bold text-red-400">
                {dailyStats.reduce((sum, s) => sum + s.emptyKmToday, 0).toFixed(1)} km
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};