import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import LoadingSpinner from "@/components/loading-spinner";
import { getActiveSpots } from "@/lib/spots";
import { useQuery } from "@tanstack/react-query";
import AirbearAvatar from "@/components/airbear-avatar";
import { AirBearMascot } from "@/components/airbear-mascot";
import { MASCOT_DATA_URL } from "@/lib/mascot-data";
import { MapPin, Battery, Navigation, Car, Clock, Phone } from "lucide-react";
import { useAirbearLocationUpdates } from "@/hooks/use-driver-location";
import { useAuth } from "@/hooks/use-auth";

interface ActiveRide {
  id: string;
  airbearId: string;
  pickupSpotId: string;
  dropoffSpotId: string;
  status: string;
  fare: string;
  createdAt?: string;
}

// Leaflet type definitions for CDN-loaded library
// Using 'any' for complex Leaflet internals to avoid over-constraining the types
interface LeafletLatLngBounds {
  extend(latlng: [number, number]): LeafletLatLngBounds;
}

interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  remove(): void;
  fitBounds(bounds: LeafletLatLngBounds, options?: Record<string, unknown>): void;
  invalidateSize(): void;
  removeLayer(layer: LeafletLayer): void;
}

interface LeafletLayer {
  addTo(map: LeafletMap): LeafletLayer;
  remove(): void;
}

interface LeafletMarker extends LeafletLayer {
  addTo(map: LeafletMap): LeafletMarker;
  setLatLng(latlng: [number, number]): LeafletMarker;
  bindPopup(content: string): LeafletMarker;
  on(event: string, handler: () => void): LeafletMarker;
}

interface LeafletCircle extends LeafletLayer {
  addTo(map: LeafletMap): LeafletCircle;
}

interface LeafletPolyline extends LeafletLayer {
  addTo(map: LeafletMap): LeafletPolyline;
}

interface LeafletIcon {
  // Icon instance
}

interface LeafletStatic {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): void };
  marker(latlng: [number, number], options?: Record<string, unknown>): LeafletMarker;
  circle(latlng: [number, number], options?: Record<string, unknown>): LeafletCircle;
  polyline(latlngs: [number, number][], options?: Record<string, unknown>): LeafletPolyline;
  divIcon(options: { html: string; className: string; iconSize: [number, number]; iconAnchor: [number, number] }): LeafletIcon;
  latLngBounds(latlngs: [number, number][]): LeafletLatLngBounds;
}

declare global {
  interface Window {
    L: LeafletStatic;
  }
}

// API response types for type-safe mapping
interface SpotApiResponse {
  id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  isActive?: boolean;
  is_active?: boolean;
  description?: string;
}

interface AirbearApiResponse {
  id: string;
  currentSpotId?: string;
  current_spot_id?: string;
  currentspotid?: string;
  latitude?: number | string;
  longitude?: number | string;
  batteryLevel?: number;
  battery_level?: number;
  batterylevel?: number;
  isAvailable?: boolean;
  is_available?: boolean;
  isavailable?: boolean;
  isCharging?: boolean;
  is_charging?: boolean;
  ischarging?: boolean;
}

interface RideApiResponse {
  id: string;
  status: string;
  airbearId?: string;
  pickupSpotId?: string;
  dropoffSpotId?: string;
  fare?: string;
}

interface Spot {
  id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  isActive?: boolean;
  description?: string;
}

interface Airbear {
  id: string;
  currentSpotId: string;
  latitude: number;
  longitude: number;
  batteryLevel: number;
  isAvailable: boolean;
  isCharging: boolean;
}

