import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DispatchFormComponent } from './components/DispatchForm';
import { VehicleStatusTable } from './components/VehicleStatusTable';
import { AssignmentResult } from './components/AssignmentResult';
import { Vehicle, RideRequest, AssignmentResultData, VehicleStatus, VehicleType, ErrorResult, RideLog, RideStatus, LayoutConfig, LayoutItem, Notification, Person, PersonRole, WidgetId, Tariff, FlatRateRule, AssignmentAlternative, MessagingApp, FuelType, FuelPrices, RideType, CompanyInfo, DEFAULT_COMPANY_INFO } from './types';
import { findBestVehicle, generateSms, generateCustomerSms, generateNavigationUrl, geocodeAddress, updateFrequentAddress } from './services/dispatchService';
import { SUPABASE_ENABLED, supabase, supabaseService } from './services/supabaseClient';
import type { SmsMessageRecord } from './services/smsService';
import { sendSms, isSmsGateConfigured } from './services/messagingService';

import { LoadingSpinner } from './components/LoadingSpinner';

import { ShamanIcon, SettingsIcon, PhoneIcon, PriceTagIcon, BarChartIcon, HomeIcon, PlusIcon, ClipboardIcon, LogoutIcon, TrophyIcon } from './components/icons';
import { EditVehicleModal } from './components/EditVehicleModal';
import { RideLogTable } from './components/RideLogTable';
import { AddVehicleModal } from './components/AddVehicleModal';
import { EditRideLogModal } from './components/EditRideLogModal';
import { RideBookModal } from './components/RideBookModal';
import { OpenStreetMap } from './components/OpenStreetMap';
import { ManualAssignmentModal } from './components/ManualAssignmentModal';
import { DashboardWidget } from './components/DashboardWidget';
import { NotificationCenter } from './components/NotificationCenter';
import { ManagePeopleModal } from './components/PhoneDirectoryModal';
import { TariffSettingsModal } from './components/TariffSettingsModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { SmsPreviewModal } from './components/SmsPreviewModal';
import SmsGate from './components/SmsGate';
import { DriverChat } from './components/DriverChat';
import { useTranslation } from './contexts/LanguageContext';
import { SettingsModal } from './components/SettingsModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginModal } from './components/LoginModal';
import { RegisterModal } from './components/RegisterModal';
import { Leaderboard } from './components/Leaderboard';
import { DailyStats } from './components/DailyStats';
import { GamificationModal } from './components/GamificationModal';
import { GamificationService } from './services/gamificationService';


// Initial data for people
const initialPeople: Person[] = [
    { id: 1, name: 'Pavel Osička', phone: '736 168 796', role: PersonRole.Driver },
    { id: 2, name: 'Kuba', phone: '739 355 521', role: PersonRole.Driver },
    { id: 3, name: 'Kamil', phone: '730 635 302', role: PersonRole.Driver },
    { id: 4, name: 'Petr', phone: '720 581 296', role: PersonRole.Driver },
    { id: 5, name: 'Adam', phone: '777 807 874', role: PersonRole.Driver },
    { id: 6, name: 'Honza', phone: '720 758 823', role: PersonRole.Driver },
    { id: 7, name: 'Vlado', phone: '792 892 655', role: PersonRole.Driver },
    { id: 8, name: 'Tomáš', phone: '773 567 403', role: PersonRole.Driver },
    { id: 9, name: 'René', phone: '776 203 667', role: PersonRole.Driver },
    { id: 10, name: 'Katka', phone: '603 172 900', role: PersonRole.Driver },
    { id: 11, name: 'Roman Michl', phone: '770 625 798', role: PersonRole.Management },
    { id: 12, name: 'Tomáš Michl', phone: '728 548 373', role: PersonRole.Management },
    { id: 13, name: 'Jirka', phone: '721 212 124', role: PersonRole.Dispatcher },
    { id: 14, name: 'Misha', phone: '720 581 006', role: PersonRole.Dispatcher },
];

// Initial data for vehicles (empty by default)
const initialVehicles: Vehicle[] = [];

type SortKey = 'timestamp' | 'customerName' | 'startMileage' | 'endMileage' | 'distance' | 'rideType' | 'pickupTime';
type SortDirection = 'asc' | 'desc';

