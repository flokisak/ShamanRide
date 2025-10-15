export enum VehicleType {
  Car = 'CAR',
  Van = 'VAN',
}

export enum VehicleStatus {
  Available = 'AVAILABLE',
  Busy = 'BUSY',
  OutOfService = 'OUT_OF_SERVICE',
  NotDrivingToday = 'NOT_DRIVING_TODAY',
}

export enum RideStatus {
  Scheduled = 'SCHEDULED',
  Pending = 'PENDING',
  Accepted = 'ACCEPTED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export enum PersonRole {
  Driver = 'Driver',
  Management = 'Management',
  Dispatcher = 'Dispatcher',
}

export enum MessagingApp {
  SMS = 'SMS',
  Telegram = 'Telegram',
  WhatsApp = 'WhatsApp',
}

export enum NavigationApp {
  Google = 'google',
  Waze = 'waze',
}

export enum FuelType {
  Diesel = 'DIESEL',
  Petrol = 'PETROL',
}

export interface Person {
  id: number;
  name: string;
  phone: string;
  role: PersonRole;
  navigationApp?: NavigationApp;
  authUserId?: string; // Links to Supabase auth.users.id
  vehicleId?: number; // Links to assigned vehicle
  currentStatus?: string; // Driver status (available, on_ride, break, offline)
  breakEndTime?: string; // When break ends
}

export interface Vehicle {
  id: number;
  name: string;
  licensePlate: string;
  type: VehicleType;
  status: VehicleStatus;
  location: string;
  capacity: number;
  driverId: number | null; // Link to a Person
  // Timestamp for when the vehicle becomes free
  freeAt?: number;
  // New vehicle management fields
  mileage?: number;
  serviceInterval?: number; // in km
  lastServiceMileage?: number; // in km
  technicalInspectionExpiry?: string; // YYYY-MM-DD
  vignetteExpiry?: string; // YYYY-MM-DD
  vehicleNotes?: string;
  fuelType?: FuelType;
  fuelConsumption?: number; // L/100km
  phone?: string; // Phone number for the vehicle's built-in phone
}

export interface RideRequest {
  stops: string[]; // First stop is pickup, the rest are destinations
  customerName: string;
  customerPhone: string;
  passengers: number;
  pickupTime: string;
  notes?: string;
}

export interface AssignmentAlternative {
  vehicle: Vehicle;
  eta: number;
  waitTime?: number;
  estimatedPrice: number;
}

export interface AssignmentResultData {
  vehicle: Vehicle; // Recommended vehicle
  eta: number;
  sms: string;
  estimatedPrice: number;
  waitTime?: number; // In case the recommended vehicle is busy
  rideDuration?: number;
  rideDistance?: number;
  alternatives: AssignmentAlternative[];
  rideRequest: RideRequest;
  optimizedStops?: string[]; // The reordered list of stops
  vehicleLocationCoords: { lat: number; lon: number };
  stopCoords: { lat: number; lon: number }[];
  navigationUrl: string;
}

export interface ErrorResult {
  messageKey: string;
  message?: string;
}

export enum RideType {
  BUSINESS = 'BUSINESS',
  PRIVATE = 'PRIVATE'
}

export interface RideLog {
  id: string;
  timestamp: number;
  vehicleName: string | null;
  vehicleLicensePlate: string | null;
  driverName: string | null;
  vehicleType: VehicleType | null;
  customerName: string;
  customerPhone: string;
  stops: string[]; // Full route, first is pickup
  pickupTime: string;
  status: RideStatus;
  vehicleId: number | null;
  smsSent: boolean;
  passengers: number;
  notes?: string;
  estimatedPrice?: number;
  // Timestamps for tracking and notifications
  estimatedPickupTimestamp?: number;
  estimatedCompletionTimestamp?: number;
  fuelCost?: number;
  // Kniha jízd fields
  rideType: RideType; // BUSINESS or PRIVATE
  startMileage?: number; // Počáteční stav km
  endMileage?: number; // Konečný stav km
  distance?: number; // Ujetá vzdálenost v km
  purpose?: string; // Účel jízdy (pro soukromé jízdy)
  businessPurpose?: string; // Účel služební jízdy
}

