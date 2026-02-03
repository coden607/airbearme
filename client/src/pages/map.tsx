import { useState, useEffect, useRef, useMemo } from "react";
import { renderToString } from "react-dom/server";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import AirbearWheel from "@/components/airbear-wheel";
import LoadingSpinner from "@/components/loading-spinner";
import {
  estimateRideFare,
  estimateRideTime,
  getActiveSpots,
} from "@/lib/spots";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getSupabaseClient } from "@/lib/supabase-client";
import AirbearAvatar from "@/components/airbear-avatar";
import {
  MapPin,
  Battery,
  Clock,
} from "lucide-react";
import { useAirbearLocationUpdates } from "@/hooks/use-driver-location";
import { useAuth } from "@/hooks/use-auth";

declare global {
  interface Window {
    L: any;
  }
}

interface Spot {
  id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  isActive?: boolean;
  description?: string;
  amenities?: string[];
}

interface Airbear {
  id: string;
  currentSpotId: string;
  latitude: number;
  longitude: number;
  batteryLevel: number;
  isAvailable: boolean;
  isCharging: boolean;
  heading?: number;
}

const calculateDistanceKm = (from: Spot, to: Spot): number | null => {
  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);

  if ([lat1, lon1, lat2, lon2].some((val) => Number.isNaN(val))) return null;

  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function Map() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<Spot | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);

  const { data: spotsData = [], isLoading: spotsLoading, error: spotsError } = useQuery<Spot[]>({
    queryKey: ["spots"],
    queryFn: async () => {
      try {
        const response = await fetch('/api/spots');
        if (!response.ok) {
          // Fallback to static data if API fails
          return getActiveSpots().map(s => ({ ...s, latitude: Number(s.latitude), longitude: Number(s.longitude) }));
        }
        const data = await response.json();
        return data.map((spot: any) => ({
          ...spot,
          latitude: Number(spot.latitude ?? spot.lat ?? spot.latitide),
          longitude: Number(spot.longitude ?? spot.lng ?? spot.long ?? spot.lon),
          isActive: spot.is_active ?? true,
        }));
      } catch (error) {
        console.error('Error fetching spots:', error);
        return getActiveSpots().map(s => ({ ...s, latitude: Number(s.latitude), longitude: Number(s.longitude) }));
      }
    },
    retry: 1,
  });

  const { data: airbearsQueryData = [], isLoading: airbearLoading, error: airbearError } = useQuery<Airbear[]>({
    queryKey: ["airbears-initial"],
    queryFn: async () => {
      try {
        const response = await fetch('/api/airbears');
        if (!response.ok) {
          return [];
        }
        const data = await response.json();
        return data.map((item: any) => ({
          id: item.id,
          currentSpotId: item.current_spot_id ?? "",
          latitude: Number(item.latitude ?? 0),
          longitude: Number(item.longitude ?? 0),
          batteryLevel: Number(item.battery_level ?? 100),
          isAvailable: item.is_available ?? false,
          isCharging: item.is_charging ?? false,
          heading: Number(item.heading ?? 0),
        }));
      } catch (error) {
        console.error('Error fetching airbears:', error);
        return [];
      }
    },
    retry: 1,
  });

  // Use the realtime hook for live updates
  const realtimeAirbears = useAirbearLocationUpdates();

  // Combine initial data with realtime updates
  const airbearsData = useMemo(() => {
    if (realtimeAirbears.length > 0) {
      return realtimeAirbears.map((item: any) => ({
        id: item.id,
        currentSpotId: item.current_spot_id ?? "",
        latitude: Number(item.latitude ?? 0),
        longitude: Number(item.longitude ?? 0),
        batteryLevel: Number(item.battery_level ?? 100),
        isAvailable: item.is_available ?? false,
        isCharging: item.is_charging ?? false,
        heading: Number(item.heading ?? 0),
      }));
    }
    return airbearsQueryData;
  }, [realtimeAirbears, airbearsQueryData]);

  const activeSpots = useMemo(() => {
    if (spotsData.length > 0) {
      return spotsData.filter((spot) => spot.isActive !== false);
    }
    if (spotsError) {
      // Fallback to bundled spot list for static deployments
      return getActiveSpots();
    }
    return [];
  }, [spotsData, spotsError]);

  const airbears = useMemo(() => {
    if (airbearsData.length > 0) return airbearsData;
    if (airbearError && activeSpots.length) {
      // Generate a lightweight fallback set tied to available spots
      return activeSpots.slice(0, 6).map((spot, index) => ({
        id: `fallback-${spot.id}-${index}`,
        currentSpotId: spot.id,
        latitude: Number(spot.latitude),
        longitude: Number(spot.longitude),
        batteryLevel: 80 - index * 5,
        isAvailable: index % 3 !== 0,
        isCharging: index % 5 === 0,
        heading: 0,
      }));
    }
    return [];
  }, [airbearsData, airbearError, activeSpots]);
  const availableAirbearsCount = airbears.filter(r => r.isAvailable).length;

  useEffect(() => {
    if (spotsError || airbearError) {
      toast({
        title: "Live map unavailable",
        description: "Using offline map data. Live API unreachable; check your backend/Supabase settings for real-time data.",
        variant: "destructive",
      });
    }
  }, [spotsError, airbearError, toast]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapReady) return;

    const initMap = async () => {
      try {
        setMapLoading(true);
        // Load Leaflet from CDN
        if (!window.L) {
          // Create and append Leaflet CSS
          const leafletCSS = document.createElement('link');
          leafletCSS.rel = 'stylesheet';
          leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          leafletCSS.crossOrigin = 'anonymous';
          document.head.appendChild(leafletCSS);

          // Load Leaflet JavaScript
          await new Promise((resolve, reject) => {
            const leafletJS = document.createElement('script');
            leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            leafletJS.crossOrigin = 'anonymous';
            leafletJS.onload = resolve;
            leafletJS.onerror = reject;
            document.head.appendChild(leafletJS);
          });
        }

        // Initialize map
        const map = window.L.map(mapRef.current, {
          center: [42.0987, -75.9179], // Binghamton coordinates
          zoom: 12,
          zoomControl: false,
        });

        // Add zoom controls
        const zoomControl = window.L.control.zoom({
          position: 'topright'
        });
        zoomControl.addTo(map);

        // Add beautiful colorful tile layer - using OpenStreetMap for reliability
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <span style="color:#10b981;font-weight:bold;">🐻 AirBear Binghamton</span>',
          maxZoom: 19,
          className: 'beautiful-map'
        }).addTo(map);

        // Add Binghamton boundary highlight circle
        window.L.circle([42.0987, -75.9179], {
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.05,
          radius: 8000,
          weight: 2,
          dashArray: '10, 10'
        }).addTo(map);

        // Add "Binghamton" label at center
        const binghamtonLabel = window.L.divIcon({
          html: `<div style="
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
            white-space: nowrap;
          ">🐻 Binghamton, NY</div>`,
          className: 'binghamton-label',
          iconSize: [150, 40],
          iconAnchor: [75, 20]
        });
        window.L.marker([42.12, -75.92], { icon: binghamtonLabel, interactive: false }).addTo(map);

        mapInstanceRef.current = map;
        setMapReady(true);
        setMapLoading(false);

      } catch (error) {
        console.error('Error initializing map:', error);
        setMapLoading(false);
        toast({
          title: "Map Loading Error",
          description: "Unable to load the map. Please try refreshing the page.",
          variant: "destructive",
        });
      }
    };

    initMap();

    // Map resize handler
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });

    if (mapRef.current) {
      resizeObserver.observe(mapRef.current);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }
      resizeObserver.disconnect();
    };
  }, [mapReady, toast]);

  // Add markers to map
  useEffect(() => {
    if (!mapInstanceRef.current || !activeSpots || !airbears || !mapReady) return;

    const map = mapInstanceRef.current;

    // Clear existing markers
    map.eachLayer((layer: any) => {
      if (layer instanceof window.L.Marker || layer instanceof window.L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add enhanced spot markers
    activeSpots.forEach((spot: Spot, index: number) => {
      const availableAirbears = airbears.filter(r => r.currentSpotId === spot.id && r.isAvailable);
      const hasAirbears = availableAirbears.length > 0;
      const isMerchandiseDrop = spot.id === 'downtown-station';
      const latitude = Number(spot.latitude);
      const longitude = Number(spot.longitude);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return;
      }

      // Create beautiful colorful marker
      const markerColor = isMerchandiseDrop ? '#f59e0b' : (hasAirbears ? '#10b981' : '#6b7280');
      const markerIcon = isMerchandiseDrop ? '📦' : (hasAirbears ? '🐻' : '📍');

      const iconHtml = renderToString(
        <div className="relative">
          {/* Pulsing background for available spots */}
          {hasAirbears && (
            <div className="absolute inset-0 animate-ping">
              <div className="w-12 h-12 bg-green-400 rounded-full opacity-30"></div>
            </div>
          )}
          
          {/* Main marker */}
          <div className={`
            relative w-12 h-12 rounded-full flex items-center justify-center
            shadow-lg border-2 border-white transition-all duration-300
            ${hasAirbears ? 'bg-gradient-to-br from-green-400 to-emerald-600 scale-110' : 
              isMerchandiseDrop ? 'bg-gradient-to-br from-amber-400 to-orange-600' : 
              'bg-gradient-to-br from-gray-400 to-gray-600'}
          `}>
            <span className="text-white text-lg font-bold">
              {markerIcon}
            </span>
            
            {/* Availability indicator */}
            {hasAirbears && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse">
                <span className="text-xs text-white font-bold">
                  {availableAirbears.length}
                </span>
              </div>
            )}
          </div>
          
          {/* Spot name label */}
          <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
            <div className="bg-black/80 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
              {spot.name}
            </div>
          </div>
        </div>
      );

      const marker = window.L.marker([latitude, longitude], {
        icon: new window.L.DivIcon({
          html: iconHtml,
          className: 'bg-transparent border-0',
          iconSize: [80, 80],
          iconAnchor: [40, 40],
          popupAnchor: [0, -40]
        }),
      }).addTo(map);

      // Enhanced popup with more information
      const popupContent = renderToString(
        <div className="p-3 min-w-[200px]">
          <div className="flex items-center space-x-2 mb-2">
            <div className={`
              w-3 h-3 rounded-full
              ${hasAirbears ? 'bg-green-500' : isMerchandiseDrop ? 'bg-amber-500' : 'bg-gray-500'}
            `}></div>
            <h3 className="font-bold text-sm">{spot.name}</h3>
          </div>
          
          {spot.description && (
            <p className="text-xs text-gray-600 mb-2">{spot.description}</p>
          )}
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Status:</span>
              <span className={`font-semibold ${hasAirbears ? 'text-green-600' : 'text-gray-600'}`}>
                {hasAirbears ? `${availableAirbears.length} Available` : 'No AirBears'}
              </span>
            </div>
            
            {isMerchandiseDrop && (
              <div className="flex justify-between text-xs">
                <span>Type:</span>
                <span className="font-semibold text-amber-600">Merchandise Drop-off</span>
              </div>
            )}
            
            {spot.amenities && spot.amenities.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-semibold">Amenities:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {spot.amenities.slice(0, 3).map((amenity, idx) => (
                    <span key={idx} className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                      {amenity}
                    </span>
                  ))}
                  {spot.amenities.length > 3 && (
                    <span className="text-xs text-gray-500">+{spot.amenities.length - 3} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );

      marker.bindPopup(popupContent);

      // Add hover effect
      marker.on('mouseover', () => {
        marker.openPopup();
      });

      if (hasAirbears) {
        // Add animated circle for available spots
        const pulsingCircle = window.L.circleMarker([latitude, longitude], {
          radius: 30,
          fillColor: markerColor,
          fillOpacity: 0.2,
          color: markerColor,
          weight: 2,
          className: 'animate-pulse'
        }).addTo(map);
      }
    });

    // Add real-time moving AirBear drivers
    airbears.forEach((airbear: Airbear, index: number) => {
      const latitude = Number(airbear.latitude);
      const longitude = Number(airbear.longitude);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return;
      }

      // Create animated AirBear driver marker
      const airbearIconHtml = renderToString(
        <div className="relative">
          {/* Moving animation ring */}
          {airbear.isAvailable && (
            <div className="absolute inset-0 animate-ping">
              <div className="w-10 h-10 bg-blue-400 rounded-full opacity-40"></div>
            </div>
          )}
          
          {/* Main AirBear marker */}
          <div className={`
            relative w-10 h-10 rounded-full flex items-center justify-center
            shadow-lg border-2 border-white transition-all duration-300
            ${airbear.isAvailable ? 'bg-gradient-to-br from-blue-400 to-indigo-600' : 
              airbear.isCharging ? 'bg-gradient-to-br from-amber-400 to-yellow-600' : 
              'bg-gradient-to-br from-gray-400 to-gray-600'}
          `}>
            <span className="text-white text-sm font-bold">
              🐻
            </span>
            
            {/* Battery indicator */}
            <div className={`
              absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 rounded-full
              ${airbear.batteryLevel > 50 ? 'bg-green-500' : 
                airbear.batteryLevel > 20 ? 'bg-amber-500' : 'bg-red-500'}
            `}>
              <div className="h-full bg-white rounded-full" style={{width: `${airbear.batteryLevel}%`}}></div>
            </div>
            
            {/* Charging indicator */}
            {airbear.isCharging && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-white animate-pulse">
                <span className="text-xs">⚡</span>
              </div>
            )}
          </div>
          
          {/* Driver label */}
          <div className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
            <div className="bg-blue-600/80 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
              Driver {index + 1}
            </div>
          </div>
        </div>
      );

      const airbearMarker = window.L.marker([latitude, longitude], {
        icon: new window.L.DivIcon({
          html: airbearIconHtml,
          className: 'bg-transparent border-0',
          iconSize: [60, 60],
          iconAnchor: [30, 30],
          popupAnchor: [0, -30]
        }),
        zIndexOffset: 1000 // Ensure airbears appear above spots
      }).addTo(map);

      // AirBear popup with detailed information
      const airbearPopupContent = renderToString(
        <div className="p-3 min-w-[200px]">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-lg">🐻</span>
            <h3 className="font-bold text-sm">AirBear Driver {index + 1}</h3>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Status:</span>
              <span className={`font-semibold ${
                airbear.isAvailable ? 'text-green-600' : 
                airbear.isCharging ? 'text-amber-600' : 'text-gray-600'
              }`}>
                {airbear.isAvailable ? 'Available' : 
                 airbear.isCharging ? 'Charging' : 'En Route'}
              </span>
            </div>
            
            <div className="flex justify-between text-xs">
              <span>Battery:</span>
              <span className={`font-semibold ${
                airbear.batteryLevel > 50 ? 'text-green-600' : 
                airbear.batteryLevel > 20 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {airbear.batteryLevel}%
              </span>
            </div>
            
            <div className="flex justify-between text-xs">
              <span>Location:</span>
              <span className="font-mono text-xs text-gray-600">
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </span>
            </div>
            
            {airbear.isCharging && (
              <div className="flex items-center space-x-1 text-xs text-amber-600">
                <span>⚡</span>
                <span>Charging in progress</span>
              </div>
            )}
            
            {airbear.isAvailable && (
              <div className="w-full mt-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-500
                       text-white rounded-lg text-center text-xs font-semibold">
                🚀 Available for Booking
              </div>
            )}
          </div>
        </div>
      );

      airbearMarker.bindPopup(airbearPopupContent);

      // Simulate real-time movement for available AirBears
      if (airbear.isAvailable) {
        const moveInterval = setInterval(() => {
          // Small random movement to simulate real-time updates
          const latOffset = (Math.random() - 0.5) * 0.0001;
          const lngOffset = (Math.random() - 0.5) * 0.0001;
          const newLat = latitude + latOffset;
          const newLng = longitude + lngOffset;
          
          airbearMarker.setLatLng([newLat, newLng]);
        }, 3000); // Update every 3 seconds

        // Clean up interval on component unmount
        setTimeout(() => clearInterval(moveInterval), 60000);
      }
    });

    // Add click handlers for spots
    activeSpots.forEach((spot: Spot, index: number) => {
      const availableAirbears = airbears.filter(r => r.currentSpotId === spot.id && r.isAvailable);
      const hasAirbears = availableAirbears.length > 0;
      
      if (hasAirbears) {
        const latitude = Number(spot.latitude);
        const longitude = Number(spot.longitude);
        
        // Find the marker for this spot and add click handler
        map.eachLayer((layer: any) => {
          if (layer instanceof window.L.Marker) {
            const pos = layer.getLatLng();
            if (Math.abs(pos.lat - latitude) < 0.0001 && Math.abs(pos.lng - longitude) < 0.0001) {
              layer.on('click', () => {
                setSelectedSpot(spot);
                setShowBookingDialog(true);
              });
            }
          }
        });
      }
    });
  }, [activeSpots, airbears, mapReady]);

  // Add CSS for beautiful colorful Binghamton map styling
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Vibrant Binghamton-themed map styling */
      .beautiful-map {
        filter: saturate(1.4) contrast(1.15) brightness(1.08);
      }

      .leaflet-container {
        background: linear-gradient(135deg, #10b981 0%, #3b82f6 50%, #8b5cf6 100%);
        font-family: 'Inter', system-ui, sans-serif;
      }

      .leaflet-tile-pane {
        filter: hue-rotate(5deg) saturate(1.4);
      }

      /* Custom zoom controls */
      .leaflet-control-zoom a {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
        color: white !important;
        border: none !important;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
      }

      .leaflet-control-zoom a:hover {
        background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
        transform: scale(1.05);
      }

      /* Binghamton colors - Green and Gold */
      .binghamton-green { color: #10b981; }
      .binghamton-gold { color: #f59e0b; }

      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.15); opacity: 0.85; }
      }

      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-5px); }
      }

      @keyframes glow {
        0%, 100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.5); }
        50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.8), 0 0 30px rgba(59, 130, 246, 0.6); }
      }

      @keyframes driver-move {
        0% { transform: translateX(-2px) rotate(-2deg); }
        50% { transform: translateX(2px) rotate(2deg); }
        100% { transform: translateX(-2px) rotate(-2deg); }
      }

      .animate-pulse {
        animation: pulse 2s infinite;
      }

      .animate-float {
        animation: float 3s ease-in-out infinite;
      }

      .animate-glow {
        animation: glow 2s ease-in-out infinite;
      }

      .driver-marker {
        animation: driver-move 1.5s ease-in-out infinite;
      }

      /* Attribution styling */
      .leaflet-control-attribution {
        background: rgba(255, 255, 255, 0.9) !important;
        backdrop-filter: blur(10px);
        border-radius: 8px;
        padding: 4px 8px;
        font-size: 10px;
      }

      /* Popup styling */
      .leaflet-popup-content-wrapper {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(15px);
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.2);
      }

      .leaflet-popup-tip {
        background: rgba(255, 255, 255, 0.95);
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handleBookRide = async () => {
    if (!selectedSpot || !selectedDestination) {
      toast({
        title: "Missing Information",
        description: "Please select both pickup and destination locations.",
        variant: "destructive",
      });
      return;
    }

    const distance = calculateDistanceKm(selectedSpot, selectedDestination) || 0;
    const fare = 4.00; // Flat fee

    try {
      const response = await fetch('/api/rides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id || 'demo-user',
          pickupSpotId: selectedSpot.id,
          dropoffSpotId: selectedDestination.id,
          airbearId: '00000000-0000-0000-0000-000000000001',
          fare: fare.toString(),
          distance: distance.toString(),
          status: 'pending'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to book ride');
      }

      const rideData = await response.json();

      toast({
        title: "🎉 Ride Booked Successfully!",
        description: `Your AirBear is on the way! Ride from ${selectedSpot.name} to ${selectedDestination.name}. Fare: $${fare.toFixed(2)}`,
      });

      setShowBookingDialog(false);
      setSelectedSpot(null);
      setSelectedDestination(null);

      // Navigate to checkout to complete payment
      if (rideData.id) {
        window.location.href = `/checkout?rideId=${rideData.id}&amount=${fare}`;
      }
    } catch (err: any) {
      console.error("Booking error:", err);
      toast({
        title: "Booking Failed",
        description: err.message || "An error occurred while booking your ride.",
        variant: "destructive",
      });
    }
  };

  if (mapLoading || spotsLoading || airbearLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" text="Loading map..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with Binghamton Branding */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center justify-center mb-4 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border border-emerald-500/30">
            <span className="text-2xl mr-2">🐻</span>
            <span className="text-sm font-semibold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
              BINGHAMTON, NY
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Find Your <span className="bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 bg-clip-text text-transparent">Perfect Ride</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover all <span className="font-bold text-emerald-600">{activeSpots.length}</span> AirBear spots across the Greater Binghamton area with real-time driver tracking
          </p>
        </motion.div>

        {/* Live Status Dashboard */}
        <motion.div
          className="mb-6 p-5 bg-gradient-to-r from-emerald-50 via-blue-50 to-purple-50 dark:from-emerald-950/30 dark:via-blue-950/30 dark:to-purple-950/30 rounded-2xl border border-emerald-200/50 dark:border-emerald-800/30 shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <AirbearAvatar size="sm" className="text-primary" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping"></span>
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></span>
              </div>
              <div>
                <span className="font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">Live Fleet Status</span>
                <p className="text-xs text-muted-foreground">Real-time driver tracking</p>
              </div>
            </div>
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-3 bg-white/60 dark:bg-gray-800/60 rounded-xl px-4 py-2 shadow-sm">
                <div className="relative">
                  <div className="w-5 h-5 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
                  <div className="absolute inset-0 w-5 h-5 bg-green-400 rounded-full animate-ping opacity-30"></div>
                </div>
                <div>
                  <div className="font-bold text-lg text-green-600">{availableAirbearsCount}</div>
                  <div className="text-xs text-muted-foreground">Available Now</div>
                </div>
              </div>
              <div className="flex items-center space-x-3 bg-white/60 dark:bg-gray-800/60 rounded-xl px-4 py-2 shadow-sm">
                <div className="w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-600 rounded-full animate-pulse shadow-lg shadow-amber-500/50"></div>
                <div>
                  <div className="font-bold text-lg text-amber-600">{airbears.filter(r => !r.isAvailable && !r.isCharging).length}</div>
                  <div className="text-xs text-muted-foreground">En Route</div>
                </div>
              </div>
              <div className="flex items-center space-x-3 bg-white/60 dark:bg-gray-800/60 rounded-xl px-4 py-2 shadow-sm">
                <div className="w-5 h-5 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full shadow-lg shadow-blue-500/50 flex items-center justify-center">
                  <span className="text-white text-xs">⚡</span>
                </div>
                <div>
                  <div className="font-bold text-lg text-blue-600">{airbears.filter(r => r.isCharging).length}</div>
                  <div className="text-xs text-muted-foreground">Charging</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Map Container */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="aspect-video rounded-2xl overflow-hidden relative shadow-2xl border-4 border-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" style={{borderImage: 'linear-gradient(135deg, #10b981, #3b82f6, #8b5cf6) 1'}}>
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 pointer-events-none z-10 rounded-2xl"></div>
            <div
              ref={mapRef}
              className="w-full h-full rounded-xl"
              data-testid="map-container"
            />

            {/* Live Stats Overlay */}
            <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur-md rounded-xl p-4 shadow-xl border">
              <div className="flex items-center space-x-6 text-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
                  <div>
                    <div className="font-semibold text-green-600">{availableAirbearsCount}</div>
                    <div className="text-xs text-muted-foreground">Available</div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-amber-500 rounded-full animate-pulse shadow-lg shadow-amber-500/50"></div>
                  <div>
                    <div className="font-semibold text-amber-600">{airbears.filter(r => !r.isAvailable && !r.isCharging).length}</div>
                    <div className="text-xs text-muted-foreground">En Route</div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50"></div>
                  <div>
                    <div className="font-semibold text-blue-600">{airbears.filter(r => r.isCharging).length}</div>
                    <div className="text-xs text-muted-foreground">Charging</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Map Legend */}
          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm">
            <div className="flex items-center space-x-3 bg-card/50 rounded-lg px-4 py-2 border">
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
              <span className="font-medium">Available AirBear</span>
            </div>
            <div className="flex items-center space-x-3 bg-card/50 rounded-lg px-4 py-2 border">
              <div className="w-4 h-4 bg-amber-500 rounded-full"></div>
              <span className="font-medium">Merchandise Drop-off</span>
            </div>
            <div className="flex items-center space-x-3 bg-card/50 rounded-lg px-4 py-2 border">
              <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
              <span className="font-medium">No Availability</span>
            </div>
            <div className="flex items-center space-x-2 bg-card/60 rounded-lg px-4 py-2 border">
              <AirbearAvatar size="sm" showBadge={false} />
              <span className="font-medium">AirBear vehicle marker</span>
            </div>
          </div>
        </motion.div>

        {/* Spots Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          {activeSpots.map((spot: Spot, index: number) => {
            const availableAirbears = airbears.filter(r => r.currentSpotId === spot.id && r.isAvailable);
            const avgBattery = availableAirbears.length > 0
              ? Math.round(availableAirbears.reduce((sum, r) => sum + r.batteryLevel, 0) / availableAirbears.length)
              : 0;

            return (
              <motion.div
                key={spot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className="hover-lift cursor-pointer group"
                  onClick={() => {
                    if (availableAirbears.length > 0) {
                      setSelectedSpot(spot);
                      setShowBookingDialog(true);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className={`
                          w-3 h-3 rounded-full
                          ${availableAirbears.length > 0 ? 'bg-green-500' : 'bg-gray-400'}
                        `}></div>
                        <h3 className="font-semibold text-sm">{spot.name}</h3>
                      </div>
                      {spot.id === 'downtown-station' && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                          📦 Merchandise
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Available AirBears:</span>
                        <span className={`font-semibold ${availableAirbears.length > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {availableAirbears.length}
                        </span>
                      </div>
                      
                      {availableAirbears.length > 0 && (
                        <div className="flex justify-between text-xs">
                          <span>Avg Battery:</span>
                          <span className={`font-semibold ${
                            avgBattery > 50 ? 'text-green-600' : 
                            avgBattery > 20 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {avgBattery}%
                          </span>
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      className={`w-full mt-3 ${
                        availableAirbears.length > 0 
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700' 
                          : 'bg-gray-300 cursor-not-allowed'
                      }`}
                      disabled={availableAirbears.length === 0}
                    >
                      {availableAirbears.length > 0 ? "Book Ride" : "No AirBears"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Booking Dialog */}
        <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
          <DialogContent className="max-w-md" data-testid="dialog-book-ride">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <AirbearAvatar size="sm" className="mr-2" />
                <span className="bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">Book Your AirBear Ride</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Pickup Location */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Pickup Location</label>
                <div className="p-3 bg-muted/20 rounded-lg">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 text-primary mr-2" />
                    <span>{selectedSpot?.name}</span>
                  </div>
                </div>
              </div>

              {/* Destination Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination</label>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {activeSpots.filter(s => s.id !== selectedSpot?.id).map((spot) => (
                    <div
                      key={spot.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedDestination?.id === spot.id
                        ? "bg-primary/20 border border-primary"
                        : "bg-muted/10 hover:bg-muted/20"
                        }`}
                      onClick={() => setSelectedDestination(spot)}
                      data-testid={`option-destination-${spot.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 text-muted-foreground mr-2" />
                        <span className="text-sm">{spot.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ride Summary */}
              {selectedDestination && (
                <div className="p-4 bg-muted/10 rounded-lg space-y-2">
                  {(() => {
                    const distance = selectedSpot ? calculateDistanceKm(selectedSpot, selectedDestination) : null;
                    const time = distance ? estimateRideTime(distance) : 0;
                    const fare = 4.00; // Flat fee
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>Distance</span>
                          <span>{distance ? `${distance.toFixed(1)} km` : "N/A"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Est. Time</span>
                          <span>{time ? `${time} min` : "N/A"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Fare</span>
                          <span>${fare.toFixed(2)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-medium">
                          <span>Total</span>
                          <span>${fare.toFixed(2)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <Button
                onClick={handleBookRide}
                disabled={!selectedDestination}
                className="w-full bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 text-white hover:from-emerald-600 hover:via-blue-600 hover:to-purple-600 hover-lift shadow-lg"
                data-testid="button-confirm-booking"
              >
                🚀 Book & Pay Now
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