const DEFAULT_LAYOUT: LayoutConfig = [
  // Row 1: dispatch (left), map (top right), driverChat (bottom right)
  { id: 'dispatch', colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 2 },
  { id: 'map', colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
  { id: 'driverChat', colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
  // Row 2: rideLog (left 2/3), vehicles (right 1/3)
  { id: 'rideLog', colStart: 1, colSpan: 2, rowStart: 3, rowSpan: 1 },
  { id: 'vehicles', colStart: 3, colSpan: 1, rowStart: 3, rowSpan: 1 },
];

const DEFAULT_WIDGET_VISIBILITY: Record<WidgetId, boolean> = {
    dispatch: true,
    vehicles: true,
    map: true,
    rideLog: true,
    leaderboard: true,
    smsGate: true,
    dailyStats: true,
    driverChat: true,
};

export const DEFAULT_TARIFF: Tariff = {
  startingFee: 50,
  pricePerKmCar: 40,
  pricePerKmVan: 60,
  flatRates: [
    { id: 1, name: "V rámci Hustopečí", priceCar: 80, priceVan: 120 },
    { id: 2, name: "V rámci Mikulova", priceCar: 100, priceVan: 150 },
    { id: 3, name: "Zaječí - diskotéka Retro", priceCar: 200, priceVan: 300 },
  ],
  timeBasedTariffs: [],
};

export const DEFAULT_FUEL_PRICES: FuelPrices = {
  DIESEL: 37.5,
  PETROL: 38.9,
};


// Helper function for loading from localStorage
const loadFromLocalStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

// Haversine distance calculation
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Main App Component (wrapped with AuthProvider)
const AppContent: React.FC = () => {
  const { t, language } = useTranslation();
  const { user, signOut } = useAuth();

  const [people, setPeople] = useState<Person[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rideLog, setRideLog] = useState<RideLog[]>([]);

  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: SortDirection }>({ key: 'timestamp', direction: 'desc' });
  type SortKey = 'timestamp' | 'customerName' | 'startMileage' | 'endMileage' | 'distance' | 'rideType' | 'pickupTime';
  const [tariff, setTariff] = useState<Tariff>(DEFAULT_TARIFF);

  // Defaults only; actual values are loaded from `supabaseService` (which has local fallback)
  const [fuelPrices, setFuelPrices] = useState<FuelPrices>(DEFAULT_FUEL_PRICES);
  const [smsGateConfig, setSmsGateConfig] = useState({ server: '', username: '', password: '' });

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(DEFAULT_COMPANY_INFO);
  const [locations, setLocations] = useState<Record<string, any>>({});

  const [assignmentResult, setAssignmentResult] = useState<AssignmentResultData | null>(null);
  const [customerSms, setCustomerSms] = useState<string>('');
  const [error, setError] = useState<ErrorResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [editingRideLog, setEditingRideLog] = useState<RideLog | null>(null);
  const [isCreatingRide, setIsCreatingRide] = useState(false);
  const [isRideBookOpen, setIsRideBookOpen] = useState(false);
  const [manualAssignmentDetails, setManualAssignmentDetails] = useState<{rideRequest: RideRequest, vehicle: Vehicle, rideDuration: number, sms: string, estimatedPrice: number, navigationUrl: string} | null>(null);
  const [smsToPreview, setSmsToPreview] = useState<{ sms: string; phone?: string; navigationUrl: string; logId?: string } | null>(null);
  const [scheduledRideToDispatch, setScheduledRideToDispatch] = useState<RideLog | null>(null);

  const [isAiEnabled, setIsAiEnabled] = useState<boolean>(true);

  const [messagingApp, setMessagingApp] = useState<MessagingApp>(MessagingApp.SMS);
  const [preferredNav, setPreferredNav] = useState<'google' | 'waze'>(() => {
    try {
      const saved = loadFromLocalStorage<'google' | 'waze'>('rapid-dispatch-preferred-nav', 'google');
      return saved || 'google';
    } catch {
      return 'google';
    }
  });

  const [cooldown, setCooldown] = useState(0);
  const [smsMessages, setSmsMessages] = useState<any[]>([]);

  const reloadSmsMessages = useCallback(async () => {
    try {
      const sm = await (await import('./services/smsService')).smsService.getMessages();
      setSmsMessages(Array.isArray(sm) ? sm : []);
    } catch (err) {
      console.warn('Could not reload sms messages', err);
    }
  }, []);

  // Reload SMS messages periodically to show incoming messages
  useEffect(() => {
    reloadSmsMessages(); // Initial load
    const interval = setInterval(reloadSmsMessages, 10000); // every 10 seconds
    return () => clearInterval(interval);
  }, [reloadSmsMessages]);

  // Layout and widget visibility remain local-only. Load persisted values but merge with defaults
  const [layout, setLayout] = useState<LayoutConfig>(() => {
    try {
      const saved = loadFromLocalStorage<LayoutConfig>('rapid-dispatch-layout', DEFAULT_LAYOUT || []);
      // Merge defaults for any newly added widgets
      const ids = new Set((saved || []).map(i => i.id));
      const merged = Array.isArray(saved) ? [...saved] : [];
      for (const def of DEFAULT_LAYOUT) {
        if (!ids.has(def.id)) merged.push(def);
      }
      return merged.length > 0 ? merged : DEFAULT_LAYOUT;
    } catch (e) {
      return DEFAULT_LAYOUT;
    }
  });

  const [widgetVisibility, setWidgetVisibility] = useState<Record<WidgetId, boolean>>(() => {
    try {
      const saved = loadFromLocalStorage<Record<WidgetId, boolean>>('rapid-dispatch-widget-visibility', DEFAULT_WIDGET_VISIBILITY as any);
      return { ...DEFAULT_WIDGET_VISIBILITY, ...(saved || {}) } as Record<WidgetId, boolean>;
    } catch (e) {
      return DEFAULT_WIDGET_VISIBILITY;
    }
  });


  // Shared helper to normalize person role strings into the PersonRole enum
  const normalizeRole = (role: string | null | undefined): PersonRole => {
    if (!role || typeof role !== 'string') return PersonRole.Driver;
    return (role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()) as PersonRole;
  };


  const [isEditMode, setIsEditMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [routeToPreview, setRouteToPreview] = useState<string[] | null>(null);
  const [showCompletedRides, setShowCompletedRides] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening' | 'night'>('all');
  const [isPeopleModalOpen, setIsPeopleModalOpen] = useState(false);
  const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Authentication modals
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Gamification modal
   const [isGamificationModalOpen, setIsGamificationModalOpen] = useState(false);

         // Apply modern Nord theme with rotating background
         useEffect(() => {
           const nordBase = 'rgb(46, 52, 64)';
           const nordMid = 'rgb(59, 66, 82)';
           const nordDark = 'rgb(42, 48, 58)';
           const modernGradient = `linear-gradient(135deg, ${nordBase} 0%, ${nordMid} 50%, ${nordDark} 100%)`;

           const backgrounds = [
             new URL('./src/bgr.jpg', import.meta.url).href,
             new URL('./src/bgr2.jpg', import.meta.url).href,
           ];
           let currentIndex = 0;

           const updateBackground = () => {
             document.body.style.background = `url(${backgrounds[currentIndex]}), ${modernGradient}`;
             document.body.style.backgroundSize = 'cover';
             document.body.style.backgroundAttachment = 'fixed';
             document.body.style.backgroundBlendMode = 'overlay';
             document.body.style.transition = 'background 1s ease-in-out';

             document.documentElement.style.background = modernGradient;
             document.documentElement.style.transition = 'background 1s ease-in-out';

             currentIndex = (currentIndex + 1) % backgrounds.length;
           };

           updateBackground(); // Set initial background
           const interval = setInterval(updateBackground, 60 * 60 * 1000); // Change every hour

           return () => clearInterval(interval);
         }, []);


  // Load initial data (Supabase when enabled, otherwise localStorage) and auto-update vehicle statuses
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('📥 Loading data via supabaseService (cloud or local fallback)');
        const [ppl, veh, rl, notif, tf, fp, ci, ms, us, loc] = await Promise.all([
          supabaseService.getPeople().catch(() => []),
          supabaseService.getVehicles().catch(() => []),
          supabaseService.getRideLogs().catch(() => []),
          supabaseService.getNotifications().catch(() => []),
          supabaseService.getTariff().catch(() => DEFAULT_TARIFF),
          supabaseService.getFuelPrices().catch(() => DEFAULT_FUEL_PRICES),
          supabaseService.getCompanyInfo().catch(() => DEFAULT_COMPANY_INFO),
          supabaseService.getMessagingApp().catch(() => MessagingApp.SMS),
          supabaseService.getUserSettings((user as any)?.id || 'local').catch(() => ({ preferred_nav: 'google' })),
          supabaseService.getLocations().catch(() => []),
        ]);

        const normalizeRole = (role: string | null | undefined): PersonRole => {
          if (!role || typeof role !== 'string') return PersonRole.Driver;
          return (role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()) as PersonRole;
        };
        const normalizedPeople = (Array.isArray(ppl) && ppl.length > 0 ? ppl : initialPeople).map((p: Person) => ({ ...p, role: normalizeRole((p as any).role) }));
        setPeople(normalizedPeople);
        setVehicles(Array.isArray(veh) && veh.length > 0 ? veh : initialVehicles);
        setRideLog(Array.isArray(rl) ? rl : []);
        setNotifications(Array.isArray(notif) ? notif : []);
        setTariff(tf || DEFAULT_TARIFF);
        setFuelPrices(fp || DEFAULT_FUEL_PRICES);
        setCompanyInfo(ci || DEFAULT_COMPANY_INFO);
        setMessagingApp((ms as any) || MessagingApp.SMS);
        const latestLocs = (loc as any[]).reduce((acc, l) => {
          const key = l.vehicle_id;
          if (!acc[key] || new Date(l.timestamp) > new Date(acc[key].timestamp)) {
            acc[key] = l;
          }
          return acc;
        }, {} as Record<string, any>);
        setLocations(latestLocs);
        const sgc = localStorage.getItem('sms-gate-config');
        if (sgc) {
          try {
            setSmsGateConfig(JSON.parse(sgc));
          } catch {}
        }
        // load preferred nav if available
        try {
          const us = (ms as any) || {};
        } catch {}
         try {
           const userSettings = (await supabaseService.getUserSettings((user as any)?.id || 'local')) || {};
           setPreferredNav((userSettings.preferred_nav as 'google' | 'waze') || 'google');
           if (userSettings.is_ai_enabled !== undefined) {
             setIsAiEnabled(userSettings.is_ai_enabled);
           }
         } catch (err) {
           // ignore
         }
        // load sms messages as well
        try {
          const sm = await (await import('./services/smsService')).smsService.getMessages();
          setSmsMessages(Array.isArray(sm) ? sm : []);
        } catch (err) {
          console.warn('Could not load sms messages', err);
          setSmsMessages([]);
        }
      } catch (err) {
        console.error('Error loading data via supabaseService:', err);
        const normalizeRole = (role: string | null | undefined): PersonRole => {
          if (!role || typeof role !== 'string') return PersonRole.Driver;
          return (role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()) as PersonRole;
        };
        const normalizedPeople = initialPeople.map(p => ({ ...p, role: normalizeRole(p.role) }));
        setPeople(normalizedPeople);
        setVehicles(initialVehicles);
        setTariff(DEFAULT_TARIFF);
        setSmsMessages([]);
      }
    };
    loadData();

    const interval = setInterval(() => {
      const now = Date.now();
      setVehicles(prevVehicles => {
        let needsUpdate = false;
        const updated = prevVehicles.map(v => {
          if ((v.status === VehicleStatus.Busy || v.status === VehicleStatus.OutOfService) && v.freeAt && v.freeAt < now) {
            needsUpdate = true;
            return { ...v, status: VehicleStatus.Available, freeAt: undefined };
          }
          return v;
        });
        return needsUpdate ? updated : prevVehicles;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Real-time subscription for vehicle status changes (from driver app)
  useEffect(() => {
    if (!SUPABASE_ENABLED) return;

    const vehicleChannel = supabase
      .channel('vehicle_status_changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vehicles'
      }, (payload) => {
        const updatedVehicle = payload.new;
        console.log('Vehicle status changed:', updatedVehicle);

        setVehicles(prevVehicles =>
          prevVehicles.map(v =>
            v.id === updatedVehicle.id
              ? {
                  ...v,
                  status: updatedVehicle.status,
                  location: updatedVehicle.location || v.location,
                  updated_at: updatedVehicle.updated_at
                }
              : v
          )
        );
      })
      .subscribe();

    // Real-time subscription for location updates
    const locationsChannel = supabase
      .channel('locations_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'locations'
      }, (payload) => {
        const newLocation = payload.new;
        setLocations(prev => ({
          ...prev,
          [newLocation.vehicle_id]: newLocation
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(vehicleChannel);
      supabase.removeChannel(locationsChannel);
    };
  }, []);

      // --- Sync state changes to Supabase when enabled, otherwise keep localStorage ---




      useEffect(() => {
        const save = async () => {
          try {
            await supabaseService.updateRideLogs(rideLog);
          } catch (err) {
            console.error('Error saving ride logs via supabaseService', err);
          }
        };
        save();
      }, [rideLog]);

      useEffect(() => {
        const save = async () => {
          try {
            await supabaseService.updateNotifications(notifications);
          } catch (err) {
            console.error('Error saving notifications via supabaseService', err);
          }
        };
        save();
      }, [notifications]);

      useEffect(() => {
        const save = async () => {
          try {
            await supabaseService.updateTariff(tariff);
          } catch (err) {
            console.error('Error saving tariff via supabaseService', err);
          }
        };
        save();
      }, [tariff]);

      useEffect(() => {
        const save = async () => {
          try {
            await supabaseService.updateCompanyInfo(companyInfo);
          } catch (err) {
            console.error('Error saving company info via supabaseService', err);
          }
        };
        save();
      }, [companyInfo]);

      useEffect(() => {
        const save = async () => {
          try {
            if (user && (user as any).id) {
              await supabaseService.updateUserSettings(String((user as any).id), { is_ai_enabled: isAiEnabled });
            } else {
              // Use a 'local' user settings record in the service local fallback
              await supabaseService.updateUserSettings('local', { is_ai_enabled: isAiEnabled }).catch(() => {});
            }
          } catch (err) {
            console.error('Error saving AI setting via supabaseService', err);
          }
        };
        save();
      }, [isAiEnabled, user]);

      useEffect(() => {
        const save = async () => {
          try {
            await supabaseService.updateMessagingApp(messagingApp as any);
          } catch (err) {
            console.error('Error saving messaging app via supabaseService', err);
          }
        };
        save();
      }, [messagingApp]);

      useEffect(() => {
        const save = async () => {
          try {
            if (user && (user as any).id) {
              await supabaseService.updateUserSettings(String((user as any).id), { preferred_nav: preferredNav });
            } else {
              await supabaseService.updateUserSettings('local', { preferred_nav: preferredNav }).catch(() => {});
            }
          } catch (err) {
            console.error('Error saving preferred nav via supabaseService', err);
          }
        };
        save();
      }, [preferredNav, user]);

      useEffect(() => {
        const save = async () => {
          try {
            await supabaseService.updateFuelPrices(fuelPrices);
          } catch (err) {
            console.error('Error saving fuel prices via supabaseService', err);
          }
        };
        save();
      }, [fuelPrices]);

     // Save widget visibility to localStorage
     useEffect(() => {
       localStorage.setItem('rapid-dispatch-widget-visibility', JSON.stringify(widgetVisibility));
     }, [widgetVisibility]);

      // Save layout to localStorage
      useEffect(() => {
        localStorage.setItem('rapid-dispatch-layout', JSON.stringify(layout));
      }, [layout]);

  // Continuous synchronization every 1 minute (fetch and save)
  useEffect(() => {
    if (!SUPABASE_ENABLED || !user) return;

    const syncData = async () => {
      try {
        console.log('🔄 Starting continuous sync (save only) with Supabase...');

        await Promise.all([
          supabaseService.updatePeople(people).catch(err => console.warn('Failed to sync people:', err)),
          supabaseService.updateVehicles(vehicles, { excludeStatus: true }).catch(err => console.warn('Failed to sync vehicles (without status):', err)),
          supabaseService.updateRideLogs(rideLog).catch(err => console.warn('Failed to sync ride logs:', err)),
          supabaseService.updateNotifications(notifications).catch(err => console.warn('Failed to sync notifications:', err)),
          supabaseService.updateTariff(tariff).catch(err => console.warn('Failed to sync tariff:', err)),
          supabaseService.updateFuelPrices(fuelPrices).catch(err => console.warn('Failed to sync fuel prices:', err)),
          supabaseService.updateCompanyInfo(companyInfo).catch(err => console.warn('Failed to sync company info:', err)),
          supabaseService.updateMessagingApp(messagingApp as any).catch(err => console.warn('Failed to sync messaging app:', err)),
          supabaseService.updateSmsMessages(smsMessages).catch(err => console.warn('Failed to sync SMS messages:', err)),
        ]);

        console.log('✅ Continuous sync (save only) completed successfully');
      } catch (err) {
        console.warn('⚠️ Continuous sync failed, will retry in 1 minute:', err);
        // Don't show error to user, just log it
      }
    };

    // Run initial sync after 5 seconds, then every 60 seconds
    const initialTimeout = setTimeout(syncData, 5000);
    const interval = setInterval(syncData, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [user]); // Only depend on user to restart when auth changes

   // Notification System Effect
   useEffect(() => {
     const checkNotifications = () => {
         const now = Date.now();
         const newNotifications: Notification[] = [];

         rideLog.forEach(log => {
             // Reminder for scheduled rides
             if (log.status === RideStatus.Scheduled) {
                  try {
                     const pickupTimestamp = new Date(log.pickupTime).getTime();
                     const minutesToPickup = (pickupTimestamp - now) / (1000 * 60);

                     const reminder15Id = `reminder-15-${log.id}`;
                     if (minutesToPickup <= 15 && minutesToPickup > 14 && !notifications.some(n => n.id === reminder15Id)) {
                         newNotifications.push({ id: reminder15Id, type: 'reminder', titleKey: 'notifications.scheduledRide.title', messageKey: 'notifications.scheduledRide.message15', messageParams: { customerName: log.customerName, pickupAddress: log.stops[0] || '' }, timestamp: now, rideLogId: log.id });
                     }
                     const reminder5Id = `reminder-5-${log.id}`;
                     if (minutesToPickup <= 5 && minutesToPickup > 4 && !notifications.some(n => n.id === reminder5Id)) {
                          newNotifications.push({ id: reminder5Id, type: 'reminder', titleKey: 'notifications.scheduledRide.title', messageKey: 'notifications.scheduledRide.message5', messageParams: { customerName: log.customerName, pickupAddress: log.stops[0] || '' }, timestamp: now, rideLogId: log.id });
                     }
                 } catch(e) {
                   console.error("Could not parse schedule time for notification", e)
                 }
             }



             // Timeout for unaccepted pending rides
             if (log.status === RideStatus.Pending) {
                 const minutesSinceAssignment = (now - log.timestamp) / (1000 * 60);
                 if (minutesSinceAssignment >= 5) {
                     // Auto-cancel the ride
                     handleUpdateRideLog({ ...log, status: RideStatus.Cancelled });
                     newNotifications.push({
                         id: `timeout-${log.id}`,
                         type: 'delay',
                         titleKey: 'notifications.rideTimeout.title',
                         messageKey: 'notifications.rideTimeout.message',
                         messageParams: { customerName: log.customerName, driverName: log.driverName || 'N/A' },
                         timestamp: now,
                         rideLogId: log.id
                     });
                 }
             }
         });

         if (newNotifications.length > 0) {
             setNotifications(prev => [...prev, ...newNotifications.filter(nn => !prev.some(p => p.id === nn.id))]);
         }
     };

     const interval = setInterval(checkNotifications, 10000);
     return () => clearInterval(interval);
   }, [rideLog, notifications]);

  // --- Handlers ---
  const handleScheduleRide = useCallback((rideRequest: RideRequest) => {
        const newLog: RideLog = {
          id: crypto.randomUUID(),
        timestamp: Date.now(),
        vehicleName: null,
        vehicleLicensePlate: null,
        driverName: null,
        vehicleType: null,
        customerName: rideRequest.customerName,
        rideType: RideType.BUSINESS, // Default to business ride
        customerPhone: rideRequest.customerPhone,
        stops: rideRequest.stops,
        passengers: rideRequest.passengers,
        pickupTime: rideRequest.pickupTime,
         status: RideStatus.Scheduled,
         vehicleId: null,
         notes: rideRequest.notes,
        estimatedPrice: undefined,
        estimatedPickupTimestamp: new Date(rideRequest.pickupTime).getTime(),
        estimatedCompletionTimestamp: undefined,
    };

    setRideLog(prev => [newLog, ...prev]);
    alert(t('notifications.rideScheduled'));
  }, [t]);

  const handleSubmitDispatch = useCallback(async (rideRequest: RideRequest, optimize: boolean) => {
    setIsLoading(true);
    setError(null);
    setAssignmentResult(null);
    setCustomerSms('');
    
    try {
        const result = await findBestVehicle(rideRequest, vehicles, isAiEnabled, tariff, language, optimize);
        if ('messageKey' in result) {
          setError(result);
        } else {
          setAssignmentResult(result);
        }
      } catch (e: any) {
        setError({ messageKey: "error.unknown", message: e.message || "An unknown error occurred." });
    } finally {
      setIsLoading(false);
      // Removed cooldown to allow immediate new ride submissions
    }
  }, [vehicles, isAiEnabled, tariff, language]);
  
  const getDriverName = (driverId: number | null) => {
    return people.find(p => p.id === driverId)?.name || t('general.unassigned');
  };
  
  const calculateFuelCost = useCallback((vehicle: Vehicle, distanceKm: number): number | undefined => {
    if (vehicle.fuelType && vehicle.fuelConsumption && vehicle.fuelConsumption > 0) {
      const price = fuelPrices[vehicle.fuelType];
      const cost = (distanceKm / 100) * vehicle.fuelConsumption * price;
      return Math.round(cost);
    }
    return undefined;
  }, [fuelPrices]);



  const handleConfirmAssignment = useCallback(async (option: AssignmentAlternative) => {
      const { rideRequest, rideDuration, optimizedStops } = assignmentResult!;
      const chosenVehicle = option.vehicle;
      const finalStops = optimizedStops || rideRequest.stops;
      const destination = finalStops[finalStops.length - 1];

      const alternative = assignmentResult!.alternatives.find(a => a.vehicle.id === chosenVehicle.id) || assignmentResult;
      const durationInMinutes = (rideDuration ? alternative.eta + rideDuration : alternative.eta + 30) + 5; // Add 5 min buffer
      const freeAt = Date.now() + durationInMinutes * 60 * 1000;

      // Calculate total distance including from vehicle location to first stop
      let totalDistance = 0;
      try {
        const vehicleCoords = await geocodeAddress(chosenVehicle.location, language);
        const stopCoords = await Promise.all(finalStops.map(s => geocodeAddress(s, language)));
        if (stopCoords.length > 0) {
          totalDistance += haversineDistance(vehicleCoords.lat, vehicleCoords.lon, stopCoords[0].lat, stopCoords[0].lon);
          for (let i = 1; i < stopCoords.length; i++) {
            totalDistance += haversineDistance(stopCoords[i-1].lat, stopCoords[i-1].lon, stopCoords[i].lat, stopCoords[i].lon);
          }
        }
      } catch (err) {
        console.error('Error calculating total distance:', err);
        totalDistance = assignmentResult?.rideDistance || 0;
      }
      const fuelCost = totalDistance ? calculateFuelCost(chosenVehicle, totalDistance) : undefined;

        // Don't change vehicle status yet - wait for driver to accept

     if (!isAiEnabled) {
         try {
             const vehicleLocationCoords = await geocodeAddress(chosenVehicle.location, language);
             const stopCoords = await Promise.all(finalStops.map(s => geocodeAddress(s, language)));
             const longNavigationUrl = generateNavigationUrl(vehicleLocationCoords, stopCoords);
             const navigationUrl = longNavigationUrl;

             setManualAssignmentDetails({
                 rideRequest: assignmentResult!.rideRequest,
                 vehicle: chosenVehicle,
                 rideDuration: rideDuration || 30,
           sms: generateSms({ ...assignmentResult!.rideRequest, stops: finalStops }, t, navigationUrl, preferredNav),
                 estimatedPrice: option.estimatedPrice,
                 navigationUrl: navigationUrl,
             });
         } catch (err: any) {
             setError({ messageKey: "error.geocodingFailed", message: err.message });
         }
         return;
     }

        const newLog: RideLog = {
          id: `ride-${Date.now()}`,
          timestamp: new Date().toISOString(),
         vehicleName: chosenVehicle.name,
         vehicleLicensePlate: chosenVehicle.licensePlate,
         driverName: getDriverName(chosenVehicle.driverId),
         vehicleType: chosenVehicle.type,
         customerName: rideRequest.customerName,
         rideType: RideType.BUSINESS, // Default to business ride
         customerPhone: rideRequest.customerPhone,
         stops: finalStops,
         passengers: rideRequest.passengers,
         pickupTime: rideRequest.pickupTime,
         status: RideStatus.Pending, // Start as pending until driver accepts
         vehicleId: chosenVehicle.id,
         notes: rideRequest.notes,
         estimatedPrice: alternative.estimatedPrice,
          estimatedPickupTimestamp: new Date(Date.now() + alternative.eta * 60 * 1000).toISOString(),
          estimatedCompletionTimestamp: new Date(Date.now() + durationInMinutes * 60 * 1000).toISOString(),
         fuelCost: fuelCost,
         distance: totalDistance,
       };

      // Generate customer SMS for the assigned vehicle
      const driverName = people.find(p => p.id === chosenVehicle.driverId)?.name || 'Neznámý';
      const generatedCustomerSms = generateCustomerSms(chosenVehicle, alternative.eta, driverName);
      setCustomerSms(generatedCustomerSms);

        setRideLog(prev => [newLog, ...prev]);
        setAssignmentResult(null);

        // Ride is automatically sent to driver app via real-time subscription

        // Automatically open SMS modal for the customer
       handleSendSms(newLog.id);
   }, [assignmentResult, isAiEnabled, people, t, language, calculateFuelCost]);
  
  const handleManualAssignmentConfirm = async (durationInMinutes: number) => {
       if (!manualAssignmentDetails) return;

       const { rideRequest, vehicle, estimatedPrice } = manualAssignmentDetails;
       const finalStops = assignmentResult?.optimizedStops || rideRequest.stops;
       const destination = finalStops[finalStops.length - 1];

       // Calculate total distance including from vehicle location to first stop
       let totalDistance = 0;
       try {
         const vehicleCoords = await geocodeAddress(vehicle.location, language);
         const stopCoords = await Promise.all(finalStops.map(s => geocodeAddress(s, language)));
         if (stopCoords.length > 0) {
           totalDistance += haversineDistance(vehicleCoords.lat, vehicleCoords.lon, stopCoords[0].lat, stopCoords[0].lon);
           for (let i = 1; i < stopCoords.length; i++) {
             totalDistance += haversineDistance(stopCoords[i-1].lat, stopCoords[i-1].lon, stopCoords[i].lat, stopCoords[i].lon);
           }
         }
       } catch (err) {
         console.error('Error calculating total distance:', err);
         totalDistance = assignmentResult?.rideDistance || 0;
       }
       const fuelCost = totalDistance ? calculateFuelCost(vehicle, totalDistance) : undefined;

      // Calculate ETA more robustly
      let eta = 5; // Default 5 minutes if calculation fails
      if (assignmentResult) {
        // Check if this vehicle was the originally suggested one
        if (assignmentResult.vehicle.id === vehicle.id) {
          eta = assignmentResult.eta;
        } else {
          // Check if it's in alternatives
          const alternative = assignmentResult.alternatives.find(a => a.vehicle.id === vehicle.id);
          eta = alternative?.eta ?? assignmentResult.eta ?? 5; // Fall back to original eta or 5 min
        }
      }
      const totalBusyTime = eta + durationInMinutes + 5; // Add 5 min buffer
      const freeAt = Date.now() + totalBusyTime * 60 * 1000;
      const rideDistance = assignmentResult?.rideDistance;

      // Generate customer SMS for the manually chosen vehicle
      const driverName = people.find(p => p.id === vehicle.driverId)?.name || 'Neznámý';
      const generatedCustomerSms = generateCustomerSms(vehicle, eta, driverName);
      setCustomerSms(generatedCustomerSms);

      const updatedVehicles = vehicles.map(v => v.id === vehicle.id ? { ...v, status: VehicleStatus.Busy, freeAt, location: destination } : v);
      setVehicles(updatedVehicles);

      // Ensure vehicle update is saved to database immediately
      supabaseService.updateVehicles(updatedVehicles).catch(err => console.error('Error saving vehicle update', err));

          const newLog: RideLog = {
          id: crypto.randomUUID(),
        timestamp: Date.now(),
        vehicleName: vehicle.name,
        vehicleLicensePlate: vehicle.licensePlate,
        driverName: getDriverName(vehicle.driverId),
        vehicleType: vehicle.type,
        rideType: RideType.BUSINESS, // Default to business ride
        customerName: rideRequest.customerName,
        customerPhone: rideRequest.customerPhone,
        stops: finalStops,
        passengers: rideRequest.passengers,
        pickupTime: rideRequest.pickupTime,
         status: RideStatus.InProgress,
         vehicleId: vehicle.id,
         notes: rideRequest.notes,
        estimatedPrice: estimatedPrice,
          estimatedPickupTimestamp: new Date(Date.now() + (eta * 60 * 1000)).toISOString(),
          estimatedCompletionTimestamp: new Date(Date.now() + totalBusyTime * 60 * 1000).toISOString(),
         fuelCost: fuelCost,
         distance: totalDistance,
      };

      setRideLog(prev => [newLog, ...prev]);
      setAssignmentResult(null);
      setManualAssignmentDetails(null);

      // Automatically open SMS modal for the new ride
      handleSendSms(newLog.id);
  };

  const handleClearResult = useCallback(() => {
    setAssignmentResult(null);
    setCustomerSms('');
    setError(null);
  }, []);
  
  const handleRoutePreview = useCallback((stops: string[]) => {
    if (stops.length >= 2 && stops.every(s => s.trim())) {
      setRouteToPreview(stops);
    } else {
      setRouteToPreview(null);
    }
  }, []);

  const handleUpdateVehicle = async (updatedVehicle: Vehicle) => {
    const updatedVehicles = vehicles.map(v => v.id === updatedVehicle.id ? updatedVehicle : v);
    try {
      await supabaseService.updateVehicles(updatedVehicles);
      setVehicles(updatedVehicles);
    } catch (err) {
      console.error('Failed to save vehicle changes', err);
      alert('Failed to save vehicle changes. Please try again.');
      return;
    }
    setEditingVehicle(null);
  };
  
  const handleDeleteVehicle = async (vehicleId: number) => {
    // Clean up ride logs that reference this vehicle
    const updatedRideLog = rideLog.map(log =>
      log.vehicleId === vehicleId
        ? { ...log, vehicleId: null, vehicleName: null, vehicleLicensePlate: null, vehicleType: null, driverName: null }
        : log
    );
    const updatedVehicles = vehicles.filter(v => v.id !== vehicleId);
    try {
      await Promise.all([
        supabaseService.deleteVehicle(vehicleId),
        supabaseService.updateRideLogs(updatedRideLog),
      ]);
      setRideLog(updatedRideLog);
      setVehicles(updatedVehicles);
    } catch (err) {
      console.error('Failed to delete vehicle', err);
      alert('Failed to delete vehicle. Please try again.');
      return;
    }
    setEditingVehicle(null);
  };

  const handleAddVehicle = async (newVehicleData: Omit<Vehicle, 'id' | 'freeAt' | 'driverId'>) => {
    const newVehicle: Vehicle = {
      ...newVehicleData,
      id: Date.now(), // Simple ID generation
      driverId: null,
      freeAt: undefined,
    };
    const updatedVehicles = [...vehicles, newVehicle];
    try {
      await supabaseService.updateVehicles(updatedVehicles);
      setVehicles(updatedVehicles);
    } catch (err) {
      console.error('Failed to add vehicle', err);
      alert('Failed to add vehicle. Please try again.');
      return;
    }
    setIsAddingVehicle(false);
  };
  
  const handleAddPerson = async (person: Omit<Person, 'id'>) => {
    const newPerson: Person = {
      ...person,
      id: Date.now(), // Simple ID generation
    };
    const updatedPeople = [...people, newPerson];
    try {
      await supabaseService.updatePeople(updatedPeople);
      setPeople(updatedPeople);
    } catch (err) {
      console.error('Failed to add person', err);
      alert('Failed to add person. Please try again.');
    }
  };

  const handleUpdatePerson = async (updatedPerson: Person) => {
    const updatedPeople = people.map(p => p.id === updatedPerson.id ? updatedPerson : p);
    try {
      await supabaseService.updatePeople(updatedPeople);
      setPeople(updatedPeople);
    } catch (err) {
      console.error('Failed to update person', err);
      alert('Failed to update person. Please try again.');
    }
  };
  
  const handleDeletePerson = async (personId: number) => {
    if (window.confirm(t('people.confirmDelete'))) {
      try {
        await supabaseService.deletePerson(personId);
        setPeople(prev => prev.filter(p => p.id !== personId));
        // Unassign this person from any vehicle they are driving
        const updatedVehicles = vehicles.map(v => v.driverId === personId ? { ...v, driverId: null } : v);
        await supabaseService.updateVehicles(updatedVehicles);
        setVehicles(updatedVehicles);
      } catch (err) {
        console.error('Failed to delete person', err);
        alert('Failed to delete person. Please try again.');
      }
    }
  };

  const handleConfirmScheduledDispatch = () => {
    if (!scheduledRideToDispatch) return;

    const updatedLog = scheduledRideToDispatch;

    // Update ride log state
    setRideLog(prev => prev.map(log => log.id === updatedLog.id ? updatedLog : log));

    // Update vehicle status
    if (updatedLog.vehicleId) {
            setVehicles(prev => prev.map(v => v.id === updatedLog.vehicleId ? { ...v, status: VehicleStatus.Busy, freeAt: typeof updatedLog.estimatedCompletionTimestamp === 'string' ? new Date(updatedLog.estimatedCompletionTimestamp).getTime() : updatedLog.estimatedCompletionTimestamp } : v));
    }
    // Do NOT auto-send SMS; open preview and let dispatcher confirm send if desired

    // Clean up state
    setSmsToPreview(null);
    setScheduledRideToDispatch(null);
    setIsRideBookOpen(true); // Re-open ride book after confirming dispatch
  };

  const handleCancelScheduledDispatch = () => {
      setSmsToPreview(null);
      setScheduledRideToDispatch(null);
      setIsRideBookOpen(true); // Re-open ride book after canceling
  };

  const handleAddRideClick = () => {
    setIsCreatingRide(true);
  };

  const createDefaultRideLog = (): RideLog => ({
    id: '',
    timestamp: Date.now(),
    vehicleName: null,
    vehicleLicensePlate: null,
    driverName: null,
    vehicleType: null,
    customerName: '',
    customerPhone: '',
    stops: [''],
    pickupTime: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
     status: RideStatus.Scheduled,
     vehicleId: null,
     passengers: 1,
    notes: '',
    rideType: RideType.PRIVATE,
  });

  const handleCreateRideLog = async (newLog: RideLog) => {
    try {
      await supabaseService.addRideLog(newLog);
      setRideLog(prev => [...prev, newLog]);
    } catch (err) {
      console.error('Failed to save new ride log', err);
      alert('Failed to save new ride. Please try again.');
      return;
    }
    setIsCreatingRide(false);
    setIsRideBookOpen(true); // Re-open ride book after creating
  };

  const handleUpdateRideLog = async (updatedLog: RideLog) => {
    const originalLog = rideLog.find(log => log.id === updatedLog.id);

    // Calculate estimates for scheduled rides when vehicle is assigned
    if (updatedLog.status === RideStatus.Scheduled && updatedLog.vehicleId && updatedLog.stops.length > 0 && !updatedLog.estimatedCompletionTimestamp) {
      try {
        const vehicle = vehicles.find(v => v.id === updatedLog.vehicleId);
        if (vehicle) {
          const vehicleCoords = await geocodeAddress(vehicle.location, language);
          const stopCoords = await Promise.all(updatedLog.stops.map(s => geocodeAddress(s, language)));
          const totalDistance = stopCoords.reduce((dist, coord, i) => {
            if (i === 0) return 0;
            const prev = stopCoords[i-1];
            return dist + haversineDistance(prev.lat, prev.lon, coord.lat, coord.lon);
          }, 0);
          const duration = Math.max(30, Math.round(totalDistance * 2 + (stopCoords.length - 1) * 10)) + 5; // 2 min per km + 10 min per stop + 5 min buffer
           updatedLog.estimatedCompletionTimestamp = new Date(Date.now() + duration * 60 * 1000).toISOString();
          const pricePerKm = vehicle.type === VehicleType.Van ? tariff.pricePerKmVan : tariff.pricePerKmCar;
          updatedLog.estimatedPrice = tariff.startingFee + Math.round(totalDistance * pricePerKm);
          updatedLog.distance = totalDistance;
          // Fuel cost
          if (vehicle.fuelType && vehicle.fuelConsumption) {
            const fuelPrice = fuelPrices[vehicle.fuelType];
            updatedLog.fuelCost = Math.round((totalDistance / 100) * vehicle.fuelConsumption * fuelPrice);
          }
        }
      } catch (err) {
        console.error('Failed to calculate estimates for scheduled ride:', err);
      }
    }

    // Intercept dispatching of a scheduled ride to show confirmation modal first
    if (originalLog && originalLog.status === RideStatus.Scheduled && updatedLog.status === RideStatus.InProgress && updatedLog.vehicleId) {
        const assignedVehicle = vehicles.find(v => v.id === updatedLog.vehicleId);
        const driver = people.find(p => p.id === assignedVehicle?.driverId);
        const driverNav = driver?.navigationApp || preferredNav;
        const phone = assignedVehicle?.phone || driver?.phone;
        if (!phone) {
          alert(t('smsPreview.noPhoneNumber'));
          setEditingRideLog(null);
          setIsRideBookOpen(true);
          return;
        }
        let navigationUrl = 'https://maps.google.com';
        try {
            if (assignedVehicle) {
                const vehicleCoords = await geocodeAddress(assignedVehicle.location, language);
                const stopCoords = await Promise.all(updatedLog.stops.map(s => geocodeAddress(s, language)));
                const longNavigationUrl = generateNavigationUrl(vehicleCoords, stopCoords, driverNav);
                navigationUrl = longNavigationUrl;
            }
        } catch (err: any) {
            console.error("Could not generate nav url for scheduled ride dispatch", err);
            setError({ messageKey: "error.geocodingFailed", message: err.message });
            setEditingRideLog(null);
            setIsRideBookOpen(true); // Re-open ride book on error
            return;
        }

        const smsText = generateSms(updatedLog, t, navigationUrl, driverNav);

        setSmsToPreview({
            sms: smsText,
            phone: phone,
            navigationUrl: navigationUrl,
        });
        setScheduledRideToDispatch(updatedLog); // Store the pending update
        setEditingRideLog(null); // Close the edit modal
        // Don't re-open ride book here, wait for confirmation
        return; // Wait for user confirmation
    }

    // For all other updates, save first then apply
    try {
      await supabaseService.addRideLog(updatedLog);
    } catch (err) {
      console.error('Failed to save ride log update', err);
      alert('Failed to save ride status change. Please try again.');
      return;
    }

    setRideLog(prev => prev.map(log => log.id === updatedLog.id ? updatedLog : log));

    if (originalLog && originalLog.status !== updatedLog.status && updatedLog.vehicleId) {
        // Send notification message to driver about status change
        sendStatusChangeMessageToDriver(updatedLog, originalLog.status);

        if (updatedLog.status === RideStatus.Completed || updatedLog.status === RideStatus.Cancelled) {
            setVehicles(prev => prev.map(v => (v.id === updatedLog.vehicleId && v.status === VehicleStatus.Busy) ? { ...v, status: VehicleStatus.Available, freeAt: undefined } : v));

            // Trigger gamification scoring when ride is completed
            if (updatedLog.status === RideStatus.Completed && updatedLog.driverName) {
                const driver = people.find(p => p.name === updatedLog.driverName);
                if (driver) {
                    GamificationService.calculateDriverScore(driver.id, driver.name).catch(err =>
                        console.warn('Failed to calculate driver score:', err)
                    );
                }
            }
        } else if (updatedLog.status === RideStatus.Accepted) {
        setVehicles(prev => prev.map(v => v.id === updatedLog.vehicleId ? { ...v, status: VehicleStatus.Busy, freeAt: typeof updatedLog.estimatedCompletionTimestamp === 'string' ? new Date(updatedLog.estimatedCompletionTimestamp).getTime() : updatedLog.estimatedCompletionTimestamp } : v));
        }
    }

    setEditingRideLog(null);
  };

  const sendStatusChangeMessageToDriver = async (updatedLog: RideLog, oldStatus: RideStatus) => {
    try {
      if (!updatedLog.vehicleId) return;

      let message = '';
      if (updatedLog.status === RideStatus.Cancelled) {
        message = `❌ Jízda zrušena dispečerem\n\nZákazník: ${updatedLog.customerName}\nTrasa: ${updatedLog.stops[0]} → ${updatedLog.stops[updatedLog.stops.length - 1]}\n\nDůvod: Zrušeno dispečerem`;
      } else if (updatedLog.status === RideStatus.Completed) {
        message = `✅ Jízda dokončena\n\nZákazník: ${updatedLog.customerName}\nTrasa: ${updatedLog.stops[0]} → ${updatedLog.stops[updatedLog.stops.length - 1]}\n\nDěkujeme za dokončení jízdy!`;
      } else if (updatedLog.status === RideStatus.Accepted && oldStatus === RideStatus.Pending) {
        message = `📋 Jízda potvrzena dispečerem\n\nZákazník: ${updatedLog.customerName}\nTrasa: ${updatedLog.stops[0]} → ${updatedLog.stops[updatedLog.stops.length - 1]}\n\nPokračujte podle plánu.`;
      }

      if (message) {
        const { error } = await supabase
          .from('driver_messages')
          .insert({
            sender_id: 'dispatcher',
            receiver_id: `driver_${updatedLog.vehicleId}`,
            message: message,
            read: false
          });

        if (error) {
          console.error('Error sending status change message to driver:', error);
        } else {
          console.log('Status change message sent to driver');
        }
      }
    } catch (error) {
      console.error('Error in sendStatusChangeMessageToDriver:', error);
    }
  };

  const handleSendSms = async (logId: string) => {
    const log = rideLog.find(l => l.id === logId);
    if (!log) return;

    const vehicle = vehicles.find(v => v.id === log.vehicleId);
    if (!vehicle) {
      alert(t('smsPreview.noVehicleAssigned'));
      return;
    }

    const driver = people.find(p => p.id === vehicle.driverId);

    const driverNav = driver?.navigationApp || preferredNav;
    const phone = vehicle.phone || driver?.phone;
    if (!phone) {
      alert(t('smsPreview.noPhoneNumber'));
      return;
    }

    try {
    const vehicleCoords = await geocodeAddress(vehicle.location, language);
    const stopCoords = await Promise.all(log.stops.map(s => geocodeAddress(s, language)));
    const navigationUrl = generateNavigationUrl(vehicleCoords, stopCoords, driverNav);

    const smsText = generateSms(log, t, navigationUrl, driverNav);

    setSmsToPreview({
      sms: smsText,
      phone: phone,
      navigationUrl: navigationUrl,
      logId: log.id,
    });
    } catch (err: any) {
      console.error("Could not generate SMS for ride", err);
      setError({ messageKey: "error.geocodingFailed", message: err.message });
    }
  };

  const handleDeleteRideLog = async (logId: string) => {
    if (window.confirm(t('rideLog.confirmDelete'))) {
      setRideLog(prev => prev.filter(log => log.id !== logId));
      if (SUPABASE_ENABLED) {
        try {
          await supabaseService.deleteRideLog(logId);
        } catch (err) {
          console.error('Failed to delete ride log from supabase:', err);
        }
      }
    }
  };

  const handleSmsGateConfigChange = async (newConfig: typeof smsGateConfig) => {
    setSmsGateConfig(newConfig);
    localStorage.setItem('sms-gate-config', JSON.stringify(newConfig));
    try {
      await fetch('http://localhost:3001/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
    } catch (err) {
      console.error('Failed to save SMS gate config:', err);
    }
  };

  // Explicit send via gateway - dispatcher confirms
  const handleSendSmsViaGateway = async (logId?: string) => {
    try {
      // prefer explicit logId; if not provided, use scheduledRideToDispatch or smsToPreview.logId
      const id = logId || smsToPreview?.logId || scheduledRideToDispatch?.id;
      if (!id) {
        alert(t('smsPreview.noRideSelected'));
        return;
      }
      const log = rideLog.find(l => l.id === id);
      if (!log) {
        alert(t('smsPreview.noRideSelected'));
        return;
      }

      const vehicle = vehicles.find(v => v.id === log.vehicleId);
      if (!vehicle) {
        alert(t('smsPreview.noVehicleAssigned'));
        return;
      }

      const driver = people.find(p => p.id === vehicle.driverId);
      if (!driver || !driver.phone) {
        alert(t('smsPreview.noDriverAssigned'));
        return;
      }

      const cleanPhone = driver.phone.replace(/\s/g, '');

      // Use sms text from smsToPreview if available, otherwise regenerate
      let smsText = smsToPreview?.sms;
      if (!smsText) {
        const vehicleCoords = await geocodeAddress(vehicle.location, language);
        const stopCoords = await Promise.all(log.stops.map(s => geocodeAddress(s, language)));
        const navigationUrl = generateNavigationUrl(vehicleCoords, stopCoords);
        smsText = generateSms(log, t, navigationUrl);
      }

      if (!isSmsGateConfigured()) {
        alert(t('smsPreview.gatewayNotConfigured'));
        return;
      }

       const res = await sendSms([cleanPhone], smsText || '');
       if (res.success) {
         alert(t('smsPreview.sentSuccess'));
        try {
          const { smsService } = await import('./services/smsService');
          const rec: SmsMessageRecord = {
            id: `sms-${Date.now()}`,
            timestamp: Date.now(),
            direction: 'outgoing',
            rideLogId: id,
            to: cleanPhone,
            text: smsText || '',
            status: 'sent',
          };
          await smsService.saveOutgoing(rec);
          setSmsMessages(prev => [rec, ...prev]);
        } catch (err) {
          console.error('Could not persist outgoing SMS', err);
        }
      } else {
        console.error('SMS send failed', res.error);
        alert(t('smsPreview.sentFailed'));
      }
    } catch (err: any) {
      console.error('Error sending SMS via gateway', err);
      alert(t('smsPreview.sentFailed'));
    }
  };
  
  const handleRideStatusChange = (logId: string, newStatus: RideStatus) => {
    const logToUpdate = rideLog.find(log => log.id === logId);
    if (logToUpdate) {
      handleUpdateRideLog({ ...logToUpdate, status: newStatus });
    }
  };


  
  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };
  
  const handleLayoutChange = (updatedItem: LayoutItem) => {
    setLayout(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };
  
  const resetLayout = () => {
    if(window.confirm(t('settings.layout.confirmReset'))) setLayout(DEFAULT_LAYOUT);
  };

  const handleSaveData = () => {
    const dataToSave = { vehicles, rideLog, people, tariff, messagingApp, fuelPrices, companyInfo };
    const jsonString = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapid-dispatch-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (rideLog.length > 0 && window.confirm(t('notifications.clearHistoryAfterExport'))) {
        setRideLog([]);
    }
  };

  const escapeCsvCell = (cell: any): string => {
    if (cell === null || cell === undefined) {
        return '';
    }
    const cellString = String(cell);
    if (/[",\n\r]/.test(cellString)) {
        return `"${cellString.replace(/"/g, '""')}"`;
    }
    return cellString;
  };

  const handleExportCsv = () => {
    try {
      if (rideLog.length === 0) {
        alert(t('notifications.noRidesToExport'));
        return;
      }

      const headers = [
        'ID', t('csv.timestamp'), t('csv.vehicle'), t('csv.licensePlate'), t('csv.vehicleType'), t('csv.driverName'),
        t('csv.customerName'), t('csv.customerPhone'), t('csv.pickupAddress'), t('csv.destinationAddress'),
        t('csv.pickupTime'), t('csv.status'), t('csv.estimatedPrice'), t('csv.notes')
      ];

      const rows = rideLog.map(log => [
        log.id,
        new Date(log.timestamp).toLocaleString(language || 'cs-CZ'),
        log.vehicleName,
        log.vehicleLicensePlate,
        log.vehicleType ? (log.vehicleType === 'Car' ? t('vehicleType.CAR') : log.vehicleType === 'Van' ? t('vehicleType.VAN') : log.vehicleType) : '',
        log.driverName,
        log.customerName,
        log.customerPhone,
        log.stops[0] || '', // Pickup
        log.stops.slice(1).join('; ') || '', // Destinations
        log.pickupTime,
        log.status === 'Scheduled' ? t('rideStatus.SCHEDULED') :
        log.status === 'InProgress' ? t('rideStatus.IN_PROGRESS') :
        log.status === 'Completed' ? t('rideStatus.COMPLETED') :
        log.status === 'Cancelled' ? t('rideStatus.CANCELLED') : log.status,
        log.estimatedPrice ?? '',
        log.notes ?? ''
      ].map(escapeCsvCell));

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapid-dispatch-historie-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (window.confirm(t('notifications.clearHistoryAfterExport'))) {
        setRideLog([]);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Došlo k chybě při exportu CSV. Zkuste to znovu.');
    }
  };

  const handleLoadData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsedData = JSON.parse(e.target?.result as string);
            if (Array.isArray(parsedData.vehicles) && Array.isArray(parsedData.rideLog) && Array.isArray(parsedData.people)) {
                setVehicles(parsedData.vehicles);
                setRideLog(parsedData.rideLog);

                const normalizedPeople = parsedData.people.map((p: Person) => ({ ...p, role: normalizeRole(p.role) }));
                setPeople(normalizedPeople);
                if (parsedData.tariff) {
                    setTariff(parsedData.tariff);
                }
                if (parsedData.messagingApp) {
                    setMessagingApp(parsedData.messagingApp);
                }
                if (parsedData.fuelPrices) {
                    setFuelPrices(parsedData.fuelPrices);
                }
                alert(t('notifications.dataLoadedSuccess'));
            } else {
                throw new Error("Invalid data structure in JSON file.");
            }
        } catch (error) {
            alert(t('notifications.dataLoadedError'));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };
    reader.readAsText(file);
  };
  
  const triggerLoadFile = () => {
    if (window.confirm(t('settings.data.confirmLoad'))) {
        fileInputRef.current?.click();
    }
  };
  
  const handleDismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClearRideHistory = useCallback(() => {
    if (rideLog.length > 0 && window.confirm(t('settings.data.confirmClearHistory'))) {
      setRideLog([]);
    } else if (rideLog.length === 0) {
      alert(t('notifications.noRidesToClear'));
    }
  }, [rideLog, t]);

  const handleWidgetVisibilityChange = (widgetId: WidgetId, isVisible: boolean) => {
    setWidgetVisibility(prev => ({
        ...prev,
        [widgetId]: isVisible
    }));
  };

  const handleSyncToSupabase = () => {
    if (!SUPABASE_ENABLED) {
      alert('Synchronizace s cloudem je zakázána - aplikace používá pouze localStorage');
      return;
    }
    (async () => {
      try {
        await Promise.all([
          supabaseService.updatePeople(people),
          supabaseService.updateVehicles(vehicles),
          supabaseService.updateRideLogs(rideLog),
          supabaseService.updateNotifications(notifications),
          supabaseService.updateTariff(tariff),
          supabaseService.updateFuelPrices(fuelPrices),
          supabaseService.updateCompanyInfo(companyInfo),
        ]);
        alert('Synchronization to Supabase completed.');
      } catch (err: any) {
        console.error('Error syncing to Supabase', err);
        alert('Chyba při synchronizaci do cloudu. Podívejte se do konzole.');
      }
    })();
  };

  const handleLoadFromSupabase = () => {
    if (!SUPABASE_ENABLED) {
      alert('Načítání z cloudu je zakázáno - aplikace používá pouze localStorage');
      return;
    }
    (async () => {
      try {
        const [ppl, veh, rl, notif, tf, fp, ci] = await Promise.all([
          supabaseService.getPeople(),
          supabaseService.getVehicles(),
          supabaseService.getRideLogs(),
          supabaseService.getNotifications(),
          supabaseService.getTariff().catch(() => DEFAULT_TARIFF),
          supabaseService.getFuelPrices().catch(() => DEFAULT_FUEL_PRICES),
          supabaseService.getCompanyInfo().catch(() => DEFAULT_COMPANY_INFO),
        ]);
        setPeople(Array.isArray(ppl) ? ppl : []);
        setVehicles(Array.isArray(veh) ? veh : []);
        setRideLog(Array.isArray(rl) ? rl : []);
        setNotifications(Array.isArray(notif) ? notif : []);
        setTariff(tf || DEFAULT_TARIFF);
        setFuelPrices(fp || DEFAULT_FUEL_PRICES);
        setCompanyInfo(ci || DEFAULT_COMPANY_INFO);
        alert('Data načtena z cloudu.');
      } catch (err: any) {
        console.error('Error loading from Supabase:', err);
        alert('Došlo k chybě při načítání z cloudu');
      }
    })();
  };

  const handleSyncAllDataToSupabase = () => {
    if (!SUPABASE_ENABLED) {
      alert('Synchronizace všech dat s cloudem je zakázána - aplikace používá pouze localStorage');
      return;
    }
    (async () => {
      try {
        await Promise.all([
          supabaseService.updatePeople(people),
          supabaseService.updateVehicles(vehicles),
          supabaseService.updateRideLogs(rideLog),
          supabaseService.updateNotifications(notifications),
          supabaseService.updateTariff(tariff),
          supabaseService.updateFuelPrices(fuelPrices),
          supabaseService.updateCompanyInfo(companyInfo),
        ]);
        alert('All data synced to Supabase.');
      } catch (err: any) {
        console.error('Error syncing all data to Supabase:', err);
        alert('Chyba při synchronizaci všech dat s cloudem.');
      }
    })();
  };

  const sortedRideLog = useMemo(() => {
    let filtered = showCompletedRides ? [...rideLog] : rideLog.filter(log => log.status !== RideStatus.Completed && log.status !== RideStatus.Cancelled);

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        case 'week':
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          startDate = weekStart;
          endDate = new Date(weekStart);
          endDate.setDate(weekStart.getDate() + 7);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        default:
          if (dateFilter.startsWith('custom-')) {
            const dateStr = dateFilter.split('-')[1];
            const customDate = new Date(dateStr);
            startDate = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate());
            endDate = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate() + 1);
          } else {
            break;
          }
      }

      if (startDate && endDate) {
        filtered = filtered.filter(log => {
          const logDate = log.pickupTime && log.pickupTime !== 'ihned' ? new Date(log.pickupTime) : new Date(log.timestamp);
          return logDate >= startDate && logDate < endDate;
        });
      }
    }

    // Apply time filter based on pickupTime
    if (timeFilter !== 'all') {
      filtered = filtered.filter(log => {
        if (!log.pickupTime || log.pickupTime === 'ihned') return false;
        const date = new Date(log.pickupTime);
        const hours = date.getHours();
        switch (timeFilter) {
          case 'morning':
            return hours >= 6 && hours < 12;
          case 'afternoon':
            return hours >= 12 && hours < 18;
          case 'evening':
            return hours >= 18 && hours < 24;
          case 'night':
            return hours >= 0 && hours < 6;
          default:
            return true;
        }
      });
    }

    const sorted = filtered.sort((a, b) => {
        if (sortConfig.key === 'timestamp') return a.timestamp - b.timestamp;
        if (sortConfig.key === 'pickupTime') {
          const aTime = a.pickupTime === 'ihned' ? 0 : a.pickupTime ? new Date(a.pickupTime).getTime() : a.timestamp;
          const bTime = b.pickupTime === 'ihned' ? 0 : b.pickupTime ? new Date(b.pickupTime).getTime() : b.timestamp;
          return aTime - bTime;
        }
        return a.customerName.localeCompare(b.customerName, language);
    });
    return sortConfig.direction === 'asc' ? sorted : sorted.reverse();
  }, [rideLog, sortConfig, showCompletedRides, language, dateFilter, timeFilter]);

  const recentRideLog = sortedRideLog.filter(log => log.timestamp > Date.now() - 12 * 60 * 60 * 1000);

  const widgetMap: Record<WidgetId, React.ReactNode> = {
    dispatch: <DispatchFormComponent onSubmit={handleSubmitDispatch} onSchedule={handleScheduleRide} isLoading={isLoading} rideHistory={rideLog} cooldownTime={cooldown} onRoutePreview={handleRoutePreview} assignmentResult={assignmentResult} people={people} customerSms={customerSms} />,
    vehicles: <VehicleStatusTable vehicles={vehicles} people={people} onEdit={setEditingVehicle} rideLog={rideLog} onAddVehicleClick={() => setIsAddingVehicle(true)} />,
    map: <OpenStreetMap vehicles={vehicles} people={people} locations={locations} routeToPreview={routeToPreview} confirmedAssignment={assignmentResult} />,
      rideLog: <RideLogTable logs={sortedRideLog} vehicles={vehicles} people={people} messagingApp={messagingApp} onSort={handleSort} sortConfig={sortConfig} onStatusChange={handleRideStatusChange} onDelete={handleDeleteRideLog} onEdit={(logId) => { setEditingRideLog(rideLog.find(log => log.id === logId) || null); }} onSendSms={handleSendSms} showCompleted={showCompletedRides} onToggleShowCompleted={() => setShowCompletedRides(prev => !prev)} dateFilter={dateFilter} onDateFilterChange={setDateFilter} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} />,
    leaderboard: <Leaderboard />,
    dailyStats: <DailyStats rideLog={rideLog} people={people} />,
     smsGate: <SmsGate people={people} vehicles={vehicles} rideLog={rideLog} onSend={(id) => handleSendSms(id)} smsMessages={smsMessages} messagingApp={messagingApp} onSmsSent={(newMessages) => setSmsMessages(prev => Array.isArray(newMessages) ? [...newMessages, ...prev] : [newMessages, ...prev])} />,
      driverChat: <DriverChat vehicles={vehicles} onNewMessage={(vehicleId, message) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (vehicle) {
          setNotifications(prev => [...prev, {
            id: `vehicle-msg-${Date.now()}`,
            type: 'info',
            titleKey: 'notifications.vehicleMessage.title',
            messageKey: 'notifications.vehicleMessage.message',
            messageParams: { vehicleName: vehicle.name, message: message.length > 50 ? message.substring(0, 50) + '...' : message },
            timestamp: Date.now(),
          }]);
       }
     }} />,
  };

  const visibleLayout = layout.filter(item => widgetVisibility[item.id]);
  
  // If user is not authenticated, show login/register options
  if (!user) {
    return (
      <div className="flex flex-col min-h-screen p-4 sm:p-6 lg:p-8 glass card-hover">
        <div className="flex items-center justify-center flex-1">
          <div className="text-center space-y-8">
            <div className="flex items-center justify-center space-x-3 mb-8">
              <ShamanIcon className="text-accent animate-glow w-16 h-16" />
              <h1 className="text-5xl font-bold text-white tracking-wider font-sans">
                Shaman<span className="text-primary">Ride</span>
              </h1>
            </div>
            <div className="space-y-4">
              <p className="text-white/80 text-lg">
                Pro přístup k aplikaci se musíte přihlásit nebo zaregistrovat.
              </p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="px-6 py-3 text-lg font-medium rounded-xl btn-modern bg-primary hover:bg-nord-frost3 text-slate-900 shadow-frost transition-all"
                >
                  Přihlásit se
                </button>
                <button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="px-6 py-3 text-lg font-medium rounded-xl btn-modern bg-secondary hover:bg-nord-aurora4 text-slate-900 shadow-frost transition-all"
                >
                  Zaregistrovat se
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Authentication Modals */}
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSwitchToRegister={() => {
            setIsLoginModalOpen(false);
            setIsRegisterModalOpen(true);
          }}
        />
        <RegisterModal
          isOpen={isRegisterModalOpen}
          onClose={() => setIsRegisterModalOpen(false)}
          onSwitchToLogin={() => {
            setIsRegisterModalOpen(false);
            setIsLoginModalOpen(true);
          }}
        />
      </div>
    );
  }

   return (
     <div className="relative flex flex-col min-h-screen animate-fade-in overflow-auto">
       {/* Subtle background pattern */}
       <div className="absolute inset-0 opacity-5" style={{
         backgroundImage: `radial-gradient(circle at 25% 25%, hsl(142, 76%, 36%) 2px, transparent 2px),
                          radial-gradient(circle at 75% 75%, hsl(262, 83%, 58%) 1px, transparent 1px)`,
         backgroundSize: '50px 50px'
       }} aria-hidden></div>

      <NotificationCenter notifications={notifications} onDismiss={handleDismissNotification} />
        <header className="glass border-b border-slate-300 px-4 py-2 mb-4 flex-shrink-0 animate-slide-in">
           <div className="flex justify-between items-center">
             {/* Logo and Brand */}
             <div className="flex items-center space-x-3">
               <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="text-white w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H15V3H13V5H11V3H9V5H6.5C5.84 5 5.29 5.42 5.08 6.01L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6.01ZM7 17C6.45 17 6 16.55 6 16S6.45 15 7 15 8 15.45 8 16 7.55 17 7 17ZM17 17C16.45 17 16 16.55 16 16S16.45 15 17 15 18 15.45 18 16 17.55 17 17 17ZM5 13L6.5 7H17.5L19 13H5Z"/>
                    </svg>
                  </div>
                   <div>
                     <h1 className="text-lg font-bold bg-gradient-to-r from-[#81A1C1] to-[#5E81AC] bg-clip-text text-transparent">
                       TaxiRide
                     </h1>
                     <p className="text-xs text-slate-400">Dispatch & Fleet</p>
                   </div>
               </div>
             </div>

             {/* Search Bar and Navigation */}
             <div className="flex items-center space-x-4">
               <div className="max-w-sm">
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                     <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                     </svg>
                   </div>
                   <input
                     type="text"
                     placeholder="Search rides, vehicles..."
                     className="block w-full pl-8 pr-3 py-1 border border-slate-300 rounded-md bg-slate-200 focus:ring-1 focus:ring-primary focus:border-primary text-slate-900 text-sm placeholder-slate-400"
                   />
                 </div>
               </div>
               <nav className="flex items-center space-x-1 bg-slate-700 backdrop-blur-sm rounded-xl p-1 border border-slate-600 shadow-sm">
                 <button
                   onClick={() => window.location.href = '/'}
                   className="flex items-center space-x-2 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                 >
                   <HomeIcon className="w-3 h-3" />
                   <span>Nástěnka</span>
                 </button>
                 <button
                   onClick={() => setIsRideBookOpen(true)}
                   className="flex items-center space-x-2 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                 >
                   <ClipboardIcon className="w-3 h-3" />
                   <span>Jízdy</span>
                 </button>
                 <button
                   onClick={() => setIsTariffModalOpen(true)}
                   className="flex items-center space-x-2 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                 >
                   <PriceTagIcon className="w-3 h-3" />
                   <span>Tarify</span>
                 </button>
                 <button
                   onClick={() => setIsPeopleModalOpen(true)}
                   className="flex items-center space-x-2 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                 >
                   <PhoneIcon className="w-3 h-3" />
                   <span>Lidé</span>
                 </button>
                 <button
                   onClick={() => setIsAnalyticsModalOpen(true)}
                   className="flex items-center space-x-2 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                 >
                   <BarChartIcon className="w-3 h-3" />
                   <span>Analytika</span>
                 </button>
                 <button
                   onClick={() => setIsGamificationModalOpen(true)}
                   className="flex items-center space-x-2 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                 >
                   <TrophyIcon className="w-3 h-3" />
                   <span>Gamifikace</span>
                 </button>
              </nav>
             </div>

             {/* Action Buttons */}
             <div className="flex items-center space-x-1">
               <button
                 onClick={() => setIsSettingsModalOpen(true)}
                 className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                 title={t('header.settings')}
               >
                 <SettingsIcon className="w-4 h-4" />
               </button>

               {user ? (
                 <div className="flex items-center space-x-2">
                   <span className="text-sm text-slate-300">{user.email?.split('@')[0]}</span>
                   <button
                     onClick={signOut}
                     className="px-3 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                   >
                     Sign Out
                   </button>
                 </div>
               ) : (
                 <div className="flex items-center space-x-1">
                   <button
                     onClick={() => setIsLoginModalOpen(true)}
                     className="px-3 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                   >
                     Sign In
                   </button>
                   <button
                     onClick={() => setIsRegisterModalOpen(true)}
                     className="px-3 py-1 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded transition-colors"
                   >
                     Sign Up
                   </button>
                 </div>
               )}
             </div>
           </div>
        </header>

         <main className="relative flex-1 p-6 animate-fade-in">
           <div className="w-full space-y-6">



              {/* Main Dashboard Grid */}
              <div className="grid grid-cols-3 gap-6">
                {(() => {
                  const mapColStart = widgetVisibility.dispatch ? 2 : 1;
                  const mapColSpan = widgetVisibility.dispatch ? 2 : 3;
                  const smsColStart = widgetVisibility.dispatch ? 2 : 1;
                  const smsColSpan = widgetVisibility.dispatch ? 2 : 3;
                  const smsRowStart = widgetVisibility.map ? 2 : 1;
                  const rideLogColSpan = widgetVisibility.vehicles ? 2 : 3;
                  const vehiclesColStart = widgetVisibility.rideLog ? 3 : 1;
                  const vehiclesColSpan = widgetVisibility.rideLog ? 1 : 3;

                  return (
                    <>
                      {/* Dispatch Widget - Column 1, Rows 1-2 */}
                      {widgetVisibility.dispatch && (
                        <div className="col-start-1 row-start-1 row-span-2">
                           <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden h-full">
                            <div className="p-4">
                              {widgetMap.dispatch}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Map Widget - Dynamic columns, Row 1 */}
                      {widgetVisibility.map && (
                        <div className={`col-start-${mapColStart} row-start-1 col-span-${mapColSpan}`}>
                           <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden h-full">
                             <div className="p-3 border-b border-slate-700">
                               <h3 className="text-sm font-semibold text-white flex items-center">
                                 <div className="w-6 h-6 bg-[#81A1C1]/80 rounded-lg flex items-center justify-center mr-2">
                                   <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                  </svg>
                                 </div>
                                 Mapa vozového parku
                               </h3>
                             </div>
                             <div className="p-4">
                               <div className="h-96">
                                 {widgetMap.map}
                               </div>
                             </div>
                           </div>
                         </div>
                      )}

                       {/* Driver Chat - Dynamic columns and row */}
                       {widgetVisibility.driverChat && (
                         <div className={`col-start-${smsColStart} row-start-${smsRowStart} col-span-${smsColSpan}`}>
                            <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden h-96">
                              <div className="p-4 h-full">
                                {widgetMap.driverChat}
                              </div>
                            </div>
                          </div>
                       )}

                      {/* Ride History - Dynamic columns, Row 3 */}
                      {widgetVisibility.rideLog && (
                        <div className={`col-start-1 row-start-3 col-span-${rideLogColSpan}`}>
                           <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden">
                             <div className="p-3 border-b border-slate-700">
                               <div className="flex justify-between items-center">
                                 <h3 className="text-sm font-semibold text-white flex items-center">
                                   <div className="w-6 h-6 bg-[#81A1C1]/80 rounded-lg flex items-center justify-center mr-2">
                                     <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                    </svg>
                                   </div>
                                   Historie jízd
                                 </h3>
                                   <button
                                     onClick={handleAddRideClick}
                                     className="flex items-center space-x-2 px-3 py-1 bg-[#A3BE8C] hover:bg-[#8FBCBB] text-slate-900 text-xs font-medium rounded-lg transition-colors"
                                   >
                                  <PlusIcon size={14} />
                                  <span>Přidat jízdu</span>
                                </button>
                              </div>
                            </div>
                            <div className="p-4">
                              {widgetMap.rideLog}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Vehicles Status - Dynamic columns, Row 3 */}
                      {widgetVisibility.vehicles && (
                        <div className={`col-start-${vehiclesColStart} row-start-3 col-span-${vehiclesColSpan}`}>
                           <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden">
                             <div className="p-3 border-b border-slate-700">
                               <h3 className="text-sm font-semibold text-white flex items-center">
                                 <div className="w-6 h-6 bg-[#EBCB8B]/80 rounded-lg flex items-center justify-center mr-2">
                                   <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                  </svg>
                                 </div>
                                 Stav vozového parku
                               </h3>
                             </div>
                             <div className="p-4">
                               {widgetMap.vehicles}
                             </div>
                           </div>
                         </div>
                      )}
                    </>
                  );
                })()}

                {/* Dispatch Widget - Column 1, Rows 1-2 */}
                {widgetVisibility.dispatch && (
                  <div className="col-start-1 row-start-1 row-span-2">
                     <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden h-full">
                      <div className="p-4">
                        {widgetMap.dispatch}
                      </div>
                    </div>
                  </div>
                )}

                {/* Map Widget - Columns 2-3, Row 1 */}
                {widgetVisibility.map && (
                  <div className="col-start-2 row-start-1 col-span-2">
                     <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden h-full">
                       <div className="p-3 border-b border-slate-700">
                         <h3 className="text-sm font-semibold text-white flex items-center">
                           <div className="w-6 h-6 bg-[#81A1C1]/80 rounded-lg flex items-center justify-center mr-2">
                             <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                           </div>
                           Mapa vozového parku
                         </h3>
                       </div>
                       <div className="p-4">
                         <div className="h-96">
                           {widgetMap.map}
                         </div>
                       </div>
                     </div>
                   </div>
                )}

                 {/* Driver Chat - Columns 2-3, Row 2 */}
                 {widgetVisibility.driverChat && (
                   <div className="col-start-2 row-start-2 col-span-2">
                      <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden h-96">
                        <div className="p-4 h-full">
                         {widgetMap.driverChat}
                       </div>
                     </div>
                   </div>
                 )}

                {/* Ride History - Column 1-2, Row 3 */}
                {widgetVisibility.rideLog && (
                  <div className="col-start-1 row-start-3 col-span-2">
                  <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden">
                    <div className="p-3 border-b border-slate-700">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-white flex items-center">
                          <div className="w-6 h-6 bg-[#81A1C1]/80 rounded-lg flex items-center justify-center mr-2">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                           </svg>
                         </div>
                         Historie jízd
                       </h3>
                          <button
                            onClick={handleAddRideClick}
                            className="flex items-center space-x-2 px-3 py-1 bg-[#A3BE8C] hover:bg-[#8FBCBB] text-slate-900 text-xs font-medium rounded-lg transition-colors"
                          >
                         <PlusIcon size={14} />
                         <span>Přidat jízdu</span>
                       </button>
                     </div>
                   </div>
                   <div className="p-4">
                        {widgetMap.rideLog}
                      </div>
                    </div>
                  </div>
                )}

                {/* Vehicles Status - Column 3, Row 3 */}
                {widgetVisibility.vehicles && (
                  <div className="col-start-3 row-start-3">
                  <div className="bg-slate-800 rounded-2xl shadow-sm border-0 overflow-hidden">
                    <div className="p-3 border-b border-slate-700">
                      <h3 className="text-sm font-semibold text-white flex items-center">
                        <div className="w-6 h-6 bg-[#EBCB8B]/80 rounded-lg flex items-center justify-center mr-2">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                         </svg>
                       </div>
                       Stav vozového parku
                     </h3>
                   </div>
                   <div className="p-4">
                        {widgetMap.vehicles}
                      </div>
                    </div>
                  </div>
                )}

             </div>
          </div>
        </main>
      
      {(isLoading || assignmentResult || error) && (
           <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-start pt-24 p-4 animate-fade-in overflow-y-auto">
              {isLoading && !assignmentResult && <LoadingSpinner text={t('loading.calculating')} />}
              {assignmentResult && (<AssignmentResult result={assignmentResult} error={error} onClear={handleClearResult} onConfirm={handleConfirmAssignment} isAiMode={isAiEnabled} people={people} messagingApp={messagingApp} className="max-w-4xl w-full" fuelPrices={fuelPrices} />)}
              {error && !assignmentResult && (<AssignmentResult result={null} error={error} onClear={handleClearResult} onConfirm={() => {}} isAiMode={isAiEnabled} people={people} messagingApp={messagingApp} className="max-w-xl w-full" fuelPrices={fuelPrices}/>)}
           </div>
      )}

      {/* Modals */}
      {editingVehicle && (<EditVehicleModal vehicle={editingVehicle} people={people} onSave={handleUpdateVehicle} onClose={() => setEditingVehicle(null)} onDelete={handleDeleteVehicle}/>)}
      {isAddingVehicle && (<AddVehicleModal onSave={handleAddVehicle} onClose={() => setIsAddingVehicle(false)}/>)}
      {editingRideLog && (<EditRideLogModal log={editingRideLog} vehicles={vehicles} people={people} onSave={handleUpdateRideLog} onSendSms={handleSendSms} onClose={() => { setEditingRideLog(null); setIsRideBookOpen(true); }}/>)}
      {isCreatingRide && (<EditRideLogModal log={createDefaultRideLog()} vehicles={vehicles} people={people} onSave={handleCreateRideLog} onSendSms={handleSendSms} onClose={() => { setIsCreatingRide(false); setIsRideBookOpen(true); }}/>)}
      {isRideBookOpen && (<RideBookModal rideLogs={rideLog} vehicles={vehicles} people={people} companyInfo={companyInfo} onEdit={(log) => { setEditingRideLog(log); setIsRideBookOpen(false); }} onDelete={handleDeleteRideLog} onAdd={() => { setIsCreatingRide(true); setIsRideBookOpen(false); }} onClose={() => setIsRideBookOpen(false)} />)}
      {manualAssignmentDetails && (<ManualAssignmentModal details={manualAssignmentDetails} people={people} onConfirm={handleManualAssignmentConfirm} onClose={() => setManualAssignmentDetails(null)} messagingApp={messagingApp} />)}
      {isPeopleModalOpen && (<ManagePeopleModal people={people} onAdd={handleAddPerson} onUpdate={handleUpdatePerson} onDelete={handleDeletePerson} onClose={() => setIsPeopleModalOpen(false)}/>)}
      {isTariffModalOpen && (<TariffSettingsModal initialTariff={tariff} onSave={setTariff} onClose={() => setIsTariffModalOpen(false)} />)}
      {isAnalyticsModalOpen && <AnalyticsModal rideLog={rideLog} vehicles={vehicles} people={people} onClose={() => setIsAnalyticsModalOpen(false)} />}
      {smsToPreview && (
        <SmsPreviewModal 
            {...smsToPreview} 
            onClose={scheduledRideToDispatch ? handleCancelScheduledDispatch : () => setSmsToPreview(null)} 
            messagingApp={messagingApp} 
            onConfirm={scheduledRideToDispatch ? handleConfirmScheduledDispatch : undefined}
            onSendViaGateway={() => handleSendSmsViaGateway(smsToPreview?.logId)}
        />
      )}
        {isSettingsModalOpen && (
          <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            isAiEnabled={isAiEnabled}
            onToggleAi={() => setIsAiEnabled(!isAiEnabled)}
            messagingApp={messagingApp}
            onMessagingAppChange={setMessagingApp}
            preferredNav={preferredNav}
            onPreferredNavChange={setPreferredNav}
            isEditMode={isEditMode}
            onToggleEditMode={() => setIsEditMode(!isEditMode)}
            onResetLayout={resetLayout}
            onSaveData={handleSaveData}
            onLoadData={triggerLoadFile}
            onExportCsv={handleExportCsv}
            onClearRideHistory={handleClearRideHistory}
            widgetVisibility={widgetVisibility}
            onWidgetVisibilityChange={handleWidgetVisibilityChange}
              fuelPrices={fuelPrices}
              onFuelPricesChange={setFuelPrices}
              companyInfo={companyInfo}
              onCompanyInfoChange={setCompanyInfo}
              smsGateConfig={smsGateConfig}
              onSmsGateConfigChange={handleSmsGateConfigChange}
             user={user}
             onSyncToSupabase={handleSyncToSupabase}
             onLoadFromSupabase={handleLoadFromSupabase}
             onSyncAllDataToSupabase={handleSyncAllDataToSupabase}
           />
         )}

      {/* Gamification Modal */}
      <GamificationModal
        isOpen={isGamificationModalOpen}
        onClose={() => setIsGamificationModalOpen(false)}
        rideLog={rideLog}
        people={people}
      />

      {/* Authentication Modals */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSwitchToRegister={() => {
          setIsLoginModalOpen(false);
          setIsRegisterModalOpen(true);
        }}
      />
      <RegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSwitchToLogin={() => {
          setIsRegisterModalOpen(false);
          setIsLoginModalOpen(true);
        }}
      />

      <input type="file" ref={fileInputRef} onChange={handleLoadData} accept=".json" className="hidden" aria-hidden="true"/>
    </div>
  );
};

// Wrapper component with AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