export default function Map() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletLayer[]>([]);
  const routeLineRef = useRef<LeafletPolyline | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<Spot | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);

  // Check URL for active ride tracking
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const rideId = urlParams.get('rideId');
    if (rideId) {
      setActiveRideId(rideId);
    }
  }, []);

  // Fetch user's active rides
  const { data: activeRide } = useQuery<ActiveRide | null>({
    queryKey: ["activeRide", user?.id, activeRideId],
    queryFn: async () => {
      // If we have a specific rideId from URL, fetch that ride directly
      if (activeRideId) {
        try {
          const response = await fetch(`/api/rides/${activeRideId}`);
          if (response.ok) {
            const ride = await response.json();
            if (['pending', 'accepted', 'in_progress'].includes(ride.status)) {
              return ride;
            }
          }
        } catch {}
      }

      // Otherwise, fetch user's rides
      if (!user?.id) return null;
      try {
        const response = await fetch(`/api/rides/user/${user.id}`);
        if (!response.ok) return null;
        const rides = await response.json();
        // Find the most recent active ride
        const ride = rides.find((r: RideApiResponse) => ['pending', 'accepted', 'in_progress'].includes(r.status));
        return ride || null;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id || !!activeRideId,
    refetchInterval: 3000, // Update every 3 seconds when tracking
  });

  // Fetch spots
  const { data: spotsData = [], isLoading: spotsLoading } = useQuery<Spot[]>({
    queryKey: ["spots"],
    queryFn: async () => {
      try {
        const response = await fetch('/api/spots');
        if (!response.ok) {
          return getActiveSpots();
        }
        const data = await response.json();
        return data.map((spot: SpotApiResponse) => ({
          ...spot,
          latitude: Number(spot.latitude),
          longitude: Number(spot.longitude),
          isActive: spot.isActive ?? spot.is_active ?? true,
        }));
      } catch {
        return getActiveSpots();
      }
    },
    staleTime: 30000,
  });

  // Fetch airbears
  const { data: airbearsData = [], isLoading: airbearLoading } = useQuery<Airbear[]>({
    queryKey: ["airbears"],
    queryFn: async () => {
      try {
        const response = await fetch('/api/airbears');
        if (!response.ok) return [];
        const data = await response.json();
        return data.map((item: AirbearApiResponse) => ({
          id: item.id,
          currentSpotId: item.currentSpotId ?? item.current_spot_id ?? item.currentspotid ?? "",
          latitude: Number(item.latitude ?? 0),
          longitude: Number(item.longitude ?? 0),
          batteryLevel: Number(item.batteryLevel ?? item.battery_level ?? item.batterylevel ?? 100),
          isAvailable: item.isAvailable ?? item.is_available ?? item.isavailable ?? false,
          isCharging: item.isCharging ?? item.is_charging ?? item.ischarging ?? false,
        }));
      } catch {
        return [];
      }
    },
    staleTime: 5000,
    refetchInterval: 5000,
  });

  // Use realtime updates if available
  const realtimeAirbears = useAirbearLocationUpdates();

  const airbears = useMemo(() => {
    if (realtimeAirbears.length > 0) {
      return realtimeAirbears.map((item: AirbearApiResponse) => ({
        id: item.id,
        currentSpotId: item.currentSpotId ?? item.current_spot_id ?? "",
        latitude: Number(item.latitude ?? 0),
        longitude: Number(item.longitude ?? 0),
        batteryLevel: Number(item.batteryLevel ?? item.battery_level ?? 100),
        isAvailable: item.isAvailable ?? item.is_available ?? false,
        isCharging: item.isCharging ?? item.is_charging ?? false,
      }));
    }
    return airbearsData;
  }, [realtimeAirbears, airbearsData]);

  const activeSpots = useMemo(() => {
    return spotsData.filter((spot) => spot.isActive !== false);
  }, [spotsData]);

  const availableAirbearsCount = airbears.filter(a => a.isAvailable).length;

  // Initialize map
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const initMap = () => {
      if (!window.L || !mapRef.current) {
        console.error('Leaflet not loaded or map container not ready');
        return;
      }

      try {
        const map = window.L.map(mapRef.current, {
          center: [42.0987, -75.9179],
          zoom: 13,
        });

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap | AirBear',
          maxZoom: 19,
        }).addTo(map);

        // Add Binghamton label
        const label = window.L.divIcon({
          html: '<div style="background:#10b981;color:white;padding:6px 12px;border-radius:16px;font-weight:bold;font-size:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;gap:4px;"><img src="' + MASCOT_DATA_URL + '" style="width:16px;height:16px;object-fit:contain;"/> Binghamton, NY</div>',
          className: '',
          iconSize: [140, 30],
          iconAnchor: [70, 15]
        });
        window.L.marker([42.11, -75.92], { icon: label, interactive: false }).addTo(map);

        // Add boundary circle
        window.L.circle([42.0987, -75.9179], {
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.03,
          radius: 6000,
          weight: 2,
          dashArray: '8, 8'
        }).addTo(map);

        mapInstanceRef.current = map;
        setMapReady(true);

        // Recalculate size
        setTimeout(() => map.invalidateSize(), 100);
      } catch (err) {
        console.error('Map init error:', err);
      }
    };

    // Small delay to ensure container is rendered
    const timer = setTimeout(initMap, 100);
    return () => clearTimeout(timer);
  }, []);

  // Add/update markers when data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || activeSpots.length === 0) return;

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    // Add spot markers
    activeSpots.forEach((spot) => {
      const lat = Number(spot.latitude);
      const lng = Number(spot.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const availableHere = airbears.filter(a => a.currentSpotId === spot.id && a.isAvailable);
      const hasAirbears = availableHere.length > 0;
      const color = hasAirbears ? '#10b981' : '#6b7280';

      const icon = window.L.divIcon({
        html: `
          <div style="position:relative;width:44px;height:44px;">
            <div style="width:44px;height:44px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.3);font-size:18px;">
              ${hasAirbears ? '<img src="' + MASCOT_DATA_URL + '" style="width:24px;height:24px;object-fit:contain;"/>' : '📍'}
            </div>
            ${hasAirbears ? `<div style="position:absolute;top:-4px;right:-4px;background:#22c55e;color:white;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid white;">${availableHere.length}</div>` : ''}
            <div style="position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:white;padding:2px 6px;border-radius:8px;font-size:9px;white-space:nowrap;">${spot.name}</div>
          </div>
        `,
        className: '',
        iconSize: [44, 64],
        iconAnchor: [22, 22],
      });

      const marker = window.L.marker([lat, lng], { icon }).addTo(map);

      const popup = `
        <div style="padding:10px;min-width:180px;">
          <h3 style="margin:0 0 8px;font-weight:bold;font-size:14px;">${spot.name}</h3>
          <p style="margin:0 0 8px;font-size:12px;color:${hasAirbears ? '#22c55e' : '#6b7280'};">
            ${hasAirbears ? `${availableHere.length} AirBear${availableHere.length > 1 ? 's' : ''} available` : 'No AirBears available'}
          </p>
          ${hasAirbears ? `<button onclick="window.dispatchEvent(new CustomEvent('book-ride',{detail:'${spot.id}'}))" style="width:100%;padding:8px;background:#10b981;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Book Ride</button>` : ''}
        </div>
      `;
      marker.bindPopup(popup);

      // Make all spots clickable for booking
      marker.on('click', () => {
        setSelectedSpot(spot);
        setShowBookingDialog(true);
      });

      markersRef.current.push(marker);
    });

    // Add airbear driver markers
    airbears.forEach((ab, idx) => {
      const lat = Number(ab.latitude);
      const lng = Number(ab.longitude);
      if (isNaN(lat) || isNaN(lng) || lat === 0) return;

      // Check if this is the user's assigned driver
      const isMyDriver = activeRide && ab.id === activeRide.airbearId;
      const color = isMyDriver ? '#ef4444' : ab.isAvailable ? '#3b82f6' : ab.isCharging ? '#f59e0b' : '#6b7280';

      const icon = window.L.divIcon({
        html: `
          <div style="position:relative;">
            <div style="width:${isMyDriver ? '48px' : '36px'};height:${isMyDriver ? '48px' : '36px'};border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:${isMyDriver ? '4px' : '2px'} solid white;box-shadow:0 ${isMyDriver ? '4' : '2'}px ${isMyDriver ? '12' : '8'}px rgba(0,0,0,${isMyDriver ? '0.4' : '0.3'});font-size:${isMyDriver ? '18px' : '14px'};${isMyDriver ? 'animation:pulse 1.5s infinite;' : ''}">
              <img src="' + MASCOT_DATA_URL + '" style="width:${isMyDriver ? '28px' : '20px'};height:${isMyDriver ? '28px' : '20px'};object-fit:contain;"/>${ab.isCharging ? '⚡' : ''}
            </div>
            ${isMyDriver ? '<div style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);background:#ef4444;color:white;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;white-space:nowrap;">YOUR DRIVER</div>' : ''}
          </div>
        `,
        className: isMyDriver ? 'my-driver-marker' : '',
        iconSize: [isMyDriver ? 48 : 36, isMyDriver ? 70 : 36],
        iconAnchor: [isMyDriver ? 24 : 18, isMyDriver ? 24 : 18],
      });

      const marker = window.L.marker([lat, lng], { icon, zIndexOffset: isMyDriver ? 1000 : 500 }).addTo(map);

      marker.bindPopup(`
        <div style="padding:8px;">
          <strong>${isMyDriver ? '🚗 Your AirBear Driver' : `AirBear #${idx + 1}`}</strong><br/>
          Battery: ${ab.batteryLevel}%<br/>
          Status: ${isMyDriver ? 'Coming to pick you up!' : ab.isAvailable ? 'Available' : ab.isCharging ? 'Charging' : 'En Route'}
          ${isMyDriver ? '<br/><span style="color:#ef4444;font-weight:bold;">Tap for ETA</span>' : ''}
        </div>
      `);

      markersRef.current.push(marker);

      // Draw route line from driver to pickup if this is my driver
      if (isMyDriver && activeRide) {
        const pickupSpot = activeSpots.find(s => s.id === activeRide.pickupSpotId);
        if (pickupSpot) {
          const pickupLat = Number(pickupSpot.latitude);
          const pickupLng = Number(pickupSpot.longitude);
          if (!isNaN(pickupLat) && !isNaN(pickupLng)) {
            // Remove old route line
            if (routeLineRef.current) {
              map.removeLayer(routeLineRef.current);
            }
            // Draw dashed line from driver to pickup
            routeLineRef.current = window.L.polyline(
              [[lat, lng], [pickupLat, pickupLng]],
              { color: '#ef4444', weight: 3, dashArray: '10, 10', opacity: 0.8 }
            ).addTo(map);
            markersRef.current.push(routeLineRef.current);

            // Center map to show both driver and pickup
            const bounds = window.L.latLngBounds([[lat, lng], [pickupLat, pickupLng]]);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
          }
        }
      }
    });

  }, [mapReady, activeSpots, airbears, activeRide]);

  // Handle book-ride custom events
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const spot = activeSpots.find(s => s.id === e.detail);
      if (spot) {
        setSelectedSpot(spot);
        setShowBookingDialog(true);
      }
    };
    window.addEventListener('book-ride', handler as EventListener);
    return () => window.removeEventListener('book-ride', handler as EventListener);
  }, [activeSpots]);

  // Calculate distance between two spots (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Get estimated pickup time and distance
  const getPickupEstimate = () => {
    if (!selectedSpot) return { time: 0, distance: 0 };

    // Find nearest available airbear
    const availableAirbears = airbears.filter(a => a.isAvailable);
    if (availableAirbears.length === 0) return { time: 5, distance: 1 }; // Default estimate

    let minDistance = Infinity;
    for (const ab of availableAirbears) {
      const dist = calculateDistance(
        Number(selectedSpot.latitude), Number(selectedSpot.longitude),
        ab.latitude, ab.longitude
      );
      if (dist < minDistance) minDistance = dist;
    }

    // Estimate: 15 mph average speed in city
    const timeMinutes = Math.max(2, Math.round((minDistance / 15) * 60));
    return { time: timeMinutes, distance: Math.round(minDistance * 10) / 10 };
  };

  // Get ride distance and time
  const getRideEstimate = () => {
    if (!selectedSpot || !selectedDestination) return { time: 0, distance: 0 };
    const dist = calculateDistance(
      Number(selectedSpot.latitude), Number(selectedSpot.longitude),
      Number(selectedDestination.latitude), Number(selectedDestination.longitude)
    );
    const timeMinutes = Math.max(3, Math.round((dist / 15) * 60));
    return { time: timeMinutes, distance: Math.round(dist * 10) / 10 };
  };

  const handleBookRide = async () => {
    if (!selectedSpot || !selectedDestination) {
      toast({ title: "Error", description: "Please select pickup and destination.", variant: "destructive" });
      return;
    }

    // Find any available airbear (not just at this spot)
    const availableAirbears = airbears.filter(a => a.isAvailable);

    // Pick the closest available airbear, or any if none at spot
    let selectedAirbear = availableAirbears.find(a => a.currentSpotId === selectedSpot.id);
    if (!selectedAirbear && availableAirbears.length > 0) {
      // Find closest airbear
      let minDist = Infinity;
      for (const ab of availableAirbears) {
        const dist = calculateDistance(
          Number(selectedSpot.latitude), Number(selectedSpot.longitude),
          ab.latitude, ab.longitude
        );
        if (dist < minDist) {
          minDist = dist;
          selectedAirbear = ab;
        }
      }
    }

    // Create guest user if not logged in
    const userId = user?.id || `guest_${Date.now()}`;
    if (!user) {
      const guestUser = {
        id: userId,
        email: 'guest@airbear.app',
        username: 'Guest',
        role: 'user' as const,
        ecoPoints: 0,
        totalRides: 0,
        co2Saved: '0',
      };
      localStorage.setItem('airbear-user', JSON.stringify(guestUser));
    }

    try {
      const response = await fetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          pickupSpotId: selectedSpot.id,
          dropoffSpotId: selectedDestination.id,
          airbearId: selectedAirbear?.id || null,
          fare: "4.00",
          status: 'pending'
        })
      });

      if (!response.ok) throw new Error('Booking failed');

      const rideData = await response.json();
      const estimate = getPickupEstimate();
      toast({
        title: "Ride Booked!",
        description: selectedAirbear
          ? `AirBear arriving in ~${estimate.time} min!`
          : `Finding nearest driver... ~${estimate.time} min ETA`
      });
      setShowBookingDialog(false);
      setSelectedSpot(null);
      setSelectedDestination(null);

      if (rideData.id) {
        // Use client-side navigation to preserve auth state
        window.location.href = `/checkout?rideId=${rideData.id}&amount=4`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: "Booking Failed", description: message, variant: "destructive" });
    }
  };

  const isLoading = spotsLoading || airbearLoading;

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <AirBearMascot size="sm" />
            <span className="text-sm font-semibold text-emerald-600">BINGHAMTON, NY</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Find Your Ride</h1>
          <p className="text-muted-foreground">
            {activeSpots.length} AirBear spots • {availableAirbearsCount} vehicles available
          </p>
        </motion.div>

        {/* Active Ride Tracking Banner */}
        {activeRide && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-gradient-to-r from-red-500/10 to-orange-500/10 border-2 border-red-500/30 rounded-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-red-600">Your Driver is On The Way!</h3>
                  <p className="text-sm text-muted-foreground">
                    {activeSpots.find(s => s.id === activeRide.pickupSpotId)?.name || 'Pickup'} → {activeSpots.find(s => s.id === activeRide.dropoffSpotId)?.name || 'Destination'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="flex items-center gap-1 text-red-600">
                    <Clock className="w-4 h-4" />
                    <span className="font-bold">~3 min</span>
                  </div>
                  <span className="text-xs text-muted-foreground">ETA</span>
                </div>
                <Button size="sm" variant="outline" className="border-red-500 text-red-600 hover:bg-red-50">
                  <Phone className="w-4 h-4 mr-1" />
                  Contact
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span>Live tracking active - Driver location updates every 3 seconds</span>
            </div>
          </motion.div>
        )}

        {/* Status Bar */}
        <div className="mb-6 p-4 bg-card rounded-xl border flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AirbearAvatar size="sm" />
            <span className="font-semibold">Live Fleet</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span>{availableAirbearsCount} Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full" />
              <span>{airbears.filter(a => !a.isAvailable && !a.isCharging).length} En Route</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span>{airbears.filter(a => a.isCharging).length} Charging</span>
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="mb-8 rounded-xl overflow-hidden border-2 border-emerald-500/20 shadow-lg relative" style={{ height: 500 }}>
          {isLoading && !mapReady && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <LoadingSpinner size="lg" text="Loading map..." />
            </div>
          )}
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Legend */}
        <div className="mb-8 flex flex-wrap justify-center gap-4 text-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-lg border">
            <div className="w-3 h-3 bg-emerald-500 rounded-full" />
            <span>Available Spot</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-lg border">
            <div className="w-3 h-3 bg-gray-400 rounded-full" />
            <span>No Availability</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-lg border">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            <span>AirBear Driver</span>
          </div>
        </div>

        {/* Spots Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeSpots.map((spot) => {
            const available = airbears.filter(a => a.currentSpotId === spot.id && a.isAvailable);
            const hasAirbears = available.length > 0;

            return (
              <Card
                key={spot.id}
                className={`cursor-pointer transition-all hover:shadow-md ${hasAirbears ? 'border-emerald-500/30 hover:border-emerald-500' : 'hover:border-gray-400'}`}
                onClick={() => {
                  setSelectedSpot(spot);
                  setShowBookingDialog(true);
                }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className={`w-4 h-4 ${hasAirbears ? 'text-emerald-500' : 'text-gray-400'}`} />
                    {spot.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant={hasAirbears ? "default" : "secondary"}>
                      {hasAirbears ? `${available.length} Available` : 'No AirBears'}
                    </Badge>
                    {hasAirbears && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Battery className="w-3 h-3" />
                        {Math.round(available.reduce((s, a) => s + a.batteryLevel, 0) / available.length)}%
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Booking Dialog */}
        <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-emerald-500" />
                Book Your Ride
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Pickup Location</label>
                <div className="mt-1 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                    <span className="font-medium">{selectedSpot?.name || 'Select a spot'}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Destination</label>
                <select
                  className="mt-1 w-full p-3 rounded-lg border bg-background"
                  value={selectedDestination?.id || ''}
                  onChange={(e) => {
                    const dest = activeSpots.find(s => s.id === e.target.value);
                    setSelectedDestination(dest || null);
                  }}
                >
                  <option value="">Select destination...</option>
                  {activeSpots
                    .filter(s => s.id !== selectedSpot?.id)
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
              </div>

              {selectedSpot && selectedDestination && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Pickup ETA</div>
                      <div className="font-bold text-blue-600">~{getPickupEstimate().time} min</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Ride Distance</div>
                      <div className="font-bold text-blue-600">{getRideEstimate().distance} mi</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Ride Time</div>
                      <div className="font-bold text-blue-600">~{getRideEstimate().time} min</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Available Drivers</div>
                      <div className="font-bold text-emerald-600">{airbears.filter(a => a.isAvailable).length}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between mb-2">
                  <span>Flat Rate Fare</span>
                  <span className="font-bold text-emerald-600">$4.00</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Solar-powered • Zero emissions • Supports local economy
                </p>
              </div>

              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                onClick={handleBookRide}
                disabled={!selectedSpot || !selectedDestination || airbears.filter(a => a.isAvailable).length === 0}
              >
                {airbears.filter(a => a.isAvailable).length === 0 ? 'No Drivers Available' : 'Confirm Booking'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
