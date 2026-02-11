import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { RealtimeChannel, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';

interface AirbearRecord {
    id: string;
    latitude: number | string | null;
    longitude: number | string | null;
    heading?: number | string | null;
    is_available?: boolean;
    isAvailable?: boolean;
    [key: string]: unknown;
}

interface DriverLocation {
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
    accuracy: number;
    timestamp: number;
}

/**
 * Hook for drivers to share their real-time location
 * Automatically tracks GPS and updates the airbear position in Supabase
 */
export function useDriverLocation(airbearId: string) {
    const { user } = useAuth();
    const [isTracking, setIsTracking] = useState(false);
    const [location, setLocation] = useState<DriverLocation | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Only track if user is a driver
        if (!user || user.role !== 'driver') return;
        if (!airbearId) return;

        const supabase = getSupabaseClient(false);
        if (!supabase) {
            setError('Supabase not configured');
            return;
        }

        let watchId: number;

        const startTracking = () => {
            if (!navigator.geolocation) {
                setError('Geolocation not supported');
                return;
            }

            setIsTracking(true);

            // Watch position with high accuracy
            watchId = navigator.geolocation.watchPosition(
                async (position) => {
                    const newLocation: DriverLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        heading: position.coords.heading || 0,
                        speed: position.coords.speed || 0,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp,
                    };

                    setLocation(newLocation);
                    setError(null);

                    // Update airbear position in Supabase
                    try {
                        const { error: updateError } = await supabase
                            .from('airbears')
                            .update({
                                latitude: newLocation.latitude,
                                longitude: newLocation.longitude,
                                heading: newLocation.heading,
                                updated_at: new Date().toISOString(),
                            })
                            .eq('id', airbearId);

                        if (updateError) {
                            console.error('Failed to update airbear location:', updateError);
                            setError(updateError.message);
                        }
                    } catch (err) {
                        const message = err instanceof Error ? err.message : 'Unknown error';
                        console.error('Location update error:', err);
                        setError(message);
                    }
                },
                (err) => {
                    console.error('Geolocation error:', err);
                    setError(err.message);
                    setIsTracking(false);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0,
                }
            );
        };

        startTracking();

        return () => {
            if (watchId) {
                navigator.geolocation.clearWatch(watchId);
                setIsTracking(false);
            }
        };
    }, [user, airbearId]);

    return { isTracking, location, error };
}

/**
 * Hook for customers and admins to subscribe to airbear location updates
 * Uses Supabase Realtime for instant updates, API polling as fallback,
 * and simulated movement for smooth demo visualization
 */
export function useAirbearLocationUpdates() {
    const [airbears, setAirbears] = useState<any[]>([]);
    const supabase = getSupabaseClient(false);

    useEffect(() => {
        // Initial fetch from API (works with both Supabase and MemStorage)
        const fetchAirbears = async () => {
            try {
                const response = await fetch('/api/airbears');
                if (response.ok) {
                    const data = await response.json();
                    setAirbears(data);
                }
            } catch (error) {
                console.error('Failed to fetch airbears:', error);
            }
        };

        fetchAirbears();

        // Subscribe to Realtime updates if Supabase is configured
        let channel: RealtimeChannel | null = null;
        if (supabase) {
            channel = supabase
                .channel('airbear-locations')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'airbears',
                    },
                    (payload: RealtimePostgresUpdatePayload<AirbearRecord>) => {
                        setAirbears((prev) =>
                            prev.map((bear) =>
                                bear.id === payload.new.id ? { ...bear, ...payload.new } : bear
                            )
                        );
                    }
                )
                .subscribe();
        }

        // Poll as fallback (every 5 seconds for smoother updates)
        const pollInterval = setInterval(fetchAirbears, 5000);

        return () => {
            if (supabase && channel) {
                supabase.removeChannel(channel);
            }
            clearInterval(pollInterval);
        };
    }, [supabase]);

    return airbears;
}
