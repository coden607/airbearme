import { useOfflineSync } from '@/hooks/use-offline-sync';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

export function OfflineIndicator() {
  const { isOnline, pendingActionsCount } = useOfflineSync();

  if (isOnline && pendingActionsCount === 0) {
    return null;
  }

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg ${
      isOnline ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'
    }`}>
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          {isOnline ? (
            <Wifi className="h-5 w-5 text-yellow-600" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${
            isOnline ? 'text-yellow-800' : 'text-red-800'
          }`}>
            {isOnline ? 'Syncing...' : 'You\'re offline'}
          </p>
          {pendingActionsCount > 0 && (
            <p className={`text-xs ${
              isOnline ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {pendingActionsCount} action{pendingActionsCount !== 1 ? 's' : ''} pending
            </p>
          )}
        </div>
        {!isOnline && (
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
        )}
      </div>
    </div>
  );
}
