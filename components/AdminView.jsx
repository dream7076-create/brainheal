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

// ── AdminView ────────────────────────────────────────────────────────
export default function AdminView({ dbEquipment, handoverLogs, onSheetTitleChange }) {

  // ── 시트 목록 (DB sheets 테이블) ─────────────────────────────────
  const [sheets, setSheets] = useState([]);           // [{ id, title, sort_order }]
  const [activeSheetId, setActiveSheetId] = useState(null);

  // ── 현재 시트 데이터 ──────────────────────────────────────────────
  const [instructors, setInstructors] = useState([]); // 현재 시트 강사 목록
  const [schedule, setSchedule] = useState({});       // 현재 시트 스케줄
  const [loadingSheet, setLoadingSheet] = useState(false);

  // ── 공통 state ────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [editingSheetId, setEditingSheetId] = useState(null);
  const [editingSheetTitle, setEditingSheetTitle] = useState("");
  const [showNewSheetModal, setShowNewSheetModal] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("");

  // ── 툴바 state ────────────────────────────────────────────────────
  const [shiftAmount, setShiftAmount] = useState(1);
  const [shiftDir, setShiftDir] = useState("forward");
  const [selectedFromIdx, setSelectedFromIdx] = useState(null);
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");

  // ── 교구 팝업 state ───────────────────────────────────────────────
  const [eqPopup, setEqPopup] = useState(null);
  const [eqSearch, setEqSearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [hoveredDelId, setHoveredDelId] = useState(null);
  const [eqList, setEqList] = useState(EQUIPMENT_LIST);
  const [equipmentMap, setEquipmentMap] = useState({}); // name → id 맵
  const [equipmentMapReady, setEquipmentMapReady] = useState(false); // 로드 완료 여부
  const popupRef = useRef(null);

  // ── 유저 검색 state ───────────────────────────────────────────────
  const [userList, setUserList] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchRef = useRef(null);

  // ── 강사 교체 state ───────────────────────────────────────────────
  const [replaceModal, setReplaceModal] = useState(null);
  const [replaceSearch, setReplaceSearch] = useState("");
  const [replaceSelectedUser, setReplaceSelectedUser] = useState(null);

  function showToast(msg, type) {
    setToast({ msg, type: type || "info" });
    setTimeout(() => setToast(null), type === "warn" ? 4000 : 2000);
  }

  // ── 초기 로드: sheets 테이블에서 시트 목록 가져오기 ─────────────
  useEffect(function() {
    async function loadSheets() {
      try {
        var data = await sbGet("sheets?select=id,title,sort_order&order=sort_order.asc");
        if (Array.isArray(data) && data.length > 0) {
          setSheets(data);
          setActiveSheetId(data[0].id);
        } else {
          // sheets 테이블이 비어있으면 기본 시트 생성
          var res = await sbPost("sheets", { id: "main", title: "실버체육 로테이션 2026", sort_order: 1 });
          var defaultSheet = (res && res[0]) ? res[0] : { id: "main", title: "실버체육 로테이션 2026", sort_order: 1 };
          setSheets([defaultSheet]);
          setActiveSheetId("main");
        }
      } catch(e) {
        console.error("sheets 로드 실패:", e);
        // fallback
        setSheets([{ id: "main", title: "실버체육 로테이션 2026", sort_order: 1 }]);
        setActiveSheetId("main");
      }
    }
    loadSheets();
  }, []);

  // ── 유저 목록 로드 ────────────────────────────────────────────────
  useEffect(function() {
    sbGet("user?select=user_id,user_account,name,email,phone,address&order=name.asc")
      .then(function(data) { if (Array.isArray(data)) setUserList(data); })
      .catch(function(e) { console.warn("유저 목록 로드 실패:", e); });
  }, []);

  // ── 시트 변경 시 해당 시트의 강사+스케줄 로드 ───────────────────
  useEffect(function() {
    if (!activeSheetId) return;

    // 시트 제목 부모에 알림
    var activeSheet = sheets.find(s => s.id === activeSheetId);
    if (activeSheet && onSheetTitleChange) onSheetTitleChange(activeSheet.title);

    async function loadSheetData() {
      setLoadingSheet(true);
      setInstructors([]);
      setSchedule({});
      setSelectedFromIdx(null);
      try {
        // 1. 현재 시트 강사 로드
        var insts = await sbGet(
          "instructors?select=id,name,region,note,sort_order&sheet_id=eq." + activeSheetId +
          "&is_active=eq.true&order=sort_order.asc"
        );
        var instList = Array.isArray(insts) ? insts.map(r => ({
          id: r.id,
          name: (r.region ? r.region + " - " : "") + r.name,
          rawName: r.name,
          region: r.region || "",
          note: r.note || "",
          sort_order: r.sort_order
        })) : [];

        // 2. 현재 시트 스케줄 로드 (equipment 조인 없이 equipment_id만 가져옴)
        var schedRows = await sbGet(
          "rotation_schedule?select=instructor_id,equipment_id,week" +
          "&year=eq.2026&sheet_id=eq." + activeSheetId + "&order=week.asc"
        );

        // 3. equipment 전체 목록 로드 (id → name 역방향 맵)
        var eqData = await sbGet("equipment?select=id,name&is_active=eq.true");
        var eqIdToName = {};
        var nameToId = {};
        if (Array.isArray(eqData)) {
          eqData.forEach(r => {
            eqIdToName[r.id] = r.name;
            nameToId[r.name] = r.id;
          });
          // equipmentMap도 최신으로 갱신
          setEquipmentMap(nameToId);
          setEqList(eqData.map(r => r.name).sort());
          setEquipmentMapReady(true);
        }

        // 4. 스케줄 객체 구성 (equipment_id → name 변환)
        var schedObj = {};
        instList.forEach(function(inst) {
          schedObj[inst.id] = {};
          WEEKS.forEach(function(w) { schedObj[inst.id][w] = "-"; });
        });
        if (Array.isArray(schedRows)) {
          schedRows.forEach(function(r) {
            if (schedObj[r.instructor_id] && r.equipment_id) {
              var eqName = eqIdToName[r.equipment_id] || "-";
              schedObj[r.instructor_id][r.week] = eqName;
            }
          });
        }

        setInstructors(instList);
        setSchedule(schedObj);
      } catch(e) {
        console.error("시트 데이터 로드 실패:", e);
        showToast("데이터 로드 실패: " + e.message, "warn");
      } finally {
        setLoadingSheet(false);
      }
    }
    loadSheetData();
  }, [activeSheetId]);

  // ── 팝업 바깥 클릭 닫기 ─────────────────────────────────────────
  useEffect(function() {
    if (!eqPopup) return;
    function handleOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setEqPopup(null); setEqSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [eqPopup]);

  // ── 현재 시트 정보 ────────────────────────────────────────────────
  var activeSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];

  // ── 시트 CRUD ────────────────────────────────────────────────────
  async function addSheet() {
    if (!newSheetTitle.trim()) return;
    var newId = "sheet_" + Date.now();
    try {
      var newSortOrder = sheets.length + 1;
      var res = await sbPost("sheets", { id: newId, title: newSheetTitle.trim(), sort_order: newSortOrder });
      if (!res || !res[0]) throw new Error("sheets 테이블 저장 실패 - RLS 정책을 확인하세요");
      setSheets(prev => prev.concat([{ id: newId, title: newSheetTitle.trim(), sort_order: newSortOrder }]));
      setActiveSheetId(newId);
      setNewSheetTitle("");
      setShowNewSheetModal(false);
      showToast(newSheetTitle.trim() + " 시트 추가!");
    } catch(e) {
      console.error("시트 추가 실패:", e);
      showToast("시트 추가 실패: " + e.message, "warn");
    }
  }

  async function doRemoveSheet(id) {
    if (sheets.length === 1) { showToast("마지막 시트는 삭제할 수 없습니다"); return; }
    try {
      var instIds = instructors.map(i => i.id);
      if (instIds.length > 0) {
        for (var iid of instIds) {
          await sbDelete("rotation_schedule?instructor_id=eq." + iid + "&year=eq.2026");
          await sbDelete("handover_logs?instructor_id=eq." + iid);
          await sbDelete("instructors?id=eq." + iid);
        }
      }
      await sbDelete("sheets?id=eq." + id);
      var remaining = sheets.filter(s => s.id !== id);
      setSheets(remaining);
      if (activeSheetId === id) setActiveSheetId(remaining[0].id);
      showToast("시트 삭제 완료", "warn");
    } catch(e) {
      showToast("시트 삭제 실패: " + e.message, "warn");
    }
    setConfirmTarget(null);
  }

  function removeSheet(id) {
    if (sheets.length === 1) { showToast("마지막 시트는 삭제할 수 없습니다"); return; }
    var sheet = sheets.find(s => s.id === id);
    setConfirmTarget({ type: "sheet", id, name: sheet ? sheet.title : id });
  }

  async function saveSheetTitle(id) {
    if (!editingSheetTitle.trim()) { setEditingSheetId(null); return; }
    try {
      await sbPatch("sheets?id=eq." + id, { title: editingSheetTitle.trim() });
      setSheets(prev => prev.map(s => s.id === id ? Object.assign({}, s, { title: editingSheetTitle.trim() }) : s));
      if (onSheetTitleChange && id === activeSheetId) onSheetTitleChange(editingSheetTitle.trim());
    } catch(e) {
      showToast("시트 이름 저장 실패", "warn");
    }
    setEditingSheetId(null);
    setEditingSheetTitle("");
  }

  // ── 전체 저장 ────────────────────────────────────────────────────
  async function saveAllToDb() {
    if (!equipmentMapReady) { showToast("교구 정보 로드 중입니다. 잠시 후 다시 시도하세요.", "warn"); return; }
    setSaving(true);
    try {
      var inserts = [];
      instructors.forEach(function(inst) {
        WEEKS.forEach(function(w) {
          var val = (schedule[inst.id] && schedule[inst.id][w]) || "-";
          if (val !== "-") {
            inserts.push({
              sheet_id: activeSheetId,
              instructor_id: inst.id,
              equipment_id: equipmentMap[val] || null,
              year: 2026,
              week: w
            });
          }
        });
      });

      await sbDelete("rotation_schedule?year=eq.2026&sheet_id=eq." + activeSheetId);

      var batchSize = 50;
      for (var i = 0; i < inserts.length; i += batchSize) {
        await sbPost("rotation_schedule", inserts.slice(i, i + batchSize));
      }

      setSavedAt(new Date());
      setHasUnsaved(false);
      showToast("저장 완료! ✓");
    } catch(e) {
      showToast("저장 실패: " + e.message, "warn");
    } finally {
      setSaving(false);
    }
  }

  // ── 강사 추가 ────────────────────────────────────────────────────
  async function addInstructor() {
    if (!selectedUserId) { showToast("추가할 유저를 선택하세요", "warn"); return; }
    var selectedUser = userList.find(u => String(u.user_id) === String(selectedUserId));
    if (!selectedUser) return;

    try {
      var res = await sbPost("instructors", {
        name: newName.trim() || selectedUser.name,
        note: newNote.trim() || null,
        is_active: true,
        sort_order: instructors.length + 1,
        sheet_id: activeSheetId,
        user_id: selectedUser.user_id || null  // ← 로그인 매칭용 user_id 저장
      });

      if (res && res[0]) {
        var saved = res[0];
        var savedId = saved.id;

        // 스케줄 생성: 마지막 강사 스케줄을 shiftAmount만큼 뒤로 밀기
        var lastInst = instructors[instructors.length - 1];
        var newRow = {};
        WEEKS.forEach(function(week, wIdx) {
          var srcIdx = wIdx - shiftAmount;
          if (srcIdx < 0) {
            newRow[week] = "-";
          } else {
            newRow[week] = (lastInst && schedule[lastInst.id] && schedule[lastInst.id][WEEKS[srcIdx]]) || "-";
          }
        });

        // 현재 시트에만 반영
        var newEntry = {
          id: savedId,
          name: (saved.region ? saved.region + " - " : "") + saved.name,
          rawName: saved.name,
          region: saved.region || "",
          note: saved.note || "",
          sort_order: saved.sort_order
        };
        setInstructors(prev => prev.concat([newEntry]));
        setSchedule(prev => {
          var next = Object.assign({}, prev);
          next[savedId] = newRow;
          return next;
        });

        // rotation_schedule DB 저장
        if (equipmentMapReady) {
          var upserts = WEEKS
            .filter(w => newRow[w] && newRow[w] !== "-" && equipmentMap[newRow[w]])
            .map(w => ({ sheet_id: activeSheetId, instructor_id: savedId, equipment_id: equipmentMap[newRow[w]], year: 2026, week: w }));
          if (upserts.length > 0) await sbUpsert("rotation_schedule", upserts);
        }

        setNewName(""); setNewNote(""); setSelectedUserId(""); setUserSearch("");
        showToast(saved.name + " 강사 추가 완료!");
      }
    } catch(e) {
      showToast("강사 DB 저장 실패: " + e.message, "warn");
    }
  }

  // ── 강사 삭제 ────────────────────────────────────────────────────
  async function removeInstructor(id) {
    try {
      await sbDelete("rotation_schedule?instructor_id=eq." + id + "&year=eq.2026&sheet_id=eq." + activeSheetId);
      await sbDelete("handover_logs?instructor_id=eq." + id);
      await sbDelete("instructors?id=eq." + id);
    } catch(e) {
      showToast("강사 삭제 실패: " + e.message, "warn");
    }
    setInstructors(prev => prev.filter(i => i.id !== id));
    setSchedule(prev => { var n = Object.assign({}, prev); delete n[id]; return n; });
  }

  function removeSelected() {
    if (selectedFromIdx === null || !instructors[selectedFromIdx]) return;
    // 선택한 행 1개만 삭제 (이하 전체 X)
    var inst = instructors[selectedFromIdx];
    setConfirmTarget({ type: "single", id: inst.id, name: inst.name });
  }

  async function doRemoveSelected(ids) {
    for (var id of ids) await removeInstructor(id);
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

  // ── 강사 교체 ────────────────────────────────────────────────────
  async function doReplaceInstructor() {
    if (!replaceModal || !replaceSelectedUser) return;
    try {
      await sbPatch("instructors?id=eq." + replaceModal.instId, {
        name: replaceSelectedUser.name,
        region: replaceSelectedUser.region || null,
      });
      setInstructors(prev => prev.map(i =>
        i.id !== replaceModal.instId ? i :
        Object.assign({}, i, { name: replaceSelectedUser.name, region: replaceSelectedUser.region || "" })
      ));
      showToast(replaceModal.instName + " → " + replaceSelectedUser.name + " 교체 완료!");
      setReplaceModal(null); setReplaceSearch(""); setReplaceSelectedUser(null);
    } catch(e) {
      showToast("교체 실패: " + e.message, "warn");
    }
  }

  // ── 전체 이동 (shiftAll) ─────────────────────────────────────────
  async function shiftAll() {
    var n = shiftDir === "forward" ? shiftAmount : -shiftAmount;
    var targets = selectedFromIdx !== null
      ? instructors.slice(selectedFromIdx).map(i => i.id)
      : instructors.map(i => i.id);

    // 새 스케줄 계산 - 깊은 복사 + wrap-around 없이 범위 밖은 "-"
    var newSchedule = {};
    instructors.forEach(function(inst) {
      newSchedule[inst.id] = Object.assign({}, schedule[inst.id] || {});
    });
    targets.forEach(function(id) {
      var oldRow = schedule[id] || {};
      var newRow = {};
      WEEKS.forEach(function(week, wIdx) {
        var srcIdx = wIdx - n; // forward=뒤로 밀기 → srcIdx < 0 이면 공백
        if (srcIdx < 0 || srcIdx >= WEEKS.length) {
          newRow[week] = "-";
        } else {
          newRow[week] = oldRow[WEEKS[srcIdx]] || "-";
        }
      });
      newSchedule[id] = newRow;
    });

    setSchedule(newSchedule);

    var label = selectedFromIdx !== null
      ? (instructors[selectedFromIdx].name + " 이하 " + targets.length + "명")
      : "전체";
    showToast(label + " 교구 " + (shiftDir === "forward" ? "뒤로 →" : "← 앞으로") + " " + shiftAmount + "주 이동 · DB 저장 중...");

    if (!equipmentMapReady) { setHasUnsaved(true); return; }
    try {
      setSaving(true);
      for (var tid of targets) {
        await sbDelete("rotation_schedule?instructor_id=eq." + tid + "&year=eq.2026&sheet_id=eq." + activeSheetId);
      }
      var inserts = [];
      targets.forEach(function(id) {
        WEEKS.forEach(function(w) {
          var val = newSchedule[id][w];
          if (val && val !== "-" && equipmentMap[val]) {
            inserts.push({
              sheet_id: activeSheetId,
              instructor_id: id,
              equipment_id: equipmentMap[val],
              year: 2026,
              week: w
            });
          }
        });
      });
      var batchSize = 50;
      for (var i = 0; i < inserts.length; i += batchSize) {
        await sbPost("rotation_schedule", inserts.slice(i, i + batchSize));
      }
      setSavedAt(new Date());
      setHasUnsaved(false);
      showToast(label + " 교구 이동 저장 완료 ✓");
    } catch(e) {
      showToast("저장 실패: " + e.message, "warn");
      setHasUnsaved(true);
    } finally {
      setSaving(false);
    }
  }

  // ── 셀 변경 + Cascade ────────────────────────────────────────────
  // 각 강사 간 실제 간격을 스케줄에서 역산해서 cascade
  function getInstGap(instAIdx, instBIdx) {
    var instA = instructors[instAIdx];
    var instB = instructors[instBIdx];
    if (!instA || !instB) return shiftAmount;

    var schedA = schedule[instA.id] || {};
    var schedB = schedule[instB.id] || {};

    // 두 강사 사이의 최소 양수 gap 찾기 (공통 교구 중 인접한 것)
    var minGap = null;
    WEEKS.forEach(function(wA, idxA) {
      var eq = schedA[wA];
      if (!eq || eq === "-") return;
      // instB에서 같은 교구 찾기
      var idxB = WEEKS.findIndex(function(wB) { return schedB[wB] === eq; });
      if (idxB > idxA) {
        var g = idxB - idxA;
        if (minGap === null || g < minGap) minGap = g;
      }
    });

    if (minGap !== null) return minGap;

    // 공통 교구 없으면 첫 교구 주차 차이
    var firstIdxA = WEEKS.findIndex(function(w) { return schedA[w] && schedA[w] !== "-"; });
    var firstIdxB = WEEKS.findIndex(function(w) { return schedB[w] && schedB[w] !== "-"; });
    if (firstIdxA >= 0 && firstIdxB > firstIdxA) return firstIdxB - firstIdxA;

    return shiftAmount;
  }

  function applyCellAndCascade(instId, week, newVal) {
    var instIdx = instructors.findIndex(i => i.id === instId);
    var weekIdx = WEEKS.indexOf(week);

    // 삭제할 때는 해당 위치의 현재 교구명을 기억
    var deletingEq = (newVal === "-") ? (schedule[instId] && schedule[instId][week]) : null;

    var changes = [{ instId, week, val: newVal }];

    var cumulativeGap = 0;
    for (var i = instIdx + 1; i < instructors.length; i++) {
      var gap = getInstGap(i - 1, i);
      cumulativeGap += gap;
      var targetWeekIdx = weekIdx + cumulativeGap;
      if (targetWeekIdx >= WEEKS.length) break;
      var targetWeek = WEEKS[targetWeekIdx];
      var targetInst = instructors[i];

      // 삭제 시: 해당 위치에 같은 교구가 있을 때만 삭제
      if (deletingEq) {
        var currentVal = schedule[targetInst.id] && schedule[targetInst.id][targetWeek];
        if (currentVal !== deletingEq) continue; // 다른 교구면 건너뜀
      }

      changes.push({ instId: targetInst.id, week: targetWeek, val: newVal });
    }

    setSchedule(function(prev) {
      var n = Object.assign({}, prev);
      changes.forEach(function(c) {
        n[c.instId] = Object.assign({}, prev[c.instId]);
        n[c.instId][c.week] = c.val;
      });
      return n;
    });

    // DB 저장
    (async function() {
      if (!equipmentMapReady) {
        showToast("교구 정보 로드 중입니다. 잠시 후 다시 시도하세요.", "warn");
        return;
      }
      try {
        for (var c of changes) {
          await sbDelete("rotation_schedule?instructor_id=eq." + c.instId + "&week=eq." + c.week + "&year=eq.2026&sheet_id=eq." + activeSheetId);
        }
        var upserts = changes
          .filter(c => c.val !== "-" && equipmentMap[c.val]) // equipment_id 없으면 저장 안 함
          .map(c => ({
            sheet_id: activeSheetId, instructor_id: c.instId,
            equipment_id: equipmentMap[c.val], year: 2026, week: c.week
          }));
        if (upserts.length > 0) await sbPost("rotation_schedule", upserts);
      } catch(e) {
        showToast("DB 저장 실패: " + e.message, "warn");
      }
    })();
    setHasUnsaved(true);
  }

  // ── 색상 계산 ─────────────────────────────────────────────────────
  // 1번 강사 스케줄에서 교구 등장 순서대로 색상 인덱스 고정
  // 같은 교구명 = 항상 동일 색상 (모든 강사/주차)
  var eqColorMap = (function() {
    var map = {};
    var ci = 0;
    var firstInst = instructors[0];
    if (firstInst && schedule[firstInst.id]) {
      WEEKS.forEach(function(w) {
        var eq = schedule[firstInst.id][w];
        // 실제로 값이 있고 처음 등장하는 교구만 색상 부여
        if (eq && eq !== "-" && eq.trim() !== "" && map[eq] === undefined) {
          map[eq] = ci % 5;
          ci++;
        }
      });
    }
    return map;
  })();

  function getEqPal(eqName) {
    if (!eqName || eqName === "-" || eqName.trim() === "") return null;
    var idx = eqColorMap[eqName];
    if (idx === undefined) {
      // 1번 강사에 없는 교구는 등록된 교구 수 기준으로 색상 자동 배정
      idx = Object.keys(eqColorMap).length % 5;
    }
    return PALETTE[idx];
  }

  var selectedIds = selectedFromIdx !== null
    ? instructors.slice(selectedFromIdx).map(i => i.id)
    : null;

  // ── 렌더링 ───────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "sans-serif", minHeight: "100vh", background: "#0F1117", color: "#E2E8F0" }}>

      {/* 헤더 */}
      <div style={{ background: "#161B27", borderBottom: "1px solid #1E293B", padding: "0 16px", height: "50px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: "11px", fontWeight: "900" }}>B</span>
        </div>
        <span style={{ fontSize: "13px", fontWeight: "700", color: "#F1F5F9" }}>브레인힐 LMS</span>
        <span style={{ color: "#334155" }}>|</span>
        <span style={{ fontSize: "12px", color: "#818CF8", fontWeight: "600" }}>관리자 | 로테이션 설정</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {savedAt && !hasUnsaved && <span style={{ fontSize: "10px", color: "#22C55E" }}>✓ 저장됨 {savedAt.getHours().toString().padStart(2,"0")}:{savedAt.getMinutes().toString().padStart(2,"0")}</span>}
          {hasUnsaved && <span style={{ fontSize: "10px", color: "#F59E0B" }}>● 미저장 변경사항</span>}
          <button onClick={saveAllToDb} disabled={saving}
            style={{ padding: "6px 16px", background: saving ? "#334155" : hasUnsaved ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#1E293B", color: saving ? "#64748B" : hasUnsaved ? "#fff" : "#475569", border: "1px solid " + (hasUnsaved ? "transparent" : "#334155"), borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "저장 중..." : "💾 저장하기"}
          </button>
          <div style={{ fontSize: "10px", background: "#1E293B", color: "#64748B", padding: "3px 8px", borderRadius: "4px" }}>관리자</div>
        </div>
      </div>

      {/* 시트 탭 */}
      <div style={{ background: "#161B27", borderBottom: "1px solid #1E293B", padding: "0 14px", display: "flex", alignItems: "flex-end", gap: "2px", overflowX: "auto" }}>
        {sheets.map(function(sheet) {
          var isActive = sheet.id === activeSheetId;
          return (
            <div key={sheet.id}
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px 6px", borderRadius: "8px 8px 0 0", background: isActive ? "#0F1117" : "transparent", border: isActive ? "1px solid #1E293B" : "1px solid transparent", borderBottom: isActive ? "1px solid #0F1117" : "none", cursor: "pointer", flexShrink: 0, marginBottom: isActive ? "-1px" : "0" }}
              onClick={function() { if (!isActive) { setActiveSheetId(sheet.id); } }}>
              {editingSheetId === sheet.id ? (
                <input autoFocus value={editingSheetTitle}
                  onChange={e => setEditingSheetTitle(e.target.value)}
                  onBlur={() => saveSheetTitle(sheet.id)}
                  onKeyDown={e => { if (e.key === "Enter") saveSheetTitle(sheet.id); if (e.key === "Escape") setEditingSheetId(null); }}
                  onClick={e => e.stopPropagation()}
                  style={{ background: "#1E293B", border: "1px solid #6366F1", borderRadius: "4px", color: "#F1F5F9", fontSize: "11px", fontWeight: "700", padding: "2px 6px", outline: "none", width: "120px" }} />
              ) : (
                <span onDoubleClick={e => { e.stopPropagation(); setEditingSheetId(sheet.id); setEditingSheetTitle(sheet.title); }}
                  style={{ fontSize: "11px", fontWeight: isActive ? "700" : "500", color: isActive ? "#F1F5F9" : "#64748B", whiteSpace: "nowrap" }}>
                  {sheet.title}
                </span>
              )}
              {sheets.length > 1 && (
                <button onClick={e => { e.stopPropagation(); removeSheet(sheet.id); }}
                  style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: "11px", padding: "0 0 0 2px", lineHeight: 1 }}>×</button>
              )}
            </div>
          );
        })}
        <button onClick={() => { setShowNewSheetModal(true); setNewSheetTitle(""); }}
          style={{ padding: "8px 10px 6px", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}
          title="새 시트 추가">+</button>
      </div>

      <div style={{ padding: "14px 14px 0" }}>
        {/* 툴바 */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "#1E293B", border: "1px solid " + (selectedIds ? "#6366F1" : "#334155"), borderRadius: "7px", padding: "6px 10px", marginBottom: "12px", width: "fit-content", flexWrap: "wrap" }}>
          <span style={{ fontSize: "10px", color: selectedIds ? "#818CF8" : "#64748B", fontWeight: "600" }}>
            {selectedIds ? (instructors[selectedFromIdx] && instructors[selectedFromIdx].name + " 이하 " + selectedIds.length + "명 선택") : "전체 이동"}
          </span>
          {selectedIds && <button onClick={() => setSelectedFromIdx(null)} style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "9px" }}>선택 해제</button>}
          <span style={{ color: "#334155" }}>|</span>
          <button onClick={() => setShiftDir("back")} style={{ padding: "3px 8px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "600", background: shiftDir === "back" ? "#6366F1" : "#0F1117", color: shiftDir === "back" ? "#fff" : "#475569" }}>← 앞으로</button>
          <button onClick={() => setShiftDir("forward")} style={{ padding: "3px 8px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "600", background: shiftDir === "forward" ? "#6366F1" : "#0F1117", color: shiftDir === "forward" ? "#fff" : "#475569" }}>뒤로 →</button>
          <button onClick={() => setShiftAmount(Math.max(1, shiftAmount - 1))} style={{ width: "20px", height: "20px", borderRadius: "4px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "13px" }}>-</button>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#F1F5F9", minWidth: "26px", textAlign: "center" }}>{shiftAmount}주</span>
          <button onClick={() => setShiftAmount(Math.min(8, shiftAmount + 1))} style={{ width: "20px", height: "20px", borderRadius: "4px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "13px" }}>+</button>
          <button onClick={shiftAll} style={{ padding: "4px 12px", background: selectedIds ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#6366F1", color: "#fff", border: "none", borderRadius: "5px", fontSize: "10px", fontWeight: "700", cursor: "pointer" }}>적용</button>
        </div>

        {/* 테이블 */}
        {loadingSheet ? (
          <div style={{ background: "#161B27", border: "1px solid #1E293B", borderRadius: "9px", padding: "48px", textAlign: "center" }}>
            <div style={{ color: "#475569", fontSize: "12px" }}>⏳ 데이터 로드 중...</div>
          </div>
        ) : instructors.length === 0 ? (
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
                    <button onClick={() => setSelectedFromIdx(null)} style={{ background: "none", border: "none", color: selectedFromIdx !== null ? "#6366F1" : "#334155", cursor: "pointer", fontSize: "11px", fontWeight: "900", padding: "0" }}>{selectedFromIdx !== null ? "☑" : "☐"}</button>
                    <div style={{ fontSize: "8px", color: "#334155", marginTop: "1px" }}>이동</div>
                  </th>
                  <th style={{ padding: "9px 12px 9px 6px", fontSize: "10px", color: "#475569", fontWeight: "700", textAlign: "left", background: "#161B27", borderBottom: "1px solid #1E293B", position: "sticky", left: "36px", zIndex: 2, minWidth: "110px" }}>
                    <div>강사</div>
                    <div style={{ fontSize: "8px", color: "#334155", fontWeight: "400", marginTop: "2px" }}>← 앞(과거) · 뒤(미래) →</div>
                  </th>
                  {WEEKS.map(function(w) {
                    var isCur = w === CURRENT_WEEK;
                    // 헤더 색상 = 1번 강사 해당 주차 교구명 기준
                    var firstInst = instructors[0];
                    var firstEq = firstInst && schedule[firstInst.id] ? schedule[firstInst.id][w] : null;
                    var pal = getEqPal(firstEq);
                    return (
                      <th key={w} style={{ padding: "8px 5px", fontSize: "11px", textAlign: "center", whiteSpace: "nowrap", minWidth: "80px", fontWeight: "700", background: isCur ? "#1E2A4A" : (pal ? pal.bg : "#161B27"), color: isCur ? "#818CF8" : (pal ? pal.text : "#475569"), borderBottom: "2px solid " + (isCur ? "#6366F1" : (pal ? pal.border : "#1E293B")), borderLeft: "1px solid " + (pal ? pal.border + "40" : "#1E293B"), outline: isCur ? "2px solid #6366F1" : "none", outlineOffset: "-2px" }}>
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
                      <td style={{ padding: "0 6px 0 10px", position: "sticky", left: 0, zIndex: 1, background: rowBase, textAlign: "center", width: "28px" }}>
                        <button onClick={() => setSelectedFromIdx(selectedFromIdx === rowIdx ? null : rowIdx)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", color: isSelected ? "#818CF8" : "#334155", padding: "6px 2px", lineHeight: 1, display: "block" }}>
                          {isSelected ? "☑" : "☐"}
                        </button>
                      </td>
                      <td style={{ padding: "0 8px 0 6px", position: "sticky", left: "36px", zIndex: 1, background: rowBase, borderRight: "1px solid #1E293B", minWidth: "130px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                          {/* 강사명 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: isSelected ? "#A5B4FC" : "#E2E8F0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {inst.name}
                            </div>
                            {inst.note && <div style={{ fontSize: "10px", color: "#475569", marginTop: "1px" }}>{inst.note}</div>}
                          </div>
                          {/* 교체 버튼 */}
                          <button
                            onClick={e => { e.stopPropagation(); setReplaceModal({ instId: inst.id, instName: inst.name }); setReplaceSearch(""); setReplaceSelectedUser(null); }}
                            title="강사 교체"
                            style={{ flexShrink: 0, background: "none", border: "1px solid #334155", borderRadius: "4px", cursor: "pointer", fontSize: "11px", padding: "3px 6px", color: "#64748B", lineHeight: 1 }}>✎</button>
                          {/* 삭제 버튼 */}
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmTarget({ type: "single", id: inst.id, name: inst.name }); }}
                            title={inst.name + " 삭제"}
                            style={{ flexShrink: 0, background: "none", border: "1px solid #7F1D1D44", borderRadius: "4px", cursor: "pointer", fontSize: "11px", padding: "3px 6px", color: "#EF4444", lineHeight: 1 }}>🗑</button>
                        </div>
                      </td>
                      {WEEKS.map(function(w) {
                        var val = (schedule[inst.id] && schedule[inst.id][w]) || "-";
                        var isCur = w === CURRENT_WEEK;
                        var pal = val !== "-" ? getEqPal(val) : null;
                        var isPopupOpen = eqPopup && eqPopup.instId === inst.id && eqPopup.week === w;
                        var log = val !== "-" ? handoverLogs && handoverLogs.find(l => l.instId === inst.id && l.week === w) : null;
                        var qtyBadge = null;
                        if (log) {
                          var diff = BASE_QTY - log.qty;
                          if (diff > 3) qtyBadge = <div style={{ fontSize: "9px", fontWeight: "800", color: "#EF4444", background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "3px", padding: "2px 5px", marginTop: "3px", whiteSpace: "nowrap", display: "inline-block" }}>⚠ {log.qty}개</div>;
                          else if (diff > 0) qtyBadge = <div style={{ fontSize: "9px", color: "#94A3B8", background: "rgba(148,163,184,0.15)", border: "1px solid rgba(148,163,184,0.3)", borderRadius: "3px", padding: "2px 5px", marginTop: "3px", whiteSpace: "nowrap", display: "inline-block" }}>{log.qty}개</div>;
                        }
                        return (
                          <td key={w} onClick={() => { setEqPopup({ instId: inst.id, week: w, currentVal: val, logs: handoverLogs ? handoverLogs.filter(l => l.instId === inst.id && l.week === w) : [], view: "select" }); setEqSearch(""); }}
                            style={{ padding: "0", textAlign: "center", background: isPopupOpen ? "#1E2A4A" : (pal ? pal.bg : rowBase), borderLeft: "1px solid " + (pal ? pal.border + "30" : "#1E293B"), outline: isPopupOpen ? "2px solid #6366F1" : isCur ? "2px solid rgba(99,102,241,0.4)" : "none", outlineOffset: "-2px", cursor: "pointer", minWidth: "80px" }}>
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

        {/* 강사 추가 */}
        <div style={{ marginTop: "10px", background: "#161B27", border: "1px solid #1E293B", borderRadius: "9px", padding: "12px 14px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "10px" }}>
            + 강사 추가 <span style={{ fontSize: "10px", color: "#6366F1", fontWeight: "600" }}>({activeSheet && activeSheet.title})</span>
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
            {/* 검색 드롭다운 */}
            <div style={{ flex: 2, minWidth: "200px", position: "relative" }}>
              <input ref={userSearchRef} value={userSearch}
                onChange={e => { setUserSearch(e.target.value); setSelectedUserId(""); setNewName(""); setShowUserDropdown(true); }}
                onFocus={() => setShowUserDropdown(true)}
                onBlur={() => setTimeout(() => setShowUserDropdown(false), 150)}
                placeholder="강사명 검색... (예: 김은지)"
                style={{ width: "100%", padding: "7px 10px", background: "#0F1117", border: "1px solid " + (selectedUserId ? "#6366F1" : "#334155"), borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none", boxSizing: "border-box" }} />
              {selectedUserId && <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "#22C55E" }}>✓</span>}
              {showUserDropdown && userSearch.trim().length >= 1 && (function() {
                var matched = userList.filter(u => u.name && u.name.includes(userSearch.trim())).slice(0, 10);
                if (matched.length === 0) return <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", zIndex: 100, padding: "10px", fontSize: "11px", color: "#475569" }}>검색 결과 없음</div>;
                return (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", zIndex: 100, maxHeight: "200px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                    {matched.map(u => {
                      var alreadyAdded = instructors.some(i => i.rawName === u.name);
                      return (
                        <div key={u.user_id}
                          onMouseDown={() => { if (alreadyAdded) return; setSelectedUserId(String(u.user_id)); setUserSearch(u.name); setNewName(u.name); setShowUserDropdown(false); }}
                          style={{ padding: "8px 12px", cursor: alreadyAdded ? "default" : "pointer", borderBottom: "1px solid #0F1117", opacity: alreadyAdded ? 0.45 : 1 }}
                          onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = "#334155"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: "#F1F5F9" }}>{u.name}</span>
                              {alreadyAdded && <span style={{ fontSize: "9px", background: "#1E3A2A", color: "#22C55E", border: "1px solid #22C55E44", borderRadius: "3px", padding: "1px 5px" }}>등록됨</span>}
                            </div>
                            <span style={{ fontSize: "10px", color: "#64748B" }}>{u.phone || ""}</span>
                          </div>
                          <div style={{ fontSize: "10px", color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.address || ""}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="표시 이름 (선택)" style={{ flex: 1, minWidth: "120px", padding: "7px 10px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none" }} />
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="비고 (선택)" style={{ flex: 1, minWidth: "80px", padding: "7px 10px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none" }} />
            <button onClick={addInstructor} style={{ padding: "7px 14px", background: selectedUserId ? "#6366F1" : "#334155", color: selectedUserId ? "#fff" : "#64748B", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: selectedUserId ? "pointer" : "not-allowed" }}>추가</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#0F1117", border: "1px solid #6366F130", borderRadius: "6px", padding: "6px 10px" }}>
            <span style={{ fontSize: "10px", color: "#818CF8", fontWeight: "600" }}>교구 간격</span>
            <button onClick={() => setShiftAmount(v => Math.max(1, v-1))} style={{ width: "18px", height: "18px", background: "#1E293B", border: "none", borderRadius: "3px", color: "#94A3B8", cursor: "pointer", fontSize: "12px" }}>−</button>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#A5B4FC", minWidth: "24px", textAlign: "center" }}>{shiftAmount}주</span>
            <button onClick={() => setShiftAmount(v => Math.min(8, v+1))} style={{ width: "18px", height: "18px", background: "#1E293B", border: "none", borderRadius: "3px", color: "#94A3B8", cursor: "pointer", fontSize: "12px" }}>+</button>
            <span style={{ fontSize: "9px", color: "#475569", marginLeft: "4px" }}>← 툴바 간격과 동일</span>
          </div>
        </div>

        {/* 색상 범례 */}
        <div style={{ marginTop: "8px", marginBottom: "18px", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: "#475569", marginRight: "4px" }}>열 색상 (1번 강사 기준):</span>
          {["파랑","초록","주황","보라","빨강"].map((label, i) => {
            var pal = PALETTE[i];
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", background: pal.bg, border: "1px solid " + pal.border + "60", borderRadius: "5px", padding: "4px 10px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: pal.border }} />
                <span style={{ fontSize: "11px", color: pal.text, fontWeight: "600" }}>{label}</span>
              </div>
            );
          })}
          <span style={{ fontSize: "10px", color: "#334155", marginLeft: "4px" }}>· 6번째부터 반복</span>
        </div>
      </div>

      {/* 새 시트 모달 */}
      {showNewSheetModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#161B27", border: "1px solid #334155", borderRadius: "14px", padding: "24px 22px", width: "300px" }}>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "#F1F5F9", marginBottom: "5px" }}>새 프로그램 시트 추가</div>
            <div style={{ fontSize: "10px", color: "#64748B", marginBottom: "16px" }}>예: 교구인지, 놀이치료, 음악치료</div>
            <input autoFocus value={newSheetTitle}
              onChange={e => setNewSheetTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addSheet(); if (e.key === "Escape") setShowNewSheetModal(false); }}
              placeholder="프로그램명 입력..."
              style={{ width: "100%", padding: "10px 12px", background: "#0F1117", border: "1px solid #334155", borderRadius: "7px", fontSize: "12px", color: "#E2E8F0", outline: "none", boxSizing: "border-box", marginBottom: "14px" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setShowNewSheetModal(false)} style={{ flex: 1, padding: "10px", background: "#0F1117", color: "#64748B", border: "1px solid #334155", borderRadius: "7px", fontSize: "12px", cursor: "pointer" }}>취소</button>
              <button onClick={addSheet} style={{ flex: 2, padding: "10px", background: newSheetTitle.trim() ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#1E293B", color: newSheetTitle.trim() ? "#fff" : "#475569", border: "none", borderRadius: "7px", fontSize: "12px", fontWeight: "700", cursor: newSheetTitle.trim() ? "pointer" : "not-allowed" }}>시트 추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 교구 선택 팝업 */}
      {eqPopup && (function() {
        var panelInst = instructors.find(i => i.id === eqPopup.instId);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
            onMouseDown={e => { if (e.target === e.currentTarget) { setEqPopup(null); setEqSearch(""); } }}>
            <div ref={popupRef} style={{ background: "#1E293B", borderRadius: "16px", border: "1px solid #334155", width: "100%", maxWidth: "420px", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 48px rgba(0,0,0,0.5)", overflow: "hidden" }}>
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "800", color: "#F1F5F9" }}>교구 선택</div>
                    <div style={{ fontSize: "11px", color: "#64748B", marginTop: "3px" }}>{WEEK_LABELS[eqPopup.week]} · {(panelInst || {}).name || ""}</div>
                  </div>
                  <button onClick={() => { setEqPopup(null); setEqSearch(""); }} style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#334155", border: "none", color: "#94A3B8", fontSize: "17px", cursor: "pointer" }}>✕</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0F1117", borderRadius: "9px", padding: "10px 14px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>현재</span>
                  <span style={{ fontSize: "15px", fontWeight: "800", color: eqPopup.currentVal !== "-" ? "#A5B4FC" : "#334155", flex: 1 }}>{eqPopup.currentVal !== "-" ? eqPopup.currentVal : "없음"}</span>
                  {eqPopup.currentVal !== "-" && (
                    <button onClick={() => { var affected = instructors.length - 1 - instructors.findIndex(i => i.id === eqPopup.instId); applyCellAndCascade(eqPopup.instId, eqPopup.week, "-"); showToast("교구 삭제 · 아래 " + affected + "명 자동 편성", "warn"); setEqPopup(null); setEqSearch(""); }}
                      style={{ background: "#2D0A0A", border: "1px solid #7F1D1D", borderRadius: "6px", color: "#F87171", cursor: "pointer", fontSize: "11px", fontWeight: "700", padding: "5px 10px" }}>삭제</button>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", color: "#64748B", pointerEvents: "none" }}>🔍</span>
                  <input autoFocus value={eqSearch}
                    onChange={e => setEqSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setEqPopup(null); setEqSearch(""); }
                      if (e.key === "Enter") {
                        var filtered = eqList.filter(eq => eq.includes(eqSearch));
                        if (filtered.length >= 1) { var affected = instructors.length - 1 - instructors.findIndex(i => i.id === eqPopup.instId); applyCellAndCascade(eqPopup.instId, eqPopup.week, filtered[0]); showToast(filtered[0] + " 변경 · 아래 " + affected + "명 자동 편성"); setEqPopup(null); setEqSearch(""); }
                      }
                    }}
                    placeholder="교구 이름 검색..."
                    style={{ width: "100%", padding: "13px 14px 13px 42px", background: "#0F1117", border: "1.5px solid #475569", borderRadius: "10px", fontSize: "15px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {(function() {
                  var filtered = eqSearch === "" ? eqList : eqList.filter(eq => eq.includes(eqSearch));
                  if (filtered.length === 0 && eqSearch.trim()) {
                    // 검색 결과 없음 → 신규 교구 추가 버튼
                    return (
                      <div style={{ padding: "20px 18px", textAlign: "center" }}>
                        <div style={{ fontSize: "12px", color: "#475569", marginBottom: "12px" }}>
                          <span style={{ color: "#A5B4FC", fontWeight: "700" }}>"{eqSearch}"</span> 검색 결과 없음
                        </div>
                        <button onClick={async function() {
                          var newEqName = eqSearch.trim();
                          if (!newEqName) return;
                          try {
                            var res = await sbPost("equipment", { name: newEqName, base_qty: 50, is_active: true });
                            var newId = res && res[0] ? res[0].id : null;
                            setEqList(prev => prev.concat([newEqName]).sort());
                            if (newId) setEquipmentMap(prev => Object.assign({}, prev, { [newEqName]: newId }));
                            showToast(newEqName + " 교구 추가 완료!");
                          } catch(e) {
                            setEqList(prev => prev.concat([newEqName]).sort());
                            showToast(newEqName + " 추가 (로컬만 반영 - DB 저장 실패)");
                          }
                        }}
                          style={{ width: "100%", padding: "12px 18px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "9px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                          + "{eqSearch}" 교구 DB에 추가
                        </button>
                        <div style={{ fontSize: "10px", color: "#334155", marginTop: "8px" }}>equipment 테이블에 저장됩니다</div>
                      </div>
                    );
                  }
                  return filtered.map(eq => {
                    var isSelected = eq === eqPopup.currentVal;
                    return (
                      <button key={eq} onClick={() => { var affected = instructors.length - 1 - instructors.findIndex(i => i.id === eqPopup.instId); applyCellAndCascade(eqPopup.instId, eqPopup.week, eq); showToast(eq + " 변경 · 아래 " + affected + "명 자동 편성"); setEqPopup(null); setEqSearch(""); }}
                        style={{ width: "100%", padding: "13px 18px", background: isSelected ? "#1E2A4A" : "transparent", border: "none", borderBottom: "1px solid #1E293B", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "14px", fontWeight: isSelected ? "800" : "500", color: isSelected ? "#A5B4FC" : "#CBD5E1", flex: 1 }}>{eq}</span>
                        {isSelected && <span style={{ fontSize: "11px", color: "#6366F1", fontWeight: "700" }}>현재 ✓</span>}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* 하단 고정: 새 교구 직접 입력 */}
              <div style={{ borderTop: "1px solid #1E293B", padding: "10px 14px", flexShrink: 0, display: "flex", gap: "7px" }}>
                <input
                  id="newEqDirectInput"
                  placeholder="새 교구명 직접 입력..."
                  style={{ flex: 1, padding: "8px 11px", background: "#0F1117", border: "1.5px solid #334155", borderRadius: "8px", fontSize: "12px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }}
                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.nextSibling.click(); }}
                />
                <button onClick={async function() {
                  var input = document.getElementById("newEqDirectInput");
                  var newEqName = input ? input.value.trim() : "";
                  if (!newEqName) return;
                  if (eqList.includes(newEqName)) { showToast("이미 존재하는 교구입니다", "warn"); return; }
                  try {
                    var res = await sbPost("equipment", { name: newEqName, base_qty: 50, is_active: true });
                    var newId = res && res[0] ? res[0].id : null;
                    setEqList(prev => prev.concat([newEqName]).sort());
                    if (newId) setEquipmentMap(prev => Object.assign({}, prev, { [newEqName]: newId }));
                    showToast(newEqName + " 교구 추가 완료!");
                    if (input) input.value = "";
                  } catch(e) {
                    setEqList(prev => prev.concat([newEqName]).sort());
                    showToast(newEqName + " 추가 (로컬만 반영 - DB 저장 실패)");
                    if (input) input.value = "";
                  }
                }}
                  style={{ padding: "8px 14px", background: "#6366F1", color: "#fff", border: "none", borderRadius: "8px", fontSize: "11px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
                  + 추가
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 강사 교체 모달 */}
      {replaceModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={e => { if (e.target === e.currentTarget) { setReplaceModal(null); setReplaceSearch(""); setReplaceSelectedUser(null); } }}>
          <div style={{ background: "#1E293B", borderRadius: "14px", border: "1px solid #334155", padding: "24px 24px 20px", width: "360px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "15px", fontWeight: "800", color: "#F1F5F9", marginBottom: "4px" }}>강사 교체</div>
              <div style={{ fontSize: "11px", color: "#64748B" }}><span style={{ color: "#A5B4FC", fontWeight: "700" }}>{replaceModal.instName}</span> → 새 강사로 교체 (로테이션 일정 유지)</div>
            </div>
            <div style={{ position: "relative", marginBottom: "12px" }}>
              <input autoFocus value={replaceSearch}
                onChange={e => { setReplaceSearch(e.target.value); setReplaceSelectedUser(null); }}
                placeholder="교체할 강사명 검색..."
                style={{ width: "100%", padding: "10px 12px", background: "#0F1117", border: "1.5px solid " + (replaceSelectedUser ? "#6366F1" : "#334155"), borderRadius: "8px", fontSize: "13px", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }} />
              {replaceSelectedUser && <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#22C55E" }}>✓</span>}
              {replaceSearch.trim().length >= 1 && !replaceSelectedUser && (function() {
                var matched = userList.filter(u => u.name && u.name.includes(replaceSearch.trim())).slice(0, 8);
                if (matched.length === 0) return <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", zIndex: 200, padding: "10px", fontSize: "11px", color: "#475569" }}>검색 결과 없음</div>;
                return (
                  <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", zIndex: 200, maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                    {matched.map(u => {
                      var alreadyAdded = instructors.some(i => i.rawName === u.name && i.id !== replaceModal.instId);
                      return (
                        <div key={u.user_id} onMouseDown={() => { if (!alreadyAdded) { setReplaceSelectedUser(u); setReplaceSearch(u.name); } }}
                          style={{ padding: "8px 12px", cursor: alreadyAdded ? "default" : "pointer", borderBottom: "1px solid #0F1117", opacity: alreadyAdded ? 0.4 : 1 }}
                          onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = "#334155"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#F1F5F9" }}>{u.name}</span>
                              {alreadyAdded && <span style={{ fontSize: "9px", background: "#1E3A2A", color: "#22C55E", border: "1px solid #22C55E44", borderRadius: "3px", padding: "1px 5px" }}>등록됨</span>}
                            </div>
                            <span style={{ fontSize: "10px", color: "#64748B" }}>{u.phone || ""}</span>
                          </div>
                          <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>{u.address || ""}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {replaceSelectedUser && (
              <div style={{ background: "#0F1117", borderRadius: "8px", padding: "10px 12px", marginBottom: "14px", border: "1px solid #6366F1" }}>
                <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "4px" }}>교체 대상</div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "14px", fontWeight: "800", color: "#A5B4FC" }}>{replaceSelectedUser.name}</span>
                  <span style={{ fontSize: "10px", color: "#64748B" }}>{replaceSelectedUser.phone || ""}</span>
                </div>
                <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>{replaceSelectedUser.address || ""}</div>
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => { setReplaceModal(null); setReplaceSearch(""); setReplaceSelectedUser(null); }}
                style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "12px" }}>취소</button>
              <button onClick={doReplaceInstructor} disabled={!replaceSelectedUser}
                style={{ padding: "8px 18px", borderRadius: "7px", border: "none", background: replaceSelectedUser ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#334155", color: replaceSelectedUser ? "#fff" : "#64748B", cursor: replaceSelectedUser ? "pointer" : "not-allowed", fontSize: "12px", fontWeight: "700" }}>교체하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {confirmTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirmTarget(null); }}>
          <div style={{ background: "#1E293B", borderRadius: "14px", border: "1px solid #334155", padding: "24px 28px", minWidth: "260px", maxWidth: "340px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>

            {/* 제목 */}
            <div style={{ fontSize: "15px", fontWeight: "800", color: "#F1F5F9", marginBottom: "10px" }}>
              {confirmTarget.type === "sheet" ? "🗂 시트 삭제" : "강사 삭제"}
            </div>

            {/* 내용 */}
            <div style={{ fontSize: "12px", color: "#94A3B8", marginBottom: "8px", lineHeight: "1.7" }}>
              {confirmTarget.type === "sheet"
                ? <><span style={{ color: "#F87171", fontWeight: "700" }}>"{confirmTarget.name}"</span> 시트를 삭제하시겠습니까?</>
                : <><span style={{ color: "#F87171", fontWeight: "700" }}>{confirmTarget.name}</span> 강사를 삭제하시겠습니까?</>
              }
            </div>
            {confirmTarget.type === "sheet" && (
              <div style={{ fontSize: "11px", color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px", padding: "8px 12px", marginBottom: "16px", lineHeight: "1.6" }}>
                ⚠ 시트에 등록된 강사 {instructors.length}명과 모든 로테이션 데이터가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </div>
            )}
            {confirmTarget.type !== "sheet" && <div style={{ marginBottom: "16px" }} />}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmTarget(null)}
                style={{ padding: "7px 16px", borderRadius: "7px", border: "1px solid #334155", background: "#0F1117", color: "#94A3B8", cursor: "pointer", fontSize: "12px" }}>취소</button>
              <button onClick={() => {
                if (confirmTarget.type === "sheet") doRemoveSheet(confirmTarget.id);
                else doRemoveSingle(confirmTarget.id, confirmTarget.name);
              }}
                style={{ padding: "7px 18px", borderRadius: "7px", border: "none", background: "#DC2626", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: "700" }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: "18px", left: "50%", transform: "translateX(-50%)", background: toast.type === "warn" ? "#F59E0B" : "#6366F1", color: "#fff", padding: "8px 18px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", zIndex: 9999, maxWidth: "320px", textAlign: "center" }}>{toast.msg}</div>}
    </div>
  );
}
