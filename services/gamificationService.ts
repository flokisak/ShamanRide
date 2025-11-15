import { supabaseService } from './supabaseClient';
import { AchievementType, DriverScore, Achievement, DriverStats, ManualEntry, ManualEntryType } from '../types';

export class GamificationService {
  // Výpočet skóre pro řidiče na základě dokončených jízd
  static async calculateDriverScore(driverId: number, driverName: string): Promise<DriverScore> {
    // Získat všechny dokončené jízdy řidiče
    const allRides = await supabaseService.getRideLogs();
    const driverRides = allRides.filter(ride =>
      ride.vehicleId === driverId &&
      ride.status === 'COMPLETED' &&
      ride.vehicleName &&
      ride.driverName === driverName
    );

    // Výpočet jednotlivých skóre komponent
    const fuelEfficiencyScore = await this.calculateFuelEfficiencyScore(driverRides);
    const customerCountScore = this.calculateCustomerCountScore(driverRides);
    const revenueScore = this.calculateRevenueScore(driverRides);
    const perfectRidesScore = this.calculatePerfectRidesScore(driverRides);
    const acceptanceTimeScore = this.calculateAcceptanceTimeScore(driverRides);
    const deerCollisionScore = await this.calculateDeerCollisionScore(driverId);
    const manualEntryScore = await this.calculateManualEntryScore(driverId);

    // Celkové skóre (vážený průměr) - přidána komponenta pro čas přijetí jízd
    const totalScore = Math.round(
      fuelEfficiencyScore * 0.15 +
      customerCountScore * 0.10 +
      revenueScore * 0.10 +
      perfectRidesScore * 0.15 +
      acceptanceTimeScore * 0.20 +
      deerCollisionScore * 0.10 +
      manualEntryScore * 0.20
    );

    const scoreData: DriverScore = {
      driver_id: driverId,
      driver_name: driverName,
      total_score: totalScore,
      fuel_efficiency_score: fuelEfficiencyScore,
      customer_count_score: customerCountScore,
      revenue_score: revenueScore,
      perfect_rides_score: perfectRidesScore,
      acceptance_time_score: acceptanceTimeScore,
      deer_collision_score: deerCollisionScore,
      rank: 0, // Bude nastaveno později při získání všech skóre
      updated_at: new Date().toISOString()
    };

    // average_rating field now exists in the database schema

    // Uložit skóre do databáze
    try {
      await supabaseService.updateDriverScore(driverId, scoreData);
    } catch (error) {
      console.error('Failed to update driver score:', error);
      // Don't throw - gamification is optional
    }

    // Aktualizovat statistiky
    await this.updateDriverStats(driverId, driverRides);

    // Zkontrolovat achievement
    await this.checkAchievements(driverId, scoreData, driverRides);

    return scoreData;
  }

  // Výpočet skóre pro úsporu paliva (čím nižší spotřeba, tím vyšší skóre)
  private static async calculateFuelEfficiencyScore(rides: any[]): Promise<number> {
    if (rides.length === 0) return 0;

    const ridesWithData = rides.filter(ride => ride.distance && ride.distance > 0 && ride.vehicleId);
    if (ridesWithData.length === 0) return 50; // Výchozí skóre

    try {
      const vehicles = await supabaseService.getVehicles();
      let totalEfficiencyRatio = 0;
      let validRidesCount = 0;

      for (const ride of ridesWithData) {
        const vehicle = vehicles.find(v => v.id === ride.vehicleId);
        if (!vehicle || !vehicle.fuelConsumption) continue;

        const actualDistance = ride.distance; // in km
        const expectedFuelUsed = (vehicle.fuelConsumption / 100) * actualDistance; // L

        // Get fuel price for cost calculation
        const fuelPrices = await supabaseService.getFuelPrices();
        const fuelPrice = fuelPrices[vehicle.fuelType || 'DIESEL'];

        const expectedFuelCost = expectedFuelUsed * fuelPrice;

        // If we have actual fuel cost, compare efficiency
        if (ride.fuelCost && ride.fuelCost > 0) {
          const efficiencyRatio = expectedFuelCost / ride.fuelCost; // > 1 means more efficient than expected
          totalEfficiencyRatio += efficiencyRatio;
          validRidesCount++;
        } else {
          // If no fuel cost data, assume standard efficiency
          totalEfficiencyRatio += 1.0;
          validRidesCount++;
        }
      }

      if (validRidesCount === 0) return 50;

      const avgEfficiencyRatio = totalEfficiencyRatio / validRidesCount;

      // Convert to score: 1.0 = 50 points, higher efficiency = higher score
      const efficiencyScore = Math.max(0, Math.min(100, 50 + (avgEfficiencyRatio - 1.0) * 50));

      return Math.round(efficiencyScore);
    } catch (error) {
      console.error('Error calculating fuel efficiency:', error);
      return 50; // Fallback score
    }
  }

