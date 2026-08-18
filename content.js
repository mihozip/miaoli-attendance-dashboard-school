(() => {
  function tokenCandidate(value) {
    if (typeof value !== "string") return null;
    let v = value.trim();
    if (/^Bearer\s+/i.test(v)) v = v.replace(/^Bearer\s+/i, "").trim();
    if (v.length < 40) return null;
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)) return v;
    return null;
  }

  function discoverToken() {
    const stores = [];
    try { stores.push(localStorage); } catch (_) {}
    try { stores.push(sessionStorage); } catch (_) {}
    const keyRe = /(access|auth|bearer|jwt|oauth|token)/i;
    const candidates = [];
    for (const store of stores) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key || !keyRe.test(key)) continue;
        const raw = store.getItem(key);
        const direct = tokenCandidate(raw);
        if (direct) candidates.push(direct);
        try {
          const obj = JSON.parse(raw);
          const stack = [obj];
          while (stack.length) {
            const cur = stack.pop();
            if (!cur || typeof cur !== "object") continue;
            for (const [k, v] of Object.entries(cur)) {
              if (typeof v === "string" && keyRe.test(k)) {
                const c = tokenCandidate(v);
                if (c) candidates.push(c);
              } else if (v && typeof v === "object") stack.push(v);
            }
          }
        } catch (_) {}
      }
    }
    return candidates[0] || null;
  }

  function reportToken() {
    const token = discoverToken();
    chrome.runtime.sendMessage({ type: "ATTENDANCE_PAGE_VISIT", path: location.pathname, token }).catch(() => {});
    if (token) chrome.runtime.sendMessage({ type: "ATTENDANCE_TOKEN_CANDIDATE", token }).catch(() => {});
    return token;
  }


  const ATTENDANCE_UNIT_LABELS = [
    "校長室", "教務處", "學務處", "總務處", "輔導室", "附設幼兒園", "外聘教師"
  ];

  function normalizeText(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
  }

  function discoverAttendanceUnits() {
    let best = [];
    for (const select of document.querySelectorAll("select")) {
      const options = [...select.options].map(o => ({
        id: String(o.value ?? "").trim(),
        name: normalizeText(o.textContent)
      }));
      const matched = options.filter(o => ATTENDANCE_UNIT_LABELS.includes(o.name) && o.id !== "");
      if (matched.length > best.length) best = matched;
    }
    // 只要至少抓到三個已知單位，就視為正確的「處室」下拉選單。
    const dedup = new Map(best.map(x => [x.id, x]));
    return [...dedup.values()];
  }

  function discoverDepartmentSummary() {
    const text = document.body?.innerText || "";
    const units = discoverAttendanceUnits();
    const labels = units.length ? units.map(x => x.name) : ATTENDANCE_UNIT_LABELS;
    const departments = {};
    for (const name of labels) {
      // 接受「總務處 5人」「總務處5 人」等空白差異。
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped + "\\s*(\\d+)\\s*人");
      const m = text.match(re);
      if (m) departments[name] = Number(m[1]);
    }
    const total = Object.values(departments).reduce((a, b) => a + Number(b || 0), 0);
    return {
      ok: Object.keys(departments).length > 0 || units.length > 0,
      departments,
      total: Object.keys(departments).length ? total : null,
      units
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (msg?.type === "DISCOVER_ATTENDANCE_TOKEN") {
        sendResponse({ ok: true, token: reportToken() });
        return;
      }
      if (msg?.type === "DISCOVER_DEPARTMENT_SUMMARY") {
        sendResponse(discoverDepartmentSummary());
        return;
      }
      if (msg?.type === "DISCOVER_ATTENDANCE_UNITS") {
        const units = discoverAttendanceUnits();
        sendResponse({ ok: units.length > 0, units });
        return;
      }
      if (msg?.type === "ATTENDANCE_PAGE_FETCH") {
        const r = await fetch(msg.apiUrl, {
          method: "POST",
          credentials: "include",
          redirect: "follow",
          cache: "no-store",
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${msg.token}`
          },
          body: JSON.stringify(msg.body)
        });
        const text = await r.text();
        const authFail = r.status === 401 || r.status === 403 || /auth-server-login|mlc\.sso\.edu\.tw|captchatext/i.test(`${r.url}\n${text}`);
        if (authFail) {
          sendResponse({ ok: false, sessionAlive: false, status: r.status });
          return;
        }
        let data = null;
        try { data = JSON.parse(text); } catch (_) {}
        sendResponse({ ok: r.ok && !!data, sessionAlive: true, status: r.status, data });
      }
    })().catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  });

  reportToken();
  setTimeout(reportToken, 3000);
  setTimeout(reportToken, 10000);
  window.addEventListener("storage", () => setTimeout(reportToken, 100));
})();
