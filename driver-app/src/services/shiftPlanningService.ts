import { ShiftPlan, ShiftPlanStatus, RecurringPattern, Person } from '../types';

export class ShiftPlanningService {
  private supabase: any;
  private baseUrl: string;

  constructor(supabase: any, baseUrl: string = '/api/shift-plans') {
    this.supabase = supabase;
    this.baseUrl = baseUrl;
  }

  // Get all shift plans for a specific driver
  async getDriverShiftPlans(driverId: number, startDate?: Date, endDate?: Date): Promise<ShiftPlan[]> {
    try {
      let query = this.supabase
        .from('shift_plans')
        .select('*')
        .eq('driver_id', driverId)
        .order('planned_start', { ascending: true });

      if (startDate) {
        query = query.gte('planned_start', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('planned_start', endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map(this.mapFromDatabase);
    } catch (error) {
      console.error('Error fetching driver shift plans:', error);
      throw error;
    }
  }

  // Get all shift plans for all drivers (for dispatcher)
  async getAllShiftPlans(startDate?: Date, endDate?: Date): Promise<ShiftPlan[]> {
    try {
      let query = this.supabase
        .from('shift_plans')
        .select(`
          *,
          people!inner(name)
        `)
        .order('planned_start', { ascending: true });

      if (startDate) {
        query = query.gte('planned_start', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('planned_start', endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map((item: any) => ({
        ...this.mapFromDatabase(item),
        driverName: item.people?.name
      }));
    } catch (error) {
      console.error('Error fetching all shift plans:', error);
      throw error;
    }
  }

  // Create a new shift plan
  async createShiftPlan(shiftPlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<ShiftPlan> {
    try {
      const dbData = this.mapToDatabasePartial(shiftPlan);

      const { data, error } = await this.supabase
        .from('shift_plans')
        .insert([dbData])
        .select()
        .single();

      if (error) throw error;

      return this.mapFromDatabase(data);
    } catch (error) {
      console.error('Error creating shift plan:', error);
      throw error;
    }
  }

  // Update an existing shift plan
  async updateShiftPlan(id: string, updates: Partial<ShiftPlan>): Promise<ShiftPlan> {
    try {
      const dbData = this.mapToDatabasePartial(updates);

      const { data, error } = await this.supabase
        .from('shift_plans')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return this.mapFromDatabase(data);
    } catch (error) {
      console.error('Error updating shift plan:', error);
      throw error;
    }
  }

  // Delete a shift plan
  async deleteShiftPlan(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('shift_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting shift plan:', error);
      throw error;
    }
  }

  // Get available drivers for assignment
  async getAvailableDrivers(): Promise<Person[]> {
    try {
      const { data, error } = await this.supabase
        .from('people')
        .select('id, name, phone, role')
        .eq('role', 'Driver')
        .order('name');

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error fetching available drivers:', error);
      throw error;
    }
  }

  // Create recurring shift plans
  async createRecurringShiftPlans(
    basePlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>,
    pattern: RecurringPattern,
    endDate: Date
  ): Promise<ShiftPlan[]> {
    try {
      const plans: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>[] = [];
      const startDate = new Date(basePlan.plannedStart);
      const endDateOnly = new Date(endDate);
      endDateOnly.setHours(23, 59, 59, 999);

      let currentDate = new Date(startDate);

      while (currentDate <= endDateOnly) {
        const planStart = new Date(currentDate);
        const planEnd = new Date(currentDate);

        // Set the times from the base plan
        planStart.setHours(
          startDate.getHours(),
          startDate.getMinutes(),
          startDate.getSeconds()
        );
        planEnd.setHours(
          basePlan.plannedEnd.getHours(),
          basePlan.plannedEnd.getMinutes(),
          basePlan.plannedEnd.getSeconds()
        );

        plans.push({
          ...basePlan,
          plannedStart: planStart,
          plannedEnd: planEnd,
          recurringPattern: pattern
        });

        // Move to next occurrence
        switch (pattern) {
          case RecurringPattern.Daily:
            currentDate.setDate(currentDate.getDate() + 1);
            break;
          case RecurringPattern.Weekly:
            currentDate.setDate(currentDate.getDate() + 7);
            break;
          case RecurringPattern.Monthly:
            currentDate.setMonth(currentDate.getMonth() + 1);
            break;
          default:
            break;
        }
      }

      // Insert all plans
      const dbData = plans.map(plan => this.mapToDatabasePartial(plan));
      const { data, error } = await this.supabase
        .from('shift_plans')
        .insert(dbData)
        .select();

      if (error) throw error;

      return data.map(this.mapFromDatabase);
    } catch (error) {
      console.error('Error creating recurring shift plans:', error);
      throw error;
    }
  }

  // Helper methods to map between database and application models
  private mapFromDatabase(db: any): ShiftPlan {
    return {
      id: db.id,
      driverId: db.driver_id,
      driverName: db.driver_name,
      plannedStart: new Date(db.planned_start),
      plannedEnd: new Date(db.planned_end),
      actualStart: db.actual_start ? new Date(db.actual_start) : undefined,
      actualEnd: db.actual_end ? new Date(db.actual_end) : undefined,
      status: db.status as ShiftPlanStatus,
      notes: db.notes,
      recurringPattern: db.recurring_pattern as RecurringPattern,
      recurringEndDate: db.recurring_end_date ? new Date(db.recurring_end_date) : undefined,
      createdAt: db.created_at,
      updatedAt: db.updated_at
    };
  }

  private mapToDatabase(plan: ShiftPlan): any {
    return {
      driver_id: plan.driverId,
      driver_name: plan.driverName,
      planned_start: plan.plannedStart.toISOString(),
      planned_end: plan.plannedEnd.toISOString(),
      actual_start: plan.actualStart?.toISOString(),
      actual_end: plan.actualEnd?.toISOString(),
      status: plan.status,
      notes: plan.notes,
      recurring_pattern: plan.recurringPattern,
      recurring_end_date: plan.recurringEndDate?.toISOString(),
      created_at: plan.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  private mapToDatabasePartial(plan: Partial<ShiftPlan>): any {
    const dbData: any = {};

    if (plan.driverId !== undefined) dbData.driver_id = plan.driverId;
    if (plan.driverName !== undefined) dbData.driver_name = plan.driverName;
    if (plan.plannedStart !== undefined) dbData.planned_start = plan.plannedStart.toISOString();
    if (plan.plannedEnd !== undefined) dbData.planned_end = plan.plannedEnd.toISOString();
    if (plan.actualStart !== undefined) dbData.actual_start = plan.actualStart.toISOString();
    if (plan.actualEnd !== undefined) dbData.actual_end = plan.actualEnd.toISOString();
    if (plan.status !== undefined) dbData.status = plan.status;
    if (plan.notes !== undefined) dbData.notes = plan.notes;
    if (plan.recurringPattern !== undefined) dbData.recurring_pattern = plan.recurringPattern;
    if (plan.recurringEndDate !== undefined) dbData.recurring_end_date = plan.recurringEndDate.toISOString();

    dbData.updated_at = new Date().toISOString();

    return dbData;
  }
}