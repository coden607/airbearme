/**
 * AirBear fare, distance, and ride-lifecycle logic.
 *
 * Pure functions only — no I/O, no network. Wired into the ride routes so
 * fares and eco rewards are computed server-side instead of trusted from
 * the client.
 */

export interface LatLng {
  latitude: number | string;
  longitude: number | string;
}

/** Earth radius in miles. */
const EARTH_RADIUS_MILES = 3958.8;

/**
 * Great-circle distance between two coordinates, in miles.
 * Accepts decimal strings (schema uses decimal columns) or numbers.
 */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const lat1 = Number(a.latitude);
  const lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lon2 = Number(b.longitude);
  if ([lat1, lon1, lat2, lon2].some((v) => !Number.isFinite(v))) {
    throw new Error("Invalid coordinates for distance calculation");
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** Flat booking fee applied to every ride. */
export const BASE_FARE_USD = 1.5;

/** Per-passenger minimum, matching the "$4 per passenger" model in the schema. */
export const MIN_FARE_PER_PASSENGER_USD = 4;

/** Per-mile rate on top of the base fare. */
export const PER_MILE_USD = 1.75;

/** Miles below which the per-passenger minimum applies. */
const MINIMUM_BILL_MILES = 1;

export interface FareQuote {
  /** Total fare in dollars, 2dp string ready for the decimal column. */
  fare: string;
  distanceMiles: number;
  distanceKm: string;
  passengers: number;
}

/**
 * Server-side fare quote for a ride between two spots.
 * Enforces the per-passenger minimum: short hops never bill below
 * MIN_FARE_PER_PASSENGER_USD * passengers.
 */
export function quoteRide(
  pickup: LatLng,
  dropoff: LatLng,
  passengers = 1,
): FareQuote {
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 8) {
    throw new Error("Passengers must be an integer between 1 and 8");
  }
  const distanceMiles = haversineMiles(pickup, dropoff);
  const variable = BASE_FARE_USD + distanceMiles * PER_MILE_USD;
  const minimum = MIN_FARE_PER_PASSENGER_USD * passengers;
  const billable =
    distanceMiles < MINIMUM_BILL_MILES
      ? minimum
      : Math.max(variable, minimum);
  const fare = billable.toFixed(2);
  return {
    fare,
    distanceMiles,
    distanceKm: (distanceMiles * 1.60934).toFixed(2),
    passengers,
  };
}

/** Average passenger-car emissions: ~404 g CO2 per mile (EPA figure). */
export const CO2_KG_PER_MILE = 0.404;

/** Eco points granted per mile ridden on solar power instead of a car. */
export const ECO_POINTS_PER_MILE = 10;

/** CO2 avoided (kg, 2dp string) for a ride of the given distance. */
export function estimateCo2SavedKg(distanceMiles: number): string {
  if (!Number.isFinite(distanceMiles) || distanceMiles < 0) return "0.00";
  return (distanceMiles * CO2_KG_PER_MILE).toFixed(2);
}

/** Whole eco points for a completed ride. */
export function ecoPointsForRide(distanceMiles: number): number {
  if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) return 0;
  return Math.max(1, Math.round(distanceMiles * ECO_POINTS_PER_MILE));
}

export const RIDE_STATUSES = [
  "awaiting_payment",
  "pending",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export function isRideStatus(value: unknown): value is RideStatus {
  return (
    typeof value === "string" &&
    (RIDE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Legal ride lifecycle. Terminal states: completed, cancelled.
 * A cancelled ride cannot be revived.
 */
export const RIDE_STATUS_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  awaiting_payment: ["pending", "cancelled"],
  pending: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * True when a ride may move from `from` to `to`.
 * Same-status updates (non-status field patches) are always allowed and
 * are handled by the caller before this check.
 */
export function isValidRideTransition(from: RideStatus, to: RideStatus): boolean {
  return RIDE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
