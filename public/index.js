"use strict";

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

// ===== api =====
async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const authMessages = {
      AUTH_USERNAME_INVALID: "ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลขหรือ _ ความยาว 3–30 ตัว",
      AUTH_EMAIL_INVALID: "รูปแบบอีเมลไม่ถูกต้อง",
      AUTH_DISPLAY_NAME_INVALID: "กรอกชื่อที่แสดงไม่เกิน 50 ตัวอักษร",
      AUTH_PASSWORD_INVALID: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวและมีทั้งตัวอักษรกับตัวเลข",
      AUTH_BIRTH_YEAR_INVALID: "ปีเกิดไม่ถูกต้อง ผู้ใช้ต้องมีอายุอย่างน้อย 13 ปี",
      AUTH_ALREADY_EXISTS: "ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้แล้ว",
      MEMBER_HAS_PENDING_ITEMS: "ยังออกหรือนำสมาชิกออกไม่ได้ โปรดจัดการงาน ของที่ยืม หรือกิจกรรมท้าทายประจำสัปดาห์ที่ค้างอยู่ก่อน แล้วลองใหม่",
      OWNER_CANNOT_LEAVE: "เจ้าของก๊วนไม่สามารถออกจากก๊วนได้",
      MEMBER_CONSENT_REQUIRED: "สมาชิกคนนี้ยังไม่ยอมรับกติกา ต้องให้สมาชิกยอมรับกติกาก่อนจึงอนุมัติได้",
      RESOURCE_NAME_INVALID: "กรุณากรอกชื่อห้องไม่เกิน 80 ตัวอักษร",
      BOOKING_TIME_INVALID: "กรุณาระบุวันเวลาเริ่มและสิ้นสุด โดยเวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม",
      BOOKING_DURATION_INVALID: "ระยะเวลาจองไม่ตรงตามกติกาของห้อง สำหรับห้องใหม่ต้องจอง 30–240 นาที และเป็นช่วงละ 30 นาที",
      BOOKING_OVERLAP: "ห้องนี้มีการจองในช่วงเวลาที่เลือกแล้ว กรุณาเปลี่ยนเวลาหรือชื่อห้อง",
      BOOKING_LIMIT_EXCEEDED: "คุณมีรายการจองห้องนี้ครบจำนวนที่อนุญาตแล้ว",
      ROOM_NOT_AVAILABLE: "ห้องนี้ไม่เปิดให้จอง กรุณาเลือกชื่อห้องอื่น",
      WALL_POST_INVALID: "กรุณาเลือกสมาชิกคนอื่น พร้อมระบุหมวดหมู่และรายละเอียดให้ครบ",
      WALL_TARGET_INVALID: "สมาชิกที่เลือกไม่อยู่ในก๊วนหรือไม่ได้ใช้งานแล้ว กรุณาโหลดข้อมูลสมาชิกใหม่",
      DARE_INVALID: "กรุณากรอกชื่อกิจกรรม ข้อตกลง และเกณฑ์วัดผลให้ครบ",
      VOUCH_INVALID: "กรุณาตรวจสอบเพื่อน งานอ้างอิง และคะแนนค้ำประกัน",
      ALIBI_INVALID: "กรุณาตรวจสอบงาน เหตุผล และกำหนดส่งใหม่ซึ่งต้องหลังกำหนดเดิม"
    };
    const error = new Error(authMessages[data.error?.code] || data.error?.message || "ดำเนินการไม่สำเร็จ โปรดลองใหม่");
    error.code = data.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

