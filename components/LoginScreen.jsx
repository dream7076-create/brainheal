import { useState } from "react";

export default function LoginScreen({ onLogin }) {
  const [userAccount, setUserAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!userAccount.trim() || !password) {
      setError("아이디와 비밀번호를 입력하세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_account: userAccount.trim(), password })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "로그인 실패");
      }

      onLogin({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userId: data.userId,
        role: data.role,
        instructorId: data.instructorId,
        instructorName: data.instructorName,
        userName: data.userName,
        email: data.email,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0F1117", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#161B27", borderRadius: "20px", border: "1px solid #1E293B", padding: "36px 32px", width: "100%", maxWidth: "380px", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" }}>

        {/* 로고 */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <span style={{ color: "#fff", fontSize: "22px", fontWeight: "900" }}>B</span>
          </div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "#F1F5F9" }}>브레인힐 LMS</div>
          <div style={{ fontSize: "12px", color: "#64748B", marginTop: "3px" }}>교구 로테이션 관리 시스템</div>
        </div>

        {/* 입력 폼 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          <div>
            <label style={{ fontSize: "11px", fontWeight: "700", color: "#94A3B8", display: "block", marginBottom: "5px" }}>아이디</label>
            <input
              value={userAccount}
              onChange={function(e) { setUserAccount(e.target.value); setError(""); }}
              onKeyDown={function(e) { if (e.key === "Enter") handleLogin(); }}
              placeholder="아이디 입력"
              autoComplete="username"
              style={{ width: "100%", padding: "12px 14px", background: "#0F1117", border: "1.5px solid " + (error ? "#EF4444" : "#334155"), borderRadius: "10px", fontSize: "14px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "11px", fontWeight: "700", color: "#94A3B8", display: "block", marginBottom: "5px" }}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={function(e) { setPassword(e.target.value); setError(""); }}
              onKeyDown={function(e) { if (e.key === "Enter") handleLogin(); }}
              placeholder="비밀번호 입력"
              autoComplete="current-password"
              style={{ width: "100%", padding: "12px 14px", background: "#0F1117", border: "1.5px solid " + (error ? "#EF4444" : "#334155"), borderRadius: "10px", fontSize: "14px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 13px", fontSize: "12px", color: "#EF4444", fontWeight: "600" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{ padding: "13px", background: loading ? "#334155" : "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", marginTop: "4px", boxShadow: loading ? "none" : "0 4px 14px rgba(99,102,241,0.3)" }}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: "20px", fontSize: "11px", color: "#334155" }}>
          계정 문의: 브레인힐 관리자에게 연락하세요
        </div>
      </div>
    </div>
  );
}
