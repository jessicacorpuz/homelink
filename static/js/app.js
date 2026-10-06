

function setTab(btn, panelId) {
  var tabsWrap = btn.parentElement;
  var buttons = tabsWrap.querySelectorAll(".tab, .detail-tab");
  buttons.forEach(function (b) { b.classList.remove("active"); });
  btn.classList.add("active");

  var panelGroup = tabsWrap.parentElement.querySelectorAll(".tab-panel");
  panelGroup.forEach(function (p) {
    p.classList.toggle("active", p.id === panelId);
  });
}

function filterStatus(btn, status) {
  var tabsWrap = btn.parentElement;
  tabsWrap.querySelectorAll(".tab").forEach(function (b) { b.classList.remove("active"); });
  btn.classList.add("active");

  document.querySelectorAll(".request-card, .job-card").forEach(function (row) {
    var match = status === "All" || row.dataset.status === status;
    row.style.display = match ? "" : "none";
  });
}

var currentStep = 1;
function goToStep(step) {
  currentStep = step;
  document.querySelectorAll(".step-panel").forEach(function (p) {
    p.classList.toggle("active", Number(p.dataset.step) === step);
  });
  document.querySelectorAll(".step").forEach(function (s) {
    var n = Number(s.dataset.step);
    s.classList.remove("active", "done");
    if (n < step) s.classList.add("done");
    if (n === step) s.classList.add("active");
  });
  var backBtn = document.getElementById("step-back");
  var nextBtn = document.getElementById("step-next");
  if (backBtn) backBtn.textContent = step === 1 ? "Cancel" : "Back";
  if (nextBtn) nextBtn.textContent = step === 3 ? "Submit Request" : "Next";
  if (step === 3) populateReview();
}

function populateReview() {
  var fields = {
    "review-property": "property",
    "review-unit": "unit",
    "review-issue-type": "issue_type",
    "review-title": "title",
    "review-description": "description"
  };
  Object.keys(fields).forEach(function (elId) {
    var el = document.getElementById(elId);
    var input = document.querySelector('[name="' + fields[elId] + '"]');
    if (el && input) el.textContent = input.value || "\u2014";
  });
}
function stepBack() {
  if (currentStep === 1) {
    window.location.href = "my_requests.html";
  } else {
    goToStep(currentStep - 1);
  }
}
function stepNext() {
  if (currentStep === 3) {

    window.location.href = "my_requests.html";
  } else {
    goToStep(currentStep + 1);
  }
}

function selectRole(el, role) {
  var wrap = el.parentElement;
  wrap.querySelectorAll(".role-tab").forEach(function (t) { t.classList.remove("active"); });
  el.classList.add("active");
  document.getElementById("selected-role").value = role;
}
function signIn() {
  var role = document.getElementById("selected-role").value;
  var target = { tenant: "pages/tenant_dashboard.html", manager: "pages/manager_dashboard.html", contractor: "pages/contractor_view.html" }[role];
  window.location.href = target || "pages/tenant_dashboard.html";
}
function togglePassword(btn) {
  var input = btn.previousElementSibling;
  var icon = btn.querySelector("i");
  if (input.type === "password") {
    input.type = "text";
    icon.className = "fa-regular fa-eye-slash";
  } else {
    input.type = "password";
    icon.className = "fa-regular fa-eye";
  }
}
