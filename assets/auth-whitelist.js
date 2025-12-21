// assets/auth-whitelist.js
// 共用的 Google 登入白名單工具（ES Module）
// ✅ 只要改這個檔案，就能同時影響所有頁面。

export const WL = {
  // 允許的完整 email（全部小寫）
  emails: [
     "aaa@gmail.com",
    // "bbb@gmail.com",
    // "ccc@gmail.com",
    // "ddd@gmail.com",
    // "eee@gmail.com",
    // "fff@gmail.com",
  ],

  // 允許的網域（例如 your-org.com；全部小寫）
  domains: [
    // "your-org.com",
  ],

  // 為了避免一上線就把自己鎖死：
  // - emails/domains 兩者都空時，預設「允許任何已登入帳號」(等同沒開白名單)
  // - 若你要「一定要符合白名單」才算登入，請把 allowIfEmpty 改成 false（或填入白名單）
  allowIfEmpty: true,

  // 非白名單時的提示文字（目前預設不會跳提示；若你想顯示，可在呼叫 enforceWhitelist 時把 alertOnReject 設為 true）
  rejectionMessage: "此帳號不在白名單內，已自動登出。"
};

function _normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function _hasRules(wl) {
  const emails = Array.isArray(wl?.emails) ? wl.emails : [];
  const domains = Array.isArray(wl?.domains) ? wl.domains : [];
  return (emails.length + domains.length) > 0;
}

export function isWhitelistedUser(user, whitelist = WL) {
  if (!user) return false;

  const wl = whitelist || WL;
  const hasRules = _hasRules(wl);

  if (!hasRules && wl.allowIfEmpty) return true; // 維持原本行為：只要登入就算

  const email = _normalizeEmail(user.email);
  if (!email) return false;

  const emails = (Array.isArray(wl.emails) ? wl.emails : []).map(_normalizeEmail);
  if (emails.includes(email)) return true;

  const domains = (Array.isArray(wl.domains) ? wl.domains : []).map((d) => (d || "").trim().toLowerCase());
  const at = email.lastIndexOf("@");
  const domain = at >= 0 ? email.slice(at + 1) : "";
  if (domain && domains.includes(domain)) return true;

  return false;
}

/**
 * 依白名單決定是否允許目前登入者保留登入狀態。
 * - 若不在白名單：會提示並 signOut
 * - 回傳 { isEditor, reason }
 *
 * 你必須從外部傳入 signOut（避免這個檔案綁死 firebase 版本/路徑）
 */
export async function enforceWhitelist({ auth, user, signOut, whitelist = WL, alertOnReject = false }) {
  const wl = whitelist || WL;

  if (!user) {
    return { isEditor: false, reason: "not_logged_in" };
  }

  const ok = isWhitelistedUser(user, wl);
  if (ok) return { isEditor: true, reason: "allowed" };

  // 不在白名單：提示 + 登出
  if (alertOnReject) {
    try { alert(wl.rejectionMessage || "此帳號不在白名單內，已自動登出。"); } catch (_) { }
  }

  if (typeof signOut === "function") {
    try { await signOut(auth); } catch (_) { }
  }

  return { isEditor: false, reason: "not_whitelisted" };
}

/**
 * 後台頁保護：不是白名單就導回 redirectTo
 */
export async function requireEditorOrRedirect({
  auth,
  user,
  signOut,
  redirectTo = "index.html",
  whitelist = WL,
  alertOnReject = false
}) {
  const res = await enforceWhitelist({ auth, user, signOut, whitelist, alertOnReject });
  if (!res.isEditor) {
    try { window.location.replace(redirectTo); } catch (_) { }
  }
  return res;
}
