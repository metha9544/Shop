/*
 * METIST Shop - Phase 2 Catalog Manager
 * Load AFTER phase1.js
 * Adds configurable flower/paper/bow/extra options without changing historical orders.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "metist_catalog_v2";

  const DEFAULT_CATALOG = {
    flowers: [
      { id: "flower-red", name: "แดง", color: "#e63946", active: true },
      { id: "flower-white", name: "ขาว", color: "#ffffff", active: true },
      { id: "flower-pink", name: "ชมพู", color: "#f7b2cc", active: true },
      { id: "flower-blue", name: "น้ำเงิน", color: "#457b9d", active: true },
      { id: "flower-purple", name: "ม่วง", color: "#9b5de5", active: true }
    ],
    papers: [
      { id: "paper-black", name: "ดำ", color: "#333333", active: true },
      { id: "paper-white", name: "ขาว", color: "#ffffff", active: true },
      { id: "paper-pink", name: "ชมพู", color: "#f7b2cc", active: true },
      { id: "paper-red", name: "แดง", color: "#e63946", active: true }
    ],
    bows: [
      { id: "bow-red", name: "แดง", color: "#e63946", active: true },
      { id: "bow-white", name: "ขาว", color: "#ffffff", active: true },
      { id: "bow-pink", name: "ชมพู", color: "#f7b2cc", active: true },
      { id: "bow-blue", name: "น้ำเงิน", color: "#457b9d", active: true },
      { id: "bow-purple", name: "ม่วง", color: "#9b5de5", active: true },
      { id: "bow-pink-glass", name: "ชมพูแก้ว", color: "#ff007f", active: true },
      { id: "bow-red-glass", name: "แดงแก้ว", color: "#b91d1d", active: true }
    ],
    extras: [
      { id: "extra-butterfly", name: "ผีเสื้อ", price: 5, active: true },
      { id: "extra-crown", name: "มงกุฎ", price: 10, active: true },
      { id: "extra-led", name: "ไฟLED", price: 25, active: true },
      { id: "extra-pearl", name: "ไข่มุก", price: 0, active: true },
      { id: "extra-lace", name: "ขอบลูกไม้", price: 0, active: true },
      { id: "extra-pearl-edge", name: "ขอบมุก", price: 0, active: true },
      { id: "extra-card", name: "การ์ด", price: 0, active: true }
    ]
  };

  const CATEGORY_META = {
    flowers: { label: "สีดอกไม้", icon: "🌹", hasColor: true, hasPrice: false },
    papers: { label: "กระดาษห่อ", icon: "📦", hasColor: true, hasPrice: false },
    bows: { label: "โบว์", icon: "🎀", hasColor: true, hasPrice: false },
    extras: { label: "ของตกแต่ง", icon: "✨", hasColor: false, hasPrice: true }
  };

  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));

  function makeId(category) {
    if (window.crypto?.randomUUID) return `${category}-${crypto.randomUUID()}`;
    return `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeItem(category, item) {
    const meta = CATEGORY_META[category];
    const base = {
      id: String(item?.id || makeId(category)),
      name: String(item?.name || "").trim(),
      active: item?.active !== false
    };
    if (meta.hasColor) {
      const color = String(item?.color || "#cccccc");
      base.color = /^#[0-9a-f]{6}$/i.test(color) ? color : "#cccccc";
    }
    if (meta.hasPrice) {
      const p = Number(item?.price);
      base.price = Number.isFinite(p) && p >= 0 ? p : 0;
    }
    return base;
  }

  function normalizeCatalog(value) {
    const result = {};
    for (const category of Object.keys(DEFAULT_CATALOG)) {
      const source = Array.isArray(value?.[category]) ? value[category] : DEFAULT_CATALOG[category];
      result[category] = source
        .map(item => normalizeItem(category, item))
        .filter(item => item.name);
    }
    return result;
  }

  function loadCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeCatalog(JSON.parse(raw)) : clone(DEFAULT_CATALOG);
    } catch (err) {
      console.warn("Catalog load failed, using defaults", err);
      return clone(DEFAULT_CATALOG);
    }
  }

  let catalog = loadCatalog();
  let managerCategory = "papers";
  let editingItemId = null;

  function saveCatalog() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    syncExtraPrices();
    refreshAllCatalogUI();
  }

  function syncExtraPrices() {
    // extraPrice comes from the original app and remains the calculation source.
    for (const item of catalog.extras) {
      extraPrice[item.name] = Number(item.price) || 0;
    }
  }

  function activeItems(category) {
    return (catalog[category] || []).filter(item => item.active);
  }

  function itemColor(category, name) {
    const found = (catalog[category] || []).find(item => item.name === name);
    return found?.color || "#cccccc";
  }

  function readableTextColor(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#333";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    return luminance > 180 ? "#4b3b40" : "#ffffff";
  }

  // ---------- Styles ----------
  function injectStyles() {
    if (document.getElementById("phase2-catalog-style")) return;
    const style = document.createElement("style");
    style.id = "phase2-catalog-style";
    style.textContent = `
      .catalog-toolbar {
        display:flex; justify-content:flex-end; align-items:center; gap:8px;
        margin:-3px 0 12px;
      }
      .catalog-manage-btn {
        border:1px solid #ead5dc; background:#fff; color:var(--pink-dark);
        border-radius:10px; padding:7px 10px; font-size:11px; font-weight:700;
        cursor:pointer;
      }
      .p2-stepper-grid {
        display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;
      }
      .p2-option-card {
        border:1px solid #eee; border-radius:14px; background:#fff; padding:10px;
        min-width:0; box-shadow:0 3px 8px rgba(0,0,0,.04);
      }
      .p2-option-top { display:flex; align-items:center; gap:8px; min-width:0; }
      .p2-swatch {
        width:30px; height:30px; border-radius:50%; border:2px solid #fff;
        outline:1px solid #ddd; flex:0 0 auto;
      }
      .p2-option-name {
        font-size:12px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .p2-option-sub { font-size:10px; color:#999; margin-top:2px; }
      .p2-stepper {
        display:grid; grid-template-columns:36px 1fr 36px; align-items:center; gap:5px;
        margin-top:9px;
      }
      .p2-stepper button {
        height:34px; border:none; border-radius:10px; font-size:19px; font-weight:800;
        cursor:pointer;
      }
      .p2-minus { background:#f4f4f4; color:#777; }
      .p2-plus { background:#fff0f3; color:var(--pink-dark); }
      .p2-count {
        height:34px; border-radius:10px; background:#fafafa; display:flex;
        align-items:center; justify-content:center; font-weight:800; font-size:14px;
      }
      .p2-toggle-grid {
        display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px;
      }
      .p2-toggle {
        position:relative; border:2px solid transparent; border-radius:12px;
        padding:10px 5px; min-height:52px; font-size:11px; font-weight:800;
        cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.04);
      }
      .p2-toggle.selected {
        border-color:var(--pink-dark); box-shadow:0 0 0 2px rgba(212,131,152,.12);
      }
      .p2-check {
        position:absolute; top:4px; right:5px; border-radius:50%; width:17px; height:17px;
        display:flex; align-items:center; justify-content:center; background:var(--pink-dark);
        color:#fff; font-size:10px;
      }
      .p2-hint { font-size:10px; color:#999; margin:-5px 0 8px; }
      .p2-manager {
        display:none; position:fixed; inset:0; z-index:3000; background:rgba(46,30,36,.55);
        padding:15px; box-sizing:border-box; align-items:flex-end; justify-content:center;
      }
      .p2-manager.open { display:flex; }
      .p2-sheet {
        width:100%; max-width:520px; max-height:88vh; background:#fff; border-radius:24px 24px 16px 16px;
        overflow:hidden; display:flex; flex-direction:column; box-shadow:0 18px 60px rgba(0,0,0,.25);
      }
      .p2-sheet-head {
        padding:16px 18px 12px; display:flex; justify-content:space-between; align-items:center;
        border-bottom:1px solid #f0e8eb;
      }
      .p2-sheet-head h3 { margin:0; font-size:16px; }
      .p2-close {
        width:34px; height:34px; border:none; border-radius:50%; background:#f4f1f2; font-size:18px;
      }
      .p2-editor {
        padding:13px 16px; background:#fff8fa; border-bottom:1px solid #f3e3e8;
      }
      .p2-form-row { display:flex; gap:8px; align-items:center; }
      .p2-form-row + .p2-form-row { margin-top:8px; }
      .p2-editor input[type="text"], .p2-editor input[type="number"] {
        background:#fff; border-radius:11px; padding:10px; font-size:14px;
      }
      .p2-editor input[type="color"] {
        width:48px; height:42px; padding:3px; border:1px solid #e8dce0; border-radius:11px; background:#fff;
      }
      .p2-save, .p2-cancel {
        border:none; border-radius:11px; padding:10px 13px; font-weight:800;
      }
      .p2-save { background:var(--pink-dark); color:#fff; }
      .p2-cancel { background:#eee; color:#777; }
      .p2-manager-list { overflow:auto; padding:10px 14px 18px; }
      .p2-manage-row {
        display:flex; gap:9px; align-items:center; padding:10px 4px; border-bottom:1px solid #f2edef;
      }
      .p2-manage-row.inactive { opacity:.55; }
      .p2-manage-main { flex:1; min-width:0; }
      .p2-manage-title { font-size:13px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .p2-manage-meta { font-size:10px; color:#999; margin-top:2px; }
      .p2-mini-btn {
        border:none; border-radius:9px; padding:7px 8px; font-size:10px; font-weight:700; cursor:pointer;
      }
      .p2-hide { background:#f2f2f2; color:#666; }
      .p2-edit { background:#fff0f3; color:var(--pink-dark); }
      .p2-delete { background:#fff0f0; color:#e05252; }
      .p2-empty { padding:25px; text-align:center; color:#aaa; font-size:12px; }
      @media (max-width:360px) {
        .p2-stepper-grid { grid-template-columns:1fr; }
        .p2-toggle-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- Manager modal ----------
  function ensureManagerModal() {
    if (document.getElementById("p2-manager")) return;

    const modal = document.createElement("div");
    modal.id = "p2-manager";
    modal.className = "p2-manager";
    modal.innerHTML = `
      <div class="p2-sheet" role="dialog" aria-modal="true" aria-labelledby="p2-manager-title">
        <div class="p2-sheet-head">
          <h3 id="p2-manager-title">จัดการตัวเลือก</h3>
          <button type="button" class="p2-close" id="p2-close" aria-label="ปิด">×</button>
        </div>
        <div class="p2-editor">
          <div class="p2-form-row">
            <input id="p2-name" type="text" placeholder="ชื่อรายการ เช่น ครีม" autocomplete="off">
            <input id="p2-color" type="color" value="#f4d9c6" aria-label="เลือกสี">
            <input id="p2-price" type="number" min="0" step="1" placeholder="ราคา">
          </div>
          <div class="p2-form-row">
            <button type="button" id="p2-save" class="p2-save">＋ เพิ่มรายการ</button>
            <button type="button" id="p2-cancel" class="p2-cancel" style="display:none;">ยกเลิกแก้ไข</button>
          </div>
        </div>
        <div id="p2-manager-list" class="p2-manager-list"></div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("p2-close").addEventListener("click", closeManager);
    document.getElementById("p2-cancel").addEventListener("click", resetEditor);
    document.getElementById("p2-save").addEventListener("click", saveEditorItem);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeManager();
    });
  }

  function addManageButton(gridId, category) {
    const grid = document.getElementById(gridId);
    const card = grid?.closest(".card");
    if (!card || card.querySelector(`[data-p2-manage="${category}"]`)) return;

    const toolbar = document.createElement("div");
    toolbar.className = "catalog-toolbar";
    toolbar.innerHTML = `<button type="button" class="catalog-manage-btn" data-p2-manage="${category}">⚙️ จัดการตัวเลือก</button>`;
    const h2 = card.querySelector("h2");
    if (h2) h2.insertAdjacentElement("afterend", toolbar);
    else card.prepend(toolbar);

    toolbar.querySelector("button").addEventListener("click", () => openManager(category));
  }

  function openManager(category) {
    managerCategory = category;
    editingItemId = null;
    ensureManagerModal();
    resetEditor();
    renderManager();
    document.getElementById("p2-manager").classList.add("open");
  }

  function closeManager() {
    document.getElementById("p2-manager")?.classList.remove("open");
    editingItemId = null;
  }

  function resetEditor() {
    editingItemId = null;
    const meta = CATEGORY_META[managerCategory];
    const name = document.getElementById("p2-name");
    const color = document.getElementById("p2-color");
    const price = document.getElementById("p2-price");
    const save = document.getElementById("p2-save");
    const cancel = document.getElementById("p2-cancel");
    if (!name) return;

    name.value = "";
    color.value = "#f4d9c6";
    price.value = "";
    color.style.display = meta.hasColor ? "" : "none";
    price.style.display = meta.hasPrice ? "" : "none";
    price.placeholder = "ราคา";
    save.textContent = "＋ เพิ่มรายการ";
    cancel.style.display = "none";
  }

  function renderManager() {
    const meta = CATEGORY_META[managerCategory];
    document.getElementById("p2-manager-title").textContent = `${meta.icon} จัดการ${meta.label}`;

    const list = document.getElementById("p2-manager-list");
    const items = catalog[managerCategory] || [];

    if (!items.length) {
      list.innerHTML = `<div class="p2-empty">ยังไม่มีรายการ กด “เพิ่มรายการ” ด้านบนได้เลย</div>`;
      return;
    }

    list.innerHTML = items.map(item => {
      const visual = meta.hasColor
        ? `<span class="p2-swatch" style="background:${esc(item.color)}"></span>`
        : `<span style="font-size:22px;width:32px;text-align:center;">✨</span>`;
      const sub = meta.hasPrice
        ? `ราคา ${Number(item.price || 0).toLocaleString()} บาท`
        : item.color;
      return `
        <div class="p2-manage-row ${item.active ? "" : "inactive"}" data-id="${esc(item.id)}">
          ${visual}
          <div class="p2-manage-main">
            <div class="p2-manage-title">${esc(item.name)}</div>
            <div class="p2-manage-meta">${item.active ? "กำลังแสดง" : "ซ่อนไว้"} · ${esc(sub)}</div>
          </div>
          <button type="button" class="p2-mini-btn p2-hide" data-action="toggle">${item.active ? "ซ่อน" : "แสดง"}</button>
          <button type="button" class="p2-mini-btn p2-edit" data-action="edit">แก้ไข</button>
          <button type="button" class="p2-mini-btn p2-delete" data-action="delete">ลบ</button>
        </div>`;
    }).join("");

    list.querySelectorAll(".p2-manage-row").forEach(row => {
      const id = row.dataset.id;
      row.querySelector('[data-action="toggle"]').addEventListener("click", () => toggleCatalogItem(id));
      row.querySelector('[data-action="edit"]').addEventListener("click", () => beginEditItem(id));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteCatalogItem(id));
    });
  }

  function saveEditorItem() {
    const meta = CATEGORY_META[managerCategory];
    const name = document.getElementById("p2-name").value.trim();
    const color = document.getElementById("p2-color").value;
    const rawPrice = document.getElementById("p2-price").value;

    if (!name) {
      alert("กรุณาใส่ชื่อรายการ");
      document.getElementById("p2-name").focus();
      return;
    }

    const duplicate = catalog[managerCategory].find(item =>
      item.name.toLowerCase() === name.toLowerCase() && item.id !== editingItemId
    );
    if (duplicate) {
      alert(`มีรายการ “${name}” อยู่แล้ว`);
      return;
    }

    let price = 0;
    if (meta.hasPrice) {
      price = Number(rawPrice || 0);
      if (!Number.isFinite(price) || price < 0) {
        alert("ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
        return;
      }
    }

    if (editingItemId) {
      const index = catalog[managerCategory].findIndex(item => item.id === editingItemId);
      if (index < 0) return;
      const old = catalog[managerCategory][index];
      migrateCurrentSelection(managerCategory, old.name, name);
      catalog[managerCategory][index] = {
        ...old,
        name,
        ...(meta.hasColor ? { color } : {}),
        ...(meta.hasPrice ? { price } : {})
      };
    } else {
      catalog[managerCategory].push({
        id: makeId(managerCategory),
        name,
        active: true,
        ...(meta.hasColor ? { color } : {}),
        ...(meta.hasPrice ? { price } : {})
      });
    }

    saveCatalog();
    renderManager();
    resetEditor();
  }

  function beginEditItem(id) {
    const item = catalog[managerCategory].find(x => x.id === id);
    if (!item) return;

    editingItemId = id;
    const meta = CATEGORY_META[managerCategory];
    document.getElementById("p2-name").value = item.name;
    if (meta.hasColor) document.getElementById("p2-color").value = item.color;
    if (meta.hasPrice) document.getElementById("p2-price").value = item.price;
    document.getElementById("p2-save").textContent = "บันทึกการแก้ไข";
    document.getElementById("p2-cancel").style.display = "";
    document.getElementById("p2-name").focus();
  }

  function clearCurrentSelection(category, name) {
    if (category === "flowers") {
      for (const type of ["พื้น", "กริตเตอร์"]) {
        if (currentFlowerData?.[type]) delete currentFlowerData[type][name];
      }
    } else if (category === "papers") {
      selectedPapers = selectedPapers.filter(x => x !== name);
    } else if (category === "bows") {
      selectedBows = selectedBows.filter(x => x !== name);
    } else if (category === "extras") {
      if (selectedExtras) delete selectedExtras[name];
    }
  }

  function migrateCurrentSelection(category, oldName, newName) {
    if (oldName === newName) return;

    if (category === "flowers") {
      for (const type of ["พื้น", "กริตเตอร์"]) {
        const bucket = currentFlowerData?.[type];
        if (!bucket || !(oldName in bucket)) continue;
        bucket[newName] = (Number(bucket[newName]) || 0) + (Number(bucket[oldName]) || 0);
        delete bucket[oldName];
      }
    } else if (category === "papers") {
      selectedPapers = [...new Set(selectedPapers.map(x => x === oldName ? newName : x))];
    } else if (category === "bows") {
      selectedBows = [...new Set(selectedBows.map(x => x === oldName ? newName : x))];
    } else if (category === "extras") {
      if (selectedExtras && oldName in selectedExtras) {
        selectedExtras[newName] = (Number(selectedExtras[newName]) || 0) + (Number(selectedExtras[oldName]) || 0);
        delete selectedExtras[oldName];
      }
    }
  }

  function toggleCatalogItem(id) {
    const item = catalog[managerCategory].find(x => x.id === id);
    if (!item) return;

    item.active = !item.active;
    if (!item.active) clearCurrentSelection(managerCategory, item.name);

    saveCatalog();
    renderManager();
  }

  function deleteCatalogItem(id) {
    const item = catalog[managerCategory].find(x => x.id === id);
    if (!item) return;

    const ok = confirm(
      `ลบ “${item.name}” ออกจากตัวเลือก?\n\nออเดอร์เก่าที่เคยใช้รายการนี้จะยังคงข้อมูลเดิมอยู่`
    );
    if (!ok) return;

    clearCurrentSelection(managerCategory, item.name);
    catalog[managerCategory] = catalog[managerCategory].filter(x => x.id !== id);

    saveCatalog();
    renderManager();
    resetEditor();
  }

  // ---------- Selection UI ----------
  window.phase2AdjustFlower = function(nameToken, delta) {
    const name = decodeURIComponent(nameToken);
    const type = document.querySelector('input[name="flowerType"]:checked')?.value || "กริตเตอร์";
    currentFlowerData[type] ||= {};
    const next = Math.max(0, (Number(currentFlowerData[type][name]) || 0) + Number(delta || 0));
    if (next === 0) delete currentFlowerData[type][name];
    else currentFlowerData[type][name] = next;
    renderFlowers();
    calcTotal();
  };

  window.renderFlowers = function renderFlowers() {
    const grid = document.getElementById("flower-grid");
    if (!grid) return;

    grid.className = "p2-stepper-grid";
    const type = document.querySelector('input[name="flowerType"]:checked')?.value || "กริตเตอร์";

    const items = activeItems("flowers");
    if (!items.length) {
      grid.innerHTML = `<div class="p2-empty" style="grid-column:1/-1;">ยังไม่มีสีดอกไม้ กด “จัดการตัวเลือก” เพื่อเพิ่ม</div>`;
      return;
    }

    grid.innerHTML = items.map(item => {
      const count = Number(currentFlowerData?.[type]?.[item.name]) || 0;
      const token = encodeURIComponent(item.name).replace(/'/g, "%27");
      return `
        <div class="p2-option-card">
          <div class="p2-option-top">
            <span class="p2-swatch" style="background:${esc(item.color)}"></span>
            <div style="min-width:0;flex:1;">
              <div class="p2-option-name">${esc(item.name)}</div>
              <div class="p2-option-sub">${esc(type)}</div>
            </div>
          </div>
          <div class="p2-stepper">
            <button type="button" class="p2-minus" onclick="phase2AdjustFlower('${token}',-1)" aria-label="ลด ${esc(item.name)}">−</button>
            <div class="p2-count">${count}</div>
            <button type="button" class="p2-plus" onclick="phase2AdjustFlower('${token}',1)" aria-label="เพิ่ม ${esc(item.name)}">＋</button>
          </div>
        </div>`;
    }).join("");
  };

  window.phase2TogglePaper = function(nameToken) {
    const name = decodeURIComponent(nameToken);
    selectedPapers = [...new Set(selectedPapers)];
    if (selectedPapers.includes(name)) selectedPapers = selectedPapers.filter(x => x !== name);
    else selectedPapers.push(name);
    renderPaperGrid();
  };

  window.phase2ToggleBow = function(nameToken) {
    const name = decodeURIComponent(nameToken);
    selectedBows = [...new Set(selectedBows)];
    if (selectedBows.includes(name)) selectedBows = selectedBows.filter(x => x !== name);
    else selectedBows.push(name);
    renderBowGrid();
  };

  function renderToggleGrid(category, gridId, selected, toggleFn) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.className = "p2-toggle-grid";

    const items = activeItems(category);
    if (!items.length) {
      grid.innerHTML = `<div class="p2-empty" style="grid-column:1/-1;">ยังไม่มีตัวเลือก กด “จัดการตัวเลือก” เพื่อเพิ่ม</div>`;
      return;
    }

    const uniqueSelected = [...new Set(selected)];
    grid.innerHTML = items.map(item => {
      const isSelected = uniqueSelected.includes(item.name);
      const token = encodeURIComponent(item.name).replace(/'/g, "%27");
      return `
        <button type="button" class="p2-toggle ${isSelected ? "selected" : ""}"
          style="background:${esc(item.color)};color:${readableTextColor(item.color)}"
          onclick="${toggleFn}('${token}')">
          ${isSelected ? '<span class="p2-check">✓</span>' : ""}
          ${esc(item.name)}
        </button>`;
    }).join("");
  }

  function renderPaperGrid() {
    selectedPapers = [...new Set(selectedPapers)];
    renderToggleGrid("papers", "paper-grid", selectedPapers, "phase2TogglePaper");
    const label = document.getElementById("paperChoice");
    if (label) label.innerText = "เลือก: " + (selectedPapers.join(", ") || "-");
  }

  function renderBowGrid() {
    selectedBows = [...new Set(selectedBows)];
    renderToggleGrid("bows", "bow-grid", selectedBows, "phase2ToggleBow");
    const label = document.getElementById("bowChoice");
    if (label) label.innerText = "เลือก: " + (selectedBows.join(", ") || "-");
  }

  window.phase2AdjustExtra = function(nameToken, delta) {
    const name = decodeURIComponent(nameToken);
    const next = Math.max(0, (Number(selectedExtras[name]) || 0) + Number(delta || 0));
    if (next === 0) delete selectedExtras[name];
    else selectedExtras[name] = next;
    renderExtraGrid();
    renderExtraChoice();
    calcTotal();
  };

  function renderExtraGrid() {
    const grid = document.getElementById("extra-grid");
    if (!grid) return;

    grid.className = "p2-stepper-grid";
    const items = activeItems("extras");
    if (!items.length) {
      grid.innerHTML = `<div class="p2-empty" style="grid-column:1/-1;">ยังไม่มีของตกแต่ง กด “จัดการตัวเลือก” เพื่อเพิ่ม</div>`;
      return;
    }

    grid.innerHTML = items.map(item => {
      const count = Number(selectedExtras[item.name]) || 0;
      const token = encodeURIComponent(item.name).replace(/'/g, "%27");
      return `
        <div class="p2-option-card">
          <div class="p2-option-top">
            <span style="font-size:24px;width:30px;text-align:center;">✨</span>
            <div style="min-width:0;flex:1;">
              <div class="p2-option-name">${esc(item.name)}</div>
              <div class="p2-option-sub">${Number(item.price || 0).toLocaleString()} บาท / ชิ้น</div>
            </div>
          </div>
          <div class="p2-stepper">
            <button type="button" class="p2-minus" onclick="phase2AdjustExtra('${token}',-1)">−</button>
            <div class="p2-count">${count}</div>
            <button type="button" class="p2-plus" onclick="phase2AdjustExtra('${token}',1)">＋</button>
          </div>
        </div>`;
    }).join("");
  }

  window.renderExtraChoice = function renderExtraChoice() {
    const selectedList = Object.keys(selectedExtras || {})
      .filter(name => Number(selectedExtras[name]) > 0)
      .map(name => `${name} x${Number(selectedExtras[name])}`);
    const label = document.getElementById("extraChoice");
    if (label) label.innerText = "เลือก: " + (selectedList.join(", ") || "-");
  };

  // Keep reset buttons visually in sync.
  const previousResetPart = window.resetPart;
  window.resetPart = function resetPart(part) {
    if (part === "flowers") {
      currentFlowerData = { "พื้น": {}, "กริตเตอร์": {} };
      renderFlowers();
    } else if (part === "papers") {
      selectedPapers = [];
      renderPaperGrid();
    } else if (part === "bows") {
      selectedBows = [];
      renderBowGrid();
    } else if (part === "extras") {
      selectedExtras = {};
      renderExtraGrid();
      renderExtraChoice();
    } else if (typeof previousResetPart === "function") {
      previousResetPart(part);
    }
    calcTotal();
  };

  // Phase 1 edit logic is kept; we only refresh dynamic option controls afterward.
  const previousEditOrder = window.editOrder;
  window.editOrder = function editOrder(index) {
    previousEditOrder(index);
    renderPaperGrid();
    renderBowGrid();
    renderExtraGrid();
    renderExtraChoice();
    renderFlowers();
  };

  // ---------- Backup: include catalog ----------
  window.exportData = function exportData() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      orders,
      costs,
      catalog
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `METIST_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  window.importData = function importData(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || !Array.isArray(data.orders) || !Array.isArray(data.costs)) {
          throw new Error("รูปแบบไฟล์ Backup ไม่ถูกต้อง");
        }

        const hasCatalog = data.catalog && typeof data.catalog === "object";
        const message = hasCatalog
          ? `นำเข้า ${data.orders.length} ออเดอร์, ${data.costs.length} ค่าใช้จ่าย และตัวเลือกร้าน?`
          : `นำเข้า ${data.orders.length} ออเดอร์ และ ${data.costs.length} ค่าใช้จ่าย?\n\nไฟล์เก่านี้ไม่มีตัวเลือกร้าน ระบบจะเก็บตัวเลือกปัจจุบันไว้`;

        if (!confirm(message)) return;

        localStorage.setItem("metist_orders", JSON.stringify(data.orders));
        localStorage.setItem("metist_costs", JSON.stringify(data.costs));
        if (hasCatalog) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeCatalog(data.catalog)));
        }
        location.reload();
      } catch (err) {
        alert("นำเข้าไม่สำเร็จ: " + (err?.message || String(err)));
      } finally {
        if (e?.target) e.target.value = "";
      }
    };
    reader.onerror = () => alert("อ่านไฟล์ Backup ไม่สำเร็จ");
    reader.readAsText(file);
  };

  function refreshAllCatalogUI() {
    renderFlowers();
    renderPaperGrid();
    renderBowGrid();
    renderExtraGrid();
    renderExtraChoice();
    calcTotal();
  }

  function init() {
    injectStyles();
    ensureManagerModal();
    syncExtraPrices();

    addManageButton("flower-grid", "flowers");
    addManageButton("paper-grid", "papers");
    addManageButton("bow-grid", "bows");
    addManageButton("extra-grid", "extras");

    // Helpful hints about new behavior.
    const paperGrid = document.getElementById("paper-grid");
    if (paperGrid && !paperGrid.previousElementSibling?.classList?.contains("p2-hint")) {
      const hint = document.createElement("div");
      hint.className = "p2-hint";
      hint.textContent = "แตะสีเพื่อเลือก / แตะซ้ำเพื่อยกเลิก";
      paperGrid.insertAdjacentElement("beforebegin", hint);
    }
    const bowGrid = document.getElementById("bow-grid");
    if (bowGrid && !bowGrid.previousElementSibling?.classList?.contains("p2-hint")) {
      const hint = document.createElement("div");
      hint.className = "p2-hint";
      hint.textContent = "แตะสีเพื่อเลือก / แตะซ้ำเพื่อยกเลิก";
      bowGrid.insertAdjacentElement("beforebegin", hint);
    }

    refreshAllCatalogUI();
    console.info("METIST Phase 2 catalog manager loaded");
  }

  init();
})();
