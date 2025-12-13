"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurringPattern = exports.ShiftPlanStatus = exports.ManualEntryType = exports.AchievementType = exports.DEFAULT_COMPANY_INFO = exports.DEFAULT_FUEL_PRICES = exports.DEFAULT_TARIFF = exports.RideType = exports.FuelType = exports.PaymentMethod = exports.NavigationApp = exports.MessagingApp = exports.PersonRole = exports.RideStatus = exports.VehicleStatus = exports.VehicleType = void 0;
var VehicleType;
(function (VehicleType) {
    VehicleType["Car"] = "CAR";
    VehicleType["Van"] = "VAN";
})(VehicleType || (exports.VehicleType = VehicleType = {}));
var VehicleStatus;
(function (VehicleStatus) {
    VehicleStatus["Available"] = "AVAILABLE";
    VehicleStatus["Busy"] = "BUSY";
    VehicleStatus["Break"] = "BREAK";
    VehicleStatus["OutOfService"] = "OUT_OF_SERVICE";
    VehicleStatus["NotDrivingToday"] = "NOT_DRIVING_TODAY";
})(VehicleStatus || (exports.VehicleStatus = VehicleStatus = {}));
var RideStatus;
(function (RideStatus) {
    RideStatus["Scheduled"] = "SCHEDULED";
    RideStatus["Pending"] = "PENDING";
    RideStatus["Queued"] = "QUEUED";
    RideStatus["Accepted"] = "ACCEPTED";
    RideStatus["InProgress"] = "IN_PROGRESS";
    RideStatus["Completed"] = "COMPLETED";
    RideStatus["Cancelled"] = "CANCELLED";
})(RideStatus || (exports.RideStatus = RideStatus = {}));
var PersonRole;
(function (PersonRole) {
    PersonRole["Driver"] = "Driver";
    PersonRole["Management"] = "Management";
    PersonRole["Dispatcher"] = "Dispatcher";
})(PersonRole || (exports.PersonRole = PersonRole = {}));
var MessagingApp;
(function (MessagingApp) {
    MessagingApp["SMS"] = "SMS";
    MessagingApp["Telegram"] = "Telegram";
    MessagingApp["WhatsApp"] = "WhatsApp";
})(MessagingApp || (exports.MessagingApp = MessagingApp = {}));
var NavigationApp;
(function (NavigationApp) {
    NavigationApp["Google"] = "google";
    NavigationApp["Waze"] = "waze";
})(NavigationApp || (exports.NavigationApp = NavigationApp = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["Cash"] = "cash";
    PaymentMethod["Card"] = "card";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var FuelType;
(function (FuelType) {
    FuelType["Diesel"] = "DIESEL";
    FuelType["Petrol"] = "PETROL";
})(FuelType || (exports.FuelType = FuelType = {}));
var RideType;
(function (RideType) {
    RideType["BUSINESS"] = "BUSINESS";
    RideType["PRIVATE"] = "PRIVATE";
})(RideType || (exports.RideType = RideType = {}));
exports.DEFAULT_TARIFF = {
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
exports.DEFAULT_FUEL_PRICES = {
    DIESEL: 37.5,
    PETROL: 38.9,
};
exports.DEFAULT_COMPANY_INFO = {
    name: 'ShamanRide s.r.o.',
    address: 'Mikulov, Česká republika',
    phone: '+420 123 456 789',
    email: 'info@shamanride.cz',
    ico: '12345678',
    dic: 'CZ12345678',
    logoUrl: undefined,
};
// Gamification types
var AchievementType;
(function (AchievementType) {
    AchievementType["FUEL_EFFICIENCY"] = "FUEL_EFFICIENCY";
    AchievementType["CUSTOMER_COUNT"] = "CUSTOMER_COUNT";
    AchievementType["PERFECT_RIDES"] = "PERFECT_RIDES";
    AchievementType["SPEED_DEMON"] = "SPEED_DEMON";
    AchievementType["DEER_MASTER"] = "DEER_MASTER";
    AchievementType["REVENUE_CHAMPION"] = "REVENUE_CHAMPION";
    AchievementType["STREAK_MASTER"] = "STREAK_MASTER";
    AchievementType["NIGHT_OWL"] = "NIGHT_OWL";
    AchievementType["FAST_ACCEPTANCE"] = "FAST_ACCEPTANCE";
})(AchievementType || (exports.AchievementType = AchievementType = {}));
var ManualEntryType;
(function (ManualEntryType) {
    ManualEntryType["FIVE_STAR_REVIEW"] = "FIVE_STAR_REVIEW";
    ManualEntryType["CUSTOMER_COMPLAINT"] = "CUSTOMER_COMPLAINT";
    ManualEntryType["DEER_COLLISION"] = "DEER_COLLISION";
    ManualEntryType["ACCIDENT"] = "ACCIDENT";
    ManualEntryType["PERFECT_SERVICE"] = "PERFECT_SERVICE";
    ManualEntryType["CUSTOMER_FEEDBACK"] = "CUSTOMER_FEEDBACK";
    ManualEntryType["BONUS_POINTS"] = "BONUS_POINTS";
    ManualEntryType["MANUAL_SCORE_EDIT"] = "MANUAL_SCORE_EDIT";
})(ManualEntryType || (exports.ManualEntryType = ManualEntryType = {}));
// Shift planning types
var ShiftPlanStatus;
(function (ShiftPlanStatus) {
    ShiftPlanStatus["Planned"] = "PLANNED";
    ShiftPlanStatus["Active"] = "ACTIVE";
    ShiftPlanStatus["Completed"] = "COMPLETED";
    ShiftPlanStatus["Cancelled"] = "CANCELLED";
})(ShiftPlanStatus || (exports.ShiftPlanStatus = ShiftPlanStatus = {}));
var RecurringPattern;
(function (RecurringPattern) {
    RecurringPattern["None"] = "NONE";
    RecurringPattern["Daily"] = "DAILY";
    RecurringPattern["Weekly"] = "WEEKLY";
    RecurringPattern["Monthly"] = "MONTHLY";
})(RecurringPattern || (exports.RecurringPattern = RecurringPattern = {}));