// ===== auth =====
function selectAuthTab(name, updateHash = true) {
  document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    const selected = tab.dataset.authTab === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelector("#login-panel").hidden = name !== "login";
  document.querySelector("#register-panel").hidden = name !== "register";
  document.querySelector("#auth-title").textContent = name === "login" ? "กลับเข้าสู่ Zero Trust" : "สร้างบัญชี Zero Trust";
  if (updateHash && location.hash !== `#/${name}`) location.hash = `#/${name}`;
}
function setBusy(form, busy) {
  const button = form.querySelector("button[type=submit]");
  if (!button) return;
  if (busy) {
    button.dataset.idleHtml = button.innerHTML;
    button.replaceChildren(icon("circle-notch", "fa-spin"), node("span", "กำลังดำเนินการ…"));
  } else if (button.dataset.idleHtml) {
    button.innerHTML = button.dataset.idleHtml;
    delete button.dataset.idleHtml;
  }
  button.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
}
function showStatus(name, message, isError = true) {
  const status = document.querySelector(`[data-form-status="${name}"]`);
  status.textContent = message;
  status.dataset.error = String(isError);
  status.dataset.tone = !message ? "" : isError ? "error" : "success";
}
async function submitLogin(form) {
  setBusy(form, true);
  showStatus("login", "");
  try {
    const formData = new FormData(form);
    await apiRequest("/api/v1/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: formData.get("login"), password: formData.get("password") })
    });
    showStatus("login", "เข้าสู่ระบบสำเร็จ", false);
    toast("เข้าสู่ระบบสำเร็จ");
    const pendingInvite = sessionStorage.getItem("pendingInviteToken");
    if (pendingInvite) {
      sessionStorage.removeItem("pendingInviteToken");
      location.hash = `#/join/${pendingInvite}`;
    } else location.hash = "#/dashboard";
  } catch (error) { showStatus("login", error.message); }
  finally { setBusy(form, false); }
}
async function submitRegister(form) {
  setBusy(form, true);
  showStatus("register", "");
  try {
    const formData = new FormData(form);
    const data = await apiRequest("/api/v1/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"), email: formData.get("email"),
        display_name: formData.get("display_name"),
        birth_year: (() => { const year = Number(formData.get("birth_year")); return year >= 2400 ? year - 543 : year; })(),
        password: formData.get("password")
      })
    });
    showStatus("register", "สมัครสำเร็จ กำลังเข้าสู่ระบบ…", false);
    toast("สมัครสำเร็จ กำลังเข้าสู่ระบบ");
    const pendingInvite = sessionStorage.getItem("pendingInviteToken");
    if (pendingInvite) {
      sessionStorage.removeItem("pendingInviteToken");
      location.hash = `#/join/${pendingInvite}`;
    } else location.hash = "#/dashboard";
  } catch (error) { showStatus("register", error.message); }
  finally { setBusy(form, false); }
}
const workspace = { id: null, member: null, squad: null, members: [], tasks: [], membersReady: false, tasksReady: false, editing: null, view: "list", epoch: 0 };
const roleLabels = { owner: "เจ้าของ", admin: "ผู้ดูแล", member: "สมาชิก" };
const statusLabels = { active: "ใช้งานอยู่", pending: "รอเข้าร่วม", left: "ออกแล้ว", removed: "ถูกนำออก" };
let routeVersion = 0;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function icon(name, extra = "") {
  const element = document.createElement("i");
  element.className = `fa-solid fa-${name}${extra ? ` ${extra}` : ""}`;
  element.setAttribute("aria-hidden", "true");
  return element;
}
function initial(text) {
  return ([...String(text || "").trim()].find((char) => !"เแโใไ".includes(char)) || "?").toUpperCase();
}
function badge(text, iconName, kind, value) {
  const element = node("span", null, `badge ${kind}`);
  if (value != null) element.dataset.value = String(value);
  if (iconName) element.append(icon(iconName));
  element.append(node("span", text));
  return element;
}
function spinner(text) {
  const wrap = node("div", null, "loading");
  wrap.setAttribute("role", "status");
  wrap.append(icon("circle-notch", "fa-spin"), node("span", text));
  return wrap;
}
function emptyState(iconName, title, hint) {
  const wrap = node("div", null, "empty");
  const tile = node("span", null, "tile");
  tile.append(icon(iconName));
  wrap.append(tile, node("strong", title));
  if (hint) wrap.append(node("p", hint));
  return wrap;
}
function metaItem(iconName, text, className = "") {
  const element = node("span", null, `meta-item ${className}`.trim());
  element.append(icon(iconName), node("span", text));
  return element;
}
function action(label, handler, className = "secondary-button", iconName) {
  const button = node("button", null, className);
  button.type = "button";
  if (iconName) button.append(icon(iconName));
  button.append(node("span", label));
  button.addEventListener("click", handler);
  return button;
}
let modalResolve = null;
function ensureCustomUI() {
  if (!document.querySelector("#toast-region")) {
    const region = node("div", null, "toast-region");
    region.id = "toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "false");
    document.body.append(region);
  }
  if (!document.querySelector("#custom-confirm")) {
    const overlay = node("div", null, "custom-modal-backdrop");
    overlay.id = "custom-confirm";
    overlay.hidden = true;
    overlay.innerHTML = '<section class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="custom-confirm-title"><span class="custom-modal-icon" aria-hidden="true"><i class="fa-solid fa-circle-question"></i></span><div><h2 id="custom-confirm-title">ยืนยันการทำรายการ</h2><p id="custom-confirm-message"></p></div><div class="custom-modal-actions"><button type="button" class="secondary-button" data-confirm="cancel">ยกเลิก</button><button type="button" class="primary-button" data-confirm="accept">ยืนยัน</button></div></section>';
    document.body.append(overlay);
  }
  document.querySelectorAll("select:not([data-custom-select-ready])").forEach((select) => {
    select.dataset.customSelectReady = "true";
    select.setAttribute("aria-hidden", "true");
    const wrap = node("div", null, "custom-select");
    select.parentNode.insertBefore(wrap, select);
    wrap.append(select);
    const trigger = node("button", null, "custom-select-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", `custom-options-${crypto.randomUUID()}`);
    const value = node("span", null, "custom-select-value");
    trigger.append(value, icon("chevron-down"));
    const menu = node("div", null, "custom-select-menu");
    menu.id = trigger.getAttribute("aria-controls");
    menu.setAttribute("role", "listbox");
    const sync = () => {
      const option = select.options[select.selectedIndex];
      value.textContent = option ? option.textContent : "เลือกตัวเลือก";
      menu.querySelectorAll('[role="option"]').forEach((item) => item.setAttribute("aria-selected", String(item.dataset.value === select.value)));
    };
    const refreshOptions = () => {
      menu.replaceChildren();
      for (const option of [...select.options]) {
        const item = node("button", option.textContent, "custom-select-option");
        item.type = "button";
        item.dataset.value = option.value;
        item.setAttribute("role", "option");
        item.addEventListener("click", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
          wrap.classList.remove("open");
          trigger.setAttribute("aria-expanded", "false");
          trigger.focus();
        });
        menu.append(item);
      }
      sync();
    };
    select._refreshCustomOptions = refreshOptions;
    refreshOptions();
    trigger.addEventListener("click", () => {
      const open = !wrap.classList.contains("open");
      document.querySelectorAll(".custom-select.open").forEach((other) => { other.classList.remove("open"); other.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false"); });
      wrap.classList.toggle("open", open);
      trigger.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector('[aria-selected="true"]')?.focus();
    });
    select.addEventListener("change", sync);
    wrap.append(trigger, menu);
    sync();
  });
}
function customConfirm(message, title = "ยืนยันการทำรายการ") {
  ensureCustomUI();
  const modal = document.querySelector("#custom-confirm");
  document.querySelector("#custom-confirm-title").textContent = title;
  document.querySelector("#custom-confirm-message").textContent = message;
  modal.hidden = false;
  const cancel = modal.querySelector('[data-confirm="cancel"]');
  cancel.focus();
  return new Promise((resolve) => { modalResolve = resolve; });
}
function closeCustomConfirm(result) {
  const modal = document.querySelector("#custom-confirm");
  modal.hidden = true;
  const resolve = modalResolve;
  modalResolve = null;
  if (resolve) resolve(result);
}
function toast(message, tone = "success") {
  ensureCustomUI();
  const item = node("div", null, `toast toast-${tone}`);
  item.setAttribute("role", tone === "error" ? "alert" : "status");
  const iconName = tone === "error" ? "circle-exclamation" : tone === "warning" ? "triangle-exclamation" : "circle-check";
  item.append(icon(iconName), node("span", message));
  document.querySelector("#toast-region").append(item);
  requestAnimationFrame(() => item.classList.add("visible"));
  if (tone !== "error") setTimeout(() => { item.classList.remove("visible"); setTimeout(() => item.remove(), 180); }, 4200);
}
let wallAlertVersion = 0;
function clearWallAlerts() {
  document.querySelector("#wall-alert-bar").hidden = true;
  document.querySelector("#wall-spotlight").hidden = true;
  document.querySelector("#wall-spotlight-list").replaceChildren();
  document.querySelector("#wall-alert-summary").textContent = "";
  document.querySelector("#wall-alert-link").href = "#/dashboard";
}
async function refreshWallAlerts() {
  const version = ++wallAlertVersion;
  clearWallAlerts();
  try {
    const { posts = [] } = await apiRequest("/api/v1/wall-alerts");
    if (version !== wallAlertVersion || !posts.length) return;
    const first = posts[0];
    const headline = `${first.target_name} · ${first.category}`;
    document.querySelector("#wall-alert-summary").textContent = `มีรายงานแฉที่รอตรวจสอบ${posts.length === 20 ? "อย่างน้อย " : " "}${posts.length} รายการ — ${headline}`;
    document.querySelector("#wall-alert-link").href = `#/squad/${first.squad_id}`;
    document.querySelector("#wall-alert-bar").hidden = false;
    document.querySelector("#wall-spotlight-count").textContent = `${posts.length === 20 ? "ล่าสุด " : ""}${posts.length} รายงานรอตรวจสอบ`;
    const list = document.querySelector("#wall-spotlight-list");
    for (const post of posts) {
      const item = node("article", null, "wall-report");
      item.append(node("p", `${post.squad_name} · ${formatDate(post.created_at)}`, "wall-report-meta"));
      item.append(node("h3", `${post.target_name} · ${post.category}`));
      item.append(node("p", post.content, "wall-report-content"));
      const link = node("a", "ดูในก๊วน", "wall-report-link");
      link.href = `#/squad/${post.squad_id}`;
      item.append(link);
      list.append(item);
    }
    const homeVisible = ["home", "dashboard"].some((page) => !document.querySelector(`[data-page="${page}"]`).hidden);
    document.querySelector("#wall-spotlight").hidden = !homeVisible;
  } catch { if (version === wallAlertVersion) clearWallAlerts(); }
}
function showPage(page) {
  const spotlight = document.querySelector("#wall-spotlight");
  spotlight.hidden = true;
  if (["home", "dashboard"].includes(page)) document.querySelector(`[data-page="${page}"]`).prepend(spotlight);
  const invitePanel = document.querySelector("#squad-invite-panel");
  const inWorkspace = page === "workspace";
  const inviteHost = document.querySelector(inWorkspace ? '[data-page="workspace"]' : '.dashboard-grid');
  if (inWorkspace) document.querySelector("#workspace-status").after(invitePanel);
  else inviteHost.append(invitePanel);
  invitePanel.hidden = inWorkspace;
  document.querySelector("#invite-squad-id").disabled = inWorkspace;
  document.querySelector("#invite-result").hidden = true;
  document.querySelector("#generated-invite-token").value = "";
  document.querySelector("#workspace-invite").setAttribute("aria-expanded", "false");
  document.querySelectorAll("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== page; });
  document.querySelector(".brand").href = page === "dashboard" || page === "workspace" ? "#/dashboard" : "#/home";
  if (page === "auth") runHero();
}
function message(id, text, error = false) {
  const element = document.getElementById(id);
  element.textContent = text;
  element.dataset.error = String(error);
}
function jsonOptions(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function squadPath(id = workspace.id) { return `/api/v1/squads/${encodeURIComponent(id)}`; }
function isAdmin() { return ["owner", "admin"].includes(workspace.member?.role); }
function activeConsent() { return workspace.member?.status === "active" && Boolean(workspace.member?.rules_accepted_at); }
async function loadPublicSquads() {
  const list = document.querySelector("#public-squad-list");
  const query = document.querySelector("#public-squad-search")?.value.trim() || "";
  if (!list) return;
  list.replaceChildren(spinner("กำลังค้นหา Public squad…"));
  try {
    const data = await apiRequest(`/api/v1/squads/public?q=${encodeURIComponent(query)}`);
    list.replaceChildren();
    for (const squad of data.squads || []) {
      const item = node("article", null, "squad-item public-squad-item");
      item.append(node("h3", squad.name), node("p", squad.description || "ไม่มีรายละเอียด", "muted"));
      if (!squad.joined) {
        item.append(action("ขอเข้าร่วม", async (event) => {
          await mutate(event.currentTarget, "public-squad-status", `/api/v1/squads/${squad.id}/join-public`, "POST", {}, async () => { await Promise.all([loadSquads(), loadPublicSquads()]); });
        }, "primary-button", "user-plus"));
      } else item.append(badge("ส่งคำขอหรือเป็นสมาชิกแล้ว", "circle-check", "state", "joined"));
      list.append(item);
    }
    if (!list.childElementCount) list.append(emptyState("magnifying-glass", "ไม่พบก๊วน Public", "ลองค้นหาด้วยชื่ออื่น"));
  } catch (error) { list.replaceChildren(emptyState("triangle-exclamation", "ค้นหาก๊วนไม่สำเร็จ", error.message)); }
}
async function loadSquads() {
  const version = routeVersion;
  const list = document.querySelector("#squad-list");
  list.replaceChildren(spinner("กำลังโหลดก๊วน…"));
  list.setAttribute("aria-busy", "true");
  try {
    const data = await apiRequest("/api/v1/squads");
    if (version !== routeVersion) return;
    const inviteSelect = document.querySelector("#invite-squad-id");
    const switcher = document.querySelector("#squad-switcher");
    inviteSelect.replaceChildren();
    switcher.replaceChildren();
    list.replaceChildren();
    const roleIcons = { owner: "crown", admin: "user-shield", member: "user" };
    const stateIcons = { active: "circle-check", pending: "hourglass-half", left: "door-open", removed: "user-slash" };
    for (const squad of data.squads || []) {
      const item = node("article", null, "squad-item");
      const top = node("div", null, "squad-top");
      top.append(node("span", initial(squad.name), "avatar"), icon("arrow-right", "go"));
      const link = node("a", squad.name);
      link.href = `#/squad/${encodeURIComponent(squad.id)}`;
      const title = node("h3");
      title.append(link);
      const meta = node("div", null, "badge-row");
      meta.append(
        badge(roleLabels[squad.role] || squad.role, roleIcons[squad.role] || "user", "role", squad.role),
        badge(statusLabels[squad.status] || squad.status, stateIcons[squad.status] || "circle", "state", squad.status),
        badge(squad.rules_accepted_at ? "ยอมรับกติกาแล้ว" : "ต้องยอมรับกติกา", squad.rules_accepted_at ? "scroll" : "triangle-exclamation", "rules", squad.rules_accepted_at ? "accepted" : "required")
      );
      item.append(top, title, meta);
      list.append(item);
      const option = node("option", squad.name);
      option.value = String(squad.id);
      switcher.append(option);
      if (["owner", "admin"].includes(squad.role) && squad.status === "active" && squad.rules_accepted_at) inviteSelect.append(option.cloneNode(true));
    }
    if (!list.childElementCount) {
      const empty = emptyState("users", "ยังไม่มีก๊วน", "สร้างก๊วนแรกหรือใช้คำเชิญเพื่อเริ่มทำงานร่วมกัน");
      empty.append(action("สร้างก๊วนแรก", () => document.querySelector("#squad-name").focus(), "secondary-button", "plus"));
      list.append(empty);
    }
    if (!inviteSelect.options.length) {
      const option = node("option", "ยังไม่มีก๊วนที่สร้างคำเชิญได้");
      option.value = "";
      inviteSelect.append(option);
    }
    switcher.value = String(workspace.id);
  } catch (error) {
    if (version !== routeVersion) return;
    const failed = emptyState("triangle-exclamation", "โหลดก๊วนไม่สำเร็จ", error.message);
    failed.append(action("โหลดก๊วนอีกครั้ง", loadSquads, "secondary-button", "rotate-right"));
    list.replaceChildren(failed);
  } finally { if (version === routeVersion) list.setAttribute("aria-busy", "false"); }
}
function socialPath(type) {
  return { wall: "wall", dare: "dares", vouch: "vouches", alibi: "alibis" }[type];
}
function closeSocialForm() {
  const form = document.querySelector("#social-form");
  form.hidden = true;
  form.reset();
  document.querySelector("#social-create").setAttribute("aria-expanded", "false");
}
function openSocialForm() {
  if (!activeConsent()) return;
  const form = document.querySelector("#social-form");
  if (!form.hidden) { document.querySelector("#social-form-title").focus(); return; }
  const type = document.querySelector('[data-social-tab][aria-selected="true"]')?.dataset.socialTab || "wall";
  const fields = document.querySelector("#social-fields");
  fields.replaceChildren();
  message("social-form-status", "");
  message("social-status", "");
  const addField = (name, label, options) => {
    const field = node("div", null, "field");
    const control = node(options ? "select" : ["content", "punishment", "reason_text"].includes(name) ? "textarea" : "input");
    control.id = `social-${name}`;
    control.name = name;
    control.required = true;
    const caption = node("label", label);
    caption.htmlFor = control.id;
    if (options) for (const [value, text] of options) {
      const option = node("option", text);
      option.value = String(value);
      control.append(option);
    }
    field.append(caption, control);
    fields.append(field);
    return control;
  };
  const members = workspace.members.filter(member => member.status === "active" && Number(member.user_id) !== Number(workspace.member.user_id));
  const tasks = workspace.tasks.filter(task => openTask(task) && (type !== "alibi" || (task.allow_alibi && task.assignees?.some(person => Number(person.user_id) === Number(workspace.member.user_id) && !person.submitted_at))));
  const taskOptions = tasks.map(task => [task.id, task.title]);
  const labels = { wall: "สร้างข้อความบนกระดานก๊วน", dare: "เสนอท้าทายประจำสัปดาห์", vouch: "ค้ำประกันเพื่อน", alibi: "ขอแก้ตัวและเลื่อนกำหนด" };
  document.querySelector("#social-form-title").textContent = labels[type];
  document.querySelector("#social-form-hint").textContent = type === "vouch" || type === "alibi" ? "ฟอร์มนี้รองรับการอ้างอิงงานที่ยังไม่เสร็จในก๊วนนี้" : type === "dare" ? "ข้อเสนอจะถูกส่งเข้าสถานะรอพิจารณา ไม่ได้เริ่มกิจกรรมทันที" : "เลือกสมาชิกและระบุรายละเอียดที่ตรวจสอบได้";
  if ((type === "wall" || type === "vouch") && (!workspace.membersReady || !members.length)) {
    message("social-status", "ต้องมีสมาชิกคนอื่นที่ใช้งานอยู่ในก๊วน และโหลดข้อมูลสมาชิกสำเร็จก่อนสร้างรายการนี้", true);
    return;
  }
  if ((type === "vouch" || type === "alibi") && (!workspace.tasksReady || !tasks.length)) {
    message("social-status", "ยังไม่มีงานที่เปิดอยู่ให้ใช้อ้างอิง กรุณาสร้างงานหรือโหลดข้อมูลงานให้สำเร็จก่อน", true);
    return;
  }
  if (type === "wall") {
    addField("kind", "ประเภทข้อความ", [["kudos", "ชื่นชม"], ["snitch", "แฉ"]]);
    addField("target_user_id", "สมาชิกที่เกี่ยวข้อง", members.map(member => [member.user_id, member.display_name || member.username]));
    addField("category", "หมวดหมู่").maxLength = 30;
    addField("content", "รายละเอียด").maxLength = 500;
  } else if (type === "dare") {
    addField("title", "ชื่อกิจกรรม").maxLength = 100;
    addField("punishment", "ข้อตกลงเมื่อไม่ทำตามกิจกรรม").maxLength = 300;
    addField("metric", "เกณฑ์วัดผล", [["most_late_tasks", "จำนวนงานส่งช้า"], ["most_late_days", "จำนวนวันที่ส่งช้า"], ["lowest_trust_delta", "คะแนนความไว้ใจลดลง"], ["most_auto_snitch", "จำนวนแจ้งปัญหาอัตโนมัติ"], ["most_no_show", "จำนวนครั้งไม่มาตามนัด"]]);
  } else {
    addField("ref_id", "งานที่เกี่ยวข้อง", taskOptions);
    if (type === "vouch") {
      addField("vouchee_id", "เพื่อนที่ค้ำประกัน", members.map(member => [member.user_id, member.display_name || member.username]));
      addField("stake", "คะแนนที่ใช้ค้ำประกัน", [[3, "3 คะแนน"], [5, "5 คะแนน"], [10, "10 คะแนน"]]);
    } else {
      addField("reason_category", "ประเภทเหตุผล", [["sick", "เจ็บป่วย"], ["family", "เรื่องครอบครัว"], ["schedule_conflict", "ตารางเวลาชนกัน"], ["force_majeure", "เหตุสุดวิสัย"], ["other", "อื่น ๆ"]]);
      addField("reason_text", "เหตุผลและรายละเอียด").maxLength = 300;
      addField("requested_due_at", "กำหนดส่งใหม่").type = "datetime-local";
    }
  }
  form.dataset.type = type;
  form.hidden = false;
  document.querySelector("#social-create").setAttribute("aria-expanded", "true");
  ensureCustomUI();
  fields.querySelectorAll("select").forEach(select => {
    const label = fields.querySelector(`label[for='${select.id}']`);
    select.parentElement.querySelector(".custom-select-trigger")?.setAttribute("aria-label", label.textContent);
  });
  document.querySelector("#social-form-title").focus();
}
async function submitSocialForm(form) {
  const submit = form.querySelector("button[type='submit']");
  if (submit.disabled) return;
  message("social-form-status", "");
  if (!activeConsent()) {
    message("social-form-status", "สิทธิ์สมาชิกยังไม่พร้อม กรุณารีเฟรชข้อมูลก๊วนและยอมรับกฎก่อนบันทึก", true);
    return;
  }
  for (const control of form.querySelectorAll("input, select, textarea")) {
    control.removeAttribute("aria-invalid");
    if (!control.checkValidity() || (control.required && !control.value.trim())) {
      const label = document.querySelector(`label[for='${control.id}']`)?.textContent || "ข้อมูล";
      message("social-form-status", `กรุณากรอกหรือเลือก ${label} ให้ครบและถูกต้อง`, true);
      control.setAttribute("aria-invalid", "true");
      const focusTarget = control.matches("select") ? control.parentElement.querySelector(".custom-select-trigger") || control : control;
      focusTarget.focus();
      return;
    }
  }
  const type = form.dataset.type;
  if (!socialPath(type)) {
    message("social-form-status", "ไม่พบประเภทกิจกรรม กรุณาปิดฟอร์มแล้วกดสร้างรายการอีกครั้ง", true);
    return;
  }
  const body = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(body)) body[key] = String(body[key]).trim();
  if (Object.values(body).some(value => !value)) { message("social-form-status", "กรุณากรอกข้อมูลให้ครบ ไม่ใช้เพียงช่องว่าง", true); return; }
  for (const key of ["target_user_id", "vouchee_id", "ref_id", "stake"]) if (key in body) body[key] = Number(body[key]);
  if (type === "dare") body.period = "weekly";
  if (type === "vouch" || type === "alibi") body.ref_type = "task";
  if (type === "vouch") {
    const task = workspace.tasks.find(task => Number(task.id) === body.ref_id);
    if (!task?.assignees?.some(person => Number(person.user_id) === body.vouchee_id && !person.submitted_at)) {
      message("social-form-status", "เพื่อนที่เลือกต้องเป็นผู้รับผิดชอบงานนี้และยังไม่ได้ส่งงาน", true);
      return;
    }
  }
  if (type === "alibi") {
    const task = workspace.tasks.find(task => Number(task.id) === body.ref_id);
    const assignment = task?.assignees?.find(person => Number(person.user_id) === Number(workspace.member.user_id));
    const original = new Date(assignment?.due_override_at || task?.due_at);
    const requested = new Date(body.requested_due_at);
    if (!Number.isFinite(original.getTime()) || !Number.isFinite(requested.getTime()) || requested <= original) {
      message("social-form-status", "กำหนดส่งใหม่ต้องอยู่หลังกำหนดส่งปัจจุบันของงาน", true);
      return;
    }
    body.original_due_at = original.toISOString();
    body.requested_due_at = requested.toISOString();
  }
  await mutate(form.querySelector("button[type='submit']"), "social-form-status", `${squadPath()}/${socialPath(type)}`, "POST", body, async () => {
    closeSocialForm();
    message("social-status", "บันทึกรายการสำเร็จ");
    toast("บันทึกรายการสำเร็จ", "success");
    await loadSocial(type);
    document.querySelector("#social-status").scrollIntoView({ block: "nearest" });
    document.querySelector("#social-create").focus();
  });
}
async function loadSocial(type = "wall") {
  const list = document.querySelector("#social-list");
  if (!workspace.id || !list) return;
  const epoch = workspace.epoch;
  list.replaceChildren(spinner("กำลังโหลดกิจกรรม…"));
  try {
    const path = type === "dare" ? "dares" : type === "vouch" ? "vouches" : type === "alibi" ? "alibis" : "wall";
    const data = await apiRequest(`${squadPath()}/${path}`);
    if (epoch !== workspace.epoch || type !== document.querySelector('[data-social-tab][aria-selected="true"]')?.dataset.socialTab) return;
    const rows = data[type === "wall" ? "posts" : path] || [];
    if (type === "wall") void refreshWallAlerts();
    list.replaceChildren();
    if (!rows.length) list.append(emptyState("comments", "ยังไม่มีรายการ", "กดสร้างรายการเพื่อเริ่มกิจกรรมใหม่"));
    const labels = { wall: "กระดานก๊วน", dare: "ท้าทายประจำสัปดาห์", vouch: "ค้ำประกันเพื่อน", alibi: "ขอแก้ตัวและเลื่อนกำหนด" };
    for (const row of rows) {
      const item = node("article", null, "social-item");
      item.append(node("h3", row.title || row.content || row.reason_text || `${labels[type] || "กิจกรรม"} #${row.id}`));
      item.append(node("p", row.punishment || row.reason_category || row.status || "", "muted"));
      list.append(item);
    }
  } catch (error) {
    if (epoch !== workspace.epoch || type !== document.querySelector('[data-social-tab][aria-selected="true"]')?.dataset.socialTab) return;
    message("social-status", error.message, true);
    list.replaceChildren();
  }
}
let soundContext;
let soundEnabled = true;
let lastSoundAt = -Infinity;
async function playSystemSound() {
  if (!soundEnabled || document.hidden) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    const now = performance.now();
    if (now - lastSoundAt < 45) return;
    lastSoundAt = now;
    soundContext ||= new AudioContext();
    if (soundContext.state === "suspended") await soundContext.resume();
    if (soundContext.state !== "running" || !soundEnabled || document.hidden) return;
    const oscillator = soundContext.createOscillator();
    const gain = soundContext.createGain();
    const start = soundContext.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(720, start);
    oscillator.frequency.exponentialRampToValueAtTime(440, start + 0.055);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.045, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.055);
    gain.gain.linearRampToValueAtTime(0, start + 0.065);
    oscillator.connect(gain).connect(soundContext.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + 0.07);
  } catch {
    // Audio restrictions must not prevent the requested button action.
  }
}
function initButtonSounds() {
  const toggle = document.querySelector("#sfx-toggle");
  try { soundEnabled = localStorage.getItem("zeroTrustSfx") !== "false"; } catch { /* Keep the default when storage is unavailable. */ }
  const updateToggle = () => {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", String(soundEnabled));
    toggle.setAttribute("aria-label", soundEnabled ? "ปิดเสียงระบบ" : "เปิดเสียงระบบ");
    toggle.title = soundEnabled ? "ปิดเสียงระบบ" : "เปิดเสียงระบบ";
    toggle.innerHTML = `<i class="fa-solid ${soundEnabled ? "fa-volume-high" : "fa-volume-xmark"}" aria-hidden="true"></i>`;
  };
  updateToggle();
  toggle?.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    updateToggle();
    try { localStorage.setItem("zeroTrustSfx", String(soundEnabled)); } catch { /* The current session still retains the preference. */ }
    if (soundEnabled) void playSystemSound();
  });
  // Capture before an action disables or removes its button; also covers dynamic controls and keyboard clicks.
  document.addEventListener("click", (event) => {
    const control = event.target instanceof Element ? event.target.closest("button, a[href], [role='button'], [role='tab'], [role='option'], input[type='submit'], input[type='button']") : null;
    if (!control || control === toggle || control.closest("[inert], [aria-disabled='true']") || control.matches(":disabled")) return;
    void playSystemSound();
  }, { capture: true });
}
async function loadNotifications() {
  try {
    const data = await apiRequest("/api/v1/notifications?limit=30");
    const list = data.notifications || [];
    const unread = list.filter((item) => !item.is_read).length;
    const count = document.querySelector("#notification-count");
    count.hidden = unread === 0;
    count.textContent = String(unread);
    if (list.length) toast(list[0].title || "มีการแจ้งเตือนใหม่", "warning");
    else toast("ไม่มีการแจ้งเตือนใหม่", "success");
  } catch (error) { toast(error.message, "error"); }
}
async function routeApp() {
  void refreshWallAlerts();
  const version = ++routeVersion;
  ++workspace.epoch;
  const hash = location.hash;
  const hashParts = hash.startsWith("#/") ? hash.slice(2).split("#") : [];
  const route = hashParts.length ? hashParts[0] || "home" : hash.replace(/^#/, "") || "home";
  const sectionId = hashParts.length > 1 ? hashParts.slice(1).join("#") || null : null;
  workspace.id = null;
  workspace.member = null;
  document.querySelector("#task-editor").hidden = true;
  document.querySelector("#workspace-content").hidden = true;
  document.querySelector("#rules-panel").hidden = true;
  document.querySelector("#membership-gate").hidden = true;
  if (route.startsWith("join/")) {
    showPage("invite");
    message("invite-route-status", "กำลังตรวจสอบคำเชิญ…");
    document.querySelector("#retry-invite").disabled = true;
    const token = route.slice(5);
    try {
      await apiRequest(`/api/v1/squads/join/${encodeURIComponent(token)}`, { method: "POST" });
      if (version !== routeVersion) return;
      sessionStorage.removeItem("pendingInviteToken");
      location.hash = "#/dashboard";
    } catch (error) {
      if (version !== routeVersion) return;
      if (error.status === 401) {
        sessionStorage.setItem("pendingInviteToken", token);
        location.hash = "#/login";
      } else {
        sessionStorage.removeItem("pendingInviteToken");
        message("invite-route-status", `${error.message} ตรวจสอบว่าลิงก์ยังไม่หมดอายุและมีสิทธิ์เข้าร่วม หรือขอลิงก์ใหม่จากผู้ดูแล`, true);
      }
    } finally { if (version === routeVersion) document.querySelector("#retry-invite").disabled = false; }
    return;
  }
  const squadMatch = /^squad\/(\d+)$/.exec(route);
  const profileMatch = /^profile\/(\d+|me)$/.exec(route);
  if (profileMatch) {
    showPage("profile");
    const summary = document.querySelector("#profile-summary");
    const details = document.querySelector("#profile-details");
    details.hidden = true;
    summary.replaceChildren(spinner("กำลังโหลดโปรไฟล์…"));
    summary.setAttribute("aria-busy", "true");
    message("profile-status", "");
    for (const id of ["profile-squads", "profile-badges", "profile-history"]) document.getElementById(id).replaceChildren();
    try {
      let userId = profileMatch[1];
      if (userId === "me") {
        const { user } = await apiRequest("/api/v1/auth/me");
        if (version !== routeVersion) return;
        userId = user.id;
      }
      const { profile } = await apiRequest(`/api/v1/users/${userId}/profile`);
      if (version !== routeVersion) return;
      const name = profile.display_name || profile.username;
      const identity = node("div", null, "profile-identity-copy");
      identity.append(node("h2", name), node("p", `@${profile.username}`, "muted"));
      if (profile.is_self) identity.append(node("span", "โปรไฟล์ของคุณ", "badge"));
      identity.append(node("p", profile.bio || "ยังไม่ได้เพิ่มข้อความแนะนำตัว", "profile-bio"));
      const avatar = node("span", initial(name), "avatar profile-avatar");
      avatar.setAttribute("aria-hidden", "true");
      summary.replaceChildren(avatar, identity);
      const memberships = profile.memberships || [];
      const squadNames = new Map(memberships.map(member => [String(member.squad_id), member.squad_name]));
      const squads = document.querySelector("#profile-squads");
      for (const member of memberships) {
        const row = node("article", null, "profile-squad-row");
        const info = node("div");
        const link = node("a", member.squad_name, "profile-name-link");
        link.href = `#/squad/${member.squad_id}`;
        info.append(link, node("p", roleLabels[member.role] || member.role, "muted"));
        row.append(info, node("strong", `Trust ${member.trust_score ?? "—"} / 100`, "profile-trust"));
        squads.append(row);
      }
      if (!memberships.length) squads.append(node("p", "ยังไม่มีก๊วนที่เข้าร่วมและยอมรับกฎแล้ว", "muted"));
      const badges = document.querySelector("#profile-badges");
      for (const item of profile.badges || []) {
        const earned = node("span", `${item.badge_key} · ${squadNames.get(String(item.squad_id)) || "ก๊วน"}`, "badge");
        earned.title = `ได้รับเมื่อ ${formatDate(item.awarded_at)}`;
        badges.append(earned);
      }
      if (!badges.childElementCount) badges.append(node("p", "ยังไม่มีเหรียญในก๊วนที่แสดง", "muted"));
      const history = document.querySelector("#profile-history");
      const eventLabels = { TASK_ON_TIME: "ส่งงานตรงเวลา", TASK_LATE: "ส่งงานช้า", SNITCH_GUILTY: "ผลพิจารณารายงาน", VOUCH_SUCCESS: "ค้ำประกันสำเร็จ", VOUCH_FAILED: "ค้ำประกันไม่สำเร็จ" };
      for (const event of profile.events || []) {
        const row = node("article", null, "profile-history-row");
        const text = node("div");
        text.append(node("h3", eventLabels[event.event_type] || event.event_type), node("p", `${squadNames.get(String(event.squad_id)) || "ก๊วน"} · ${formatDate(event.created_at)}`, "muted"));
        const delta = Number(event.delta);
        const score = node("div", null, "profile-event-score");
        score.append(node("strong", `${delta > 0 ? "+" : ""}${delta}`), node("span", `คงเหลือ ${event.score_after}`, "muted"));
        row.append(text, score);
        history.append(row);
      }
      if (!history.childElementCount) history.append(node("p", "ยังไม่มีประวัติความไว้ใจในก๊วนที่แสดง", "muted"));
      details.hidden = false;
    } catch (error) {
      if (version !== routeVersion) return;
      summary.replaceChildren();
      message("profile-status", error.status === 404 ? "ไม่พบผู้ใช้ หรือคุณไม่ได้อยู่ในก๊วนร่วมกับผู้ใช้นี้" : error.message, true);
      if (error.status === 401) location.hash = "#/login";
    } finally { if (version === routeVersion) summary.setAttribute("aria-busy", "false"); }
    return;
  }
  if (route === "dashboard" || squadMatch) {
    showPage(squadMatch ? "workspace" : "dashboard");
    message("workspace-status", "กำลังโหลดพื้นที่ก๊วน…");
    try {
      await apiRequest("/api/v1/auth/me");
      if (version !== routeVersion) return;
      workspace.id = squadMatch ? squadMatch[1] : null;
      await Promise.all([loadSquads(), loadPublicSquads()]);
      if (version !== routeVersion) return;
      if (squadMatch) await loadWorkspace();
    } catch (error) {
      if (version !== routeVersion) return;
      if (error.status === 401) location.hash = "#/login";
      else if (squadMatch) message("workspace-status", `${error.message} กดรีเฟรชข้อมูลเพื่อลองใหม่`, true);
      else { const failed = emptyState("triangle-exclamation", "โหลดข้อมูลไม่สำเร็จ", error.message); failed.append(action("ลองใหม่", routeApp, "secondary-button", "rotate-right")); document.querySelector("#squad-list").replaceChildren(failed); }
    }
    return;
  }
  if (route === "home") {
    showPage("home");
    const scrollHome = () => {
      if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ block: "start", behavior: "auto" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollHome();
      window.setTimeout(scrollHome, 600);
      window.setTimeout(scrollHome, 900);
    }));
    return;
  }
  if (["privacy", "terms"].includes(route)) {
    showPage(route);
    const scrollToSection = () => {
      if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ block: "start", behavior: "auto" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollToSection();
      window.setTimeout(scrollToSection, 120);
    }));
    return;
  }
  if (route === "login" || route === "register") {
    showPage("auth");
    selectAuthTab(route, false);
    return;
  }
  if (!hash.startsWith("#/")) {
    const target = document.getElementById(route);
    if (target) {
      target.scrollIntoView({ block: "start" });
      return;
    }
  }
  location.hash = "#/home";
}
async function createSquad(form) {
  const formData = new FormData(form);
  try {
    await apiRequest("/api/v1/squads", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formData.get("name"), description: formData.get("description"), visibility: formData.get("visibility") }) });
    showStatus("squad-create", "สร้างก๊วนสำเร็จ", false);
    form.reset();
    await loadSquads();
  } catch (error) { showStatus("squad-create", error.message); }
}
async function createInvite(form) {
  const formData = new FormData(form);
  const inWorkspace = !document.querySelector('[data-page="workspace"]').hidden;
  const squadId = inWorkspace ? workspace.id : formData.get("squadId");
  if (inWorkspace && (!isAdmin() || !activeConsent())) return showStatus("squad-invite", "คุณไม่มีสิทธิ์สร้างคำเชิญในก๊วนนี้");
  if (!squadId) return showStatus("squad-invite", "ยังไม่มีก๊วนที่คุณมีสิทธิ์สร้างคำเชิญ");
  try {
    const data = await apiRequest(`/api/v1/squads/${encodeURIComponent(squadId)}/invites`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_uses: Number(formData.get("maxUses") || 1) })
    });
    const link = `${location.origin}/#/join/${data.invite.token}`;
    document.querySelector("#generated-invite-token").value = link;
    document.querySelector("#invite-result").hidden = false;
    showStatus("squad-invite", "สร้างคำเชิญสำเร็จ", false);
  } catch (error) { showStatus("squad-invite", error.message); }
}
async function joinSquad(form) {
  const formData = new FormData(form);
  try {
    await apiRequest(`/api/v1/squads/join/${encodeURIComponent(formData.get("token"))}`, { method: "POST" });
    showStatus("squad-join", "ส่งคำขอเข้าร่วมสำเร็จ", false);
    form.reset();
    await loadSquads();
  } catch (error) { showStatus("squad-join", error.message); }
}
async function submitDashboardForm(form, handler) {
  if (form.getAttribute("aria-busy") === "true" || !form.reportValidity()) return;
  setBusy(form, true);
  try { await handler(form); }
  finally { setBusy(form, false); }
}
function initAuth() {
  const tabs = [...document.querySelectorAll("[data-auth-tab]")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectAuthTab(tab.dataset.authTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length];
      selectAuthTab(target.dataset.authTab);
      target.focus();
    });
  });
  document.querySelector("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.currentTarget.getAttribute("aria-busy") !== "true" && event.currentTarget.reportValidity()) submitLogin(event.currentTarget);
  });
  document.querySelector("#register-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.currentTarget.getAttribute("aria-busy") !== "true" && event.currentTarget.reportValidity()) submitRegister(event.currentTarget);
  });
  for (const [id, handler] of [["squad-create-form", createSquad], ["squad-join-form", joinSquad], ["squad-invite-form", createInvite]]) {
    document.getElementById(id).addEventListener("submit", (event) => { event.preventDefault(); submitDashboardForm(event.currentTarget, handler); });
  }
  document.querySelector("#copy-invite-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const input = document.querySelector("#generated-invite-token");
    try {
      await navigator.clipboard.writeText(input.value);
      button.dataset.idle ||= button.innerHTML;
      button.replaceChildren(icon("check"), node("span", "คัดลอกแล้ว"));
      setTimeout(() => { if (button.dataset.idle) { button.innerHTML = button.dataset.idle; delete button.dataset.idle; } }, 2000);
    }
    catch { input.focus(); input.select(); showStatus("squad-invite", "คัดลอกอัตโนมัติไม่ได้ เลือกข้อความแล้วกด Ctrl+C หรือคัดลอกด้วยตนเอง"); }
  });
  document.querySelector("#logout-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const workspaceButton = document.querySelector("[data-logout]");
    button.disabled = true;
    workspaceButton.disabled = true;
    try {
      await apiRequest("/api/v1/auth/logout", { method: "POST" });
      sessionStorage.removeItem("pendingInviteToken");
      location.hash = "#/login";
    } catch (error) {
      if (error.status === 401) location.hash = "#/login";
      else {
        message("workspace-status", `ออกจากระบบไม่สำเร็จ: ${error.message} โปรดลองอีกครั้ง`, true);
        showStatus("squad-create", `ออกจากระบบไม่สำเร็จ: ${error.message}`);
      }
    } finally { button.disabled = false; workspaceButton.disabled = false; }
  });
  window.addEventListener("hashchange", routeApp);
