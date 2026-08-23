const CATEGORIES = [
  {key:"arrest", label:"Arrests", icon:"⚖️"},
  {key:"pit", label:"PITs", icon:"🚓"},
  {key:"pursuit", label:"Pursuits", icon:"🚨"},
  {key:"citation", label:"Citations", icon:"📝"},
  {key:"crash", label:"Crash Investigations", icon:"💥"},
  {key:"grappler", label:"Grappler Deployments", icon:"🪝"},
  {key:"felony_stop", label:"Felony Stops", icon:"🛑"},
  {key:"assist", label:"Agency Assists", icon:"🤝"},
  {key:"dui", label:"DUI / DWI", icon:"🍺"},
  {key:"other", label:"Other", icon:"📌"}
];

const SUPABASE_CONFIGURED =
  typeof window.SUPABASE_URL === "string" &&
  typeof window.SUPABASE_ANON_KEY === "string" &&
  window.SUPABASE_URL.startsWith("https://") &&
  !window.SUPABASE_URL.includes("YOUR_") &&
  window.SUPABASE_ANON_KEY.length > 20 &&
  !window.SUPABASE_ANON_KEY.includes("YOUR_");

const sb = SUPABASE_CONFIGURED
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

const $ = id => document.getElementById(id);
const categoryMap = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let events = [];
let roster = [];
let currentSession = null;

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-01`;
}

function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[char]));
}

function setStatus(online, text) {
  $("connectionStatus").textContent = text;
  $("connectionStatus").className = `status ${online ? "online" : "offline"}`;
}

function showMessage(id, text, type="") {
  $(id).textContent = text;
  $(id).className = `form-message ${type}`;
}

function setup() {
  $("monthTitle").textContent =
    currentMonth.toLocaleDateString(undefined, {month:"long", year:"numeric"});

  $("activityDate").value = new Date().toISOString().slice(0,10);
  $("category").innerHTML = CATEGORIES
    .map(c => `<option value="${c.key}">${c.label}</option>`)
    .join("");

  $("activityForm").addEventListener("submit", addActivity);
  $("refreshBtn").addEventListener("click", load);
  $("adminBtn").addEventListener("click", openAdmin);
  $("closeAdmin").addEventListener("click", closeAdmin);
  $("loginForm").addEventListener("submit", login);
  $("logoutBtn").addEventListener("click", logout);
  $("resetMonthBtn").addEventListener("click", resetMonth);
  $("rosterForm").addEventListener("submit", addRosterMember);

  renderStats();
  renderSummary();
  renderTable();
  renderRoster();

  if (!SUPABASE_CONFIGURED) {
    setStatus(false, "Configuration error");
    showMessage("formMessage", "Supabase configuration is missing or invalid.", "error");
    return;
  }

  setStatus(false, "Connecting…");
  load();

  sb.auth.getSession().then(({data}) => updateAdminUI(data.session));

  sb.auth.onAuthStateChange((_event, session) => {
    updateAdminUI(session);
  });

  sb.channel("teu-live")
    .on(
      "postgres_changes",
      {event:"*", schema:"public", table:"teu_events"},
      () => load()
    )
    .subscribe(status => {
      if (status === "SUBSCRIBED") setStatus(true, "Live");
    });
}

async function load() {
  if (!sb) return;

  const {data, error} = await sb
    .from("teu_events")
    .select("id,category,member,activity_date,notes,created_at")
    .eq("month_start", monthKey(currentMonth))
    .order("created_at", {ascending:false});

  if (error) {
    setStatus(false, "Database error");
    showMessage("formMessage", error.message, "error");
    return;
  }

  events = data || [];
  await loadRoster();
  setStatus(true, "Live");
  renderStats();
  renderSummary();
  renderTable();
}

function renderStats() {
  const priority = [
    "arrest","pit","pursuit","citation",
    "crash","grappler","felony_stop","dui"
  ];

  $("statsGrid").innerHTML = priority.map(key => {
    const category = categoryMap[key];
    const count = events.filter(e => e.category === key).length;

    return `
      <div class="stat">
        <div class="icon">${category.icon}</div>
        <div class="value">${count}</div>
        <div class="label">${category.label}</div>
      </div>`;
  }).join("");
}

function renderSummary() {
  const counts = {};
  events.forEach(event => {
    counts[event.category] = (counts[event.category] || 0) + 1;
  });

  const rows = CATEGORIES
    .filter(category => counts[category.key])
    .map(category => `
      <div class="summary-item">
        <span>${category.label}</span>
        <span>${counts[category.key]}</span>
      </div>`)
    .join("");

  $("summary").innerHTML = rows ||
    `<div class="empty">No activity recorded for this month.</div>`;
}

function renderTable() {
  $("activityTable").innerHTML = events.length
    ? events.slice(0,100).map(event => `
      <tr>
        <td>${new Date(`${event.activity_date}T00:00:00`).toLocaleDateString()}</td>
        <td>${escapeHtml(categoryMap[event.category]?.label || event.category)}</td>
        <td>${escapeHtml(event.member || "—")}</td>
        <td>${escapeHtml(event.notes || "—")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="empty">No activity recorded yet.</td></tr>`;
}

async function addActivity(event) {
  event.preventDefault();

  if (!sb) {
    showMessage("formMessage", "Supabase is not configured.", "error");
    return;
  }

  const date = $("activityDate").value;
  if (!date) {
    showMessage("formMessage", "Choose an activity date.", "error");
    return;
  }

  const dateObject = new Date(`${date}T00:00:00`);
  if (monthKey(dateObject) !== monthKey(currentMonth)) {
    showMessage(
      "formMessage",
      "The activity date must be in the current reporting month.",
      "error"
    );
    return;
  }

  const payload = {
    category: $("category").value,
    member: $("member").value.trim() || null,
    activity_date: date,
    month_start: monthKey(dateObject),
    notes: $("notes").value.trim() || null
  };

  const {error} = await sb.from("teu_events").insert(payload);

  if (error) {
    showMessage("formMessage", error.message, "error");
    return;
  }

  $("member").value = "";
  $("notes").value = "";
  showMessage("formMessage", "Activity recorded.", "success");
  await load();
}

function openAdmin() {
  $("adminModal").classList.remove("hidden");
  updateAdminUIFromCurrentSession();
}

function closeAdmin() {
  $("adminModal").classList.add("hidden");
}

async function updateAdminUIFromCurrentSession() {
  if (!sb) return;
  const {data} = await sb.auth.getSession();
  updateAdminUI(data.session);
}

function updateAdminUI(session) {
  currentSession = session || null;
  $("rosterAdminControls").classList.toggle("hidden", !session);
  $("rosterActionsHeader").classList.toggle("hidden", !session);
  if (session) {
    $("loginForm").classList.add("hidden");
    $("adminControls").classList.remove("hidden");
    $("adminStatus").textContent =
      `Authenticated: ${session.user.email}`;
  } else {
    $("loginForm").classList.remove("hidden");
    $("adminControls").classList.add("hidden");
  }
}

async function login(event) {
  event.preventDefault();

  if (!sb) {
    showMessage("adminMessage", "Supabase is not configured.", "error");
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;

  const {data, error} = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage(
      "adminMessage",
      "Invalid email/password or the Supabase admin account has not been created yet.",
      "error"
    );
    return;
  }

  updateAdminUI(data.session);
  showMessage(
    "adminMessage",
    "Signed in. The only available admin action is monthly reset.",
    "success"
  );
}

async function logout() {
  if (sb) await sb.auth.signOut();
  updateAdminUI(null);
  $("email").value = "";
  $("password").value = "";
  showMessage("adminMessage", "", "");
}


async function loadRoster() {
  if (!sb) return;

  const {data, error} = await sb
    .from("teu_roster")
    .select("id,callsign,name,rank,subdivision_rank,active,created_at,updated_at");

  if (error) {
    showMessage("rosterMessage", error.message, "error");
    return;
  }

  roster = data || [];
  renderRoster();
}
function renderRoster() {
  const rankOrder = {
    "Commander": 0,
    "Co Commander": 1,
    "FTO": 2,
    "TEU Traffic Member": 3
  };

  // Always sort immediately before rendering.
  // This guarantees new/realtime/edited members move to the correct position.
  roster.sort((a, b) => {
    const rankDifference =
      (rankOrder[a.subdivision_rank] ?? 99) -
      (rankOrder[b.subdivision_rank] ?? 99);

    if (rankDifference !== 0) return rankDifference;

    // Within the same TEU rank, active members come first.
    if (a.active !== b.active) return a.active ? -1 : 1;

    // Finally, sort by callsign.
    return String(a.callsign).localeCompare(
      String(b.callsign),
      undefined,
      {numeric: true, sensitivity: "base"}
    );
  });

  const activeCount = roster.filter(m => m.active).length;
  $("rosterCount").textContent =
    `${roster.length} Member${roster.length === 1 ? "" : "s"} • ${activeCount} Active`;

  $("rosterTable").innerHTML = roster.length ? roster.map(m => `
    <tr class="${m.active ? "" : "inactive-row"}">
      <td><strong>${escapeHtml(m.callsign)}</strong></td>
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.rank)}</td>
      <td>${escapeHtml(m.subdivision_rank)}</td>
      <td><span class="roster-status ${m.active ? "active" : "inactive"}">${m.active ? "ACTIVE" : "INACTIVE"}</span></td>
      ${currentSession ? `<td class="roster-actions">
        <button class="btn secondary small" onclick="editRosterMember('${m.id}')">Edit</button>
        <button class="btn danger small" onclick="removeRosterMember('${m.id}')">Remove</button>
      </td>` : ""}
    </tr>`).join("") :
    `<tr><td colspan="${currentSession ? 6 : 5}" class="empty">No TEU members are currently listed.</td></tr>`;
}
async function addRosterMember(event) {
  event.preventDefault();
  if (!currentSession) {
    showMessage("rosterMessage", "Administrator authentication required.", "error");
    return;
  }
  const payload = {
    callsign: $("rosterCallsign").value.trim(),
    name: $("rosterName").value.trim(),
    rank: $("rosterRank").value.trim(),
    subdivision_rank: $("rosterSubdivisionRank").value,
    active: $("rosterActive").checked
  };
  if (!payload.callsign || !payload.name || !payload.rank) {
    showMessage("rosterMessage", "Complete all member fields.", "error");
    return;
  }
  const {error} = await sb.from("teu_roster").insert(payload);
  if (error) {
    showMessage("rosterMessage", error.message, "error");
    return;
  }
  $("rosterForm").reset();
  $("rosterActive").checked = true;
  showMessage("rosterMessage", "TEU member added.", "success");
  await loadRoster();
}

async function editRosterMember(id) {
  if (!currentSession) return;
  const m = roster.find(x => String(x.id) === String(id));
  if (!m) return;

  const callsign = prompt("Callsign:", m.callsign); if (callsign === null) return;
  const name = prompt("Name:", m.name); if (name === null) return;
  const rank = prompt("Rank:", m.rank); if (rank === null) return;
  const sub = prompt("Subdivision Rank (TEU Traffic Member, FTO, Co Commander, Commander):", m.subdivision_rank);
  if (sub === null) return;
  const activeInput = prompt("Active? Enter YES or NO:", m.active ? "YES" : "NO");
  if (activeInput === null) return;

  const allowed = ["TEU Traffic Member","FTO","Co Commander","Commander"];
  if (!allowed.includes(sub.trim())) {
    showMessage("rosterMessage", "Invalid subdivision rank.", "error");
    return;
  }

  const {error} = await sb.from("teu_roster").update({
    callsign: callsign.trim(),
    name: name.trim(),
    rank: rank.trim(),
    subdivision_rank: sub.trim(),
    active: activeInput.trim().toLowerCase() === "yes"
  }).eq("id", id);

  if (error) {
    showMessage("rosterMessage", error.message, "error");
    return;
  }
  showMessage("rosterMessage", "TEU member updated.", "success");
  await loadRoster();
}

async function removeRosterMember(id) {
  if (!currentSession) return;
  const m = roster.find(x => String(x.id) === String(id));
  if (!m) return;
  if (!confirm(`Remove ${m.name} (${m.callsign}) from the TEU roster?\n\nThis does not delete their activity statistics.`)) return;

  const {error} = await sb.from("teu_roster").delete().eq("id", id);
  if (error) {
    showMessage("rosterMessage", error.message, "error");
    return;
  }
  showMessage("rosterMessage", "TEU member removed.", "success");
  await loadRoster();
}

window.editRosterMember = editRosterMember;
window.removeRosterMember = removeRosterMember;

async function resetMonth() {
  if (!sb) {
    showMessage("adminMessage", "Supabase is not configured.", "error");
    return;
  }

  const {data: sessionData} = await sb.auth.getSession();
  if (!sessionData.session) {
    showMessage("adminMessage", "Administrator authentication required.", "error");
    return;
  }

  if (!confirm(
    "Reset ALL activity for the current month?\n\nThis cannot be undone."
  )) return;

  const {data, error} = await sb.rpc(
    "reset_current_teu_month",
    {target_month: monthKey(currentMonth)}
  );

  if (error) {
    showMessage(
      "adminMessage",
      "The database rejected the reset. Make sure this Supabase user is listed in public.teu_admins.",
      "error"
    );
    return;
  }

  showMessage(
    "adminMessage",
    `Reset complete. ${data || 0} entries removed.`,
    "success"
  );

  await load();
}

setup();
