import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface OfflineAction {
  id: string;
  type: 'ride' | 'order' | 'payment';
  data: any;
  timestamp: number;
  retryCount: number;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineActions, setOfflineActions] = useState<OfflineAction[]>([]);
  const queryClient = useQueryClient();

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load offline actions from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('offlineActions');
    if (stored) {
      setOfflineActions(JSON.parse(stored));
    }
  }, []);

  // Save offline actions to localStorage
  useEffect(() => {
    localStorage.setItem('offlineActions', JSON.stringify(offlineActions));
  }, [offlineActions]);

  // Sync when back online
  useEffect(() => {
    if (isOnline && offlineActions.length > 0) {
      syncOfflineActions();
    }
  }, [isOnline, offlineActions]);

  const syncOfflineActions = useCallback(async () => {
    const actions = [...offlineActions];
    const failedActions: OfflineAction[] = [];

    for (const action of actions) {
      try {
        let response;
        
        switch (action.type) {
          case 'ride':
            response = await fetch('/api/rides', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(action.data),
              credentials: 'include'
            });
            break;
            
          case 'order':
            response = await fetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(action.data),
              credentials: 'include'
            });
            break;
            
          case 'payment':
            response = await fetch('/api/payments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(action.data),
              credentials: 'include'
            });
            break;
        }

        if (response.ok) {
          // Success - remove from queue
          setOfflineActions(prev => prev.filter(a => a.id !== action.id));
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: [action.type + 's'] });
        } else {
          // Failed - increment retry count
          action.retryCount++;
          if (action.retryCount < 3) {
            failedActions.push(action);
          }
        }
      } catch (error) {
        console.error('Failed to sync offline action:', error);
        action.retryCount++;
        if (action.retryCount < 3) {
          failedActions.push(action);
        }
      }
    }

    // Update with failed actions
    setOfflineActions(failedActions);
  }, [offlineActions, queryClient]);

  const addOfflineAction = useCallback((type: OfflineAction['type'], data: any) => {
    const action: OfflineAction = {
      id: Date.now().toString() + Math.random(),
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0
    };
    
    setOfflineActions(prev => [...prev, action]);
  }, []);

  const clearOfflineActions = useCallback(() => {
    setOfflineActions([]);
    localStorage.removeItem('offlineActions');
  }, []);

  return {
    isOnline,
    offlineActions,
    addOfflineAction,
    clearOfflineActions,
    pendingActionsCount: offlineActions.length
  };
}
