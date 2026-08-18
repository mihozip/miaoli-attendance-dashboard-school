const BASE = "https://mswebitr.mlc.edu.tw";
const HOME_URL = `${BASE}/module/staff-attendance/module/staff-attendance/a4/home`;
const API_URL = `${BASE}/web-leave_agent/service/oauth_data/dashboard/select`;

const SETTINGS_KEY = "attendanceSettings";
const CACHE_KEY = "attendanceCache";
const LOG_KEY = "attendanceSyncLog";
const NOTIFY_KEY = "attendanceLoginReminder";
const TOKEN_KEY = "attendanceBearer";
const TOKEN_SEEN_KEY = "attendanceBearerSeenAt";
const SCHOOL_DEPT_MAP_KEY = "attendanceSchoolDeptMap";
const SCHOOL_UNITS_KEY = "attendanceSchoolUnits";

const DEFAULT_SETTINGS = {
  // 全校版不再假設 dept_id="" 代表所有處室。
  // 實際作法：依首頁「關注處室」統計，自動查詢各處室並合併。
  deptId: "",
  deptName: "全校",
  intervalMinutes: 5,
  workStartMinute: 6 * 60 + 30,
  workEndMinute: 18 * 60 + 30,
  displayWorkEndMinute: 16 * 60,
  autoSync: true
};

function pad2(v) { return String(v).padStart(2, "0"); }
function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function apiDate(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
function minuteOfDay(d = new Date()) { return d.getHours() * 60 + d.getMinutes(); }
function isWeekday(d = new Date()) { const x = d.getDay(); return x >= 1 && x <= 5; }
function inWorkWindow(d, settings) {
  const m = minuteOfDay(d);
  return isWeekday(d) && m >= settings.workStartMinute && m <= settings.workEndMinute;
}
function isoNow() { return new Date().toISOString(); }

async function getSettings() {
  const o = await chrome.storage.local.get(SETTINGS_KEY);
  // 此分支固定為全校版，忽略既有處室代碼。
  return { ...DEFAULT_SETTINGS, ...(o[SETTINGS_KEY] || {}), deptId: "", deptName: "全校" };
}
async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  await ensureAlarm();
  return next;
}
async function getBearer() {
  const o = await chrome.storage.session.get([TOKEN_KEY, TOKEN_SEEN_KEY]);
  return { token: o[TOKEN_KEY] || null, seenAt: o[TOKEN_SEEN_KEY] || null };
}
async function setBearer(token) {
  if (!token) return;
  const normalized = String(token).replace(/^Bearer\s+/i, "").trim();
  if (!normalized) return;
  await chrome.storage.session.set({
    [TOKEN_KEY]: normalized,
    [TOKEN_SEEN_KEY]: isoNow()
  });
}
async function clearBearer() {
  await chrome.storage.session.remove([TOKEN_KEY, TOKEN_SEEN_KEY]);
}

function authHeaderFrom(details) {
  const hs = details.requestHeaders || [];
  const h = hs.find(x => String(x.name || "").toLowerCase() === "authorization");
  const v = h?.value || "";
  const m = v.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

// 只觀察差勤網站自己送出的 Authorization，不保存帳密，也不攔截／修改 request。
try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    details => {
      const token = authHeaderFrom(details);
      if (token) setBearer(token).catch(() => {});
    },
    { urls: ["https://mswebitr.mlc.edu.tw/*"] },
    ["requestHeaders", "extraHeaders"]
  );
} catch (_) {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    details => {
      const token = authHeaderFrom(details);
      if (token) setBearer(token).catch(() => {});
    },
    { urls: ["https://mswebitr.mlc.edu.tw/*"] },
    ["requestHeaders"]
  );
}

function buildRequestBody(date, deptId) {
  return {
    format: "json",
    name: "function_name",
    para: {
      method: "deptreqleaves",
      date,
      dept_id: deptId,
      angular: "1"
    },
    reserved: {},
    type: "request",
    version: "1.0",
    view_name: ""
  };
}


