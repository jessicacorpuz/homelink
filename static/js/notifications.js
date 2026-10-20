(() => {
  let notificationUserId = null;
  let notificationChannel = null;
  let notificationOpen = false;
  const rowsById = new Map();

  // Where a notification takes the user. Request-related types fall back to the
  // user's own request list, chosen by the role set on <body data-role="...">.
  const TYPE_PAGES = {
    property_assigned: "my_properties.html",
    property_unassigned: "my_properties.html"
  };
  const ROLE_PAGES = {
    tenant: "my_requests.html",
    manager: "manager_requests.html",
    contractor: "contractor_view.html"
  };
  const MAX_TOASTS = 3;
  const TOAST_MS = 7000;

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));

  function ensureStyles() {
    if (document.getElementById("notification-styles")) return;
    const style = document.createElement("style");
    style.id = "notification-styles";
    style.textContent = `
      .notification-wrap{position:relative;z-index:10000}
      .notification-bell{position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:0;background:transparent;color:#64748b;cursor:pointer;font-size:18px}
      .notification-badge{position:absolute;top:1px;right:1px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#f43f5e;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1}
      .notification-badge[hidden]{display:none}
      .notification-panel{position:fixed;top:72px;right:24px;width:360px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 45px rgba(15,23,42,.18);overflow:hidden;display:none;z-index:10001}
      .notification-panel.open{display:block}
      .notification-panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #e2e8f0}
      .notification-panel-head h3{margin:0;color:#1e293b;font-size:16px}
      .notification-panel-head button{border:0;background:transparent;color:#2563eb;font-size:12px;cursor:pointer}
      .notification-list{max-height:420px;overflow:auto}
      .notification-item{display:block;width:100%;text-align:left;border:0;background:#fff;padding:14px 18px;border-bottom:1px solid #f1f5f9;cursor:pointer}
      .notification-item:hover{background:#f8fafc}
      .notification-item.unread{background:#eff6ff}
      .notification-item-title{margin:0 0 4px;color:#1e293b;font-size:13px;font-weight:700}
      .notification-item-message{margin:0;color:#64748b;font-size:12px;line-height:1.5}
      .notification-item-time{display:block;margin-top:6px;color:#94a3b8;font-size:11px}
      .notification-empty{padding:30px 18px;text-align:center;color:#94a3b8;font-size:13px}
      .notification-toast-stack{position:fixed;right:24px;bottom:24px;display:flex;flex-direction:column;gap:10px;z-index:10002;max-width:calc(100vw - 32px)}
      .notification-toast{display:flex;align-items:flex-start;gap:12px;width:340px;max-width:100%;text-align:left;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:12px;background:#fff;padding:12px 14px;box-shadow:0 12px 32px rgba(15,23,42,.18);cursor:pointer;animation:notification-toast-in .2s ease-out;transition:opacity .2s,transform .2s}
      .notification-toast.leaving{opacity:0;transform:translateY(6px)}
      .notification-toast-icon{color:#2563eb;font-size:16px;line-height:1.3}
      .notification-toast-title{display:block;margin:0 0 2px;color:#1e293b;font-size:13px;font-weight:700}
      .notification-toast-message{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;color:#64748b;font-size:12px;line-height:1.5}
      @keyframes notification-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @media(max-width:600px){.notification-panel{right:16px;top:66px}.notification-toast-stack{right:16px;bottom:16px}}
    `;
    document.head.appendChild(style);
  }

  function setBadge(count) {
    const badge = document.getElementById("notificationBadge");
    if (!badge) return;
    badge.hidden = !count;
    badge.textContent = count > 99 ? "99+" : String(count || 0);
  }

  function setPanelOpen(open) {
    notificationOpen = open;
    const panel = document.getElementById("notificationPanel");
    const bell = document.getElementById("notificationBell");
    if (panel) panel.classList.toggle("open", open);
    if (bell) bell.setAttribute("aria-expanded", String(open));
  }

  function setupBell() {
    if (document.getElementById("notificationPanel")) return;
    const existing = document.querySelector(".bell");
    if (!existing) return;
    existing.classList.add("notification-wrap");
    existing.innerHTML = '<button type="button" class="notification-bell" id="notificationBell" aria-label="Notifications" aria-haspopup="true" aria-expanded="false"><i class="fa-regular fa-bell"></i><span class="notification-badge" id="notificationBadge" hidden>0</span></button>';
    const panel = document.createElement("div");
    panel.id = "notificationPanel";
    panel.className = "notification-panel";
    panel.innerHTML = '<div class="notification-panel-head"><h3>Notifications</h3><button type="button" id="markNotificationsRead">Mark all as read</button></div><div class="notification-list" id="notificationList"><div class="notification-empty">Loading notifications...</div></div>';
    document.body.appendChild(panel);
    document.getElementById("notificationBell").addEventListener("click", async event => {
      event.stopPropagation();
      setPanelOpen(!notificationOpen);
      if (notificationOpen) await loadNotifications();
    });
    document.getElementById("markNotificationsRead").addEventListener("click", async event => {
      event.stopPropagation();
      await markAllRead();
    });
    document.addEventListener("click", event => {
      if (notificationOpen && !panel.contains(event.target) && !existing.contains(event.target)) setPanelOpen(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && notificationOpen) setPanelOpen(false);
    });
  }

  function timeAgo(value) {
    if (!value) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function destinationFor(row) {
    if (row.type === "property_assignment_request" && row.request_id) {
      return "manager_properties.html?assignment_request=" + encodeURIComponent(row.request_id);
    }
    const role = String(document.body.dataset.role || "").toLowerCase();
    const kind = String(row.type || "").toLowerCase();
    const message = String(row.title || "") + " " + String(row.message || "");
    if ((kind.includes("assignment") || /property assignment/i.test(message)) && role === "manager") {
      return "manager_properties.html" + (row.request_id ? "?assignment_request=" + encodeURIComponent(row.request_id) : "");
    }
    if ((kind.includes("property") || /property assigned|property assignment/i.test(message)) && role === "tenant") {
      return "my_properties.html";
    }
    if (TYPE_PAGES[row.type]) {
      const role = document.body.dataset.role || "";
      if (role === "manager") return "manager_properties.html";
      if (role === "contractor") return "contractor_properties.html";
      return TYPE_PAGES[row.type];
    }
    const page = ROLE_PAGES[role || document.body.dataset.role || ""] || "";
    if (!row.request_id) {
      if (page && /maintenance|repair|contractor|completed|request/i.test(message)) return page;
      return "";
    }
    if (!page) return "";
    return page + "?request=" + encodeURIComponent(row.request_id);
  }

  // The unread badge is a count query, so it stays accurate beyond the 30 rows
  // the panel shows, and the panel list is only fetched when it is opened.
  async function refreshBadge() {
    if (!notificationUserId) return;
    const {count, error} = await window.supabaseClient.from("notifications").select("id", {count: "exact", head: true}).eq("user_id", notificationUserId).eq("is_read", false);
    if (!error) setBadge(count || 0);
  }

  async function loadNotifications() {
    if (!notificationUserId) return;
    const list = document.getElementById("notificationList");
    if (!list) return;
    const {data, error} = await window.supabaseClient.from("notifications").select("id,request_id,type,title,message,is_read,created_at").eq("user_id", notificationUserId).order("created_at", {ascending: false}).limit(30);
    if (error) {
      list.innerHTML = `<div class="notification-empty">${esc(error.message)}</div>`;
      return;
    }
    const rows = data || [];
    rowsById.clear();
    rows.forEach(row => rowsById.set(String(row.id), row));
    await refreshBadge();
    if (!rows.length) {
      list.innerHTML = '<div class="notification-empty">You have no notifications.</div>';
      return;
    }
    list.innerHTML = rows.map(row => `<button type="button" class="notification-item ${row.is_read ? "" : "unread"}" data-id="${esc(row.id)}"><p class="notification-item-title">${esc(row.title)}</p><p class="notification-item-message">${esc(row.message)}</p><span class="notification-item-time">${esc(timeAgo(row.created_at))}</span></button>`).join("");
    list.querySelectorAll(".notification-item").forEach(item => item.addEventListener("click", () => openNotification(rowsById.get(item.dataset.id))));
  }

  async function markRead(id) {
    if (!notificationUserId || id == null) return;
    await window.supabaseClient.from("notifications").update({is_read: true}).eq("id", id).eq("user_id", notificationUserId);
  }

  async function markAllRead() {
    if (!notificationUserId) return;
    await window.supabaseClient.from("notifications").update({is_read: true}).eq("user_id", notificationUserId).eq("is_read", false);
    setBadge(0);
    if (notificationOpen) await loadNotifications();
  }

  async function openNotification(row) {
    if (!row) return;
    await markRead(row.id);
    const page = destinationFor(row);
    if (page) {
      window.location.href = page;
      return;
    }
    await loadNotifications();
  }

  // Pop-up shown when a notification arrives while the user is on the page.
  function showToast(row) {
    let stack = document.getElementById("notificationToasts");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "notificationToasts";
      stack.className = "notification-toast-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    while (stack.children.length >= MAX_TOASTS) stack.firstElementChild.remove();
    const toast = document.createElement("button");
    toast.type = "button";
    toast.className = "notification-toast";
    toast.innerHTML = `<span class="notification-toast-icon"><i class="fa-solid fa-bell"></i></span><span><span class="notification-toast-title">${esc(row.title)}</span><span class="notification-toast-message">${esc(row.message)}</span></span>`;
    const dismiss = () => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 200);
    };
    toast.addEventListener("click", () => {
      dismiss();
      openNotification(row);
    });
    stack.appendChild(toast);
    setTimeout(dismiss, TOAST_MS);
  }

  async function onNewNotification(payload) {
    const row = payload && payload.new;
    if (row && !notificationOpen) showToast(row);
    await (notificationOpen ? loadNotifications() : refreshBadge());
  }

  async function onNotificationChanged() {
    await (notificationOpen ? loadNotifications() : refreshBadge());
  }

  async function initNotifications() {
    try {
      if (!window.supabaseClient) {
        console.warn("HomeLink notifications: supabaseClient is not loaded.");
        return;
      }
      ensureStyles();
      setupBell();
      const {data, error} = await window.supabaseClient.auth.getUser();
      if (error || !data.user) return;
      notificationUserId = data.user.id;
      await refreshBadge();
      if (notificationChannel) await window.supabaseClient.removeChannel(notificationChannel);
      const filter = "user_id=eq." + notificationUserId;
      notificationChannel = window.supabaseClient
        .channel("notifications-" + notificationUserId)
        .on("postgres_changes", {event: "INSERT", schema: "public", table: "notifications", filter}, onNewNotification)
        .on("postgres_changes", {event: "UPDATE", schema: "public", table: "notifications", filter}, onNotificationChanged)
        .subscribe();
    } catch (error) {
      // A notifications problem must never break the page that loaded it.
      console.error("HomeLink notifications:", error);
    }
  }

  window.initHomeLinkNotifications = initNotifications;
  window.HomeLinkNotifications = {
    init: initNotifications,
    refresh: refreshBadge,
    markAllRead,
    markRead
  };
})();
