import { useRef, useState } from "react";

const NOTIFICATION_DURATION_MS = 3600;

const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const notificationIdRef = useRef(0);

  const showNotification = (message, type = "success") => {
    notificationIdRef.current += 1;

    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `notification-${notificationIdRef.current}`;

    setNotifications((currentNotifications) => [
      ...currentNotifications,
      {
        id,
        message,
        type,
      },
    ]);

    window.setTimeout(() => {
      setNotifications((currentNotifications) =>
        currentNotifications.filter(
          (notification) => notification.id !== id
        )
      );
    }, NOTIFICATION_DURATION_MS);
  };

  const closeNotification = (notificationId) => {
    setNotifications((currentNotifications) =>
      currentNotifications.filter(
        (notification) => notification.id !== notificationId
      )
    );
  };

  return {
    notifications,
    showNotification,
    closeNotification,
  };
};

export default useNotifications;