async function getSchoolDeptMap() {
  const o = await chrome.storage.local.get(SCHOOL_DEPT_MAP_KEY);
  return o[SCHOOL_DEPT_MAP_KEY] || {};
}
async function saveSchoolDeptMap(map) {
  await chrome.storage.local.set({ [SCHOOL_DEPT_MAP_KEY]: map || {} });
}
async function getSchoolUnits() {
  const o = await chrome.storage.local.get(SCHOOL_UNITS_KEY);
  return Array.isArray(o[SCHOOL_UNITS_KEY]) ? o[SCHOOL_UNITS_KEY] : [];
}
async function saveSchoolUnits(units) {
  const clean = (Array.isArray(units) ? units : [])
    .map(x => ({ id: String(x?.id ?? "").trim(), name: String(x?.name ?? "").trim() }))
    .filter(x => x.id && x.name && !/請選擇處室/.test(x.name));
  const seen = new Map(clean.map(x => [x.id, x]));
  const out = [...seen.values()];
  if (out.length) {
    await chrome.storage.local.set({ [SCHOOL_UNITS_KEY]: out });
    await saveSchoolDeptMap(Object.fromEntries(out.map(x => [x.id, x.name])));
  }
  return out;
}

async function attendanceUnitsFromTabs() {
  const tabs = await attendanceTabs();
  let best = [];
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "DISCOVER_ATTENDANCE_UNITS" });
      if (r?.ok && Array.isArray(r.units) && r.units.length > best.length) best = r.units;
    } catch (_) {}
  }
  if (best.length) return saveSchoolUnits(best);
  return getSchoolUnits();
}

async function departmentSummaryFromTabs() {
  const tabs = await attendanceTabs();
  let best = { ok: false, departments: {}, total: null, units: [] };
  let bestScore = -1;
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "DISCOVER_DEPARTMENT_SUMMARY" });
      if (!r?.ok) continue;
      const deptCount = Object.keys(r.departments || {}).length;
      const unitCount = Array.isArray(r.units) ? r.units.length : 0;
      // 優先選「首頁處室統計」最多的頁面，其次才看下拉單位數。
      const score = deptCount * 100 + unitCount;
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    } catch (_) {}
  }
  return best;
}