document.querySelector("#profile-refresh")?.addEventListener("click", routeApp);
document.querySelector("#notification-button")?.addEventListener("click", loadNotifications);
initButtonSounds();
document.querySelector("#social-create")?.setAttribute("aria-controls", "social-form");
document.querySelector("#social-create")?.setAttribute("aria-expanded", "false");
document.querySelector("#social-create")?.addEventListener("click", openSocialForm);
document.querySelector("#social-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const epoch = workspace.epoch;
  try { await submitSocialForm(event.currentTarget); }
  catch {
    if (epoch !== workspace.epoch) return;
    message("social-form-status", "บันทึกไม่สำเร็จ กรุณารีเฟรชรายการเพื่อดูว่าบันทึกแล้วหรือไม่ก่อนลองอีกครั้ง", true);
  }
  if (epoch !== workspace.epoch) return;
  const status = document.querySelector("#social-form-status");
  if (status.dataset.error === "true") {
    status.scrollIntoView({ block: "nearest" });
    toast(status.textContent, "error");
  }
});
document.querySelector("#social-cancel")?.addEventListener("click", () => {
  if (document.querySelector("#social-form button[type='submit']").disabled) return;
  closeSocialForm();
  document.querySelector("#social-create").focus();
});
document.querySelectorAll("[data-social-tab]").forEach((tab) => tab.addEventListener("click", async () => {
  const form = document.querySelector("#social-form");
  if (form.querySelector("button[type='submit']").disabled || tab.getAttribute("aria-selected") === "true") return;
  if (!form.hidden && !await customConfirm("เปลี่ยนหมวดและละทิ้งข้อมูลที่ยังไม่ได้บันทึก?", "เปลี่ยนหมวดกิจกรรม")) return;
  closeSocialForm();
  message("social-status", "");
  document.querySelectorAll("[data-social-tab]").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
  loadSocial(tab.dataset.socialTab);
}));
document.querySelector("#social-refresh")?.addEventListener("click", () => loadSocial(document.querySelector('[data-social-tab][aria-selected="true"]')?.dataset.socialTab || "wall"));
}

