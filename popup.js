const el = id => document.getElementById(id);
function fmtTs(s) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtStamp(s) {
  const x = String(s || "");
  if (!/^\d{12}$/.test(x)) return "—";
  return `${x.slice(8, 10)}:${x.slice(10, 12)}`;
}
function render(cache) {
  if (!cache) {
    el("session").textContent = "等待第一次同步";
    el("session").className = "value warn";
    return;
  }
  el("currentCount").textContent = String(cache.currentPeopleCount ?? "—");
  el("todayCount").textContent = String(cache.peopleCount ?? "—");
  el("recordCount").textContent = String(cache.records?.length ?? "—");
  el("updated").textContent = fmtTs(cache.fetchedAt);
  if (cache.ok && cache.complete !== false) {
    el("session").textContent = "✅ 正常";
    el("session").className = "value ok";
  } else if (cache.ok) {
    const expected = cache.schoolSummary?.expectedTotal;
    const actual = cache.schoolSummary?.actualPeople;
    el("session").textContent = `⚠️ 資料校驗中${expected != null ? ` ${actual ?? "?"}/${expected}` : ""}`;
    el("session").className = "value warn";
  } else {
    if (cache.error === "login_required" || cache.error === "missing_token") {
      el("session").textContent = "🔐 需重新登入";
    } else if (cache.error === "attendance_units_not_discovered") {
      el("session").textContent = "⚠️ 正在重新辨識全校單位";
    } else {
      el("session").textContent = `⚠️ 暫停更新${cache.error ? `：${cache.error}` : ""}`;
    }
    el("session").className = "value bad";
  }
  const n = cache.nextChange;
  el("nextChange").textContent = n ? `${n.time} ${n.name}${n.type === "return" ? "返回" : "離開"}` : "今日無下一異動";
  const rows = cache.records || [];
  el("list").innerHTML = rows.length ? rows.map(r => `
    <div class="item">
      <div class="item-top"><span>${r.name}｜${r.department || ""}</span><span>${fmtStamp(r.start)}–${fmtStamp(r.end)}</span></div>
      <div class="item-sub">${r.position || ""}｜${r.leaveType || "差勤"}${r.agentName ? `｜代理：${r.agentName}` : ""}${r.status ? `｜${r.status}` : ""}</div>
    </div>`).join("") : '<div class="note">今天沒有差勤紀錄。</div>';
}
async function refresh() {
  const r = await chrome.runtime.sendMessage({ type: "GET_ATTENDANCE_STATE" });
  if (r?.ok) render(r.cache);
}
el("sync").addEventListener("click", async () => {
  const b = el("sync"); b.disabled = true; b.textContent = "同步中…";
  try { await chrome.runtime.sendMessage({ type: "SYNC_ATTENDANCE" }); await refresh(); }
  finally { b.disabled = false; b.textContent = "立即同步"; }
});
el("openAttendance").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_ATTENDANCE" }));
el("openDashboard").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" }));
refresh();
