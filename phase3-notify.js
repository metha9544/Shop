/*
 * METIST Shop - Order Notification UI v1
 * Load after phase1.js and phase2.js.
 *
 * Current mode:
 * - Adds an opt-in notification button to Shop.
 * - Uses Supabase Realtime when available, with polling fallback.
 * - Shows system notifications through a Service Worker, suitable for mobile browsers/PWA.
 *
 * Note: True push while the Shop web app is fully closed still requires a server-side
 * Web Push sender. shop-sw.js already includes a push handler so the backend can be
 * connected later without redesigning the UI.
 */
(() => {
  "use strict";

  const PREF_KEY = "metist_order_notifications_v1";
  const POLL_MS = 30000;
  const RECENT_TTL_MS = 2 * 60 * 1000;
  const CHANNEL_NAME = "metist_order_notify_v1";

  let knownIds = new Set();
  let recentKeys = new Map();
  let channel = null;
  let pollTimer = null;
  let monitoring = false;
  let swRegistration = null;

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  }

  function isStandalone() {
    return Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true
    );
  }

  function supportsNotifications() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  function ensureManifestLink() {
    if (document.querySelector('link[rel="manifest"]')) return;
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "manifest.webmanifest";
    document.head.appendChild(link);
  }

  async function ensureServiceWorker() {
    if (!supportsNotifications()) return null;
    if (swRegistration) return swRegistration;
    try {
      swRegistration = await navigator.serviceWorker.register("shop-sw.js", { scope: "./" });
      await navigator.serviceWorker.ready;
      return swRegistration;
    } catch (err) {
      console.warn("METIST notification service worker failed:", err);
      return null;
    }
  }

  function cleanupRecentKeys() {
    const now = Date.now();
    for (const [key, ts] of recentKeys.entries()) {
      if (now - ts > RECENT_TTL_MS) recentKeys.delete(key);
    }
  }

  function rowKey(row) {
    const details = row && typeof row.details === "object" && row.details ? row.details : {};
    const bundleId = details.bundleId || details.bundle_id || "";
    if (bundleId) return `bundle:${bundleId}`;
    return `order:${row?.id ?? "unknown"}`;
  }

  function markRecent(row) {
    cleanupRecentKeys();
    const key = rowKey(row);
    if (recentKeys.has(key)) return false;
    recentKeys.set(key, Date.now());
    return true;
  }

  async function showSystemNotification(row) {
    if (Notification.permission !== "granted") return;
    if (!markRecent(row)) return;

    const reg = await ensureServiceWorker();
    if (!reg) return;

    try {
      await reg.showNotification("METIST 🌸 มีออเดอร์ใหม่", {
        body: "มีลูกค้าส่งออเดอร์ใหม่เข้ามาจากหน้าสั่งซื้อ แตะเพื่อเปิดหลังบ้าน",
        icon: "logo.png.jpg",
        badge: "logo.png.jpg",
        tag: rowKey(row),
        renotify: false,
        data: { url: "./", orderId: row?.id ?? null },
        vibrate: [180, 80, 180]
      });
      if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
    } catch (err) {
      console.warn("METIST notification display failed:", err);
    }
  }

  async function fetchPendingRows() {
    try {
      if (typeof _supabase === "undefined" || !_supabase) return [];
      const { data, error } = await _supabase
        .from("orders")
        .select("id,status,details")
        .eq("status", false);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn("METIST notification poll failed:", err);
      return [];
    }
  }

  async function primeKnownOrders() {
    const rows = await fetchPendingRows();
    knownIds = new Set(rows.map(row => String(row.id)));
  }

  async function pollForNewOrders() {
    if (!monitoring) return;
    const rows = await fetchPendingRows();
    for (const row of rows) {
      const id = String(row.id);
      if (!knownIds.has(id)) {
        knownIds.add(id);
        await showSystemNotification(row);
      }
    }
  }

  function stopRealtime() {
    if (channel && typeof _supabase !== "undefined" && _supabase) {
      try { _supabase.removeChannel(channel); } catch (_) {}
    }
    channel = null;
  }

  function startRealtime() {
    stopRealtime();
    try {
      if (typeof _supabase === "undefined" || !_supabase?.channel) return;
      channel = _supabase
        .channel(CHANNEL_NAME)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          async payload => {
            const row = payload?.new || {};
            if (row.status === true) return;
            if (row.id !== undefined && row.id !== null) knownIds.add(String(row.id));
            await showSystemNotification(row);
          }
        )
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("METIST realtime unavailable; polling remains active.");
          }
        });
    } catch (err) {
      console.warn("METIST realtime setup failed; polling remains active:", err);
    }
  }

  async function startMonitoring({ prime = true } = {}) {
    if (monitoring) return;
    monitoring = true;
    if (prime) await primeKnownOrders();
    startRealtime();
    clearInterval(pollTimer);
    pollTimer = setInterval(pollForNewOrders, POLL_MS);
  }

  function stopMonitoring() {
    monitoring = false;
    stopRealtime();
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function buttonEls() {
    return {
      button: document.getElementById("metistNotifyButton"),
      status: document.getElementById("metistNotifyStatus")
    };
  }

  function updateUI() {
    const { button, status } = buttonEls();
    if (!button || !status) return;

    if (!supportsNotifications()) {
      button.textContent = "🔕 อุปกรณ์นี้ไม่รองรับการแจ้งเตือน";
      button.disabled = true;
      status.textContent = "เบราว์เซอร์นี้ไม่รองรับ Web Notification";
      return;
    }

    const enabled = localStorage.getItem(PREF_KEY) === "on" && Notification.permission === "granted";
    button.disabled = false;

    if (enabled) {
      button.textContent = "🔔 การแจ้งเตือนเปิดอยู่";
      button.dataset.enabled = "true";
      status.textContent = "ระบบกำลังเฝ้าดูออเดอร์ใหม่จากหน้าลูกค้า";
    } else if (Notification.permission === "denied") {
      button.textContent = "🔕 การแจ้งเตือนถูกบล็อก";
      button.dataset.enabled = "false";
      status.textContent = "อนุญาต Notifications ในการตั้งค่าเบราว์เซอร์ก่อน แล้วกลับมากดใหม่";
    } else {
      button.textContent = "🔔 เปิดการแจ้งเตือนออเดอร์";
      button.dataset.enabled = "false";
      status.textContent = "เปิดครั้งเดียว แล้วระบบจะจำไว้ในเครื่องนี้";
    }
  }

  async function enableNotifications() {
    if (!supportsNotifications()) {
      alert("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบระบบ");
      return;
    }

    if (isIOS() && !isStandalone()) {
      alert("บน iPhone/iPad ให้เพิ่มหน้า METIST ไปที่หน้าจอโฮมก่อน: กด Share → Add to Home Screen แล้วเปิด METIST จากไอคอนบนหน้าจอ จากนั้นกดเปิดการแจ้งเตือนอีกครั้ง");
      return;
    }

    const reg = await ensureServiceWorker();
    if (!reg) {
      alert("ยังเปิดระบบแจ้งเตือนไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่");
      return;
    }

    let permission = Notification.permission;
    if (permission !== "granted") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      updateUI();
      return;
    }

    localStorage.setItem(PREF_KEY, "on");
    await startMonitoring({ prime: true });
    updateUI();

    try {
      await reg.showNotification("METIST 🌸", {
        body: "เปิดการแจ้งเตือนออเดอร์บนเครื่องนี้แล้ว",
        icon: "logo.png.jpg",
        tag: "metist-notify-enabled",
        data: { url: "./" }
      });
    } catch (_) {}
  }

  function disableNotifications() {
    localStorage.setItem(PREF_KEY, "off");
    stopMonitoring();
    updateUI();
  }

  async function handleButtonClick() {
    const enabled = localStorage.getItem(PREF_KEY) === "on" && Notification.permission === "granted";
    if (enabled) {
      if (confirm("ปิดการแจ้งเตือนออเดอร์บนเครื่องนี้หรือไม่?")) disableNotifications();
      return;
    }
    await enableNotifications();
  }

  function injectUI() {
    if (document.getElementById("metistNotifyCard")) return;

    const style = document.createElement("style");
    style.textContent = `
      #metistNotifyCard {
        max-width: 720px;
        margin: 0 auto 14px;
        padding: 12px;
        background: rgba(255,255,255,.94);
        border: 1px solid #f2cbd3;
        border-radius: 16px;
        box-shadow: 0 6px 18px rgba(212,131,152,.10);
        text-align: center;
      }
      #metistNotifyButton {
        width: 100%;
        border: 0;
        border-radius: 13px;
        padding: 11px 12px;
        background: #f8c8dc;
        color: #7c4251;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      #metistNotifyButton[data-enabled="true"] {
        background: #d9f5e3;
        color: #397650;
      }
      #metistNotifyButton:disabled { opacity: .65; cursor: not-allowed; }
      #metistNotifyStatus {
        display: block;
        margin-top: 6px;
        color: #9b7a82;
        font-size: 10px;
        line-height: 1.35;
      }
    `;
    document.head.appendChild(style);

    const card = document.createElement("div");
    card.id = "metistNotifyCard";
    card.innerHTML = `
      <button id="metistNotifyButton" type="button">🔔 เปิดการแจ้งเตือนออเดอร์</button>
      <small id="metistNotifyStatus">เปิดครั้งเดียว แล้วระบบจะจำไว้ในเครื่องนี้</small>
    `;

    const header = document.querySelector(".header");
    const nav = document.querySelector(".nav-menu");
    if (nav?.parentNode) nav.parentNode.insertBefore(card, nav);
    else if (header?.parentNode) header.parentNode.insertBefore(card, header.nextSibling);
    else document.body.insertBefore(card, document.body.firstChild);

    document.getElementById("metistNotifyButton")?.addEventListener("click", handleButtonClick);
    updateUI();
  }

  async function restorePreference() {
    if (!supportsNotifications()) return;
    if (localStorage.getItem(PREF_KEY) === "on" && Notification.permission === "granted") {
      await ensureServiceWorker();
      await startMonitoring({ prime: true });
    }
    updateUI();
  }

  ensureManifestLink();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
      injectUI();
      await restorePreference();
    }, { once: true });
  } else {
    injectUI();
    restorePreference();
  }
})();
