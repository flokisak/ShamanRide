import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { OrderModal } from './components/OrderModal';
import { Vehicle, Person, MessagingApp, VehicleType, VehicleStatus, PersonRole, FuelType } from './types';
import { LanguageProvider } from './contexts/LanguageContext';
import { SUPABASE_ENABLED, supabaseService } from './services/supabaseClient';

// Initial data for people
const initialPeople: Person[] = [
    { id: 1, name: 'Pavel Osička', phone: '736 168 796', role: PersonRole.Driver },
    { id: 2, name: 'Kuba', phone: '739 355 521', role: PersonRole.Driver },
    { id: 3, name: 'Kamil', phone: '730 635 302', role: PersonRole.Driver },
    { id: 4, name: 'Bubu', phone: '720 581 006', role: PersonRole.Driver },
    { id: 5, name: 'Adam', phone: '777 807 874', role: PersonRole.Driver },
    { id: 6, name: 'Honza', phone: '720 758 823', role: PersonRole.Driver },
    { id: 7, name: 'Vlado', phone: '792 892 655', role: PersonRole.Driver },
    { id: 8, name: 'Tomáš', phone: '773 567 403', role: PersonRole.Driver },
    { id: 9, name: 'René', phone: '776 203 667', role: PersonRole.Driver },
    { id: 10, name: 'Katka', phone: '603 172 900', role: PersonRole.Driver },
    { id: 11, name: 'Roman Michl', phone: '770 625 798', role: PersonRole.Management },
    { id: 12, name: 'Tomáš Michl', phone: '728 548 373', role: PersonRole.Management },
    { id: 13, name: 'Jirka', phone: '721 212 124', role: PersonRole.Dispatcher },
    { id: 14, name: 'Lukáš', phone: '702 020 505', role: PersonRole.Dispatcher },
];

// Initial mock data for vehicles
const initialVehicles: Vehicle[] = [
  { id: 1, name: 'Škoda Superb #1', driverId: 1, licensePlate: '3J2 1234', type: VehicleType.Car, status: VehicleStatus.Available, location: 'Náměstí, Mikulov', capacity: 4, mileage: 150000, serviceInterval: 30000, lastServiceMileage: 145000, technicalInspectionExpiry: '2025-08-15', vignetteExpiry: '2025-01-31', fuelType: FuelType.Diesel, fuelConsumption: 6.5 },
  { id: 2, name: 'VW Passat #2', driverId: 2, licensePlate: '5B8 4567', type: VehicleType.Car, status: VehicleStatus.Available, location: 'Dukelské náměstí, Hustopeče', capacity: 4, mileage: 89000, serviceInterval: 30000, lastServiceMileage: 85000, technicalInspectionExpiry: '2024-11-20', vignetteExpiry: '2025-01-31', fuelType: FuelType.Diesel, fuelConsumption: 7.1 },
  { id: 3, name: 'Toyota Camry #3', driverId: 3, licensePlate: '1AX 8910', type: VehicleType.Car, status: VehicleStatus.Busy, location: 'Svatý kopeček, Mikulov', capacity: 4, freeAt: Date.now() + 15 * 60 * 1000, mileage: 45000, serviceInterval: 15000, lastServiceMileage: 40000, technicalInspectionExpiry: '2026-03-10', vignetteExpiry: '2025-01-31', fuelType: FuelType.Petrol, fuelConsumption: 8.5 },
  { id: 4, name: 'Ford Transit VAN', driverId: 4, licensePlate: '8E1 1121', type: VehicleType.Van, status: VehicleStatus.Available, location: 'Herbenova, Hustopeče', capacity: 8, mileage: 210000, serviceInterval: 40000, lastServiceMileage: 205000, technicalInspectionExpiry: '2025-05-01', vignetteExpiry: '2025-01-31', fuelType: FuelType.Diesel, fuelConsumption: 9.2 },
  { id: 5, name: 'Škoda Octavia #4', driverId: 5, licensePlate: '2CD 5678', type: VehicleType.Car, status: VehicleStatus.Available, location: 'Brněnská, Hustopeče', capacity: 4, mileage: 119500, serviceInterval: 30000, lastServiceMileage: 90000, technicalInspectionExpiry: '2024-09-30', vignetteExpiry: '2025-01-31', fuelType: FuelType.Diesel, fuelConsumption: 5.8 },
  { id: 6, name: 'Hyundai i30 #5', driverId: 6, licensePlate: '3EF 9012', type: VehicleType.Car, status: VehicleStatus.Available, location: 'Nádražní, Mikulov', capacity: 4, mileage: 62000, serviceInterval: 20000, lastServiceMileage: 60000, technicalInspectionExpiry: '2025-10-01', vignetteExpiry: '2025-01-31', fuelType: FuelType.Petrol, fuelConsumption: 7.5 },
  { id: 7, name: 'Renault Trafic VAN', driverId: 7, licensePlate: '4GH 3456', type: VehicleType.Van, status: VehicleStatus.Available, location: 'Pavlov', capacity: 8, mileage: 135000, serviceInterval: 40000, lastServiceMileage: 120000, technicalInspectionExpiry: '2025-02-28', vignetteExpiry: '2025-01-31', fuelType: FuelType.Diesel, fuelConsumption: 8.8 },
  { id: 8, name: 'VW Caddy #6', driverId: 8, licensePlate: '5IJ 7890', type: VehicleType.Car, status: VehicleStatus.Available, location: 'Zaječí', capacity: 4, mileage: 95000, serviceInterval: 30000, lastServiceMileage: 90000, technicalInspectionExpiry: '2025-07-15', vignetteExpiry: '2025-01-31', fuelType: FuelType.Diesel, fuelConsumption: 6.2 },
  { id: 9, name: 'Mercedes-Benz Vito', driverId: 9, licensePlate: '6KL 1234', type: VehicleType.Van, status: VehicleStatus.Available, location: 'Klentnice', capacity: 8, mileage: 180000, serviceInterval: 50000, lastServiceMileage: 175000, technicalInspectionExpiry: '2026-01-10', vignetteExpiry: '2025-01-31', fuelType: FuelType.Diesel, fuelConsumption: 9.5 },
  { id: 10, name: 'Škoda Fabia #7', driverId: 10, licensePlate: '7MN 5678', type: VehicleType.Car, status: VehicleStatus.Available, location: 'Sedlec', capacity: 4, mileage: 78000, serviceInterval: 30000, lastServiceMileage: 70000, technicalInspectionExpiry: '2025-12-01', vignetteExpiry: '2025-01-31', fuelType: FuelType.Petrol, fuelConsumption: 6.8 },
];

