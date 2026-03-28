import { useState, useEffect, useRef } from "react";
import { sbGet, sbPost, sbPatch, sbUpsert, sbDelete } from "../lib/supabaseClient";
import { WEEKS, WEEK_LABELS, INITIAL_INSTRUCTORS, INIT_SCHEDULE, EQUIPMENT_LIST, BASE_QTY, getCurrentWeek } from "../lib/constants";
import { calcWeekColors, getWeekPalette, getEqPalette, EQ_COLORS } from "../lib/colorUtils";

const CURRENT_WEEK = getCurrentWeek();

var PALETTE = [
  { bg: "#0D2340", border: "#3B82F6", text: "#93C5FD", label: "파랑" },
  { bg: "#0A2E1E", border: "#22C55E", text: "#86EFAC", label: "초록" },
  { bg: "#2D1500", border: "#F97316", text: "#FDC97E", label: "주황" },
  { bg: "#251040", border: "#A855F7", text: "#D8B4FE", label: "보라" },
  { bg: "#2D0F1A", border: "#EF4444", text: "#FCA5A5", label: "빨강" },
];

var WEEK_COLOR_INDEX = {};

function eqColor(name) {
  var idx = EQUIPMENT_LIST.indexOf(name);
  return idx >= 0 ? EQ_COLORS[idx % EQ_COLORS.length] : "#475569";
}

