function NotificationStack({ notifications, onClose }) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-stack">
      {notifications.map((notification) => (
        <div
          className={`notification-toast ${notification.type}`}
          key={notification.id}
        >
          <span>{notification.message}</span>

          <button onClick={() => onClose(notification.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default NotificationStack;
