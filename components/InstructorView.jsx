import { useState, useEffect } from "react";
import { WEEKS, WEEK_LABELS, INITIAL_INSTRUCTORS, INIT_SCHEDULE, CURRENT_WEEK, EQUIPMENT_LIST, BASE_QTY, EQ_COLORS } from "../lib/constants";
import { sbGet, sbPost, sbPatch, sbDelete } from "../lib/supabaseClient";
import { saveHandoverLog, deleteHandoverAndRecovery, getEquipmentId, saveLostItem, saveRecoveryLog, closeLostItem, reopenLostItem } from "../lib/handoverService";
import { validateHandoverInput, validateRecoveryQty, validateRecoveryMethod, validateDiffQty } from "../lib/validation";
import { resetHandoverForm, resetRecoveryModal, updateMyHandoverLogs, removeMyHandoverLog, removeLostItem, updateLostItemClosed } from "../lib/stateHelpers";

function eqColor(name) {
  var idx = EQUIPMENT_LIST.indexOf(name);
  return idx >= 0 ? EQ_COLORS[idx % EQ_COLORS.length] : "#475569";
}

export default function InstructorView({ authUser, handoverLogs, setHandoverLogs, dbInstructors, currentInstructorId, currentInstructorName, dbSchedule, sheetTitle }) {
  const [activeTab, setActiveTab] = useState("schedule");
  const [scheduleMonth, setScheduleMonth] = useState(parseInt(CURRENT_WEEK.split("-")[0], 10));
  const [historyMonth, setHistoryMonth] = useState(parseInt(CURRENT_WEEK.split("-")[0], 10));
  const [myId, setMyId] = useState(null);
  const [handoverWeekOffset, setHandoverWeekOffset] = useState(0);

  // ── 시트 멀티 선택 state ─────────────────────────────────────────
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [sheetSchedule, setSheetSchedule] = useState({});
  const [sheetInstructors, setSheetInstructors] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [mySheetIds, setMySheetIds] = useState([]);
  const [myIdInSheet, setMyIdInSheet] = useState(null); // 현재 시트에서 내 강사 UUID

  // 인계 폼 상태
  const [handoverReceivedQty, setHandoverReceivedQty] = useState("");
  const [handoverSendQty, setHandoverSendQty] = useState("");
  const [handoverAllowExtra, setHandoverAllowExtra] = useState(false);
  const [handoverExtraNote, setHandoverExtraNote] = useState("");
  const [handoverDiffType, setHandoverDiffType] = useState(null);
  const [handoverDiffQty, setHandoverDiffQty] = useState("");
  const [handoverDiffNote, setHandoverDiffNote] = useState("");
  const [handoverDiffPhotos, setHandoverDiffPhotos] = useState([]);
  const [handoverMethod, setHandoverMethod] = useState("delivery");
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().split("T")[0]);
  const [handoverSendDiffType, setHandoverSendDiffType] = useState(null);
  const [handoverSendPhotos, setHandoverSendPhotos] = useState([]);
  const [handoverTarget, setHandoverTarget] = useState("manager1");
  const [selectedRecoveries, setSelectedRecoveries] = useState({});
  const [handoverDoneMsg, setHandoverDoneMsg] = useState("");
  const [handoverCompleted, setHandoverCompleted] = useState(false);

  // 회수 모달 상태
  const [recoveryModal, setRecoveryModal] = useState(null);
  const [recoveryModalQty, setRecoveryModalQty] = useState("");
  const [recoveryModalMethod, setRecoveryModalMethod] = useState("");
  const [recoveryModalDate, setRecoveryModalDate] = useState(new Date().toISOString().split("T")[0]);
  const [recoveryModalTransfer, setRecoveryModalTransfer] = useState("delivery");

  // 데이터 상태
  const [lostItems, setLostItems] = useState([]);
  const [myHandoverLogs, setMyHandoverLogs] = useState([]);

  // myId 결정 - authUser 기반으로 instructors 테이블 직접 조회
  useEffect(function() {
    var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // 1순위: currentInstructorId가 UUID면 바로 사용
    if (currentInstructorId && uuidRegex.test(currentInstructorId)) {
      setMyId(currentInstructorId);
      return;
    }

    // 2순위: authUser.userId로 instructors 조회 (시트 무관하게 전체에서)
    var userId = authUser && authUser.userId;
    if (!userId) { setMyId(null); return; }

    (async function() {
      try {
        // user_id 컬럼으로 조회
        var res = await sbGet("instructors?user_id=eq." + userId + "&select=id,name&is_active=eq.true&limit=1");
        if (res && res[0]) {
          console.log("✅ myId 결정 (user_id):", res[0].id, res[0].name);
          setMyId(res[0].id);
          return;
        }
        // user_account로 name 매칭 시도
        var userInfo = await sbGet("user?select=name&user_id=eq." + userId);
        if (userInfo && userInfo[0] && userInfo[0].name) {
          var byName = await sbGet("instructors?name=eq." + encodeURIComponent(userInfo[0].name) + "&select=id,name&is_active=eq.true&limit=1");
          if (byName && byName[0]) {
            console.log("✅ myId 결정 (name):", byName[0].id, byName[0].name);
            setMyId(byName[0].id);
            return;
          }
        }
        console.warn("⚠️ instructors에서 강사를 찾지 못함 (userId:", userId, ")");
        setMyId(null);
      } catch(e) {
        console.warn("myId 조회 실패:", e);
        setMyId(null);
      }
    })();
  }, [currentInstructorId, authUser]);

  // ── 내가 속한 시트 목록 로드 ─────────────────────────────────────
  useEffect(function() {
    if (!myId) return;
    async function loadMySheets() {
      try {
        // 1. 전체 시트 목록
        var allSheets = await sbGet("sheets?select=id,title,sort_order&order=sort_order.asc");
        if (!Array.isArray(allSheets) || allSheets.length === 0) return;

        // 2. myId로 내 실제 이름 조회
        var myInstRow = await sbGet("instructors?select=id,name,sheet_id&id=eq." + myId + "&is_active=eq.true");
        var myRealName = (Array.isArray(myInstRow) && myInstRow[0]) ? myInstRow[0].name : (currentInstructorName || "");

        // 3. 전체 강사 목록에서 같은 이름인 모든 행의 sheet_id 수집
        var allInsts = await sbGet("instructors?select=id,name,sheet_id&is_active=eq.true");
        var relevantSheetIds = [];
        if (Array.isArray(allInsts)) {
          allInsts.forEach(function(inst) {
            if (inst.name === myRealName && inst.sheet_id && !relevantSheetIds.includes(inst.sheet_id)) {
              relevantSheetIds.push(inst.sheet_id);
            }
          });
        }
        // myId 자신의 sheet_id도 추가
        if (Array.isArray(myInstRow) && myInstRow[0] && myInstRow[0].sheet_id) {
          if (!relevantSheetIds.includes(myInstRow[0].sheet_id)) {
            relevantSheetIds.push(myInstRow[0].sheet_id);
          }
        }

        console.log("내 이름:", myRealName, "/ 속한 시트:", relevantSheetIds);

        var mySheets = allSheets.filter(function(s) { return relevantSheetIds.includes(s.id); });
        if (mySheets.length === 0) mySheets = allSheets.slice(0, 1); // 없으면 첫 시트만

        setSheets(mySheets);
        setMySheetIds(relevantSheetIds);
        setActiveSheetId(mySheets[0].id);
      } catch(e) {
        console.warn("시트 목록 로드 실패:", e);
      }
    }
    loadMySheets();
  }, [myId]);

  // ── 시트 변경 시 해당 시트의 스케줄 로드 ─────────────────────────
  useEffect(function() {
    if (!activeSheetId || !myId) return;
    async function loadSheetSchedule() {
      setLoadingSheet(true);
      try {
        // 1. 현재 시트의 전체 강사 목록
        var instRows = await sbGet(
          "instructors?select=id,name,sort_order&sheet_id=eq." + activeSheetId +
          "&is_active=eq.true&order=sort_order.asc"
        );
        if (!Array.isArray(instRows) || instRows.length === 0) {
          setLoadingSheet(false); return;
        }
        setSheetInstructors(instRows);

        // 2. myId로 내 실제 이름 조회 (시트에 관계없이)
        var myInstRow = await sbGet("instructors?select=name&id=eq." + myId + "&is_active=eq.true");
        var myRealName = (Array.isArray(myInstRow) && myInstRow[0]) ? myInstRow[0].name : "";

        // 3. 현재 시트에서 내 이름과 일치하는 강사 찾기
        var myInstInSheet = instRows.find(function(i) {
          return i.id === myId || (myRealName && i.name === myRealName);
        });

        console.log("시트:", activeSheetId, "/ 내 이름:", myRealName, "/ 매칭:", myInstInSheet ? myInstInSheet.id : "없음");

        if (!myInstInSheet) {
          setMyIdInSheet(null);
          setLoadingSheet(false);
          return;
        }

        // myIdInSheet state 설정
        setMyIdInSheet(myInstInSheet.id);

        // 4. 해당 시트 rotation_schedule 로드
        var schedRows = await sbGet(
          "rotation_schedule?select=instructor_id,equipment_id,week" +
          "&year=eq.2026&sheet_id=eq." + activeSheetId + "&order=week.asc"
        );

        // 5. equipment id → name 맵
        var eqData = await sbGet("equipment?select=id,name&is_active=eq.true");
        var eqIdToName = {};
        if (Array.isArray(eqData)) eqData.forEach(function(e) { eqIdToName[e.id] = e.name; });

        // 6. 스케줄 객체 구성
        var schedObj = {};
        instRows.forEach(function(inst) {
          schedObj[inst.id] = {};
          WEEKS.forEach(function(w) { schedObj[inst.id][w] = "-"; });
        });
        if (Array.isArray(schedRows)) {
          schedRows.forEach(function(r) {
            if (schedObj[r.instructor_id]) {
              schedObj[r.instructor_id][r.week] = eqIdToName[r.equipment_id] || "-";
            }
          });
        }

        setSheetSchedule(schedObj);
      } catch(e) {
        console.warn("시트 스케줄 로드 실패:", e);
      } finally {
        setLoadingSheet(false);
      }
    }
    loadSheetSchedule();
  }, [activeSheetId, myId]);

  // 현재 시트에서 내 강사 ID (시트마다 다른 UUID일 수 있음)
  var instList = sheetInstructors.length > 0 ? sheetInstructors : ((dbInstructors && dbInstructors.length > 0) ? dbInstructors : INITIAL_INSTRUCTORS);
  var myDisplayName = currentInstructorName || "강사";
  var effectiveMyId = myIdInSheet || myId; // 현재 시트의 내 UUID (없으면 기본 myId)
  var myIdx = instList.findIndex(function(i) { return i.id === effectiveMyId; });
  var prevInst = myIdx > 0 ? instList[myIdx - 1] : null;
  var nextInst = myIdx < instList.length - 1 ? instList[myIdx + 1] : null;
  var isLastInst = myIdx === instList.length - 1 && instList.length > 0;
  var nextInstName = isLastInst ? "본사" : (nextInst ? nextInst.name : "-");
  var activeSchedule = Object.keys(sheetSchedule).length > 0 ? sheetSchedule : (dbSchedule || {});
  var myData = (activeSchedule && effectiveMyId && activeSchedule[effectiveMyId]) ? activeSchedule[effectiveMyId] : {};

  // 인계 이력 로드
  useEffect(function() {
    if (!myId) return;
    async function loadHandoverHistory() {
      try {
        var logs = await sbGet("handover_logs?instructor_id=eq." + myId + "&year=eq.2026&order=week.asc&limit=5000&select=id,instructor_id,equipment_id,week,sent_qty,received_qty,transfer_method,diff_type,diff_qty,diff_note,equipment(name)");
        if (Array.isArray(logs)) {
          setMyHandoverLogs(logs.map(function(log) {
            return { id: log.id, instId: log.instructor_id, week: log.week, qty: log.sent_qty, note: log.diff_note || "", receivedQty: log.received_qty, transferMethod: log.transfer_method, diffType: log.diff_type, diffQty: log.diff_qty, eq: log.equipment && log.equipment.name ? log.equipment.name : "-" };
          }));
        }
      } catch(e) { console.warn("인계 이력 로드 실패:", e); }
    }
    loadHandoverHistory();
  }, [dbSchedule, myId]);

  // 분실/훼손 기록 로드
  useEffect(function() {
    if (!dbSchedule || !myId) return;
    async function loadLostItems() {
      try {
        var items = await sbGet("lost_items?instructor_id=eq." + myId + "&order=report_date.desc&select=id,instructor_id,equipment_id,qty,type,status,note,report_date,close_note,closed_at,equipment(name)");
        if (Array.isArray(items)) {
          setLostItems(items.map(function(item) {
            return { id: item.id, eq: item.equipment && item.equipment.name ? item.equipment.name : "알 수 없음", qty: item.qty, reportDate: item.report_date, note: item.note || "", type: item.type, status: item.status, closed: item.status === "closed", closeNote: item.close_note || "", closedAt: item.closed_at };
          }));
        }
      } catch(e) { console.warn("분실/훼손 기록 로드 실패:", e); }
    }
    loadLostItems();
  }, [dbSchedule, myId]);

  var currentWkIdx = WEEKS.indexOf(CURRENT_WEEK);

  var mySchedule = WEEKS.map(function(w, idx) {
    var eq = (myData && myData[w]) || "-";
    var isCurrent = w === CURRENT_WEEK;
    var isPast = idx < currentWkIdx;
    var hasHandoverLog = myHandoverLogs.some(function(log) { return log.week === w && log.eq === eq; });
    var handoverDone = isPast || (isCurrent && hasHandoverLog);
    return { week: w, label: WEEK_LABELS[w], eq: eq, from: eq !== "-" && prevInst ? prevInst.name : "-", to: eq !== "-" ? nextInstName : "-", qty: eq !== "-" ? 50 : null, isCurrent: isCurrent, isPast: isPast, handoverDone: handoverDone };
  });

  var currentRow = mySchedule.find(function(r) { return r.isCurrent; });
  var nextHandoverRow = mySchedule.find(function(r) { return !r.isPast && !r.isCurrent && r.eq !== "-"; });

  var handoverDisplayRow = currentRow;
  var handoverNextRow = nextHandoverRow;
  if (handoverWeekOffset > 0) {
    var cwIdx = WEEKS.indexOf(CURRENT_WEEK);
    var targetWeekIdx = cwIdx + handoverWeekOffset;
    if (targetWeekIdx < WEEKS.length) {
      var targetWeek = WEEKS[targetWeekIdx];
      handoverDisplayRow = mySchedule.find(function(r) { return r.week === targetWeek; });
      handoverNextRow = mySchedule.find(function(r) { var rIdx = WEEKS.indexOf(r.week); return rIdx > targetWeekIdx && r.eq !== "-"; });
    }
  }

  // 인계 탭 진입 시 기록 확인
  useEffect(function() {
    if (activeTab === "handover" && handoverDisplayRow && handoverDisplayRow.eq !== "-" && myId) {
      var hasLog = myHandoverLogs.some(function(log) { return log.week === handoverDisplayRow.week && log.eq === handoverDisplayRow.eq; });
      setHandoverCompleted(hasLog);
    }
  }, [activeTab, handoverDisplayRow, myHandoverLogs, myId]);

  var TABS = [
    { key: "schedule", label: "교구 일정" },
    { key: "history",  label: "이동 이력" },
    { key: "handover", label: "인계 등록" },
    { key: "lost",     label: "회수 기록" },
  ];

  // 인계 폼 초기화 헬퍼
  function resetHandoverFormState() {
    setHandoverReceivedQty("");
    setHandoverSendQty("");
    setHandoverDiffType(null);
    setHandoverDiffNote("");
    setHandoverDiffPhotos([]);
    setHandoverAllowExtra(false);
    setHandoverExtraNote("");
  }

  // 회수 모달 초기화 헬퍼
  function resetRecoveryModalState() {
    setRecoveryModal(null);
    setRecoveryModalQty("");
    setRecoveryModalMethod("");
    setRecoveryModalDate(new Date().toISOString().split("T")[0]);
    setRecoveryModalTransfer("delivery");
  }

  // 인계 등록 완료 핸들러
  function handleHandoverComplete() {
    // 필수값 검증
    var validation = validateHandoverInput(handoverReceivedQty, handoverSendQty);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    if (handoverReceivedQty && parseInt(handoverReceivedQty) > 50 && handoverAllowExtra && !handoverExtraNote.trim()) {
      alert("초과 수량 사유를 입력해주세요.");
      return;
    }
    if (handoverReceivedQty && parseInt(handoverReceivedQty) > 50 && !handoverAllowExtra) {
      alert("수령 수량이 기준(50개)을 초과합니다. 초과 허용 여부를 선택해주세요.");
      return;
    }
    if (handoverReceivedQty && parseInt(handoverReceivedQty) < 50 && !handoverDiffType) {
      alert("수량 차이 유형(분실/훼손)을 선택해주세요.");
      return;
    }

    var receivedQtyNum = handoverReceivedQty ? parseInt(handoverReceivedQty) : BASE_QTY;
    var sendQtyNum = handoverSendQty ? parseInt(handoverSendQty) : BASE_QTY;

    // 분실/훼손 기록 저장
    if (handoverReceivedQty && parseInt(handoverReceivedQty) < 50 && handoverDiffType) {
      var diff = 50 - parseInt(handoverReceivedQty);
      (async function() {
        try {
          var instId = myId;
          if (instId) {
            var eqName = handoverDisplayRow ? handoverDisplayRow.eq : "-";
            var eqId = await getEquipmentId(eqName);
            if (eqId) {
              await saveLostItem(instId, eqId, {
                qty: diff,
                type: handoverDiffType,
                note: handoverDiffNote || (handoverDiffType === "lost" ? "인계 시 분실" : handoverDiffType === "damaged" ? "인계 시 훼손" : "인계 시 분실/훼손")
              });
              setLostItems(function(prev) {
                return prev.concat([{ id: Date.now(), eq: eqName, qty: diff, reportDate: new Date().toISOString().split("T")[0], note: handoverDiffNote || (handoverDiffType === "lost" ? "인계 시 분실" : handoverDiffType === "damaged" ? "인계 시 훼손" : "인계 시 분실/훼손"), type: handoverDiffType, status: "open", closed: false }]);
              });
            }
          }
        } catch(e) { console.error("분실/훼손 기록 DB 저장 실패:", e); }
      })();
    }

    // 인계 기록 저장
    if (!isNaN(sendQtyNum) && handoverDisplayRow && handoverDisplayRow.week) {
      var noteText = handoverSendQty && sendQtyNum < BASE_QTY ? (BASE_QTY - sendQtyNum) + "개 감소" : "";
      (async function() {
        try {
          var instId = myId;
          var eqName = handoverDisplayRow.eq;
          var eqId = await getEquipmentId(eqName);
          if (instId && eqId) {
            // 기존 기록 삭제 후 새로 저장 (UPSERT)
            await saveHandoverLog(instId, eqId, handoverDisplayRow.week, {
              receivedQty: receivedQtyNum,
              sentQty: sendQtyNum,
              transferMethod: handoverMethod,
              diffType: handoverSendDiffType,
              diffQty: sendQtyNum < receivedQtyNum ? receivedQtyNum - sendQtyNum : null,
              diffNote: noteText,
              extraNote: handoverExtraNote
            });

            updateMyHandoverLogs(
              setMyHandoverLogs,
              { id: Date.now(), instId: instId, week: handoverDisplayRow.week, qty: sendQtyNum, receivedQty: receivedQtyNum, note: noteText, transferMethod: handoverMethod, eq: eqName },
              handoverDisplayRow.week,
              eqName
            );
          }
        } catch(e) { console.error("인계 DB 저장 실패:", e); alert("인계 기록 저장 실패: " + (e.message || e)); }
      })();

      setHandoverLogs(function(prev) {
        var exists = prev.find(function(l) { return l.instId === myId && l.week === handoverDisplayRow.week; });
        if (exists) { return prev.map(function(l) { return (l.instId === myId && l.week === handoverDisplayRow.week) ? Object.assign({}, l, { qty: sendQtyNum, note: noteText }) : l; }); }
        else { return prev.concat([{ id: Date.now(), instId: myId, week: handoverDisplayRow.week, qty: sendQtyNum, note: noteText }]); }
      });
    }

    resetHandoverFormState();
    setHandoverCompleted(true);
  }

  // 회수 기록 저장 핸들러
  function handleRecoverySave() {
    if (!recoveryModal) return;

    var qtyValidation = validateRecoveryQty(recoveryModalQty);
    if (!qtyValidation.valid) {
      alert(qtyValidation.message);
      return;
    }

    var methodValidation = validateRecoveryMethod(recoveryModalMethod);
    if (!methodValidation.valid) {
      alert(methodValidation.message);
      return;
    }

    (async function() {
      try {
        var instId = myId;
        if (instId && recoveryModal.id) {
          // 회수 기록 저장
          await saveRecoveryLog(instId, recoveryModal.id, {
            recoveredQty: recoveryModalQty,
            handoverDate: recoveryModalDate,
            transferMethod: recoveryModalTransfer,
            recoveryMethod: recoveryModalMethod
          });

          // lost_items 상태를 closed로 업데이트
          await closeLostItem(recoveryModal.id, "회수 완료");

          // 로컬 상태 업데이트
          updateLostItemClosed(setLostItems, recoveryModal.id, true, "회수 완료");

          console.log("✅ 회수 기록 저장 성공");
          resetRecoveryModalState();
          window.location.reload();
        }
      } catch(e) {
        console.error("회수 기록 DB 저장 실패:", e);
        alert("회수 기록 저장 실패: " + (e.message || e));
      }
    })();
  }

  // 종결 취소 핸들러
  function handleCancelClosure(itemId) {
    (async function() {
      try {
        await reopenLostItem(itemId);
        updateLostItemClosed(setLostItems, itemId, false, "");
        console.log("✅ 종결 취소 완료");
      } catch(e) {
        console.error("종결 취소 실패:", e);
        alert("종결 취소 실패: " + (e.message || e));
      }
    })();
  }

  // 이번 주 다시 등록 핸들러 - DB 기록 삭제 후 폼 초기화
  function handleReregister() {
    if (!handoverDisplayRow || !myId) return;
    var week = handoverDisplayRow.week;
    var eqName = handoverDisplayRow.eq;

    (async function() {
      try {
        var eqId = await getEquipmentId(eqName);
        if (eqId) {
          await deleteHandoverAndRecovery(myId, eqId, week, eqName);
        }
        // 로컬 상태에서 해당 주차 인계 기록 제거
        setMyHandoverLogs(function(prev) {
          return prev.filter(function(log) { return !(log.week === week && log.eq === eqName); });
        });
        // 로컬 상태에서 해당 교구 분실/훼손 기록 제거
        setLostItems(function(prev) {
          return prev.filter(function(item) { return item.eq !== eqName; });
        });
        // 전역 handoverLogs에서도 제거
        setHandoverLogs(function(prev) {
          return prev.filter(function(l) { return !(l.instId === myId && l.week === week); });
        });
      } catch(e) {
        console.error("다시 등록 - 기록 삭제 실패:", e);
      }
    })();

    setHandoverWeekOffset(0);
    setHandoverCompleted(false);
    resetHandoverFormState();
  }

  // 강사 미등록 상태 안내
  if (dbSchedule && !myId) {
    return (
      <div style={{ fontFamily: "sans-serif", minHeight: "100vh", background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #E2E8F0", padding: "40px 32px", textAlign: "center", maxWidth: "320px" }}>
          <div style={{ fontSize: "40px", marginBottom: "14px" }}>🙋</div>
          <div style={{ fontSize: "16px", fontWeight: "800", color: "#0F172A", marginBottom: "8px" }}>강사 등록이 필요합니다</div>
          <div style={{ fontSize: "12px", color: "#64748B", lineHeight: "1.6" }}>
            관리자에게 강사 등록을 요청하세요.<br />
            등록 후 다시 로그인하면 이용할 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", minHeight: "100vh", background: "#F1F5F9", color: "#1E293B" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "0 14px", height: "50px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: "11px", fontWeight: "900" }}>B</span>
        </div>
        <span style={{ fontSize: "13px", fontWeight: "700", color: "#0F172A" }}>브레인힐 LMS</span>
        <span style={{ color: "#CBD5E1" }}>|</span>
        <span style={{ fontSize: "12px", color: "#6366F1", fontWeight: "700" }}>교구 관리</span>
      </div>

      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "14px 12px" }}>
        {/* 배너 */}
        <div style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)", borderRadius: "13px", padding: "15px 16px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", marginBottom: "3px" }}>MY PAGE | {sheetTitle || "실버체육 로테이션 2026"}</div>
            <div style={{ fontSize: "20px", fontWeight: "900", color: "#fff" }}>{myDisplayName} 강사</div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>로테이션 {myIdx + 1}번째</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>이번 주 교구</div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.6)", marginBottom: "2px" }}>{WEEK_LABELS[CURRENT_WEEK]}</div>
            <div style={{ fontSize: "21px", fontWeight: "900", color: "#fff" }}>{currentRow ? currentRow.eq : "-"}</div>
          </div>
        </div>

        {/* 요약 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px", marginBottom: "12px" }}>
          {(function() {
            var pendingRecoveries = lostItems.filter(function(item) { return item.status === "open" || item.status === "보관중"; });
            return [
              { icon: "📦", label: "이번 주 교구", value: currentRow ? currentRow.eq : "-", sub: WEEK_LABELS[CURRENT_WEEK] },
              { icon: "🔢", label: "현재 보유 수량", value: currentRow && currentRow.qty ? currentRow.qty + "개" : "-", sub: currentRow ? currentRow.eq : "" },
              { icon: "📅", label: "다음 인계 예정", value: (function() {
                if (!nextHandoverRow) return "-";
                var parts = nextHandoverRow.week.split("-");
                var m = parseInt(parts[0], 10);
                var w = parseInt(parts[1], 10);
                var d = w * 7;
                return m + "월 " + d + "일";
              })(), sub: nextHandoverRow ? ("다음: " + nextHandoverRow.to) : "-" },
              { icon: "⚠", label: "분실/회수 대기", value: pendingRecoveries.length + "건", sub: "인계 대기 중", alert: pendingRecoveries.length > 0 },
            ];
          })().map(function(c, i) {
            return (
              <div key={i} onClick={c.alert ? function() { setActiveTab("lost"); } : undefined}
                style={{ background: "#fff", borderRadius: "9px", padding: "11px 12px", border: c.alert ? "1.5px solid #F97316" : "1px solid #E2E8F0", cursor: c.alert ? "pointer" : "default" }}>
                <div style={{ fontSize: "9px", color: "#94A3B8", fontWeight: "600", marginBottom: "3px" }}>{c.icon} {c.label}</div>
                <div style={{ fontSize: "16px", fontWeight: "800", color: c.alert ? "#F97316" : "#0F172A" }}>{c.value}</div>
                <div style={{ fontSize: "9px", color: c.alert ? "#F97316" : "#64748B", marginTop: "2px" }}>{c.sub}</div>
              </div>
            );
          })}
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", gap: "2px", marginBottom: "10px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "3px" }}>
          {TABS.map(function(t) {
            var isActive = activeTab === t.key;
            var pendingRecoveries = lostItems.filter(function(item) { return item.status === "open" || item.status === "보관중"; });
            var hasBadge = t.key === "lost" && pendingRecoveries.length > 0;
            return (
              <button key={t.key} onClick={function() { setActiveTab(t.key); }}
                style={{ flex: 1, padding: "7px 2px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "600", position: "relative", background: isActive ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "transparent", color: isActive ? "#fff" : "#64748B" }}>
                {t.label}
                {hasBadge && (
                  <span style={{ position: "absolute", top: "3px", right: "3px", width: "7px", height: "7px", borderRadius: "50%", background: "#F97316", border: "1.5px solid #fff" }} />
                )}
              </button>
            );
          })}
        </div>

        {handoverDoneMsg ? (
          <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: "8px", padding: "9px 13px", marginBottom: "10px", fontSize: "12px", fontWeight: "700", color: "#16A34A" }}>
            ✓ {handoverDoneMsg}
          </div>
        ) : null}

        {/* 교구 일정 탭 */}
        {activeTab === "schedule" && (
          <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", overflow: "hidden" }}>

            {/* 시트 선택 탭 - 내가 속한 시트가 2개 이상일 때만 표시 */}
            {sheets.length > 1 && (
              <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #E2E8F0", overflowX: "auto", background: "#F8FAFC" }}>
                {sheets.map(function(sheet) {
                  var isActive = sheet.id === activeSheetId;
                  var isMine = mySheetIds.includes(sheet.id);
                  return (
                    <button key={sheet.id}
                      onClick={function() { setActiveSheetId(sheet.id); }}
                      style={{
                        padding: "9px 16px", border: "none", background: isActive ? "#fff" : "transparent",
                        borderBottom: isActive ? "2px solid #6366F1" : "2px solid transparent",
                        marginBottom: "-2px", cursor: "pointer", whiteSpace: "nowrap",
                        fontSize: "12px", fontWeight: isActive ? "800" : "500",
                        color: isActive ? "#6366F1" : "#94A3B8",
                        display: "flex", alignItems: "center", gap: "5px"
                      }}>
                      {sheet.title}
                      {isMine && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 로딩 상태 */}
            {loadingSheet && (
              <div style={{ padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: "12px" }}>
                ⏳ 스케줄 로드 중...
              </div>
            )}

            {!loadingSheet && (
            <div>
            <div style={{ padding: "11px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button onClick={function() { if (scheduleMonth > 1) setScheduleMonth(scheduleMonth - 1); }} disabled={scheduleMonth <= 1}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: scheduleMonth <= 1 ? "#F8FAFC" : "#F1F5F9", color: scheduleMonth <= 1 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: scheduleMonth <= 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>‹</button>
                <span style={{ fontSize: "13px", fontWeight: "800", color: "#0F172A", minWidth: "80px", textAlign: "center" }}>2026년 {scheduleMonth}월</span>
                <button onClick={function() { if (scheduleMonth < 12) setScheduleMonth(scheduleMonth + 1); }} disabled={scheduleMonth >= 12}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: scheduleMonth >= 12 ? "#F8FAFC" : "#F1F5F9", color: scheduleMonth >= 12 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: scheduleMonth >= 12 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>›</button>
                {scheduleMonth !== parseInt(CURRENT_WEEK.split("-")[0], 10) && (
                  <button onClick={function() { setScheduleMonth(parseInt(CURRENT_WEEK.split("-")[0], 10)); }}
                    style={{ fontSize: "9px", fontWeight: "700", color: "#6366F1", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: "5px", padding: "2px 7px", cursor: "pointer" }}>이번 달</button>
                )}
              </div>
              <span style={{ fontSize: "9px", color: "#94A3B8", background: "#F8FAFC", padding: "2px 7px", borderRadius: "4px" }}>읽기 전용</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "460px" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {["주차","교구","인계받은 강사","수량","다음 강사","상태"].map(function(h, i) {
                      return <th key={i} style={{ padding: "7px 9px", fontSize: "9px", fontWeight: "700", color: "#94A3B8", textAlign: "left", borderBottom: "1px solid #F1F5F9", whiteSpace: "nowrap" }}>{h}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {mySchedule.filter(function(row) { return parseInt(row.week.split("-")[0], 10) === scheduleMonth && row.eq !== "-"; }).length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: "12px" }}>이번 달 배정된 교구가 없습니다</td></tr>
                  ) : (
                    mySchedule.filter(function(row) { return parseInt(row.week.split("-")[0], 10) === scheduleMonth && row.eq !== "-"; }).map(function(row, i) {
                      var col = row.eq !== "-" ? eqColor(row.eq) : "#94A3B8";
                      var sLabel = "일정 확정", sColor = "#8B5CF6", sBg = "#F5F3FF";
                      if (row.handoverDone) { sLabel = "인계 완료"; sColor = "#22C55E"; sBg = "#F0FDF4"; }
                      else if (row.isCurrent) { sLabel = "진행 중"; sColor = "#3B82F6"; sBg = "#EFF6FF"; }
                      var actualLog = myHandoverLogs.find(function(log) { return log.week === row.week && log.eq === row.eq; });
                      var displayQty = actualLog && actualLog.receivedQty ? actualLog.receivedQty : row.qty;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #F8FAFC", background: row.isCurrent ? "#F5F3FF" : "transparent" }}>
                          <td style={{ padding: "8px 9px", fontSize: "11px", fontWeight: row.isCurrent ? "800" : "700", color: row.isCurrent ? "#6366F1" : "#374151", whiteSpace: "nowrap" }}>
                            {row.label}{row.isCurrent && <span style={{ marginLeft: "4px", fontSize: "8px", background: "#6366F1", color: "#fff", borderRadius: "4px", padding: "1px 4px", verticalAlign: "middle" }}>현재</span>}
                          </td>
                          <td style={{ padding: "8px 9px" }}>
                            {row.eq !== "-" ? <span style={{ background: col + "18", color: col, border: "1px solid " + col + "35", padding: "3px 7px", borderRadius: "9px", fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>{row.eq}</span> : <span style={{ color: "#CBD5E1" }}>-</span>}
                          </td>
                          <td style={{ padding: "8px 9px", fontSize: "11px", color: "#374151" }}>{row.from}</td>
                          <td style={{ padding: "8px 9px", fontSize: "11px", fontWeight: "600", color: displayQty < 50 ? "#EF4444" : "#0F172A" }}>{displayQty ? displayQty + "개" : "-"}</td>
                          <td style={{ padding: "8px 9px", fontSize: "11px", color: "#374151" }}>{row.to}</td>
                          <td style={{ padding: "8px 9px" }}><span style={{ background: sBg, color: sColor, padding: "2px 7px", borderRadius: "9px", fontSize: "9px", fontWeight: "700", whiteSpace: "nowrap" }}>{sLabel}</span></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "7px 13px", background: "#F8FAFC", borderTop: "1px solid #F1F5F9" }}>
              <span style={{ fontSize: "9px", color: "#94A3B8" }}>일정은 관리자가 설정합니다. 수정 필요시 관리자에게 문의하세요.</span>
            </div>
            </div> {/* !loadingSheet */}
          </div>
        )}

        {/* 이동 이력 탭 */}
        {activeTab === "history" && (
          <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ padding: "11px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button onClick={function() { if (historyMonth > 1) setHistoryMonth(historyMonth - 1); }} disabled={historyMonth <= 1}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: historyMonth <= 1 ? "#F8FAFC" : "#F1F5F9", color: historyMonth <= 1 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: historyMonth <= 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>‹</button>
                <span style={{ fontSize: "13px", fontWeight: "800", color: "#0F172A", minWidth: "80px", textAlign: "center" }}>2026년 {historyMonth}월</span>
                <button onClick={function() { if (historyMonth < 12) setHistoryMonth(historyMonth + 1); }} disabled={historyMonth >= 12}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: historyMonth >= 12 ? "#F8FAFC" : "#F1F5F9", color: historyMonth >= 12 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: historyMonth >= 12 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>›</button>
                {historyMonth !== parseInt(CURRENT_WEEK.split("-")[0], 10) && (
                  <button onClick={function() { setHistoryMonth(parseInt(CURRENT_WEEK.split("-")[0], 10)); }}
                    style={{ fontSize: "9px", fontWeight: "700", color: "#6366F1", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: "5px", padding: "2px 7px", cursor: "pointer" }}>이번 달</button>
                )}
              </div>
            </div>
            {(function() {
              var scheduleEqMap = {};
              mySchedule.forEach(function(row) { if (row.eq !== "-") scheduleEqMap[row.week] = row.eq; });
              var logByWeek = {};
              myHandoverLogs.forEach(function(item) {
                var scheduledEq = scheduleEqMap[item.week];
                if (scheduledEq && item.eq === scheduledEq) logByWeek[item.week] = item;
              });
              var filtered = mySchedule.filter(function(row) {
                var weekMonth = parseInt(row.week.split("-")[0], 10);
                var weekIdx = WEEKS.indexOf(row.week);
                return (weekIdx < currentWkIdx || (weekIdx === currentWkIdx && row.handoverDone)) && weekMonth === historyMonth && row.eq !== "-";
              }).map(function(row) {
                var log = logByWeek[row.week];
                return { week: row.week, eq: row.eq, qty: log ? (log.receivedQty || log.qty || 50) : 50, receivedQty: log ? log.receivedQty : null, transferMethod: log ? log.transferMethod : "delivery", note: log ? log.note : "", hasLog: !!log, diffType: log ? log.diffType : null, diffQty: log ? log.diffQty : null };
              });
              if (filtered.length === 0) {
                return <div style={{ padding: "32px 13px", textAlign: "center" }}><div style={{ fontSize: "24px", marginBottom: "8px" }}>📭</div><div style={{ fontSize: "12px", color: "#94A3B8", fontWeight: "600" }}>이번 달 이동 이력이 없습니다.</div></div>;
              }
              return filtered.map(function(item, i) {
                var col = eqColor(item.eq || "-");
                var hasNote = item.note && item.note.length > 0;
                var hasDiff = item.diffType && item.diffQty;
                return (
                  <div key={i} style={{ display: "flex", gap: "9px", padding: "11px 13px", borderBottom: "1px solid #F8FAFC", alignItems: "flex-start" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0, fontSize: "14px", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>📤</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#0F172A" }}>인계: {item.qty}개</span>
                        <span style={{ background: col + "18", color: col, border: "1px solid " + col + "35", padding: "1px 5px", borderRadius: "6px", fontSize: "10px", fontWeight: "700" }}>{item.eq || "-"}</span>
                        {item.transferMethod && <span style={{ fontSize: "9px", color: "#64748B" }}>{item.transferMethod === "delivery" ? "택배" : "직접전달"}</span>}
                        {!item.hasLog && <span style={{ background: "#F1F5F9", color: "#94A3B8", padding: "1px 5px", borderRadius: "5px", fontSize: "9px", fontWeight: "600" }}>자동완료</span>}
                        {hasDiff && <span style={{ background: item.diffType === "lost" ? "#FEF2F2" : "#FFF7ED", color: item.diffType === "lost" ? "#EF4444" : "#F97316", padding: "1px 5px", borderRadius: "5px", fontSize: "9px", fontWeight: "700" }}>{item.diffType === "lost" ? "분실" : "훼손"}: {item.diffQty}개</span>}
                        {hasNote ? <span style={{ background: "#FEF2F2", color: "#EF4444", padding: "1px 5px", borderRadius: "5px", fontSize: "9px", fontWeight: "700" }}>주의: {item.note}</span> : null}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <span style={{ fontSize: "9px", color: "#94A3B8" }}>{WEEK_LABELS[item.week] || item.week}</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* 인계 등록 탭 */}
        {activeTab === "handover" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {!handoverDisplayRow || handoverDisplayRow.eq === "-" ? (
              <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", padding: "32px 13px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>📭</div>
                <div style={{ fontSize: "12px", color: "#94A3B8", fontWeight: "600" }}>이번 주 배정된 교구가 없습니다.</div>
                <div style={{ fontSize: "10px", color: "#CBD5E1", marginTop: "4px" }}>관리자가 교구를 배정하면 인계 등록을 할 수 있습니다.</div>
              </div>
            ) : handoverCompleted ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: "11px", padding: "18px 16px", color: "#fff", textAlign: "center" }}>
                  <div style={{ fontSize: "28px", marginBottom: "6px" }}>✅</div>
                  <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "3px" }}>인계 등록 완료!</div>
                  <div style={{ fontSize: "11px", opacity: 0.85 }}>{WEEK_LABELS[handoverDisplayRow.week]} · {handoverDisplayRow.eq} · {handoverDisplayRow.to}에게 인계</div>
                </div>

                {handoverNextRow ? (
                  <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", padding: "16px 14px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: "#0F172A", marginBottom: "12px" }}>📬 다음 수령 예정</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#F8FAFC", borderRadius: "9px", padding: "12px 13px", marginBottom: "10px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: eqColor(handoverNextRow.eq) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>📦</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "2px" }}>다음 주 교구</div>
                        <div style={{ fontSize: "16px", fontWeight: "900", color: "#0F172A" }}>{handoverNextRow.eq}</div>
                        <div style={{ fontSize: "10px", color: "#6366F1", fontWeight: "700", marginTop: "2px" }}>{handoverNextRow.label}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "2px" }}>수령 예정 수량</div>
                        <div style={{ fontSize: "18px", fontWeight: "900", color: "#6366F1" }}>50개</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", fontSize: "11px" }}>
                      <div style={{ flex: 1, background: "#F8FAFC", borderRadius: "8px", padding: "10px 11px" }}>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "3px" }}>보내는 강사</div>
                        <div style={{ fontWeight: "700", color: "#0F172A" }}>{handoverNextRow.from}</div>
                      </div>
                      <div style={{ flex: 1, background: "#F8FAFC", borderRadius: "8px", padding: "10px 11px" }}>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "3px" }}>수령 주차</div>
                        <div style={{ fontWeight: "700", color: "#0F172A" }}>{handoverNextRow.label}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", padding: "24px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: "20px", marginBottom: "6px" }}>🎉</div>
                    <div style={{ fontSize: "12px", color: "#94A3B8", fontWeight: "600" }}>이번 달 남은 일정이 없습니다</div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={handleReregister}
                    style={{ flex: 1, padding: "12px", background: "#F1F5F9", color: "#6366F1", border: "1.5px solid #C7D2FE", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                    이번 주 다시 등록
                  </button>
                  {handoverNextRow && (
                    <button onClick={function() {
                      setHandoverWeekOffset(handoverWeekOffset + 1);
                      setHandoverCompleted(false);
                      resetHandoverFormState();
                    }}
                      style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                      다음 주 인계 등록 ({handoverNextRow.label})
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* 수령 확인 */}
                <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", padding: "14px 13px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: "#0F172A", marginBottom: "3px" }}>수령 확인</div>
                  <div style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "12px" }}>이전 강사({prevInst ? prevInst.name : "-"})로부터 수령한 교구 수량을 입력하세요</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#F8FAFC", borderRadius: "8px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "13px" }}>📦</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "1px" }}>이번 주 교구</div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: "#0F172A" }}>{handoverDisplayRow ? handoverDisplayRow.eq : "-"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "1px" }}>기준 수량</div>
                      <div style={{ fontSize: "14px", fontWeight: "800", color: "#6366F1" }}>50개</div>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>
                      실제 수령 수량 <span style={{ color: "#EF4444" }}>*</span>
                      <span style={{ fontSize: "9px", fontWeight: "600", color: "#94A3B8", marginLeft: "6px" }}>기준 수량: 50개 이하 입력</span>
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input type="number" min="0" max={handoverAllowExtra ? "999" : "50"} value={handoverReceivedQty}
                        onChange={function(e) {
                          var val = e.target.value;
                          if (val !== "" && parseInt(val) < 0) val = "0";
                          if (!handoverAllowExtra && val !== "" && parseInt(val) > 50) val = "50";
                          setHandoverReceivedQty(val);
                          var diff = 50 - parseInt(val || "0");
                          if (diff > 0) { setHandoverDiffQty(String(diff)); }
                          else { setHandoverDiffQty(""); setHandoverDiffType(null); }
                        }}
                        onKeyDown={function(e) { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                        placeholder="예: 48"
                        style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid " + (handoverReceivedQty && parseInt(handoverReceivedQty) < 50 ? "#FCA5A5" : handoverReceivedQty && parseInt(handoverReceivedQty) > 50 ? "#FCD34D" : "#E2E8F0"), fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box", color: handoverReceivedQty && parseInt(handoverReceivedQty) < 50 ? "#EF4444" : handoverReceivedQty && parseInt(handoverReceivedQty) > 50 ? "#D97706" : "#0F172A" }} />
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#64748B" }}>개</span>
                      {handoverReceivedQty && parseInt(handoverReceivedQty) < 50 && <span style={{ fontSize: "11px", fontWeight: "700", color: "#EF4444", background: "#FEF2F2", padding: "4px 8px", borderRadius: "6px", whiteSpace: "nowrap" }}>-{50 - parseInt(handoverReceivedQty)}개</span>}
                      {handoverReceivedQty && parseInt(handoverReceivedQty) === 50 && <span style={{ fontSize: "11px", fontWeight: "700", color: "#16A34A", background: "#F0FDF4", padding: "4px 8px", borderRadius: "6px" }}>정상</span>}
                      {handoverReceivedQty && parseInt(handoverReceivedQty) > 50 && <span style={{ fontSize: "11px", fontWeight: "700", color: "#D97706", background: "#FFFBEB", padding: "4px 8px", borderRadius: "6px", whiteSpace: "nowrap" }}>+{parseInt(handoverReceivedQty) - 50}개 초과</span>}
                    </div>
                    {handoverReceivedQty && parseInt(handoverReceivedQty) > 50 && (
                      <div style={{ marginTop: "10px", background: "#FFFBEB", border: "1.5px solid #FCD34D", borderRadius: "9px", padding: "12px 13px" }}>
                        <div style={{ fontSize: "10px", fontWeight: "800", color: "#D97706", marginBottom: "6px" }}>⚠ 기준 수량(50개) 초과 입력</div>
                        <div style={{ fontSize: "10px", color: "#64748B", marginBottom: "10px" }}>수령 수량이 기준보다 많습니다. 특별한 사유가 있는 경우에만 허용하세요.</div>
                        <div style={{ display: "flex", gap: "6px", marginBottom: handoverAllowExtra ? "10px" : "0" }}>
                          <button onClick={function() { setHandoverAllowExtra(false); setHandoverExtraNote(""); setHandoverReceivedQty("50"); setHandoverDiffQty(""); setHandoverDiffType(null); }}
                            style={{ flex: 1, padding: "8px", borderRadius: "7px", border: "2px solid " + (!handoverAllowExtra ? "#D97706" : "#E2E8F0"), background: !handoverAllowExtra ? "#FEF3C7" : "#fff", color: !handoverAllowExtra ? "#D97706" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>50개로 정정</button>
                          <button onClick={function() { setHandoverAllowExtra(true); }}
                            style={{ flex: 1, padding: "8px", borderRadius: "7px", border: "2px solid " + (handoverAllowExtra ? "#D97706" : "#E2E8F0"), background: handoverAllowExtra ? "#FEF3C7" : "#fff", color: handoverAllowExtra ? "#D97706" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>초과 수량 허용</button>
                        </div>
                        {handoverAllowExtra && (
                          <div>
                            <label style={{ fontSize: "10px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "4px" }}>초과 사유 <span style={{ color: "#EF4444" }}>*</span></label>
                            <input value={handoverExtraNote} onChange={function(e) { setHandoverExtraNote(e.target.value); }}
                              placeholder="예: 이전 강사가 보관 중이던 예비 교구 추가 수령"
                              style={{ width: "100%", padding: "8px 10px", borderRadius: "7px", border: "1.5px solid #FCD34D", fontSize: "11px", outline: "none", boxSizing: "border-box" }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 수량 차이 발생 시 */}
                {handoverReceivedQty && parseInt(handoverReceivedQty) < 50 && (
                  <div style={{ background: "#fff", borderRadius: "11px", border: "2px solid #FCA5A5", padding: "14px 13px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "14px" }}>⚠</span>
                      <div style={{ fontSize: "12px", fontWeight: "800", color: "#EF4444" }}>수량 차이 발생</div>
                    </div>
                    <div style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "14px" }}>기준 50개 대비 {50 - parseInt(handoverReceivedQty)}개 부족합니다. 유형을 선택해주세요.</div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                      <button onClick={function() { setHandoverDiffType("lost"); }} style={{ flex: 1, padding: "12px 8px", borderRadius: "9px", border: "2px solid " + (handoverDiffType === "lost" ? "#EF4444" : "#E2E8F0"), background: handoverDiffType === "lost" ? "#FEF2F2" : "#fff", cursor: "pointer" }}>
                        <div style={{ fontSize: "20px", marginBottom: "4px" }}>🔍</div>
                        <div style={{ fontSize: "11px", fontWeight: "800", color: handoverDiffType === "lost" ? "#EF4444" : "#374151" }}>분실</div>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "2px" }}>교구 위치 불명</div>
                      </button>
                      <button onClick={function() { setHandoverDiffType("damaged"); }} style={{ flex: 1, padding: "12px 8px", borderRadius: "9px", border: "2px solid " + (handoverDiffType === "damaged" ? "#F97316" : "#E2E8F0"), background: handoverDiffType === "damaged" ? "#FFF7ED" : "#fff", cursor: "pointer" }}>
                        <div style={{ fontSize: "20px", marginBottom: "4px" }}>🔧</div>
                        <div style={{ fontSize: "11px", fontWeight: "800", color: handoverDiffType === "damaged" ? "#F97316" : "#374151" }}>훼손</div>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "2px" }}>파손/사용 불가</div>
                      </button>
                      <button onClick={function() { setHandoverDiffType("both"); }} style={{ flex: 1, padding: "12px 8px", borderRadius: "9px", border: "2px solid " + (handoverDiffType === "both" ? "#8B5CF6" : "#E2E8F0"), background: handoverDiffType === "both" ? "#F5F3FF" : "#fff", cursor: "pointer" }}>
                        <div style={{ fontSize: "20px", marginBottom: "4px" }}>📋</div>
                        <div style={{ fontSize: "11px", fontWeight: "800", color: handoverDiffType === "both" ? "#8B5CF6" : "#374151" }}>혼합</div>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "2px" }}>분실+훼손 모두</div>
                      </button>
                    </div>
                    {handoverDiffType && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>상세 내용</label>
                          <textarea value={handoverDiffNote} onChange={function(e) { setHandoverDiffNote(e.target.value); }}
                            placeholder={handoverDiffType === "lost" ? "분실 경위, 발생 시점 등" : handoverDiffType === "damaged" ? "파손 상태, 훼손 원인 등" : "분실/훼손 상세 내용"}
                            rows={2} style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", resize: "none", boxSizing: "border-box" }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 인계 정보 */}
                <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", padding: "14px 13px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: "#0F172A", marginBottom: "12px" }}>인계 정보</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>전달 수량 <span style={{ color: "#EF4444" }}>*</span></label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input type="number" min="0" max={handoverReceivedQty ? handoverReceivedQty : "50"} value={handoverSendQty}
                          onChange={function(e) {
                            var val = e.target.value;
                            if (val !== "" && parseInt(val) < 0) val = "0";
                            var maxQty = handoverReceivedQty ? parseInt(handoverReceivedQty) : 50;
                            if (val !== "" && parseInt(val) > maxQty) val = String(maxQty);
                            setHandoverSendQty(val);
                          }}
                          onKeyDown={function(e) { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                          placeholder={handoverReceivedQty ? "최대 " + handoverReceivedQty + "개" : "수령 수량 먼저 입력"}
                          style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid " + (handoverSendQty && handoverReceivedQty && parseInt(handoverSendQty) < parseInt(handoverReceivedQty) ? "#FCA5A5" : "#E2E8F0"), fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box" }} />
                        <span style={{ fontSize: "12px", color: "#64748B" }}>개</span>
                        {handoverSendQty && handoverReceivedQty && parseInt(handoverSendQty) === parseInt(handoverReceivedQty) && <span style={{ fontSize: "10px", fontWeight: "700", color: "#16A34A", background: "#F0FDF4", padding: "4px 7px", borderRadius: "5px", whiteSpace: "nowrap" }}>정상</span>}
                        {handoverSendQty && handoverReceivedQty && parseInt(handoverSendQty) < parseInt(handoverReceivedQty) && <span style={{ fontSize: "10px", fontWeight: "700", color: "#EF4444", background: "#FEF2F2", padding: "4px 7px", borderRadius: "5px", whiteSpace: "nowrap" }}>-{parseInt(handoverReceivedQty) - parseInt(handoverSendQty)}개 부족</span>}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>인계 날짜 <span style={{ color: "#EF4444" }}>*</span></label>
                      <input type="date" value={handoverDate} onChange={function(e) { setHandoverDate(e.target.value); }} style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>{isLastInst ? "인계 대상" : "다음 강사"} <span style={{ color: "#EF4444" }}>*</span></label>
                      {isLastInst ? (
                        <div style={{ padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", fontWeight: "700", color: "#0F172A", background: "#F8FAFC" }}>본사</div>
                      ) : (
                        <select defaultValue={nextInst ? nextInst.name : ""} style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", background: "#fff", boxSizing: "border-box" }}>
                          {instList.map(function(inst) { return <option key={inst.id} value={inst.name}>{inst.name}</option>; })}
                        </select>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>이동 방법 <span style={{ color: "#EF4444" }}>*</span></label>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={function() { setHandoverMethod("delivery"); }} style={{ flex: 1, padding: "9px", border: "2px solid " + (handoverMethod === "delivery" ? "#6366F1" : "#E2E8F0"), borderRadius: "7px", background: handoverMethod === "delivery" ? "#EEF2FF" : "#fff", color: handoverMethod === "delivery" ? "#6366F1" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>택배</button>
                        <button onClick={function() { setHandoverMethod("direct"); }} style={{ flex: 1, padding: "9px", border: "2px solid " + (handoverMethod === "direct" ? "#6366F1" : "#E2E8F0"), borderRadius: "7px", background: handoverMethod === "direct" ? "#EEF2FF" : "#fff", color: handoverMethod === "direct" ? "#6366F1" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>직접전달</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 인계 등록 완료 버튼 */}
                <button onClick={handleHandoverComplete} style={{ padding: "13px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}>
                  인계 등록 완료
                </button>
              </>
            )}
          </div>
        )}

        {/* 회수 기록 탭 */}
        {activeTab === "lost" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", overflow: "hidden" }}>
              <div style={{ padding: "11px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#0F172A" }}>회수 기록</span>
                  <span style={{ fontSize: "9px", background: "#FEF2F2", color: "#EF4444", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>{lostItems.filter(function(i) { return i.type === "lost" && !i.closed; }).length}건 미종결</span>
                  <span style={{ fontSize: "9px", background: "#F1F5F9", color: "#64748B", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>{lostItems.filter(function(i) { return i.closed; }).length}건 종결</span>
                </div>
                <div style={{ fontSize: "9px", color: "#94A3B8" }}>인계 등록 탭에서 자동 기록</div>
              </div>
              {lostItems.length === 0 && <div style={{ padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: "11px" }}>분실/훼손 기록이 없습니다</div>}
              {lostItems.map(function(item) {
                var col = eqColor(item.eq);
                var isLost = item.type === "lost";
                var isDamaged = item.type === "damaged";
                var typeLabel = isLost ? "분실" : isDamaged ? "훼손" : "분실+훼손";
                var typeColor = isLost ? "#EF4444" : isDamaged ? "#F97316" : "#8B5CF6";
                var typeBg = isLost ? "#FEF2F2" : isDamaged ? "#FFF7ED" : "#F5F3FF";
                var typeIcon = item.closed ? "🔒" : (isLost ? "🔍" : isDamaged ? "🔧" : "📋");
                var isClosed = !!item.closed;
                return (
                  <div key={item.id} style={{ borderBottom: "1px solid #F1F5F9", opacity: isClosed ? 0.65 : 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "11px 13px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: isClosed ? "#F1F5F9" : typeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>{typeIcon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px", flexWrap: "wrap" }}>
                          <span style={{ background: col + "18", color: col, border: "1px solid " + col + "35", padding: "2px 7px", borderRadius: "7px", fontSize: "11px", fontWeight: "700" }}>{item.eq}</span>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: isClosed ? "#94A3B8" : typeColor }}>{item.qty}개 {typeLabel}</span>
                          {isClosed && <span style={{ fontSize: "9px", background: "#F1F5F9", color: "#64748B", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>종결</span>}
                        </div>
                        <div style={{ fontSize: "9px", color: "#94A3B8" }}>{item.reportDate} &nbsp;|&nbsp; {item.note}</div>
                        {isClosed && item.closeNote && <div style={{ fontSize: "9px", color: "#64748B", marginTop: "2px", fontStyle: "italic" }}>종결 사유: {item.closeNote}</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
                        <span style={{ fontSize: "9px", background: isClosed ? "#F1F5F9" : typeBg, color: isClosed ? "#64748B" : typeColor, padding: "2px 7px", borderRadius: "5px", fontWeight: "700" }}>{isClosed ? "종결" : typeLabel}</span>
                        {!isClosed && (
                          <button onClick={function() {
                            setRecoveryModal(item);
                            setRecoveryModalQty("");
                            setRecoveryModalMethod("");
                            setRecoveryModalDate(new Date().toISOString().split("T")[0]);
                            setRecoveryModalTransfer("delivery");
                          }} style={{ padding: "4px 9px", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: "6px", fontSize: "9px", fontWeight: "700", color: "#6366F1", cursor: "pointer", whiteSpace: "nowrap" }}>회수 등록</button>
                        )}
                        {isClosed && (
                          <button onClick={function() { handleCancelClosure(item.id); }} style={{ padding: "4px 9px", background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "9px", fontWeight: "700", color: "#64748B", cursor: "pointer", whiteSpace: "nowrap" }}>종결 취소</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 회수 모달 */}
        {recoveryModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 1000 }}>
            <div style={{ width: "100%", background: "#fff", borderRadius: "16px 16px 0 0", padding: "20px 16px 24px", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ fontSize: "16px", fontWeight: "800", color: "#0F172A" }}>회수 기록 등록</div>
                <button onClick={resetRecoveryModalState} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94A3B8" }}>✕</button>
              </div>

              <div style={{ background: "#F8FAFC", borderRadius: "9px", padding: "12px 13px", marginBottom: "16px" }}>
                <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "2px" }}>분실/훼손 교구</div>
                <div style={{ fontSize: "14px", fontWeight: "800", color: "#0F172A" }}>{recoveryModal.eq} · {recoveryModal.qty}개</div>
                <div style={{ fontSize: "9px", color: "#64748B", marginTop: "2px" }}>{recoveryModal.reportDate} · {recoveryModal.note}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>회수 수량 <span style={{ color: "#EF4444" }}>*</span></label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input type="number" min="0" max={recoveryModal.qty} value={recoveryModalQty}
                      onChange={function(e) {
                        var val = e.target.value;
                        if (val !== "" && parseInt(val) < 0) val = "0";
                        if (val !== "" && parseInt(val) > recoveryModal.qty) val = String(recoveryModal.qty);
                        setRecoveryModalQty(val);
                      }}
                      onKeyDown={function(e) { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                      placeholder="예: 2"
                      style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box" }} />
                    <span style={{ fontSize: "12px", color: "#64748B" }}>개</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>회수 방법 <span style={{ color: "#EF4444" }}>*</span></label>
                  <select value={recoveryModalMethod} onChange={function(e) { setRecoveryModalMethod(e.target.value); }}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", background: "#fff", boxSizing: "border-box" }}>
                    <option value="">선택하세요</option>
                    <option value="prev">이전 강사 회수</option>
                    <option value="post">다음 강사 회수</option>
                    <option value="office">본사 회수</option>
                    <option value="fulllost">완전 분실 처리</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>회수 날짜 <span style={{ color: "#EF4444" }}>*</span></label>
                  <input type="date" value={recoveryModalDate} onChange={function(e) { setRecoveryModalDate(e.target.value); }} style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>이동 방법</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={function() { setRecoveryModalTransfer("delivery"); }} style={{ flex: 1, padding: "9px", border: "2px solid " + (recoveryModalTransfer === "delivery" ? "#6366F1" : "#E2E8F0"), borderRadius: "7px", background: recoveryModalTransfer === "delivery" ? "#EEF2FF" : "#fff", color: recoveryModalTransfer === "delivery" ? "#6366F1" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>택배</button>
                    <button onClick={function() { setRecoveryModalTransfer("direct"); }} style={{ flex: 1, padding: "9px", border: "2px solid " + (recoveryModalTransfer === "direct" ? "#6366F1" : "#E2E8F0"), borderRadius: "7px", background: recoveryModalTransfer === "direct" ? "#EEF2FF" : "#fff", color: recoveryModalTransfer === "direct" ? "#6366F1" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>직접전달</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button onClick={resetRecoveryModalState} style={{ flex: 1, padding: "12px", background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>취소</button>
                  <button onClick={handleRecoverySave} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>회수 등록</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
