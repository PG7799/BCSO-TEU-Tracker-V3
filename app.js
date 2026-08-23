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

const sb = SUPABASE_CONFIGURED && window.supabase
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

const $ = id => document.getElementById(id);
const categoryMap = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let events = [];
let roster = [];
let currentSession = null;

function normalizeTEUUsername(value = "") {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}
function internalTEUEmail(username) {
  return `${normalizeTEUUsername(username)}@teu.internal`;
}

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
  $("memberLoginBtn").addEventListener("click", openMemberLogin);
  $("closeMemberLogin").addEventListener("click", closeMemberLogin);
  $("memberLoginForm").addEventListener("submit", memberLogin);
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

  if (!window.supabase) {
    setStatus(false, "Supabase SDK failed");
    showMessage(
      "formMessage",
      "The Supabase JavaScript library did not load. Disable browser blocking/VPN extensions or use the included CDN fallback.",
      "error"
    );
    return;
  }

  setStatus(false, "Connecting…");

  Promise.race([
    load(),
    new Promise(resolve => setTimeout(resolve, 10000))
  ]).then(() => {
    if ($("connectionStatus").textContent === "Connecting…") {
      setStatus(false, "Connection timeout");
      showMessage(
        "formMessage",
        "Supabase did not respond within 10 seconds. Check the browser Network/Console panel and verify the Supabase project is active.",
        "error"
      );
    }
  });

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
  renderRoster();
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

  if (!currentSession) {
    showMessage("formMessage", "Sign in with your TEU member account before submitting activity.", "error");
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

  const rosterMember = roster.find(
    member =>
      member.auth_user_id &&
      String(member.auth_user_id) === String(currentSession.user.id) &&
      member.active
  );

  if (!rosterMember) {
    showMessage(
      "formMessage",
      "Your account is not linked to an active TEU roster member.",
      "error"
    );
    return;
  }

  const payload = {
    category: $("category").value,
    member: rosterMember.callsign,
    activity_date: date,
    month_start: monthKey(dateObject),
    notes: $("notes").value.trim() || null
  };

  const {error} = await sb.from("teu_events").insert(payload);

  if (error) {
    showMessage("formMessage", error.message, "error");
    return;
  }

  $("notes").value = "";
  showMessage("formMessage", "Activity recorded.", "success");
  await load();
}

function openMemberLogin() {
  $("memberLoginModal").classList.remove("hidden");
}

function closeMemberLogin() {
  $("memberLoginModal").classList.add("hidden");
}

async function memberLogin(event) {
  event.preventDefault();
  if (!sb) { showMessage("memberLoginMessage","Supabase is not configured.","error"); return; }

  const username = normalizeTEUUsername($("memberUsername").value);
  const password = $("memberPassword").value;
  if (!username || !password) {
    showMessage("memberLoginMessage","Enter your username and password.","error");
    return;
  }

  const {data,error}=await sb.auth.signInWithPassword({
    email: internalTEUEmail(username),
    password
  });

  if (error) {
    showMessage("memberLoginMessage","Invalid username or password.","error");
    return;
  }

  await loadRoster();
  const ownMember=roster.find(m =>
    m.auth_user_id &&
    String(m.auth_user_id)===String(data.user.id) &&
    m.active
  );

  if (!ownMember) {
    await sb.auth.signOut();
    showMessage("memberLoginMessage","This account is not linked to an active TEU roster member.","error");
    return;
  }

  closeMemberLogin();
  await updateAdminUI(data.session);
  $("memberPassword").value="";
  showMessage("formMessage",`Signed in as ${ownMember.callsign} — ${ownMember.name}.`,"success");
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

async function updateAdminUI(session) {
  currentSession = session || null;

  if (!session) {
    $("rosterAdminControls").classList.add("hidden");
    $("rosterActionsHeader").classList.add("hidden");
    $("loginForm").classList.remove("hidden");
    $("adminControls").classList.add("hidden");
    $("adminStatus").textContent = "";
    populateMemberSelect();
    renderRoster();
    return;
  }

  const email = String(session.user.email || "").toLowerCase();

  // High-level administrator emails configured for this TEU tracker.
  const highLevelEmails = [
    "lc0628339@gmail.com",
    "masterdevv27@gmail.com",
    "ksickler1203@gmail.com"
  ];

  let isAdmin = highLevelEmails.includes(email);

  // Also check the database admin table.
  if (!isAdmin && sb) {
    const { data: adminRow } = await sb
      .from("teu_admins")
      .select("user_id,security_level")
      .eq("user_id", session.user.id)
      .maybeSingle();

    isAdmin = !!adminRow;
  }

  $("rosterAdminControls").classList.toggle("hidden", !isAdmin);
  $("rosterActionsHeader").classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    $("loginForm").classList.add("hidden");
    $("adminControls").classList.remove("hidden");
    $("adminStatus").textContent = `Administrator: ${session.user.email}`;
  } else {
    $("loginForm").classList.remove("hidden");
    $("adminControls").classList.add("hidden");
  }

  populateMemberSelect();
  renderRoster();
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
  await updateAdminUI(null);
  $("email").value = "";
  $("password").value = "";
  $("memberUsername").value = "";
  $("memberPassword").value = "";
  await loadRoster();
  showMessage("adminMessage", "", "");
}


