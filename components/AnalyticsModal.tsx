import React, { useState, useMemo, useRef } from 'react';
import type { RideLog, Vehicle, Person } from '../types';
import { RideStatus } from '../types';
import { CloseIcon, PdfIcon, FuelIcon } from './icons';
import { BarChart } from './BarChart';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useTranslation } from '../contexts/LanguageContext';

interface AnalyticsModalProps {
  rideLog: RideLog[];
  vehicles: Vehicle[];
  people: Person[];
  onClose: () => void;
}

type DateRange = 'today' | '7d' | '30d' | 'all';

const StatCard: React.FC<{ title: string; value: string | number; description?: string, icon?: React.ReactNode }> = ({ title, value, description, icon }) => (
    <div className="glass-card p-6 rounded-2xl flex items-center space-x-4 border border-accent-neon/8">
        {icon && <div className="text-emerald-400">{icon}</div>}
        <div>
            <h3 className="text-sm font-medium text-gray-400 truncate font-sans">{title}</h3>
            <p className="mt-1 text-3xl font-medium text-white font-sans">{value}</p>
            {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
        </div>
    </div>
);

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ rideLog, vehicles, people, onClose }) => {
    const { t, language } = useTranslation();
    const [dateRange, setDateRange] = useState<DateRange>('7d');
    const [selectedVehicleId, setSelectedVehicleId] = useState<number | 'all'>('all');
    const [selectedDriverId, setSelectedDriverId] = useState<number | 'all'>('all');
    const [isExporting, setIsExporting] = useState(false);
    const exportRef = useRef<HTMLElement>(null);

    const filteredRideLog = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let filtered = rideLog;

        // Date range filter
        if (dateRange !== 'all') {
            let startDate = new Date(startOfToday);
            if (dateRange === '7d') {
                startDate.setDate(startDate.getDate() - 7);
            } else if (dateRange === '30d') {
                startDate.setDate(startDate.getDate() - 30);
            }
            filtered = filtered.filter(log => log.timestamp >= startDate.getTime());
        }

        // Vehicle filter
        if (selectedVehicleId !== 'all') {
            filtered = filtered.filter(log => log.vehicleId === selectedVehicleId);
        }

        // Driver filter
        if (selectedDriverId !== 'all') {
            const vehicleIdsForDriver = vehicles
                .filter(v => v.driverId === selectedDriverId)
                .map(v => v.id);
            filtered = filtered.filter(log => log.vehicleId && vehicleIdsForDriver.includes(log.vehicleId));
        }

        return filtered;
    }, [rideLog, dateRange, selectedVehicleId, selectedDriverId, vehicles]);

    const analyticsData = useMemo(() => {
        const completedRides = filteredRideLog.filter(log => log.status === RideStatus.Completed);
        const totalRevenue = completedRides.reduce((sum, log) => sum + (log.estimatedPrice || 0), 0);
        const totalFuelCost = completedRides.reduce((sum, log) => sum + (log.fuelCost || 0), 0);
        const ridesCancelled = filteredRideLog.filter(log => log.status === RideStatus.Cancelled).length;

        const vehicleStats: Record<string, { rideCount: number; revenue: number; fuelCost: number; vehicleName: string, vehicleLicensePlate: string }> = {};

        vehicles.forEach(v => {
            vehicleStats[v.id] = {
                rideCount: 0,
                revenue: 0,
                fuelCost: 0,
                vehicleName: v.name,
                vehicleLicensePlate: v.licensePlate,
            }
        });
        
        completedRides.forEach(log => {
            if (log.vehicleId) {
                if (!vehicleStats[log.vehicleId]) {
                    // This handles cases where a vehicle might have been deleted but still has logs
                     vehicleStats[log.vehicleId] = {
                        rideCount: 0,
                        revenue: 0,
                        fuelCost: 0,
                        vehicleName: log.vehicleName || `Vozidlo #${log.vehicleId}`,
                        vehicleLicensePlate: log.vehicleLicensePlate || 'N/A',
                    }
                }
                vehicleStats[log.vehicleId].rideCount += 1;
                vehicleStats[log.vehicleId].revenue += log.estimatedPrice || 0;
                vehicleStats[log.vehicleId].fuelCost += log.fuelCost || 0;
            }
        });
        
        const vehicleStatsArray = Object.values(vehicleStats).filter(v => v.rideCount > 0).sort((a,b) => b.rideCount - a.rideCount);

        const chartData = vehicleStatsArray
            .filter(v => v.rideCount > 0)
            .map(v => ({ label: v.vehicleName, value: v.rideCount }));

        return {
            totalRides: filteredRideLog.length,
            completedRides: completedRides.length,
            totalRevenue,
            totalFuelCost,
            ridesCancelled,
            avgPricePerRide: completedRides.length > 0 ? (totalRevenue / completedRides.length) : 0,
            vehicleStats: vehicleStatsArray,
            chartData,
        };
    }, [filteredRideLog, vehicles]);
    
    const DateRangeButton: React.FC<{ range: DateRange, label: string }> = ({ range, label }) => {
        const isActive = dateRange === range;
        return (
            <button
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors font-sans ${
                    isActive ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600'
                }`}
            >
                {label}
            </button>
        )
    };
    
    const handleExportPdf = async () => {
        if (!exportRef.current || isExporting) return;
    
        setIsExporting(true);
        try {
            const element = exportRef.current;
            const canvas = await html2canvas(element, {
                backgroundColor: '#1e293b', // bg-slate-800 from parent modal
                scale: 2, 
                useCORS: true,
                height: element.scrollHeight,
                windowHeight: element.scrollHeight,
            });
            
            const imgData = canvas.toDataURL('image/png');
            
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4',
            });
    
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const canvasAspectRatio = canvas.width / canvas.height;
            
            const imgWidth = pdfWidth - 20; // A4 width (210mm) - 10mm margin each side
            const imgHeight = imgWidth / canvasAspectRatio;
            
            const pdfHeight = pdf.internal.pageSize.getHeight() - 20;

            if (imgHeight > pdfHeight) {
                console.warn("Report is too long for a single PDF page and will be scaled down.");
            }
    
            pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
            
            const date = new Date().toISOString().slice(0, 10);
            pdf.save(`report-rideshaman-${date}.pdf`);
    
        } catch (error) {
            console.error("Error exporting to PDF:", error);
            alert(t('analytics.exportError'));
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in" role="dialog" aria-modal="true">
    <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col relative">
        <header className="flex justify-between items-center p-6 border-b border-slate-700">
                    <h2 className="text-xl font-medium font-sans">{t('analytics.title')}</h2>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={handleExportPdf}
                            disabled={isExporting}
                            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:bg-slate-500 disabled:cursor-wait"
                            aria-label={t('analytics.exportPdf')}
                        >
                            <PdfIcon />
                            <span>{isExporting ? t('analytics.exporting') : t('analytics.exportPdf')}</span>
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label={t('general.close')}><CloseIcon /></button>
                    </div>
                </header>
                <main ref={exportRef} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Date Range Filter */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 font-sans">{t('analytics.filters.dateRange')}</label>
                            <div className="flex flex-wrap gap-2">
                                <DateRangeButton range="today" label={t('analytics.ranges.today')} />
                                <DateRangeButton range="7d" label={t('analytics.ranges.last7d')} />
                                <DateRangeButton range="30d" label={t('analytics.ranges.last30d')} />
                                <DateRangeButton range="all" label={t('analytics.ranges.allTime')} />
                            </div>
                        </div>

                        {/* Vehicle Filter */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 font-sans">{t('analytics.filters.vehicle')}</label>
                            <select
                                value={selectedVehicleId}
                                onChange={(e) => setSelectedVehicleId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white font-sans"
                            >
                                <option value="all">{t('analytics.filters.allVehicles')}</option>
                                {vehicles.map(vehicle => (
                                    <option key={vehicle.id} value={vehicle.id}>
                                        {vehicle.name} ({vehicle.licensePlate})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Driver Filter */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 font-sans">{t('analytics.filters.driver')}</label>
                            <select
                                value={selectedDriverId}
                                onChange={(e) => setSelectedDriverId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white font-sans"
                            >
                                <option value="all">{t('analytics.filters.allDrivers')}</option>
                                {people.filter(person => person.role === 'Driver').map(driver => (
                                    <option key={driver.id} value={driver.id}>
                                        {driver.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    {/* Stat cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <StatCard title={t('analytics.cards.completedRides')} value={analyticsData.completedRides} />
                        <StatCard title={t('analytics.cards.totalRevenue')} value={`${analyticsData.totalRevenue.toLocaleString(language)} Kč`} />
                        <StatCard title={t('analytics.cards.totalFuelCost')} value={`${analyticsData.totalFuelCost.toLocaleString(language)} Kč`} icon={<FuelIcon size={32}/>} />
                        <StatCard title={t('analytics.cards.avgPrice')} value={`${analyticsData.avgPricePerRide.toFixed(0)} Kč`} />
                        <StatCard title={t('analytics.cards.cancelledRides')} value={analyticsData.ridesCancelled} />
                    </div>

                    {/* Chart */}
                    <div className="pt-4">
                        <BarChart data={analyticsData.chartData} title={t('analytics.chartTitle')} />
                    </div>
                    
                    {/* Vehicle Table */}
                    <div className="pt-4">
                        <h3 className="text-lg font-medium text-gray-200 mb-4 font-sans">{t('analytics.tableTitle')}</h3>
                         <div className="overflow-x-auto">
                             <table className="min-w-full">
                                 <thead className="bg-gradient-to-r from-emerald-900/50 to-slate-800">
                                     <tr>
                                         <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-medium text-gray-300 sm:pl-6 font-sans">{t('analytics.table.vehicle')}</th>
                                         <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-gray-300 font-sans">{t('analytics.table.licensePlate')}</th>
                                         <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-gray-300 font-sans">{t('analytics.table.completedRides')}</th>
                                         <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-gray-300 font-sans">{t('analytics.table.revenue')}</th>
                                         <th scope="col" className="px-3 py-3.5 text-left text-sm font-medium text-gray-300 font-sans">{t('analytics.table.fuelCost')}</th>
                                     </tr>
                                 </thead>
                                 <tbody>
                                    {analyticsData.vehicleStats.map((stat, index) => (
                                        <tr key={index}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{stat.vehicleName}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400 font-mono">{stat.vehicleLicensePlate}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{stat.rideCount}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{stat.revenue.toFixed(0)} Kč</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{stat.fuelCost.toFixed(0)} Kč</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};