import { useEffect, useRef, useState } from 'react';
import LoadingSpinner from '../loading-spinner';

declare global {
  interface Window {
    L: any;
  }
}

interface MapComponentProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  style?: React.CSSProperties;
  onMapReady?: (map: any) => void;
}

export const MapComponent: React.FC<MapComponentProps> = ({
  center = [42.0987, -75.9179], // Binghamton coordinates
  zoom = 13,
  className = '',
  style = {},
  onMapReady,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const initMap = () => {
      try {
        if (!window.L) {
          throw new Error('Leaflet not loaded');
        }

        // Ensure the container has proper dimensions
        const container = mapRef.current!;
        if (container.offsetWidth === 0 || container.offsetHeight === 0) {
          console.warn('Map container has no dimensions, setting default size');
          container.style.height = '500px';
          container.style.width = '100%';
        }

        const map = window.L.map(container, {
          center,
          zoom,
          zoomControl: false,
          preferCanvas: true,
          // @ts-ignore - This is a valid Leaflet option
          tap: false, // Prevents tap delay on mobile
          renderer: window.L.canvas() // Better performance
        });

        // Add tile layer with error handling
        const tileLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
          detectRetina: true,
          errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        }).addTo(map);

        // Add error event listener to tile layer
        tileLayer.on('tileerror', (e: any) => {
          console.error('Tile loading error:', e);
        });

        // Add a small delay to ensure the map container is properly sized
        setTimeout(() => {
          map.invalidateSize();
        }, 0);

        // Add zoom control
        window.L.control.zoom({
          position: 'topright',
        }).addTo(map);

        mapInstance.current = map;
        setIsLoading(false);
        onMapReady?.(map);

        // Force resize to ensure proper rendering
        setTimeout(() => {
          map.invalidateSize();
        }, 100);
      } catch (err) {
        console.error('Map initialization error:', err);
        setError('Failed to load map. Please try again.');
        setIsLoading(false);
      }
    };

    // Load Leaflet if not already loaded
    if (!window.L) {
      const existingScript = document.querySelector('script[src*="leaflet"]') as HTMLScriptElement;

      if (existingScript) {
        existingScript.onload = initMap;
      } else {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = '';
        script.onload = () => {
          // Add CSS if not already present
          if (!document.querySelector('link[href*="leaflet"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tF/mi8yo/Y4CFMoCqeCk=';
            link.crossOrigin = '';
            document.head.appendChild(link);
          }
          initMap();
        };
        script.onerror = () => {
          setError('Failed to load map resources.');
          setIsLoading(false);
        };
        document.head.appendChild(script);
      }
    } else {
      initMap();
    }

    // Handle window resize with debounce
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (mapInstance.current) {
          try {
            mapInstance.current.invalidateSize();
          } catch (e) {
            console.warn('Error during map resize:', e);
          }
        }
      }, 100);
    };

    // Use ResizeObserver for better performance
    let resizeObserver: ResizeObserver | null = null;
    if (mapRef.current) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(mapRef.current);
    }

    // Still keep the window resize listener as a fallback
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (resizeObserver && mapRef.current) {
        resizeObserver.unobserve(mapRef.current);
        resizeObserver.disconnect();
      }
      
      if (mapInstance.current) {
        try {
          mapInstance.current.off();
          mapInstance.current.remove();
        } catch (e) {
          console.warn('Error cleaning up map:', e);
        } finally {
          mapInstance.current = null;
        }
      }
    };
  }, [center, zoom, onMapReady]);

  return (
    <div 
      className={`relative w-full h-full ${className}`}
      style={{ ...style, position: 'relative' }}
    >
      <div
        ref={mapRef}
        className="w-full h-full bg-gray-100 dark:bg-gray-900 rounded-lg"
        style={{ 
          width: '100%',
          height: '100%',
          minHeight: '500px',
          position: 'relative',
          zIndex: 1
        }}
        data-testid="map-container"
      />
      
      {isLoading && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 rounded-lg z-10"
          style={{ zIndex: 2 }}
        >
          <div className="text-center p-4 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-lg">
            <LoadingSpinner className="w-12 h-12 mx-auto mb-4 text-primary" />
            <p className="text-gray-700 dark:text-gray-300 font-medium">Loading map...</p>
          </div>
        </div>
      )}
      
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
          <div className="text-center">
            <div className="text-red-500 dark:text-red-400 text-2xl mb-2">
              <i className="fas fa-map-marked-alt"></i>
            </div>
            <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-900 text-red-700 dark:text-red-200 rounded-md text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
