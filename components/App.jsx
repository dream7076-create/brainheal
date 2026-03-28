import { useState, useEffect } from "react";
import { sbGet, setAccessToken, setRefreshToken } from "../lib/supabaseClient";
import { WEEKS, getCurrentWeek } from "../lib/constants";
import AdminView from "./AdminView";
import InstructorView from "./InstructorView";
import LoginScreen from "./LoginScreen";

export default function App() {
  const [authUser, setAuthUser] = useState(function() {
    try {
      const saved = localStorage.getItem("brainheal_auth");
      return saved ? JSON.parse(saved) : null;
    } catch(e) {
      return null;
    }
  });
  
  const [view, setView] = useState(function() {
    try {
      const saved = localStorage.getItem("brainheal_view");
      return saved ? JSON.parse(saved) : "admin";
    } catch(e) {
      return "admin";
    }
  });
  
  const [handoverLogs, setHandoverLogs] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbInstructors, setDbInstructors] = useState(null);
  const [dbEquipment, setDbEquipment] = useState(null);
  const [dbSchedule, setDbSchedule] = useState(null);
  const [activeSheetTitle, setActiveSheetTitle] = useState("실버체육 로테이션 2026");

  // Save auth to localStorage
  useEffect(function() {
    if (authUser) {
      localStorage.setItem("brainheal_auth", JSON.stringify(authUser));
      setAccessToken(authUser.accessToken);
      setRefreshToken(authUser.refreshToken || null);
    } else {
      localStorage.removeItem("brainheal_auth");
      setAccessToken(null);
      setRefreshToken(null);
    }
  }, [authUser]);

  // Save view to localStorage
  useEffect(function() {
    localStorage.setItem("brainheal_view", JSON.stringify(view));
  }, [view]);

  // Load DB data
  useEffect(function() {
    if (!authUser) {
      setDbLoading(false);
      return;
    }

    async function loadAll() {
      try {
        // 타이밍 문제 방지: loadAll 시작 시 토큰 직접 설정
        setAccessToken(authUser.accessToken);
        setRefreshToken(authUser.refreshToken || null);
        
        console.log("🚀🚀🚀 DB 데이터 로딩 시작... 🚀🚀🚀");
        
        let insts = [];
        try {
          insts = await sbGet("instructors?select=id,name,region,note,sort_order&is_active=eq.true&order=sort_order.asc");
          console.log("✅ instructors 조회 성공:", insts.length, "명");
        } catch(e) {
          console.error("❌ instructors 조회 실패:", e.message);
        }
        
        let eqs = [];
        try {
          eqs = await sbGet("equipment?select=id,name,base_qty&is_active=eq.true&order=name.asc");
          console.log("✅ equipment 조회 성공:", eqs.length, "개");
        } catch(e) {
          console.error("❌ equipment 조회 실패:", e.message);
        }
        
        let schedRows = [];
        try {
          schedRows = await sbGet("rotation_schedule?select=instructor_id,equipment_id,week,equipment(name)&year=eq.2026&sheet_id=eq.main&order=week.asc");
          console.log("✅ rotation_schedule 조회 성공:", schedRows.length, "건");
        } catch(e) {
          console.error("❌ rotation_schedule 조회 실패:", e.message);
        }
        
        let logs = [];
        try {
          logs = await sbGet("handover_logs?select=id,instructor_id,equipment_id,week,sent_qty,diff_note&year=eq.2026&order=week.asc");
          console.log("✅ handover_logs 조회 성공:", logs.length, "건");
        } catch(e) {
          console.error("❌ handover_logs 조회 실패:", e.message);
        }

        // 이전 주간 데이터 자동 생성 (rotation_schedule 기반)
        const CURRENT_WEEK = getCurrentWeek();
        const WEEKS_ARR = ["1-1","1-2","1-3","1-4","1-5","2-1","2-2","2-3","2-4","3-1","3-2","3-3","3-4","4-1","4-2","4-3","4-4","5-1","5-2","5-3","5-4","5-5","6-1","6-2","6-3","6-4","7-1","7-2","7-3","7-4","7-5","8-1","8-2","8-3","8-4","9-1","9-2","9-3","9-4","10-1","10-2","10-3","10-4","10-5","11-1","11-2","11-3","11-4","12-1","12-2","12-3","12-4"];
        const currentWkIdx = WEEKS_ARR.indexOf(CURRENT_WEEK);
        
        console.log("📊📊📊 handover_logs 상태 확인 📊📊📊");
        console.log("  현재 logs 개수:", logs.length);
        console.log("  rotation_schedule 개수:", schedRows.length);
        console.log("  현재 주차:", CURRENT_WEEK, "인덱스:", currentWkIdx);
        
        // 이전 주간 데이터가 없으면 자동 생성
        if (logs.length === 0 && schedRows.length > 0) {
          console.log("🔥🔥🔥 이전 주간 handover_logs 자동 생성 시작... 🔥🔥🔥");
          const autoLogs = [];
          
          // rotation_schedule의 각 레코드에 대해
          schedRows.forEach(function(r) {
            // 현재 주 이전의 모든 주차에 대해 완료됨으로 표시
            for (let i = 0; i < currentWkIdx; i++) {
              const week = WEEKS_ARR[i];
              autoLogs.push({
                instructor_id: r.instructor_id,
                equipment_id: r.equipment_id,
                week: week,
                sent_qty: 50,
                received_qty: 50,
                transfer_method: "delivery",
                diff_type: null,
                diff_qty: null,
                diff_note: null,
                year: 2026
              });
            }
          });
          
          console.log("📝 생성할 자동 로그 개수:", autoLogs.length);
          console.log("📝 샘플 데이터:", autoLogs.slice(0, 2));
          
          // Supabase에 저장
          if (autoLogs.length > 0) {
            try {
              // 배치 단위로 저장 (한 번에 50개씩)
              const batchSize = 50;
              let savedCount = 0;
              
              for (let i = 0; i < autoLogs.length; i += batchSize) {
                const batch = autoLogs.slice(i, i + batchSize);
                console.log("💾 배치 저장 중:", i, "~", Math.min(i + batchSize, autoLogs.length), "건");
                
                try {
                  const result = await sbPost("handover_logs", batch);
                  savedCount += batch.length;
                  console.log("✅ 배치 저장 완료:", batch.length, "건 (누적:", savedCount, "건)");
                } catch(batchError) {
                  console.error("❌ 배치 저장 실패:", batchError.message);
                  console.error("❌ 배치 데이터:", batch.slice(0, 1));
                }
              }
              
              console.log("✅✅✅ handover_logs 자동 생성 완료:", savedCount, "건 ✅✅✅");
              
              // 저장 후 다시 조회하여 logs 업데이트
              logs = await sbGet("handover_logs?select=id,instructor_id,equipment_id,week,sent_qty,diff_note&year=eq.2026&order=week.asc");
              console.log("📥 저장 후 재조회:", logs.length, "건");
            } catch(e) {
              console.error("❌ handover_logs 자동 생성 실패:", e.message);
              console.error("❌ 오류 상세:", e);
            }
          }
        } else {
          console.log("⏭️  handover_logs 자동 생성 스킵");
          console.log("  이유: logs.length=" + logs.length + ", schedRows.length=" + schedRows.length);
        }

        // Process instructors
        const instList = insts.map(function(r) {
          return { 
            id: r.id, 
            name: (r.region ? r.region + " - " : "") + r.name, 
            note: r.note || "", 
            sort_order: r.sort_order 
          };
        });
        
        // Process schedule
        const schedObj = {};
        instList.forEach(function(inst) {
          schedObj[inst.id] = {};
          WEEKS.forEach(function(w) { schedObj[inst.id][w] = "-"; });
        });
        schedRows.forEach(function(r) {
          if (schedObj[r.instructor_id]) {
            schedObj[r.instructor_id][r.week] = (r.equipment && r.equipment.name) || "-";
          }
        });
        
        console.log("📊 rotation_schedule 처리 결과:");
        console.log("  schedRows 개수:", schedRows.length);
        console.log("  schedObj:", schedObj);
        
        // Process logs
        const hLogs = logs.map(function(r) {
          return { 
            id: r.id, 
            instId: r.instructor_id, 
            week: r.week, 
            qty: r.sent_qty, 
            note: r.diff_note || "" 
          };
        });

        setDbInstructors(instList.length > 0 ? instList : null);
        setDbEquipment(eqs.length > 0 ? eqs : null);
        setDbSchedule(Object.keys(schedObj).length > 0 ? schedObj : null);
        setHandoverLogs(hLogs.length > 0 ? hLogs : []);
        
        console.log("DB 데이터 로딩 완료. 강사 수:", instList.length, "교구 수:", eqs.length);
      } catch(e) {
        console.error("DB 로딩 중 오류:", e);
        setDbInstructors(null);
        setDbEquipment(null);
        setDbSchedule(null);
        setHandoverLogs([]);
      } finally {
        setDbLoading(false);
      }
    }
    loadAll();
  }, [authUser]);

  async function reloadSchedule() {
    try {
      const schedRows = await sbGet("rotation_schedule?select=instructor_id,equipment_id,week,equipment(name)&year=eq.2026&sheet_id=eq.main&order=week.asc");
      const instList = dbInstructors || [];
      const schedObj = {};
      instList.forEach(function(inst) {
        schedObj[inst.id] = {};
        WEEKS.forEach(function(w) { schedObj[inst.id][w] = "-"; });
      });
      schedRows.forEach(function(r) {
        if (schedObj[r.instructor_id]) schedObj[r.instructor_id][r.week] = (r.equipment && r.equipment.name) || "-";
      });
      setDbSchedule(schedObj);
    } catch(e) { 
      console.warn("스케줄 재로딩 실패:", e.message); 
    }
  }

  function handleLogin(user) {
    setAuthUser(user);
    setView(user.role === "admin" ? "admin" : "instructor");
  }

  function handleLogout() {
    setAuthUser(null);
    setView("admin");
  }

  if (dbLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0F1117", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ width: "40px", height: "40px", border: "3px solid #334155", borderTop: "3px solid #6366F1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ color: "#64748B", fontSize: "13px", fontWeight: "600" }}>데이터 불러오는 중...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div>
      <div style={{ position: "fixed", top: "8px", right: "10px", zIndex: 9999, display: "flex", gap: "3px", alignItems: "center", background: "rgba(15,17,23,0.88)", borderRadius: "8px", padding: "3px", border: "1px solid rgba(255,255,255,0.07)" }}>
        {authUser.role === "admin" && (
          <>
            <button onClick={function() { setView("admin"); }} style={{ padding: "5px 11px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "700", background: view === "admin" ? "#6366F1" : "transparent", color: view === "admin" ? "#fff" : "#64748B" }}>관리자</button>
            <button onClick={function() { setView("instructor"); }} style={{ padding: "5px 11px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "700", background: view === "instructor" ? "#6366F1" : "transparent", color: view === "instructor" ? "#fff" : "#64748B" }}>강사</button>
            <div style={{ width: "1px", background: "rgba(255,255,255,0.07)", margin: "3px 2px" }} />
          </>
        )}
        <div style={{ padding: "4px 8px", fontSize: "10px", fontWeight: "700", color: "#A5B4FC" }}>
          {authUser.role === "instructor" ? authUser.instructorName : "관리자"}
        </div>
        <div style={{ width: "1px", background: "rgba(255,255,255,0.07)", margin: "3px 2px" }} />
        <div title={dbInstructors ? "Supabase DB 연결됨" : "로컬 데이터"} style={{ padding: "4px 6px", fontSize: "9px", fontWeight: "700", color: dbInstructors ? "#22C55E" : "#F59E0B" }}>
          {dbInstructors ? "● DB" : "● 로컬"}
        </div>
        <div style={{ width: "1px", background: "rgba(255,255,255,0.07)", margin: "3px 2px" }} />
        <button onClick={handleLogout} style={{ padding: "4px 9px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "700", background: "transparent", color: "#64748B" }}>로그아웃</button>
      </div>

      {view === "admin"
        ? <AdminView
            handoverLogs={handoverLogs}
            dbInstructors={dbInstructors}
            dbSchedule={dbSchedule}
            dbEquipment={dbEquipment}
            setHandoverLogs={setHandoverLogs}
            setDbInstructors={setDbInstructors}
            onSaved={reloadSchedule}
            onSheetTitleChange={setActiveSheetTitle}
          />
        : <InstructorView
            authUser={authUser}
            handoverLogs={handoverLogs}
            setHandoverLogs={setHandoverLogs}
            dbInstructors={dbInstructors}
            currentInstructorId={authUser.instructorId}
            currentInstructorName={authUser.instructorName}
            dbSchedule={dbSchedule}
            sheetTitle={activeSheetTitle}
          />}
    </div>
  );
}