// ===== squad workspace =====
document.querySelector("#workspace-invite").addEventListener("click", () => {
  if (!isAdmin() || !activeConsent()) return;
  const panel = document.querySelector("#squad-invite-panel");
  document.querySelector("#invite-squad-id").value = String(workspace.id);
  panel.hidden = !panel.hidden;
  document.querySelector("#workspace-invite").setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) {
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    document.querySelector("#invite-max-uses").focus({ preventScroll: true });
  }
});
async function loadWorkspace() {
  const id = workspace.id;
  if (!id) return;
  const epoch = ++workspace.epoch;
  document.querySelector("#workspace-invite").hidden = true;
  document.querySelector("#workspace-invite").setAttribute("aria-expanded", "false");
  document.querySelector("#squad-invite-panel").hidden = true;
  document.querySelector("#invite-result").hidden = true;
  document.querySelector("#generated-invite-token").value = "";
  workspace.member = null;
  workspace.members = [];
  workspace.tasks = [];
  workspace.membersReady = false;
  workspace.tasksReady = false;
  workspace.editing = null;
  closeSocialForm();
  message("social-status", "");
  document.querySelector("#social-list").replaceChildren();
  message("members-status", "");
  message("tasks-status", "");
  document.querySelector("#workspace-content").hidden = true;
  document.querySelector("#rules-panel").hidden = true;
  document.querySelector("#membership-gate").hidden = true;
  document.querySelector("#task-editor").hidden = true;
  document.querySelector("#new-task").disabled = true;
  document.querySelector("#workspace-title").textContent = "พื้นที่ก๊วน";
  message("workspace-status", "กำลังตรวจสอบสมาชิก…");
  try {
    const data = await apiRequest(`${squadPath(id)}/membership`);
    if (epoch !== workspace.epoch) return;
    workspace.member = data.member;
    workspace.squad = data.squad;
    document.querySelector("#workspace-title").textContent = data.squad.name;
    document.querySelector("#rules-accepted").checked = false;
    const eligible = ["active", "pending"].includes(data.member.status);
    document.querySelector("#rules-panel").hidden = !eligible || Boolean(data.member.rules_accepted_at);
    if (!activeConsent()) {
      document.querySelector("#membership-gate").hidden = false;
      message("membership-gate-text", !eligible ? "สมาชิกนี้ไม่สามารถเข้าถึงก๊วนได้ กลับไปเลือกก๊วนอื่นหรือติดต่อผู้ดูแล" : !data.member.rules_accepted_at ? "ยอมรับกติกาก่อนเข้าถึงงาน สมาชิก และสุขภาพทีม" : "ยอมรับกติกาแล้ว กำลังรอผู้ดูแลอนุมัติ กดรีเฟรชข้อมูลเพื่อตรวจสอบอีกครั้ง");
      message("workspace-status", "");
      return;
    }
    document.querySelector("#workspace-content").hidden = false;
    document.querySelector("#workspace-invite").hidden = !isAdmin();
    document.querySelector("#settings-form").hidden = !isAdmin();
    document.querySelector("#squad-management").hidden = !isAdmin();
    document.querySelector("#join-approval").checked = Boolean(data.squad.require_join_approval);
    document.querySelector("#manage-squad-name").value = data.squad.name || "";
    document.querySelector("#manage-squad-description").value = data.squad.description || "";
    document.querySelector("#manage-squad-visibility").value = data.squad.require_join_approval ? "public" : "private";
    let lifecycle = "active";
    try { lifecycle = typeof data.squad.settings === "string" ? JSON.parse(data.squad.settings)?.lifecycle || "active" : data.squad.settings?.lifecycle || "active"; } catch { lifecycle = "active"; }
    document.querySelector("#reopen-squad").hidden = lifecycle === "active";
    document.querySelector("#close-squad").hidden = lifecycle !== "active";
    document.querySelector("#leave-squad").hidden = data.member.role === "owner";
    document.querySelector("#owner-note").hidden = data.member.role !== "owner";
    message("workspace-status", "");
    await Promise.all([loadMembers(epoch, id), loadTasks(epoch, id), loadHealth(epoch, id), loadBookings(epoch, id)]);
    if (epoch === workspace.epoch) await loadSocial(document.querySelector('[data-social-tab][aria-selected="true"]')?.dataset.socialTab || "wall");
  } catch (error) {
    if (epoch !== workspace.epoch) return;
    if (error.status === 401) location.hash = "#/login";
    else message("workspace-status", `${error.message} กดรีเฟรชข้อมูลเพื่อลองใหม่`, true);
  }
}
async function loadMembers(epoch, id) {
  const list = document.querySelector("#member-list");
  list.replaceChildren(spinner("กำลังโหลดสมาชิก…"));
  list.setAttribute("aria-busy", "true");
  try {
    const data = await apiRequest(`${squadPath(id)}/members`);
    if (epoch !== workspace.epoch) return;
    workspace.members = data.members || [];
    workspace.membersReady = true;
    document.querySelector("#new-task").disabled = false;
    message("members-status", "");
    renderMembers();
    if (workspace.tasksReady) renderTasks();
  } catch (error) {
    if (epoch !== workspace.epoch) return;
    message("members-status", error.message, true);
    list.replaceChildren(action("โหลดสมาชิกอีกครั้ง", () => loadMembers(epoch, id), "secondary-button", "rotate-right"));
  } finally { if (epoch === workspace.epoch) list.setAttribute("aria-busy", "false"); }
}
function renderMembers() {
  const list = document.querySelector("#member-list");
  list.replaceChildren();
  const roleIcons = { owner: "crown", admin: "user-shield", member: "user" };
  for (const member of workspace.members) {
    const name = member.display_name || member.username;
    const row = node("article", null, "member-row");
    const info = node("div", null, "member-info");
    const text = node("div", null, "member-text");
    const meta = node("div", null, "badge-row");
    meta.append(
      badge(roleLabels[member.role] || member.role, roleIcons[member.role] || "user", "role", member.role),
      badge(statusLabels[member.status] || member.status, null, "state", member.status),
      badge(`Trust ${member.trust_score ?? "—"}`, "shield-halved", "trust")
    );
    const heading = node("h3");
    if (member.status === "active" && member.rules_accepted_at) {
      const link = node("a", name, "profile-name-link");
      link.href = `#/profile/${member.user_id}`;
      link.setAttribute("aria-label", `ดูโปรไฟล์ ${name}`);
      heading.append(link);
    } else heading.textContent = name;
    text.append(heading, node("p", `@${member.username}`), meta);
    info.append(node("span", initial(name), "avatar"), text);
    row.append(info);
    if (isAdmin() && member.role !== "owner" && Number(member.user_id) !== Number(workspace.member.user_id)) {
      const controls = node("div", null, "action-row");
      if (member.status === "pending") controls.append(action(`อนุมัติ ${member.display_name}`, (event) => mutate(event.currentTarget, "members-status", `${squadPath()}/members/${member.user_id}`, "PATCH", { status: "active" }, () => loadWorkspace()), "secondary-button", "check"));
      if (member.status === "active") {
        const label = node("label", null, "role-control");
        label.append(node("span", `บทบาทของ ${member.display_name}`));
        const select = node("select");
        for (const role of ["member", "admin"]) { const option = node("option", roleLabels[role]); option.value = role; select.append(option); }
        select.value = member.role;
        label.append(select);
        controls.append(label, action("บันทึกบทบาท", (event) => mutate(event.currentTarget, "members-status", `${squadPath()}/members/${member.user_id}`, "PATCH", { role: select.value }, () => loadWorkspace()), "secondary-button", "floppy-disk"));
      }
      if (["active", "pending"].includes(member.status)) controls.append(action(`นำ ${member.display_name} ออก`, (event) => {
        const trigger = event.currentTarget;
        customConfirm(`นำ ${member.display_name} ออกจากก๊วน? ระบบจะตรวจรายการค้างก่อนดำเนินการ`, "นำสมาชิกออก").then((accepted) => {
          if (accepted) mutate(trigger, "members-status", `${squadPath()}/members/${member.user_id}`, "DELETE", undefined, () => loadWorkspace());
        });
      }, "secondary-button danger", "user-minus"));
      row.append(controls);
    }
    list.append(row);
  }
  if (!list.childElementCount) list.append(emptyState("users", "ไม่มีข้อมูลสมาชิก"));
}
const taskStatusLabels = { todo: "ต้องทำ", in_progress: "กำลังทำ", submitted: "รอตรวจ", pending_review: "รอตรวจ", done: "เสร็จแล้ว", cancelled: "ยกเลิกแล้ว", canceled: "ยกเลิกแล้ว", abandoned: "ทิ้งงาน" };
const statusIcons = { todo: "circle", in_progress: "circle-notch", submitted: "hourglass-half", pending_review: "hourglass-half", done: "circle-check", cancelled: "ban", canceled: "ban", abandoned: "ghost" };
const priorityLabels = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง", critical: "เร่งด่วนที่สุด" };
function formatDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "ไม่ระบุ";
}
async function loadTasks(epoch, id) {
  const list = document.querySelector("#task-list");
  list.replaceChildren(spinner("กำลังโหลดงาน…"));
  list.setAttribute("aria-busy", "true");
  message("tasks-status", "");
  try {
    const data = await apiRequest(`${squadPath(id)}/tasks`);
    if (epoch !== workspace.epoch) return;
    workspace.tasks = data.tasks || [];
    workspace.tasksReady = true;
    renderTasks();
  } catch (error) {
    if (epoch !== workspace.epoch) return;
    message("tasks-status", error.message, true);
    list.replaceChildren(action("โหลดงานอีกครั้ง", () => loadTasks(epoch, id), "secondary-button", "rotate-right"));
  } finally { if (epoch === workspace.epoch) list.setAttribute("aria-busy", "false"); }
}
function canManageTask(task) { return isAdmin() || Number(task.created_by) === Number(workspace.member.user_id); }
function openTask(task) { return ["todo", "in_progress"].includes(task.status); }
function taskCard(task) {
  const article = node("article", null, "task-card");
  article.dataset.status = task.status;
  article.dataset.priority = task.priority;
  const heading = node("div", null, "task-heading");
  heading.append(node("h3", task.title), badge(taskStatusLabels[task.status] || task.status, statusIcons[task.status] || "circle", "status-badge", task.status));
  const meta = node("div", null, "task-meta");
  meta.append(metaItem("tag", task.subject || "ไม่ระบุหมวด"), metaItem("flag", `ความสำคัญ${priorityLabels[task.priority] || task.priority}`, "priority"));
  article.append(heading, meta);
  if (task.description) article.append(node("p", task.description, "task-description"));
  const dates = node("div", null, "task-dates");
  dates.append(metaItem("calendar-day", `กำหนดส่ง ${formatDate(task.due_at)}`));
  if (task.max_due_at) dates.append(metaItem("hourglass-end", `กำหนดสุดท้าย ${formatDate(task.max_due_at)}`));
  article.append(dates);
  const assignees = node("ul", null, "task-assignees");
  for (const person of task.assignees || []) {
    const name = person.display_name || `สมาชิก ${person.user_id}`;
    const extras = [];
    if (person.due_override_at) extras.push(`กำหนดเฉพาะบุคคล ${formatDate(person.due_override_at)}`);
    if (person.submitted_at) extras.push(`ส่งแล้ว ${formatDate(person.submitted_at)}`);
    if (person.result) extras.push(`ผล: ${person.result}`);
    const item = node("li", null, "assignee");
    const text = node("span", null, "assignee-text");
    text.append(node("strong", name));
    if (extras.length) text.append(node("small", extras.join(" · ")));
    item.append(node("span", initial(name), "avatar sm"), text);
    assignees.append(item);
  }
  article.append(assignees);
  const controls = node("div", null, "action-row");
  const assignment = (task.assignees || []).find((person) => Number(person.user_id) === Number(workspace.member.user_id));
  const assigned = Boolean(assignment);
  if (assigned && !assignment.submitted_at && openTask(task)) controls.append(action("ส่งงาน", (event) => mutate(event.currentTarget, "tasks-status", `${squadPath()}/tasks/${task.id}/submit`, "POST", {}, refreshTaskData), "primary-button compact-button", "paper-plane"));
  if (task.status === "review" && !assigned) {
    controls.append(action("อนุมัติงาน", (event) => mutate(event.currentTarget, "tasks-status", `${squadPath()}/tasks/${task.id}/verify`, "POST", { decision: "approve" }, refreshTaskData), "primary-button compact-button", "circle-check"));
    controls.append(action("ส่งคืนแก้งาน", (event) => mutate(event.currentTarget, "tasks-status", `${squadPath()}/tasks/${task.id}/verify`, "POST", { decision: "reject", comment: "รบกวนแก้ไขและส่งหลักฐานใหม่ให้ครบถ้วน" }, refreshTaskData), "secondary-button compact-button", "rotate-left"));
  }
  if (task.status === "done" && isAdmin()) controls.append(action("เปิดงานใหม่", async (event) => {
    const reason = window.prompt("ระบุเหตุผลในการเปิดงานใหม่");
    if (!reason?.trim()) return;
    await mutate(event.currentTarget, "tasks-status", `${squadPath()}/tasks/${task.id}/reopen`, "POST", { reason: reason.trim() }, refreshTaskData);
  }, "secondary-button compact-button", "rotate-left"));
  if (openTask(task)) for (const person of task.assignees || []) {
    if (Number(person.user_id) !== Number(workspace.member.user_id)) controls.append(action(`จิก ${person.display_name || person.username || "เพื่อน"}`, (event) => mutate(event.currentTarget, "tasks-status", `${squadPath()}/tasks/${task.id}/poke`, "POST", { to_user_id: person.user_id }, refreshTaskData), "secondary-button compact-button", "bell"));
  }
  if (openTask(task) && (canManageTask(task) || assigned)) {
    const next = task.status === "todo" ? "in_progress" : "todo";
    controls.append(action(next === "in_progress" ? "เริ่มทำ" : "ย้ายกลับต้องทำ", (event) => mutate(event.currentTarget, "tasks-status", `${squadPath()}/tasks/${task.id}/status`, "PATCH", { status: next }, refreshTaskData), "secondary-button", next === "in_progress" ? "play" : "rotate-left"));
  }
  if (canManageTask(task) && openTask(task)) {
    const edit = action("แก้ไขงาน", (event) => editTask(task, event.currentTarget), "secondary-button", "pen");
    edit.disabled = !workspace.membersReady;
    if (edit.disabled) edit.title = "ต้องโหลดข้อมูลสมาชิกสำเร็จก่อนแก้ไขผู้รับผิดชอบ";
    controls.append(edit);
  }
  if (canManageTask(task) && !["cancelled", "canceled"].includes(task.status)) controls.append(action("ยกเลิกงาน", (event) => {
    customConfirm(`ยืนยันยกเลิกงาน “${task.title}”? การดำเนินการนี้จะยกเลิกงาน ไม่ใช่ลบประวัติ`, "ยกเลิกงาน").then((accepted) => {
      if (accepted) mutate(event.currentTarget, "tasks-status", `${squadPath()}/tasks/${task.id}`, "DELETE", undefined, refreshTaskData);
    });
  }, "secondary-button danger", "ban"));
  if (controls.childElementCount) article.append(controls);
  return article;
}
function renderTasks() {
  const list = document.querySelector("#task-list");
  list.className = workspace.view === "kanban" ? "task-board" : "task-list";
  list.replaceChildren();
  if (!workspace.tasks.length) { list.append(emptyState("list-check", "ยังไม่มีงาน", "กดสร้างงานเพื่อกำหนดผู้รับผิดชอบและเวลาส่งงานแรก")); return; }
  if (workspace.view === "list") { workspace.tasks.forEach((task) => list.append(taskCard(task))); return; }
  const statuses = [...new Set(["todo", "in_progress", "done", ...workspace.tasks.map((task) => task.status)])];
  for (const status of statuses) {
    const tasks = workspace.tasks.filter((task) => task.status === status);
    const column = node("section", null, "kanban-column");
    const title = node("h3", null, "column-title");
    title.append(icon(statusIcons[status] || "circle"), node("span", taskStatusLabels[status] || status), node("span", String(tasks.length), "count"));
    column.append(title);
    if (!tasks.length) column.append(node("p", "ไม่มีงานในสถานะนี้", "muted"));
    tasks.forEach((task) => column.append(taskCard(task)));
    list.append(column);
  }
}
async function loadHealth(epoch, id) {
  const contributors = document.querySelector("#health-contributors");
  const strip = document.querySelector("#health-strip");
  const progress = document.querySelector("#health-progress");
  contributors.replaceChildren();
  progress.removeAttribute("value");
  delete strip.dataset.status;
  message("health-label", "กำลังโหลดสุขภาพทีม…");
  try {
    const data = await apiRequest(`${squadPath(id)}/health`);
    if (epoch !== workspace.epoch) return;
    const labels = { healthy: "แข็งแรง", wounded: "บาดเจ็บ", critical: "วิกฤต", dead: "หมดพลัง" };
    const hp = Number(data.hp);
    if (!Number.isFinite(hp)) throw new Error("ข้อมูลสุขภาพทีมไม่ถูกต้อง");
    progress.dataset.status = data.status;
    strip.dataset.status = data.status;
    progress.value = 0;
    void progress.offsetWidth;
    requestAnimationFrame(() => { progress.value = Math.max(0, Math.min(100, hp)); });
    message("health-label", `${hp.toLocaleString("th-TH")} / 100 · ${labels[data.status] || data.status}`);
    for (const person of data.contributors || []) {
      const item = node("li");
      item.append(icon("droplet"), node("span", `${person.display_name} · เสียเลือด ${person.penalty}`));
      contributors.append(item);
    }
    if (!contributors.childElementCount) {
      const item = node("li", null, "ok");
      item.append(icon("heart"), node("span", "ยังไม่มีผู้ทำให้ทีมเสียเลือด"));
      contributors.append(item);
    }
  } catch (error) {
    if (epoch !== workspace.epoch) return;
    progress.value = 0;
    message("health-label", `โหลดสุขภาพทีมไม่ได้: ${error.message}`, true);
    contributors.replaceChildren(action("โหลดสุขภาพทีมอีกครั้ง", () => loadHealth(epoch, id), "secondary-button", "rotate-right"));
  }
}
async function loadBookings(epoch, id) {
  const list = document.querySelector("#booking-list");
  try {
    const bookingData = await apiRequest(`${squadPath(id)}/bookings`);
    if (epoch !== workspace.epoch) return;
    list.replaceChildren();
    if (!bookingData.bookings?.length) list.append(emptyState("calendar", "ยังไม่มีการจองห้อง", "เลือกห้องและช่วงเวลาจากฟอร์มด้านบน"));
    for (const booking of bookingData.bookings || []) {
      const card = node("article", null, "task-card");
      card.append(node("h3", booking.title || booking.room_name || `ห้อง ${booking.room_id}`));
      if (booking.title && booking.room_name) card.append(node("p", booking.room_name));
      card.append(node("p", `${formatDate(booking.start_at)} - ${formatDate(booking.end_at)}`, "task-dates"));
      card.append(action("ยกเลิกการจอง", (event) => {
        const trigger = event.currentTarget;
        customConfirm("ยกเลิกการจองห้องนี้?", "ยกเลิกการจอง").then((accepted) => {
          if (accepted) mutate(trigger, "booking-status", `${squadPath()}/bookings/${booking.id}`, "DELETE", undefined, () => loadBookings(epoch, id));
        });
      }, "secondary-button danger", "ban"));
      list.append(card);
    }
  } catch (error) {
    if (epoch === workspace.epoch) {
      list.replaceChildren(emptyState("triangle-exclamation", "โหลดการจองไม่ได้", error.message));
    }
  }
}
async function submitRoomBooking(form) {
  const data = new FormData(form);
  const start = new Date(data.get("start_at"));
  const end = new Date(data.get("end_at"));
  const roomName = String(data.get("room_name") || "").trim();
  if (!roomName || roomName.length > 80 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    message("booking-status", "กรุณากรอกห้องและช่วงเวลาที่ถูกต้อง", true); return;
  }
  await mutate(form.querySelector("button[type='submit']"), "booking-status", `${squadPath()}/bookings`, "POST", {
    room_name: roomName, title: data.get("title"), start_at: start.toISOString(), end_at: end.toISOString()
  }, () => { form.reset(); return loadBookings(workspace.epoch, workspace.id); });
}
async function refreshTaskData() {
  const epoch = workspace.epoch;
  const id = workspace.id;
  await Promise.all([loadTasks(epoch, id), loadHealth(epoch, id)]);
}
async function mutate(button, statusId, path, method, body, onSuccess) {
  if (!button) button = document.querySelector("#squad-workspace-submit") || document.body;
  if (button.disabled) return;
  const epoch = workspace.epoch;
  const idleHtml = button.innerHTML || "";
  if (typeof button.disabled === "boolean") button.disabled = true;
  if (button !== document.body) button.replaceChildren(icon("circle-notch", "fa-spin"), node("span", "กำลังบันทึก…"));
  button.setAttribute("aria-busy", "true");
  message(statusId, "");
  try {
    await apiRequest(path, body === undefined ? { method } : jsonOptions(method, body));
    if (epoch !== workspace.epoch) return;
    message(statusId, "บันทึกสำเร็จ");
    if (onSuccess) await onSuccess();
  } catch (error) {
    if (epoch !== workspace.epoch) return;
    message(statusId, error.message, true);
    if (error.status === 401) location.hash = "#/login";
  } finally {
    if (typeof button.disabled === "boolean") button.disabled = false;
    if (button !== document.body && button.isConnected) button.innerHTML = idleHtml;
    button.setAttribute("aria-busy", "false");
  }
}
let editorTrigger = null;
let alibiExplicit = false;
function localDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function editTask(task = null, trigger = document.querySelector("#new-task")) {
  if (!workspace.membersReady || !activeConsent() || document.querySelector("#task-form").getAttribute("aria-busy") === "true") return;
  const editor = document.querySelector("#task-editor");
  if (!editor.hidden) {
    customConfirm("เปิดฟอร์มใหม่และละทิ้งค่าที่ยังไม่ได้บันทึก?", "ละทิ้งค่าจัดทำงาน").then((accepted) => { if (accepted) editTask(task, trigger); });
    return;
  }
  workspace.editing = task;
  editorTrigger = trigger;
  const form = document.querySelector("#task-form");
  form.reset();
  showStatus("task", "");
  document.querySelector("#task-editor-title").textContent = task ? "แก้ไขงาน" : "สร้างงาน";
  for (const field of ["title", "description", "subject", "priority"]) form.elements.namedItem(field).value = task?.[field] ?? (field === "priority" ? "medium" : "");
  form.elements.due_at.value = localDateInput(task?.due_at);
  form.elements.max_due_at.value = localDateInput(task?.max_due_at);
  const knowsAlibi = !task || typeof task.allow_alibi === "boolean" || task.allow_alibi === 0 || task.allow_alibi === 1;
  document.querySelector("#task-alibi").value = knowsAlibi ? String(Boolean(task?.allow_alibi)) : "";
  document.querySelector("#alibi-preservation").hidden = knowsAlibi;
  alibiExplicit = knowsAlibi;
  const options = document.querySelector("#assignee-options");
  options.replaceChildren();
  const candidates = workspace.members.filter((member) => member.status === "active");
  for (const assigned of task?.assignees || []) {
    if (!candidates.some((member) => Number(member.user_id) === Number(assigned.user_id))) candidates.push(assigned);
  }
  for (const member of candidates) {
    const label = node("label", null, "check-row");
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.name = "assignee_ids";
    checkbox.value = String(member.user_id);
    checkbox.checked = Boolean(task?.assignees?.some((person) => Number(person.user_id) === Number(member.user_id)));
    label.append(checkbox, node("span", member.display_name || member.username || `สมาชิก ${member.user_id}`));
    options.append(label);
  }
  if (!candidates.length) options.append(node("p", "ไม่มีสมาชิกที่รับผิดชอบงานได้ รีเฟรชข้อมูลสมาชิกก่อนสร้างงาน"));
  editor.hidden = false;
  document.querySelector("#task-editor-title").focus();
}
function closeEditor() {
  document.querySelector("#task-editor").hidden = true;
  workspace.editing = null;
  if (editorTrigger?.isConnected) editorTrigger.focus();
  else document.querySelector("#new-task").focus();
}
async function saveTask(form) {
  if (form.getAttribute("aria-busy") === "true" || !form.reportValidity()) return;
  const data = new FormData(form);
  const assigneeIds = data.getAll("assignee_ids").map(Number);
  const due = new Date(data.get("due_at"));
  const max = data.get("max_due_at") ? new Date(data.get("max_due_at")) : null;
  let error = "";
  if (!String(data.get("title")).trim()) error = "กรุณากรอกชื่องาน";
  else if (!assigneeIds.length) error = "เลือกผู้รับผิดชอบอย่างน้อยหนึ่งคน";
  else if (!Number.isFinite(due.getTime()) || (max && !Number.isFinite(max.getTime()))) error = "กำหนดเวลาไม่ถูกต้อง";
  else if (max && max < due) error = "กำหนดสุดท้ายต้องไม่อยู่ก่อนกำหนดส่ง";
  else if (!alibiExplicit) error = "โปรดเลือกสิทธิ์ขอแก้ตัวและเลื่อนกำหนดก่อนบันทึก";
  if (error) { showStatus("task", error); document.querySelector("[data-form-status='task']").focus(); return; }
  const editing = workspace.editing;
  const payload = { title: String(data.get("title")).trim(), description: data.get("description"), subject: data.get("subject"), priority: data.get("priority"), due_at: due.toISOString(), max_due_at: max ? max.toISOString() : null, allow_alibi: data.get("allow_alibi") === "true", assignee_ids: assigneeIds };
  const epoch = workspace.epoch;
  const path = `${squadPath()}/tasks${editing ? `/${editing.id}` : ""}`;
  setBusy(form, true);
  document.querySelector("#close-task-editor").disabled = true;
  showStatus("task", "");
  try {
    await apiRequest(path, jsonOptions(editing ? "PATCH" : "POST", payload));
    if (epoch !== workspace.epoch) return;
    closeEditor();
    message("tasks-status", editing ? "แก้ไขงานแล้ว" : "สร้างงานแล้ว");
    await refreshTaskData();
  } catch (error) {
    if (epoch !== workspace.epoch) return;
    showStatus("task", error.message);
    document.querySelector("[data-form-status='task']").focus();
    if (error.status === 401) location.hash = "#/login";
  } finally { setBusy(form, false); document.querySelector("#close-task-editor").disabled = false; }
}
function initWorkspace() {
  document.querySelector("#squad-switcher").addEventListener("change", (event) => { if (event.target.value) location.hash = `#/squad/${encodeURIComponent(event.target.value)}`; });
  document.querySelector("#refresh-workspace").addEventListener("click", () => {
    if (!document.querySelector("#task-editor").hidden) {
      customConfirm("รีเฟรชและละทิ้งค่าที่ยังไม่ได้บันทึก?", "รีเฟรชข้อมูล").then((accepted) => { if (accepted) routeApp(); });
      return;
    }
    routeApp();
  });
  document.querySelector("#retry-invite").addEventListener("click", routeApp);
  document.querySelector("#rules-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    mutate(event.submitter || event.currentTarget.querySelector("button"), "workspace-status", `${squadPath()}/accept-rules`, "POST", { accepted: true }, async () => { await loadSquads(); await loadWorkspace(); });
  });
  document.querySelector("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    mutate(event.submitter || event.currentTarget.querySelector("button"), "members-status", `${squadPath()}/settings`, "PATCH", { require_join_approval: document.querySelector("#join-approval").checked }, () => loadWorkspace());
  });
  document.querySelector("#squad-management-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutate(event.submitter || event.currentTarget.querySelector("button[type='submit']"), "members-status", squadPath(), "PATCH", {
      name: form.get("name"), description: form.get("description"), visibility: form.get("visibility"), timezone: workspace.squad?.timezone || "Asia/Bangkok"
    }, () => loadWorkspace());
  });
  document.querySelector("#close-squad").addEventListener("click", (event) => {
    customConfirm("ปิดก๊วนชั่วคราว ข้อมูลและประวัติจะถูกเก็บไว้ สามารถเปิดกลับได้", "ปิดก๊วน").then((accepted) => {
      if (accepted) mutate(event.currentTarget, "members-status", `${squadPath()}/close`, "POST", { cancelled: false }, () => loadWorkspace());
    });
  });
  document.querySelector("#reopen-squad").addEventListener("click", (event) => {
    mutate(event.currentTarget, "members-status", `${squadPath()}/reopen`, "POST", {}, () => loadWorkspace());
  });
  document.querySelector("#cancel-squad").addEventListener("click", (event) => {
    customConfirm("ยกเลิกก๊วนและเพิกถอนคำเชิญ ข้อมูลสมาชิกและงานจะยังไม่ถูกลบ", "ยกเลิกก๊วน").then((accepted) => {
      if (accepted) mutate(event.currentTarget, "members-status", `${squadPath()}/close`, "POST", { cancelled: true }, () => { location.hash = "#/dashboard"; });
    });
  });
  document.querySelector("#leave-squad").addEventListener("click", (event) => {
    customConfirm("ออกจากก๊วนนี้? ระบบจะตรวจรายการค้างก่อน คะแนนเดิมจะไม่ถูกรีเซ็ต", "ออกจากก๊วน").then((accepted) => {
      if (accepted) mutate(event.currentTarget, "members-status", `${squadPath()}/members/${workspace.member.user_id}`, "DELETE", undefined, () => { location.hash = "#/dashboard"; });
    });
  });
  document.querySelector("#new-task").addEventListener("click", (event) => editTask(null, event.currentTarget));
  document.querySelector("#close-task-editor").addEventListener("click", () => {
    customConfirm("ปิดฟอร์มและละทิ้งค่าที่ยังไม่ได้บันทึก?", "ปิดฟอร์มงาน").then((accepted) => { if (accepted) closeEditor(); });
  });
  document.querySelector("#task-alibi").addEventListener("change", () => { alibiExplicit = true; });
  document.querySelector("#task-form").addEventListener("submit", (event) => { event.preventDefault(); saveTask(event.currentTarget); });
  document.querySelector("#room-booking-form").addEventListener("submit", (event) => { event.preventDefault(); submitRoomBooking(event.currentTarget); });
  document.querySelectorAll("[name='task-view']").forEach((radio) => radio.addEventListener("change", () => { workspace.view = radio.value; renderTasks(); }));
  document.querySelector("[data-logout]").addEventListener("click", () => document.querySelector("#logout-button").click());
}

