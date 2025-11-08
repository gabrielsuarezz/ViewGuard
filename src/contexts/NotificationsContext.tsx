import { createContext, useContext, useState, ReactNode } from "react";
import { Notification } from "@/components/NotificationsPanel";

interface NotificationsContextType {
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  getHighRiskCount: () => number;
  getTotalDetections: () => number;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notification: Notification) => {
    setNotifications(prev => [notification, ...prev]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getHighRiskCount = () => {
    const highRiskTypes = ["THEFT", "FIGHT", "ROBBERY"];
    return notifications.filter(n => highRiskTypes.includes(n.detection.type)).length;
  };

  const getTotalDetections = () => {
    return notifications.length;
  };

  return (
    <NotificationsContext.Provider 
      value={{ 
        notifications, 
        addNotification, 
        removeNotification,
        getHighRiskCount,
        getTotalDetections
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
};
