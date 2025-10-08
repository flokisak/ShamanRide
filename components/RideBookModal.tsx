import React, { useState, useMemo } from 'react';
import { RideLog, Vehicle, Person, RideType, CompanyInfo } from '../types';
import { CloseIcon, DownloadIcon, EditIcon, TrashIcon, PlusIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import { generateMileageSummary } from '../services/dispatchService';

interface RideBookModalProps {
  rideLogs: RideLog[];
  vehicles: Vehicle[];
  people: Person[];
  companyInfo: CompanyInfo;
  onEdit: (log: RideLog) => void;
  onDelete: (logId: string) => void;
  onAdd: () => void;
  onClose: () => void;
}

export const RideBookModal: React.FC<RideBookModalProps> = ({
  rideLogs,
  vehicles,
  people,
  companyInfo,
  onEdit,
  onDelete,
  onAdd,
  onClose
}) => {
  const { t } = useTranslation();
  const [filterType, setFilterType] = useState<RideType | 'ALL'>('ALL');
  const [filterVehicle, setFilterVehicle] = useState<number | 'ALL'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredLogs = useMemo(() => {
    return rideLogs.filter(log => {
      // Filter by ride type
      if (filterType !== 'ALL' && log.rideType !== filterType) return false;

      // Filter by vehicle
      if (filterVehicle !== 'ALL' && log.vehicleId !== filterVehicle) return false;

      // Filter by date range
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        const logDate = new Date(log.timestamp);
        if (logDate < fromDate) return false;
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        const logDate = new Date(log.timestamp);
        if (logDate > toDate) return false;
      }

      return true;
    });
  }, [rideLogs, filterType, filterVehicle, dateFrom, dateTo]);

  const mileageSummary = useMemo(() => {
    return generateMileageSummary(filteredLogs, vehicles);
  }, [filteredLogs, vehicles]);

  const exportToCSV = () => {
    const headers = [
      'Datum',
      'Čas',
      'Vozidlo',
      'SPZ',
      'Řidič',
      'Zákazník',
      'Telefon',
      'Trasa',
      'Typ jízdy',
      'Počáteční km',
      'Konečný km',
      'Vzdálenost',
      'Účel',
      'Status'
    ];

    const csvData = filteredLogs.map(log => {
      const vehicle = vehicles.find(v => v.id === log.vehicleId);
      const driver = vehicle ? people.find(p => p.id === vehicle.driverId) : null;

      return [
        new Date(log.timestamp).toLocaleDateString('cs-CZ'),
        new Date(log.timestamp).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        log.vehicleName || '-',
        log.vehicleLicensePlate || '-',
        log.driverName || '-',
        log.customerName,
        log.customerPhone,
        log.stops.join(' -> '),
        log.rideType ? t(`rideType.${log.rideType}`) : '-',
        log.startMileage || '-',
        log.endMileage || '-',
        log.distance || '-',
        log.rideType === RideType.PRIVATE ? log.purpose : log.businessPurpose || '-',
        t(`rideStatus.${log.status}`)
      ];
    });

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `kniha_jizd_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    // Simple PDF export using browser print
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Kniha jízd - ${new Date().toLocaleDateString('cs-CZ')}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #1f2937; text-align: center; }
            .header { text-align: center; margin-bottom: 20px; }
            .company-info { margin-bottom: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
            .logo { max-width: 150px; max-height: 80px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: bold; }
            .summary { margin-bottom: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
            .business { background-color: #dbeafe; }
            .private { background-color: #dcfce7; }
          </style>
        </head>
        <body>
          <div class="header">
            ${companyInfo.logoUrl ? `<img src="${companyInfo.logoUrl}" alt="Logo" class="logo" />` : ''}
            <h1>Kniha jízd</h1>
          </div>
          <div class="company-info">
            <h2>${companyInfo.name}</h2>
            <p><strong>Adresa:</strong> ${companyInfo.address}</p>
            <p><strong>Telefon:</strong> ${companyInfo.phone} | <strong>Email:</strong> ${companyInfo.email}</p>
            <p><strong>IČO:</strong> ${companyInfo.ico} | <strong>DIČ:</strong> ${companyInfo.dic}</p>
            <p><strong>Období:</strong> ${new Date().toLocaleDateString('cs-CZ')}</p>
          </div>
          <div class="summary">
            <h2>Souhrn</h2>
            <p><strong>Celková vzdálenost služebních jízd:</strong> ${mileageSummary.totalBusinessDistance.toLocaleString()} km</p>
            <p><strong>Celková vzdálenost soukromých jízd:</strong> ${mileageSummary.totalPrivateDistance.toLocaleString()} km</p>
            <p><strong>Celkové náklady na palivo:</strong> ${mileageSummary.totalFuelCost.toLocaleString()} Kč</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Čas</th>
                <th>Vozidlo</th>
                <th>Řidič</th>
                <th>Zákazník</th>
                <th>Trasa</th>
                <th>Typ jízdy</th>
                <th>Počáteční km</th>
                <th>Konečný km</th>
                <th>Vzdálenost</th>
                <th>Účel</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs.map(log => {
                const vehicle = vehicles.find(v => v.id === log.vehicleId);
                const driver = vehicle ? people.find(p => p.id === vehicle.driverId) : null;
                const rowClass = log.rideType === RideType.BUSINESS ? 'business' : 'private';

                return `
                  <tr class="${rowClass}">
                    <td>${new Date(log.timestamp).toLocaleDateString('cs-CZ')}</td>
                    <td>${new Date(log.timestamp).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>${log.vehicleName || '-'}</td>
                    <td>${log.driverName || '-'}</td>
                    <td>${log.customerName}</td>
                    <td>${log.stops.join(' -> ')}</td>
                    <td>${log.rideType ? t(`rideType.${log.rideType}`) : '-'}</td>
                    <td>${log.startMileage || '-'}</td>
                    <td>${log.endMileage || '-'}</td>
                    <td>${log.distance || '-'}</td>
                    <td>${log.rideType === RideType.PRIVATE ? log.purpose : log.businessPurpose || '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Kniha jízd</h2>
          <div className="flex items-center gap-2">
             <button
               onClick={onAdd}
               className="flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-md shadow-sm bg-[#81A1C1] hover:bg-[#5E81AC] text-slate-900 transition-colors"
             >
              <PlusIcon size={16} />
              Přidat jízdu
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="p-6 border-b border-slate-700">
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Typ jízdy</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as RideType | 'ALL')}
                className="bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white"
              >
                <option value="ALL">Všechny typy</option>
                <option value={RideType.BUSINESS}>{t('rideType.BUSINESS')}</option>
                <option value={RideType.PRIVATE}>{t('rideType.PRIVATE')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Vozidlo</label>
              <select
                value={filterVehicle}
                onChange={(e) => setFilterVehicle(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                className="bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white"
              >
                <option value="ALL">Všechna vozidla</option>
                {vehicles.map(vehicle => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Od data</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Do data</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-400">
              Zobrazeno {filteredLogs.length} záznamů
            </div>
            <div className="flex gap-2">
               <button
                 onClick={exportToCSV}
                 className="flex items-center gap-2 px-4 py-2 bg-[#A3BE8C] hover:bg-[#8FBCBB] text-slate-900 rounded-md transition-colors"
               >
                <DownloadIcon size={16} />
                Export CSV
              </button>
               <button
                 onClick={exportToPDF}
                 className="flex items-center gap-2 px-4 py-2 bg-[#81A1C1] hover:bg-[#5E81AC] text-slate-900 rounded-md transition-colors"
               >
                <DownloadIcon size={16} />
                Export PDF
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-slate-700 rounded-lg p-4 mb-4">
            <h3 className="text-lg font-semibold text-white mb-2">Souhrn</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Služební jízdy:</span>
                <span className="text-white ml-2">{mileageSummary.totalBusinessDistance.toLocaleString()} km</span>
              </div>
              <div>
                <span className="text-gray-400">Soukromé jízdy:</span>
                <span className="text-white ml-2">{mileageSummary.totalPrivateDistance.toLocaleString()} km</span>
              </div>
              <div>
                <span className="text-gray-400">Náklady na palivo:</span>
                <span className="text-white ml-2">{mileageSummary.totalFuelCost.toLocaleString()} Kč</span>
              </div>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Datum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Vozidlo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Řidič</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Zákazník</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Trasa</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Typ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Km</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Účel</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Akce</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const vehicle = vehicles.find(v => v.id === log.vehicleId);
                  const driver = vehicle ? people.find(p => p.id === vehicle.driverId) : null;

                  return (
                    <tr key={log.id} className={`${
                      log.rideType === RideType.BUSINESS ? 'bg-blue-900' : 'bg-green-900'
                    } hover:bg-slate-700`}>
                      <td className="px-4 py-3 text-sm text-white">
                        {new Date(log.timestamp).toLocaleDateString('cs-CZ')}
                        <br />
                        <span className="text-gray-400 text-xs">
                          {new Date(log.timestamp).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {log.vehicleName}
                        <br />
                        <span className="text-gray-400 text-xs">{log.vehicleLicensePlate}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {log.driverName || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {log.customerName}
                        <br />
                        <span className="text-gray-400 text-xs">{log.customerPhone}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white max-w-xs">
                        <div className="truncate" title={log.stops.join(' -> ')}>
                          {log.stops.join(' -> ')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                         <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                           log.rideType === RideType.BUSINESS
                             ? 'bg-slate-700 text-white'
                             : 'bg-slate-700 text-white'
                         }`}>
                          {log.rideType ? t(`rideType.${log.rideType}`) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {log.startMileage && log.endMileage ? (
                          <>
                            {log.startMileage} - {log.endMileage}
                            <br />
                             <span className="text-[#81A1C1] text-xs">
                              {log.distance ? `${log.distance} km` : '-'}
                            </span>
                          </>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-white max-w-xs">
                        <div className="truncate" title={
                          log.rideType === RideType.PRIVATE ? log.purpose : log.businessPurpose
                        }>
                          {log.rideType === RideType.PRIVATE ? log.purpose : log.businessPurpose || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                           <button
                             onClick={() => onEdit(log)}
                             className="text-[#81A1C1] hover:text-[#88C0D0] transition-colors"
                             title="Upravit"
                           >
                            <EditIcon size={16} />
                          </button>
                          <button
                            onClick={() => onDelete(log.id)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                            title="Smazat"
                          >
                            <TrashIcon size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};