import type { RideRequest, Vehicle, RideLog, Person, Tariff, FuelPrices, MessagingApp } from '../types';
import { RideStatus, VehicleStatus, RideType, DEFAULT_TARIFF, DEFAULT_FUEL_PRICES } from '../types';
import { findBestVehicle, generateSms, generateShareLink } from './dispatchService';
import { SUPABASE_ENABLED, supabaseService } from './supabaseClient';


export interface OrderResult {
    success: true;
    eta: number;
    vehicleName: string;
    driverName: string | null;
}

// FIX: Export the OrderError interface to allow TypeScript to correctly discriminate the union type.
export interface OrderError {
    success: false;
    errorMessage: string;
}

// A function that simulates what a translation function would do, for use in a non-React context.
const t = (key: string, params?: any): string => {
    const translations: Record<string, string> = {
        'sms.route': 'Trasa',
        'sms.name': 'Jméno',
        'sms.phone': 'Telefon',
        'sms.passengers': 'Počet osob',
        'sms.pickupTime': 'Vyzvednout',
        'sms.pickupASAP': 'co nejdříve',
        'sms.note': 'Poznámka',
        'sms.navigation': 'Navigace'
    };
    let text = translations[key] || key;
    if (params) {
        Object.keys(params).forEach(paramKey => {
            text = text.replace(`{${paramKey}}`, String(params[paramKey]));
        });
    }
    return text;
};


export async function processCustomerOrder(rideRequest: RideRequest): Promise<OrderResult | OrderError> {
    try {
    // 1. Read necessary data via supabaseService (cloud) or its localStorage fallback
    const vehicles = await supabaseService.getVehicles().catch(() => []);
    const people = await supabaseService.getPeople().catch(() => []);
    const rideLog = await supabaseService.getRideLogs().catch(() => []);
    const tariffData = await supabaseService.getTariff().catch(() => DEFAULT_TARIFF);
    const fuelPricesData = await supabaseService.getFuelPrices().catch(() => DEFAULT_FUEL_PRICES);
    const messagingApp = await supabaseService.getMessagingApp().catch(() => 'SMS');

        if (!vehicles || !people) {
            return { success: false, errorMessage: 'Systémová data nejsou k dispozici. Zkuste prosím zavolat.' };
        }

        const tariff: Tariff = { ...tariffData, timeBasedTariffs: tariffData.timeBasedTariffs || [] };
        const fuelPrices: FuelPrices = fuelPricesData;
        const language = 'cs'; // Customer facing is always in Czech for now

        // 2. Find the best vehicle using existing logic. We force AI mode for best result.
        // We also force optimize=true because a customer always wants the fastest route.
        const result = await findBestVehicle(rideRequest, vehicles, true, tariff, language, true);

        if ('messageKey' in result) {
            // Translate error key for customer
            const errorMap: Record<string, string> = {
                "error.noVehiclesInService": "Všechna vozidla jsou momentálně obsazená nebo mimo provoz.",
                "error.insufficientCapacity": `Bohužel nemáme volné vozidlo s kapacitou pro ${result.message || rideRequest.passengers} osoby.`,
                 "error.geocodingFailed": `Nepodařilo se najít zadanou adresu: ${result.message}`,
            };
            return { success: false, errorMessage: errorMap[result.messageKey] || 'Nepodařilo se najít vhodné vozidlo.' };
        }

        // 3. If a vehicle is found, update the state
        const assignedVehicle = result.vehicle;
        const driver = people.find(p => p.id === assignedVehicle.driverId);
        const destination = (result.optimizedStops || result.rideRequest.stops).slice(-1)[0];
        
        // Calculate when the vehicle will be free
        const durationInMinutes = result.rideDuration ? result.eta + result.rideDuration : result.eta + 30;
        const freeAt = Date.now() + durationInMinutes * 60 * 1000;
        
        const calculateFuelCost = (vehicle: Vehicle, distanceKm: number): number | undefined => {
            if (vehicle.fuelType && vehicle.fuelConsumption && vehicle.fuelConsumption > 0) {
              const price = fuelPrices[vehicle.fuelType];
              const cost = (distanceKm / 100) * vehicle.fuelConsumption * price;
              return Math.round(cost);
            }
            return undefined;
        };
        const fuelCost = result.rideDistance ? calculateFuelCost(assignedVehicle, result.rideDistance) : undefined;


        // Update vehicles array
        const updatedVehicles = vehicles.map(v => 
            v.id === assignedVehicle.id 
                ? { ...v, status: VehicleStatus.Busy, freeAt, location: destination } 
                : v
        );

        // Create new ride log entry
        const newLog: RideLog = {
            id: `ride-${Date.now()}`,
            timestamp: new Date().toISOString(),
            vehicleName: assignedVehicle.name,
            vehicleLicensePlate: assignedVehicle.licensePlate,
            driverName: driver?.name || null,
            vehicleType: assignedVehicle.type,
            rideType: RideType.BUSINESS, // Default to business ride
            customerName: rideRequest.customerName,
            customerPhone: rideRequest.customerPhone,
            stops: result.optimizedStops || rideRequest.stops,
            passengers: rideRequest.passengers,
            pickupTime: rideRequest.pickupTime,
            status: RideStatus.Accepted,
            vehicleId: assignedVehicle.id,
            notes: "Objednáno online zákazníkem",
            estimatedPrice: result.estimatedPrice,
             estimatedPickupTimestamp: new Date(Date.now() + result.eta * 60 * 1000).toISOString(),
             estimatedCompletionTimestamp: new Date(freeAt).toISOString(),
            fuelCost: fuelCost,
            startMileage: null,
            endMileage: null,
            distance: result.rideDistance,
            purpose: null,
            businessPurpose: null
        };

        const updatedRideLog = [newLog, ...rideLog];

        // 4. Create notification for dispatchers
        const notifications = SUPABASE_ENABLED ? await supabaseService.getNotifications().catch(() => []) : JSON.parse(localStorage.getItem('rapid-dispatch-notifications') || '[]');
        const newNotification = {
            id: `customer-order-${Date.now()}`,
            type: 'customerOrder',
            titleKey: 'notifications.customerOrder.title',
            messageKey: 'notifications.customerOrder.message',
            messageParams: {
                customerName: rideRequest.customerName,
                pickupAddress: rideRequest.stops[0],
                destinationAddress: rideRequest.stops.slice(1).join(' -> ')
            },
            timestamp: Date.now(),
            rideLogId: newLog.id
        };
    const updatedNotifications = [newNotification, ...notifications];

        // 5. Save updated state via supabaseService (cloud or local fallback)
        await supabaseService.updateVehicles(updatedVehicles).catch(err => console.error('Error updating vehicles via supabaseService', err));
        await supabaseService.updateRideLogs(updatedRideLog).catch(err => console.error('Error updating ride logs via supabaseService', err));
        await supabaseService.updateNotifications(updatedNotifications).catch(err => console.error('Error updating notifications via supabaseService', err));

        // 5. SMS will be sent manually by dispatcher after reviewing the order
        // The notification has already been created above to alert dispatchers
        console.log(`Customer order processed for ${rideRequest.customerName}. SMS ready to be sent to driver ${driver?.name || 'N/A'}.`);
        
        // 6. Return success data to the UI
        return {
            success: true,
            eta: result.eta,
            vehicleName: assignedVehicle.name,
            driverName: driver?.name || null,
        };

    } catch (err: any) {
        console.error("Error processing customer order:", err);
        return { success: false, errorMessage: 'Došlo k vnitřní chybě systému.' };
    }
}