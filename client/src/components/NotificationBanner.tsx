/**
 * Notification Banner Component
 *
 * Displays active system notifications to users.
 * Supports different notification types with color coding.
 */

import { useState } from 'react';
import { X, Info, AlertTriangle, Wrench, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationBanner, SystemNotification } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

// Notification type configurations
const notificationConfig: Record<
  SystemNotification['type'],
  {
    icon: React.ComponentType<{ className?: string }>;
    bgClass: string;
    borderClass: string;
    iconClass: string;
  }
> = {
  info: {
    icon: Info,
    bgClass: 'bg-blue-500/10 dark:bg-blue-500/20',
    borderClass: 'border-blue-500/30',
    iconClass: 'text-blue-500',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-yellow-500/10 dark:bg-yellow-500/20',
    borderClass: 'border-yellow-500/30',
    iconClass: 'text-yellow-500',
  },
  maintenance: {
    icon: Wrench,
    bgClass: 'bg-orange-500/10 dark:bg-orange-500/20',
    borderClass: 'border-orange-500/30',
    iconClass: 'text-orange-500',
  },
  urgent: {
    icon: AlertCircle,
    bgClass: 'bg-red-500/10 dark:bg-red-500/20',
    borderClass: 'border-red-500/30',
    iconClass: 'text-red-500',
  },
};

interface NotificationItemProps {
  notification: SystemNotification;
  onDismiss: (id: string) => void;
  isDismissing: boolean;
}

function NotificationItem({ notification, onDismiss, isDismissing }: NotificationItemProps) {
  const config = notificationConfig[notification.type] || notificationConfig.info;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 border-b',
        config.bgClass,
        config.borderClass
      )}
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', config.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{notification.title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{notification.message}</p>
      </div>
      {notification.is_dismissible && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={() => onDismiss(notification.id)}
          disabled={isDismissing}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      )}
    </div>
  );
}

export function NotificationBanner() {
  const { notifications, isLoading, dismissNotification, isDismissing } = useNotificationBanner();
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  // Handle dismiss with optimistic update
  const handleDismiss = (id: string) => {
    // Optimistically hide the notification
    setLocalDismissed((prev) => new Set(prev).add(id));
    // Actually dismiss on server
    dismissNotification(id);
  };

  // Don't show anything while loading or if no notifications
  if (isLoading) {
    return null;
  }

  // Filter out locally dismissed notifications
  const visibleNotifications = notifications.filter(
    (n) => !localDismissed.has(n.id)
  );

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {visibleNotifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={handleDismiss}
          isDismissing={isDismissing}
        />
      ))}
    </div>
  );
}

export default NotificationBanner;