// ===== theme / hero / password =====
function initTheme() {
  const root = document.documentElement;
  const toggle = document.querySelector("#theme-toggle");
  const apply = (theme, persist) => {
    root.dataset.theme = theme;
    const dark = theme === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด");
    if (persist) { try { localStorage.setItem("zeroTrustTheme", theme); } catch { /* Theme still works without storage. */ } }
  };
  let saved = null;
  try { saved = localStorage.getItem("zeroTrustTheme"); } catch { /* ignore */ }
  apply(saved === "dark" || saved === "light" ? saved : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), false);
  toggle.addEventListener("click", () => {
    root.classList.add("theme-switching");
    apply(root.dataset.theme === "dark" ? "light" : "dark", true);
    setTimeout(() => root.classList.remove("theme-switching"), 400);
  });
}
function initPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-pressed", String(show));
    button.setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");
    button.firstElementChild.className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
  }));
}
let heroFrame = 0;
function runHero() {
  const value = document.querySelector("[data-count-to]");
  if (!value) return;
  cancelAnimationFrame(heroFrame);
  const target = Number(value.dataset.countTo) || 0;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { value.textContent = String(target); return; }
  const begin = performance.now() + 250;
  const duration = 1700;
  value.textContent = "0";
  const tick = (now) => {
    const t = Math.min(1, Math.max(0, (now - begin) / duration));
    value.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 4))));
    if (t < 1) heroFrame = requestAnimationFrame(tick);
  };
  heroFrame = requestAnimationFrame(tick);
}

