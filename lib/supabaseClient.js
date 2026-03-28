// Supabase 클라이언트 설정 및 API 함수

const SUPABASE_URL = "https://kwoyfapyufslrbhiafki.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3b3lmYXB5dWZzbHJiaGlhZmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDk4OTMsImV4cCI6MjA4OTEyNTg5M30.DmaQVn1Zaz6CBFklq6vxreYdl1e7WJmWCryH8KphK-c";

var _accessToken = null;
var _refreshToken = null;

export function setAccessToken(token) {
  _accessToken = token;
}

export function setRefreshToken(token) {
  _refreshToken = token;
}

export function getAuthToken() {
  return _accessToken || SUPABASE_KEY;
}

async function refreshAccessToken() {
  if (!_refreshToken) {
    console.warn("갱신 토큰이 없어 토큰 갱신 불가");
    return false;
  }
  try {
    const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: _refreshToken })
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      _accessToken = data.access_token;
      if (data.refresh_token) _refreshToken = data.refresh_token;
      console.log("토큰 갱신 성공");
      return true;
    } else {
      console.error("토큰 갱신 응답 오류:", data);
    }
  } catch (e) {
    console.error("토큰 갱신 실패:", e);
  }
  return false;
}

async function sbFetch(path, opts = {}) {
  const token = _accessToken || SUPABASE_KEY;
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "return=representation",
      ...(opts.headers || {})
    },
    ...opts
  });
  
  // 401 Unauthorized 응답 시 토큰 갱신 시도
  if (res.status === 401 && _refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // 토큰 갱신 후 재시도
      const newToken = _accessToken;
      const retryRes = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + newToken,
          "Content-Type": "application/json",
          "Prefer": opts.prefer || "return=representation",
          ...(opts.headers || {})
        },
        ...opts
      });
      if (!retryRes.ok) {
        const err = await retryRes.text();
        throw new Error(err);
      }
      const text = await retryRes.text();
      return text ? JSON.parse(text) : [];
    }
  }
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export function sbGet(path) {
  return sbFetch(path);
}

export function sbPost(table, body) {
  return sbFetch(table, { method: "POST", body: JSON.stringify(body) });
}

export function sbPatch(table, body) {
  return sbFetch(table, { method: "PATCH", body: JSON.stringify(body), prefer: "return=minimal" });
}

export function sbUpsert(table, body) {
  return sbFetch(table, { method: "POST", body: JSON.stringify(body), prefer: "resolution=merge-duplicates,return=representation" });
}

export function sbDelete(table) {
  return sbFetch(table, { method: "DELETE", prefer: "return=minimal" });
}

export { SUPABASE_URL, SUPABASE_KEY };