  // Výpočet skóre pro počet přepravených klientů
  private static calculateCustomerCountScore(rides: any[]): number {
    const totalCustomers = rides.reduce((sum, ride) => sum + (ride.passengers || 1), 0);

    // Skóre na základě počtu klientů (max 100 bodů za 1000 klientů)
    const score = Math.min(100, (totalCustomers / 10));

    return Math.round(score);
  }

  // Výpočet skóre pro příjmy
  private static calculateRevenueScore(rides: any[]): number {
    const totalRevenue = rides.reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);

    // Skóre na základě příjmů (max 100 bodů za 100 000 Kč)
    const score = Math.min(100, (totalRevenue / 1000));

    return Math.round(score);
  }

  // Výpočet skóre pro perfektní jízdy (bez problémů)
  private static calculatePerfectRidesScore(rides: any[]): number {
    if (rides.length === 0) return 0;

    // Perfektní jízda = dokončená jízda přijatá do 1 minuty bez zrušení
    const perfectRides = rides.filter(ride => {
      if (ride.status !== 'COMPLETED') return false;

      // Check if ride was accepted within 1 minute
      if (!ride.acceptedAt || !ride.timestamp) return false;
      const acceptanceTime = (ride.acceptedAt - ride.timestamp) / 1000 / 60; // minutes
      return acceptanceTime <= 1;
    });
    const perfectRatio = perfectRides.length / rides.length;

    return Math.round(perfectRatio * 100);
  }

  // Výpočet skóre pro rychlost přijetí jízd
  private static calculateAcceptanceTimeScore(rides: any[]): number {
    if (rides.length === 0) return 0;

    let totalPoints = 0;
    let validRides = 0;

    for (const ride of rides) {
      if (ride.status === 'COMPLETED' && ride.acceptedAt && ride.timestamp) {
        const acceptanceTime = (ride.acceptedAt - ride.timestamp) / 1000 / 60; // minutes

        let points = 0;
        if (acceptanceTime <= 1) {
          points = 10; // Accepted within 1 minute
        } else if (acceptanceTime <= 3) {
          points = 5;  // Accepted within 3 minutes
        } else if (acceptanceTime <= 5) {
          points = 2;  // Accepted within 5 minutes
        }
        // 0 points if not accepted within 5 minutes

        totalPoints += points;
        validRides++;
      }
    }

    if (validRides === 0) return 0;

    // Average points per ride, scaled to 0-100
    const averagePoints = totalPoints / validRides;
    return Math.round(Math.min(100, averagePoints * 10)); // Max 100 points
  }

  // Easter egg - skóre pro "sražené srnky" (na základě reálných incidentů)
  private static async calculateDeerCollisionScore(driverId: number): Promise<number> {
    try {
      // Count deer collisions from manual entries
      const manualEntries = await supabaseService.getManualEntries(driverId);
      const deerCollisions = manualEntries.filter(entry =>
        entry.type === 'DEER_COLLISION' && entry.points > 0
      ).length;

      // Also check ride notes for mentions of deer or incidents
      const allRides = await supabaseService.getRideLogs();
      const driverRides = allRides.filter(ride =>
        ride.vehicleId === driverId &&
        ride.status === 'COMPLETED' &&
        ride.notes
      );

      const incidentMentions = driverRides.filter(ride => {
        const notes = ride.notes?.toLowerCase() || '';
        return notes.includes('srn') || notes.includes('deer') ||
               notes.includes('nehoda') || notes.includes('accident') ||
               notes.includes('incident') || notes.includes('kolize');
      }).length;

      const totalIncidents = deerCollisions + incidentMentions;

      // Čím více incidentů, tím vyšší skóre (perverzní logika pro easter egg)
      return Math.min(100, totalIncidents * 10);
    } catch (error) {
      console.error('Error calculating deer collision score:', error);
      return 0;
    }
  }

  // Výpočet skóre z manuálních záznamů
  private static async calculateManualEntryScore(driverId: number): Promise<number> {
    const manualEntries = await supabaseService.getManualEntries(driverId);
    const totalPoints = manualEntries.reduce((sum: number, entry: ManualEntry) => sum + entry.points, 0);

    // Normalizace na škálu 0-100 bodů (max 1000 bodů = 100 skóre)
    return Math.min(100, totalPoints / 10);
  }

  // Aktualizace detailních statistik řidiče
  private static async updateDriverStats(driverId: number, rides: any[]): Promise<void> {
    const manualEntries = await supabaseService.getManualEntries(driverId);
    const manualEntriesPoints = manualEntries.reduce((sum: number, entry: ManualEntry) => sum + entry.points, 0);

    // Calculate real deer collisions from manual entries and ride notes
    const deerCollisions = manualEntries.filter(entry =>
      entry.type === ManualEntryType.DEER_COLLISION && entry.points > 0
    ).length;

    const incidentMentions = rides.filter(ride => {
      const notes = ride.notes?.toLowerCase() || '';
      return notes.includes('srn') || notes.includes('deer') ||
             notes.includes('nehoda') || notes.includes('accident') ||
             notes.includes('incident') || notes.includes('kolize');
    }).length;

    const stats: Partial<DriverStats> = {
      total_rides: rides.length,
      total_customers: rides.reduce((sum, ride) => sum + (ride.passengers || 1), 0),
      total_revenue: rides.reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0),
      perfect_rides_count: rides.filter(ride => ride.status === 'COMPLETED').length,
      deer_collisions: deerCollisions + incidentMentions,
      longest_streak: this.calculateLongestStreak(rides),
      night_rides_count: rides.filter(ride => this.isNightRide(ride.timestamp)).length,
      total_paid_km: rides.reduce((sum, ride) => sum + ((ride.passengers && ride.passengers > 0) ? (ride.distance || 0) : 0), 0),
      total_empty_km: rides.reduce((sum, ride) => sum + ((ride.passengers && ride.passengers > 0) ? 0 : (ride.distance || 0)), 0),
      manual_entries_points: manualEntriesPoints
    };

    // average_rating field now exists in the database schema

    // Výpočet průměrné spotřeby paliva (skutečná spotřeba v L/100km)
    try {
      const vehicles = await supabaseService.getVehicles();
      const fuelPrices = await supabaseService.getFuelPrices();

      let totalFuelUsed = 0;
      let totalDistance = 0;

      for (const ride of rides) {
        if (ride.distance && ride.distance > 0 && ride.vehicleId) {
          const vehicle = vehicles.find(v => v.id === ride.vehicleId);
          if (vehicle?.fuelConsumption) {
            // Calculate actual fuel used based on distance and vehicle consumption
            const fuelUsed = (vehicle.fuelConsumption / 100) * ride.distance;
            totalFuelUsed += fuelUsed;
            totalDistance += ride.distance;
          }
        }
      }

      if (totalDistance > 0) {
        stats.average_fuel_efficiency = (totalFuelUsed / totalDistance) * 100; // L/100km
      }
    } catch (error) {
      console.error('Error calculating average fuel efficiency:', error);
    }

    try {
      await supabaseService.updateDriverStats(driverId, stats);
    } catch (error) {
      console.error('Failed to update driver stats:', error);
      // Don't throw - gamification is optional
    }
  }

  // Kontrola a přidělení achievement
  private static async checkAchievements(driverId: number, scoreData: DriverScore, rides: any[]): Promise<void> {
    const existingAchievements = await supabaseService.getDriverAchievements(driverId);
    const achievementTypes = existingAchievements.map(a => a.type);

    const newAchievements: Partial<Achievement>[] = [];

    // Achievement za nízkou spotřebu
    if (scoreData.fuel_efficiency_score >= 80 && !achievementTypes.includes(AchievementType.FUEL_EFFICIENCY)) {
      newAchievements.push({
        driver_id: driverId,
        type: AchievementType.FUEL_EFFICIENCY,
        title: 'Šetřílek',
        description: 'Dosáhl skóre efektivity paliva 80+ bodů',
        icon: '🚗',
        rarity: 'rare',
        unlocked_at: new Date().toISOString()
      });
    }

    // Achievement za mnoho klientů
    if (scoreData.customer_count_score >= 80 && !achievementTypes.includes(AchievementType.CUSTOMER_COUNT)) {
      newAchievements.push({
        driver_id: driverId,
        type: AchievementType.CUSTOMER_COUNT,
        title: 'Oblíbenec',
        description: 'Přepravil 800+ klientů',
        icon: '👥',
        rarity: 'epic',
        unlocked_at: new Date().toISOString()
      });
    }

    // Achievement za perfektní jízdy
    if (scoreData.perfect_rides_score >= 90 && !achievementTypes.includes(AchievementType.PERFECT_RIDES)) {
      newAchievements.push({
        driver_id: driverId,
        type: AchievementType.PERFECT_RIDES,
        title: 'Dokonalý řidič',
        description: '90%+ jízd přijatých do 1 minuty a dokončených bez zrušení',
        icon: '⭐',
        rarity: 'legendary',
        unlocked_at: new Date().toISOString()
      });
    }

    // Achievement za rychlé přijetí jízd
    if (scoreData.acceptance_time_score >= 80 && !achievementTypes.includes(AchievementType.FAST_ACCEPTANCE)) {
      newAchievements.push({
        driver_id: driverId,
        type: AchievementType.FAST_ACCEPTANCE,
        title: 'Bleskový reakční čas',
        description: 'Průměrné skóre rychlosti přijetí 80+ bodů',
        icon: '⚡',
        rarity: 'rare',
        unlocked_at: new Date().toISOString()
      });
    }

    // Easter egg achievement za srnky
    if (scoreData.deer_collision_score >= 50 && !achievementTypes.includes(AchievementType.DEER_MASTER)) {
      newAchievements.push({
        driver_id: driverId,
        type: AchievementType.DEER_MASTER,
        title: 'Mistr srnek',
        description: 'Srazil 5+ srnek (nebo možná jen viděl hodně srnek)',
        icon: '🦌',
        rarity: 'epic',
        unlocked_at: new Date().toISOString()
      });
    }

    // Přidat nové achievement
    for (const achievement of newAchievements) {
      await supabaseService.addAchievement({
        ...achievement,
        id: `${driverId}_${achievement.type}_${Date.now()}`
      });
    }
  }

  // Pomocné metody
  private static calculateLongestStreak(rides: any[]): number {
    if (rides.length === 0) return 0;

    // Seřadit jízdy podle času
    const sortedRides = rides.sort((a, b) => a.timestamp - b.timestamp);

    let currentStreak = 1;
    let longestStreak = 1;

    for (let i = 1; i < sortedRides.length; i++) {
      const timeDiff = sortedRides[i].timestamp - sortedRides[i-1].timestamp;
      // Pokud je rozdíl menší než 2 hodiny, počítá se jako souvislá série
      if (timeDiff < 2 * 60 * 60 * 1000) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return longestStreak;
  }

  private static isNightRide(timestamp: number): boolean {
    const date = new Date(timestamp);
    const hour = date.getHours();
    return hour >= 22 || hour <= 6; // Noc = 22:00 - 06:00
  }

  // Získat leaderboard všech řidičů
  static async getLeaderboard(): Promise<DriverScore[]> {
    const scores = await supabaseService.getDriverScores();

    // Přidat pořadí
    return scores.map((score, index) => ({
      ...score,
      rank: index + 1
    }));
  }

  // Aktualizovat skóre pro všechny řidiče
  static async recalculateAllScores(): Promise<void> {
    const people = await supabaseService.getPeople();
    const drivers = people.filter(person => person.role === 'DRIVER');

    for (const driver of drivers) {
      await this.calculateDriverScore(driver.id, driver.name);
    }
  }
}
