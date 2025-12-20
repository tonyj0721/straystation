// assets/admin-allowlist.js
// Google 登入白名單：只要在 emails 或 domains 其中一項符合，就視為「小編/管理員」。
// 注意：若 emails 與 domains 都是空陣列，預設「全部拒絕」。
(function () {
  const ADMIN_ALLOWLIST = window.ADMIN_ALLOWLIST || {
    emails: [
      "tonyj0721@gmail.com",
      "bbb@gmail.com",
      "ccc@gmail.com",
      "ddd@gmail.com",
      "eee@gmail.com",
      "fff@gmail.com",
    ],
    domains: [
      // "your-org.com",
    ],
  };

  function normEmail(v) {
    return String(v || "").trim().toLowerCase();
  }
  function normDomain(v) {
    return String(v || "").trim().toLowerCase();
  }

  function isAllowed(email) {
    const em = normEmail(email);
    if (!em || em.indexOf("@") === -1) return false;

    const domain = em.split("@").pop();
    const emails = Array.isArray(ADMIN_ALLOWLIST.emails) ? ADMIN_ALLOWLIST.emails.map(normEmail).filter(Boolean) : [];
    const domains = Array.isArray(ADMIN_ALLOWLIST.domains) ? ADMIN_ALLOWLIST.domains.map(normDomain).filter(Boolean) : [];

    // 預設拒絕：避免忘了填白名單卻讓所有人都能進後台
    if (emails.length === 0 && domains.length === 0) return false;

    if (emails.indexOf(em) !== -1) return true;

    // 允許網域與其子網域（例如：dept.example.com 也會被 example.com 放行）
    for (const d of domains) {
      if (!d) continue;
      if (domain === d || domain.endsWith("." + d)) return true;
    }
    return false;
  }

  window.ADMIN_ALLOWLIST = ADMIN_ALLOWLIST;
  window.isAdminAllowed = isAllowed;
})();
