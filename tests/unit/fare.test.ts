import { describe, expect, it } from "vitest";

import {
  BASE_FARE_USD,
  CO2_KG_PER_MILE,
  ECO_POINTS_PER_MILE,
  MIN_FARE_PER_PASSENGER_USD,
  RIDE_STATUS_TRANSITIONS,
  ecoPointsForRide,
  estimateCo2SavedKg,
  haversineMiles,
  isRideStatus,
  isValidRideTransition,
  quoteRide,
} from "../../server/fare.ts";

// Two real Binghamton-area reference points, ~3.1 miles apart.
const BINGHAMTON_UNION = { latitude: 42.0987, longitude: -75.9125 };
const OAKDALE_MALL = { latitude: 42.1094, longitude: -75.9631 };

describe("haversineMiles", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMiles(BINGHAMTON_UNION, BINGHAMTON_UNION)).toBe(0);
  });

  it("computes a plausible distance for known coordinates", () => {
    const miles = haversineMiles(BINGHAMTON_UNION, OAKDALE_MALL);
    expect(miles).toBeGreaterThan(2.4);
    expect(miles).toBeLessThan(3.8);
  });

  it("accepts decimal strings from the database", () => {
    const a = { latitude: "42.09870000", longitude: "-75.91250000" };
    const b = { latitude: "42.10940000", longitude: "-75.96310000" };
    expect(haversineMiles(a, b)).toBeCloseTo(
      haversineMiles(BINGHAMTON_UNION, OAKDALE_MALL),
      10,
    );
  });

  it("rejects non-numeric coordinates", () => {
    expect(() =>
      haversineMiles({ latitude: "nope", longitude: 0 }, { latitude: 0, longitude: 0 }),
    ).toThrow("Invalid coordinates");
  });
});

describe("quoteRide", () => {
  it("bills the per-passenger minimum on short hops", () => {
    const quote = quoteRide(BINGHAMTON_UNION, BINGHAMTON_UNION, 2);
    expect(Number(quote.fare)).toBe(MIN_FARE_PER_PASSENGER_USD * 2);
    expect(quote.distanceMiles).toBe(0);
  });

  it("charges distance on longer rides but never below the minimum", () => {
    const quote = quoteRide(BINGHAMTON_UNION, OAKDALE_MALL, 1);
    const expected = BASE_FARE_USD + quote.distanceMiles * 1.75;
    expect(Number(quote.fare)).toBeCloseTo(Math.max(expected, MIN_FARE_PER_PASSENGER_USD), 2);
  });

  it("scales the minimum with passenger count", () => {
    const one = quoteRide(BINGHAMTON_UNION, BINGHAMTON_UNION, 1);
    const four = quoteRide(BINGHAMTON_UNION, BINGHAMTON_UNION, 4);
    expect(Number(four.fare)).toBe(Number(one.fare) * 4);
  });

  it("rejects invalid passenger counts", () => {
    expect(() => quoteRide(BINGHAMTON_UNION, OAKDALE_MALL, 0)).toThrow();
    expect(() => quoteRide(BINGHAMTON_UNION, OAKDALE_MALL, 9)).toThrow();
    expect(() => quoteRide(BINGHAMTON_UNION, OAKDALE_MALL, 1.5)).toThrow();
  });

  it("returns km distance rounded for the decimal column", () => {
    const quote = quoteRide(BINGHAMTON_UNION, OAKDALE_MALL, 1);
    expect(Number(quote.distanceKm)).toBeCloseTo(quote.distanceMiles * 1.60934, 2);
  });
});

describe("eco rewards", () => {
  it("estimates CO2 savings from EPA per-mile figure", () => {
    expect(Number(estimateCo2SavedKg(10))).toBeCloseTo(10 * CO2_KG_PER_MILE, 2);
  });

  it("returns 0 for missing or negative distance", () => {
    expect(estimateCo2SavedKg(Number.NaN)).toBe("0.00");
    expect(estimateCo2SavedKg(-5)).toBe("0.00");
  });

  it("grants at least 1 point and scales with miles", () => {
    expect(ecoPointsForRide(0)).toBe(0);
    expect(ecoPointsForRide(0.01)).toBe(1);
    expect(ecoPointsForRide(10)).toBe(10 * ECO_POINTS_PER_MILE);
  });
});

describe("ride status transitions", () => {
  it("covers every status in the transition map", () => {
    for (const status of Object.keys(RIDE_STATUS_TRANSITIONS)) {
      expect(isRideStatus(status)).toBe(true);
    }
  });

  it("rejects unknown statuses", () => {
    expect(isRideStatus("teleporting")).toBe(false);
    expect(isRideStatus(42)).toBe(false);
  });

  it("allows the happy path: payment → pending → accepted → in_progress → completed", () => {
    expect(isValidRideTransition("awaiting_payment", "pending")).toBe(true);
    expect(isValidRideTransition("pending", "accepted")).toBe(true);
    expect(isValidRideTransition("accepted", "in_progress")).toBe(true);
    expect(isValidRideTransition("in_progress", "completed")).toBe(true);
  });

  it("allows cancellation from any non-terminal state", () => {
    expect(isValidRideTransition("awaiting_payment", "cancelled")).toBe(true);
    expect(isValidRideTransition("in_progress", "cancelled")).toBe(true);
  });

  it("rejects skipping ahead and reviving terminal rides", () => {
    expect(isValidRideTransition("pending", "completed")).toBe(false);
    expect(isValidRideTransition("pending", "in_progress")).toBe(false);
    expect(isValidRideTransition("completed", "pending")).toBe(false);
    expect(isValidRideTransition("cancelled", "accepted")).toBe(false);
    expect(isValidRideTransition("completed", "completed")).toBe(false);
  });
});
