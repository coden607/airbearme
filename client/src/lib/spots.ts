// Binghamton AirBear Spots Data - Re-export from shared module
import { spotsData, getActiveSpotsData, type SpotData } from '../../../shared/spots-data';

export interface Spot extends SpotData {
  createdAt?: Date;
}

// Re-export spots data with proper typing
export const spots: Spot[] = spotsData;

// Helper functions for spots
export const getSpotById = (id: string): Spot | undefined => {
  return spots.find(spot => spot.id === id);
};

export const getSpotsByAmenity = (amenity: string): Spot[] => {
  return spots.filter(spot => 
    spot.amenities?.some(a => a.toLowerCase().includes(amenity.toLowerCase()))
  );
};

export const getActiveSpots = (): Spot[] => {
  return getActiveSpotsData();
};

export const getNearbySpots = (
  latitude: number, 
  longitude: number, 
  radiusKm: number = 5
): Spot[] => {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  return spots.filter(spot => {
    const distance = calculateDistance(latitude, longitude, spot.latitude, spot.longitude);
    return distance <= radiusKm && spot.isActive;
  });
};

export const getBinghamtonBounds = () => {
  const latitudes = spots.map(spot => spot.latitude);
  const longitudes = spots.map(spot => spot.longitude);
  
  return {
    north: Math.max(...latitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    west: Math.min(...longitudes),
    center: {
      latitude: (Math.max(...latitudes) + Math.min(...latitudes)) / 2,
      longitude: (Math.max(...longitudes) + Math.min(...longitudes)) / 2,
    }
  };
};

export const getRouteDistance = (spot1Id: string, spot2Id: string): number | null => {
  const spot1 = getSpotById(spot1Id);
  const spot2 = getSpotById(spot2Id);
  
  if (!spot1 || !spot2) return null;
  
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(spot2.latitude - spot1.latitude);
  const dLon = toRadians(spot2.longitude - spot1.longitude);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(spot1.latitude)) * Math.cos(toRadians(spot2.latitude)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const estimateRideFare = (distance: number): number => {
  return 4.00;
};

export const estimateRideTime = (distance: number): number => {
  const averageSpeedKmh = 15; // Average airbear speed including stops
  return Math.round((distance / averageSpeedKmh) * 60); // Return time in minutes
};

export const calculateCO2Saved = (distance: number): number => {
  const carEmissionsKgPerKm = 0.21; // Average car CO2 emissions in kg per km
  return Math.round(distance * carEmissionsKgPerKm * 100) / 100;
};

// CSV export function for admin use
export const exportSpotsToCSV = (): string => {
  const headers = ['Name', 'Latitude', 'Longitude', 'Description', 'Amenities', 'IsActive'];
  const rows = spots.map(spot => [
    spot.name,
    spot.latitude.toString(),
    spot.longitude.toString(),
    spot.description || '',
    spot.amenities?.join('; ') || '',
    spot.isActive.toString()
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${field}"`).join(','))
  ].join('\n');
  
  return csvContent;
};

// Geofencing helper for location-based features
export const isWithinSpotRadius = (
  userLat: number,
  userLon: number,
  spotId: string,
  radiusMeters: number = 100
): boolean => {
  const spot = getSpotById(spotId);
  if (!spot) return false;

  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(spot.latitude - userLat);
  const dLon = toRadians(spot.longitude - userLon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(userLat)) * Math.cos(toRadians(spot.latitude)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  return (distanceKm * 1000) <= radiusMeters; // Convert km to meters
};

export default spots;