function rawRowsFromPayload(payload) {
  return Array.isArray(payload?.result?.extra?.dept_reqleaves)
    ? payload.result.extra.dept_reqleaves
    : [];
}
function uniqueRawRows(rows) {
  const seen = new Map();
  for (const row of rows || []) {
    const key = row?.id != null
      ? `id:${row.id}`
      : `${row?.teaid ?? row?.teaname ?? ""}|${row?.req_start ?? ""}|${row?.req_end ?? ""}|${row?.reqclassify_no ?? ""}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}
function uniqueRawPeopleCount(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    keys.add(row?.teaid != null ? `id:${row.teaid}` : `name:${row?.teaname || ""}`);
  }
  keys.delete("name:");
  return keys.size;
}
function departmentNamesFromRows(rows) {
  return [...new Set((rows || []).map(r => r?.dept_name).filter(Boolean))];
}

async function fetchOneDeptViaPage(token, deptId) {
  const tabs = await attendanceTabs();
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, {
        type: "ATTENDANCE_PAGE_FETCH",
        apiUrl: API_URL,
        token,
        body: buildRequestBody(apiDate(), deptId)
      });
      if (r?.ok && r?.data?.status === "success") {
        return { ok: true, sessionAlive: true, data: r.data, transport: "page", deptId };
      }
      if (r?.sessionAlive === false) {
        return { ok: false, sessionAlive: false, reason: "auth", status: r.status || 0, deptId };
      }
    } catch (_) {}
  }
  return null;
}

async function fetchOneDeptViaBackground(token, deptId) {
  const r = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
    redirect: "follow",
    cache: "no-store",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(buildRequestBody(apiDate(), deptId))
  });
  const text = await r.text();
  if (r.status === 401 || r.status === 403 || looksLikeLogin(text, r.url)) {
    return { ok: false, sessionAlive: false, status: r.status, reason: "auth", deptId };
  }
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok || !data || data.status !== "success") {
    return { ok: false, sessionAlive: r.ok, status: r.status, reason: "api", deptId };
  }
  return { ok: true, sessionAlive: true, data, transport: "background", deptId };
}

async function fetchOneDept(token, deptId) {
  let r = await fetchOneDeptViaPage(token, deptId);
  if (!r) {
    try { r = await fetchOneDeptViaBackground(token, deptId); }
    catch (e) { r = { ok: false, sessionAlive: null, reason: "network", error: String(e), deptId }; }
  }
  return r;
}


async function probeDepartmentIds(token, wantedNames = [], existingMap = {}) {
  const wanted = new Set((wantedNames || []).filter(Boolean));
  const map = { ...(existingMap || {}) };
  const rows = [];
  const foundNames = new Set(Object.values(map));

  // 苗栗差勤目前已知處室代碼為兩位數字（例如總務處 04、附設幼兒園 15）。
  // 僅在無法直接從下拉選單取得代碼時才做一次低頻 discovery，結果會快取。
  for (let n = 1; n <= 30; n++) {
    const missing = [...wanted].filter(name => !foundNames.has(name));
    if (wanted.size && missing.length === 0) break;

    const deptId = String(n).padStart(2, "0");
    if (map[deptId]) continue;

    const r = await fetchOneDept(token, deptId);
    if (r?.sessionAlive === false) return { ok: false, sessionAlive: false, reason: "auth", status: r.status || 0 };
    if (!r?.ok) continue;

    const deptRows = rawRowsFromPayload(r.data);
    if (!deptRows.length) continue;

    const names = departmentNamesFromRows(deptRows);
    const name = names[0] || "";
    if (name) {
      map[deptId] = name;
      foundNames.add(name);
      rows.push(...deptRows);
    }
  }

  await saveSchoolDeptMap(map);
  const units = Object.entries(map).map(([id, name]) => ({ id, name }));
  if (units.length) await saveSchoolUnits(units);
  return { ok: true, map, units, rows: uniqueRawRows(rows) };
}

async function fetchWholeSchool(token) {
  const summary = await departmentSummaryFromTabs();
  const expectedByName = summary?.departments || {};
  const expectedNames = Object.entries(expectedByName)
    .filter(([, count]) => Number(count) > 0)
    .map(([name]) => name);
  const expectedTotal = summary?.total != null && Number.isFinite(Number(summary.total))
    ? Number(summary.total)
    : null;

  // 1) 最優先：直接讀差勤頁原生「處室」下拉選單。
  let units = Array.isArray(summary?.units) && summary.units.length
    ? await saveSchoolUnits(summary.units)
    : await attendanceUnitsFromTabs();

  // 2) 若目前頁面沒有那個下拉選單，使用先前成功快取的 mapping。
  let deptMap = await getSchoolDeptMap();
  if (!units.length && Object.keys(deptMap).length) {
    units = Object.entries(deptMap).map(([id, name]) => ({ id, name }));
  }

  // 3) 首頁已知哪些單位今日有人異動，但 mapping 不完整時，自動低頻探測 dept_id。
  const mappedNames = new Set(units.map(u => u.name));
  const missingPositiveNames = expectedNames.filter(name => !mappedNames.has(name));
  let probeRows = [];
  if (missingPositiveNames.length || (!units.length && expectedTotal !== 0)) {
    const probed = await probeDepartmentIds(token, expectedNames, deptMap);
    if (probed?.sessionAlive === false) return probed;
    deptMap = probed.map || deptMap;
    units = probed.units?.length ? probed.units : units;
    probeRows = probed.rows || [];
  }

  // 若首頁明確顯示今天全校 0 人異動，0 就是有效結果，不需要任何 dept_id。
  if (!units.length && expectedTotal === 0) {
    return {
      ok: true,
      sessionAlive: true,
      data: {
        format: "json",
        message: "whole-school zero attendance changes confirmed by dashboard summary",
        name: "notused",
        result: { extra: { dept_reqleaves: [] } },
        status: "success",
        type: "response",
        version: "1.0"
      },
      transport: "school-summary-zero",
      schoolSummary: {
        expectedTotal: 0,
        actualPeople: 0,
        complete: true,
        departments: expectedByName,
        units: [],
        queriedUnits: [],
        deptMap: {}
      }
    };
  }

  if (!units.length) {
    return {
      ok: false,
      sessionAlive: true,
      reason: "attendance_units_not_discovered",
      help: "未能取得差勤查詢單位代碼。請保持差勤首頁開啟後再按立即同步。"
    };
  }

  // 首頁能讀到今日各單位人數時，只查有異動的單位；
  // 若首頁 summary 暫時不存在，則查目前已知的全部單位。
  const targetUnits = expectedNames.length
    ? units.filter(u => expectedNames.includes(u.name))
    : units;

  let allRows = [...probeRows];
  const queriedUnits = [];
  const alreadyNames = new Set(departmentNamesFromRows(allRows));

  for (const unit of targetUnits) {
    // probe 階段已經取得該處室今日資料時，不必再打一次。
    if (alreadyNames.has(unit.name)) {
      queriedUnits.push(unit);
      continue;
    }
    const r = await fetchOneDept(token, unit.id);
    if (r?.sessionAlive === false) return r;
    if (!r?.ok) continue;
    queriedUnits.push(unit);
    const rows = rawRowsFromPayload(r.data);
    for (const row of rows) {
      if (!row.dept_name) row.dept_name = unit.name;
    }
    allRows.push(...rows);
  }

  allRows = uniqueRawRows(allRows);
  const actualPeople = uniqueRawPeopleCount(allRows);
  const complete = expectedTotal == null || expectedTotal === actualPeople;

  const synthetic = {
    format: "json",
    message: "whole-school aggregated from attendance units",
    name: "notused",
    result: { extra: { dept_reqleaves: allRows } },
    status: "success",
    type: "response",
    version: "1.0"
  };

  return {
    ok: true,
    sessionAlive: true,
    data: synthetic,
    transport: "school-unit-aggregate",
    schoolSummary: {
      expectedTotal,
      actualPeople,
      complete,
      departments: expectedByName,
      units,
      queriedUnits,
      deptMap: Object.fromEntries(units.map(x => [x.id, x.name]))
    }
  };
}

function looksLikeLogin(text, url = "") {
  const t = String(text || "");
  const u = String(url || "");
  if (/mlc\.sso\.edu\.tw|auth-server-login|user-consensus-page/i.test(u)) return true;
  if (/Auth_Request_|captchatext|container:btnLogin|登入系統/i.test(t)) return true;
  return false;
}

function sanitizeRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : []).map(row => ({
    id: row.id ?? null,
    staffId: row.teaid ?? null,
    name: row.teaname || "",
    position: row.posname || "",
    department: row.dept_name || "",
    leaveType: row.reqclassify_name || "",
    start: row.req_start || "",
    end: row.req_end || "",
    totalDay: Number(row.req_total_day || 0),
    totalHour: Number(row.req_total_hour || 0),
    totalMin: Number(row.req_total_min || 0),
    agentName: row.req_alt_name || "",
    status: row.catagory_desc || "",
    requestStatus: row.req_status || ""
  }));
}

function stampToMinute(stamp) {
  const s = String(stamp || "");
  if (!/^\d{12}$/.test(s)) return null;
  return Number(s.slice(8, 10)) * 60 + Number(s.slice(10, 12));
}
function personKey(r) {
  return r.staffId != null ? `id:${r.staffId}` : `name:${r.name}`;
}
function uniquePeople(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = personKey(r);
    if (!seen.has(key)) seen.set(key, {
      staffId: r.staffId,
      name: r.name,
      position: r.position,
      department: r.department || ""
    });
  }
  return [...seen.values()];
}

// 將同一人重疊或首尾相接的差勤時段合併。
// 例如 08:00–10:00 + 10:00–12:00 應視為 08:00–12:00 持續不在，
// 不能在 10:00 產生「返回」後又立即「離開」的假異動。
function buildPersonIntervals(rows) {
  const grouped = new Map();
  for (const r of rows) {
    const startMinute = stampToMinute(r.start);
    const endMinute = stampToMinute(r.end);
    if (startMinute == null || endMinute == null || endMinute <= startMinute) continue;
    const key = personKey(r);
    if (!grouped.has(key)) grouped.set(key, {
      key,
      staffId: r.staffId,
      name: r.name,
      position: r.position,
      department: r.department || "",
      intervals: []
    });
    grouped.get(key).intervals.push({
      startMinute, endMinute, rows: [r]
    });
  }

  const people = [];
  for (const person of grouped.values()) {
    const sorted = person.intervals.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    const merged = [];
    for (const item of sorted) {
      const last = merged[merged.length - 1];
      if (last && item.startMinute <= last.endMinute) {
        last.endMinute = Math.max(last.endMinute, item.endMinute);
        last.rows.push(...item.rows);
      } else {
        merged.push({ startMinute: item.startMinute, endMinute: item.endMinute, rows: [...item.rows] });
      }
    }
    people.push({ ...person, intervals: merged });
  }
  return people;
}

function currentPeopleFromIntervals(personIntervals, now = new Date(), displayWorkEndMinute = 16 * 60) {
  const m = minuteOfDay(now);
  const out = [];
  // 16:00 起視為下班，不再計算「目前不在」狀態。
  if (m >= displayWorkEndMinute) return out;
  for (const person of personIntervals) {
    const interval = person.intervals.find(x => m >= x.startMinute && m < x.endMinute);
    if (interval) out.push({
      staffId: person.staffId,
      name: person.name,
      position: person.position,
      department: person.department || "",
      startMinute: interval.startMinute,
      endMinute: interval.endMinute,
      rows: interval.rows
    });
  }
  return out;
}

function futureChanges(personIntervals, now = new Date(), displayWorkEndMinute = 16 * 60) {
  const m = minuteOfDay(now);
  const events = [];
  for (const person of personIntervals) {
    for (const interval of person.intervals) {
      if (interval.startMinute > m && interval.startMinute < displayWorkEndMinute) {
        events.push({
          minute: interval.startMinute, type: "leave",
          staffId: person.staffId, name: person.name, position: person.position,
          department: person.department || ""
        });
      }
      // 差勤結束時間等於或晚於下班時間，不產生「返回」事件。
      if (interval.endMinute > m && interval.endMinute < displayWorkEndMinute) {
        events.push({
          minute: interval.endMinute, type: "return",
          staffId: person.staffId, name: person.name, position: person.position,
          department: person.department || ""
        });
      }
    }
  }
  events.sort((a, b) => a.minute - b.minute || (a.type === "return" ? -1 : 1));
  return events;
}
function toHHMM(minute) {
  if (minute == null) return null;
  return `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
}

function deriveDynamicState(cache, settings, now = new Date()) {
  if (!cache) return cache;
  const displayWorkEndMinute = Number(settings?.displayWorkEndMinute ?? cache.displayWorkEndMinute ?? 16 * 60);
  const personIntervals = (cache.personIntervals || []).map(p => ({
    key: p.key,
    staffId: p.staffId,
    name: p.name,
    position: p.position,
    department: p.department || "",
    intervals: (p.intervals || []).map(i => ({
      startMinute: Number(i.startMinute),
      endMinute: Number(i.endMinute),
      rows: []
    }))
  }));
  if (!personIntervals.length) return { ...cache, displayWorkEndMinute };

  const currentPeople = currentPeopleFromIntervals(personIntervals, now, displayWorkEndMinute);
  const changes = futureChanges(personIntervals, now, displayWorkEndMinute);
  const next = changes[0] || null;
  return {
    ...cache,
    displayWorkEndMinute,
    currentPeople: currentPeople.map(p => ({
      staffId: p.staffId,
      name: p.name,
      position: p.position,
      department: p.department || "",
      startMinute: p.startMinute,
      endMinute: p.endMinute
    })),
    currentPeopleCount: currentPeople.length,
    nextChange: next ? { ...next, time: toHHMM(next.minute) } : null,
    nextChanges: changes.slice(0, 6).map(x => ({ ...x, time: toHHMM(x.minute) }))
  };
}

async function logSync(entry) {
  const key = localDateKey();
  const o = await chrome.storage.local.get(LOG_KEY);
  const log = o[LOG_KEY] || {};
  const day = log[key] || [];
  day.push({ at: isoNow(), ...entry });
  log[key] = day.slice(-100);
  for (const k of Object.keys(log).sort().slice(0, -14)) delete log[k];
  await chrome.storage.local.set({ [LOG_KEY]: log });
}

async function parseAndStoreResponse(payload, meta = {}) {
  const rows = sanitizeRows(payload?.result?.extra?.dept_reqleaves || []);
  const people = uniquePeople(rows);
  const personIntervals = buildPersonIntervals(rows);
  const settings = await getSettings();
  const currentPeople = currentPeopleFromIntervals(personIntervals, new Date(), settings.displayWorkEndMinute);
  const changes = futureChanges(personIntervals, new Date(), settings.displayWorkEndMinute);
  const next = changes[0] || null;
  const cache = {
    ok: true,
    source: "mlc-attendance",
    department: "全校",
    deptId: "",
    date: localDateKey(),
    fetchedAt: isoNow(),
    records: rows,
    recordCount: rows.length,
    people,
    peopleCount: people.length,
    personIntervals: personIntervals.map(p => ({
      key: p.key, staffId: p.staffId, name: p.name, position: p.position, department: p.department || "",
      intervals: p.intervals.map(i => ({ startMinute: i.startMinute, endMinute: i.endMinute }))
    })),
    currentPeople: currentPeople.map(p => ({
      staffId: p.staffId, name: p.name, position: p.position, department: p.department || "",
      startMinute: p.startMinute, endMinute: p.endMinute
    })),
    currentPeopleCount: currentPeople.length,
    displayWorkEndMinute: settings.displayWorkEndMinute,
    nextChange: next ? { ...next, time: toHHMM(next.minute) } : null,
    nextChanges: changes.slice(0, 6).map(x => ({ ...x, time: toHHMM(x.minute) })),
    transport: meta.transport || "background",
    schoolSummary: meta.schoolSummary || null,
    complete: meta.schoolSummary ? meta.schoolSummary.complete !== false : true
  };
  await chrome.storage.local.set({ [CACHE_KEY]: cache, [NOTIFY_KEY]: false });
  await logSync({ ok: true, peopleCount: people.length, currentPeopleCount: currentPeople.length, transport: cache.transport });
  return cache;
}

async function fetchViaBackground(token, settings) {
  const r = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
    redirect: "follow",
    cache: "no-store",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(buildRequestBody(apiDate(), ""))
  });
  const text = await r.text();
  if (r.status === 401 || r.status === 403 || looksLikeLogin(text, r.url)) {
    return { ok: false, sessionAlive: false, status: r.status, reason: "auth" };
  }
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok || !data || data.status !== "success") {
    return { ok: false, sessionAlive: r.ok, status: r.status, reason: "api", text: text.slice(0, 300) };
  }
  return { ok: true, sessionAlive: true, data, transport: "background" };
}

