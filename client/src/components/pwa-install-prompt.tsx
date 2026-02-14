import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Download, Smartphone } from 'lucide-react';
import { AirBearMascot } from '@/components/airbear-mascot';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Check if user dismissed before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      return; // Don't show for 7 days after dismissal
    }

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 3000); // Show after 3 seconds
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // For iOS, show prompt after delay
    if (isIOSDevice && !isStandalone) {
      setTimeout(() => setShowPrompt(true), 5000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96"
      >
        <div className="bg-gradient-to-r from-emerald-500 to-lime-500 rounded-2xl p-4 shadow-2xl border-2 border-white/20">
          <button
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="absolute top-2 right-2 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4 text-white" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-4">
            <div className="bg-white rounded-xl p-2 shadow-lg">
              <AirBearMascot size="lg" />
            </div>

            <div className="flex-1 text-white">
              <h3 className="font-bold text-lg">Install AirBear</h3>
              <p className="text-sm text-white/90">
                {isIOS
                  ? 'Tap Share → Add to Home Screen'
                  : 'Get the full app experience!'}
              </p>
            </div>
          </div>

          {!isIOS && deferredPrompt && (
            <Button
              onClick={handleInstall}
              className="w-full mt-3 bg-white text-emerald-800 hover:bg-white/90 font-bold"
            >
              <Download className="w-4 h-4 mr-2" />
              Install Now - It's Free!
            </Button>
          )}

          {isIOS && (
            <div className="mt-3 flex items-center justify-center gap-2 text-white/90 text-sm">
              <Smartphone className="w-4 h-4" />
              <span>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong></span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
