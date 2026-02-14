-- Add capacity tracking to airbears table
ALTER TABLE airbears
ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS current_riders INTEGER NOT NULL DEFAULT 0;

-- Add passengers to rides table
ALTER TABLE rides
ADD COLUMN IF NOT EXISTS passengers INTEGER NOT NULL DEFAULT 1;

-- Add constraint to ensure current_riders doesn't exceed capacity
ALTER TABLE airbears
ADD CONSTRAINT check_riders_within_capacity
CHECK (current_riders >= 0 AND current_riders <= capacity);

-- Add constraint to ensure passengers is between 1 and 5
ALTER TABLE rides
ADD CONSTRAINT check_passengers_range
CHECK (passengers >= 1 AND passengers <= 5);

-- Comment for clarity
COMMENT ON COLUMN airbears.capacity IS 'Maximum number of riders per AirBear (default 5)';
COMMENT ON COLUMN airbears.current_riders IS 'Current number of passengers on board';
COMMENT ON COLUMN rides.passengers IS 'Number of riders for this ride ($4 per person)';