async function attendanceTabs() {
  return chrome.tabs.query({ url: "https://mswebitr.mlc.edu.tw/*" });
}
async function discoverBearerFromTabs() {
  const tabs = await attendanceTabs();
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "DISCOVER_ATTENDANCE_TOKEN" });
      if (r?.token) {
        await setBearer(r.token);
        return r.token;
      }
    } catch (_) {}
  }
  return null;
}
async function fetchViaPage(token, settings) {
  const tabs = await attendanceTabs();
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, {
        type: "ATTENDANCE_PAGE_FETCH",
        apiUrl: API_URL,
        token,
        body: buildRequestBody(apiDate(), "")
      });
      if (r?.ok && r?.data?.status === "success") return { ok: true, sessionAlive: true, data: r.data, transport: "page" };
      if (r?.sessionAlive === false) return { ok: false, sessionAlive: false, reason: "auth", status: r.status || 0 };
    } catch (_) {}
  }
  return null;
}

async function markStale(reason, status = null, help = null) {
  const o = await chrome.storage.local.get(CACHE_KEY);
  const old = o[CACHE_KEY] || {};
  const cache = {
    ...old,
    ok: false,
    stale: true,
    lastAttemptAt: isoNow(),
    error: reason,
    errorHelp: help || null,
    httpStatus: status
  };
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
  await logSync({ ok: false, reason, status });
  return cache;
}

