-- Shift Planning Table
-- This table stores planned shifts for drivers

CREATE TABLE IF NOT EXISTS shift_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id INTEGER NOT NULL REFERENCES people(id),
  driver_name TEXT,
  planned_start TIMESTAMP WITH TIME ZONE NOT NULL,
  planned_end TIMESTAMP WITH TIME ZONE NOT NULL,
  actual_start TIMESTAMP WITH TIME ZONE,
  actual_end TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  notes TEXT,
  recurring_pattern TEXT DEFAULT 'NONE' CHECK (recurring_pattern IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY')),
  recurring_end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shift_plans_driver_id ON shift_plans(driver_id);
CREATE INDEX IF NOT EXISTS idx_shift_plans_planned_start ON shift_plans(planned_start);
CREATE INDEX IF NOT EXISTS idx_shift_plans_status ON shift_plans(status);
CREATE INDEX IF NOT EXISTS idx_shift_plans_date_range ON shift_plans(planned_start, planned_end);

-- RLS (Row Level Security) policies
ALTER TABLE shift_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own shifts (if they are drivers)
-- Dispatchers and management can view all shifts
CREATE POLICY "Users can view own shifts" ON shift_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'driverId')::text = shift_plans.driver_id::text
    )
    OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'role') IN ('Dispatcher', 'Management')
    )
  );

-- Policy: Users can insert their own shifts
-- Dispatchers and management can insert shifts for any driver
CREATE POLICY "Users can insert own shifts" ON shift_plans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'driverId')::text = driver_id::text
    )
    OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'role') IN ('Dispatcher', 'Management')
    )
  );

-- Policy: Users can update their own shifts
-- Dispatchers and management can update any shift
CREATE POLICY "Users can update own shifts" ON shift_plans
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'driverId')::text = shift_plans.driver_id::text
    )
    OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'role') IN ('Dispatcher', 'Management')
    )
  );

-- Policy: Users can delete their own shifts
-- Dispatchers and management can delete any shift
CREATE POLICY "Users can delete own shifts" ON shift_plans
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'driverId')::text = shift_plans.driver_id::text
    )
    OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'role') IN ('Dispatcher', 'Management')
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_shift_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER shift_plans_updated_at
  BEFORE UPDATE ON shift_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_shift_plans_updated_at();

-- Comments for documentation
COMMENT ON TABLE shift_plans IS 'Table for storing planned driver shifts with scheduling and recurring patterns';
COMMENT ON COLUMN shift_plans.id IS 'Unique identifier for the shift plan';
COMMENT ON COLUMN shift_plans.driver_id IS 'Reference to the driver assigned to this shift';
COMMENT ON COLUMN shift_plans.driver_name IS 'Cached driver name for performance';
COMMENT ON COLUMN shift_plans.planned_start IS 'Planned start time of the shift';
COMMENT ON COLUMN shift_plans.planned_end IS 'Planned end time of the shift';
COMMENT ON COLUMN shift_plans.actual_start IS 'Actual start time when shift begins';
COMMENT ON COLUMN shift_plans.actual_end IS 'Actual end time when shift ends';
COMMENT ON COLUMN shift_plans.status IS 'Current status of the shift (PLANNED, ACTIVE, COMPLETED, CANCELLED)';
COMMENT ON COLUMN shift_plans.notes IS 'Optional notes about the shift';
COMMENT ON COLUMN shift_plans.recurring_pattern IS 'Pattern for recurring shifts (NONE, DAILY, WEEKLY, MONTHLY)';
COMMENT ON COLUMN shift_plans.recurring_end_date IS 'End date for recurring pattern';
COMMENT ON COLUMN shift_plans.created_at IS 'Timestamp when the shift plan was created';
COMMENT ON COLUMN shift_plans.updated_at IS 'Timestamp when the shift plan was last updated';