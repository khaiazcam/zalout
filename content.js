(() => {
  "use strict";
  if (window.__zaloutLoaded) return;
  window.__zaloutLoaded = true;

  // Bộ chọn lấy từ giao diện Zalo Web thật
  const SEL = {
    searchInput: "#contact-search-input",
    groupItem: '.conv-item[id^="group-item-"]', // liên hệ cá nhân là "friend-item-…" → bỏ qua
    itemName: ".conv-item-title__name",
    chatHeader: "#header",
    infoToggle: ".fa-outline-right-bar", // nút mở bảng "Thông tin nhóm" góc trên bên phải
    leaveTitle: ".chat-info-general__item--title.danger-item", // "Rời nhóm" ở cuối bảng thông tin
    leaveItem: ".chat-info-general__item",
    modal: ".zl-modal",
    modalToggle: ".z-toggle", // công tắc "Rời nhóm trong im lặng"
    toggleOff: ".fa-toggle-unchecked-24",
    modalConfirm: ".btn-danger", // nút đỏ "Rời nhóm"
    modalCancel: ".zl-modal__footer__button--cancel",
  };
  const MORE_TEXTS = ["Xem tất cả liên hệ", "Xem tất cả nhóm"];

  let panel, logBox;
  let running = false;
  let stopRequested = false;

  // ---------- tiện ích ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").normalize("NFC").replace(/\s+/g, " ").trim();
  const fold = (s) =>
    norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  const inPanel = (el) => panel && panel.contains(el);

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  const $ = (sel, root = document) => [...root.querySelectorAll(sel)].find((el) => !inPanel(el) && isVisible(el));
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)].filter((el) => !inPanel(el) && isVisible(el));

  function realClick(el) {
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  async function waitFor(fn, timeout = 5000, step = 150) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  function scrollParent(el) {
    for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
    }
    return null;
  }

  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---------- danh sách kết quả tìm kiếm ----------
  const visibleGroups = () =>
    $$(SEL.groupItem).map((el) => ({ id: el.id, name: norm(el.querySelector(SEL.itemName)?.innerText), el }));

  function listScroller() {
    const item = $(".conv-item");
    return item ? scrollParent(item) : null;
  }

  // Bấm "Xem tất cả liên hệ" rồi "Xem tất cả nhóm" để hiện đủ danh sách nhóm
  async function expandResults() {
    for (const text of MORE_TEXTS) {
      const el = [...document.querySelectorAll("span, div, button")].find(
        (e) => !inPanel(e) && e.children.length === 0 && norm(e.textContent) === text && isVisible(e)
      );
      if (el) { realClick(el); await sleep(1200); }
    }
  }

  // Đảm bảo kết quả tìm kiếm vẫn đang hiện (Zalo có thể đóng sau khi rời nhóm)
  async function ensureResults(query) {
    if ($(SEL.groupItem)) return true;
    const input = document.querySelector(SEL.searchInput);
    if (input) {
      if (norm(input.value) !== query) {
        realClick(input);
        setInputValue(input, query);
        await sleep(1800);
      }
      await expandResults();
    }
    return !!(await waitFor(() => $(SEL.groupItem), 3000));
  }

  // Cuộn danh sách từ đầu tới cuối, gọi onPage sau mỗi bước; dừng khi onPage trả true
  async function scrollList(onPage) {
    const sc = listScroller();
    if (sc) { sc.scrollTop = 0; await sleep(400); }
    for (let idle = 0; !stopRequested; ) {
      if (onPage()) return true;
      if (!sc) return false;
      const before = sc.scrollTop;
      sc.scrollTop += sc.clientHeight * 0.7;
      await sleep(350);
      idle = sc.scrollTop === before ? idle + 1 : 0;
      if (idle >= 2) return !!onPage();
    }
    return false;
  }

  async function collectAllGroups() {
    const seen = new Map();
    await scrollList(() => {
      for (const g of visibleGroups()) if (!seen.has(g.id)) seen.set(g.id, g.name);
      setProgress(`đang liệt kê… ${seen.size}`);
      return false;
    });
    const sc = listScroller();
    if (sc) sc.scrollTop = 0;
    return [...seen].map(([id, name]) => ({ id, name }));
  }

  async function findGroupItem(id) {
    const now = document.getElementById(id);
    if (isVisible(now)) return now;
    let hit = null;
    await scrollList(() => {
      const el = document.getElementById(id);
      return isVisible(el) ? (hit = el) : false;
    });
    return hit;
  }

  // ---------- rời nhóm ----------
  const chatTitle = () => norm($(SEL.chatHeader)?.innerText);

  const findLeave = () =>
    $$(SEL.leaveTitle).find((el) => /rời nhóm/i.test(el.textContent)) ||
    // dự phòng theo chữ
    $$(SEL.leaveItem).find((el) => /^rời nhóm$/i.test(norm(el.innerText)));

  async function openInfoAndFindLeave() {
    let leave = findLeave();
    if (!leave) {
      const toggle = $(SEL.infoToggle);
      if (!toggle) throw new Error("Không thấy nút mở Thông tin nhóm");
      realClick(toggle);
      leave = await waitFor(findLeave, 4000);
    }
    if (!leave) throw new Error('Không thấy nút "Rời nhóm" trong Thông tin nhóm');
    // cuộn thanh bên phải xuống cuối để thấy nút "Rời nhóm"
    const sc = scrollParent(leave);
    if (sc) sc.scrollTop = sc.scrollHeight;
    leave.scrollIntoView({ block: "center" });
    await sleep(400);
    return leave.closest(SEL.leaveItem) || leave;
  }

  async function leaveCurrentGroup(silent) {
    const leave = await openInfoAndFindLeave();
    realClick(leave);

    const modal = await waitFor(() => $(SEL.modal), 4000);
    if (!modal) throw new Error("Không thấy hộp thoại xác nhận");

    const confirmBtn = $(SEL.modalConfirm, modal);
    if (!confirmBtn) {
      // Trưởng nhóm: Zalo bắt "Chọn trưởng nhóm mới trước khi rời" → hủy và bỏ qua
      const msg = norm(modal.innerText);
      const cancel = $(SEL.modalCancel, modal);
      if (cancel) realClick(cancel);
      await waitFor(() => !isVisible(modal), 3000);
      if (/trưởng nhóm mới/i.test(msg)) throw Object.assign(new Error("Bạn là trưởng nhóm – bỏ qua"), { owner: true });
      throw new Error(`Hộp thoại không có nút Rời nhóm: "${msg.slice(0, 100)}"`);
    }

    if (silent) {
      const toggle = $(SEL.modalToggle, modal);
      if (toggle && toggle.querySelector(SEL.toggleOff)) {
        realClick(toggle);
        await waitFor(() => !toggle.querySelector(SEL.toggleOff), 1500);
      }
      if (!toggle || toggle.querySelector(SEL.toggleOff)) log("  ! Không bật được 'Rời nhóm trong im lặng'");
    }

    realClick(confirmBtn);
    const closed = await waitFor(() => !isVisible(modal), 6000);
    if (!closed) throw new Error("Hộp thoại không đóng – có thể chưa rời được");
    await sleep(600);
  }

  // ---------- luồng chính ----------
  const num = (id, def) => { const v = Number(panel.querySelector(id).value); return Number.isFinite(v) && v >= 0 ? v : def; };

  async function countdown(sec, label) {
    for (let t = sec; t > 0 && !stopRequested; t--) { setProgress(`${label} ${t}s`); await sleep(1000); }
  }

  async function autoLeave() {
    if (running) return;
    const query = norm(document.querySelector(SEL.searchInput)?.value);
    if (!query) return log("Hãy gõ từ khóa vào ô tìm kiếm của Zalo trước, rồi bấm Bắt đầu.");
    const listOnly = panel.querySelector("#zl-dry").checked;
    const silent = panel.querySelector("#zl-silent").checked;
    const delay = Math.max(1, num("#zl-delay", 3)) * 1000;
    const batchSize = num("#zl-batch", 20);
    const batchRest = num("#zl-rest", 60);
    const maxRun = num("#zl-max", 0);

    running = true; stopRequested = false; setBusy(true);
    let ok = 0, fail = 0, owner = 0, consecutiveFail = 0;
    const ownerGroups = [];

    try {
      await expandResults();
      if (!(await ensureResults(query))) { log(`Không thấy nhóm nào trong kết quả tìm "${query}".`); return; }
      const groups = await collectAllGroups();
      if (!groups.length) { log(`Không thấy nhóm nào trong kết quả tìm "${query}".`); return; }

      log(`Tìm "${query}": ${groups.length} nhóm`);
      groups.forEach((g, i) => log(`  ${i + 1}. ${g.name}`));
      if (listOnly) return;
      const preview = groups.slice(0, 15).map((g) => g.name).join("\n") +
        (groups.length > 15 ? `\n… và ${groups.length - 15} nhóm khác` : "");
      if (!confirm(`Rời ${groups.length} nhóm${silent ? " (trong im lặng)" : ""}?\n\n${preview}`)) { log("Đã hủy."); return; }

      for (const [i, g] of groups.entries()) {
        if (stopRequested) break;
        if (maxRun && ok >= maxRun) { log(`Đã đạt giới hạn ${maxRun} nhóm cho lần chạy này.`); break; }
        setProgress(`${i + 1}/${groups.length} · đã rời ${ok}`);
        log(`→ [${i + 1}/${groups.length}] ${g.name}`);
        try {
          await ensureResults(query);
          const item = await findGroupItem(g.id);
          if (!item) throw new Error("Không còn thấy nhóm trong kết quả tìm kiếm");
          realClick(item);
          // tiêu đề có thể kèm số thành viên, vd "5 Tên nhóm 5 thành viên"
          const opened = await waitFor(() => fold(chatTitle()).includes(fold(g.name)), 5000);
          if (!opened) throw new Error(`Khung chat mở ra là "${chatTitle()}", bỏ qua để an toàn`);
          await leaveCurrentGroup(silent);
          ok++; consecutiveFail = 0;
          log(`  ✓ Đã rời${silent ? " (im lặng)" : ""}`);
          if (batchSize && batchRest && ok % batchSize === 0) {
            log(`Nghỉ ${batchRest}s sau ${ok} nhóm…`);
            await countdown(batchRest, "nghỉ");
          } else {
            await sleep(delay);
          }
        } catch (e) {
          if (e.owner) {
            owner++; ownerGroups.push(g.name);
            log("  – " + e.message);
            await sleep(1000);
            continue;
          }
          fail++; consecutiveFail++;
          log("  ✗ " + e.message);
          if (consecutiveFail >= 5) {
            log("Lỗi 5 lần liên tiếp – dừng lại. Có thể Zalo đang giới hạn thao tác.");
            break;
          }
          await sleep(delay);
        }
      }
      log(stopRequested ? "Đã dừng." : "Hoàn tất.");
      log(`Đã rời ${ok} nhóm, ${owner} nhóm bạn là trưởng nhóm (bỏ qua), ${fail} lỗi.`);
      if (ownerGroups.length) log("Nhóm bạn là trưởng nhóm:\n" + ownerGroups.map((n) => "  • " + n).join("\n"));
    } catch (e) {
      log("Lỗi: " + e.message);
    } finally {
      setProgress(listOnly ? "" : `đã rời ${ok}`);
      running = false; setBusy(false);
    }
  }

  async function leaveOpened() {
    const title = chatTitle();
    if (!confirm(`Rời nhóm "${title || "đang mở"}"?`)) return;
    running = true; setBusy(true);
    try {
      await leaveCurrentGroup(panel.querySelector("#zl-silent").checked);
      log(`✓ Đã rời "${title}"`);
    } catch (e) {
      log("✗ " + e.message);
    } finally {
      running = false; setBusy(false);
    }
  }

  // ---------- giao diện ----------
  function log(msg) {
    console.log("[Zalout]", msg);
    if (!logBox) return;
    logBox.textContent += msg + "\n";
    logBox.scrollTop = logBox.scrollHeight;
  }

  function setProgress(text) {
    const el = panel?.querySelector(".zl-progress");
    if (el) el.textContent = text ? `· ${text}` : "";
  }

  function setBusy(b) {
    panel.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.disabled = btn.dataset.act === "stop" ? !b : b;
    });
  }

  function makeDraggable(box, handle) {
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      box.style.transform = "none";
      const move = (ev) => {
        box.style.left = Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx)) + "px";
        box.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) + "px";
      };
      const up = () => { removeEventListener("mousemove", move); removeEventListener("mouseup", up); };
      addEventListener("mousemove", move);
      addEventListener("mouseup", up);
      e.preventDefault();
    });
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "zl-panel";
    panel.innerHTML = `
      <header title="Kéo để di chuyển"><span>Rời nhóm hàng loạt <small class="zl-progress"></small></span><button title="Ẩn" data-close>✕</button></header>
      <div class="zl-body">
        <div>1. Gõ từ khóa vào ô tìm kiếm của Zalo.<br>2. Bấm <b>Bắt đầu</b>: liệt kê các nhóm trong kết quả và rời lần lượt (bỏ qua liên hệ cá nhân).</div>
        <div class="zl-row">
          <button class="zl-btn danger" data-act="start">Bắt đầu</button>
          <button class="zl-btn secondary" data-act="stop" disabled>Dừng</button>
          <button class="zl-btn secondary" data-act="current">Rời nhóm đang mở</button>
        </div>
        <div class="zl-row">
          <label><input type="checkbox" id="zl-silent" checked> Rời nhóm trong im lặng</label>
          <label><input type="checkbox" id="zl-dry"> Chỉ liệt kê (không rời)</label>
        </div>
        <div class="zl-row"><label>Nghỉ giữa các nhóm <input type="number" id="zl-delay" min="1" value="3"> giây</label></div>
        <div class="zl-row"><label>Sau mỗi <input type="number" id="zl-batch" min="0" value="20"> nhóm nghỉ <input type="number" id="zl-rest" min="0" value="60"> giây</label></div>
        <div class="zl-row"><label>Tối đa <input type="number" id="zl-max" min="0" value="0"> nhóm mỗi lần chạy (0 = tất cả)</label></div>
        <div class="zl-log"></div>
      </div>`;
    document.body.append(panel);
    logBox = panel.querySelector(".zl-log");

    panel.querySelector("[data-close]").onclick = () => panel.classList.add("zl-hidden");
    makeDraggable(panel, panel.querySelector("header"));
    panel.querySelector('[data-act="start"]').onclick = autoLeave;
    panel.querySelector('[data-act="current"]').onclick = leaveOpened;
    panel.querySelector('[data-act="stop"]').onclick = () => { stopRequested = true; log("Đang dừng sau bước hiện tại…"); };
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle-panel" && panel) panel.classList.toggle("zl-hidden");
  });

  buildPanel();
})();
