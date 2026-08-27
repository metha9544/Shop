/*
 * METIST Shop - Phase 4 Shared Catalog
 * Load after phase2.js and phase3-notify.js.
 * Phase 2 remains the editor; this file syncs metist_catalog_v2 with Supabase.
 */
(() => {
  "use strict";
  if (window.__metistPhase4ShopLoaded) return;
  window.__metistPhase4ShopLoaded = true;

  const STORAGE_KEY = "metist_catalog_v2";
  const SNAPSHOT_KEY = "metist_catalog_cloud_snapshot_v1";
  const PAIRING_SESSION_KEY = "metist_catalog_pairing_session_v1";
  const FUNCTION_URL = "https://hcxegxzyaeckcfybqmuw.supabase.co/functions/v1/catalog-admin";
  const WATCH_MS = 900;

  const DEFAULT_CATALOG = {
    flowers: [
      { id:"flower-red", name:"แดง", color:"#e63946", active:true },
      { id:"flower-white", name:"ขาว", color:"#ffffff", active:true },
      { id:"flower-pink", name:"ชมพู", color:"#f7b2cc", active:true },
      { id:"flower-blue", name:"น้ำเงิน", color:"#457b9d", active:true },
      { id:"flower-purple", name:"ม่วง", color:"#9b5de5", active:true }
    ],
    papers: [
      { id:"paper-black", name:"ดำ", color:"#333333", active:true },
      { id:"paper-white", name:"ขาว", color:"#ffffff", active:true },
      { id:"paper-pink", name:"ชมพู", color:"#f7b2cc", active:true },
      { id:"paper-red", name:"แดง", color:"#e63946", active:true }
    ],
    bows: [
      { id:"bow-red", name:"แดง", color:"#e63946", active:true },
      { id:"bow-white", name:"ขาว", color:"#ffffff", active:true },
      { id:"bow-pink", name:"ชมพู", color:"#f7b2cc", active:true },
      { id:"bow-blue", name:"น้ำเงิน", color:"#457b9d", active:true },
      { id:"bow-purple", name:"ม่วง", color:"#9b5de5", active:true },
      { id:"bow-pink-glass", name:"ชมพูแก้ว", color:"#ff007f", active:true },
      { id:"bow-red-glass", name:"แดงแก้ว", color:"#b91d1d", active:true }
    ],
    extras: [
      { id:"extra-butterfly", name:"ผีเสื้อ", price:5, active:true },
      { id:"extra-crown", name:"มงกุฎ", price:10, active:true },
      { id:"extra-led", name:"ไฟLED", price:25, active:true },
      { id:"extra-pearl", name:"ไข่มุก", price:0, active:true },
      { id:"extra-lace", name:"ขอบลูกไม้", price:0, active:true },
      { id:"extra-pearl-edge", name:"ขอบมุก", price:0, active:true },
      { id:"extra-card", name:"การ์ด", price:0, active:true }
    ]
  };

  let applyingRemote = false;
  let publishTimer = null;
  let lastObservedRaw = "";

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function normalize(value) {
    const src = value && typeof value === "object" ? value : DEFAULT_CATALOG;
    const out = {};
    for (const category of ["flowers","papers","bows","extras"]) {
      const items = Array.isArray(src[category]) ? src[category] : DEFAULT_CATALOG[category];
      const seen = new Set();
      out[category] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i] || {};
        const name = String(item.name || "").trim();
        if (!name) continue;
        const key = name.toLocaleLowerCase("th-TH");
        if (seen.has(key)) continue;
        seen.add(key);
        const row = {
          id: String(item.id || `${category}-${Date.now()}-${i}`),
          name,
          active: item.active !== false
        };
        if (category === "extras") {
          const p = Number(item.price);
          row.price = Number.isFinite(p) && p >= 0 ? p : 0;
        } else {
          const c = String(item.color || "#cccccc");
          row.color = /^#[0-9a-f]{6}$/i.test(c) ? c : "#cccccc";
        }
        out[category].push(row);
      }
    }
    return out;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : DEFAULT_CATALOG);
    } catch (_) {
      return clone(DEFAULT_CATALOG);
    }
  }

  function canonical(value) {
    return JSON.stringify(normalize(value));
  }

  function injectStatus() {
    if (document.getElementById("p4-catalog-status")) return;
    const box = document.createElement("div");
    box.id = "p4-catalog-status";
    box.style.cssText = "max-width:720px;margin:0 auto 10px;padding:7px 10px;border-radius:12px;background:#fff;border:1px solid #eadfe3;color:#8a6d77;font-size:10px;text-align:center;box-sizing:border-box;";
    box.textContent = "☁️ Catalog: กำลังเชื่อมต่อ...";
    const notify = document.getElementById("metistNotifyCard");
    const nav = document.querySelector(".nav-menu");
    if (notify?.parentNode) notify.insertAdjacentElement("afterend", box);
    else if (nav?.parentNode) nav.parentNode.insertBefore(box, nav);
    else document.body.prepend(box);
  }

  function status(text, tone = "normal") {
    const el = document.getElementById("p4-catalog-status");
    if (!el) return;
    el.textContent = `☁️ Catalog: ${text}`;
    el.style.background = tone === "ok" ? "#f0fff5" : tone === "error" ? "#fff3f3" : "#fff";
  }

  async function fetchRemote() {
    const { data, error } = await _supabase
      .from("catalog_config")
      .select("catalog,revision,updated_at")
      .eq("id","main")
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function getPairingCode(force = false) {
    if (!force) {
      const saved = sessionStorage.getItem(PAIRING_SESSION_KEY);
      if (saved) return saved;
    }
    const code = prompt("กรอกรหัสผู้ดูแล Catalog (Pairing Code)");
    if (!code) return "";
    sessionStorage.setItem(PAIRING_SESSION_KEY, code.trim());
    return code.trim();
  }

  async function publishLocal(reason = "change", retry = true) {
    clearTimeout(publishTimer);
    const catalog = readLocal();
    const raw = canonical(catalog);
    if (raw === localStorage.getItem(SNAPSHOT_KEY)) {
      status("ซิงก์แล้ว", "ok");
      return true;
    }

    let pairingCode = await getPairingCode(false);
    if (!pairingCode) {
      status("ยังไม่ได้ซิงก์ (ต้องใส่ Pairing Code)");
      return false;
    }

    status("กำลังบันทึกขึ้น Cloud...");
    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode, catalog })
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 401 && retry) {
        sessionStorage.removeItem(PAIRING_SESSION_KEY);
        pairingCode = await getPairingCode(true);
        if (!pairingCode) {
          status("Pairing Code ไม่ถูกต้อง", "error");
          return false;
        }
        return publishLocal(reason, false);
      }
      if (!response.ok || !result?.ok) {
        throw new Error(result?.detail || result?.error || `HTTP ${response.status}`);
      }

      const savedRaw = canonical(result.catalog || catalog);
      localStorage.setItem(SNAPSHOT_KEY, savedRaw);
      lastObservedRaw = canonical(readLocal());
      status(`ซิงก์แล้ว · revision ${result.revision}`, "ok");
      return true;
    } catch (err) {
      console.warn("METIST Phase 4 catalog publish failed", err);
      status("ซิงก์ไม่สำเร็จ — ระบบร้านยังใช้ข้อมูลในเครื่องได้", "error");
      return false;
    }
  }

  function applyRemote(remote) {
    if (!remote?.catalog) return;
    const remoteRaw = canonical(remote.catalog);
    const localRaw = canonical(readLocal());
    localStorage.setItem(SNAPSHOT_KEY, remoteRaw);

    if (remoteRaw === localRaw) {
      lastObservedRaw = localRaw;
      status(`ซิงก์แล้ว · revision ${remote.revision || "-"}`, "ok");
      return;
    }

    applyingRemote = true;
    localStorage.setItem(STORAGE_KEY, remoteRaw);
    lastObservedRaw = remoteRaw;
    status(`อัปเดตจาก Cloud · revision ${remote.revision || "-"}`, "ok");
    setTimeout(() => location.reload(), 180);
  }

  async function initialSync() {
    injectStatus();
    lastObservedRaw = canonical(readLocal());
    try {
      const remote = await fetchRemote();
      if (!remote) {
        status("ยังไม่มีข้อมูลกลาง — กำลังตั้งค่าครั้งแรก");
        await publishLocal("initial");
        return;
      }

      const localRaw = canonical(readLocal());
      const snapshotRaw = localStorage.getItem(SNAPSHOT_KEY);

      // If this device has a previously synced snapshot and local data changed afterward,
      // local edits are treated as pending changes and are published first.
      if (snapshotRaw && localRaw !== snapshotRaw) {
        await publishLocal("offline-local-change");
      } else {
        applyRemote(remote);
      }
    } catch (err) {
      console.warn("METIST Phase 4 initial sync failed", err);
      status("Cloud ใช้งานไม่ได้ชั่วคราว — ใช้ Catalog ในเครื่อง", "error");
    }
  }

  function startLocalWatcher() {
    setInterval(() => {
      if (applyingRemote) return;
      const raw = canonical(readLocal());
      if (!lastObservedRaw) {
        lastObservedRaw = raw;
        return;
      }
      if (raw === lastObservedRaw) return;

      lastObservedRaw = raw;
      status("พบการแก้ไข กำลังเตรียมซิงก์...");
      clearTimeout(publishTimer);
      publishTimer = setTimeout(() => publishLocal("local-change"), 550);
    }, WATCH_MS);
  }

  function startRealtime() {
    try {
      _supabase
        .channel("metist-catalog-shop-v1")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "catalog_config", filter: "id=eq.main" },
          (payload) => {
            const next = payload?.new;
            if (!next?.catalog) return;
            const remoteRaw = canonical(next.catalog);
            const localRaw = canonical(readLocal());
            const snapshot = localStorage.getItem(SNAPSHOT_KEY);
            if (snapshot && localRaw !== snapshot) return; // do not overwrite an unsynced local edit
            if (remoteRaw !== localRaw) applyRemote(next);
            else {
              localStorage.setItem(SNAPSHOT_KEY, remoteRaw);
              status(`ซิงก์แล้ว · revision ${next.revision || "-"}`, "ok");
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("METIST Phase 4 realtime unavailable", err);
    }
  }

  async function init() {
    await initialSync();
    startLocalWatcher();
    startRealtime();
    console.info("METIST Phase 4 shared catalog loaded (Shop)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