// ===== clock =====
let serverClockOffset = 0;

async function syncServerClock() {
  try {
    const response = await fetch("/api/v1/time", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    const serverTime = Date.parse(data.serverTime);
    if (!Number.isFinite(serverTime)) return;
    serverClockOffset = serverTime - Date.now();
    renderServerClock();
  } catch {
    // Keep the local fallback clock available when the server endpoint is unreachable.
  }
}
function serverNow() {
  return new Date(Date.now() + serverClockOffset);
}
function renderServerClock() {
  const clockText = document.querySelector("[data-server-clock]");
  if (!clockText) return;
  clockText.textContent = serverNow().toLocaleString("th-TH", {
    dateStyle: "medium", timeStyle: "medium"
  });
}

async function initClock() {
  await syncServerClock();
  setInterval(renderServerClock, 1000);
  setInterval(syncServerClock, 30000);
}

// ===== init =====
ensureCustomUI();
const publicSearchButton = document.querySelector("#public-squad-search-button");
publicSearchButton?.addEventListener("click", loadPublicSquads);
document.querySelector("#public-squad-search")?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); loadPublicSquads(); } });
initTheme();
initPasswordToggles();
initAuth();
initWorkspace();
initClock();
document.addEventListener("click", (event) => {
  if (!event.target.closest(".custom-select")) document.querySelectorAll(".custom-select.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
  });
});
document.querySelector("#custom-confirm")?.addEventListener("click", (event) => {
  if (event.target.closest('[data-confirm]')) closeCustomConfirm(event.target.closest('[data-confirm]').dataset.confirm === "accept");
  else if (event.target.id === "custom-confirm") closeCustomConfirm(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".custom-select.open").forEach((wrap) => {
      wrap.classList.remove("open");
      wrap.querySelector(".custom-select-trigger")?.focus();
    });
    if (modalResolve && !document.querySelector("#custom-confirm")?.hidden) closeCustomConfirm(false);
  }
});
const customSelectObserver = new MutationObserver((mutations) => {
  ensureCustomUI();
  for (const mutation of mutations) {
    const select = mutation.target.matches("select") ? mutation.target : mutation.target.closest("select");
    if (select && select._refreshCustomOptions) select._refreshCustomOptions();
  }
});
customSelectObserver.observe(document.body, { childList: true, subtree: true });
let notificationStream = null;
function initNotifications() {
  if (notificationStream) notificationStream.close();
  try {
    notificationStream = new EventSource("/api/v1/stream");
    notificationStream.onmessage = (event) => {
      try { const notification = JSON.parse(event.data); toast(notification.title || "มีการแจ้งเตือนใหม่", "warning"); } catch {}
    };
    notificationStream.onerror = () => notificationStream?.close();
  } catch {}
}
initNotifications();
setInterval(async () => {
  if (!notificationStream || notificationStream.readyState === EventSource.CLOSED) {
    try { await apiRequest("/api/v1/notifications"); } catch {}
  }
}, 30000);
document.addEventListener("click", (event) => {
  const link = event.target.closest(".legal-toc a");
  if (!link) return;
  event.preventDefault();
  const hash = link.getAttribute("href") || "";
  const sectionId = hash.split("#")[2];
  location.hash = hash.slice(1);
  const scrollToSection = () => document.getElementById(sectionId)?.scrollIntoView({ block: "start", behavior: "auto" });
  window.setTimeout(scrollToSection, 600);
  window.setTimeout(scrollToSection, 900);
});
routeApp();