async function notifyLoginNeeded() {
  const o = await chrome.storage.local.get(NOTIFY_KEY);
  if (o[NOTIFY_KEY]) return;
  await chrome.notifications.create("attendance-login-needed", {
    type: "basic",
    iconUrl: "icon128.png",
    title: "差勤同步需要重新登入",
    message: "請重新登入苗栗差勤系統；登入完成後小助手會自動恢復同步。",
    priority: 1
  });
  await chrome.storage.local.set({ [NOTIFY_KEY]: true });
}

async function syncAttendance({ manual = false } = {}) {
  const settings = await getSettings();
  if (!manual && (!settings.autoSync || !inWorkWindow(new Date(), settings))) {
    return { ok: false, skipped: true, reason: "outside_window" };
  }

  let { token } = await getBearer();
  if (!token) token = await discoverBearerFromTabs();
  if (!token) {
    await markStale("missing_token");
    if (manual) await notifyLoginNeeded();
    return { ok: false, sessionAlive: false, reason: "missing_token" };
  }

  // 全校版：直接讀取差勤頁「處室」select options，取得真實 dept_id，再逐單位彙整。
  let r;
  try { r = await fetchWholeSchool(token); }
  catch (e) { r = { ok: false, sessionAlive: null, reason: "network", error: String(e) }; }

  if (r.ok) {
    const cache = await parseAndStoreResponse(r.data, {
      transport: r.transport,
      schoolSummary: r.schoolSummary
    });
    if (r.schoolSummary && r.schoolSummary.complete === false) {
      cache.stale = true;
      cache.warning = "partial_school_data";
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
      await logSync({
        ok: true,
        warning: "partial_school_data",
        expectedTotal: r.schoolSummary.expectedTotal,
        actualPeople: r.schoolSummary.actualPeople
      });
    }
    return { ok: true, cache };
  }

  if (r.sessionAlive === false || r.reason === "auth") {
    await clearBearer();
    await markStale("login_required", r.status || null);
    await notifyLoginNeeded();
    return { ok: false, sessionAlive: false, reason: "login_required" };
  }

  await markStale(r.reason || "sync_failed", r.status || null, r.help || null);
  return { ok: false, sessionAlive: r.sessionAlive, reason: r.reason || "sync_failed", help: r.help || null };
}

