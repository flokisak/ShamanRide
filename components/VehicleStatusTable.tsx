import React, { useState, useMemo, useEffect } from 'react';
import type { Vehicle, Person, RideLog, Achievement } from '../types';
import { VehicleStatus, VehicleType, RideStatus } from '../types';
import { CarIcon, EditIcon, WrenchIcon, AlertTriangleIcon, FuelIcon, TrophyIcon, StarIcon, DeerIcon } from './icons';
import { Countdown } from './Countdown';
import { useTranslation } from '../contexts/LanguageContext';
import { supabaseService } from '../driver-app/src/supabaseClient';
import { fetchVehiclePositions, GpsVehicle } from '../services/gpsService';

interface VehicleStatusTableProps {
  vehicles: Vehicle[];
  people: Person[];
  onEdit: (vehicle: Vehicle) => void;
  rideLog: RideLog[];
  onAddVehicleClick: () => void;
  locations?: Record<string, {latitude: number; longitude: number; timestamp: string}>;
}

type WarningLevel = 'info' | 'warning' | 'urgent';

const FilterSelect: React.FC<{
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
    <div>
        <label htmlFor={label} className="sr-only">{label}</label>
        <select
            id={label}
            value={value}
            onChange={onChange}
            className="block w-full pl-3 pr-10 py-1 text-sm bg-slate-700 border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        >
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

export const VehicleStatusTable: React.FC<VehicleStatusTableProps> = ({ vehicles, people, onEdit, rideLog, onAddVehicleClick, locations }) => {
  const { t } = useTranslation();

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hideInactive, setHideInactive] = useState<boolean>(false);
  const [driverAchievements, setDriverAchievements] = useState<Map<number, Achievement[]>>(new Map());
  const [gpsPositions, setGpsPositions] = useState<GpsVehicle[]>([]);

  // Fetch GPS positions
  // useEffect(() => {
  //   const fetchGps = async () => {
  //     try {
  //       const positions = await fetchVehiclePositions();
  //       setGpsPositions(positions);
  //     } catch (error) {
  //       console.error('Failed to fetch GPS positions:', error);
  //     }
  //   };

  //   fetchGps();
  //   const interval = setInterval(fetchGps, 30000); // Update every 30 seconds
  //   return () => clearInterval(interval);
  // }, []);

  // Fetch achievements for all drivers
  useEffect(() => {
    const fetchAchievements = async () => {
      const achievementsMap = new Map<number, Achievement[]>();

      for (const person of people) {
        if (person.role === 'DRIVER') {
          try {
            const achievements = await supabaseService.getDriverAchievements(person.id);
            if (achievements && achievements.length > 0) {
              achievementsMap.set(person.id, achievements);
            }
          } catch (error) {
            console.warn(`Failed to fetch achievements for driver ${person.id}:`, error);
          }
        }
      }

      setDriverAchievements(achievementsMap);
    };

    fetchAchievements();
  }, [people]);

  const getAchievementIcon = (achievement: Achievement) => {
    switch (achievement.icon) {
      case '🚗':
        return <CarIcon className="w-3 h-3" />;
      case '👥':
        return <span className="text-xs">👥</span>;
      case '⭐':
        return <StarIcon className="w-3 h-3" />;
      case '🦌':
        return <DeerIcon className="w-3 h-3" />;
      case '💰':
        return <span className="text-xs">💰</span>;
      case '🏆':
        return <TrophyIcon className="w-3 h-3" />;
      default:
        return <TrophyIcon className="w-3 h-3" />;
    }
  };

  const getAchievementBadge = (achievement: Achievement) => {
    const rarityColors = {
      common: 'bg-gray-600',
      rare: 'bg-blue-600',
      epic: 'bg-purple-600',
      legendary: 'bg-yellow-600'
    };

    return (
      <div
        key={achievement.id}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium ${rarityColors[achievement.rarity]} text-white`}
        title={`${achievement.title}: ${achievement.description}`}
      >
        {getAchievementIcon(achievement)}
        <span className="hidden sm:inline">{achievement.title}</span>
      </div>
    );
  };

  const vehicleTotalCosts = useMemo(() => {
    const costs = new Map<number, number>();
    rideLog.forEach(log => {
      if (log.vehicleId && log.fuelCost && log.status === RideStatus.Completed) {
        const currentCost = costs.get(log.vehicleId) || 0;
        costs.set(log.vehicleId, currentCost + log.fuelCost);
      }
    });
    return costs;
  }, [rideLog]);

  const getStatusClass = (status: VehicleStatus) => {
    switch (status) {
      case VehicleStatus.Available: return 'text-green-400';
      case VehicleStatus.Busy: return 'text-yellow-400';
      case VehicleStatus.Break: return 'text-orange-400';
      case VehicleStatus.OutOfService: return 'text-red-400';
      case VehicleStatus.NotDrivingToday: return 'text-sky-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusDotClass = (status: VehicleStatus) => {
    switch (status) {
      case VehicleStatus.Available: return 'bg-green-500';
      case VehicleStatus.Busy: return 'bg-yellow-500';
      case VehicleStatus.Break: return 'bg-orange-500';
      case VehicleStatus.OutOfService: return 'bg-red-500';
      case VehicleStatus.NotDrivingToday: return 'bg-sky-500';
      default: return 'bg-gray-500';
    }
  };

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(vehicle => {
      const matchesType = typeFilter === 'all' || vehicle.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
      const isActive = !hideInactive || vehicle.status !== VehicleStatus.NotDrivingToday;
      return matchesType && matchesStatus && isActive;
    });
  }, [vehicles, typeFilter, statusFilter, hideInactive]);
  
  const typeOptions = [
    { value: 'all', label: t('vehicles.filters.allTypes') },
    { value: VehicleType.Car, label: t(`vehicleType.${VehicleType.Car}`) },
    { value: VehicleType.Van, label: t(`vehicleType.${VehicleType.Van}`) },
  ];

  const statusOptions = [
    { value: 'all', label: t('vehicles.filters.allStatuses') },
    { value: VehicleStatus.Available, label: t('vehicleStatus.AVAILABLE') },
    { value: VehicleStatus.Busy, label: t('vehicleStatus.BUSY') },
    { value: VehicleStatus.Break, label: t('vehicleStatus.BREAK') },
    { value: VehicleStatus.OutOfService, label: t('vehicleStatus.OUT_OF_SERVICE') },
    { value: VehicleStatus.NotDrivingToday, label: t('vehicleStatus.NOT_DRIVING_TODAY') },
  ];

  return (
    <div className="bg-slate-800 p-2 rounded-lg shadow-2xl flex flex-col h-full">
        <div className="flex-shrink-0 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-white font-sans">Vozidla</h3>
            <div className="flex items-center space-x-4">
              <button
                onClick={onAddVehicleClick}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>{t('vehicles.addVehicle')}</span>
              </button>
              <div className="flex items-center space-x-2">
                <label htmlFor="hide-inactive" className="text-sm font-medium text-gray-300 cursor-pointer">
                  {t('vehicles.filters.hideInactive')}
                </label>
                <button
                  onClick={() => setHideInactive(!hideInactive)}
                  type="button"
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${hideInactive ? 'bg-emerald-600' : 'bg-slate-600'}`}
                  role="switch"
                  aria-checked={hideInactive}
                  id="hide-inactive"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${hideInactive ? 'translate-x-5' : 'translate-x-0'}`}
                  ></span>
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FilterSelect
              label={t('vehicles.filters.filterByType')}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={typeOptions}
            />
            <FilterSelect
              label={t('vehicles.filters.filterByStatus')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusOptions}
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto -mr-2 -ml-2 pr-2 pl-2">
            <table className="min-w-full">
                <thead className="bg-slate-800 sticky top-0">
                <tr>
                    <th scope="col" className="py-0.5 pl-2 pr-2 text-left text-xs font-semibold text-gray-300 sm:pl-0">{t('vehicles.table.vehicle')}</th>
                    <th scope="col" className="px-2 py-0.5 text-left text-xs font-semibold text-gray-300">{t('vehicles.table.status')}</th>
                    <th scope="col" className="px-2 py-0.5 text-left text-xs font-semibold text-gray-300">{t('vehicles.table.location')}</th>
                    <th scope="col" className="px-2 py-0.5 text-left text-xs font-semibold text-gray-300">{t('vehicles.table.warnings')}</th>

                </tr>
                </thead>
                 <tbody key={`${typeFilter}-${statusFilter}-${hideInactive}`}>
                 {filteredVehicles.map((vehicle) => {
                    const driver = people.find(p => p.id === vehicle.driverId);
                    
                    const warnings: { text: string; level: WarningLevel }[] = [];
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // Check for service
                    if (vehicle.mileage && vehicle.lastServiceMileage && vehicle.serviceInterval && vehicle.mileage >= vehicle.lastServiceMileage + vehicle.serviceInterval - 1000) {
                        const kmOver = vehicle.mileage - (vehicle.lastServiceMileage + vehicle.serviceInterval);
                        if (kmOver > 0) {
                            warnings.push({ text: t('vehicles.warnings.serviceOverdue', { km: kmOver }), level: 'urgent' });
                        } else {
                            const kmToService = (vehicle.lastServiceMileage + vehicle.serviceInterval) - vehicle.mileage;
                            warnings.push({ text: t('vehicles.warnings.serviceDue', { km: kmToService }), level: 'warning' });
                        }
                    }

                    // Check for tech inspection
                    if (vehicle.technicalInspectionExpiry) {
                        const expiryDate = new Date(vehicle.technicalInspectionExpiry);
                        const diffTime = expiryDate.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays < 0) {
                           warnings.push({ text: t('vehicles.warnings.inspectionExpired'), level: 'urgent' });
                        } else if (diffDays <= 5) {
                            warnings.push({ text: t('vehicles.warnings.inspectionExpiresSoon', { days: diffDays }), level: 'urgent' });
                        } else if (diffDays <= 30) {
                            warnings.push({ text: t('vehicles.warnings.inspectionExpires', { date: expiryDate.toLocaleDateString() }), level: 'warning' });
                        }
                    }
                    
                    // Check for vignette
                    if (vehicle.vignetteExpiry) {
                        const expiryDate = new Date(vehicle.vignetteExpiry);
                        const diffTime = expiryDate.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        if (diffDays < 0) {
                            warnings.push({ text: t('vehicles.warnings.vignetteExpired'), level: 'urgent' });
                        } else if (diffDays <= 5) {
                            warnings.push({ text: t('vehicles.warnings.vignetteExpiresSoon', { days: diffDays }), level: 'urgent' });
                        } else if (diffDays <= 30) {
                            warnings.push({ text: t('vehicles.warnings.vignetteExpires', { date: expiryDate.toLocaleDateString() }), level: 'warning' });
                        }
                    }

                    const highestSeverity = warnings.reduce((maxLevel, w) => {
                        if (w.level === 'urgent') return 'urgent';
                        if (w.level === 'warning' && maxLevel !== 'urgent') return 'warning';
                        return maxLevel;
                    }, 'info' as WarningLevel);

                    const totalFuelCost = vehicleTotalCosts.get(vehicle.id);


                    return (
                    <tr key={vehicle.id} className="hover:bg-slate-700 transition-colors">
                    <td className="whitespace-nowrap py-0.5 pl-2 pr-2 text-xs sm:pl-0">
                        <div className="flex items-center">
                        <button
                            onClick={() => onEdit(vehicle)}
                            className="h-7 w-7 flex-shrink-0 hover:bg-slate-600 rounded p-1 transition-colors"
                            aria-label={t('vehicles.editVehicle', { name: vehicle.name })}
                        >
                              <CarIcon className={vehicle.type === VehicleType.Car ? "text-cyan-400 hover:text-cyan-300" : "text-gray-200 hover:text-gray-100"} size={20} />
                        </button>
                        <div className="ml-2">
                            <div className="font-medium text-white text-xs">{vehicle.name}</div>
                            <div className="text-gray-400 text-xs flex items-center gap-1">
                              {driver?.name || <span className="italic text-gray-500">{t('general.unassigned')}</span>}
                              {driver && driverAchievements.get(driver.id) && (
                                <div className="flex flex-wrap gap-0.5">
                                  {driverAchievements.get(driver.id)!.slice(0, 2).map(achievement => getAchievementBadge(achievement))}
                                  {driverAchievements.get(driver.id)!.length > 2 && (
                                    <div className="inline-flex items-center px-1 py-0.5 mx-0.5 rounded text-xs font-medium bg-slate-600 text-white">
                                      +{driverAchievements.get(driver.id)!.length - 2}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {driver?.phone && <a href={`tel:${driver.phone}`} className="text-teal-400 text-xs font-mono hover:underline">{driver.phone}</a>}
                            <div className="mt-0.5 font-mono text-xs text-gray-500 bg-slate-700 px-1 py-0.5 rounded w-fit">{vehicle.licensePlate}</div>
                            {totalFuelCost !== undefined && (
                                <div className="mt-0.5 flex items-center space-x-1 text-xs text-red-400" title={t('vehicles.table.totalFuelCost')}>
                                    <FuelIcon size={10} />
                                    <span>{totalFuelCost.toFixed(0)} Kč</span>
                                </div>
                            )}
                        </div>
                        </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-0.5 text-xs">
                        <div className="flex items-center">
                        <div className={`h-2 w-2 rounded-full mr-1 ${getStatusDotClass(vehicle.status)}`}></div>
                        <span className={`${getStatusClass(vehicle.status)} capitalize text-xs`}>
                            {t(`vehicleStatus.${vehicle.status}`)}
                            {(vehicle.status === VehicleStatus.Busy || vehicle.status === VehicleStatus.OutOfService) && vehicle.freeAt && <Countdown freeAt={vehicle.freeAt} />}
                        </span>
                        </div>
                    </td>
                     <td className="whitespace-nowrap px-2 py-0.5 text-xs text-gray-400">
                          {(() => {
                              const gpsPos = gpsPositions.find(g => g.id === vehicle.id.toString() || g.name === vehicle.name);
                              const lastLoc = locations ? locations[vehicle.id.toString()] : undefined;

                              if (gpsPos) {
                                  return (
                                      <div>
                                          <div className="text-green-400 font-medium">GPS: {gpsPos.lat.toFixed(4)}, {gpsPos.lon.toFixed(4)}</div>
                                          <div className="text-xs text-gray-500">{new Date(gpsPos.lastUpdate).toLocaleTimeString()}</div>
                                      </div>
                                  );
                              } else if (lastLoc) {
                                  return (
                                      <div>
                                          <div className="text-blue-400 font-medium">Poslední: {lastLoc.latitude.toFixed(4)}, {lastLoc.longitude.toFixed(4)}</div>
                                          <div className="text-xs text-gray-500">{new Date(lastLoc.timestamp).toLocaleTimeString()}</div>
                                      </div>
                                  );
                              } else {
                                  return vehicle.location;
                              }
                          })()}
                     </td>
                    <td className="whitespace-nowrap px-2 py-0.5 text-xs text-gray-400">
                        {warnings.length > 0 && (
                            <div className="flex items-center space-x-2" title={warnings.map(w => w.text).join('\n')}>
                                {highestSeverity === 'urgent' ? (
                                    <AlertTriangleIcon className="text-red-500" size={14} />
                                ) : (
                                    <WrenchIcon className="text-yellow-400" size={14} />
                                )}
                                <span className={`text-xs font-semibold ${highestSeverity === 'urgent' ? 'text-red-500' : 'text-yellow-400'}`}>
                                    {warnings.length}
                                </span>
                            </div>
                        )}
                    </td>

                    </tr>
                )})}
                </tbody>
            </table>
        </div>
    </div>
  );
};