async function loadRoster() {
  if (!sb) return;

  // Load the public roster fields first so the roster still displays even
  // if the auth_user_id migration has not been run yet.
  let { data, error } = await sb
    .from("teu_roster")
    .select("id,callsign,name,rank,subdivision_rank,active,created_at,updated_at");

  if (error) {
    showMessage("rosterMessage", `Roster database error: ${error.message}`, "error");
    roster = [];
    renderRoster();
    return;
  }

  roster = data || [];

  // Once the auth_user_id column exists, load it separately. This keeps the
  // public roster functional during migration.
  const authResult = await sb
    .from("teu_roster")
    .select("id,auth_user_id");

  if (!authResult.error && authResult.data) {
    const authById = new Map(
      authResult.data.map(row => [String(row.id), row.auth_user_id])
    );
    roster = roster.map(member => ({
      ...member,
      auth_user_id: authById.get(String(member.id)) || null
    }));
  } else {
    roster = roster.map(member => ({
      ...member,
      auth_user_id: null
    }));
  }

  renderRoster();
}
function populateMemberSelect() {
  const select = $("member");
  if (!select) return;

  if (currentSession) {
    const ownMember = roster.find(
      member => member.auth_user_id &&
        String(member.auth_user_id) === String(currentSession.user.id) &&
        member.active
    );

    if (ownMember) {
      select.innerHTML =
        `<option value="${escapeHtml(ownMember.callsign)}">${escapeHtml(ownMember.callsign)} — ${escapeHtml(ownMember.name)}</option>`;
      select.value = ownMember.callsign;
      select.disabled = true;
      return;
    }
  }

  select.innerHTML = `<option value="">Sign in as a TEU member</option>`;
  select.disabled = true;
}
function getCurrentMonthReportCount(callsign) {
  return events.filter(event =>
    event.member &&
    String(event.member).toLowerCase() === String(callsign).toLowerCase() &&
    monthKey(new Date(`${event.activity_date}T00:00:00`)) === monthKey(currentMonth)
  ).length;
}

function renderRoster() {
  const rankOrder = {
    "Commander": 0,
    "Co Commander": 1,
    "FTO": 2,
    "TEU Traffic Member": 3
  };

  roster.sort((a, b) => {
    const rankDifference =
      (rankOrder[a.subdivision_rank] ?? 99) -
      (rankOrder[b.subdivision_rank] ?? 99);

    if (rankDifference !== 0) return rankDifference;

    if (a.active !== b.active) return a.active ? -1 : 1;

    return String(a.callsign).localeCompare(
      String(b.callsign),
      undefined,
      {numeric: true, sensitivity: "base"}
    );
  });

  populateMemberSelect();

  const activeCount = roster.filter(m => m.active).length;
  $("rosterCount").textContent =
    `${roster.length} Member${roster.length === 1 ? "" : "s"} • ${activeCount} Active`;

  $("rosterTable").innerHTML = roster.length ? roster.map(m => {
    const monthlyReports = getCurrentMonthReportCount(m.callsign);

    return `
      <tr class="${m.active ? "" : "inactive-row"}">
        <td><strong>${escapeHtml(m.callsign)}</strong></td>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.rank)}</td>
        <td>${escapeHtml(m.subdivision_rank)}</td>
        <td>
          <span class="monthly-reports">${monthlyReports}</span>
        </td>
        <td>
          <span class="roster-status ${m.active ? "active" : "inactive"}">
            ${m.active ? "ACTIVE" : "INACTIVE"}
          </span>
        </td>
        ${currentSession ? `<td class="roster-actions">
          <button class="btn secondary small" onclick="editRosterMember('${m.id}')">Edit</button>
          <button class="btn danger small" onclick="removeRosterMember('${m.id}')">Remove</button>
        </td>` : ""}
      </tr>`;
  }).join("") :
  `<tr><td colspan="${currentSession ? 7 : 6}" class="empty">No TEU members are currently listed.</td></tr>`;
}
async function addRosterMember(event) {
  event.preventDefault();
  if (!currentSession) {
    showMessage("rosterMessage","Administrator authentication required.","error");
    return;
  }

  const username=normalizeTEUUsername($("rosterUsername").value);
  const password=$("rosterPassword").value;

  if (username.length<3) {
    showMessage("rosterMessage","Username must be at least 3 characters.","error"); return;
  }
  if (password.length<8) {
    showMessage("rosterMessage","Password must be at least 8 characters.","error"); return;
  }

  const payload={
    action:"create",
    username,
    password,
    callsign:$("rosterCallsign").value.trim(),
    name:$("rosterName").value.trim(),
    rank:$("rosterRank").value.trim(),
    subdivision_rank:$("rosterSubdivisionRank").value,
    active:$("rosterActive").checked
  };

  if (!payload.callsign || !payload.name || !payload.rank) {
    showMessage("rosterMessage","Complete all member fields.","error"); return;
  }

  const {data,error}=await sb.functions.invoke("manage-teu-member",{body:payload});
  if (error || data?.error) {
    showMessage("rosterMessage",data?.error || error?.message || "Could not create TEU account.","error");
    return;
  }

  $("rosterForm").reset();
  $("rosterActive").checked=true;
  showMessage("rosterMessage",`Account "${username}" created and linked to ${payload.callsign}.`,"success");
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

  const member = roster.find(x => String(x.id) === String(id));
  if (!member) return;

  if (!confirm(
    `Remove ${member.name} (${member.callsign}) from the TEU roster?\n\nTheir login will also be disabled. Historical activity reports will remain.`
  )) return;

  const { data, error } = await sb.functions.invoke(
    "manage-teu-member",
    { body: { action: "remove", roster_id: id } }
  );

  if (error || data?.error) {
    showMessage(
      "rosterMessage",
      data?.error || error?.message || "Could not remove TEU member.",
      "error"
    );
    return;
  }

  showMessage("rosterMessage", "TEU member removed and login disabled.", "success");
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
