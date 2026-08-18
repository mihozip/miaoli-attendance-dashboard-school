const el = id => document.getElementById(id);

const DEPT_ORDER = [
  "校長室",
  "教務處",
  "學務處",
  "總務處",
  "輔導室",
  "附設幼兒園",
  "外聘教師"
];

function fmtDate() {
  return new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function fmtTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

function minuteNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function hhmm(minute) {
  if (minute == null || Number.isNaN(Number(minute))) return "—";
  const m = Number(minute);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function stampMinute(stamp) {
  const x = String(stamp || "");
  if (!/^\d{12}$/.test(x)) return null;
  return Number(x.slice(8, 10)) * 60 + Number(x.slice(10, 12));
}

function workEndMinute(cache) {
  return Number(cache?.displayWorkEndMinute ?? 16 * 60);
}

function personKey(obj) {
  return obj?.staffId != null ? `id:${obj.staffId}` : `name:${obj?.name || ""}`;
}

function deptRank(name) {
  const i = DEPT_ORDER.indexOf(String(name || ""));
  return i >= 0 ? i : 999;
}

function compareDept(a, b) {
  const ra = deptRank(a);
  const rb = deptRank(b);
  if (ra !== rb) return ra - rb;
  return String(a || "").localeCompare(String(b || ""), "zh-Hant");
}

function currentRowsForPerson(cache, person, nowMinute) {
  return (cache?.records || []).filter(r => {
    if (personKey(r) !== personKey(person)) return false;
    const start = stampMinute(r.start);
    const end = stampMinute(r.end);
    return start != null && end != null && nowMinute >= start && nowMinute < end;
  });
}

function absenceLabel(rows) {
  const types = [...new Set(
    (rows || [])
      .map(r => String(r.leaveType || "").trim())
      .filter(Boolean)
  )];

  if (!types.length) return "不在";

  // 同一時間若有多筆不同假別，完整列出，避免資訊被吃掉。
  return `${types.join("／")}不在`;
}

function endLabel(endMinute, cache) {
  if (endMinute == null) return "";
  if (Number(endMinute) >= workEndMinute(cache)) return "至下班";
  return `至 ${hhmm(endMinute)}`;
}

function intervalLeaveType(cache, person, startMinute, endMinute) {
  const matched = (cache?.records || []).filter(r => {
    if (personKey(r) !== personKey(person)) return false;
    const start = stampMinute(r.start);
    const end = stampMinute(r.end);
    if (start == null || end == null) return false;

    // 同一合併區間內，只要原始差勤紀錄與區間有重疊，就納入假別。
    return start < endMinute && end > startMinute;
  });

  const types = [...new Set(
    matched.map(r => String(r.leaveType || "").trim()).filter(Boolean)
  )];

  return types.join("／");
}

function normalizedIntervals(cache) {
  return (cache?.personIntervals || []).map(p => ({
    key: p.key || personKey(p),
    staffId: p.staffId,
    name: p.name || "",
    position: p.position || "",
    department: p.department || "其他",
    intervals: (p.intervals || [])
      .map(i => ({
        startMinute: Number(i.startMinute),
        endMinute: Number(i.endMinute)
      }))
      .filter(i => Number.isFinite(i.startMinute) && Number.isFinite(i.endMinute))
      .sort((a, b) => a.startMinute - b.startMinute)
  }));
}

function currentPeople(cache) {
  const now = minuteNow();
  const endOfWork = workEndMinute(cache);
  if (now >= endOfWork) return [];

  const result = [];
  for (const p of normalizedIntervals(cache)) {
    const interval = p.intervals.find(i => now >= i.startMinute && now < i.endMinute);
    if (!interval) continue;

    const rows = currentRowsForPerson(cache, p, now);
    result.push({
      ...p,
      startMinute: interval.startMinute,
      endMinute: interval.endMinute,
      statusLabel: absenceLabel(rows)
    });
  }
  return result;
}

function futureEvents(cache) {
  const now = minuteNow();
  const endOfWork = workEndMinute(cache);
  const events = [];

  for (const p of normalizedIntervals(cache)) {
    for (const i of p.intervals) {
      const leaveType = intervalLeaveType(cache, p, i.startMinute, i.endMinute);

      if (i.startMinute > now && i.startMinute < endOfWork) {
        events.push({
          type: "leave",
          minute: i.startMinute,
          name: p.name,
          department: p.department,
          position: p.position,
          leaveType
        });
      }
      if (i.endMinute > now && i.endMinute < endOfWork) {
        events.push({
          type: "return",
          minute: i.endMinute,
          name: p.name,
          department: p.department,
          position: p.position,
          leaveType
        });
      }
    }
  }

  events.sort((a, b) =>
    a.minute - b.minute ||
    (a.type === "return" ? -1 : 1) ||
    compareDept(a.department, b.department) ||
    a.name.localeCompare(b.name, "zh-Hant")
  );
  return events;
}

function endedPeople(cache) {
  const now = minuteNow();
  const result = [];

  for (const p of normalizedIntervals(cache)) {
    if (!p.intervals.length) continue;
    const hasCurrent = p.intervals.some(i => now >= i.startMinute && now < i.endMinute);
    const hasFuture = p.intervals.some(i => i.startMinute > now);
    const lastEnd = Math.max(...p.intervals.map(i => i.endMinute));

    if (!hasCurrent && !hasFuture && lastEnd <= now) {
      result.push(p);
    }
  }
  return result;
}

function groupByDepartment(items) {
  const map = new Map();
  for (const item of items) {
    const dept = item.department || "其他";
    if (!map.has(dept)) map.set(dept, []);
    map.get(dept).push(item);
  }
  return map;
}

function renderDepartmentCards(cache) {
  const current = currentPeople(cache);
  const future = futureEvents(cache);
  const currentMap = groupByDepartment(current);
  const futureMap = groupByDepartment(future);

  const departmentNames = [...new Set([
    ...currentMap.keys(),
    ...futureMap.keys()
  ])].sort(compareDept);

  const grid = el("departmentGrid");

  if (!departmentNames.length) {
    grid.innerHTML = `
      <div class="all-clear">
        <div class="all-clear-icon">✓</div>
        <div>
          <div class="all-clear-title">目前全校無人不在</div>
          <div class="all-clear-sub">今日接下來也沒有其他人力異動</div>
        </div>
      </div>
    `;
    return { current, future };
  }

  grid.innerHTML = departmentNames.map(dept => {
    const people = [...(currentMap.get(dept) || [])]
      .sort((a, b) => b.endMinute - a.endMinute || a.name.localeCompare(b.name, "zh-Hant"));
    const upcoming = [...(futureMap.get(dept) || [])]
      .sort((a, b) => a.minute - b.minute || a.name.localeCompare(b.name, "zh-Hant"));

    const currentHtml = people.length
      ? `
        <div class="dept-section-label">目前不在</div>
        <div class="people-list">
          ${people.map(p => `
            <div class="person-item">
              <div class="person-main">
                <div class="person-name">${p.name}</div>
                ${p.position ? `<div class="person-position">${p.position}</div>` : ""}
              </div>
              <div class="person-status">
                <div class="absence ${p.statusLabel.includes("出差") || p.statusLabel.includes("外出") ? "official" : ""}">
                  ${p.statusLabel}
                </div>
                <div class="until">${endLabel(p.endMinute, cache)}</div>
              </div>
            </div>
          `).join("")}
        </div>
      `
      : `
        <div class="present-now">目前無人不在</div>
      `;

    const futureHtml = upcoming.length
      ? `
        <div class="future-area">
          <div class="dept-section-label">接下來</div>
          <div class="future-list">
            ${upcoming.map(e => `
              <div class="future-item">
                <span class="future-time">${hhmm(e.minute)}</span>
                <span class="future-name">${e.name}</span>
                <span class="future-action">${
                  e.type === "return"
                    ? `${e.leaveType ? `${e.leaveType} ` : ""}返回`
                    : `${e.leaveType ? `${e.leaveType} ` : ""}離開`
                }</span>
              </div>
            `).join("")}
          </div>
        </div>
      `
      : "";

    return `
      <section class="dept-card ${people.length ? "has-current" : "future-only"}">
        <div class="dept-head">
          <div class="dept-name">${dept}</div>
          <div class="dept-count">
            ${people.length ? `${people.length} 人不在` : `稍後 ${upcoming.filter(x => x.type === "leave").length} 人異動`}
          </div>
        </div>
        <div class="dept-body">
          ${currentHtml}
          ${futureHtml}
        </div>
      </section>
    `;
  }).join("");

  return { current, future };
}

function renderEnded(cache) {
  const ended = endedPeople(cache);
  const box = el("endedBox");

  if (!ended.length) {
    box.style.display = "none";
    return;
  }

  const groups = groupByDepartment(ended);
  const depts = [...groups.keys()].sort(compareDept);

  box.style.display = "block";
  el("endedContent").innerHTML = depts.map(dept => {
    const names = groups.get(dept)
      .map(x => x.name)
      .sort((a, b) => a.localeCompare(b, "zh-Hant"));
    return `
      <span class="ended-group">
        <strong>${dept}</strong>：${names.join("、")}
      </span>
    `;
  }).join("");
}

function render(cache) {
  el("date").textContent = fmtDate();

  if (!cache) {
    el("status").textContent = "等待同步";
    el("departmentGrid").innerHTML =
      '<div class="all-clear"><div class="all-clear-title">尚無資料，請先由小助手同步。</div></div>';
    return;
  }

  const { current, future } = renderDepartmentCards(cache);
  renderEnded(cache);

  const affectedDepartments = new Set(current.map(p => p.department || "其他")).size;

  el("currentCount").textContent = String(current.length);
  el("departmentCount").textContent = String(affectedDepartments);
  el("todayCount").textContent = String(cache.peopleCount ?? 0);
  el("updated").textContent = `最後同步 ${fmtTime(cache.fetchedAt)}`;

  const next = future[0];
  el("nextChange").innerHTML = next
    ? `
      <span class="next-time">${hhmm(next.minute)}</span>
      <span class="next-dept">${next.department}</span>
      <span class="next-person">${next.name}</span>
      <span class="next-action">${
        next.type === "return"
          ? `${next.leaveType ? `${next.leaveType} ` : ""}返回`
          : `${next.leaveType ? `${next.leaveType} ` : ""}離開`
      }</span>
    `
    : '<span class="muted">今日無下一異動</span>';

  if (cache.ok && cache.complete !== false) {
    el("status").textContent = "● 同步正常";
    el("status").className = "status ok";
  } else if (cache.ok) {
    el("status").textContent = "● 資料校驗中";
    el("status").className = "status warn";
  } else {
    el("status").textContent = "● 暫停更新";
    el("status").className = "status bad";
  }

  const warning = el("warning");
  if (!cache.ok || cache.complete === false) {
    warning.style.display = "block";
    if (!cache.ok) {
      warning.textContent = `目前顯示最後一次成功同步資料（${fmtTime(cache.fetchedAt)}）。`;
    } else {
      const expected = cache.schoolSummary?.expectedTotal;
      const actual = cache.schoolSummary?.actualPeople;
      warning.textContent =
        `全校資料仍在校驗${expected != null ? `：已取得 ${actual ?? "?"} / ${expected} 人` : ""}。`;
    }
  } else {
    warning.style.display = "none";
  }
}

async function refresh() {
  const r = await chrome.runtime.sendMessage({ type: "GET_ATTENDANCE_STATE" });
  if (r?.ok) render(r.cache);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.attendanceCache) refresh();
});

refresh();
setInterval(refresh, 30000);
