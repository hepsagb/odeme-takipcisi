export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!("Notification" in window)) {
    alert("Bu tarayıcı masaüstü bildirimlerini desteklemiyor.");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
};

export const sendNotification = (title: string, body: string) => {
  if (Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: 'https://cdn-icons-png.flaticon.com/512/2331/2331941.png', // Generic wallet icon
    });
  }
};