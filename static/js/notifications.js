(() => {
  let notificationUserId = null;
  let notificationChannel = null;
  let notificationOpen = false;

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));

  function ensureStyles() {
    if (document.getElementById("notification-styles")) return;
    const style = document.createElement("style");
    style.id = "notification-styles";
    style.textContent = `
      .notification-wrap{position:relative;z-index:10000}
      .notification-bell{position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:0;background:transparent;color:#64748b;cursor:pointer;font-size:18px}
      .notification-badge{position:absolute;top:1px;right:1px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#f43f5e;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1}
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
      @media(max-width:600px){.notification-panel{right:16px;top:66px}}
    `;
    document.head.appendChild(style);
  }

  function setupBell() {
    const existing = document.querySelector(".bell");
    if (!existing) return;
    existing.classList.add("notification-wrap");
    existing.innerHTML = '<button class="notification-bell" id="notificationBell" aria-label="Notifications"><i class="fa-regular fa-bell"></i><span class="notification-badge" id="notificationBadge" hidden>0</span></button>';
    const panel = document.createElement("div");
    panel.id = "notificationPanel";
    panel.className = "notification-panel";
    panel.innerHTML = '<div class="notification-panel-head"><h3>Notifications</h3><button type="button" id="markNotificationsRead">Mark all as read</button></div><div class="notification-list" id="notificationList"><div class="notification-empty">Loading notifications...</div></div>';
    document.body.appendChild(panel);
    document.getElementById("notificationBell").addEventListener("click", async event => {
      event.stopPropagation();
      notificationOpen = !notificationOpen;
      panel.classList.toggle("open", notificationOpen);
      if (notificationOpen) await loadNotifications();
    });
    document.getElementById("markNotificationsRead").addEventListener("click", async event => {
      event.stopPropagation();
      if (!notificationUserId) return;
      await window.supabaseClient.from("notifications").update({is_read:true}).eq("user_id",notificationUserId).eq("is_read",false);
      await loadNotifications();
    });
    document.addEventListener("click", event => {
      if (!panel.contains(event.target) && !existing.contains(event.target)) {
        notificationOpen = false;
        panel.classList.remove("open");
      }
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

  async function loadNotifications() {
    if (!notificationUserId) return;
    const list = document.getElementById("notificationList");
    const {data,error} = await window.supabaseClient.from("notifications").select("id,request_id,type,title,message,is_read,created_at").eq("user_id",notificationUserId).order("created_at",{ascending:false}).limit(30);
    if (error) {
      list.innerHTML = `<div class="notification-empty">${esc(error.message)}</div>`;
      return;
    }
    const rows = data || [];
    const unread = rows.filter(row => !row.is_read).length;
    const badge = document.getElementById("notificationBadge");
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    if (!rows.length) {
      list.innerHTML = '<div class="notification-empty">You have no notifications.</div>';
      return;
    }
    list.innerHTML = rows.map(row => `<button type="button" class="notification-item ${row.is_read ? "" : "unread"}" data-id="${esc(row.id)}" data-request="${esc(row.request_id || "")}"><p class="notification-item-title">${esc(row.title)}</p><p class="notification-item-message">${esc(row.message)}</p><span class="notification-item-time">${esc(timeAgo(row.created_at))}</span></button>`).join("");
    list.querySelectorAll(".notification-item").forEach(item => item.addEventListener("click", async () => {
      const id = item.dataset.id;
      const requestId = item.dataset.request;
      await window.supabaseClient.from("notifications").update({is_read:true}).eq("id",id).eq("user_id",notificationUserId);
      if (requestId) {
        const role = document.body.dataset.role || "";
        if (role === "tenant") window.location.href = "my_requests.html";
        if (role === "manager") window.location.href = "manager_requests.html";
        if (role === "contractor") window.location.href = "contractor_view.html";
      }
    }));
  }

  async function initNotifications() {
    ensureStyles();
    setupBell();
    const {data,error} = await window.supabaseClient.auth.getUser();
    if (error || !data.user) return;
    notificationUserId = data.user.id;
    await loadNotifications();
    if (notificationChannel) await window.supabaseClient.removeChannel(notificationChannel);
    notificationChannel = window.supabaseClient.channel("notifications-" + notificationUserId).on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:"user_id=eq." + notificationUserId},async () => { await loadNotifications(); }).subscribe();
  }

  window.initHomeLinkNotifications = initNotifications;
})();
