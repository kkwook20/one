// frontend/src/components/realtime/RealtimeNotifications.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Bell, BellOff } from 'lucide-react';
import { useWebSocket } from './WebSocketProvider';

const NOTIFICATION_TYPES = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-500',
    textColor: 'text-green-100',
    borderColor: 'border-green-600',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-500',
    textColor: 'text-red-100',
    borderColor: 'border-red-600',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-500',
    textColor: 'text-yellow-100',
    borderColor: 'border-yellow-600',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-500',
    textColor: 'text-blue-100',
    borderColor: 'border-blue-600',
  },
};

const Notification = ({ notification, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const config = NOTIFICATION_TYPES[notification.type] || NOTIFICATION_TYPES.info;
  const Icon = config.icon;

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(notification.id), 300);
  };

  return (
    <div
      className={`notification-item ${isExiting ? 'notification-exit' : 'notification-enter'}`}
    >
      <div className={`flex items-start p-4 rounded-lg shadow-lg ${config.bgColor} ${config.borderColor} border`}>
        <Icon className={`w-5 h-5 ${config.textColor} flex-shrink-0 mt-0.5`} />
        <div className="ml-3 flex-1">
          <h4 className={`text-sm font-semibold ${config.textColor}`}>
            {notification.title}
          </h4>
          {notification.message && (
            <p className={`mt-1 text-sm ${config.textColor} opacity-90`}>
              {notification.message}
            </p>
          )}
          {notification.nodeId && (
            <p className={`mt-1 text-xs ${config.textColor} opacity-75`}>
              Node: {notification.nodeId}
            </p>
          )}
          <p className={`mt-1 text-xs ${config.textColor} opacity-75`}>
            {new Date(notification.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className={`ml-4 ${config.textColor} hover:opacity-75 focus:outline-none`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const NotificationCenter = ({ notifications, onDismiss, onClear }) => {
  return (
    <div className="fixed top-4 right-4 w-96 max-h-[80vh] overflow-hidden z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notifications ({notifications.length})
          </h3>
          {notifications.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <BellOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {notifications.map((notification) => (
                <Notification
                  key={notification.id}
                  notification={notification}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const RealtimeNotifications = ({ 
  position = 'top-right',
  maxNotifications = 5,
  defaultDuration = 5000,
  showCenter = false,
  onNotification,
}) => {
  const { on, off } = useWebSocket();
  const [notifications, setNotifications] = useState([]);
  const [centerOpen, setCenterOpen] = useState(showCenter);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const handleNotification = useCallback((data) => {
    const notification = {
      id: Date.now().toString(),
      type: data.level || 'info',
      title: data.title || 'Notification',
      message: data.message,
      nodeId: data.nodeId,
      duration: data.duration || defaultDuration,
      timestamp: new Date().toISOString(),
      ...data,
    };

    setNotifications((prev) => {
      const updated = [notification, ...prev];
      return updated.slice(0, maxNotifications);
    });

    if (onNotification) {
      onNotification(notification);
    }
  }, [defaultDuration, maxNotifications, onNotification]);

  const handleDismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleClear = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    // Listen to various WebSocket events for notifications
    const events = [
      'notification',
      'node_error',
      'node_success',
      'workflow_complete',
      'system_alert',
    ];

    const handlers = {};

    // Create notification handlers for different events
    handlers.notification = handleNotification;
    
    handlers.node_error = (data) => {
      handleNotification({
        type: 'error',
        title: 'Node Error',
        message: data.error || 'An error occurred',
        nodeId: data.nodeId,
      });
    };

    handlers.node_success = (data) => {
      handleNotification({
        type: 'success',
        title: 'Node Completed',
        message: `Node ${data.nodeId} executed successfully`,
        nodeId: data.nodeId,
      });
    };

    handlers.workflow_complete = (data) => {
      handleNotification({
        type: 'success',
        title: 'Workflow Complete',
        message: `Workflow ${data.workflowId} finished execution`,
        duration: 10000,
      });
    };

    handlers.system_alert = (data) => {
      handleNotification({
        type: data.severity || 'warning',
        title: 'System Alert',
        message: data.message,
        duration: 0, // Don't auto-dismiss system alerts
      });
    };

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      on(event, handler);
    });

    // Cleanup
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        off(event, handler);
      });
    };
  }, [on, off, handleNotification]);

  const activeNotifications = centerOpen ? notifications : notifications.slice(0, 3);

  return (
    <>
      {/* Floating notifications */}
      {!centerOpen && (
        <div className={`fixed ${positionClasses[position]} z-50 space-y-2`}>
          {activeNotifications.map((notification) => (
            <Notification
              key={notification.id}
              notification={notification}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Notification center toggle */}
      <button
        onClick={() => setCenterOpen(!centerOpen)}
        className="fixed bottom-4 right-4 p-3 bg-gray-800 rounded-full shadow-lg 
                   border border-gray-700 hover:bg-gray-700 transition-colors z-50"
      >
        <div className="relative">
          <Bell className="w-5 h-5 text-gray-300" />
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
          )}
        </div>
      </button>

      {/* Notification center */}
      {centerOpen && (
        <NotificationCenter
          notifications={notifications}
          onDismiss={handleDismiss}
          onClear={handleClear}
        />
      )}

      <style jsx>{`
        .notification-enter {
          animation: slideIn 0.3s ease-out;
        }
        
        .notification-exit {
          animation: slideOut 0.3s ease-in;
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};

// Hook for programmatic notifications
export const useNotifications = () => {
  const { send } = useWebSocket();

  const notify = useCallback((notification) => {
    send({
      type: 'notification',
      ...notification,
    });
  }, [send]);

  const notifySuccess = useCallback((title, message, options = {}) => {
    notify({
      type: 'success',
      title,
      message,
      ...options,
    });
  }, [notify]);

  const notifyError = useCallback((title, message, options = {}) => {
    notify({
      type: 'error',
      title,
      message,
      ...options,
    });
  }, [notify]);

  const notifyWarning = useCallback((title, message, options = {}) => {
    notify({
      type: 'warning',
      title,
      message,
      ...options,
    });
  }, [notify]);

  const notifyInfo = useCallback((title, message, options = {}) => {
    notify({
      type: 'info',
      title,
      message,
      ...options,
    });
  }, [notify]);

  return {
    notify,
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
  };
};