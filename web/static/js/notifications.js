(function (window) {
  const hasNotification = typeof Notification !== "undefined";

  function ensurePermission() {
    if (!hasNotification) {
      return Promise.resolve(false);
    }
    if (Notification.permission === "granted") {
      return Promise.resolve(true);
    }
    if (Notification.permission === "denied") {
      return Promise.resolve(false);
    }
    return Notification.requestPermission().then((result) => result === "granted");
  }

  function notify(title, message) {
    ensurePermission().then((granted) => {
      if (granted && hasNotification) {
        new Notification(title, { body: message });
      } else {
        // Accessible fallback when notifications unavailable.
        const live = document.getElementById("timer-live-region");
        if (live) {
          live.textContent = message;
        } else {
          console.info(`[timer] ${message}`);
        }
      }
    });
  }

  window.NotificationService = {
    ensurePermission,
    notify,
  };
})(window);
