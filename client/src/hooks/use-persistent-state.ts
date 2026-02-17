import { useState, useEffect } from 'react';

export function usePersistentState<T>(key: string, initialValue: T) {
  // Get value from localStorage or use initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to localStorage
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}

// Hook for managing user preferences
export function useUserPreferences() {
  const [preferences, setPreferences] = usePersistentState('userPreferences', {
    theme: 'light',
    notifications: true,
    autoSave: true,
    language: 'en',
    currency: 'USD'
  });

  const updatePreference = <K extends keyof typeof preferences>(
    key: K, 
    value: typeof preferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  return {
    preferences,
    updatePreference,
    setPreferences
  };
}

// Hook for managing recently viewed items
export function useRecentItems<T>(maxItems: number = 5) {
  const [recentItems, setRecentItems] = usePersistentState<T[]>('recentItems', []);

  const addItem = (item: T) => {
    setRecentItems(prev => {
      const filtered = prev.filter(i => JSON.stringify(i) !== JSON.stringify(item));
      return [item, ...filtered].slice(0, maxItems);
    });
  };

  const clearRecent = () => {
    setRecentItems([]);
  };

  return {
    recentItems,
    addItem,
    clearRecent
  };
}
