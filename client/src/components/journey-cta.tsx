import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useUserJourney, type JourneyCTA } from '@/hooks/use-user-journey';
import {
  Rocket,
  LogIn,
  Map,
  MapPin,
  Store,
  Gift,
  ShoppingBag,
  CreditCard,
  Star,
  Shirt,
  Megaphone,
  TrendingUp,
  ChevronRight,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  login: LogIn,
  map: Map,
  pin: MapPin,
  store: Store,
  gift: Gift,
  bag: ShoppingBag,
  card: CreditCard,
  star: Star,
  shirt: Shirt,
  megaphone: Megaphone,
  chart: TrendingUp,
};

interface JourneyCTABannerProps {
  className?: string;
  compact?: boolean;
}

export function JourneyCTABanner({ className = '', compact = false }: JourneyCTABannerProps) {
  const { cta, stage } = useUserJourney();
  const [dismissed, setDismissed] = useState(false);
  const [lastStage, setLastStage] = useState(stage);

  // Reset dismissed state when stage changes
  useEffect(() => {
    if (stage !== lastStage) {
      setDismissed(false);
      setLastStage(stage);
    }
  }, [stage, lastStage]);

  if (dismissed) return null;

  const Icon = iconMap[cta.icon] || Rocket;

  if (compact) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={className}
        >
          <Link href={cta.href}>
            <Button
              size="sm"
              className={`relative overflow-hidden ${
                cta.pulse
                  ? 'bg-gradient-to-r from-emerald-500 to-lime-500 hover:from-emerald-600 hover:to-lime-600 text-white animate-pulse-glow'
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {cta.action}
              {cta.pulse && (
                <motion.span
                  className="absolute inset-0 bg-white/20"
                  animate={{ opacity: [0, 0.3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </Button>
          </Link>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`relative ${className}`}
      >
        <div
          className={`relative overflow-hidden rounded-xl p-4 ${
            cta.priority === 'high'
              ? 'bg-gradient-to-r from-emerald-500/20 via-lime-500/20 to-amber-500/20 border-2 border-emerald-500/40'
              : 'bg-muted/50 border border-border'
          }`}
        >
          {/* Dismiss button */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-4">
            {/* Icon */}
            <motion.div
              className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                cta.priority === 'high'
                  ? 'bg-gradient-to-br from-emerald-500 to-lime-500 text-white'
                  : 'bg-primary/20 text-primary'
              }`}
              animate={cta.pulse ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Icon className="w-6 h-6" />
            </motion.div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-foreground">{cta.title}</h3>
              <p className="text-sm text-muted-foreground truncate">{cta.subtitle}</p>
            </div>

            {/* CTA Button */}
            <Link href={cta.href}>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  className={`flex-shrink-0 ${
                    cta.pulse
                      ? 'bg-gradient-to-r from-emerald-500 to-lime-500 hover:from-emerald-600 hover:to-lime-600 text-white'
                      : ''
                  }`}
                >
                  {cta.action}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </motion.div>
            </Link>
          </div>

          {/* Animated background for high priority */}
          {cta.pulse && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-lime-500/10 pointer-events-none"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Floating CTA that appears on certain pages
export function FloatingJourneyCTA() {
  const { cta, stage } = useUserJourney();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show floating CTA after a delay for high priority items
    if (cta.priority === 'high' && !dismissed) {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }
    setShow(false);
  }, [cta, dismissed]);

  // Don't show on checkout, auth pages, or for drivers
  if (stage === 'checkout' || stage === 'guest' || stage === 'returning_guest' || stage === 'driver') {
    return null;
  }

  if (!show || dismissed) return null;

  const Icon = iconMap[cta.icon] || Rocket;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-20 left-1/2 z-40"
      >
        <div className="relative bg-gradient-to-r from-emerald-500 to-lime-500 rounded-full shadow-2xl p-1">
          <button
            onClick={() => setDismissed(true)}
            className="absolute -top-2 -right-2 w-6 h-6 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>

          <Link href={cta.href}>
            <motion.div
              className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-full px-5 py-3 cursor-pointer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                <Icon className="w-5 h-5 text-emerald-500" />
              </motion.div>
              <div className="text-left">
                <p className="font-bold text-sm text-foreground">{cta.title}</p>
                <p className="text-xs text-muted-foreground">{cta.subtitle}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-emerald-500" />
            </motion.div>
          </Link>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Upsell component for bodega items during ride
export function RideUpsellBanner() {
  const { stage, activeRide } = useUserJourney();
  const [dismissed, setDismissed] = useState(false);

  if (stage !== 'active_ride' || dismissed || !activeRide) return null;

  const suggestions = [
    { name: 'Cold Drinks', icon: '🥤', href: '/bodega?category=drinks' },
    { name: 'Snacks', icon: '🍿', href: '/bodega?category=snacks' },
    { name: 'Energy Bars', icon: '🍫', href: '/bodega?category=energy' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-xl p-4 mb-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-foreground">Enhance Your Ride!</h3>
          <p className="text-sm text-muted-foreground">Add treats to your journey</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-black/10 rounded-full"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2">
        {suggestions.map((item) => (
          <Link key={item.name} href={item.href}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm font-medium">{item.name}</span>
            </motion.div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

// Pre-checkout upsell
export function CheckoutUpsell({ onAddMore }: { onAddMore?: () => void }) {
  const { stage } = useUserJourney();
  const [dismissed, setDismissed] = useState(false);

  if (stage !== 'checkout' || dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/40 rounded-xl p-4 mb-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.span
            className="text-2xl"
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
          >
            🤔
          </motion.span>
          <div>
            <h3 className="font-bold text-foreground">Need anything else?</h3>
            <p className="text-sm text-muted-foreground">Add more items before checkout</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/bodega">
            <Button variant="outline" size="sm" onClick={onAddMore}>
              <ShoppingBag className="w-4 h-4 mr-1" />
              Add More
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
            Continue
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
