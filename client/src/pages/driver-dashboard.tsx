import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useDriverLocation } from '@/hooks/use-driver-location';
import { Navigation, Battery, MapPin, Activity, Clock, Car, CheckCircle, AlertTriangle, Bell } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Spot {
    id: string;
    name: string;
}

export default function DriverDashboard() {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [assignedAirbear, setAssignedAirbear] = useState<any>(null);
    const [showAirbearAlert, setShowAirbearAlert] = useState(false);
    const [showRideAlert, setShowRideAlert] = useState(false);
    const { isTracking, location, error } = useDriverLocation(assignedAirbear?.id);

    // Fetch spots for displaying names
    const { data: spots = [] } = useQuery<Spot[]>({
        queryKey: ['spots'],
        queryFn: async () => {
            const res = await fetch('/api/spots');
            if (!res.ok) return [];
            return res.json();
        },
    });

    const getSpotName = (spotId: string) => {
        const spot = spots.find((s: Spot) => s.id === spotId);
        return spot?.name || spotId?.slice(0, 8) || 'Unknown';
    };

    // Check if driver is assigned to an airbear and show alerts
    useEffect(() => {
        if (!user?.id) return;
        
        // Check for available airbears
        const checkAirbearAvailability = async () => {
            try {
                const res = await fetch('/api/airbears');
                const airbears = await res.json();
                const myAirbear = airbears.find((a: any) => a.driverId === user.id);
                const hasAvailable = airbears.some((a: any) => !a.driverId && (a.isAvailable ?? a.is_available ?? a.isavailable));
                
                setAssignedAirbear(myAirbear || null);
                
                // Show alert if driver has no airbear and there are available ones
                if (!myAirbear && hasAvailable) {
                    setShowAirbearAlert(true);
                } else {
                    setShowAirbearAlert(false);
                }
            } catch { /* ignore */ }
        };

        checkAirbearAvailability();
        const interval = setInterval(checkAirbearAvailability, 5000); // Check every 5 seconds
        return () => clearInterval(interval);
    }, [user?.id]);

    // Fetch pending rides and show alerts
    const { data: pendingRides = [] } = useQuery({
        queryKey: ['rides', 'pending'],
        queryFn: async () => {
            const res = await authFetch('/api/rides/pending');
            if (!res.ok) return [];
            return res.json();
        },
        refetchInterval: 3000,
    });

    // Show ride alert when there are pending rides and driver has airbear
    useEffect(() => {
        if (assignedAirbear && pendingRides.length > 0) {
            setShowRideAlert(true);
        } else {
            setShowRideAlert(false);
        }
    }, [assignedAirbear, pendingRides]);

    // Fetch my active rides (ones I've accepted)
    const { data: myRides = [] } = useQuery({
        queryKey: ['rides', 'driver', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const res = await authFetch(`/api/rides/driver/${user.id}`);
            if (!res.ok) return [];
            return res.json();
        },
        enabled: !!user?.id,
        refetchInterval: 3000,
    });

    const activeRide = myRides.find((r: any) => ['accepted', 'in_progress'].includes(r.status));

    // Accept ride mutation
    const acceptRideMutation = useMutation({
        mutationFn: async (rideId: string) => {
            const res = await authFetch(`/api/rides/${rideId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'accepted',
                    driverId: user?.id,
                    airbearId: assignedAirbear?.id,
                    acceptedAt: new Date().toISOString(),
                }),
            });
            if (!res.ok) throw new Error('Failed to accept ride');
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Ride Accepted!", description: "Head to pickup location." });
            queryClient.invalidateQueries({ queryKey: ['rides'] });
        },
        onError: (err: any) => {
            toast({ title: "Error", description: err.message, variant: 'destructive' });
        },
    });

    // Start ride mutation
    const startRideMutation = useMutation({
        mutationFn: async (rideId: string) => {
            const res = await authFetch(`/api/rides/${rideId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'in_progress', startedAt: new Date().toISOString() }),
            });
            if (!res.ok) throw new Error('Failed to start ride');
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Ride Started!", description: "Heading to destination." });
            queryClient.invalidateQueries({ queryKey: ['rides'] });
        },
    });

    // Complete ride mutation
    const completeRideMutation = useMutation({
        mutationFn: async (rideId: string) => {
            const res = await authFetch(`/api/rides/${rideId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed', completedAt: new Date().toISOString() }),
            });
            if (!res.ok) throw new Error('Failed to complete ride');
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Ride Completed!", description: "Great job! Ready for next ride." });
            queryClient.invalidateQueries({ queryKey: ['rides'] });
        },
    });

    // Assign self to an available airbear
    const claimAirbear = async () => {
        try {
            const res = await fetch('/api/airbears');
            if (!res.ok) {
                throw new Error('Failed to fetch available vehicles');
            }
            const airbears = await res.json();
            const available = airbears.find((a: any) => !a.driverId && (a.isAvailable ?? a.is_available ?? a.isavailable));
            
            if (!available) {
                toast({ 
                    title: "No Available Vehicles", 
                    description: "All AirBears are currently assigned. Please check back later.", 
                    variant: 'destructive' 
                });
                return;
            }
            
            const updateRes = await authFetch(`/api/airbears/${available.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverId: user?.id }),
            });

            if (!updateRes.ok) {
                const errorData = await updateRes.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to assign vehicle');
            }

            const updated = await updateRes.json();
            console.log('Vehicle assignment response:', updated);
            setAssignedAirbear(updated.data || updated);
            setShowAirbearAlert(false);
            toast({
                title: "Vehicle Assigned!",
                description: `You are now driving AirBear ${available.id.slice(0, 8)}. Ready to accept rides!`
            });
        } catch (err: any) {
            console.error('Vehicle assignment error:', err);
            toast({
                title: "Assignment Failed",
                description: err.message || "Could not assign vehicle. Please try again.",
                variant: 'destructive'
            });
        }
    };

    if (!user || user.role !== 'driver') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center">
                        <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
                        <p className="text-muted-foreground">
                            This page is only accessible to drivers.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    className="text-center mb-8"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        Driver Dashboard
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Welcome, {user.fullName || user.username}
                    </p>
                </motion.div>

                {/* Alert Banners */}
                {showAirbearAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6"
                    >
                        <Card className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <motion.div
                                            animate={{ scale: [1, 1.2, 1] }}
                                            transition={{ repeat: Infinity, duration: 1 }}
                                        >
                                            <Car className="h-6 w-6 text-amber-600" />
                                        </motion.div>
                                        <div>
                                            <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                                                🚗 Available AirBear Ready!
                                            </h3>
                                            <p className="text-sm text-amber-700 dark:text-amber-300">
                                                Claim your vehicle now to start accepting rides
                                            </p>
                                        </div>
                                    </div>
                                    <Button 
                                        onClick={claimAirbear} 
                                        className="bg-amber-500 hover:bg-amber-600 text-white animate-pulse"
                                    >
                                        Claim Now
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {showRideAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6"
                    >
                        <Card className="border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30">
                            <CardContent className="p-4">
                                <div className="flex items-center space-x-3">
                                    <motion.div
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ repeat: Infinity, duration: 1 }}
                                    >
                                        <Bell className="h-6 w-6 text-emerald-600" />
                                    </motion.div>
                                    <div>
                                        <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">
                                            🎫 New Ride Request!
                                        </h3>
                                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                                            {pendingRides.length} pending ride{pendingRides.length > 1 ? 's' : ''} waiting for you
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Tracking Status */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                >
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>GPS Tracking Status</span>
                                <Badge variant={isTracking ? 'default' : 'secondary'}>
                                    {isTracking ? (
                                        <>
                                            <Activity className="h-3 w-3 mr-1 animate-pulse" />
                                            Active
                                        </>
                                    ) : (
                                        'Inactive'
                                    )}
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {error && (
                                <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                                    ⚠️ {error}
                                </div>
                            )}

                            {isTracking && location && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex items-center space-x-2">
                                            <MapPin className="h-4 w-4 text-primary" />
                                            <div>
                                                <div className="text-xs text-muted-foreground">Latitude</div>
                                                <div className="font-mono text-sm">{location.latitude.toFixed(6)}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <MapPin className="h-4 w-4 text-primary" />
                                            <div>
                                                <div className="text-xs text-muted-foreground">Longitude</div>
                                                <div className="font-mono text-sm">{location.longitude.toFixed(6)}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Navigation className="h-4 w-4 text-primary" />
                                            <div>
                                                <div className="text-xs text-muted-foreground">Heading</div>
                                                <div className="font-mono text-sm">{location.heading.toFixed(0)}°</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Activity className="h-4 w-4 text-primary" />
                                            <div>
                                                <div className="text-xs text-muted-foreground">Speed</div>
                                                <div className="font-mono text-sm">
                                                    {(location.speed * 3.6).toFixed(1)} km/h
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">GPS Accuracy</span>
                                            <span className="font-medium">±{location.accuracy.toFixed(0)}m</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm mt-2">
                                            <span className="text-muted-foreground">Last Update</span>
                                            <span className="font-medium">
                                                {new Date(location.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                                        <div className="flex items-center text-green-700 dark:text-green-300">
                                            <Activity className="h-4 w-4 mr-2 animate-pulse" />
                                            <span className="text-sm font-medium">
                                                Your location is being broadcast to customers in real-time
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!isTracking && (
                                <div className="text-center py-8">
                                    <Navigation className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                    <p className="text-muted-foreground mb-4">
                                        GPS tracking is currently inactive. Your location will automatically
                                        start broadcasting when you're logged in as a driver.
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Make sure to allow location permissions in your browser.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Active Ride Banner */}
                {activeRide && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mb-6"
                    >
                        <Card className="border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                                    <Car className="h-5 w-5" />
                                    Active Ride
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-xs text-muted-foreground">Pickup</div>
                                            <div className="font-medium flex items-center gap-1">
                                                <MapPin className="h-3 w-3 text-emerald-500" />
                                                {getSpotName(activeRide.pickupSpotId)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-muted-foreground">Destination</div>
                                            <div className="font-medium flex items-center gap-1">
                                                <Navigation className="h-3 w-3 text-emerald-500" />
                                                {getSpotName(activeRide.dropoffSpotId)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Badge variant="outline" className="text-lg px-3 py-1">
                                            ${Number(activeRide.fare || 4).toFixed(2)}
                                        </Badge>
                                        <Badge className={activeRide.status === 'accepted' ? 'bg-amber-500' : 'bg-emerald-500'}>
                                            {activeRide.status === 'accepted' ? 'Heading to Pickup' : 'In Progress'}
                                        </Badge>
                                    </div>
                                    <div className="flex gap-2">
                                        {activeRide.status === 'accepted' && (
                                            <Button
                                                className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                                                onClick={() => startRideMutation.mutate(activeRide.id)}
                                                disabled={startRideMutation.isPending}
                                            >
                                                <CheckCircle className="h-4 w-4 mr-2" />
                                                Passenger Picked Up
                                            </Button>
                                        )}
                                        {activeRide.status === 'in_progress' && (
                                            <Button
                                                className="flex-1 bg-blue-500 hover:bg-blue-600"
                                                onClick={() => completeRideMutation.mutate(activeRide.id)}
                                                disabled={completeRideMutation.isPending}
                                            >
                                                <CheckCircle className="h-4 w-4 mr-2" />
                                                Complete Ride
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Vehicle Info */}
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                >
                    <Card>
                        <CardHeader>
                            <CardTitle>Your Vehicle</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {assignedAirbear ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Vehicle ID</span>
                                        <span className="font-mono font-medium">{assignedAirbear.id.slice(0, 8)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Battery</span>
                                        <Badge variant={assignedAirbear.batteryLevel > 50 ? 'default' : 'destructive'}>
                                            <Battery className="h-3 w-3 mr-1" />
                                            {assignedAirbear.batteryLevel}%
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Location</span>
                                        <span className="text-sm">{getSpotName(assignedAirbear.currentSpotId)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Status</span>
                                        <Badge variant="default" className="bg-green-500">
                                            <Activity className="h-3 w-3 mr-1" />
                                            Active
                                        </Badge>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                    <p className="text-muted-foreground mb-4">No vehicle assigned</p>
                                    <Button onClick={claimAirbear} className="eco-gradient">
                                        Claim Available Vehicle
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Pending Rides</span>
                                {pendingRides.length > 0 && (
                                    <Badge variant="destructive" className="animate-pulse">
                                        {pendingRides.length} New
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!assignedAirbear ? (
                                <div className="text-center py-6 text-muted-foreground">
                                    <Car className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>Claim a vehicle first to accept rides</p>
                                </div>
                            ) : pendingRides.length === 0 ? (
                                <div className="text-center py-6 text-muted-foreground">
                                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>No pending ride requests</p>
                                    <p className="text-xs mt-2">New requests appear automatically</p>
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-64 overflow-y-auto">
                                    {pendingRides.map((ride: any) => (
                                        <div key={ride.id} className="p-3 border rounded-lg bg-muted/20">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-sm font-semibold">Ride #{ride.id.slice(0, 8)}</div>
                                                <Badge variant="outline">${Number(ride.fare || 4).toFixed(2)}</Badge>
                                            </div>
                                            <div className="space-y-1 text-xs text-muted-foreground mb-3">
                                                <div className="flex items-center">
                                                    <MapPin className="h-3 w-3 mr-1 text-primary" />
                                                    {getSpotName(ride.pickupSpotId)}
                                                </div>
                                                <div className="flex items-center">
                                                    <Navigation className="h-3 w-3 mr-1 text-primary" />
                                                    {getSpotName(ride.dropoffSpotId)}
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                className="w-full eco-gradient"
                                                onClick={() => acceptRideMutation.mutate(ride.id)}
                                                disabled={acceptRideMutation.isPending || !!activeRide}
                                            >
                                                {activeRide ? 'Complete current ride first' : 'Accept Ride'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Instructions */}
                <motion.div
                    className="mt-6 p-4 bg-muted/50 rounded-lg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                >
                    <h3 className="font-semibold mb-2 flex items-center">
                        <Clock className="h-4 w-4 mr-2" />
                        How It Works
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                        <li>Your GPS location is automatically tracked while logged in</li>
                        <li>Location updates every few seconds with high accuracy</li>
                        <li>Customers see your real-time position on the map</li>
                        <li>Battery-efficient: uses native GPS APIs</li>
                        <li>Works offline and syncs when connection returns</li>
                    </ul>
                </motion.div>
            </div>
        </div>
    );
}
