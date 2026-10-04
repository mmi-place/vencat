// Migration only: retire subscriptions created by older Vencat releases.
// Keep the offline service worker; never request permission or create an alert.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const subscription = await self.registration.pushManager?.getSubscription();
    if (subscription) await subscription.unsubscribe();
    const alerts = await self.registration.getNotifications();
    alerts.forEach(alert => alert.close());
  })().catch(() => {}));
});