// Types for customizable layout
export type WidgetId = 'dispatch' | 'vehicles' | 'rideLog' | 'map' | 'leaderboard' | 'smsGate' | 'dailyStats';

export interface LayoutItem {
  id: WidgetId;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

export type LayoutConfig = LayoutItem[];

// Types for Notification System
export interface Notification {
  id: string;
  type: 'delay' | 'reminder' | 'customerOrder';
  titleKey: string;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  timestamp: number;
  rideLogId?: string;
}

// Types for Pricing Tariff
export interface FlatRateRule {
  id: number;
  name: string;
  priceCar: number;
  priceVan: number;
}

export interface TimeBasedTariff {
  id: number;
  name: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  startingFee: number;
  pricePerKmCar: number;
  pricePerKmVan: number;
}

export interface Tariff {
  startingFee: number;
  pricePerKmCar: number;
  pricePerKmVan: number;
  flatRates: FlatRateRule[];
  timeBasedTariffs: TimeBasedTariff[];
}

export interface FuelPrices {
  DIESEL: number;
  PETROL: number;
}

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

// Company information types
export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  ico: string;
  dic: string;
  logoUrl?: string;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: 'ShamanRide s.r.o.',
  address: 'Mikulov, Česká republika',
  phone: '+420 123 456 789',
  email: 'info@shamanride.cz',
  ico: '12345678',
  dic: 'CZ12345678',
  logoUrl: undefined,
};

// Gamification types
export enum AchievementType {
  FUEL_EFFICIENCY = 'FUEL_EFFICIENCY',
  CUSTOMER_COUNT = 'CUSTOMER_COUNT',
  PERFECT_RIDES = 'PERFECT_RIDES',
  SPEED_DEMON = 'SPEED_DEMON',
  DEER_MASTER = 'DEER_MASTER',
  REVENUE_CHAMPION = 'REVENUE_CHAMPION',
  STREAK_MASTER = 'STREAK_MASTER',
  NIGHT_OWL = 'NIGHT_OWL'
}

export enum ManualEntryType {
  FIVE_STAR_REVIEW = 'FIVE_STAR_REVIEW',
  CUSTOMER_COMPLAINT = 'CUSTOMER_COMPLAINT',
  DEER_COLLISION = 'DEER_COLLISION',
  ACCIDENT = 'ACCIDENT',
  PERFECT_SERVICE = 'PERFECT_SERVICE',
  CUSTOMER_FEEDBACK = 'CUSTOMER_FEEDBACK',
  BONUS_POINTS = 'BONUS_POINTS',
  MANUAL_SCORE_EDIT = 'MANUAL_SCORE_EDIT'
}

export interface DriverScore {
  driver_id: number;
  driver_name: string;
  total_score: number;
  fuel_efficiency_score: number;
  customer_count_score: number;
  revenue_score: number;
  perfect_rides_score: number;
  deer_collision_score: number; // Easter egg
  rank: number;
  updated_at: string;
}

export interface Achievement {
  id: string;
  driver_id: number;
  type: AchievementType;
  title: string;
  description: string;
  icon: string;
  unlocked_at: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface ManualEntry {
  id: string;
  driver_id: number;
  type: ManualEntryType;
  title: string;
  description: string;
  points: number;
  created_at: string;
  created_by?: string;
  notes?: string;
}

export interface DriverStats {
  driver_id: number;
  total_rides: number;
  total_customers: number;
  total_revenue: number;
  average_fuel_efficiency: number;
  perfect_rides_count: number;
  deer_collisions: number; // Easter egg
  longest_streak: number;
  average_response_time: number;
  night_rides_count: number;
  total_paid_km: number;
  total_empty_km: number;
  manual_entries_points: number;
  updated_at: string;
}