function AdminView({ handoverLogs, dbInstructors, dbSchedule, dbEquipment, setHandoverLogs, setDbInstructors, onSaved, onSheetTitleChange }) {
  // -- 시트 목록 state ----------------------------------------------
  const initInstructors = dbInstructors && dbInstructors.length > 0 ? dbInstructors : INITIAL_INSTRUCTORS;
  const initSchedule    = dbSchedule && Object.keys(dbSchedule).length > 0 ? dbSchedule : INIT_SCHEDULE;
  const [sheets, setSheets] = useState([
    { id: "sheet1", dbSheetId: "main", title: "실버체육 로테이션 2026", instructors: initInstructors, schedule: initSchedule }
  ]);

  // DB 데이터가 로드되면 메인 시트 갱신 (초기 1회만)
  const isInitialLoad = useRef(true);
  useEffect(function() {
    if (!isInitialLoad.current) return; // 초기 로드 이후엔 실행 안 함
    if (dbInstructors && dbSchedule && Object.keys(dbSchedule).length > 0) {
      isInitialLoad.current = false;
      setSheets(function(prev) {
        return prev.map(function(s) {
          if (s.id !== "sheet1") return s;
          var mergedSchedule = Object.assign({}, s.schedule, dbSchedule);
          return Object.assign({}, s, { instructors: dbInstructors, schedule: mergedSchedule });
        });
      });
    } else if (dbInstructors && dbInstructors.length > 0) {
      isInitialLoad.current = false;
      setSheets(function(prev) {
        return prev.map(function(s) {
          if (s.id !== "sheet1") return s;
          var mergedSchedule = Object.assign({}, s.schedule);
          dbInstructors.forEach(function(inst) {
            if (!mergedSchedule[inst.id]) {
              mergedSchedule[inst.id] = {};
              WEEKS.forEach(function(w) { mergedSchedule[inst.id][w] = "-"; });
            }
          });
          return Object.assign({}, s, { instructors: dbInstructors, schedule: mergedSchedule });
        });
      });
    }
  }, [dbInstructors, dbSchedule]);
  const [activeSheetId, setActiveSheetId] = useState("sheet1");
  const [editingSheetId, setEditingSheetId] = useState(null);
  const [editingSheetTitle, setEditingSheetTitle] = useState("");
  const [showNewSheetModal, setShowNewSheetModal] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null); // 마지막 저장 시각
  const [hasUnsaved, setHasUnsaved] = useState(false); // 미저장 변경사항 여부

  // 활성 시트 변경 시 부모(App)에 시트 제목 알림
  useEffect(function() {
    var title = activeSheet ? activeSheet.title : "실버체육 로테이션 2026";
    if (onSheetTitleChange) onSheetTitleChange(title);
  }, [activeSheetId, sheets]);

  function showToast(msg, type) { setToast({ msg: msg, type: type || "info" }); setTimeout(function() { setToast(null); }, type === "warn" ? 4000 : 2000); }

  var activeSheet = sheets.find(function(s) { return s.id === activeSheetId; }) || sheets[0];

  function updateSheet(updater) {
    setSheets(function(prev) {
      return prev.map(function(s) { return s.id === activeSheetId ? Object.assign({}, s, updater(s)) : s; });
    });
  }

  function addSheet() {
    if (!newSheetTitle.trim()) return;
    var id = "sheet" + Date.now();
    var dbSheetId = "sheet_" + Date.now(); // DB에 저장될 고유 sheet_id
    setSheets(function(prev) { return prev.concat([{ id: id, dbSheetId: dbSheetId, title: newSheetTitle.trim(), instructors: [], schedule: {} }]); });
    setActiveSheetId(id);
    setNewSheetTitle("");
    setShowNewSheetModal(false);
    showToast(newSheetTitle.trim() + " 시트 추가");
  }

  function removeSheet(id) {
    if (sheets.length === 1) { showToast("마지막 시트는 삭제할 수 없습니다"); return; }
    setSheets(function(prev) { return prev.filter(function(s) { return s.id !== id; }); });
    if (activeSheetId === id) setActiveSheetId(sheets.find(function(s) { return s.id !== id; }).id);
    showToast("시트 삭제");
  }

  function saveSheetTitle(id) {
    if (editingSheetTitle.trim()) {
      setSheets(function(prev) { return prev.map(function(s) { return s.id === id ? Object.assign({}, s, { title: editingSheetTitle.trim() }) : s; }); });
    }
    setEditingSheetId(null);
    setEditingSheetTitle("");
  }

  // -- 현재 시트 데이터 ----------------------------------------------
  var instructors = activeSheet.instructors;
  var schedule = activeSheet.schedule;
  var activeDbSheetId = activeSheet.dbSheetId || "main"; // DB에 저장될 sheet_id

  function setInstructors(fn) { updateSheet(function(s) { return { instructors: typeof fn === "function" ? fn(s.instructors) : fn }; }); }
  function setSchedule(fn) { updateSheet(function(s) { return { schedule: typeof fn === "function" ? fn(s.schedule) : fn }; }); }

  // -- 시트별 독립 state ---------------------------------------------
  const [shiftAmounts, setShiftAmounts] = useState({});
  const [shiftDirs, setShiftDirs] = useState({});
  const [selectedFromIdxs, setSelectedFromIdxs] = useState({});
  const [newNames, setNewNames] = useState({});
  const [newNotes, setNewNotes] = useState({});
  const [newShiftAmounts, setNewShiftAmounts] = useState({});

  // -- 교구 선택 팝업 state -----------------------------------------
  const [eqPopup, setEqPopup] = useState(null); // { instId, week, currentVal, logs, view:"select"|"history" }
  const [eqSearch, setEqSearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null); // { type:"single"|"selected", id?, name? }
  const [hoveredDelId, setHoveredDelId] = useState(null);
  const [eqList, setEqList] = useState(EQUIPMENT_LIST);
  const [eqLoading, setEqLoading] = useState(false);
  const [userList, setUserList] = useState([]); // user 테이블 전체 목록
  const [userSearch, setUserSearch] = useState(""); // 강사 검색어
  const [selectedUserId, setSelectedUserId] = useState(""); // 선택된 유저 (user_id 문자열)
  const [showUserDropdown, setShowUserDropdown] = useState(false); // 드롭다운 표시 여부
  const [replaceModal, setReplaceModal] = useState(null); // { instId, instName } 교체 모달
  const [replaceSearch, setReplaceSearch] = useState(""); // 교체 검색어
  const [replaceSelectedUser, setReplaceSelectedUser] = useState(null); // 교체할 유저
  const popupRef = useRef(null);
  const userSearchRef = useRef(null);

  // Supabase에서 교구 목록 fetch
  useEffect(function() {
    setEqLoading(true);
    sbGet("equipment?select=name&is_active=eq.true&order=name.asc")
      .then(function(data) {
        if (Array.isArray(data) && data.length > 0) {
          setEqList(data.map(function(r) { return r.name; }));
        }
        setEqLoading(false);
      })
      .catch(function() {
        setEqLoading(false);
      });
  }, []);

  // 팝업 바깥 클릭 시 닫기
  useEffect(function() {
    if (!eqPopup) return;
    function handleOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setEqPopup(null);
        setEqSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return function() { document.removeEventListener("mousedown", handleOutside); };
  }, [eqPopup]);

  // auth 유저 목록 로드 — user 테이블 전체 조회
  useEffect(function() {
    sbGet("user?select=user_id,user_account,name,email,phone,address&order=name.asc")
      .then(function(data) {
        if (Array.isArray(data)) setUserList(data);
      })
      .catch(function(e) { console.warn("유저 목록 로드 실패:", e); });
  }, []);

  // 전체 스케줄 DB 저장 함수
  async function saveAllToDb() {
    if (!dbEquipment) { showToast("DB 미연결 상태입니다", "warn"); return; }
    setSaving(true);
    try {
      var eqMap = {};
      dbEquipment.forEach(function(e) { eqMap[e.name] = e.id; });

      // 현재 시트의 모든 배정을 저장
      var inserts = [];
      instructors.forEach(function(inst) {
        WEEKS.forEach(function(w) {
          var val = (schedule[inst.id] && schedule[inst.id][w]) || "-";
          if (val !== "-") {
            inserts.push({
              sheet_id: activeDbSheetId,
              instructor_id: inst.id,
              equipment_id: eqMap[val] || null,
              year: 2026,
              week: w
            });
          }
        });
      });

      // 먼저 기존 데이터 모두 삭제
      try {
        await sbDelete("rotation_schedule?year=eq.2026&sheet_id=eq." + activeDbSheetId);
        console.log("기존 rotation_schedule 데이터 삭제 완료");
      } catch(e) {
        console.warn("기존 데이터 삭제 중 오류:", e);
      }

      // 배치 insert (50개씩 분할)
      var batchSize = 50;
      for (var i = 0; i < inserts.length; i += batchSize) {
        var batch = inserts.slice(i, i + batchSize);
        await sbPost("rotation_schedule", batch);
      }

      setSavedAt(new Date());
      setHasUnsaved(false);
      showToast("로테이션표 저장 완료! ✓");
      if (onSaved) onSaved(); // 강사 뷰 스케줄 즉시 반영
    } catch(e) {
      showToast("저장 실패: " + e.message, "warn");
    } finally {
      setSaving(false);
    }
  }

  // ── 색상 로직 ──────────────────────────────────────────────
  // 1번 강사의 주차 순서대로 색상 인덱스 고정
  // (교구가 채워진 주차 순서: 1번째=파랑, 2번째=초록, 3번째=주황, 4번째=보라, 5번째=핑크, 반복)
  var firstInstWeekPalMap = (function() {
    var map = {}; // week → palette index (0~4)
    var ci = 0;
    var firstInst = instructors[0];
    if (firstInst && schedule[firstInst.id]) {
      WEEKS.forEach(function(w) {
        var eq = schedule[firstInst.id][w];
        if (eq && eq !== "-") {
          map[w] = ci % 5;
          ci++;
        } else {
          map[w] = -1;
        }
      });
    }
    return map;
  })();

  // 강사 rowIdx번째 강사의 week 셀 색상 조회
  // rowIdx × shiftAmount만큼 역방향으로 거슬러서 1번 강사의 주차 색상 참조
  // → "1번 강사 기준 색상이 shiftAmount 간격으로 아래 강사에게 밀려 내려오는" 효과
  function getInstColPal(week, rowIdx) {
    var weekIdx = WEEKS.indexOf(week);
    var srcWeekIdx = weekIdx - rowIdx * shiftAmount;
    // 범위 밖이면 wrap (순환)
    var wrappedIdx = ((srcWeekIdx % WEEKS.length) + WEEKS.length) % WEEKS.length;
    var srcWeek = WEEKS[wrappedIdx];
    var palIdx = firstInstWeekPalMap[srcWeek];
    if (palIdx === undefined || palIdx < 0) return null;
    return PALETTE[palIdx];
  }

  var shiftAmount = shiftAmounts[activeSheetId] || 1;
  var shiftDir = shiftDirs[activeSheetId] || "forward";
  var selectedFromIdx = selectedFromIdxs[activeSheetId] !== undefined ? selectedFromIdxs[activeSheetId] : null;
  var newName = newNames[activeSheetId] || "";
  var newNote = newNotes[activeSheetId] || "";
  var newShiftAmount = newShiftAmounts[activeSheetId] !== undefined ? newShiftAmounts[activeSheetId] : 1;

  function setShiftAmount(v) { setShiftAmounts(function(p) { return Object.assign({}, p, { [activeSheetId]: typeof v === "function" ? v(shiftAmount) : v }); }); }
  function setShiftDir(v) { setShiftDirs(function(p) { return Object.assign({}, p, { [activeSheetId]: v }); }); }
  function setSelectedFromIdx(v) { setSelectedFromIdxs(function(p) { return Object.assign({}, p, { [activeSheetId]: v }); }); }
  function setNewName(v) { setNewNames(function(p) { return Object.assign({}, p, { [activeSheetId]: v }); }); }
  function setNewNote(v) { setNewNotes(function(p) { return Object.assign({}, p, { [activeSheetId]: v }); }); }
  function setNewShiftAmount(v) { setNewShiftAmounts(function(p) { return Object.assign({}, p, { [activeSheetId]: typeof v === "function" ? v(newShiftAmount) : v }); }); }

  var selectedIds = selectedFromIdx !== null
    ? instructors.slice(selectedFromIdx).map(function(i) { return i.id; })
    : null;

  function shiftAll() {
    var n = shiftDir === "forward" ? shiftAmount : -shiftAmount;
    var targets = selectedIds || instructors.map(function(i) { return i.id; });

    // 연도 경계 순환 감지: 이동 후 wrap-around가 발생하는지 확인
    var firstInst = targets[0];
    var curIdx = WEEKS.indexOf(CURRENT_WEEK);
    var wouldWrap = false;
    if (firstInst) {
      WEEKS.forEach(function(week, wIdx) {
        var srcIdx = ((wIdx - n) % WEEKS.length + WEEKS.length) % WEEKS.length;
        // 원래 순서상 앞에 있던 주차가 뒤로 오거나, 뒤에 있던 주차가 앞으로 오면 순환
        if (n > 0 && srcIdx > wIdx) wouldWrap = true;
        if (n < 0 && srcIdx < wIdx) wouldWrap = true;
      });
    }

    setSchedule(function(prev) {
      var next = Object.assign({}, prev);
      targets.forEach(function(id) {
        next[id] = {};
        WEEKS.forEach(function(week, wIdx) {
          var srcIdx = ((wIdx - n) % WEEKS.length + WEEKS.length) % WEEKS.length;
          next[id][week] = (prev[id] && prev[id][WEEKS[srcIdx]]) || "-";
        });
      });
      return next;
    });
    var label = selectedIds ? (instructors[selectedFromIdx].name + " 포함 " + selectedIds.length + "명") : "전체";
    var dirLabel = shiftDir === "forward" ? "뒤로 → " : "← 앞으로 ";
    showToast(label + " 교구 " + dirLabel + shiftAmount + "주 이동 완료");
    if (wouldWrap) {
      setTimeout(function() {
        showToast("⚠ 연도 경계 순환 — 12월 4주와 1월 1주가 연결되어 이전 연도 데이터가 표시될 수 있습니다", "warn");
      }, 1800);
    }
  }

  function addInstructor() {
    if (!selectedUserId) { showToast("추가할 유저를 선택하세요", "warn"); return; }
    var selectedUser = userList.find(function(u) { return String(u.user_id) === String(selectedUserId); });
    if (!selectedUser) return;

    (async function() {
      try {
        var res = await sbPost("instructors", {
          name: newName.trim() || selectedUser.name,
          note: newNote.trim() || null,
          is_active: true,
          sort_order: instructors.length + 1
        });
        
        // DB 저장 성공 후 처리
        if (res && res[0]) {
          var savedInst = res[0];
          var savedInstId = savedInst.id;
          
          // 새 강사의 교구 배정 생성 (마지막 강사 기준)
          var lastInst = instructors[instructors.length - 1];
          var newRow = {};
          var n = newShiftAmount;
          WEEKS.forEach(function(week, wIdx) {
            var srcIdx = ((wIdx - n) % WEEKS.length + WEEKS.length) % WEEKS.length;
            newRow[week] = (lastInst && schedule[lastInst.id] && schedule[lastInst.id][WEEKS[srcIdx]]) || "-";
          });
          
          // 현재 활성 시트에 직접 강사 추가 (setDbInstructors 사용 안 함 → sheet1 덮어쓰기 방지)
          var newInstEntry = {
            id: savedInstId,
            name: savedInst.name,
            region: savedInst.region || "",
            note: savedInst.note || "",
            sort_order: savedInst.sort_order
          };
          setInstructors(function(prev) {
            return prev.concat([newInstEntry]);
          });

          // 새 강사 스케줄 현재 시트에 반영
          setSchedule(function(prev) {
            var next = Object.assign({}, prev);
            next[savedInstId] = newRow;
            return next;
          });

          // rotation_schedule DB 저장
          if (dbEquipment) {
            var eqMap = {};
            dbEquipment.forEach(function(e) { eqMap[e.name] = e.id; });
            var scheduleUpserts = [];
            WEEKS.forEach(function(w) {
              var val = newRow[w];
              if (val && val !== "-" && eqMap[val]) {
                scheduleUpserts.push({
                  sheet_id: activeDbSheetId,
                  instructor_id: savedInstId,
                  equipment_id: eqMap[val],
                  year: 2026,
                  week: w
                });
              }
            });
            if (scheduleUpserts.length > 0) {
              await sbUpsert("rotation_schedule", scheduleUpserts);
              console.log("✅ rotation_schedule 저장:", scheduleUpserts.length, "건");
            }
          }
          
          setNewName(""); 
          setNewNote("");
          setSelectedUserId("");
          setUserSearch("");
          showToast(savedInst.name + " 강사 추가 완료!");
        }
      } catch(e) {
        console.error("강사 DB 저장 실패:", e);
        showToast("강사 DB 저장 실패: " + e.message, "warn");
      }
    })();
  }

  function removeInstructor(id) {
    (async function() {
      try {
        // 1. rotation_schedule 삭제
        await sbDelete("rotation_schedule?instructor_id=eq." + id + "&year=eq.2026&sheet_id=eq." + activeDbSheetId);
        // 2. handover_logs 삭제
        await sbDelete("handover_logs?instructor_id=eq." + id);
        // 3. instructors 테이블에서 삭제
        await sbDelete("instructors?id=eq." + id);
        console.log("✅ 강사 DB 삭제 완료:", id);
      } catch(e) {
        console.error("강사 삭제 실패:", e);
        showToast("강사 삭제 실패: " + e.message, "warn");
      }
    })();

    setInstructors(function(prev) { return prev.filter(function(i) { return i.id !== id; }); });
    setSchedule(function(prev) { var n = Object.assign({}, prev); delete n[id]; return n; });
  }

  function removeSelected() {
    if (!selectedIds || selectedIds.length === 0) return;
    var names = selectedIds.map(function(id) { return (instructors.find(function(i) { return i.id === id; }) || {}).name || id; });
    setConfirmTarget({ type: "selected", names: names, ids: selectedIds.slice() });
  }

  function doRemoveSelected(ids) {
    (async function() {
      try {
        for (var id of ids) {
          // 1. rotation_schedule 삭제
          await sbDelete("rotation_schedule?instructor_id=eq." + id + "&year=eq.2026&sheet_id=eq." + activeDbSheetId);
          // 2. handover_logs 삭제
          await sbDelete("handover_logs?instructor_id=eq." + id);
          // 3. instructors 테이블에서 삭제
          await sbDelete("instructors?id=eq." + id);
        }
        console.log("✅ 선택 강사 DB 삭제 완료:", ids.length, "명");
      } catch(e) {
        console.error("선택 강사 삭제 실패:", e);
        showToast("삭제 실패: " + e.message, "warn");
      }
    })();

    setInstructors(function(prev) { return prev.filter(function(i) { return !ids.includes(i.id); }); });
    setSchedule(function(prev) { var n = Object.assign({}, prev); ids.forEach(function(id) { delete n[id]; }); return n; });
    setSelectedFromIdx(null);
    setConfirmTarget(null);
    showToast(ids.length + "명 삭제 완료", "warn");
  }

  function doRemoveSingle(id, name) {
    removeInstructor(id);
    setConfirmTarget(null);
    setHoveredDelId(null);
    showToast(name + " 삭제 완료", "warn");
  }

  // 강사 교체 — rotation_schedule/handover_logs는 유지, instructors name/region만 변경
  async function doReplaceInstructor() {
    if (!replaceModal || !replaceSelectedUser) return;
    var instId = replaceModal.instId;
    var newName = replaceSelectedUser.name;
    var newRegion = replaceSelectedUser.region || null;

    try {
      // 1. instructors 테이블 name, region 업데이트
      await sbPatch("instructors?id=eq." + instId, {
        name: newName,
        region: newRegion,
      });

      // 2. 현재 활성 시트 강사 목록만 업데이트 (setDbInstructors 제거 → sheet1 덮어쓰기 방지)
      setInstructors(function(prev) {
        return prev.map(function(i) {
          if (i.id !== instId) return i;
          return Object.assign({}, i, { name: newName, region: newRegion || "" });
        });
      });

      showToast(replaceModal.instName + " → " + newName + " 교체 완료!");
      setReplaceModal(null);
      setReplaceSearch("");
      setReplaceSelectedUser(null);
    } catch(e) {
      showToast("교체 실패: " + e.message, "warn");
    }
  }

  // 셀 변경 + 아래 강사 자동 편성
  // instId: 변경한 강사, week: 변경한 주차, newVal: 새 교구값
  // 아래 강사들에게 shiftAmount 주 간격으로 순차 자동 편성
  function applyCellAndCascade(instId, week, newVal) {
    var instIdx = instructors.findIndex(function(i) { return i.id === instId; });
    var weekIdx = WEEKS.indexOf(week);

    // 변경사항 미리 계산 (setSchedule 콜백 외부에서)
    var changes = [];
    changes.push({ instId: instId, week: week, val: newVal });
    for (var i = instIdx + 1; i < instructors.length; i++) {
      var gap = (i - instIdx) * shiftAmount;
      var targetWeekIdx = weekIdx + gap;
      if (targetWeekIdx >= WEEKS.length) break;
      var targetWeek = WEEKS[targetWeekIdx];
      changes.push({ instId: instructors[i].id, week: targetWeek, val: newVal });
    }

    // DB 저장: 변경된 셀들을 Supabase에 upsert
    async function saveToDb() {
      if (!dbEquipment || dbEquipment.length === 0) {
        console.log("DB 교구 정보 없음, DB 저장 스킵");
        return;
      }
      try {
        console.log("DB 저장 시작. 변경사항:", changes);
        var eqMap = {};
        dbEquipment.forEach(function(e) { eqMap[e.name] = e.id; });
        console.log("교구 맵:", eqMap);
        
        var upserts = changes
          .filter(function(c) { return c.val !== "-"; })
          .map(function(c) {
            var eqId = eqMap[c.val];
            console.log("교구:", c.val, "-> ID:", eqId);
            return {
              sheet_id: activeDbSheetId,
              instructor_id: c.instId,
              equipment_id: eqId || null,
              year: 2026,
              week: c.week
            };
          });
        var deletes = changes.filter(function(c) { return c.val === "-"; });

        console.log("Upsert 데이터:", upserts);
        console.log("Delete 데이터:", deletes);

        // 먼저 변경할 셀들의 기존 데이터 삭제 (중복 키 오류 방지)
        for (var c of changes) {
          try {
            await sbDelete("rotation_schedule?instructor_id=eq." + c.instId + "&week=eq." + c.week + "&year=eq.2026&sheet_id=eq." + activeDbSheetId);
          } catch(e) {
            // 삭제할 데이터가 없으면 무시
          }
        }
        console.log("기존 데이터 삭제 완료");

        // 새 데이터 삽입
        if (upserts.length > 0) {
          var upsertRes = await sbPost("rotation_schedule", upserts);
          console.log("Insert 성공:", upsertRes);
        }
        console.log("DB 저장 완료");
      } catch(e) {
        console.error("DB 저장 실패:", e);
        showToast("DB 저장 실패: " + e.message, "warn");
      }
    }

    // 상태 업데이트
    setSchedule(function(prev) {
      var n = Object.assign({}, prev);
      n[instId] = Object.assign({}, prev[instId]);
      n[instId][week] = newVal;
      for (var i = instIdx + 1; i < instructors.length; i++) {
        var gap = (i - instIdx) * shiftAmount;
        var targetWeekIdx = weekIdx + gap;
        if (targetWeekIdx >= WEEKS.length) break;
        var targetWeek = WEEKS[targetWeekIdx];
        n[instructors[i].id] = Object.assign({}, prev[instructors[i].id]);
        n[instructors[i].id][targetWeek] = newVal;
      }
      return n;
    });
    
    // DB 저장 실행
    saveToDb();
    setHasUnsaved(true);
  }

  return (
    <div style={{ fontFamily: "sans-serif", minHeight: "100vh", background: "#0F1117", color: "#E2E8F0" }}>
      {/* 상단 헤더 */}
      <div style={{ background: "#161B27", borderBottom: "1px solid #1E293B", padding: "0 16px", height: "50px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: "11px", fontWeight: "900" }}>B</span>
        </div>
        <span style={{ fontSize: "13px", fontWeight: "700", color: "#F1F5F9" }}>브레인힐 LMS</span>
        <span style={{ color: "#334155" }}>|</span>
        <span style={{ fontSize: "12px", color: "#818CF8", fontWeight: "600" }}>관리자 | 로테이션 설정</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {savedAt && !hasUnsaved && (
            <span style={{ fontSize: "10px", color: "#22C55E" }}>
              ✓ 저장됨 {savedAt.getHours().toString().padStart(2,"0")}:{savedAt.getMinutes().toString().padStart(2,"0")}
            </span>
          )}
          {hasUnsaved && (
            <span style={{ fontSize: "10px", color: "#F59E0B" }}>● 미저장 변경사항</span>
          )}
          <button onClick={saveAllToDb} disabled={saving}
            style={{ padding: "6px 16px", background: saving ? "#334155" : hasUnsaved ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#1E293B", color: saving ? "#64748B" : hasUnsaved ? "#fff" : "#475569", border: "1px solid " + (hasUnsaved ? "transparent" : "#334155"), borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer", boxShadow: hasUnsaved ? "0 2px 8px rgba(99,102,241,0.4)" : "none", transition: "all 0.2s" }}>
            {saving ? "저장 중..." : "💾 저장하기"}
          </button>
          <div style={{ fontSize: "10px", background: "#1E293B", color: "#64748B", padding: "3px 8px", borderRadius: "4px" }}>관리자</div>
        </div>
      </div>

      {/* 시트 탭 바 */}
      <div style={{ background: "#161B27", borderBottom: "1px solid #1E293B", padding: "0 14px", display: "flex", alignItems: "flex-end", gap: "2px", overflowX: "auto" }}>
        {sheets.map(function(sheet) {
          var isActive = sheet.id === activeSheetId;
          return (
            <div key={sheet.id} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px 6px", borderRadius: "8px 8px 0 0", background: isActive ? "#0F1117" : "transparent", border: isActive ? "1px solid #1E293B" : "1px solid transparent", borderBottom: isActive ? "1px solid #0F1117" : "none", cursor: "pointer", flexShrink: 0, marginBottom: isActive ? "-1px" : "0" }}
              onClick={function() { setActiveSheetId(sheet.id); setEditCell(null); }}>
              {editingSheetId === sheet.id ? (
                <input
                  autoFocus
                  value={editingSheetTitle}
                  onChange={function(e) { setEditingSheetTitle(e.target.value); }}
                  onBlur={function() { saveSheetTitle(sheet.id); }}
                  onKeyDown={function(e) { if (e.key === "Enter") saveSheetTitle(sheet.id); if (e.key === "Escape") { setEditingSheetId(null); } }}
                  onClick={function(e) { e.stopPropagation(); }}
                  style={{ background: "#1E293B", border: "1px solid #6366F1", borderRadius: "4px", color: "#F1F5F9", fontSize: "11px", fontWeight: "700", padding: "2px 6px", outline: "none", width: "120px" }}
                />
              ) : (
                <span
                  onDoubleClick={function(e) { e.stopPropagation(); setEditingSheetId(sheet.id); setEditingSheetTitle(sheet.title); }}
                  style={{ fontSize: "11px", fontWeight: isActive ? "700" : "500", color: isActive ? "#F1F5F9" : "#64748B", whiteSpace: "nowrap" }}>
                  {sheet.title}
                </span>
              )}
              {sheets.length > 1 && (
                <button onClick={function(e) { e.stopPropagation(); removeSheet(sheet.id); }}
                  style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: "11px", padding: "0 0 0 2px", lineHeight: 1, display: "flex", alignItems: "center" }}>x</button>
              )}
            </div>
          );
        })}
        {/* 새 시트 추가 버튼 */}
        <button onClick={function() { setShowNewSheetModal(true); setNewSheetTitle(""); }}
          style={{ padding: "8px 10px 6px", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "16px", lineHeight: 1, flexShrink: 0, marginBottom: "0" }}
          title="새 시트 추가">+</button>
      </div>

      <div style={{ padding: "14px 14px 0" }}>
        {/* 툴바 */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "#1E293B", border: "1px solid " + (selectedIds ? "#6366F1" : "#334155"), borderRadius: "7px", padding: "6px 10px", marginBottom: "12px", width: "fit-content", flexWrap: "wrap" }}>
          <span style={{ fontSize: "10px", color: selectedIds ? "#818CF8" : "#64748B", fontWeight: "600" }}>
            {selectedIds ? (instructors[selectedFromIdx].name + " 이하 " + selectedIds.length + "명 선택") : "전체 이동"}
          </span>
          {selectedIds && (
            <button onClick={function() { setSelectedFromIdx(null); }} style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "9px", fontWeight: "600" }}>선택 해제</button>
          )}
          {selectedIds && (
            <button onClick={removeSelected} style={{ padding: "3px 10px", borderRadius: "4px", border: "1px solid #EF444460", background: "#1F0E0E", color: "#F87171", cursor: "pointer", fontSize: "9px", fontWeight: "700" }}>🗑 선택 삭제</button>
          )}
          <span style={{ color: "#334155", fontSize: "10px" }}>|</span>
          <button onClick={function() { setShiftDir("back"); }} style={{ padding: "3px 8px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "600", background: shiftDir === "back" ? "#6366F1" : "#0F1117", color: shiftDir === "back" ? "#fff" : "#475569" }}>← 앞으로</button>
          <button onClick={function() { setShiftDir("forward"); }} style={{ padding: "3px 8px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "600", background: shiftDir === "forward" ? "#6366F1" : "#0F1117", color: shiftDir === "forward" ? "#fff" : "#475569" }}>뒤로 →</button>
          <button onClick={function() { setShiftAmount(Math.max(1, shiftAmount - 1)); }} style={{ width: "20px", height: "20px", borderRadius: "4px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "13px" }}>-</button>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#F1F5F9", minWidth: "26px", textAlign: "center" }}>{shiftAmount}주</span>
          <button onClick={function() { setShiftAmount(Math.min(8, shiftAmount + 1)); }} style={{ width: "20px", height: "20px", borderRadius: "4px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "13px" }}>+</button>
          <button onClick={shiftAll} style={{ padding: "4px 12px", background: selectedIds ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#6366F1", color: "#fff", border: "none", borderRadius: "5px", fontSize: "10px", fontWeight: "700", cursor: "pointer" }}>적용</button>
        </div>

        {/* 테이블 - 강사 없을 때 빈 상태 */}
        {instructors.length === 0 ? (
          <div style={{ background: "#161B27", border: "1px solid #1E293B", borderRadius: "9px", padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>📋</div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#475569", marginBottom: "5px" }}>강사가 없습니다</div>
            <div style={{ fontSize: "11px", color: "#334155" }}>아래 강사 추가 폼으로 강사를 등록하세요</div>
          </div>
        ) : (
        <div style={{ overflowX: "auto", borderRadius: "9px", border: "1px solid #1E293B" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ padding: "9px 6px 9px 10px", fontSize: "10px", color: "#6366F1", fontWeight: "700", textAlign: "center", background: "#161B27", borderBottom: "1px solid #1E293B", position: "sticky", left: 0, zIndex: 2, width: "28px" }}>
                  <button onClick={function() { setSelectedFromIdx(null); }} title="선택 해제" style={{ background: "none", border: "none", color: selectedFromIdx !== null ? "#6366F1" : "#334155", cursor: "pointer", fontSize: "11px", fontWeight: "900", padding: "0", lineHeight: 1 }}>{selectedFromIdx !== null ? "☑" : "☐"}</button>
                  <div style={{ fontSize: "8px", color: "#334155", fontWeight: "400", marginTop: "1px", whiteSpace: "nowrap" }}>이동</div>
                </th>
                <th style={{ padding: "9px 12px 9px 6px", fontSize: "10px", color: "#475569", fontWeight: "700", textAlign: "left", background: "#161B27", borderBottom: "1px solid #1E293B", position: "sticky", left: "36px", zIndex: 2, minWidth: "100px" }}>
                  <div>강사</div>
                  <div style={{ fontSize: "8px", color: "#334155", fontWeight: "400", marginTop: "2px", whiteSpace: "nowrap" }}>← 앞(과거) · 뒤(미래) →</div>
                </th>
                {WEEKS.map(function(w) {
                  var isCur = w === CURRENT_WEEK;
                  // 헤더 = 1번 강사(rowIdx=0) 기준 색상
                  var pal = getInstColPal(w, 0);
                  var hBg = pal ? pal.bg : "#161B27";
                  var hColor = pal ? pal.text : "#475569";
                  var hBorder = pal ? pal.border : "#1E293B";
                  return (
                    <th key={w} style={{ padding: "8px 5px", fontSize: "11px", textAlign: "center", whiteSpace: "nowrap", minWidth: "80px", fontWeight: "700", background: isCur ? "#1E2A4A" : hBg, color: isCur ? "#818CF8" : hColor, borderBottom: "2px solid " + (isCur ? "#6366F1" : hBorder), borderLeft: "1px solid " + hBorder + "40", outline: isCur ? "2px solid #6366F1" : "none", outlineOffset: "-2px" }}>
                      {WEEK_LABELS[w]}
                      {isCur && <div style={{ fontSize: "9px", marginTop: "2px", color: "#818CF8" }}>현재</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {instructors.map(function(inst, rowIdx) {
                var isSelected = selectedFromIdx !== null && rowIdx >= selectedFromIdx;
                var isAnchor = selectedFromIdx === rowIdx;
                var rowBase = isSelected ? "#161B36" : (rowIdx % 2 === 0 ? "#0F1117" : "#0D111D");
                return (
                  <tr key={inst.id} style={{ borderBottom: "1px solid #161B27", outline: isAnchor ? "2px solid #6366F1" : isSelected ? "1px solid rgba(99,102,241,0.3)" : "none", outlineOffset: "-1px", height: "58px" }}>
                    {/* 이동 선택 체크박스 */}
                    <td style={{ padding: "0 6px 0 10px", position: "sticky", left: 0, zIndex: 1, background: rowBase, textAlign: "center", width: "28px" }}>
                      <button
                        onClick={function() { setSelectedFromIdx(selectedFromIdx === rowIdx ? null : rowIdx); }}
                        title={isAnchor ? "선택 해제" : inst.name + " 이하 선택"}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", color: isSelected ? "#818CF8" : "#334155", padding: "6px 2px", lineHeight: 1, display: "block" }}>
                        {isSelected ? "☑" : "☐"}
                      </button>
                    </td>
                    <td style={{ padding: "0 10px 0 6px", position: "sticky", left: "36px", zIndex: 1, background: rowBase, borderRight: "1px solid #1E293B" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                        <div
                          onClick={function() { setReplaceModal({ instId: inst.id, instName: inst.name }); setReplaceSearch(""); setReplaceSelectedUser(null); }}
                          title="클릭하여 강사 교체"
                          style={{ cursor: "pointer" }}>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: isSelected ? "#A5B4FC" : "#E2E8F0", whiteSpace: "nowrap" }}>
                            {inst.name}
                            <span style={{ fontSize: "9px", color: "#334155", marginLeft: "4px" }}>✎</span>
                          </div>
                          {inst.note ? <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>{inst.note}</div> : null}
                        </div>
                        <button
                          onClick={function(e) {
                            e.stopPropagation();
                            setConfirmTarget({ type: "single", id: inst.id, name: inst.name });
                          }}
                          onMouseEnter={function() { setHoveredDelId(inst.id); }}
                          onMouseLeave={function() { setHoveredDelId(null); }}
                          title={inst.name + " 삭제"}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", padding: "4px 3px", lineHeight: 1, flexShrink: 0, transition: "opacity 0.15s, color 0.15s", opacity: hoveredDelId === inst.id ? 1 : 0, color: hoveredDelId === inst.id ? "#EF4444" : "#475569" }}>
                          🗑
                        </button>
                      </div>
                    </td>
                    {WEEKS.map(function(w) {
                      var val = (schedule[inst.id] && schedule[inst.id][w]) || "-";
                      var isCur = w === CURRENT_WEEK;
                      // 셀 색상 = 1번 강사 기준에서 rowIdx × shiftAmount 만큼 밀린 색상
                      // 교구가 있는 셀만 색상 적용
                      var pal = val !== "-" ? getInstColPal(w, rowIdx) : null;
                      var cellBg = pal ? pal.bg : rowBase;
                      var isPopupOpen = eqPopup && eqPopup.instId === inst.id && eqPopup.week === w;
                      var log = val !== "-" ? handoverLogs.find(function(l) { return l.instId === inst.id && l.week === w; }) : null;
                      var qtyBadge = null;
                      if (log) {
                        var diff = BASE_QTY - log.qty;
                        if (diff > 3) {
                          qtyBadge = <div onClick={function(e) { e.stopPropagation(); var cellLogs = handoverLogs.filter(function(l) { return l.instId === inst.id && l.week === w; }); setEqPopup({ instId: inst.id, week: w, currentVal: val, logs: cellLogs, view: "history" }); setEqSearch(""); }} style={{ fontSize: "9px", fontWeight: "800", color: "#EF4444", background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "3px", padding: "2px 5px", marginTop: "3px", lineHeight: "14px", whiteSpace: "nowrap", cursor: "pointer", display: "inline-block" }}>⚠ {log.qty}개</div>;
                        } else if (diff > 0) {
                          qtyBadge = <div onClick={function(e) { e.stopPropagation(); var cellLogs = handoverLogs.filter(function(l) { return l.instId === inst.id && l.week === w; }); setEqPopup({ instId: inst.id, week: w, currentVal: val, logs: cellLogs, view: "history" }); setEqSearch(""); }} style={{ fontSize: "9px", fontWeight: "600", color: "#94A3B8", background: "rgba(148,163,184,0.15)", border: "1px solid rgba(148,163,184,0.3)", borderRadius: "3px", padding: "2px 5px", marginTop: "3px", lineHeight: "14px", whiteSpace: "nowrap", cursor: "pointer", display: "inline-block" }}>{log.qty}개</div>;
                        }
                      }
                      return (
                        <td key={w} style={{ padding: "0", textAlign: "center", background: isPopupOpen ? "#1E2A4A" : cellBg, borderLeft: "1px solid " + (pal ? pal.border + "30" : "#1E293B"), outline: isPopupOpen ? "2px solid #6366F1" : isCur ? "2px solid rgba(99,102,241,0.4)" : "none", outlineOffset: "-2px", position: "relative", cursor: "pointer", minWidth: "80px" }}
                          onClick={function(e) {
                            var rect = e.currentTarget.getBoundingClientRect();
                            var cellLogs = handoverLogs.filter(function(l) { return l.instId === inst.id && l.week === w; });
                            setEqPopup({ instId: inst.id, week: w, currentVal: val, x: rect.left, y: rect.bottom, logs: cellLogs, view: "select" });
                            setEqSearch("");
                          }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "58px", padding: "0 4px" }}>
                            <div style={{ fontSize: "12px", fontWeight: val !== "-" ? "700" : "400", color: pal ? pal.text : "#2D3748", whiteSpace: "nowrap" }}>{val}</div>
                            {qtyBadge}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* 강사 추가 — user 테이블에서 검색 선택 */}
        <div style={{ marginTop: "10px", background: "#161B27", border: "1px solid #1E293B", borderRadius: "9px", padding: "12px 14px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "10px" }}>+ 강사 추가</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>

            {/* 검색 가능한 유저 선택 */}
            <div style={{ flex: 2, minWidth: "200px", position: "relative" }}>
              <input
                ref={userSearchRef}
                value={userSearch}
                onChange={function(e) {
                  setUserSearch(e.target.value);
                  setSelectedUserId("");
                  setNewName("");
                  setShowUserDropdown(true);
                }}
                onFocus={function() { setShowUserDropdown(true); }}
                onBlur={function() { setTimeout(function() { setShowUserDropdown(false); }, 150); }}
                placeholder="강사명 검색... (예: 김은지)"
                style={{ width: "100%", padding: "7px 10px", background: "#0F1117", border: "1px solid " + (selectedUserId ? "#6366F1" : "#334155"), borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none", boxSizing: "border-box" }}
              />
              {/* 선택됐을 때 체크 표시 */}
              {selectedUserId && (
                <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "#22C55E" }}>✓</span>
              )}
              {/* 드롭다운 목록 */}
              {showUserDropdown && userSearch.trim().length >= 1 && (function() {
                var allMatched = userList.filter(function(u) {
                  var matchName = u.name && u.name.includes(userSearch.trim());
                  var matchAccount = u.user_account && u.user_account.includes(userSearch.trim());
                  return matchName || matchAccount;
                }).slice(0, 10);

                if (allMatched.length === 0) return (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", zIndex: 100, padding: "10px", fontSize: "11px", color: "#475569" }}>
                    검색 결과 없음
                  </div>
                );
                return (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", zIndex: 100, maxHeight: "200px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                    {allMatched.map(function(u) {
                      var alreadyAdded = instructors.some(function(i) { return i.name === u.name; });
                      return (
                        <div key={u.user_id}
                          onMouseDown={function() {
                            if (alreadyAdded) return;
                            setSelectedUserId(String(u.user_id));
                            setUserSearch(u.name);
                            setNewName(u.name || "");
                            setShowUserDropdown(false);
                          }}
                          style={{ padding: "8px 12px", cursor: alreadyAdded ? "default" : "pointer", borderBottom: "1px solid #0F1117", opacity: alreadyAdded ? 0.45 : 1 }}
                          onMouseEnter={function(e) { if (!alreadyAdded) e.currentTarget.style.background = "#334155"; }}
                          onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: "#F1F5F9" }}>{u.name}</span>
                              {alreadyAdded && (
                                <span style={{ fontSize: "9px", background: "#1E3A2A", color: "#22C55E", border: "1px solid #22C55E44", borderRadius: "3px", padding: "1px 5px", fontWeight: "700" }}>등록됨</span>
                              )}
                            </div>
                            <span style={{ fontSize: "10px", color: "#64748B" }}>{u.phone || "연락처 없음"}</span>
                          </div>
                          <div style={{ fontSize: "10px", color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.address || "주소 없음"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <input value={newName} onChange={function(e) { setNewName(e.target.value); }} placeholder="표시 이름 (선택)" onKeyDown={function(e) { if (e.key === "Enter") addInstructor(); }} style={{ flex: 1, minWidth: "120px", padding: "7px 10px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none" }} />
            <input value={newNote} onChange={function(e) { setNewNote(e.target.value); }} placeholder="비고 (선택)" onKeyDown={function(e) { if (e.key === "Enter") addInstructor(); }} style={{ flex: 1, minWidth: "80px", padding: "7px 10px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none" }} />
            <button onClick={addInstructor} style={{ padding: "7px 14px", background: selectedUserId ? "#6366F1" : "#334155", color: selectedUserId ? "#fff" : "#64748B", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: selectedUserId ? "pointer" : "not-allowed" }}>추가</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", padding: "6px 10px" }}>
            <span style={{ fontSize: "10px", color: "#64748B" }}>교구 간격</span>
            <button onClick={function() { setNewShiftAmount(function(v) { return Math.max(0, v-1); }); }} style={{ width: "18px", height: "18px", background: "#1E293B", border: "none", borderRadius: "3px", color: "#94A3B8", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#F1F5F9", minWidth: "24px", textAlign: "center" }}>{newShiftAmount}주</span>
            <button onClick={function() { setNewShiftAmount(function(v) { return Math.min(8, v+1); }); }} style={{ width: "18px", height: "18px", background: "#1E293B", border: "none", borderRadius: "3px", color: "#94A3B8", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          </div>
        </div>

        {/* 색상 범례 — 주차 위치 기준 고정 5색 */}
        <div style={{ marginTop: "8px", marginBottom: "18px", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: "#475569", marginRight: "4px" }}>열 색상 (1번 강사 기준):</span>
          {[["1번째 교구","파랑"],["2번째 교구","초록"],["3번째 교구","주황"],["4번째 교구","보라"],["5번째 교구","핑크"]].map(function(item, i) {
            var pal = PALETTE[i];
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", background: pal.bg, border: "1px solid " + pal.border + "60", borderRadius: "5px", padding: "4px 10px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: pal.border }} />
                <span style={{ fontSize: "11px", color: pal.text, fontWeight: "600" }}>{item[1]}</span>
              </div>
            );
          })}
          <span style={{ fontSize: "10px", color: "#334155", marginLeft: "4px" }}>· 6번째부터 반복</span>
        </div>
      </div>

      {/* 새 시트 추가 모달 */}
      {showNewSheetModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#161B27", border: "1px solid #334155", borderRadius: "14px", padding: "24px 22px", width: "300px" }}>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "#F1F5F9", marginBottom: "5px" }}>새 시트 추가</div>
            <div style={{ fontSize: "10px", color: "#64748B", marginBottom: "16px" }}>새로운 로테이션 시트 이름을 입력하세요</div>
            <input
              autoFocus
              value={newSheetTitle}
              onChange={function(e) { setNewSheetTitle(e.target.value); }}
              onKeyDown={function(e) { if (e.key === "Enter") addSheet(); if (e.key === "Escape") setShowNewSheetModal(false); }}
              placeholder="예: 청년체육 로테이션 2026"
              style={{ width: "100%", padding: "10px 12px", background: "#0F1117", border: "1px solid #334155", borderRadius: "7px", fontSize: "12px", color: "#E2E8F0", outline: "none", boxSizing: "border-box", marginBottom: "14px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={function() { setShowNewSheetModal(false); }} style={{ flex: 1, padding: "10px", background: "#0F1117", color: "#64748B", border: "1px solid #334155", borderRadius: "7px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>취소</button>
              <button onClick={addSheet} style={{ flex: 2, padding: "10px", background: newSheetTitle.trim() ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#1E293B", color: newSheetTitle.trim() ? "#fff" : "#475569", border: "none", borderRadius: "7px", fontSize: "12px", fontWeight: "700", cursor: newSheetTitle.trim() ? "pointer" : "not-allowed" }}>시트 추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 교구 선택 + 히스토리 모달 (슬라이드 전환) */}
      {eqPopup && (function() {
        var isHistory = eqPopup.view === "history";
        var panelEq = eqPopup.currentVal;
        var panelInst = instructors.find(function(i) { return i.id === eqPopup.instId; });

        // 히스토리: 해당 교구 전체 로테이션 수집
        var allRows = [];
        if (panelEq && panelEq !== "-") {
          instructors.forEach(function(inst) {
            WEEKS.forEach(function(w) {
              var v = (schedule[inst.id] && schedule[inst.id][w]) || "-";
              if (v === panelEq) {
                var log = handoverLogs.find(function(l) { return l.instId === inst.id && l.week === w; });
                allRows.push({ inst: inst, week: w, log: log });
              }
            });
          });
          allRows.sort(function(a, b) { return WEEKS.indexOf(a.week) - WEEKS.indexOf(b.week); });
        }
        var logsWithQty = allRows.filter(function(r) { return r.log; });
        var currentQty = logsWithQty.length ? logsWithQty[logsWithQty.length - 1].log.qty : BASE_QTY;
        var maxLoss = logsWithQty.length ? BASE_QTY - Math.min.apply(null, logsWithQty.map(function(r) { return r.log.qty; })) : 0;
        var pal = getEqPalette(panelEq, EQUIPMENT_LIST);

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
            onMouseDown={function(e) { if (e.target === e.currentTarget) { setEqPopup(null); setEqSearch(""); } }}>
            <div ref={popupRef} style={{ background: "#1E293B", borderRadius: "16px", border: "1px solid #334155", width: "100%", maxWidth: "420px", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 48px rgba(0,0,0,0.5)", overflow: "hidden" }}>

              {/* 슬라이드 래퍼 — 두 뷰 가로 배치 */}
              <div style={{ display: "flex", width: "200%", flex: 1, minHeight: 0, transform: isHistory ? "translateX(-50%)" : "translateX(0)", transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)" }}>

                {/* ── 뷰 1: 교구 선택 ── */}
                <div style={{ width: "50%", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: "800", color: "#F1F5F9" }}>교구 선택</div>
                        <div style={{ fontSize: "11px", color: "#64748B", marginTop: "3px" }}>
                          {WEEK_LABELS[eqPopup.week]} &nbsp;·&nbsp; {(panelInst || {}).name || ""}
                        </div>
                      </div>
                      <button onClick={function() { setEqPopup(null); setEqSearch(""); }}
                        style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#334155", border: "none", color: "#94A3B8", fontSize: "17px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                    </div>

                    {/* 현재 교구 행 + 수량 이력 버튼 + 삭제 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0F1117", borderRadius: "9px", padding: "10px 14px", marginBottom: "12px" }}>
                      <span style={{ fontSize: "11px", color: "#64748B", flexShrink: 0 }}>현재</span>
                      <span style={{ fontSize: "15px", fontWeight: "800", color: panelEq && panelEq !== "-" ? "#A5B4FC" : "#334155", flex: 1 }}>
                        {panelEq && panelEq !== "-" ? panelEq : "없음"}
                      </span>
                      {eqPopup.logs && eqPopup.logs.length > 0 && (function() {
                        var log = eqPopup.logs[0];
                        var diff = BASE_QTY - log.qty;
                        var isCrit = diff > 3;
                        return (
                          <button onClick={function() { setEqPopup(function(p) { return Object.assign({}, p, { view: "history" }); }); }}
                            style={{ fontSize: "10px", fontWeight: "700", color: isCrit ? "#EF4444" : "#94A3B8", background: isCrit ? "rgba(239,68,68,0.12)" : "rgba(148,163,184,0.1)", border: "1px solid " + (isCrit ? "rgba(239,68,68,0.4)" : "rgba(148,163,184,0.25)"), borderRadius: "6px", padding: "4px 9px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {isCrit ? "⚠ " : ""}{log.qty}개 · 이력 →
                          </button>
                        );
                      })()}
                      {panelEq && panelEq !== "-" && (
                        <button onClick={function() {
                          var affected = instructors.length - 1 - instructors.findIndex(function(i) { return i.id === eqPopup.instId; });
                          applyCellAndCascade(eqPopup.instId, eqPopup.week, "-");
                          showToast("교구 삭제 · 아래 " + affected + "명 자동 편성", "warn");
                          setEqPopup(null); setEqSearch("");
                        }} style={{ background: "#2D0A0A", border: "1px solid #7F1D1D", borderRadius: "6px", color: "#F87171", cursor: "pointer", fontSize: "11px", fontWeight: "700", padding: "5px 10px", whiteSpace: "nowrap", flexShrink: 0 }}>
                          삭제
                        </button>
                      )}
                    </div>

                    {/* 검색창 */}
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", color: "#64748B", pointerEvents: "none" }}>🔍</span>
                      <input
                        autoFocus={!isHistory}
                        value={eqSearch}
                        onChange={function(e) { setEqSearch(e.target.value); }}
                        onKeyDown={function(e) {
                          if (e.key === "Escape") { setEqPopup(null); setEqSearch(""); }
                          if (e.key === "Enter") {
                            var filtered = eqList.filter(function(eq) { return eq.includes(eqSearch); });
                            if (filtered.length >= 1) {
                              var target = filtered[0];
                              var affected = instructors.length - 1 - instructors.findIndex(function(i) { return i.id === eqPopup.instId; });
                              applyCellAndCascade(eqPopup.instId, eqPopup.week, target);
                              showToast(target + " 변경 · 아래 " + affected + "명 자동 편성");
                              setEqPopup(null); setEqSearch("");
                            }
                          }
                        }}
                        placeholder="교구 이름 검색..."
                        style={{ width: "100%", padding: "13px 14px 13px 42px", background: "#0F1117", border: "1.5px solid #475569", borderRadius: "10px", fontSize: "15px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  {/* 교구 목록 */}
                  <div style={{ overflowY: "auto", flex: 1 }}>
                    {(function() {
                      var filtered = eqSearch === "" ? eqList : eqList.filter(function(eq) { return eq.includes(eqSearch); });
                      if (filtered.length === 0) return (
                        <div style={{ padding: "24px 20px", textAlign: "center" }}>
                          <div style={{ fontSize: "12px", color: "#475569", marginBottom: "14px" }}>"{eqSearch}" 검색 결과 없음</div>
                          <button onClick={async function() {
                            var newName = eqSearch.trim();
                            if (!newName) return;
                            try {
                              // Supabase에 INSERT
                              await sbPost("equipment", { name: newName, base_qty: 50, is_active: true });
                              // 로컬 목록에 즉시 반영
                              setEqList(function(prev) { return prev.concat([newName]).sort(); });
                              showToast(newName + " 교구 추가 완료!");
                            } catch(e) {
                              // DB 미연결 시 로컬에만 추가
                              setEqList(function(prev) { return prev.concat([newName]).sort(); });
                              showToast(newName + " 추가 (로컬)");
                            }
                          }}
                            style={{ padding: "10px 20px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "9px", fontSize: "13px", fontWeight: "700", cursor: "pointer", width: "100%" }}>
                            + "{eqSearch}" 교구 DB에 추가
                          </button>
                          <div style={{ fontSize: "10px", color: "#334155", marginTop: "8px" }}>Supabase equipment 테이블에 저장됩니다</div>
                        </div>
                      );
                      return filtered.map(function(eq) {
                        var isSelected = eq === eqPopup.currentVal;
                        var p = getEqPalette(eq, EQUIPMENT_LIST);
                        return (
                          <button key={eq} onClick={function() {
                            var affected = instructors.length - 1 - instructors.findIndex(function(i) { return i.id === eqPopup.instId; });
                            applyCellAndCascade(eqPopup.instId, eqPopup.week, eq);
                            showToast(eq + " 변경 · 아래 " + affected + "명 자동 편성");
                            setEqPopup(null); setEqSearch("");
                          }} style={{ width: "100%", padding: "13px 18px", background: isSelected ? "#1E2A4A" : "transparent", border: "none", borderBottom: "1px solid #1E293B", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ width: "9px", height: "9px", borderRadius: "3px", background: p ? p.border : "#334155", flexShrink: 0 }} />
                            <span style={{ fontSize: "14px", fontWeight: isSelected ? "800" : "500", color: isSelected ? "#A5B4FC" : "#CBD5E1", flex: 1 }}>{eq}</span>
                            {isSelected && <span style={{ fontSize: "11px", color: "#6366F1", fontWeight: "700" }}>현재 ✓</span>}
                          </button>
                        );
                      });
                    })()}
                  </div>

                  {/* 하단 고정: 새 교구 직접 추가 */}
                  <div style={{ borderTop: "1px solid #1E293B", padding: "10px 14px", flexShrink: 0 }}>
                    <div style={{ display: "flex", gap: "7px" }}>
                      <input
                        id="newEqInput"
                        placeholder="새 교구명 직접 입력..."
                        style={{ flex: 1, padding: "8px 11px", background: "#0F1117", border: "1.5px solid #334155", borderRadius: "8px", fontSize: "12px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }}
                        onKeyDown={function(e) {
                          if (e.key === "Enter") e.currentTarget.nextSibling.click();
                        }}
                      />
                      <button onClick={async function() {
                        var input = document.getElementById("newEqInput");
                        var newName = input ? input.value.trim() : "";
                        if (!newName) return;
                        if (eqList.includes(newName)) { showToast("이미 존재하는 교구입니다", "warn"); return; }
                        try {
                          await sbPost("equipment", { name: newName, base_qty: 50, is_active: true });
                          setEqList(function(prev) { return prev.concat([newName]).sort(); });
                          showToast(newName + " 교구 추가 완료!");
                          if (input) input.value = "";
                        } catch(e) {
                          setEqList(function(prev) { return prev.concat([newName]).sort(); });
                          showToast(newName + " 추가 (로컬)");
                          if (input) input.value = "";
                        }
                      }}
                        style={{ padding: "8px 14px", background: "#6366F1", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                        + 추가
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── 뷰 2: 수량 히스토리 ── */}
                <div style={{ width: "50%", display: "flex", flexDirection: "column", minHeight: 0 }}>

                  {/* 히스토리 헤더 */}
                  <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button onClick={function() { setEqPopup(function(p) { return Object.assign({}, p, { view: "select" }); }); }}
                        style={{ width: "30px", height: "30px", borderRadius: "8px", background: "#334155", border: "none", color: "#94A3B8", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>←</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                          {pal && <div style={{ width: "9px", height: "9px", borderRadius: "3px", background: pal.border, flexShrink: 0 }} />}
                          <span style={{ fontSize: "15px", fontWeight: "800", color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{panelEq}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>수량 히스토리 · 기준 {BASE_QTY}개</div>
                      </div>
                      <button onClick={function() { setEqPopup(null); setEqSearch(""); }}
                        style={{ width: "30px", height: "30px", borderRadius: "8px", background: "#334155", border: "none", color: "#94A3B8", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                    </div>
                  </div>

                  {/* 요약 카드 3개 */}
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #1E293B", display: "flex", gap: "7px", flexShrink: 0 }}>
                    {[
                      { label: "기준", value: BASE_QTY + "개", color: "#22C55E", bg: "rgba(34,197,94,0.08)", bdr: "rgba(34,197,94,0.2)" },
                      { label: "최신 수량", value: currentQty + "개",
                        color: currentQty < BASE_QTY - 3 ? "#EF4444" : currentQty < BASE_QTY ? "#F59E0B" : "#22C55E",
                        bg: currentQty < BASE_QTY - 3 ? "rgba(239,68,68,0.08)" : "rgba(148,163,184,0.06)",
                        bdr: currentQty < BASE_QTY - 3 ? "rgba(239,68,68,0.3)" : "#1E293B" },
                      { label: "총 감소", value: (maxLoss > 0 ? "-" : "") + maxLoss + "개",
                        color: maxLoss > 3 ? "#EF4444" : maxLoss > 0 ? "#F59E0B" : "#475569",
                        bg: "rgba(15,17,23,0.5)", bdr: "#1E293B" },
                    ].map(function(c, i) {
                      return (
                        <div key={i} style={{ flex: 1, background: c.bg, border: "1px solid " + c.bdr, borderRadius: "9px", padding: "9px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: "9px", color: "#475569", marginBottom: "3px", fontWeight: "600" }}>{c.label}</div>
                          <div style={{ fontSize: "17px", fontWeight: "900", color: c.color, lineHeight: 1 }}>{c.value}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 타임라인 */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
                    {allRows.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "32px 0", color: "#334155", fontSize: "12px" }}>로테이션 기록이 없습니다.</div>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <div style={{ position: "absolute", left: "11px", top: "8px", bottom: "8px", width: "2px", background: "#1E293B", borderRadius: "1px" }} />
                        {allRows.map(function(r, i) {
                          var log = r.log;
                          var diff = log ? BASE_QTY - log.qty : null;
                          var isCrit = diff !== null && diff > 3;
                          var isMinor = diff !== null && diff > 0 && diff <= 3;
                          var dotColor = isCrit ? "#EF4444" : isMinor ? "#F59E0B" : log ? "#22C55E" : "#334155";
                          var isTarget = r.inst.id === eqPopup.instId && r.week === eqPopup.week;
                          var isCurWeek = r.week === CURRENT_WEEK;
                          return (
                            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                              <div style={{ width: "24px", paddingTop: "13px", flexShrink: 0, position: "relative", zIndex: 1, display: "flex", justifyContent: "center" }}>
                                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: dotColor, border: "2px solid " + (isTarget ? "#E2E8F0" : "#1E293B"), boxShadow: isTarget ? "0 0 0 3px " + dotColor + "44" : "none" }} />
                              </div>
                              <div style={{ flex: 1, background: isTarget ? "#1A1F3C" : isCurWeek ? "#0D1929" : "transparent", border: isTarget ? "1px solid #4F46E5" : isCurWeek ? "1px solid #1E3A5F" : "1px solid transparent", borderRadius: "8px", padding: "8px 10px", marginBottom: "5px" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                    <span style={{ fontSize: "11px", fontWeight: "700", color: isTarget ? "#A5B4FC" : "#CBD5E1" }}>{r.inst.name}</span>
                                    {isCurWeek && <span style={{ fontSize: "8px", background: "#1E3A5F", color: "#60A5FA", padding: "1px 4px", borderRadius: "3px", fontWeight: "700" }}>현재</span>}
                                    {isTarget && <span style={{ fontSize: "8px", background: "#1E1B4B", color: "#818CF8", padding: "1px 4px", borderRadius: "3px", fontWeight: "700" }}>선택</span>}
                                  </div>
                                  <span style={{ fontSize: "9px", color: "#475569" }}>{WEEK_LABELS[r.week]}</span>
                                </div>
                                {log ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                    <span style={{ fontSize: "14px", fontWeight: "900", color: dotColor }}>{isCrit ? "⚠ " : ""}{log.qty}개</span>
                                    {diff > 0 && <span style={{ fontSize: "9px", color: isCrit ? "#FCA5A5" : "#94A3B8", background: isCrit ? "rgba(239,68,68,0.12)" : "rgba(148,163,184,0.1)", padding: "1px 5px", borderRadius: "3px" }}>-{diff}개</span>}
                                    {log.note ? <span style={{ fontSize: "9px", color: "#64748B" }}>· {log.note}</span> : null}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: "10px", color: "#334155", fontStyle: "italic" }}>인계 기록 없음</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>{/* end 슬라이드 래퍼 */}
            </div>
          </div>
        );
      })()}

      {/* 강사 교체 모달 */}
      {replaceModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={function(e) { if (e.target === e.currentTarget) { setReplaceModal(null); setReplaceSearch(""); setReplaceSelectedUser(null); } }}>
          <div style={{ background: "#1E293B", borderRadius: "14px", border: "1px solid #334155", padding: "24px 24px 20px", width: "360px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            {/* 헤더 */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "15px", fontWeight: "800", color: "#F1F5F9", marginBottom: "4px" }}>강사 교체</div>
              <div style={{ fontSize: "11px", color: "#64748B" }}>
                <span style={{ color: "#A5B4FC", fontWeight: "700" }}>{replaceModal.instName}</span>
                {" "}→ 새 강사로 교체 (로테이션 일정은 유지됩니다)
              </div>
            </div>

            {/* 검색창 */}
            <div style={{ position: "relative", marginBottom: "12px" }}>
              <input
                autoFocus
                value={replaceSearch}
                onChange={function(e) { setReplaceSearch(e.target.value); setReplaceSelectedUser(null); }}
                placeholder="교체할 강사명 검색..."
                style={{ width: "100%", padding: "10px 12px", background: "#0F1117", border: "1.5px solid " + (replaceSelectedUser ? "#6366F1" : "#334155"), borderRadius: "8px", fontSize: "13px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }}
              />
              {replaceSelectedUser && (
                <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#22C55E", fontSize: "13px" }}>✓</span>
              )}

              {/* 검색 드롭다운 */}
              {replaceSearch.trim().length >= 1 && !replaceSelectedUser && (function() {
                var matched = userList.filter(function(u) {
                  return u.name && u.name.includes(replaceSearch.trim());
                }).slice(0, 8);
                if (matched.length === 0) return (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", zIndex: 200, padding: "10px", fontSize: "11px", color: "#475569" }}>
                    검색 결과 없음
                  </div>
                );
                return (
                  <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", zIndex: 200, maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                    {matched.map(function(u) {
                      var alreadyAdded = instructors.some(function(i) { return i.name === u.name && i.id !== replaceModal.instId; });
                      return (
                        <div key={u.user_id}
                          onMouseDown={function() {
                            if (alreadyAdded) return;
                            setReplaceSelectedUser(u);
                            setReplaceSearch(u.name);
                          }}
                          style={{ padding: "8px 12px", cursor: alreadyAdded ? "default" : "pointer", borderBottom: "1px solid #0F1117", opacity: alreadyAdded ? 0.4 : 1 }}
                          onMouseEnter={function(e) { if (!alreadyAdded) e.currentTarget.style.background = "#334155"; }}
                          onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#F1F5F9" }}>{u.name}</span>
                              {alreadyAdded && <span style={{ fontSize: "9px", background: "#1E3A2A", color: "#22C55E", border: "1px solid #22C55E44", borderRadius: "3px", padding: "1px 5px" }}>등록됨</span>}
                            </div>
                            <span style={{ fontSize: "10px", color: "#64748B" }}>{u.phone || ""}</span>
                          </div>
                          <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.address || ""}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* 선택된 강사 미리보기 */}
            {replaceSelectedUser && (
              <div style={{ background: "#0F1117", borderRadius: "8px", padding: "10px 12px", marginBottom: "14px", border: "1px solid #6366F1" }}>
                <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "4px" }}>교체 대상</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: "800", color: "#A5B4FC" }}>{replaceSelectedUser.name}</span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748B" }}>{replaceSelectedUser.phone || ""}</span>
                </div>
                <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>{replaceSelectedUser.address || ""}</div>
              </div>
            )}

            {/* 버튼 */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={function() { setReplaceModal(null); setReplaceSearch(""); setReplaceSelectedUser(null); }}
                style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
                취소
              </button>
              <button onClick={doReplaceInstructor} disabled={!replaceSelectedUser}
                style={{ padding: "8px 18px", borderRadius: "7px", border: "none", background: replaceSelectedUser ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#334155", color: replaceSelectedUser ? "#fff" : "#64748B", cursor: replaceSelectedUser ? "pointer" : "not-allowed", fontSize: "12px", fontWeight: "700" }}>
                교체하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 인라인 confirm 모달 */}
      {confirmTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={function(e) { if (e.target === e.currentTarget) setConfirmTarget(null); }}>
          <div style={{ background: "#1E293B", borderRadius: "14px", border: "1px solid #334155", padding: "24px 28px", minWidth: "260px", maxWidth: "340px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: "15px", fontWeight: "800", color: "#F1F5F9", marginBottom: "10px" }}>
              {confirmTarget.type === "single" ? "강사 삭제" : "선택 강사 삭제"}
            </div>
            <div style={{ fontSize: "12px", color: "#94A3B8", marginBottom: "20px", lineHeight: "1.7" }}>
              {confirmTarget.type === "single"
                ? confirmTarget.name + " 강사를 삭제하시겠습니까?"
                : confirmTarget.names.join(", ") + " 외 " + confirmTarget.ids.length + "명을 삭제하시겠습니까?"}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={function() { setConfirmTarget(null); }}
                style={{ padding: "7px 16px", borderRadius: "7px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
                취소
              </button>
              <button onClick={function() {
                if (confirmTarget.type === "single") doRemoveSingle(confirmTarget.id, confirmTarget.name);
                else doRemoveSelected(confirmTarget.ids);
              }}
                style={{ padding: "7px 18px", borderRadius: "7px", border: "none", background: "#DC2626", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: "700" }}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {toast ? (
        <div style={{ position: "fixed", bottom: "18px", left: "50%", transform: "translateX(-50%)", background: toast.type === "warn" ? "#F59E0B" : "#6366F1", color: "#fff", padding: "8px 18px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", zIndex: 9999, maxWidth: "320px", textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>{toast.msg}</div>
      ) : null}

    </div>
  );
}


export default AdminView;
