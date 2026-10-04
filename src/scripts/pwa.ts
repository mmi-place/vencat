import { registerSW } from 'virtual:pwa-register';

// The virtual client reloads open tabs after an updated worker activates.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    let checking = false;
    const check = async () => {
      if (checking || !navigator.onLine || document.hidden || registration.installing) return;
      checking = true;
      try { await registration.update(); } catch { /* Offline copies remain usable. */ }
      finally { checking = false; }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
  },
});
