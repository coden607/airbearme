import { useMemo, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';

export type JourneyStage =
  | 'guest'              // First-time visitor, not registered
  | 'returning_guest'    // Has visited before, not logged in
  | 'signed_in'          // Logged in, no active ride
  | 'booking_ride'       // On the map page, ready to book
  | 'active_ride'        // Has an active ride in progress
  | 'ride_complete'      // Ride just completed, upsell bodega
  | 'browsing_bodega'    // Looking at bodega items
  | 'checkout'           // In checkout process
  | 'post_purchase'      // Just completed a purchase

export interface JourneyCTA {
  stage: JourneyStage;
  title: string;
  subtitle: string;
  action: string;
  href: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
  pulse?: boolean;
}

const VISITOR_KEY = 'airbear_visitor';
const LAST_PURCHASE_KEY = 'airbear_last_purchase';

export function useUserJourney() {
  const { user, isInitialized } = useAuth();
  const [location] = useLocation();
  const [hasVisitedBefore, setHasVisitedBefore] = useState(false);
  const [recentPurchase, setRecentPurchase] = useState(false);

  // Check if user has visited before
  useEffect(() => {
    const visited = localStorage.getItem(VISITOR_KEY);
    if (visited) {
      setHasVisitedBefore(true);
    } else {
      localStorage.setItem(VISITOR_KEY, Date.now().toString());
    }

    // Check for recent purchase (within last 5 minutes)
    const lastPurchase = localStorage.getItem(LAST_PURCHASE_KEY);
    if (lastPurchase && Date.now() - parseInt(lastPurchase) < 5 * 60 * 1000) {
      setRecentPurchase(true);
    }
  }, []);

  // Check for active rides
  const { data: activeRide } = useQuery({
    queryKey: ['activeRide', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        const response = await authFetch(`/api/rides/user/${user.id}`);
        if (!response.ok) return null;
        const rides = await response.json();
        return rides.find((r: any) => ['pending', 'accepted', 'in_progress'].includes(r.status)) || null;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 10000,
    refetchInterval: 15000,
  });

  // Determine current journey stage
  const stage: JourneyStage = useMemo(() => {
    if (!isInitialized) return 'guest';

    // Check location-based stages first
    if (location === '/checkout') return 'checkout';
    if (location === '/bodega') return 'browsing_bodega';
    if (location === '/map') return user ? 'booking_ride' : 'guest';

    // User state based stages
    if (!user) {
      return hasVisitedBefore ? 'returning_guest' : 'guest';
    }

    // Check for active ride
    if (activeRide) {
      if (activeRide.status === 'completed') return 'ride_complete';
      return 'active_ride';
    }

    // Check for recent purchase
    if (recentPurchase) return 'post_purchase';

    return 'signed_in';
  }, [user, isInitialized, location, hasVisitedBefore, activeRide, recentPurchase]);

  // Get contextual CTA based on stage
  const cta: JourneyCTA = useMemo(() => {
    switch (stage) {
      case 'guest':
        return {
          stage,
          title: 'Join the Ride',
          subtitle: 'Sign up and get your first ride free!',
          action: 'Get Started',
          href: '/auth?mode=signup',
          icon: 'rocket',
          priority: 'high',
          pulse: true,
        };

      case 'returning_guest':
        return {
          stage,
          title: 'Welcome Back!',
          subtitle: 'Sign in to continue your journey',
          action: 'Sign In',
          href: '/auth',
          icon: 'login',
          priority: 'high',
          pulse: true,
        };

      case 'signed_in':
        return {
          stage,
          title: 'Ready to Roll?',
          subtitle: 'Book your eco-friendly ride now',
          action: 'Book a Ride',
          href: '/map',
          icon: 'map',
          priority: 'high',
          pulse: true,
        };

      case 'booking_ride':
        return {
          stage,
          title: 'Find Your Spot',
          subtitle: 'Tap a pickup location to book',
          action: 'View Spots',
          href: '/map',
          icon: 'pin',
          priority: 'medium',
          pulse: false,
        };

      case 'active_ride':
        return {
          stage,
          title: 'Thirsty? Hungry?',
          subtitle: 'Grab snacks & drinks for your ride!',
          action: 'Browse Bodega',
          href: '/bodega',
          icon: 'store',
          priority: 'high',
          pulse: true,
        };

      case 'ride_complete':
        return {
          stage,
          title: 'Great Ride!',
          subtitle: 'Celebrate with a treat from our bodega',
          action: 'Shop Now',
          href: '/bodega',
          icon: 'gift',
          priority: 'high',
          pulse: true,
        };

      case 'browsing_bodega':
        return {
          stage,
          title: 'Need Anything Else?',
          subtitle: 'Check out our eco-friendly goodies',
          action: 'Keep Shopping',
          href: '/bodega',
          icon: 'bag',
          priority: 'medium',
          pulse: false,
        };

      case 'checkout':
        return {
          stage,
          title: 'Almost There!',
          subtitle: 'Complete your order',
          action: 'Checkout',
          href: '/checkout',
          icon: 'card',
          priority: 'high',
          pulse: true,
        };

      case 'post_purchase':
        return {
          stage,
          title: 'Thanks for Shopping!',
          subtitle: 'Earn points with every ride',
          action: 'Book a Ride',
          href: '/map',
          icon: 'star',
          priority: 'medium',
          pulse: false,
        };

      default:
        return {
          stage: 'guest',
          title: 'Start Your Journey',
          subtitle: 'Join AirBear today',
          action: 'Get Started',
          href: '/auth?mode=signup',
          icon: 'rocket',
          priority: 'high',
          pulse: true,
        };
    }
  }, [stage]);

  // Secondary CTAs for lower priority items
  const secondaryCTAs: JourneyCTA[] = useMemo(() => {
    const items: JourneyCTA[] = [];

    // Only show secondary CTAs after user is signed in
    if (user) {
      // CEO T-shirt promotion (lower priority)
      if (!user.hasCeoTshirt) {
        items.push({
          stage: 'signed_in',
          title: 'Rep the Bear',
          subtitle: 'Get the exclusive CEO T-shirt',
          action: 'Learn More',
          href: '/promo',
          icon: 'shirt',
          priority: 'low',
          pulse: false,
        });
      }

      // Advertising opportunity
      items.push({
        stage: 'signed_in',
        title: 'Advertise with Us',
        subtitle: 'Reach thousands on our AirBears',
        action: 'Partner Up',
        href: '/support?topic=advertising',
        icon: 'megaphone',
        priority: 'low',
        pulse: false,
      });

      // Investor info
      items.push({
        stage: 'signed_in',
        title: 'Invest in AirBear',
        subtitle: 'Join the green transportation revolution',
        action: 'Learn More',
        href: '/support?topic=investors',
        icon: 'chart',
        priority: 'low',
        pulse: false,
      });
    }

    return items;
  }, [user]);

  // Mark purchase complete
  const markPurchaseComplete = () => {
    localStorage.setItem(LAST_PURCHASE_KEY, Date.now().toString());
    setRecentPurchase(true);
  };

  return {
    stage,
    cta,
    secondaryCTAs,
    user,
    activeRide,
    markPurchaseComplete,
    isInitialized,
  };
}
