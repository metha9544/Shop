/* METIST Shop service worker - notification foundation */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification?.data?.url || "./";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        try { await client.navigate(target); } catch (_) {}
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

// Ready for the server-side Web Push sender that will be connected later.
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : "" }; }

  const title = payload.title || "METIST 🌸 มีออเดอร์ใหม่";
  const options = {
    body: payload.body || "มีลูกค้าส่งออเดอร์ใหม่เข้ามา แตะเพื่อเปิดหลังบ้าน",
    icon: payload.icon || "logo.png.jpg",
    badge: payload.badge || "logo.png.jpg",
    tag: payload.tag || "metist-new-order",
    data: { url: payload.url || "./", ...(payload.data || {}) },
    vibrate: [180, 80, 180]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
