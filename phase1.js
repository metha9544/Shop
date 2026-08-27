/*
 * METIST Shop - Phase 1 Safety Patch
 * Load this file AFTER the existing inline application script.
 * Branch: phase1-safety
 */
(() => {
    "use strict";

    const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));

    const toFiniteNumber = (value, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    };

    const toNonNegativeNumber = (value, fallback = 0) => {
        return Math.max(0, toFiniteNumber(value, fallback));
    };

    const toNonNegativeInt = (value, fallback = 0) => {
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    const safeUrl = (value) => {
        if (!value) return "";
        try {
            const url = new URL(String(value), window.location.origin);
            return (url.protocol === "http:" || url.protocol === "https:") ? url.href : "";
        } catch {
            return "";
        }
    };

    const encodeInline = (value) => encodeURIComponent(String(value ?? "")).replace(/'/g, "%27");

    window.phase1CopyEncoded = (token) => copyToClipboard(decodeURIComponent(token));
    window.phase1OpenEncodedUrl = (token) => {
        const url = safeUrl(decodeURIComponent(token));
        if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
    window.phase1ApproveEncoded = (token) => approveCloudOrder(decodeURIComponent(token));

    // Accessibility: allow browser zoom and prevent negative numeric entries in the UI.
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute("content", "width=device-width, initial-scale=1.0");

    ["basePrice", "ship-flower", "cost-amount"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.min = "0";
    });

    // ---------- Price calculation ----------
    window.calcTotal = function calcTotal() {
        const base = toNonNegativeNumber(document.getElementById("basePrice")?.value || 0);
        const ship = toNonNegativeNumber(document.getElementById("ship-flower")?.value || 0);
        let extraTotal = 0;

        Object.keys(selectedExtras || {}).forEach((extra) => {
            const qty = toNonNegativeInt(selectedExtras[extra], 0);
            const price = toNonNegativeNumber(extraPrice[extra], 0);
            extraTotal += qty * price;
        });

        const total = base + extraTotal + ship;
        const summary = document.getElementById("summary-text");
        if (summary) summary.innerText = `ราคารวม: ${total.toLocaleString()} บาท`;
        return total;
    };

    // ---------- Order save / cutter edit fix ----------
    window.saveOrder = function saveOrder(productType) {
        const nameInput = document.getElementById("customer");
        const addressInput = document.getElementById("admin-address");
        const baseInput = document.getElementById("basePrice");
        const shippingInput = document.getElementById("ship-flower");

        const name = String(nameInput?.value || "").trim();
        const address = String(addressInput?.value || "").trim();
        if (!name) {
            alert("กรุณาใส่ชื่อลูกค้า");
            return;
        }

        const baseRaw = Number(baseInput?.value || 0);
        const shippingRaw = Number(shippingInput?.value || 0);

        if (!Number.isFinite(baseRaw) || baseRaw < 0) {
            alert("ราคาสินค้าต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
            baseInput?.focus();
            return;
        }
        if (!Number.isFinite(shippingRaw) || shippingRaw < 0) {
            alert("ค่าส่งต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
            shippingInput?.focus();
            return;
        }

        const basePrice = baseRaw;
        const shipping = shippingRaw;

        let cutterData = { normal: 0, withSwitch: 0 };

        if (productType === "เครื่องตัด") {
            const existing = orderBeingEdited !== null
                ? (orders[orderBeingEdited]?.details?.cutterDetails || {})
                : {};

            const normalDefault = String(toNonNegativeInt(existing.normal, 0));
            const switchDefault = String(toNonNegativeInt(existing.withSwitch, 0));

            const nQty = prompt("จำนวนเครื่องตัด (ปกติ) ที่ต้องการ", normalDefault);
            if (nQty === null) return;

            const sQty = prompt("จำนวนเครื่องตัด (ติดสวิตช์) ที่ต้องการ", switchDefault);
            if (sQty === null) return;

            if (!/^\d+$/.test(String(nQty).trim()) || !/^\d+$/.test(String(sQty).trim())) {
                alert("จำนวนเครื่องตัดต้องเป็นเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
                return;
            }

            cutterData.normal = toNonNegativeInt(nQty, 0);
            cutterData.withSwitch = toNonNegativeInt(sQty, 0);

            if (cutterData.normal === 0 && cutterData.withSwitch === 0) {
                alert("กรุณาระบุจำนวนเครื่องตัดอย่างน้อย 1 ชิ้น");
                return;
            }
        }

        let total;
        let details;

        if (productType === "เครื่องตัด") {
            total = basePrice + shipping;
            details = {
                ...(orderBeingEdited !== null ? (orders[orderBeingEdited]?.details || {}) : {}),
                isCutter: true,
                basePrice,
                qty: cutterData.normal + cutterData.withSwitch,
                cutterDetails: { ...cutterData },
                address
            };
            // Remove flower-only fields when an order is explicitly a cutter.
            delete details.flowers;
            delete details.paper;
            delete details.bow;
            delete details.extras;
        } else {
            total = calcTotal();
            details = {
                ...(orderBeingEdited !== null ? (orders[orderBeingEdited]?.details || {}) : {}),
                flowers: JSON.parse(JSON.stringify(currentFlowerData || { "พื้น": {}, "กริตเตอร์": {} })),
                paper: (selectedPapers || []).join(", "),
                bow: (selectedBows || []).join(", "),
                extras: { ...(selectedExtras || {}) },
                basePrice,
                qty: 1,
                address
            };
            delete details.isCutter;
            delete details.cutterDetails;
        }

        const displayName = productType === "เครื่องตัด"
            ? `${name} (✂️ ${cutterData.normal}+${cutterData.withSwitch})`
            : name;

        if (orderBeingEdited !== null) {
            const current = orders[orderBeingEdited];
            orders[orderBeingEdited] = {
                ...current,
                name: displayName,
                total,
                shipping,
                details,
                type: productType
            };
            orderBeingEdited = null;
        } else {
            orders.push({
                id: Date.now(),
                name: displayName,
                type: productType,
                total,
                shipping,
                details,
                date: new Date().toLocaleDateString("th-TH"),
                status: false,
                paid: false,
                deposit: 0
            });
        }

        updateStore();

        if (nameInput) nameInput.value = "";
        if (addressInput) addressInput.value = "";
        if (shippingInput) shippingInput.value = "";
        if (baseInput) baseInput.value = "";

        resetPart("flowers");
        resetPart("papers");
        resetPart("bows");
        resetPart("extras");

        const saveButton = document.getElementById("btn-save-flower");
        if (saveButton) {
            saveButton.innerText = "บันทึกออเดอร์";
            saveButton.setAttribute("onclick", "saveOrder('ดอกไม้')");
        }

        switchPage("orders");
    };

    window.editOrder = function editOrder(index) {
        const o = orders[index];
        if (!o) return;

        if (o.type === "เคลม" || o.details?.case === "CLAIM") {
            alert("ออเดอร์เคลมไม่ควรแก้ผ่านฟอร์มดอกไม้/เครื่องตัด เพื่อป้องกันข้อมูลเคลมหาย");
            return;
        }

        orderBeingEdited = index;
        switchPage("flower");

        const details = o.details || {};
        document.getElementById("customer").value = String(o.name || "").split(" (")[0];
        document.getElementById("admin-address").value = details.address || "";
        document.getElementById("ship-flower").value = toNonNegativeNumber(o.shipping, 0);
        document.getElementById("basePrice").value = details.basePrice ?? "";

        const saveButton = document.getElementById("btn-save-flower");

        if (o.type === "ดอกไม้") {
            currentFlowerData = JSON.parse(JSON.stringify(details.flowers || { "พื้น": {}, "กริตเตอร์": {} }));
            selectedPapers = details.paper ? String(details.paper).split(",").map(x => x.trim()).filter(Boolean) : [];
            selectedBows = details.bow ? String(details.bow).split(",").map(x => x.trim()).filter(Boolean) : [];
            selectedExtras = { ...(details.extras || {}) };

            document.getElementById("paperChoice").innerText = "เลือก: " + (details.paper || "-");
            document.getElementById("bowChoice").innerText = "เลือก: " + (details.bow || "-");
            renderFlowers();
            renderExtraChoice();

            if (saveButton) {
                saveButton.innerText = "อัปเดตออเดอร์ (แก้ไข)";
                saveButton.setAttribute("onclick", "saveOrder('ดอกไม้')");
            }
        } else if (o.type === "เครื่องตัด") {
            currentFlowerData = { "พื้น": {}, "กริตเตอร์": {} };
            selectedPapers = [];
            selectedBows = [];
            selectedExtras = {};
            renderFlowers();
            renderExtraChoice();
            document.getElementById("paperChoice").innerText = "เลือก: -";
            document.getElementById("bowChoice").innerText = "เลือก: -";

            if (saveButton) {
                saveButton.innerText = "อัปเดตเครื่องตัด (แก้ไข)";
                saveButton.setAttribute("onclick", "saveOrder('เครื่องตัด')");
            }
        }

        calcTotal();
    };

    // ---------- Deposit validation ----------
    window.setDeposit = function setDeposit(i) {
        const order = orders[i];
        if (!order) return;

        const total = toNonNegativeNumber(order.total, 0);
        const current = toNonNegativeNumber(order.deposit, 0);
        const amt = prompt("ระบุจำนวนเงินมัดจำ:", String(current));

        if (amt === null) return;

        const parsed = Number(amt);
        if (!Number.isFinite(parsed) || parsed < 0) {
            alert("เงินมัดจำต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
            return;
        }
        if (parsed > total) {
            alert(`เงินมัดจำต้องไม่เกินยอดทั้งหมด ${total.toLocaleString()} บาท`);
            return;
        }

        order.deposit = parsed;
        updateStore();
    };

    // ---------- Cost validation ----------
    window.addCost = function addCost() {
        const descInput = document.getElementById("cost-desc");
        const amountInput = document.getElementById("cost-amount");

        const desc = String(descInput?.value || "").trim() || "ทั่วไป";
        const amount = Number(amountInput?.value);

        if (!Number.isFinite(amount) || amount <= 0) {
            alert("จำนวนค่าใช้จ่ายต้องมากกว่า 0");
            amountInput?.focus();
            return;
        }

        costs.push({
            desc,
            amount,
            date: new Date().toLocaleDateString("th-TH")
        });

        localStorage.setItem("metist_costs", JSON.stringify(costs));
        renderSummary();

        if (descInput) descInput.value = "";
        if (amountInput) amountInput.value = "";
    };

    // ---------- XSS-safe order list ----------
    window.renderOrderList = function renderOrderList() {
        const listDiv = document.getElementById("order-list");
        if (!listDiv) return;

        const search = String(document.getElementById("searchOrder")?.value || "").toLowerCase();

        const filtered = orders.filter((o) => {
            const matchSearch = String(o.name || "").toLowerCase().includes(search);
            const matchFilter = currentFilter === "all" || o.type === currentFilter;
            return matchSearch && matchFilter;
        }).sort((a, b) => {
            if (a.status !== b.status) return a.status ? 1 : -1;
            return toFiniteNumber(b.id, 0) - toFiniteNumber(a.id, 0);
        });

        const pending = document.getElementById("pending-count");
        if (pending) pending.innerText = `รอดำเนินการ: ${orders.filter(o => !o.status).length}`;

        listDiv.innerHTML = filtered.map((o) => {
            const realIdx = orders.findIndex(orig => orig.id === o.id);
            const details = o.details || {};
            const isCutter = o.type === "เครื่องตัด";
            const isClaim = details.case === "CLAIM" || o.type === "เคลม";
            const accent = isClaim ? "var(--claim-accent)" : isCutter ? "var(--cutter-color)" : "var(--pink-dark)";
            const bg = isClaim ? "#fff5f5" : isCutter ? "#f0f9f8" : "#fff5f8";

            const total = toNonNegativeNumber(o.total, 0);
            const deposit = Math.min(toNonNegativeNumber(o.deposit, 0), total);
            const remaining = Math.max(0, total - deposit);
            const address = String(details.address || "");
            const addressToken = encodeInline(address);

            let cutterLabel = "";
            if (isCutter && details.cutterDetails) {
                const normal = toNonNegativeInt(details.cutterDetails.normal, 0);
                const withSwitch = toNonNegativeInt(details.cutterDetails.withSwitch, 0);
                cutterLabel = `<div style="font-size:10px; color:${accent}">ปกติ: ${normal} | สวิตช์: ${withSwitch}</div>`;
            }

            const addressPreview = address.length > 30 ? `${address.substring(0, 30)}...` : address;

            return `<div class="order-item" style="border-left:8px solid ${accent}; background:${bg};">
                <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; color:${accent}">
                    <span>${isClaim ? "🛠️ CLAIM" : isCutter ? "✂️ CUTTER" : "🌸 FLOWER"} ${o.status ? "✅" : "⏳"}</span>
                    <span style="color:gray">${escapeHTML(o.date || "")}</span>
                </div>
                <div style="margin:5px 0"><b>👤 ${escapeHTML(o.name || "")}</b>
                    ${toNonNegativeNumber(o.shipping, 0) > 0 ? `<small style="color:#ff6b6b">(ส่ง +${toNonNegativeNumber(o.shipping, 0).toLocaleString()})</small>` : ""}
                </div>
                ${cutterLabel}
                ${address ? `<div style="font-size:11px; color:#777; background:#fff; padding:5px; border-radius:8px; margin-bottom:5px; border:1px solid #eee;">
                    📍 ${escapeHTML(addressPreview)}
                    <button class="btn-copy-address" onclick="phase1CopyEncoded('${addressToken}')">ก๊อปที่อยู่</button>
                </div>` : ""}
                <div style="font-weight:bold">ยอดทั้งหมด: ${total.toLocaleString()} ฿</div>
                ${!o.paid && deposit > 0 ? `
                    <div style="font-size:11px; color:#666;">มัดจำแล้ว:
                        <span style="color:#51cf66; font-weight:bold;">${deposit.toLocaleString()} ฿</span>
                    </div>
                    <div style="font-size:11px; color:#ff6b6b; margin-bottom:5px;">คงเหลือ: <b>${remaining.toLocaleString()} ฿</b></div>` : ""}
                <div class="btn-group">
                    <button class="status-btn" style="background:${o.status ? "#51cf66" : "#ff6b6b"}; flex:1" onclick="toggleStatus(${realIdx})">${o.status ? "ทำแล้ว" : "รอดำเนินการ"}</button>
                    <button class="status-btn" style="background:${o.paid ? "#51cf66" : "#ff6b6b"}; flex:1" onclick="togglePaid(${realIdx})">${o.paid ? "จ่ายครบแล้ว" : "ยังไม่ครบ"}</button>
                </div>
                <div class="btn-group">
                    <button class="status-btn" style="background:white; color:${accent}; border:1px solid ${accent}; flex:1" onclick="setDeposit(${realIdx})">มัดจำ</button>
                    <button class="status-btn" style="background:white; color:${accent}; border:1px solid ${accent}; flex:1" onclick="openPopup(${realIdx}, 'order')">รายละเอียด</button>
                    <button class="status-btn" style="background:white; color:${accent}; border:1px solid ${accent}; flex:1" onclick="openPopup(${realIdx}, 'receipt')">ใบเสร็จ</button>
                </div>
                <div class="btn-group">
                    <button class="status-btn" style="background:white; color:${accent}; border:1px solid ${accent}; flex:1" onclick="editOrder(${realIdx})">แก้ไขออเดอร์</button>
                    <button class="status-btn" style="background:#eee; color:#999; width:35px" onclick="deleteOrder(${realIdx})">🗑️</button>
                </div>
            </div>`;
        }).join("");
    };

    // ---------- XSS-safe popup / receipt ----------
    window.openPopup = function openPopup(i, mode) {
        const o = orders[i];
        if (!o) return;

        const details = o.details || {};
        const isReceipt = mode === "receipt";
        const total = toNonNegativeNumber(o.total, 0);
        const deposit = Math.min(toNonNegativeNumber(o.deposit, 0), total);
        const remaining = Math.max(0, total - deposit);
        const shipping = toNonNegativeNumber(o.shipping, 0);
        const productSubtotal = Math.max(0, total - shipping);

        document.getElementById("receipt-title").innerText = isReceipt ? "METIST" : "🌸 METIST ✨";

        let body = isReceipt
            ? `ลูกค้า: คุณ ${escapeHTML(o.name || "")}<br>`
            : `👤 <b>ลูกค้า:</b> ${escapeHTML(o.name || "")}<br>`;

        if (details.address) {
            body += `📍 <b>ที่อยู่:</b> ${escapeHTML(details.address)}<br>`;
        }

        if (details.case === "CLAIM") {
            const claimItems = Array.isArray(details.items) ? details.items.map(escapeHTML).join(", ") : "-";
            body += `<div style="background:#fff0f0; padding:10px; border-radius:10px; margin:10px 0; border:1px solid #ffcccc; font-size:12px;">`;
            body += `<b style="color:red;">🛠️ ข้อมูลการเคลม</b><br>`;
            body += `<b>สินค้าที่เคลม:</b> ${claimItems || "-"}<br>`;
            body += `<b>ปัญหาที่เจอ:</b> ${escapeHTML(details.reason || "-")}<br>`;
            body += `<b>วิธีส่งคืน:</b> ${escapeHTML(details.method || "-")} (${escapeHTML(details.courier || "-")})<br>`;
            body += `</div>`;
        } else if (o.type === "เครื่องตัด") {
            if (details.cutterDetails) {
                body += `รายการ: เครื่องตัดปกติ x${toNonNegativeInt(details.cutterDetails.normal, 0)} | ติดสวิตช์ x${toNonNegativeInt(details.cutterDetails.withSwitch, 0)}<br>`;
            } else {
                body += `รายการ: งานเครื่องตัด${details.hasSwitch ? " (สวิตช์)" : ""} x${toNonNegativeInt(details.qty, 1)} ชิ้น<br>`;
            }
        } else {
            const fTxt = [];
            const flowers = details.flowers || {};
            for (const type in flowers) {
                for (const color in (flowers[type] || {})) {
                    const count = toNonNegativeInt(flowers[type][color], 0);
                    if (count > 0) {
                        fTxt.push(`${escapeHTML(color)}${type === "กริตเตอร์" ? "(กริต)" : ""} x${count}`);
                    }
                }
            }

            const exTxt = Object.keys(details.extras || {})
                .filter(ex => toNonNegativeInt(details.extras[ex], 0) > 0)
                .map(escapeHTML);

            const paper = escapeHTML(details.paper || "-");
            const bow = escapeHTML(details.bow || "-");

            body += isReceipt
                ? `สีดอกไม้: ${fTxt.join(", ") || "-"}<br>กระดาษ: ${paper}<br>โบว์: ${bow}<br>ตกแต่ง: ${exTxt.join(", ") || "-"}`
                : `🌹 <b>สีดอก:</b> ${fTxt.join(", ") || "-"}<br>📦 <b>กระดาษ:</b> ${paper}<br>🎀 <b>โบว์:</b> ${bow}<br>✨ <b>ของตกแต่ง:</b> ${exTxt.join(", ") || "-"}`;
        }

        body += "<br>";

        if (shipping > 0) {
            body += `<br>${isReceipt ? "ราคาสินค้า:" : "💐 <b>ราคาสินค้า:</b>"} ${productSubtotal.toLocaleString()} ฿`;
            body += `<br>${isReceipt ? "ค่าจัดส่ง:" : "🚚 <b>ค่าจัดส่ง:</b>"} ${shipping.toLocaleString()} ฿`;
        }

        body += `<br><b style="font-size:1.1rem; color:var(--pink-dark)">ยอดรวมสุทธิ: ${total.toLocaleString()} ฿</b>`;

        if (!o.paid && deposit > 0) {
            body += `<br>${isReceipt ? "มัดจำแล้ว:" : '<span style="color:#51cf66;">มัดจำแล้ว:</span>'} ${deposit.toLocaleString()} ฿`;
            body += `<br><b style="color:#ff6b6b;">คงเหลือ: ${remaining.toLocaleString()} ฿</b>`;
        }

        document.getElementById("rc-date").innerText = "วันที่: " + String(o.date || "");
        document.getElementById("modal-body").innerHTML = body;
        document.getElementById("receipt-extras").style.display = isReceipt ? "flex" : "none";
        document.getElementById("receiptModal").style.display = "block";
    };

    // ---------- XSS-safe summary ----------
    window.renderSummary = function renderSummary() {
        const totalSales = orders.reduce((s, o) => s + toNonNegativeNumber(o.total, 0), 0);
        const cost = costs.reduce((s, c) => s + toNonNegativeNumber(c.amount, 0), 0);

        const flowerOrders = orders.filter(o => o.type === "ดอกไม้");
        const fPaid = flowerOrders.reduce((s, o) => s + (o.paid
            ? toNonNegativeNumber(o.total, 0)
            : Math.min(toNonNegativeNumber(o.deposit, 0), toNonNegativeNumber(o.total, 0))), 0);
        const fPending = flowerOrders.reduce((s, o) => {
            const total = toNonNegativeNumber(o.total, 0);
            const deposit = Math.min(toNonNegativeNumber(o.deposit, 0), total);
            return s + (o.paid ? 0 : Math.max(0, total - deposit));
        }, 0);

        const cutterOrders = orders.filter(o => o.type === "เครื่องตัด");
        const cPaid = cutterOrders.reduce((s, o) => s + (o.paid
            ? toNonNegativeNumber(o.total, 0)
            : Math.min(toNonNegativeNumber(o.deposit, 0), toNonNegativeNumber(o.total, 0))), 0);
        const cPending = cutterOrders.reduce((s, o) => {
            const total = toNonNegativeNumber(o.total, 0);
            const deposit = Math.min(toNonNegativeNumber(o.deposit, 0), total);
            return s + (o.paid ? 0 : Math.max(0, total - deposit));
        }, 0);

        let cutNormal = 0;
        let cutSwitch = 0;
        let totalFlowers = 0;
        const flowerCounts = {};

        orders.forEach((o) => {
            const details = o.details || {};

            if (o.type === "เครื่องตัด") {
                if (details.cutterDetails) {
                    cutNormal += toNonNegativeInt(details.cutterDetails.normal, 0);
                    cutSwitch += toNonNegativeInt(details.cutterDetails.withSwitch, 0);
                } else if (details.hasSwitch) {
                    cutSwitch += toNonNegativeInt(details.qty, 1);
                } else {
                    cutNormal += toNonNegativeInt(details.qty, 1);
                }
            }

            if (o.type === "ดอกไม้" && details.flowers) {
                for (const type in details.flowers) {
                    for (const color in (details.flowers[type] || {})) {
                        const count = toNonNegativeInt(details.flowers[type][color], 0);
                        if (count > 0) {
                            flowerCounts[color] = (flowerCounts[color] || 0) + count;
                            totalFlowers += count;
                        }
                    }
                }
            }
        });

        document.getElementById("stat-sale").innerText = totalSales.toLocaleString();
        document.getElementById("stat-cost").innerText = cost.toLocaleString();
        document.getElementById("stat-profit").innerText = (totalSales - cost).toLocaleString();
        document.getElementById("pay-flower-done").innerText = fPaid.toLocaleString();
        document.getElementById("pay-flower-pending").innerText = fPending.toLocaleString();
        document.getElementById("pay-cutter-done").innerText = cPaid.toLocaleString();
        document.getElementById("pay-cutter-pending").innerText = cPending.toLocaleString();

        let statHtml = `
        <div style="display:flex; gap:15px; align-items:flex-start;">
            <div style="flex:1; background:#f0f9f8; padding:12px; border-radius:15px; border:1px solid #e0f2f1;">
                <b style="color:var(--cutter-color); display:block; margin-bottom:8px; border-bottom:1px solid #c8e6c9; padding-bottom:3px;">✂️ เครื่องตัด</b>
                <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>ปกติ:</span> <b>${cutNormal}</b></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>สวิตช์:</span> <b>${cutSwitch}</b></div>
                <hr style="border:0; border-top:1px dashed #ccc; margin:8px 0;">
                <div style="display:flex; justify-content:space-between; color:var(--cutter-color);"><span>รวม:</span> <b>${cutNormal + cutSwitch} ชิ้น</b></div>
            </div>
            <div style="flex:1.2; background:#fff5f8; padding:12px; border-radius:15px; border:1px solid #fce4ec;">
                <b style="color:var(--pink-dark); display:block; margin-bottom:8px; border-bottom:1px solid #f8bbd0; padding-bottom:3px;">🌹 ดอกไม้แยกสี</b>
                <div style="max-height:120px; overflow-y:auto; margin-bottom:5px;">`;

        for (const flower in flowerCounts) {
            statHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                <span>${escapeHTML(flower)}:</span> <b>${flowerCounts[flower]}</b>
            </div>`;
        }

        if (Object.keys(flowerCounts).length === 0) {
            statHtml += `<div style="text-align:center; color:#ccc; padding:10px;">- ไม่มีข้อมูล -</div>`;
        }

        statHtml += `
                </div>
                <hr style="border:0; border-top:1px dashed #ccc; margin:8px 0;">
                <div style="display:flex; justify-content:space-between; color:var(--pink-dark);"><span>รวมทั้งหมด:</span> <b>${totalFlowers} ดอก</b></div>
            </div>
        </div>`;

        document.getElementById("product-stats-content").innerHTML = statHtml;

        document.getElementById("cost-history-body").innerHTML = [...costs].reverse().map((c, i) => `
            <tr>
                <td>${escapeHTML(c.date || "")}</td>
                <td>${escapeHTML(c.desc || "")}</td>
                <td>${toNonNegativeNumber(c.amount, 0).toLocaleString()}</td>
                <td><button onclick="deleteCost(${costs.length - 1 - i})" style="border:none; color:red; background:none; cursor:pointer;">ลบ</button></td>
            </tr>`).join("");
    };

    // ---------- XSS-safe task summary ----------
    window.showTaskSummary = function showTaskSummary() {
        const pendingOrders = orders.filter(o => !o.status);
        if (pendingOrders.length === 0) {
            alert("เย้! ไม่มีออเดอร์ค้างทำในขณะนี้ 🌸");
            return;
        }

        const flowerSummary = {};
        let cutterNormalQty = 0;
        let cutterSwitchQty = 0;

        pendingOrders.forEach((o) => {
            const details = o.details || {};

            if (details.cutterDetails) {
                cutterNormalQty += toNonNegativeInt(details.cutterDetails.normal, 0);
                cutterSwitchQty += toNonNegativeInt(details.cutterDetails.withSwitch, 0);
            } else if (o.type === "เครื่องตัด" || o.type === "เคลม") {
                if (details.hasSwitch) {
                    cutterSwitchQty += toNonNegativeInt(details.qty, 1);
                } else if (details.qty) {
                    cutterNormalQty += toNonNegativeInt(details.qty, 1);
                }
            }

            const flowers = details.flowers || {};
            for (const type in flowers) {
                for (const color in (flowers[type] || {})) {
                    const count = toNonNegativeInt(flowers[type][color], 0);
                    if (count > 0) {
                        const key = `${color} (${type})`;
                        flowerSummary[key] = (flowerSummary[key] || 0) + count;
                    }
                }
            }
        });

        let summaryHtml = `<div style="text-align:left; font-size:14px;"><p><b>📦 งานค้างทั้งหมด: ${pendingOrders.length} รายการ</b></p><hr>`;

        if (cutterNormalQty > 0) {
            summaryHtml += `<p style="color:var(--cutter-color); font-size:16px; margin-bottom:5px;"><b>✂️ เครื่องตัด (ปกติ): ${cutterNormalQty} ชิ้น</b></p>`;
        }
        if (cutterSwitchQty > 0) {
            summaryHtml += `<p style="color:var(--purple-dark); font-size:16px; margin-top:0;"><b>🔘 เครื่องตัด (สวิตช์): ${cutterSwitchQty} ชิ้น</b></p>`;
        }

        if (Object.keys(flowerSummary).length > 0) {
            summaryHtml += `<p><b>🌹 ดอกไม้ที่ต้องเตรียม:</b></p><ul>`;
            for (const flower in flowerSummary) {
                summaryHtml += `<li>${escapeHTML(flower)}: ${flowerSummary[flower]} ดอก</li>`;
            }
            summaryHtml += `</ul>`;
        }

        summaryHtml += `</div>`;

        document.getElementById("receipt-title").innerText = "📋 สรุปสิ่งที่ต้องเตรียม";
        document.getElementById("rc-date").innerText = "ข้อมูล ณ วันที่: " + new Date().toLocaleDateString("th-TH");
        document.getElementById("modal-body").innerHTML = summaryHtml;
        document.getElementById("receipt-extras").style.display = "none";
        document.getElementById("receiptModal").style.display = "block";
    };

    // ---------- Cloud orders: safe rendering ----------
    window.fetchCloudOrders = async function fetchCloudOrders() {
        const listDiv = document.getElementById("cloud-list");
        if (!listDiv) return;

        listDiv.innerHTML = "<div style='text-align:center; padding:20px;'>กำลังโหลด...</div>";

        try {
            const { data, error } = await _supabase.from("orders").select("*").eq("status", false);
            if (error) throw error;

            const rows = Array.isArray(data) ? data : [];
            const navCloud = document.getElementById("nav-cloud");
            if (navCloud) navCloud.innerText = rows.length > 0 ? `(${rows.length})` : "";

            if (rows.length === 0) {
                listDiv.innerHTML = "<div style='text-align:center; padding:20px; color:gray;'>ไม่มีออเดอร์ใหม่ครับ ☁️</div>";
                return;
            }

            listDiv.innerHTML = rows.map((o) => {
                const details = o.details || {};
                const isClaim = details.case === "CLAIM";
                const accent = isClaim ? "var(--claim-accent)" : "var(--purple-dark)";

                const slip = safeUrl(o.slip_url || "");
                const slipToken = encodeInline(slip);
                const idToken = encodeInline(o.id);

                return `
                <div class="card" style="border-left:8px solid ${accent}; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold; color:${accent}">${isClaim ? "🛠️ งานเคลม" : "☁️ ออนไลน์"}</span>
                        ${slip ? `<button class="btn-view-slip" onclick="phase1OpenEncodedUrl('${slipToken}')">🔍 ดูสลิป</button>` : ""}
                    </div>
                    <div style="margin:5px 0"><b>👤 ${escapeHTML(o.name || "-")}</b></div>
                    <div style="font-size:11px; color:#666; background:#f9f9f9; padding:8px; border-radius:10px; margin-bottom:10px; border:1px solid #ddd;">
                        📍 ${escapeHTML(details.address || "ไม่มีที่อยู่")}
                    </div>
                    <button onclick="phase1ApproveEncoded('${idToken}')" style="width:100%; background:${accent}; color:white; border:none; padding:10px; border-radius:12px; font-weight:bold; cursor:pointer;">
                        📥 รับออเดอร์เข้าเครื่อง
                    </button>
                </div>`;
            }).join("");
        } catch (err) {
            listDiv.innerHTML = `<div style="color:red; text-align:center; padding:20px;">โหลดไม่สำเร็จ: ${escapeHTML(err?.message || "Unknown error")}</div>`;
        }
    };

    // ---------- Cloud orders: dedupe + rollback on failed remote update ----------
    window.approveCloudOrder = async function approveCloudOrder(dbId) {
        if (!confirm("ยืนยันการรับออเดอร์นี้เข้าเครื่อง?")) return;

        const cloudOrderId = String(dbId);

        try {
            const duplicate = orders.some(o => String(o.cloudOrderId || "") === cloudOrderId);
            if (duplicate) {
                const { error: syncError } = await _supabase
                    .from("orders")
                    .update({ status: true })
                    .eq("id", dbId)
                    .eq("status", false);

                if (syncError) throw syncError;

                alert("ออเดอร์นี้มีอยู่ในเครื่องแล้ว จึงไม่เพิ่มรายการซ้ำ");
                await fetchCloudOrders();
                return;
            }

            const { data: cloudData, error: fetchErr } = await _supabase
                .from("orders")
                .select("*")
                .eq("id", dbId)
                .eq("status", false)
                .maybeSingle();

            if (fetchErr) throw fetchErr;

            if (!cloudData) {
                alert("ออเดอร์นี้ถูกรับไปแล้ว หรือไม่มีสถานะรอรับ");
                await fetchCloudOrders();
                return;
            }

            const details = cloudData.details || {};
            const isClaim = details.case === "CLAIM";
            const cDetails = {
                ...(details.cutterDetails || { normal: 0, withSwitch: 0 })
            };

            if (isClaim && details.cutterType === "switch") {
                cDetails.withSwitch = 1;
                cDetails.normal = 0;
            }

            const localId = Date.now();
            const newOrder = {
                id: localId,
                cloudOrderId,
                name: String(cloudData.name || ""),
                type: isClaim ? "เคลม" : (details.isCutter ? "เครื่องตัด" : "ดอกไม้"),
                total: toNonNegativeNumber(cloudData.total, 0),
                shipping: 0,
                details: { ...details, cutterDetails: cDetails },
                date: new Date().toLocaleDateString("th-TH"),
                status: false,
                paid: true,
                deposit: toNonNegativeNumber(cloudData.total, 0)
            };

            orders.push(newOrder);
            updateStore();

            const { data: updatedRows, error: updateErr } = await _supabase
                .from("orders")
                .update({ status: true })
                .eq("id", dbId)
                .eq("status", false)
                .select("id");

            if (updateErr || !Array.isArray(updatedRows) || updatedRows.length !== 1) {
                const localIndex = orders.findIndex(o => o.id === localId && String(o.cloudOrderId || "") === cloudOrderId);
                if (localIndex >= 0) orders.splice(localIndex, 1);
                updateStore();

                if (updateErr) throw updateErr;
                throw new Error("ออเดอร์นี้อาจถูกรับจากอุปกรณ์อื่นแล้ว จึงยกเลิกรายการที่เพิ่งเพิ่มในเครื่อง");
            }

            alert("รับออเดอร์เรียบร้อย!");
            await fetchCloudOrders();
        } catch (err) {
            alert("เกิดข้อผิดพลาด: " + (err?.message || String(err)));
        }
    };

    // ---------- Safer backup import ----------
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

                if (!confirm(`นำเข้าข้อมูล ${data.orders.length} ออเดอร์ และ ${data.costs.length} ค่าใช้จ่าย?`)) {
                    return;
                }

                localStorage.setItem("metist_orders", JSON.stringify(data.orders));
                localStorage.setItem("metist_costs", JSON.stringify(data.costs));
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

    // Refresh the current page state using the patched renderers.
    updatePendingNav();
    if (document.getElementById("page-orders")?.classList.contains("active")) renderOrderList();
    if (document.getElementById("page-summary")?.classList.contains("active")) renderSummary();

    console.info("METIST Phase 1 safety patch loaded");
})();
