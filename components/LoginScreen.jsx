import { useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/supabaseClient";

export default function LoginScreen({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function reset() {
    setEmail("");
    setPassword("");
    setName("");
    setError("");
    setSuccess("");
  }

  async function handleLogin() {
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력하세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.msg || "로그인 실패");

      const accessToken = data.access_token;
      const refreshToken = data.refresh_token;
      const userId = data.user && data.user.id;

      const roleRes = await fetch(SUPABASE_URL + "/rest/v1/user_roles?user_id=eq." + userId + "&select=role", {
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + accessToken }
      });
      const roleData = await roleRes.json();
      const role = roleData && roleData[0] ? roleData[0].role : "instructor";

      let instructorId = null;
      let instructorName = "";
      if (role === "instructor") {
        const instRes = await fetch(SUPABASE_URL + "/rest/v1/instructors?user_id=eq." + userId + "&select=id,name,region", {
          headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + accessToken }
        });
        const instData = await instRes.json();
        if (instData && instData[0]) {
          instructorId = instData[0].id;
          instructorName = (instData[0].region ? instData[0].region + " - " : "") + instData[0].name;
        }
      }
      onLogin({ accessToken, refreshToken, userId, role, instructorId, instructorName });
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    if (!name.trim()) {
      setError("강사명을 입력하세요.");
      return;
    }
    if (!email) {
      setError("이메일을 입력하세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(SUPABASE_URL + "/auth/v1/signup", {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          data: { name: name.trim() }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.msg || "회원가입 실패");
      setSuccess("가입 완료! 관리자 승인 후 로그인하실 수 있습니다.");
      reset();
      setTimeout(function() { setTab("login"); setSuccess(""); }, 3000);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0F1117", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#161B27", borderRadius: "20px", border: "1px solid #1E293B", padding: "36px 32px", width: "100%", maxWidth: "380px", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" }}>

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <span style={{ color: "#fff", fontSize: "22px", fontWeight: "900" }}>B</span>
          </div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "#F1F5F9" }}>브레인힐 LMS</div>
          <div style={{ fontSize: "12px", color: "#64748B", marginTop: "3px" }}>교구 로테이션 관리 시스템</div>
        </div>

        <div style={{ display: "flex", background: "#0F1117", borderRadius: "10px", padding: "3px", marginBottom: "22px" }}>
          {["login","signup"].map(function(t) {
            const isActive = tab === t;
            return (
              <button key={t} onClick={function() { setTab(t); reset(); }}
                style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "700", background: isActive ? "#6366F1" : "transparent", color: isActive ? "#fff" : "#64748B", transition: "all 0.15s" }}>
                {t === "login" ? "로그인" : "강사 회원가입"}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>

          {tab === "signup" && (
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: "#94A3B8", display: "block", marginBottom: "5px" }}>강사명 <span style={{ color: "#EF4444" }}>*</span></label>
              <input value={name} onChange={function(e) { setName(e.target.value); setError(""); }}
                placeholder="실명 입력 (예: 김은지)"
                style={{ width: "100%", padding: "12px 14px", background: "#0F1117", border: "1.5px solid #334155", borderRadius: "10px", fontSize: "14px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          <div>
            <label style={{ fontSize: "11px", fontWeight: "700", color: "#94A3B8", display: "block", marginBottom: "5px" }}>이메일</label>
            <input type="email" value={email} onChange={function(e) { setEmail(e.target.value); setError(""); }}
              onKeyDown={function(e) { if (e.key === "Enter") tab === "login" ? handleLogin() : handleSignup(); }}
              placeholder="example@brainheal.com"
              style={{ width: "100%", padding: "12px 14px", background: "#0F1117", border: "1.5px solid " + (error ? "#EF4444" : "#334155"), borderRadius: "10px", fontSize: "14px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ fontSize: "11px", fontWeight: "700", color: "#94A3B8", display: "block", marginBottom: "5px" }}>비밀번호 {tab === "signup" && <span style={{ color: "#64748B", fontWeight: "400" }}>(6자 이상)</span>}</label>
            <input type="password" value={password} onChange={function(e) { setPassword(e.target.value); setError(""); }}
              onKeyDown={function(e) { if (e.key === "Enter") tab === "login" ? handleLogin() : handleSignup(); }}
              placeholder="비밀번호 입력"
              style={{ width: "100%", padding: "12px 14px", background: "#0F1117", border: "1.5px solid " + (error ? "#EF4444" : "#334155"), borderRadius: "10px", fontSize: "14px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }} />
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 13px", fontSize: "12px", color: "#EF4444", fontWeight: "600" }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "8px", padding: "10px 13px", fontSize: "12px", color: "#22C55E", fontWeight: "600" }}>
              {success}
            </div>
          )}

          <button onClick={tab === "login" ? handleLogin : handleSignup} disabled={loading}
            style={{ padding: "13px", background: loading ? "#334155" : "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", marginTop: "4px", boxShadow: loading ? "none" : "0 4px 14px rgba(99,102,241,0.3)" }}>
            {loading ? (tab === "login" ? "로그인 중..." : "가입 중...") : (tab === "login" ? "로그인" : "회원가입")}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: "18px", fontSize: "11px", color: "#334155" }}>
          {tab === "login" ? "계정 문의: 브레인힐 관리자에게 연락하세요" : "가입 후 관리자 승인이 필요합니다"}
        </div>
      </div>
    </div>
  );
}
