(() => {
  "use strict";

  const supabase = window.supabaseClient;
  const bodyRole = document.body.dataset.role;
  const contactList = document.getElementById("contactList");
  const contactTabs = document.getElementById("contactTabs");
  const profileLink = document.querySelector(".profile-link");
  const logoutButton = document.getElementById("logoutBtn");
  let contacts = [];
  let currentUserId = null;
  let pageRole = bodyRole;

  const roleNames = {
    tenant: "Tenant",
    manager: "Manager",
    contractor: "Contractor"
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

  const initials = (name) => String(name || "User")
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function setNavigation(role) {
    const pages = {
      manager: [
        ["manager_dashboard.html", "Dashboard", "fa-table-cells-large"],
        ["manager_properties.html", "Properties", "fa-building"],
        ["manager_requests.html", "Maintenance Requests", "fa-screwdriver-wrench"],
        ["manager_contacts.html", "Contacts", "fa-address-book"],
        ["manager_profile.html", "Profile", "fa-user"]
      ],
      contractor: [
        ["contractor_properties.html", "Properties", "fa-building"],
        ["contractor_view.html", "Assigned Jobs", "fa-screwdriver-wrench"],
        ["contractor_contacts.html", "Contacts", "fa-address-book"],
        ["contractor_profile.html", "Profile", "fa-user"]
      ],
      tenant: [
        ["tenant_dashboard.html", "Dashboard", "fa-table-cells-large"],
        ["my_properties.html", "My Properties", "fa-building"],
        ["my_requests.html", "Maintenance Requests", "fa-screwdriver-wrench"],
        ["tenant_contacts.html", "Contacts", "fa-address-book"],
        ["profile.html", "Profile", "fa-user"]
      ]
    };

    const activePage = {
      manager: "manager_contacts.html",
      contractor: "contractor_contacts.html",
      tenant: "tenant_contacts.html"
    }[role];
    const nav = document.getElementById("mainNav");
    nav.innerHTML = (pages[role] || []).map(([href, label, icon]) =>
      `<a class="${href === activePage ? "active" : ""}" href="${href}"><i class="fa-solid ${icon}"></i><span>${label}</span></a>`
    ).join("");
  }

  function renderContacts(kind = "all") {
    const rows = contacts.filter((person) => {
      const role = String(person.role || "").toLowerCase();
      return kind === "all" || role === kind;
    });

    if (!rows.length) {
      contactList.innerHTML = '<div class="empty-card"><h2>No contacts found</h2><p>Contacts appear here when a manager or contractor account is registered.</p></div>';
      return;
    }

    contactList.innerHTML = rows.map((person) => {
      const role = String(person.role || "").toLowerCase();
      const icon = role === "manager" ? "user-tie" : role === "contractor" ? "screwdriver-wrench" : "user";
      const name = person.full_name || person.email || roleNames[role] || "User";
      const email = person.email
        ? `<a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a>`
        : "Email not provided";
      const phone = person.phone
        ? `<a href="tel:${escapeHtml(person.phone)}">${escapeHtml(person.phone)}</a>`
        : "Contact number not provided";

      return `<article class="contact-card">
        <div class="contact-avatar"><i class="fa-solid fa-${icon}"></i></div>
        <div class="contact-body">
          <h3>${escapeHtml(name)}</h3>
          <span class="badge badge-assigned">${escapeHtml(roleNames[role] || "User")}</span>
          <p><i class="fa-regular fa-envelope"></i> ${email}</p>
          <p><i class="fa-solid fa-phone"></i> ${phone}</p>
        </div>
      </article>`;
    }).join("");
  }

  async function initContacts() {
    if (!supabase) {
      contactList.textContent = "Unable to connect to HomeLink. Please refresh the page.";
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      window.location.href = "../index.html";
      return;
    }

    currentUserId = authData.user.id;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, phone, avatar_url")
      .eq("id", currentUserId)
      .single();

    if (profileError || !profile) {
      contactList.textContent = "Unable to load your profile. Please sign in again.";
      return;
    }

    pageRole = String(profile.role || bodyRole || "tenant").toLowerCase();
    document.body.dataset.role = pageRole;
    setNavigation(pageRole);

    const profilePages = {
      tenant: "profile.html",
      manager: "manager_profile.html",
      contractor: "contractor_profile.html"
    };
    profileLink.href = profilePages[pageRole] || "profile.html";
    document.getElementById("top-name").textContent = profile.full_name || profile.email || authData.user.email || "User";
    document.getElementById("top-role").textContent = roleNames[pageRole] || "User";
    document.getElementById("top-avatar").innerHTML = profile.avatar_url
      ? `<img src="${escapeHtml(profile.avatar_url)}" alt="Profile photo">`
      : escapeHtml(initials(profile.full_name || profile.email));

    // Tenants only see managers and contractors. Contractors see managers and tenants.
    const allowedRoles = pageRole === "tenant"
      ? ["manager", "contractor"]
      : pageRole === "contractor"
        ? ["manager", "tenant"]
        : ["tenant", "manager", "contractor"];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, phone")
      .order("full_name", { ascending: true });

    if (error) {
      contactList.innerHTML = `<div class="empty-card"><h2>Unable to load contacts</h2><p>${escapeHtml(error.message)}</p><p>Check the profiles SELECT policy in Supabase.</p></div>`;
      return;
    }

    contacts = (data || []).filter((person) =>
      person.id !== currentUserId && allowedRoles.includes(String(person.role || "").toLowerCase())
    );
    renderContacts("all");

    contactTabs.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => {
        contactTabs.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
        button.classList.add("active");
        renderContacts(button.dataset.kind);
      });
    });

    if (window.initHomeLinkNotifications) {
      await window.initHomeLinkNotifications();
    }
  }

  logoutButton.addEventListener("click", async (event) => {
    event.preventDefault();
    await supabase.auth.signOut();
    window.location.href = "../index.html";
  });

  initContacts();
})();