async function ensureAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear("attendance-sync");
  chrome.alarms.create("attendance-sync", { periodInMinutes: Math.max(1, Number(settings.intervalMinutes) || 5) });
}

chrome.runtime.onInstalled.addListener(async details => {
  const current = await chrome.storage.local.get(SETTINGS_KEY);
  if (!current[SETTINGS_KEY]) await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });

  // V0.5.3–V0.5.5 可能留下「全校 0 人」的無效快取或不完整 mapping。
  // 更新到 V0.5.6 時清掉一次，避免舊錯誤資料繼續被 Dashboard 當成最後成功資料。
  if (details?.reason === "update" && details?.previousVersion && /^0\.5\.[345]$/.test(details.previousVersion)) {
    await chrome.storage.local.remove([CACHE_KEY, SCHOOL_UNITS_KEY, SCHOOL_DEPT_MAP_KEY]);
  }
  await ensureAlarm();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  syncAttendance().catch(() => {});
});
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === "attendance-sync") syncAttendance().catch(() => {});
});
chrome.notifications.onClicked.addListener(id => {
  if (id === "attendance-login-needed") chrome.tabs.create({ url: HOME_URL });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "ATTENDANCE_PAGE_VISIT") {
      if (msg.token) await setBearer(msg.token);
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "ATTENDANCE_TOKEN_CANDIDATE") {
      if (msg.token) await setBearer(msg.token);
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "SYNC_ATTENDANCE") {
      sendResponse(await syncAttendance({ manual: true }));
      return;
    }
    if (msg?.type === "GET_ATTENDANCE_STATE") {
      const [cacheObj, settings, bearer] = await Promise.all([
        chrome.storage.local.get(CACHE_KEY),
        getSettings(),
        getBearer()
      ]);
      const cache = deriveDynamicState(cacheObj[CACHE_KEY] || null, settings, new Date());
      sendResponse({ ok: true, cache, settings, tokenSeenAt: bearer.seenAt });
      return;
    }
    if (msg?.type === "SAVE_ATTENDANCE_SETTINGS") {
      sendResponse({ ok: true, settings: await saveSettings(msg.settings || {}) });
      return;
    }
    if (msg?.type === "OPEN_ATTENDANCE") {
      await chrome.tabs.create({ url: HOME_URL });
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "OPEN_DASHBOARD") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      sendResponse({ ok: true });
      return;
    }
  })().catch(e => sendResponse({ ok: false, error: String(e) }));
  return true;
});