const ShamanIcon: React.FC<{ className?: string, size?: number }> = ({ className, size = 32 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M17.25 10.25L12 2L6.75 10.25L12 12.75L17.25 10.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6.75 13.75L12 22L17.25 13.75L12 11.25L6.75 13.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const LandingPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Initialize defaults either in Supabase (when enabled) or localStorage
    useEffect(() => {
        const init = async () => {
            if (SUPABASE_ENABLED) {
                try {
                    const ppl = await supabaseService.getPeople();
                    if (!ppl || (Array.isArray(ppl) && ppl.length === 0)) {
                        await supabaseService.updatePeople(initialPeople as any);
                    }
                    const veh = await supabaseService.getVehicles();
                    if (!veh || (Array.isArray(veh) && veh.length === 0)) {
                        await supabaseService.updateVehicles(initialVehicles as any);
                    }
                    const tf = await supabaseService.getTariff();
                    if (!tf) {
                        await supabaseService.updateTariff({
                            startingFee: 50,
                            pricePerKmCar: 40,
                            pricePerKmVan: 60,
                            flatRates: [
                                { id: 1, name: "V rámci Hustopečí", priceCar: 80, priceVan: 120 },
                                { id: 2, name: "V rámci Mikulova", priceCar: 100, priceVan: 150 },
                                { id: 3, name: "Zaječí - diskotéka Retro", priceCar: 200, priceVan: 300 },
                            ],
                            timeBasedTariffs: [],
                        });
                    }
                    const fp = await supabaseService.getFuelPrices();
                    if (!fp) {
                        await supabaseService.updateFuelPrices({ DIESEL: 37.5, PETROL: 38.9 });
                    }
                    const ma = await supabaseService.getMessagingApp();
                    if (!ma) {
                        await supabaseService.updateMessagingApp('SMS' as any);
                    }
                    const ci = await supabaseService.getCompanyInfo();
                    if (!ci) {
                        await supabaseService.updateCompanyInfo({
                            name: 'ShamanRide',
                            address: 'Mikulov, Česká republika',
                            phone: '+420 728 548 373',
                            email: 'info@shamanride.cz',
                            ico: '12345678',
                            dic: 'CZ12345678',
                            logoUrl: null,
                        });
                    }
                } catch (err) {
                    console.error('Error initializing Supabase defaults', err);
                }
                return;
            }

            // For local mode, `supabaseService` already provides a localStorage fallback.
            // Ensure defaults exist via service (idempotent):
            try {
                await supabaseService.getPeople().then(async (ppl) => { if (!ppl || (Array.isArray(ppl) && ppl.length === 0)) await supabaseService.updatePeople(initialPeople as any); });
                await supabaseService.getVehicles().then(async (v) => { if (!v || (Array.isArray(v) && v.length === 0)) await supabaseService.updateVehicles(initialVehicles as any); });
                await supabaseService.getTariff().then(async (tf) => { if (!tf) await supabaseService.updateTariff({ startingFee: 50, pricePerKmCar: 40, pricePerKmVan: 60, flatRates: [ { id: 1, name: "V rámci Hustopečí", priceCar: 80, priceVan: 120 }, { id: 2, name: "V rámci Mikulova", priceCar: 100, priceVan: 150 }, { id: 3, name: "Zaječí - diskotéka Retro", priceCar: 200, priceVan: 300 }, ], timeBasedTariffs: [], }); });
                await supabaseService.getFuelPrices().then(async (fp) => { if (!fp) await supabaseService.updateFuelPrices({ DIESEL: 37.5, PETROL: 38.9 }); });
                await supabaseService.getMessagingApp().then(async (ma) => { if (!ma) await supabaseService.updateMessagingApp('SMS' as any); });
                await supabaseService.getCompanyInfo().then(async (ci) => { if (!ci) await supabaseService.updateCompanyInfo({ name: 'ShamanRide', address: 'Mikulov, Česká republika', phone: '+420 728 548 373', email: 'info@shamanride.cz', ico: '12345678', dic: 'CZ12345678', logoUrl: null, }); });
            } catch (err) {
                console.error('Error ensuring local defaults via supabaseService', err);
            }
        };
        init();
    }, []);
    
    const services = [
        { title: "Městské jízdy", description: "Rychlá a spolehlivá doprava po Mikulově, Hustopečích a okolních obcích." },
        { title: "Letištní transfery", description: "Pohodlné transfery na letiště v Praze, Vídni a Bratislavě." },
        { title: "Drink & Drive", description: "Bezpečně vás i váš vůz odvezeme domů z večírku nebo oslavy." },
        { title: "Přeprava pro skupiny", description: "Naše vícemístné vozy jsou ideální pro výlety, svatby a firemní akce." },
    ];
    
    return (
        <div className="min-h-screen hero-bg">
            <header className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="logo-brand">
                        <div className="logo-badge"><ShamanIcon className="text-[#88C0D0] w-8 h-8" /></div>
                        <div>
                           <div className="brand-title">Shaman<span className="text-[#88C0D0]">Ride</span></div>
                          <div className="brand-subtle">Taxi Mikulov & Hustopeče</div>
                        </div>
                    </div>
                <a href="/app.html" className="px-4 py-2 text-sm font-medium rounded-md border border-[#81A1C1] text-[#81A1C1] hover:bg-[#81A1C1] hover:text-slate-900 transition-colors">
                    Přihlášení pro dispečery
                </a>
            </header>

            <main>
                <section className="container mx-auto px-6 py-24 text-center">
                    <h2 className="text-4xl md:text-6xl font-extrabold text-white leading-tight" style={{ textShadow: '0 0 15px rgba(136, 192, 208, 0.5)' }}>
                        Vaše jízda budoucnosti, dnes.
                    </h2>
                    <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-300">
                        Spolehlivá a rychlá taxislužba v Mikulově, Hustopečích a okolí. Objednejte si odvoz na pár kliknutí.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                                                    <button onClick={() => setIsModalOpen(true)} className="btn-cta w-full sm:w-auto bg-gradient-to-r from-[#A3BE8C] to-[#8FBCBB] text-slate-900 font-bold text-xl px-10 py-4 rounded-lg shadow-lg border-2 border-[#A3BE8C]">
                            🚕 Objednat online
                        </button>
                                                <a href="tel:+420728548373" className="btn-cta w-full sm:w-auto bg-gradient-to-r from-[#81A1C1] to-[#5E81AC] text-slate-900 font-bold text-xl px-10 py-4 rounded-lg shadow-lg border-2 border-[#81A1C1]">
                            📞 Zavolat: 728 548 373
                        </a>
                    </div>
                </section>

                <section id="services" className="py-20 bg-slate-900/50">
                    <div className="container mx-auto px-6">
                        <h3 className="text-3xl font-bold text-center text-white mb-12">Naše Služby</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            {services.map(service => (
                                <div key={service.title} className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                                    <h4 className="text-xl font-semibold text-[#81A1C1] mb-2">{service.title}</h4>
                                    <p className="text-gray-400">{service.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <footer className="container mx-auto px-6 py-8 text-center text-gray-500">
                <p>&copy; {new Date().getFullYear()} ShamanRide. Všechna práva vyhrazena.</p>
                <p className="mt-2">Kontakt: <a href="tel:+420728548373" className="hover:text-[#81A1C1]">728 548 373</a> | <a href="mailto:info@shamanride.cz" className="hover:text-[#81A1C1]">info@shamanride.cz</a></p>
            </footer>

            {isModalOpen && <OrderModal onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <LandingPage />
    </LanguageProvider>
  </React.StrictMode>
);