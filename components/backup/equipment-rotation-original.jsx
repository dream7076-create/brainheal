import { useState, useEffect, useRef } from "react";

// ── Supabase 클라이언트 ────────────────────────────────
const SUPABASE_URL = "https://kwoyfapyufslrbhiafki.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3b3lmYXB5dWZzbHJiaGlhZmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDk4OTMsImV4cCI6MjA4OTEyNTg5M30.DmaQVn1Zaz6CBFklq6vxreYdl1e7WJmWCryH8KphK-c";


// 로그인한 사용자의 accessToken 전역 관리
var _accessToken = null;
var _refreshToken = null;
function setAccessToken(token) { _accessToken = token; }
function setRefreshToken(token) { _refreshToken = token; }
function getAuthToken() { return _accessToken || SUPABASE_KEY; }

async function refreshAccessToken() {
  if (!_refreshToken) return false;
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
      return true;
    }
  } catch (e) {
    console.error("토큰 갱신 실패:", e);
  }
  return false;
}

async function sbFetch(path, opts = {}) {
  const authToken = _accessToken || SUPABASE_KEY;
  // prefer는 헤더용이므로 fetch options에서 분리
  const { prefer, headers: extraHeaders, ...fetchOpts } = opts;
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + authToken,
      "Content-Type": "application/json",
      "Prefer": prefer || "return=representation",
      ...(extraHeaders || {})
    },
    ...fetchOpts
  });
  
  // 401 Unauthorized 응답 시 토큰 갱신 시도
  if (res.status === 401 && _refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = _accessToken;
      const retryRes = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + newToken,
          "Content-Type": "application/json",
          "Prefer": prefer || "return=representation",
          ...(extraHeaders || {})
        },
        ...fetchOpts
      });
      if (!retryRes.ok) {
        const errText = await retryRes.text();
        let errMsg = errText;
        try { errMsg = JSON.parse(errText).message || errText; } catch(_) {}
        console.error("sbFetch retry error [" + path + "]:", errText);
        throw new Error(errMsg);
      }
      const text = await retryRes.text();
      return text ? JSON.parse(text) : [];
    }
  }
  
  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText;
    try { errMsg = JSON.parse(errText).message || errText; } catch(_) {}
    console.error("sbFetch error [" + path + "] status=" + res.status + ":", errText);
    throw new Error(errMsg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function sbGet(path)           { return sbFetch(path); }
function sbPost(table, body)   { return sbFetch(table, { method: "POST", body: JSON.stringify(body) }); }
function sbPatch(table, body)  { return sbFetch(table, { method: "PATCH", body: JSON.stringify(body), prefer: "return=minimal" }); }
function sbUpsert(table, body) { return sbFetch(table, { method: "POST", body: JSON.stringify(body), prefer: "resolution=merge-duplicates,return=representation" }); }
function sbDelete(table)       { return sbFetch(table, { method: "DELETE", prefer: "return=minimal" }); }

const WEEKS = ["1-1","1-2","1-3","1-4","1-5","2-1","2-2","2-3","2-4","3-1","3-2","3-3","3-4","4-1","4-2","4-3","4-4","5-1","5-2","5-3","5-4","5-5","6-1","6-2","6-3","6-4","7-1","7-2","7-3","7-4","7-5","8-1","8-2","8-3","8-4","9-1","9-2","9-3","9-4","10-1","10-2","10-3","10-4","10-5","11-1","11-2","11-3","11-4","12-1","12-2","12-3","12-4"];
const WEEK_LABELS = {"1-1":"1월 1주","1-2":"1월 2주","1-3":"1월 3주","1-4":"1월 4주","1-5":"1월 5주","2-1":"2월 1주","2-2":"2월 2주","2-3":"2월 3주","2-4":"2월 4주","3-1":"3월 1주","3-2":"3월 2주","3-3":"3월 3주","3-4":"3월 4주","4-1":"4월 1주","4-2":"4월 2주","4-3":"4월 3주","4-4":"4월 4주","5-1":"5월 1주","5-2":"5월 2주","5-3":"5월 3주","5-4":"5월 4주","5-5":"5월 5주","6-1":"6월 1주","6-2":"6월 2주","6-3":"6월 3주","6-4":"6월 4주","7-1":"7월 1주","7-2":"7월 2주","7-3":"7월 3주","7-4":"7월 4주","7-5":"7월 5주","8-1":"8월 1주","8-2":"8월 2주","8-3":"8월 3주","8-4":"8월 4주","9-1":"9월 1주","9-2":"9월 2주","9-3":"9월 3주","9-4":"9월 4주","10-1":"10월 1주","10-2":"10월 2주","10-3":"10월 3주","10-4":"10월 4주","10-5":"10월 5주","11-1":"11월 1주","11-2":"11월 2주","11-3":"11월 3주","11-4":"11월 4주","12-1":"12월 1주","12-2":"12월 2주","12-3":"12월 3주","12-4":"12월 4주"};

// 현재 주차 동적 계산
function getCurrentWeek() {
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12
  const date = today.getDate();
  
  // 각 월의 주차 계산 (대략적인 기준)
  // 1-7일: 1주, 8-14일: 2주, 15-21일: 3주, 22-28일: 4주, 29-31일: 5주
  let week;
  if (date <= 7) week = 1;
  else if (date <= 14) week = 2;
  else if (date <= 21) week = 3;
  else if (date <= 28) week = 4;
  else week = 5;
  
  console.log("📅 getCurrentWeek: date=" + date + " → week=" + week);
  return month + "-" + week;
}

const CURRENT_WEEK = getCurrentWeek();  // 런타임마다 재계산 (클라이언트 사이드)

// ── 더미 데이터 (DB 연동 실패 시 사용) ────────────────────────────────
const INITIAL_INSTRUCTORS = [
  { id: "id1",  name: "경기 - 김정희", note: "(50)" },
  { id: "id2",  name: "임동윤",  note: "" },
  { id: "id3",  name: "김은지",  note: "" },
  { id: "id4",  name: "전희경",  note: "" },
  { id: "id5",  name: "김후자",  note: "" },
  { id: "id6",  name: "박은지",  note: "" },
  { id: "id7",  name: "김기환",  note: "" },
  { id: "id8",  name: "강정희",  note: "" },
  { id: "id9",  name: "박민정B", note: "" },
  { id: "id10", name: "김양기",  note: "" },
  { id: "id11", name: "강문성",  note: "" },
];

const INIT_SCHEDULE = {
  "id1":  {"1-1":"보치아","1-2":"종이컵챌린지","1-3":"요요볼","1-4":"스틱검도","1-5":"성게볼놀이","2-1":"플라잉디스크","2-2":"딱지놀이","2-3":"사방치기","2-4":"골프","3-1":"빅컵","3-2":"링고리협동게임","3-3":"농구","3-4":"풍선라켓","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id2":  {"1-1":"야구","1-2":"보치아","1-3":"종이컵챌린지","1-4":"요요볼","1-5":"스틱검도","2-1":"성게볼놀이","2-2":"플라잉디스크","2-3":"딱지놀이","2-4":"발판놀이","3-1":"골프","3-2":"빅컵","3-3":"링고리협동게임","3-4":"농구","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id3":  {"1-1":"백업고리놀이","1-2":"야구","1-3":"보치아","1-4":"종이컵챌린지","1-5":"요요볼","2-1":"스틱검도","2-2":"성게볼놀이","2-3":"플라잉디스크","2-4":"스쿠프","3-1":"발판놀이","3-2":"골프","3-3":"빅컵","3-4":"링고리협동게임","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id4":  {"1-1":"백업링토스","1-2":"백업고리놀이","1-3":"야구","1-4":"보치아","1-5":"종이컵챌린지","2-1":"요요볼","2-2":"스틱검도","2-3":"성게볼놀이","2-4":"플라잉디스크","3-1":"스쿠프","3-2":"발판놀이","3-3":"골프","3-4":"빅컵","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id5":  {"1-1":"하키","1-2":"백업링토스","1-3":"백업고리놀이","1-4":"야구","1-5":"보치아","2-1":"종이컵챌린지","2-2":"요요볼","2-3":"스틱검도","2-4":"성게볼놀이","3-1":"플라잉디스크","3-2":"스쿠프","3-3":"발판놀이","3-4":"골프","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id6":  {"1-1":"튜빙밴드","1-2":"하키","1-3":"백업링토스","1-4":"백업고리놀이","1-5":"야구","2-1":"보치아","2-2":"종이컵챌린지","2-3":"요요볼","2-4":"스틱검도","3-1":"성게볼놀이","3-2":"플라잉디스크","3-3":"스쿠프","3-4":"발판놀이","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id7":  {"1-1":"연탄놀이","1-2":"튜빙밴드","1-3":"하키","1-4":"백업링토스","1-5":"백업고리놀이","2-1":"야구","2-2":"보치아","2-3":"종이컵챌린지","2-4":"요요볼","3-1":"스틱검도","3-2":"성게볼놀이","3-3":"플라잉디스크","3-4":"스쿠프","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id8":  {"1-1":"탁구","1-2":"연탄놀이","1-3":"튜빙밴드","1-4":"하키","1-5":"백업링토스","2-1":"백업고리놀이","2-2":"야구","2-3":"보치아","2-4":"종이컵챌린지","3-1":"요요볼","3-2":"스틱검도","3-3":"성게볼놀이","3-4":"플라잉디스크","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id9":  {"1-1":"협동공놀이","1-2":"탁구","1-3":"연탄놀이","1-4":"튜빙밴드","1-5":"하키","2-1":"백업링토스","2-2":"백업고리놀이","2-3":"야구","2-4":"보치아","3-1":"종이컵챌린지","3-2":"요요볼","3-3":"스틱검도","3-4":"성게볼놀이","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id10": {"1-1":"사방치기","1-2":"협동공놀이","1-3":"탁구","1-4":"연탄놀이","1-5":"튜빙밴드","2-1":"하키","2-2":"백업링토스","2-3":"백업고리놀이","2-4":"야구","3-1":"보치아","3-2":"종이컵챌린지","3-3":"요요볼","3-4":"스틱검도","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
  "id11": {"1-1":"딱지놀이","1-2":"사방치기","1-3":"협동공놀이","1-4":"탁구","1-5":"연탄놀이","2-1":"튜빙밴드","2-2":"하키","2-3":"백업링토스","2-4":"백업고리놀이","3-1":"야구","3-2":"보치아","3-3":"종이컵챌린지","3-4":"요요볼","4-1":"-","4-2":"-","4-3":"-","4-4":"-","5-1":"-","5-2":"-","5-3":"-","5-4":"-","5-5":"-","6-1":"-","6-2":"-","6-3":"-","6-4":"-","7-1":"-","7-2":"-","7-3":"-","7-4":"-","7-5":"-","8-1":"-","8-2":"-","8-3":"-","8-4":"-","9-1":"-","9-2":"-","9-3":"-","9-4":"-","10-1":"-","10-2":"-","10-3":"-","10-4":"-","10-5":"-","11-1":"-","11-2":"-","11-3":"-","11-4":"-","12-1":"-","12-2":"-","12-3":"-","12-4":"-"},
};

const INIT_HANDOVER_LOGS = [];

const EQUIPMENT_LIST = ["보치아","종이컵챌린지","요요볼","스틱검도","성게볼놀이","플라잉디스크","딱지놀이","사방치기","협동공놀이","탁구","연탄놀이","튜빙밴드","하키","백업링토스","백업고리놀이","야구","골프","빅컵","링고리협동게임","농구","풍선라켓","천바운싱","발판놀이","스쿠프"];
const BASE_QTY = 50;

// ── 주차별 색상 시스템 ─────────────────────────────────
// 첫 번째 강사(id1) 기준으로 교구가 바뀔 때마다 색상 순환
// → 같은 주차의 모든 강사 셀이 동일한 색상을 가짐
var PALETTE = [
  { bg: "#0D2340", border: "#3B82F6", text: "#93C5FD", label: "파랑" },
  { bg: "#0A2E1E", border: "#22C55E", text: "#86EFAC", label: "초록" },
  { bg: "#2D1500", border: "#F97316", text: "#FDC97E", label: "주황" },
  { bg: "#251040", border: "#A855F7", text: "#D8B4FE", label: "보라" },
  { bg: "#2D0F1A", border: "#EF4444", text: "#FCA5A5", label: "빨강" },
];

// 주차별 팔레트 인덱스 계산 (교구가 바뀔 때마다 색상 증가)
var WEEK_COLOR_INDEX = {};
(function() {
  // 초기에는 빈 상태로 시작 (DB 로드 후 동적으로 계산됨)
})();

// 동적 스케줄로 주차 색상 재계산 (관리자가 편집 시 호출)
function calcWeekColors(sched, instId) {
  var result = {};
  var ci = 0; var lastEq = null;
  for (var wi = 0; wi < WEEKS.length; wi++) {
    var w = WEEKS[wi];
    var eq = sched && sched[instId] ? sched[instId][w] : null;
    if (eq && eq !== "-" && eq !== lastEq) { ci++; lastEq = eq; }
    result[w] = eq && eq !== "-" ? (ci - 1) % 5 : -1;
  }
  return result;
}

function getWeekPalette(week, weekColorMap) {
  var idx = weekColorMap ? weekColorMap[week] : WEEK_COLOR_INDEX[week];
  if (idx === undefined || idx < 0) return null;
  return PALETTE[idx];
}

// 하위 호환용 (모달 등에서 사용)
var EQ_COLOR_INDEX = {};
var _ci = 0;
for (var _wi = 0; _wi < WEEKS.length; _wi++) {
  // 초기에는 빈 상태로 시작 (DB 로드 후 동적으로 계산됨)
}
function getEqPalette(name) {
  if (!name || name === "-") return null;
  var idx = EQ_COLOR_INDEX[name];
  if (idx === undefined) return null;
  return PALETTE[idx];
}

var EQ_COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#84CC16","#F97316","#6366F1","#14B8A6","#F43F5E","#A855F7","#22C55E","#FB923C","#0EA5E9","#E879F9","#FB7185","#34D399","#60A5FA","#FBBF24","#A78BFA","#4ADE80","#F472B6"];
function eqColor(name) {
  var idx = EQUIPMENT_LIST.indexOf(name);
  return idx >= 0 ? EQ_COLORS[idx % EQ_COLORS.length] : "#475569";
}

function AdminView({ handoverLogs, dbInstructors, dbSchedule, dbEquipment, setHandoverLogs, setDbInstructors, onSaved }) {
  // -- 시트 목록 state ----------------------------------------------
  const initInstructors = dbInstructors && dbInstructors.length > 0 ? dbInstructors : INITIAL_INSTRUCTORS;
  const initSchedule    = dbSchedule && Object.keys(dbSchedule).length > 0 ? dbSchedule : INIT_SCHEDULE;
  const [sheets, setSheets] = useState([
    { id: "sheet1", title: "실버체육 로테이션 2026", instructors: initInstructors, schedule: initSchedule }
  ]);

  // DB 데이터가 로드되면 메인 시트 갱신
  useEffect(function() {
    console.log("AdminView useEffect - dbInstructors:", dbInstructors, "dbSchedule:", dbSchedule);
    if (dbInstructors && dbSchedule && Object.keys(dbSchedule).length > 0) {
      console.log("메인 시트 갱신 중...");
      setSheets(function(prev) {
        return prev.map(function(s) {
          return s.id === "sheet1"
            ? Object.assign({}, s, { instructors: dbInstructors, schedule: dbSchedule })
            : s;
        });
      });
    } else if (dbInstructors && dbInstructors.length > 0) {
      // instructors만 있어도 시트 갱신
      console.log("instructors만 있음, 시트 갱신 중...");
      setSheets(function(prev) {
        return prev.map(function(s) {
          if (s.id === "sheet1") {
            var newSchedule = {};
            dbInstructors.forEach(function(inst) {
              newSchedule[inst.id] = {};
              WEEKS.forEach(function(w) { newSchedule[inst.id][w] = "-"; });
            });
            return Object.assign({}, s, { instructors: dbInstructors, schedule: newSchedule });
          }
          return s;
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
    setSheets(function(prev) { return prev.concat([{ id: id, title: newSheetTitle.trim(), instructors: [], schedule: {} }]); });
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
  const popupRef = useRef(null);

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
              sheet_id: "main",
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
        await sbDelete("rotation_schedule?year=eq.2026&sheet_id=eq.main");
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

  // 주차별 색상 맵 (첫 번째 강사 기준으로 실시간 계산)
  var firstInstId = instructors[0] ? instructors[0].id : null;
  var weekColorMap = firstInstId ? calcWeekColors(schedule, firstInstId) : WEEK_COLOR_INDEX;

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
    if (!newName.trim()) return;
    
    // DB에 강사 저장
    (async function() {
      try {
        var res = await sbPost("instructors", {
          name: newName.trim(),
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
          
          // dbInstructors 업데이트
          setDbInstructors(function(prev) {
            return prev ? prev.concat([{
              id: savedInstId,
              name: savedInst.name,
              region: savedInst.region || "",
              note: savedInst.note || "",
              sort_order: savedInst.sort_order
            }]) : [savedInst];
          });
          
          // rotation_schedule에 교구 배정 저장
          if (dbEquipment) {
            var eqMap = {};
            dbEquipment.forEach(function(e) { eqMap[e.name] = e.id; });
            
            var scheduleUpserts = [];
            WEEKS.forEach(function(w) {
              var val = newRow[w];
              if (val !== "-") {
                scheduleUpserts.push({
                  sheet_id: "main",
                  instructor_id: savedInstId,
                  equipment_id: eqMap[val] || null,
                  year: 2026,
                  week: w
                });
              }
            });
            
            if (scheduleUpserts.length > 0) {
              await sbUpsert("rotation_schedule", scheduleUpserts);
            }
          }
          
          // 로컬 상태 업데이트 (DB ID 사용)
          setInstructors(function(prev) { 
            return prev.concat([{
              id: savedInstId,
              name: savedInst.name,
              note: savedInst.note || ""
            }]); 
          });
          setSchedule(function(prev) { 
            var next = Object.assign({}, prev); 
            next[savedInstId] = newRow; 
            return next; 
          });
          
          setNewName(""); 
          setNewNote("");
          showToast(savedInst.name + " 강사 추가 완료!");
        }
      } catch(e) {
        console.error("강사 DB 저장 실패:", e);
        showToast("강사 DB 저장 실패: " + e.message, "warn");
      }
    })();
  }

  function removeInstructor(id) {
    // rotation_schedule에서 해당 강사의 모든 배정 삭제
    (async function() {
      try {
        await sbDelete("rotation_schedule?instructor_id=eq." + id + "&year=eq.2026&sheet_id=eq.main");
      } catch(e) {
        console.error("rotation_schedule 삭제 실패:", e);
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
    // rotation_schedule에서 해당 강사들의 모든 배정 삭제
    (async function() {
      try {
        for (var id of ids) {
          await sbDelete("rotation_schedule?instructor_id=eq." + id + "&year=eq.2026&sheet_id=eq.main");
        }
      } catch(e) {
        console.error("rotation_schedule 삭제 실패:", e);
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
              sheet_id: "main",
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
            await sbDelete("rotation_schedule?instructor_id=eq." + c.instId + "&week=eq." + c.week + "&year=eq.2026&sheet_id=eq.main");
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
                  var pal = getWeekPalette(w, weekColorMap);
                  var hBg = pal ? pal.bg : "#161B27";
                  var hColor = pal ? pal.text : "#334155";
                  var hBorder = pal ? pal.border : "#334155";
                  return (
                    <th key={w} style={{ padding: "7px 5px", fontSize: "10px", textAlign: "center", whiteSpace: "nowrap", minWidth: "72px", fontWeight: "700", background: isCur ? "#1E2A4A" : hBg, color: isCur ? "#818CF8" : hColor, borderBottom: "2px solid " + (isCur ? "#6366F1" : hBorder), borderLeft: "1px solid " + hBorder + "40", outline: isCur ? "2px solid #6366F1" : "none", outlineOffset: "-2px" }}>
                      {WEEK_LABELS[w]}
                      {isCur && <div style={{ fontSize: "8px", marginTop: "2px", color: "#818CF8" }}>현재</div>}
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
                  <tr key={inst.id} style={{ borderBottom: "1px solid #161B27", outline: isAnchor ? "2px solid #6366F1" : isSelected ? "1px solid rgba(99,102,241,0.3)" : "none", outlineOffset: "-1px", height: "52px" }}>
                    {/* 이동 선택 체크박스 */}
                    <td style={{ padding: "0 6px 0 10px", position: "sticky", left: 0, zIndex: 1, background: rowBase, textAlign: "center", width: "28px" }}>
                      <button
                        onClick={function() { setSelectedFromIdx(selectedFromIdx === rowIdx ? null : rowIdx); }}
                        title={isAnchor ? "선택 해제" : inst.name + " 이하 선택"}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", color: isSelected ? "#818CF8" : "#334155", padding: "6px 2px", lineHeight: 1, display: "block" }}>
                        {isSelected ? "☑" : "☐"}
                      </button>
                    </td>
                    <td style={{ padding: "0 8px 0 6px", position: "sticky", left: "36px", zIndex: 1, background: rowBase, borderRight: "1px solid #1E293B" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: "600", color: isSelected ? "#A5B4FC" : "#CBD5E1", whiteSpace: "nowrap" }}>{inst.name}</div>
                          {inst.note ? <div style={{ fontSize: "9px", color: "#475569", marginTop: "2px" }}>{inst.note}</div> : null}
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
                      var pal = val !== "-" ? getWeekPalette(w, weekColorMap) : null;
                      var cellBg = pal ? pal.bg : rowBase;
                      var isPopupOpen = eqPopup && eqPopup.instId === inst.id && eqPopup.week === w;
                      // 수량 이력 조회
                      var log = val !== "-" ? handoverLogs.find(function(l) { return l.instId === inst.id && l.week === w; }) : null;
                      var qtyBadge = null;
                      if (log) {
                        var diff = BASE_QTY - log.qty;
                        if (diff > 3) {
                          qtyBadge = <div onClick={function(e) { e.stopPropagation(); var cellLogs = handoverLogs.filter(function(l) { return l.instId === inst.id && l.week === w; }); setEqPopup({ instId: inst.id, week: w, currentVal: val, logs: cellLogs, view: "history" }); setEqSearch(""); }} style={{ fontSize: "8px", fontWeight: "800", color: "#EF4444", background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "3px", padding: "2px 5px", marginTop: "3px", lineHeight: "14px", whiteSpace: "nowrap", cursor: "pointer", display: "inline-block" }}>⚠ {log.qty}개</div>;
                        } else if (diff > 0) {
                          qtyBadge = <div onClick={function(e) { e.stopPropagation(); var cellLogs = handoverLogs.filter(function(l) { return l.instId === inst.id && l.week === w; }); setEqPopup({ instId: inst.id, week: w, currentVal: val, logs: cellLogs, view: "history" }); setEqSearch(""); }} style={{ fontSize: "8px", fontWeight: "600", color: "#94A3B8", background: "rgba(148,163,184,0.15)", border: "1px solid rgba(148,163,184,0.3)", borderRadius: "3px", padding: "2px 5px", marginTop: "3px", lineHeight: "14px", whiteSpace: "nowrap", cursor: "pointer", display: "inline-block" }}>{log.qty}개</div>;
                        }
                      }
                      return (
                        <td key={w} style={{ padding: "0", textAlign: "center", background: isPopupOpen ? "#1E2A4A" : cellBg, borderLeft: "1px solid " + (pal ? pal.border + "30" : "#1E293B"), outline: isPopupOpen ? "2px solid #6366F1" : isCur ? "2px solid rgba(99,102,241,0.4)" : "none", outlineOffset: "-2px", position: "relative", cursor: "pointer", minWidth: "72px" }}
                          onClick={function(e) {
                            var rect = e.currentTarget.getBoundingClientRect();
                            var cellLogs = handoverLogs.filter(function(l) { return l.instId === inst.id && l.week === w; });
                            setEqPopup({ instId: inst.id, week: w, currentVal: val, x: rect.left, y: rect.bottom, logs: cellLogs, view: "select" });
                            setEqSearch("");
                          }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "52px", padding: "0 4px" }}>
                            <div style={{ fontSize: "10px", fontWeight: val !== "-" ? "700" : "400", color: pal ? pal.text : "#2D3748", whiteSpace: "nowrap" }}>{val}</div>
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

        {/* 강사 추가 — 직접 입력 방식 */}
        <div style={{ marginTop: "10px", background: "#161B27", border: "1px solid #1E293B", borderRadius: "9px", padding: "12px 14px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "10px" }}>+ 강사 추가</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <input value={newName} onChange={function(e) { setNewName(e.target.value); }} placeholder="강사명 (예: 서울 - 홍길동)" onKeyDown={function(e) { if (e.key === "Enter") addInstructor(); }} style={{ flex: 1, minWidth: "130px", padding: "7px 10px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none" }} />
            <input value={newNote} onChange={function(e) { setNewNote(e.target.value); }} placeholder="비고 (선택)" onKeyDown={function(e) { if (e.key === "Enter") addInstructor(); }} style={{ flex: 1, minWidth: "100px", padding: "7px 10px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", fontSize: "11px", color: "#E2E8F0", outline: "none" }} />
            <button onClick={addInstructor} style={{ padding: "7px 14px", background: "#6366F1", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>추가</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#0F1117", border: "1px solid #334155", borderRadius: "6px", padding: "6px 10px" }}>
            <span style={{ fontSize: "10px", color: "#64748B" }}>교구 간격</span>
            <button onClick={function() { setNewShiftAmount(function(v) { return Math.max(0, v-1); }); }} style={{ width: "18px", height: "18px", background: "#1E293B", border: "none", borderRadius: "3px", color: "#94A3B8", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#F1F5F9", minWidth: "24px", textAlign: "center" }}>{newShiftAmount}주</span>
            <button onClick={function() { setNewShiftAmount(function(v) { return Math.min(8, v+1); }); }} style={{ width: "18px", height: "18px", background: "#1E293B", border: "none", borderRadius: "3px", color: "#94A3B8", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          </div>
        </div>

        {/* 색상 범례 */}
        <div style={{ marginTop: "8px", marginBottom: "18px", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
          <span style={{ fontSize: "9px", color: "#475569", marginRight: "4px" }}>색상 기준 (경기-김정희 순서):</span>
          {[["보치아","파랑"],["종이컵챌린지","초록"],["요요볼","주황"],["스틱검도","보라"],["성게볼놀이","빨강"]].map(function(item, i) {
            var pal = PALETTE[i];
            return (
              <div key={item[0]} style={{ display: "flex", alignItems: "center", gap: "4px", background: pal.bg, border: "1px solid " + pal.border + "60", borderRadius: "5px", padding: "3px 8px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: pal.border }} />
                <span style={{ fontSize: "10px", color: pal.text, fontWeight: "600" }}>{item[0]}</span>
              </div>
            );
          })}
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
        var pal = getEqPalette(panelEq);

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
                        var p = getEqPalette(eq);
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

function InstructorView({ authUser, handoverLogs, setHandoverLogs, dbInstructors, currentInstructorId, currentInstructorName, dbSchedule }) {
  const [activeTab, setActiveTab] = useState("schedule");
  const [scheduleMonth, setScheduleMonth] = useState(parseInt(CURRENT_WEEK.split("-")[0], 10));
  const [historyMonth, setHistoryMonth] = useState(parseInt(CURRENT_WEEK.split("-")[0], 10));
  const [myId, setMyId] = useState(null);  // ← myId를 state로 변경
  const [handoverWeekOffset, setHandoverWeekOffset] = useState(0);  // 0=현재주, 1=다음주, 2=그다음주 등

  // 분실/회수 관련 state - DB에서 로드됨
  const [lostItems, setLostItems] = useState([]);
  const [recoveries, setRecoveries] = useState([]);
  const [showAddLost, setShowAddLost] = useState(false);
  const [showAddRecovery, setShowAddRecovery] = useState(false);
  const [handoverReceivedQty, setHandoverReceivedQty] = useState("");
  const [handoverSendQty, setHandoverSendQty] = useState("");
  const [handoverAllowExtra, setHandoverAllowExtra] = useState(false); // 50개 초과 허용 토글
  const [handoverExtraNote, setHandoverExtraNote] = useState(""); // 초과 수량 사유
  const [handoverDiffType, setHandoverDiffType] = useState(null);
  const [handoverDiffQty, setHandoverDiffQty] = useState("");
  const [handoverDiffNote, setHandoverDiffNote] = useState("");
  const [handoverDiffPhotos, setHandoverDiffPhotos] = useState([]);
  const [handoverMethod, setHandoverMethod] = useState("delivery");
  const [handoverDate, setHandoverDate] = useState("2026-03-14");
  const [handoverSendDiffType, setHandoverSendDiffType] = useState(null);
  const [handoverSendPhotos, setHandoverSendPhotos] = useState([]);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [lostForm, setLostForm] = useState({ eq: "스쿠프", qty: "1", date: "2026-03-08", note: "" });
  const [recoveryForm, setRecoveryForm] = useState({ eq: "스쿠프", qty: "1", date: "2026-03-08", note: "" });
  const [handoverTarget, setHandoverTarget] = useState("manager1");
  const [selectedRecoveries, setSelectedRecoveries] = useState({});
  const [handoverDoneMsg, setHandoverDoneMsg] = useState("");
  const [handoverCompleted, setHandoverCompleted] = useState(false); // 인계 완료 후 다음 수령 화면
  const [recoveryModal, setRecoveryModal] = useState(null);
  const [recoveryModalQty, setRecoveryModalQty] = useState("");
  const [recoveryModalMethod, setRecoveryModalMethod] = useState("");
  const [recoveryModalDate, setRecoveryModalDate] = useState("2026-03-14");
  const [recoveryModalTransfer, setRecoveryModalTransfer] = useState("delivery"); // delivery | direct
  const [damagedModal, setDamagedModal] = useState(null);
  const [damagedModalAction, setDamagedModalAction] = useState("");
  const [myHandoverLogs, setMyHandoverLogs] = useState([]);  // ← 로컬 필터링된 데이터

  // myId 결정 (로그인한 강사 ID 우선, UUID 형식 검증 + 재조회)
  useEffect(function() {
    if (!dbSchedule) return;
    
    var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var actualId = currentInstructorId;
    
    console.log("🔐 로그인한 강사 ID:", actualId);
    
    // UUID 형식이면 바로 사용
    if (actualId && uuidRegex.test(actualId)) {
      console.log("✅ 사용할 강사 ID:", actualId);
      setMyId(actualId);
      return;
    }
    
    // UUID 형식이 아니면 → authUser.userId로 instructors 테이블 재조회
    var userId = authUser && authUser.userId;
    if (userId) {
      console.warn("⚠️  instructorId 없음, userId로 재조회:", userId);
      (async function() {
        try {
          // 1차: user_id로 조회
          var res = await sbGet("instructors?user_id=eq." + userId + "&select=id,name,region");
          if (res && res[0]) {
            console.log("✅ 재조회 성공 (user_id):", res[0].id);
            setMyId(res[0].id);
            return;
          }
          // 2차: email로 조회
          var email = authUser.email || "";
          if (email) {
            var res2 = await sbGet("instructors?email=eq." + encodeURIComponent(email) + "&select=id,name,region");
            if (res2 && res2[0]) {
              console.log("✅ 재조회 성공 (email):", res2[0].id);
              setMyId(res2[0].id);
              return;
            }
          }
          // 폴백: dbSchedule 마지막 키 (테스트용)
          var keys = Object.keys(dbSchedule);
          var fallbackId = keys[keys.length - 1] || keys[0] || null;
          console.warn("⚠️  재조회 실패, 폴백 사용:", fallbackId);
          setMyId(fallbackId);
        } catch(e) {
          console.error("강사 재조회 오류:", e);
          var keys2 = Object.keys(dbSchedule);
          setMyId(keys2[0] || null);
        }
      })();
    } else {
      // userId도 없으면 첫 번째 강사 폴백
      var keys = Object.keys(dbSchedule);
      console.warn("⚠️  userId 없음, 첫 번째 강사 사용:", keys[0]);
      setMyId(keys[0] || null);
    }
  }, [dbSchedule, currentInstructorId, authUser]);

  // myId가 결정된 후 필요한 변수들 계산
  var instList = (dbInstructors && dbInstructors.length > 0) ? dbInstructors : INITIAL_INSTRUCTORS;
  var me = instList.find(function(i) { return i.id === myId; });
  var myDisplayName = currentInstructorName || (me ? me.name : "강사");
  var myIdx = instList.findIndex(function(i) { return i.id === myId; });
  var prevInst = myIdx > 0 ? instList[myIdx - 1] : null;
  var nextInst = myIdx < instList.length - 1 ? instList[myIdx + 1] : null;
  // 마지막 강사는 본사로 인계
  var isLastInst = myIdx === instList.length - 1 && instList.length > 0;
  var nextInstName = isLastInst ? "본사" : (nextInst ? nextInst.name : "-");
  
  // DB 스케줄만 사용 (DB에 있는 데이터만 표시)
  var myData = (dbSchedule && myId && dbSchedule[myId]) ? dbSchedule[myId] : {};
  
  var currentWkIdx = WEEKS.indexOf(CURRENT_WEEK);

  var mySchedule = WEEKS.map(function(w, idx) {
    var eq = (myData && myData[w]) || "-";
    var isCurrent = w === CURRENT_WEEK;
    var isPast = idx < currentWkIdx;
    // 과거 주차이거나 현재 주차에서 handover_logs에 기록이 있으면 handoverDone
    var hasHandoverLog = myHandoverLogs.some(function(log) { return log.week === w && log.eq === eq; });
    var handoverDone = isPast || (isCurrent && hasHandoverLog);
    return { week: w, label: WEEK_LABELS[w], eq: eq, from: eq !== "-" && prevInst ? prevInst.name : "-", to: eq !== "-" ? nextInstName : "-", qty: eq !== "-" ? 50 : null, isCurrent: isCurrent, isPast: isPast, handoverDone: handoverDone };
  });

  var currentRow = mySchedule.find(function(r) { return r.isCurrent; });
  var nextHandoverRow = mySchedule.find(function(r) { return !r.isPast && !r.isCurrent && r.eq !== "-"; });

  // 인계 탭에서 다음 주로 이동할 때 사용할 행 계산
  var handoverDisplayRow = currentRow;  // 기본값: 현재 주차
  var handoverNextRow = nextHandoverRow;  // 기본값: 다음 인계 주차
  
  if (handoverWeekOffset > 0) {
    // 다음 주로 이동한 경우
    var currentWkIdx = WEEKS.indexOf(CURRENT_WEEK);
    var targetWeekIdx = currentWkIdx + handoverWeekOffset;
    if (targetWeekIdx < WEEKS.length) {
      var targetWeek = WEEKS[targetWeekIdx];
      handoverDisplayRow = mySchedule.find(function(r) { return r.week === targetWeek; });
      // 그 다음 인계 주차 찾기
      handoverNextRow = mySchedule.find(function(r) { 
        var rIdx = WEEKS.indexOf(r.week);
        return rIdx > targetWeekIdx && r.eq !== "-"; 
      });
    }
  }

  // 인계 탭 진입 시 현재 주차의 인계 기록 확인
  useEffect(function() {
    if (activeTab === "handover" && handoverDisplayRow && handoverDisplayRow.eq !== "-" && myId) {
      // 현재 표시 주차에 이미 인계 기록이 있는지 확인
      var hasCurrentWeekLog = myHandoverLogs.some(function(log) {
        return log.week === handoverDisplayRow.week && log.eq === handoverDisplayRow.eq;
      });
      
      if (hasCurrentWeekLog) {
        console.log("✅ 인계 기록 있음:", handoverDisplayRow.week, handoverDisplayRow.eq);
        setHandoverCompleted(true);
      } else {
        console.log("📝 인계 기록 없음:", handoverDisplayRow.week, handoverDisplayRow.eq);
        setHandoverCompleted(false);
      }
    }
  }, [activeTab, handoverDisplayRow, myHandoverLogs, myId]);
  useEffect(function() {
    if (!dbSchedule) return;
    
    var retryCount = 0;
    const maxRetries = 3;
    
    async function loadHandoverHistory() {
      try {
        // 로그인한 강사 ID 사용
        var actualInstructorId = myId;
        
        console.log("📥 인계 이력 로드: 강사 ID:", actualInstructorId);
        
        if (!actualInstructorId) return;
        
        // 현재 강사의 인계 기록 조회
        var logs = await sbGet("handover_logs?instructor_id=eq." + actualInstructorId + "&year=eq.2026&order=week.asc&limit=5000&select=id,instructor_id,equipment_id,week,sent_qty,received_qty,transfer_method,diff_type,diff_qty,diff_note,equipment(name)");
        console.log("📥 인계 이력 조회 결과:", logs.length, "건");
        
        // 데이터가 없으면 재시도 (최대 3회)
        if (logs.length === 0 && retryCount < maxRetries) {
          retryCount++;
          console.log("⏳ handover_logs가 비어있음. 재시도 " + retryCount + "/" + maxRetries + " (1초 후)");
          setTimeout(function() {
            loadHandoverHistory();
          }, 1000);
          return;
        }
        
        if (logs.length === 0 && retryCount >= maxRetries) {
          console.log("⚠️  handover_logs 재시도 횟수 초과. 빈 상태로 표시합니다.");
        }
        
        if (Array.isArray(logs)) {
          console.log("📝 로드된 handover_logs 샘플 (처음 3개):");
          logs.slice(0, 3).forEach(function(log, idx) {
            console.log("  [" + idx + "]", "week:", log.week, "eq:", log.equipment && log.equipment.name);
          });
          
          setMyHandoverLogs(logs.map(function(log) {
            return {
              id: log.id,
              instId: log.instructor_id,
              week: log.week,
              qty: log.sent_qty,
              note: log.diff_note || "",
              receivedQty: log.received_qty,
              transferMethod: log.transfer_method,
              diffType: log.diff_type,
              diffQty: log.diff_qty,
              eq: log.equipment && log.equipment.name ? log.equipment.name : "-"
            };
          }));
        }
      } catch(e) {
        console.warn("인계 이력 로드 실패:", e);
      }
    }
    
    loadHandoverHistory();
  }, [dbSchedule, myId]);

  // DB에서 분실/훼손 기록 로드
  useEffect(function() {
    if (!dbSchedule) return;
    
    async function loadLostItems() {
      try {
        // 로그인한 강사 ID 사용
        var actualInstructorId = myId;
        
        if (!actualInstructorId) return;
        
        var items = await sbGet("lost_items?instructor_id=eq." + actualInstructorId + "&order=report_date.desc&select=id,instructor_id,equipment_id,qty,type,status,note,report_date,equipment(name)");
        if (items && items.length > 0) console.log("lost_items 샘플:", items[0]);
        if (Array.isArray(items)) {
          setLostItems(items.map(function(item) {
            return {
              id: item.id,
              eq: item.equipment && item.equipment.name ? item.equipment.name : "알 수 없음",
              qty: item.qty,
              reportDate: item.report_date,
              note: item.note || "",
              type: item.type,
              status: item.status,
              closed: item.status === "closed"
            };
          }));
        }
      } catch(e) {
        console.warn("분실/훼손 기록 로드 실패:", e);
      }
    }
    
    loadLostItems();
  }, [dbSchedule, myId]);

  var handoverTargets = [
    { value: "manager1", label: "경기 - 김정희 강사 (1번)", sub: "로테이션 1번 강사" },
    { value: "office", label: "사무실 직접 인계", sub: "본사/지역 사무실" },
    { value: "admin", label: "관리자 지정 강사", sub: "관리자가 지정한 담당자" },
  ];

  function addLost() {
    if (!lostForm.eq || !lostForm.qty || !lostForm.date) return;
    var newItem = { id: Date.now(), eq: lostForm.eq, qty: parseInt(lostForm.qty), reportDate: lostForm.date, note: lostForm.note, status: "보관중" };
    setLostItems(function(prev) { return [newItem].concat(prev); });
    setLostForm({ eq: "스쿠프", qty: "1", date: "2026-03-08", note: "" });
    setShowAddLost(false);
  }

  function addRecovery() {
    if (!recoveryForm.eq || !recoveryForm.qty || !recoveryForm.date) return;
    var newItem = { id: Date.now(), lostId: null, eq: recoveryForm.eq, qty: parseInt(recoveryForm.qty), recoveryDate: recoveryForm.date, note: recoveryForm.note, handedOver: false };
    setRecoveries(function(prev) { return [newItem].concat(prev); });
    setRecoveryForm({ eq: "스쿠프", qty: "1", date: "2026-03-08", note: "" });
    setShowAddRecovery(false);
  }

  function doHandover() {
    var ids = Object.keys(selectedRecoveries).filter(function(k) { return selectedRecoveries[k]; });
    if (ids.length === 0) return;
    setRecoveries(function(prev) {
      return prev.map(function(r) {
        return ids.indexOf(String(r.id)) >= 0 ? Object.assign({}, r, { handedOver: true }) : r;
      });
    });
    var target = handoverTargets.find(function(t) { return t.value === handoverTarget; });
    setHandoverDoneMsg((target ? target.label : "") + "에게 " + ids.length + "건 인계 완료!");
    setSelectedRecoveries({});
    setShowHandoverModal(false);
    setTimeout(function() { setHandoverDoneMsg(""); }, 3000);
  }

  var TABS = [
    { key: "schedule", label: "교구 일정" },
    { key: "history",  label: "이동 이력" },
    { key: "handover", label: "인계 등록" },
    { key: "lost",     label: "회수 기록" },
  ];

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
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", marginBottom: "3px" }}>MY PAGE | 실버체육</div>
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
                // 주차 → 날짜: 1주=7일, 2주=14일, 3주=21일, 4주=28일, 5주=말일
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

        {/* 탭 (4개) */}
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

        {/* 인계 완료 토스트 */}
        {handoverDoneMsg ? (
          <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: "8px", padding: "9px 13px", marginBottom: "10px", fontSize: "12px", fontWeight: "700", color: "#16A34A" }}>
            ✓ {handoverDoneMsg}
          </div>
        ) : null}

        {}
        {activeTab === "schedule" && (
          <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", overflow: "hidden" }}>
            {/* 헤더: 년도·월 + 좌우 네비게이션 */}
            <div style={{ padding: "11px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={function() { if (scheduleMonth > 1) setScheduleMonth(scheduleMonth - 1); }}
                  disabled={scheduleMonth <= 1}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: scheduleMonth <= 1 ? "#F8FAFC" : "#F1F5F9", color: scheduleMonth <= 1 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: scheduleMonth <= 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>
                  ‹
                </button>
                <span style={{ fontSize: "13px", fontWeight: "800", color: "#0F172A", minWidth: "80px", textAlign: "center" }}>
                  2026년 {scheduleMonth}월
                </span>
                <button
                  onClick={function() { if (scheduleMonth < 12) setScheduleMonth(scheduleMonth + 1); }}
                  disabled={scheduleMonth >= 12}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: scheduleMonth >= 12 ? "#F8FAFC" : "#F1F5F9", color: scheduleMonth >= 12 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: scheduleMonth >= 12 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>
                  ›
                </button>
                {scheduleMonth !== parseInt(CURRENT_WEEK.split("-")[0], 10) && (
                  <button
                    onClick={function() { setScheduleMonth(parseInt(CURRENT_WEEK.split("-")[0], 10)); }}
                    style={{ fontSize: "9px", fontWeight: "700", color: "#6366F1", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: "5px", padding: "2px 7px", cursor: "pointer" }}>
                    이번 달
                  </button>
                )}
              </div>
              <span style={{ fontSize: "9px", color: "#94A3B8", background: "#F8FAFC", padding: "2px 7px", borderRadius: "4px" }}>읽기 전용</span>
            </div>
            {/* 월별 필터된 테이블 */}
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
                  {mySchedule.filter(function(row) {
                    return parseInt(row.week.split("-")[0], 10) === scheduleMonth && row.eq !== "-";
                  }).length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: "12px" }}>
                        이번 달 배정된 교구가 없습니다
                      </td>
                    </tr>
                  ) : (
                    mySchedule.filter(function(row) {
                      return parseInt(row.week.split("-")[0], 10) === scheduleMonth && row.eq !== "-";
                    }).map(function(row, i) {
                    var col = row.eq !== "-" ? eqColor(row.eq) : "#94A3B8";
                    var sLabel = "일정 확정", sColor = "#8B5CF6", sBg = "#F5F3FF";
                    if (row.handoverDone) { sLabel = "인계 완료"; sColor = "#22C55E"; sBg = "#F0FDF4"; }
                    else if (row.isCurrent) { sLabel = "진행 중"; sColor = "#3B82F6"; sBg = "#EFF6FF"; }
                    
                    // 실제 인계된 수량 조회
                    var actualLog = myHandoverLogs.find(function(log) { return log.week === row.week && log.eq === row.eq; });
                    var displayQty = actualLog && actualLog.receivedQty ? actualLog.receivedQty : row.qty;
                    
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #F8FAFC", background: row.isCurrent ? "#F5F3FF" : "transparent" }}>
                        <td style={{ padding: "8px 9px", fontSize: "11px", fontWeight: row.isCurrent ? "800" : "700", color: row.isCurrent ? "#6366F1" : "#374151", whiteSpace: "nowrap" }}>
                          {row.label}
                          {row.isCurrent && <span style={{ marginLeft: "4px", fontSize: "8px", background: "#6366F1", color: "#fff", borderRadius: "4px", padding: "1px 4px", verticalAlign: "middle" }}>현재</span>}
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
          </div>
        )}

        {}
        {activeTab === "history" && (
          <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", overflow: "hidden" }}>
            {/* 헤더: 년도·월 + 좌우 네비게이션 */}
            <div style={{ padding: "11px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={function() { if (historyMonth > 1) setHistoryMonth(historyMonth - 1); }}
                  disabled={historyMonth <= 1}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: historyMonth <= 1 ? "#F8FAFC" : "#F1F5F9", color: historyMonth <= 1 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: historyMonth <= 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>
                  ‹
                </button>
                <span style={{ fontSize: "13px", fontWeight: "800", color: "#0F172A", minWidth: "80px", textAlign: "center" }}>
                  2026년 {historyMonth}월
                </span>
                <button
                  onClick={function() { if (historyMonth < 12) setHistoryMonth(historyMonth + 1); }}
                  disabled={historyMonth >= 12}
                  style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E2E8F0", background: historyMonth >= 12 ? "#F8FAFC" : "#F1F5F9", color: historyMonth >= 12 ? "#CBD5E1" : "#374151", fontSize: "13px", cursor: historyMonth >= 12 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: "700" }}>
                  ›
                </button>
                {historyMonth !== parseInt(CURRENT_WEEK.split("-")[0], 10) && (
                  <button
                    onClick={function() { setHistoryMonth(parseInt(CURRENT_WEEK.split("-")[0], 10)); }}
                    style={{ fontSize: "9px", fontWeight: "700", color: "#6366F1", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: "5px", padding: "2px 7px", cursor: "pointer" }}>
                    이번 달
                  </button>
                )}
              </div>
            </div>
            {/* 월별 필터된 이력 목록 */}
            {(function() {
              var currentWkIdx = WEEKS.indexOf(CURRENT_WEEK);
              
              // mySchedule 기준으로 주차별 배정 교구 맵 생성
              var scheduleEqMap = {};
              mySchedule.forEach(function(row) {
                if (row.eq !== "-") scheduleEqMap[row.week] = row.eq;
              });
              console.log("📅 scheduleEqMap (3월):", Object.fromEntries(Object.entries(scheduleEqMap).filter(function(e) { return e[0].startsWith("3-"); })));
              
              // myHandoverLogs에서 주차별 최신 1건만 추출 (중복 제거)
              var logByWeek = {};
              myHandoverLogs.forEach(function(item) {
                var scheduledEq = scheduleEqMap[item.week];
                if (scheduledEq && item.eq === scheduledEq) {
                  // 같은 주차에 여러 건이면 마지막 것 사용
                  logByWeek[item.week] = item;
                }
              });
              
              // 과거 주차 중 선택 월에 해당하는 것만, mySchedule 순서대로
              // 현재 주차도 포함 (handoverDone이 true인 경우)
              var filtered = mySchedule.filter(function(row) {
                var weekMonth = parseInt(row.week.split("-")[0], 10);
                var weekIdx = WEEKS.indexOf(row.week);
                // 과거 주차 또는 현재 주차에서 인계 완료된 것
                return (weekIdx < currentWkIdx || (weekIdx === currentWkIdx && row.handoverDone)) && weekMonth === historyMonth && row.eq !== "-";
              }).map(function(row) {
                // log가 있으면 log 데이터, 없으면 schedule 기반 기본값
                var log = logByWeek[row.week];
                return {
                  week: row.week,
                  eq: row.eq,
                  qty: log ? (log.receivedQty || log.qty || 50) : 50,
                  receivedQty: log ? log.receivedQty : null,
                  transferMethod: log ? log.transferMethod : "delivery",
                  note: log ? log.note : "",
                  hasLog: !!log,
                  diffType: log ? log.diffType : null,
                  diffQty: log ? log.diffQty : null
                };
              });
              
              if (filtered.length === 0) {
                return (
                  <div style={{ padding: "32px 13px", textAlign: "center" }}>
                    <div style={{ fontSize: "24px", marginBottom: "8px" }}>📭</div>
                    <div style={{ fontSize: "12px", color: "#94A3B8", fontWeight: "600" }}>이번 달 이동 이력이 없습니다.</div>
                  </div>
                );
              }
              return filtered.map(function(item, i) {
                var col = eqColor(item.eq || "-");
                var hasNote = item.note && item.note.length > 0;
                var hasDiff = item.diffType && item.diffQty;
                return (
                  <div key={i} style={{ display: "flex", gap: "9px", padding: "11px 13px", borderBottom: "1px solid #F8FAFC", alignItems: "flex-start" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0, fontSize: "14px", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      📤
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#0F172A" }}>
                          인계: {item.qty}개
                        </span>
                        <span style={{ background: col + "18", color: col, border: "1px solid " + col + "35", padding: "1px 5px", borderRadius: "6px", fontSize: "10px", fontWeight: "700" }}>{item.eq || "-"}</span>
                        {item.transferMethod && <span style={{ fontSize: "9px", color: "#64748B" }}>{item.transferMethod === "delivery" ? "택배" : "직접전달"}</span>}
                        {!item.hasLog && <span style={{ background: "#F1F5F9", color: "#94A3B8", padding: "1px 5px", borderRadius: "5px", fontSize: "9px", fontWeight: "600" }}>자동완료</span>}
                        {hasDiff && <span style={{ background: item.diffType === "lost" ? "#FEF2F2" : "#FFF7ED", color: item.diffType === "lost" ? "#EF4444" : "#F97316", padding: "1px 5px", borderRadius: "5px", fontSize: "9px", fontWeight: "700" }}>
                          {item.diffType === "lost" ? "분실" : "훼손"}: {item.diffQty}개
                        </span>}
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

        {}
        {activeTab === "handover" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {!handoverDisplayRow || handoverDisplayRow.eq === "-" ? (
              <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", padding: "32px 13px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>📭</div>
                <div style={{ fontSize: "12px", color: "#94A3B8", fontWeight: "600" }}>이번 주 배정된 교구가 없습니다.</div>
                <div style={{ fontSize: "10px", color: "#CBD5E1", marginTop: "4px" }}>관리자가 교구를 배정하면 인계 등록을 할 수 있습니다.</div>
              </div>
            ) : handoverCompleted ? (
              /* 인계 완료 후 - 다음 수령 정보 */
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* 완료 배너 */}
                <div style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: "11px", padding: "18px 16px", color: "#fff", textAlign: "center" }}>
                  <div style={{ fontSize: "28px", marginBottom: "6px" }}>✅</div>
                  <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "3px" }}>인계 등록 완료!</div>
                  <div style={{ fontSize: "11px", opacity: 0.85 }}>{WEEK_LABELS[handoverDisplayRow.week]} · {handoverDisplayRow.eq} · {handoverDisplayRow.to}에게 인계</div>
                </div>

                {/* 다음 수령 정보 */}
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
                  <button onClick={function() { 
                    setHandoverWeekOffset(0);
                    setHandoverCompleted(false);
                    
                    // DB에서 기존 기록 삭제 + 로컬 상태 업데이트
                    (async function() {
                      try {
                        var instId = myId;
                        var eqName = handoverDisplayRow.eq;
                        var eqRes = await sbGet("equipment?select=id&name=eq." + encodeURIComponent(eqName));
                        var eqId = eqRes && eqRes[0] ? eqRes[0].id : null;
                        
                        if (instId && eqId) {
                          // 1. 해당 주차의 lost_items 조회
                          var lostItemsRes = await sbGet("lost_items?instructor_id=eq." + instId + "&equipment_id=eq." + eqId + "&report_date=gte." + handoverDisplayRow.week.split("-")[0] + "-01&report_date=lt." + (parseInt(handoverDisplayRow.week.split("-")[0]) + 1) + "-01");
                          
                          // 2. lost_items에 연결된 recovery_logs 삭제
                          if (lostItemsRes && lostItemsRes.length > 0) {
                            for (var i = 0; i < lostItemsRes.length; i++) {
                              await sbDelete("recovery_logs?lost_item_id=eq." + lostItemsRes[i].id);
                            }
                          }
                          
                          // 3. handover_logs 삭제
                          await sbDelete("handover_logs?instructor_id=eq." + instId + "&equipment_id=eq." + eqId + "&week=eq." + encodeURIComponent(handoverDisplayRow.week) + "&year=eq.2026");
                          
                          // 4. 로컬 상태에서도 해당 기록 제거
                          setMyHandoverLogs(function(prev) {
                            return prev.filter(function(log) {
                              return !(log.week === handoverDisplayRow.week && log.eq === eqName);
                            });
                          });
                          
                          // 5. 회수 기록도 로컬에서 제거
                          setLostItems(function(prev) {
                            return prev.filter(function(item) {
                              return !(item.week === handoverDisplayRow.week && item.eq === eqName);
                            });
                          });
                          
                          console.log("✅ 기존 인계 기록 및 회수 기록 삭제 완료");
                        }
                      } catch(e) {
                        console.warn("기존 기록 삭제 실패 (무시):", e);
                      }
                    })();
                    
                    // 폼 완전 초기화
                    setHandoverReceivedQty("");
                    setHandoverSendQty("");
                    setHandoverDiffType(null);
                    setHandoverDiffNote("");
                    setHandoverDiffPhotos([]);
                    setHandoverAllowExtra(false);
                    setHandoverExtraNote("");
                  }}
                    style={{ flex: 1, padding: "12px", background: "#F1F5F9", color: "#6366F1", border: "1.5px solid #C7D2FE", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                    이번 주 다시 등록
                  </button>
                  {handoverNextRow && (
                    <button onClick={function() { 
                      setHandoverWeekOffset(handoverWeekOffset + 1);
                      setHandoverCompleted(false);
                      setHandoverReceivedQty("");
                      setHandoverSendQty("");
                      setHandoverDiffType(null);
                      setHandoverDiffNote("");
                      setHandoverDiffPhotos([]);
                      setHandoverAllowExtra(false);
                      setHandoverExtraNote("");
                      console.log("📅 다음 주 인계 등록으로 이동:", handoverNextRow.week);
                    }}
                      style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                      다음 주 인계 등록 ({handoverNextRow.label})
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
            {/* 수령 정보 */}
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
                      // 초과 미허용 시 50으로 자동 제한
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
                  {handoverReceivedQty && parseInt(handoverReceivedQty) < 50 && (
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#EF4444", background: "#FEF2F2", padding: "4px 8px", borderRadius: "6px", whiteSpace: "nowrap" }}>-{50 - parseInt(handoverReceivedQty)}개</span>
                  )}
                  {handoverReceivedQty && parseInt(handoverReceivedQty) === 50 && (
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#16A34A", background: "#F0FDF4", padding: "4px 8px", borderRadius: "6px" }}>정상</span>
                  )}
                  {handoverReceivedQty && parseInt(handoverReceivedQty) > 50 && (
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#D97706", background: "#FFFBEB", padding: "4px 8px", borderRadius: "6px", whiteSpace: "nowrap" }}>+{parseInt(handoverReceivedQty) - 50}개 초과</span>
                  )}
                </div>

                {/* 50개 초과 시: 허용 여부 확인 박스 */}
                {handoverReceivedQty && parseInt(handoverReceivedQty) > 50 && (
                  <div style={{ marginTop: "10px", background: "#FFFBEB", border: "1.5px solid #FCD34D", borderRadius: "9px", padding: "12px 13px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: "#D97706", marginBottom: "6px" }}>⚠ 기준 수량(50개) 초과 입력</div>
                    <div style={{ fontSize: "10px", color: "#64748B", marginBottom: "10px" }}>수령 수량이 기준보다 많습니다. 특별한 사유가 있는 경우에만 허용하세요.</div>
                    <div style={{ display: "flex", gap: "6px", marginBottom: handoverAllowExtra ? "10px" : "0" }}>
                      <button onClick={function() { setHandoverAllowExtra(false); setHandoverExtraNote(""); setHandoverReceivedQty("50"); setHandoverDiffQty(""); setHandoverDiffType(null); }}
                        style={{ flex: 1, padding: "8px", borderRadius: "7px", border: "2px solid " + (!handoverAllowExtra ? "#D97706" : "#E2E8F0"), background: !handoverAllowExtra ? "#FEF3C7" : "#fff", color: !handoverAllowExtra ? "#D97706" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                        50개로 정정
                      </button>
                      <button onClick={function() { setHandoverAllowExtra(true); }}
                        style={{ flex: 1, padding: "8px", borderRadius: "7px", border: "2px solid " + (handoverAllowExtra ? "#D97706" : "#E2E8F0"), background: handoverAllowExtra ? "#FEF3C7" : "#fff", color: handoverAllowExtra ? "#D97706" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                        초과 수량 허용
                      </button>
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

            {/* 수량 차이 발생 시 분실/훼손 처리 */}
            {handoverReceivedQty && parseInt(handoverReceivedQty) < 50 && (
              <div style={{ background: "#fff", borderRadius: "11px", border: "2px solid #FCA5A5", padding: "14px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px" }}>⚠</span>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: "#EF4444" }}>수량 차이 발생</div>
                </div>
                <div style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "14px" }}>기준 50개 대비 {50 - parseInt(handoverReceivedQty)}개 부족합니다. 유형을 선택해주세요.</div>

                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  <button onClick={function() { setHandoverDiffType("lost"); }} style={{ flex: 1, padding: "12px 8px", borderRadius: "9px", border: "2px solid " + (handoverDiffType === "lost" ? "#EF4444" : "#E2E8F0"), background: handoverDiffType === "lost" ? "#FEF2F2" : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                    <div style={{ fontSize: "20px", marginBottom: "4px" }}>🔍</div>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: handoverDiffType === "lost" ? "#EF4444" : "#374151" }}>분실</div>
                    <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "2px" }}>교구 위치 불명</div>
                  </button>
                  <button onClick={function() { setHandoverDiffType("damaged"); }} style={{ flex: 1, padding: "12px 8px", borderRadius: "9px", border: "2px solid " + (handoverDiffType === "damaged" ? "#F97316" : "#E2E8F0"), background: handoverDiffType === "damaged" ? "#FFF7ED" : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                    <div style={{ fontSize: "20px", marginBottom: "4px" }}>🔧</div>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: handoverDiffType === "damaged" ? "#F97316" : "#374151" }}>훼손</div>
                    <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "2px" }}>파손/사용 불가</div>
                  </button>
                  <button onClick={function() { setHandoverDiffType("both"); }} style={{ flex: 1, padding: "12px 8px", borderRadius: "9px", border: "2px solid " + (handoverDiffType === "both" ? "#8B5CF6" : "#E2E8F0"), background: handoverDiffType === "both" ? "#F5F3FF" : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                    <div style={{ fontSize: "20px", marginBottom: "4px" }}>📋</div>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: handoverDiffType === "both" ? "#8B5CF6" : "#374151" }}>혼합</div>
                    <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "2px" }}>분실+훼손 모두</div>
                  </button>
                </div>

                {handoverDiffType && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {(handoverDiffType === "lost" || handoverDiffType === "both") && (
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "11px", fontWeight: "700", color: "#EF4444", display: "block", marginBottom: "5px" }}>분실 수량 <span style={{ color: "#EF4444" }}>*</span></label>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <input type="number" placeholder="0" defaultValue={handoverDiffType === "lost" ? handoverDiffQty : ""} style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #FCA5A5", fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box" }} />
                            <span style={{ fontSize: "11px", color: "#64748B" }}>개</span>
                          </div>
                        </div>
                      )}
                      {(handoverDiffType === "damaged" || handoverDiffType === "both") && (
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "11px", fontWeight: "700", color: "#F97316", display: "block", marginBottom: "5px" }}>훼손 수량 <span style={{ color: "#EF4444" }}>*</span></label>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <input type="number" placeholder="0" defaultValue={handoverDiffType === "damaged" ? handoverDiffQty : ""} style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #FED7AA", fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box" }} />
                            <span style={{ fontSize: "11px", color: "#64748B" }}>개</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>상세 내용</label>
                      <textarea value={handoverDiffNote} onChange={function(e) { setHandoverDiffNote(e.target.value); }} placeholder={handoverDiffType === "lost" ? "분실 경위, 발생 시점 등" : handoverDiffType === "damaged" ? "파손 상태, 훼손 원인 등" : "분실/훼손 상세 내용"} rows={2} style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", resize: "none", boxSizing: "border-box" }} />
                    </div>

                    {(handoverDiffType === "damaged" || handoverDiffType === "both") && (
                      <div>
                        <label style={{ fontSize: "9px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "3px" }}>증빙사진 <span style={{ color: "#EF4444" }}>*필수</span></label>
                        <div style={{ border: "2px dashed #FED7AA", borderRadius: "8px", padding: "14px", textAlign: "center", background: "#FFFBF5" }}>
                          {handoverDiffPhotos.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" }}>
                              {handoverDiffPhotos.map(function(p, i) {
                                return (
                                  <div key={i} style={{ position: "relative", width: "60px", height: "60px" }}>
                                    <img src={p.url} alt="증빙" style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "6px", border: "1px solid #FED7AA" }} />
                                    <button onClick={function() { setHandoverDiffPhotos(function(prev) { return prev.filter(function(_, j) { return j !== i; }); }); }}
                                      style={{ position: "absolute", top: "-5px", right: "-5px", width: "16px", height: "16px", borderRadius: "50%", background: "#EF4444", color: "#fff", border: "none", fontSize: "9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
                                  </div>
                                );
                              })}
                              <label style={{ width: "60px", height: "60px", border: "2px dashed #FED7AA", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "20px", color: "#F97316" }}>
                                +
                                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={function(e) {
                                  var files = Array.from(e.target.files);
                                  files.forEach(function(file) {
                                    var reader = new FileReader();
                                    reader.onload = function(ev) {
                                      setHandoverDiffPhotos(function(prev) { return prev.concat([{ url: ev.target.result, name: file.name }]); });
                                    };
                                    reader.readAsDataURL(file);
                                  });
                                }} />
                              </label>
                            </div>
                          ) : (
                            <label style={{ cursor: "pointer", display: "block" }}>
                              <div style={{ fontSize: "24px", marginBottom: "5px" }}>📷</div>
                              <div style={{ fontSize: "11px", fontWeight: "700", color: "#F97316", marginBottom: "2px" }}>사진 업로드</div>
                              <div style={{ fontSize: "9px", color: "#94A3B8" }}>훼손 상태를 촬영한 사진을 첨부하세요</div>
                              <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={function(e) {
                                var files = Array.from(e.target.files);
                                files.forEach(function(file) {
                                  var reader = new FileReader();
                                  reader.onload = function(ev) {
                                    setHandoverDiffPhotos(function(prev) { return prev.concat([{ url: ev.target.result, name: file.name }]); });
                                  };
                                  reader.readAsDataURL(file);
                                });
                              }} />
                            </label>
                          )}
                        </div>
                        {handoverDiffPhotos.length > 0 && (
                          <div style={{ fontSize: "9px", color: "#16A34A", marginTop: "4px" }}>사진 {handoverDiffPhotos.length}장 첨부됨</div>
                        )}
                      </div>
                    )}
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
                    <input type="number" min="0"
                      max={handoverReceivedQty ? handoverReceivedQty : "50"}
                      value={handoverSendQty}
                      onChange={function(e) {
                        var val = e.target.value;
                        if (val !== "" && parseInt(val) < 0) val = "0";
                        // 수령 수량보다 많이 전달할 수 없음
                        var maxQty = handoverReceivedQty ? parseInt(handoverReceivedQty) : 50;
                        if (val !== "" && parseInt(val) > maxQty) val = String(maxQty);
                        setHandoverSendQty(val);
                      }}
                      onKeyDown={function(e) { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                      placeholder={handoverReceivedQty ? "최대 " + handoverReceivedQty + "개" : "수령 수량 먼저 입력"}
                      style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid " + (handoverSendQty && handoverReceivedQty && parseInt(handoverSendQty) < parseInt(handoverReceivedQty) ? "#FCA5A5" : "#E2E8F0"), fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box" }} />
                    <span style={{ fontSize: "12px", color: "#64748B" }}>개</span>
                    {handoverSendQty && handoverReceivedQty && parseInt(handoverSendQty) === parseInt(handoverReceivedQty) && (
                      <span style={{ fontSize: "10px", fontWeight: "700", color: "#16A34A", background: "#F0FDF4", padding: "4px 7px", borderRadius: "5px", whiteSpace: "nowrap" }}>정상</span>
                    )}
                    {handoverSendQty && handoverReceivedQty && parseInt(handoverSendQty) < parseInt(handoverReceivedQty) && (
                      <span style={{ fontSize: "10px", fontWeight: "700", color: "#EF4444", background: "#FEF2F2", padding: "4px 7px", borderRadius: "5px", whiteSpace: "nowrap" }}>
                        -{parseInt(handoverReceivedQty) - parseInt(handoverSendQty)}개 부족
                      </span>
                    )}
                  </div>

                  {/* 전달수량 < 수령수량 오차 발생 시 분실/훼손 선택 */}
                  {handoverSendQty && handoverReceivedQty && parseInt(handoverSendQty) < parseInt(handoverReceivedQty) && (
                    <div style={{ marginTop: "10px", padding: "12px", background: "#FFF8F8", border: "1.5px solid #FCA5A5", borderRadius: "9px" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "#EF4444", marginBottom: "8px" }}>
                        ⚠ 수량 부족 {parseInt(handoverReceivedQty) - parseInt(handoverSendQty)}개 - 원인을 선택하세요
                      </div>
                      <div style={{ display: "flex", gap: "7px", marginBottom: handoverSendDiffType ? "10px" : "0" }}>
                        <button onClick={function() { setHandoverSendDiffType(handoverSendDiffType === "lost" ? null : "lost"); setHandoverSendPhotos([]); }}
                          style={{ flex: 1, padding: "9px 6px", borderRadius: "8px", border: "2px solid " + (handoverSendDiffType === "lost" ? "#EF4444" : "#E2E8F0"), background: handoverSendDiffType === "lost" ? "#FEF2F2" : "#fff", cursor: "pointer" }}>
                          <div style={{ fontSize: "16px", marginBottom: "3px" }}>🔍</div>
                          <div style={{ fontSize: "11px", fontWeight: "800", color: handoverSendDiffType === "lost" ? "#EF4444" : "#374151" }}>분실</div>
                          <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "1px" }}>위치 불명</div>
                        </button>
                        <button onClick={function() { setHandoverSendDiffType(handoverSendDiffType === "damaged" ? null : "damaged"); }}
                          style={{ flex: 1, padding: "9px 6px", borderRadius: "8px", border: "2px solid " + (handoverSendDiffType === "damaged" ? "#F97316" : "#E2E8F0"), background: handoverSendDiffType === "damaged" ? "#FFF7ED" : "#fff", cursor: "pointer" }}>
                          <div style={{ fontSize: "16px", marginBottom: "3px" }}>🔧</div>
                          <div style={{ fontSize: "11px", fontWeight: "800", color: handoverSendDiffType === "damaged" ? "#F97316" : "#374151" }}>훼손</div>
                          <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "1px" }}>파손/불가</div>
                        </button>
                      </div>

                      {/* 분실 선택 시 */}
                      {handoverSendDiffType === "lost" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                          <div>
                            <label style={{ fontSize: "11px", fontWeight: "700", color: "#EF4444", display: "block", marginBottom: "5px" }}>분실 수량 <span style={{ color: "#EF4444" }}>*</span></label>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input type="number" defaultValue={parseInt(handoverReceivedQty) - parseInt(handoverSendQty)} style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #FCA5A5", fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box", color: "#EF4444" }} />
                              <span style={{ fontSize: "11px", color: "#64748B" }}>개</span>
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>분실 경위</label>
                            <input placeholder="예: 수업 중 분실, 이동 중 분실" style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                          </div>
                        </div>
                      )}

                      {/* 훼손 선택 시 */}
                      {handoverSendDiffType === "damaged" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                          <div>
                            <label style={{ fontSize: "11px", fontWeight: "700", color: "#F97316", display: "block", marginBottom: "5px" }}>훼손 수량 <span style={{ color: "#EF4444" }}>*</span></label>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input type="number" defaultValue={parseInt(handoverReceivedQty) - parseInt(handoverSendQty)} style={{ flex: 1, padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #FED7AA", fontSize: "13px", fontWeight: "700", outline: "none", boxSizing: "border-box", color: "#F97316" }} />
                              <span style={{ fontSize: "11px", color: "#64748B" }}>개</span>
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>훼손 내용</label>
                            <input placeholder="예: 파손, 변형, 사용 불가" style={{ width: "100%", padding: "9px 10px", borderRadius: "7px", border: "1.5px solid #E2E8F0", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                          </div>
                          <div>
                            <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>증빙사진 <span style={{ color: "#EF4444" }}>* 필수</span></label>
                            <div style={{ border: "2px dashed " + (handoverSendPhotos.length > 0 ? "#86EFAC" : "#FED7AA"), borderRadius: "8px", padding: handoverSendPhotos.length > 0 ? "8px" : "14px", background: handoverSendPhotos.length > 0 ? "#F8FFF9" : "#FFFBF5", textAlign: "center" }}>
                              {handoverSendPhotos.length > 0 ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  {handoverSendPhotos.map(function(p, pi) {
                                    return (
                                      <div key={pi} style={{ position: "relative" }}>
                                        <img src={p.url} alt="증빙" style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "6px", border: "1px solid #E2E8F0" }} />
                                        <button onClick={function() { setHandoverSendPhotos(function(prev) { return prev.filter(function(_, j) { return j !== pi; }); }); }}
                                          style={{ position: "absolute", top: "-4px", right: "-4px", width: "16px", height: "16px", borderRadius: "50%", background: "#EF4444", color: "#fff", border: "none", fontSize: "9px", cursor: "pointer", lineHeight: "16px", padding: 0 }}>x</button>
                                      </div>
                                    );
                                  })}
                                  <label style={{ width: "56px", height: "56px", border: "2px dashed #CBD5E1", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "20px", color: "#94A3B8" }}>
                                    +<input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={function(e) { var files = Array.from(e.target.files); files.forEach(function(file) { var reader = new FileReader(); reader.onload = function(ev) { setHandoverSendPhotos(function(prev) { return prev.concat([{ url: ev.target.result, name: file.name }]); }); }; reader.readAsDataURL(file); }); }} />
                                  </label>
                                </div>
                              ) : (
                                <label style={{ cursor: "pointer", display: "block" }}>
                                  <div style={{ fontSize: "22px", marginBottom: "4px" }}>📷</div>
                                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#F97316" }}>사진 업로드</div>
                                  <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "2px" }}>훼손 상태 사진 첨부 (필수)</div>
                                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={function(e) { var files = Array.from(e.target.files); files.forEach(function(file) { var reader = new FileReader(); reader.onload = function(ev) { setHandoverSendPhotos(function(prev) { return prev.concat([{ url: ev.target.result, name: file.name }]); }); }; reader.readAsDataURL(file); }); }} />
                                </label>
                              )}
                            </div>
                            {handoverSendPhotos.length > 0 && (
                              <div style={{ fontSize: "9px", color: "#16A34A", marginTop: "3px" }}>✓ 사진 {handoverSendPhotos.length}장 첨부됨</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                      {INITIAL_INSTRUCTORS.map(function(inst) { return <option key={inst.id} value={inst.name}>{inst.name}</option>; })}
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

            <button onClick={function() {
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
              if (handoverDiffType && (handoverDiffType === "damaged" || handoverDiffType === "both") && handoverDiffPhotos.length === 0) {
                alert("훼손의 경우 증빙사진을 첨부해주세요.");
                return;
              }
              if (handoverReceivedQty && parseInt(handoverReceivedQty) < 50 && handoverDiffType) {
                var diff = 50 - parseInt(handoverReceivedQty);
                var tempId = Date.now();
                setLostItems(function(prev) {
                  return prev.concat([{
                    id: tempId,
                    eq: handoverDisplayRow ? handoverDisplayRow.eq : "-",
                    qty: diff,
                    reportDate: new Date().toISOString().split('T')[0],
                    note: handoverDiffNote || (handoverDiffType === "lost" ? "인계 시 분실" : handoverDiffType === "damaged" ? "인계 시 훼손" : "인계 시 분실/훼손"),
                    type: handoverDiffType,
                    photos: handoverDiffPhotos,
                    status: "open"
                  }]);
                });
                
                // DB에 분실/훼손 기록 저장
                (async function() {
                  try {
                    var instId = myId;  // myId 사용
                    if (instId) {
                      // 교구 ID 조회
                      var eqName = handoverDisplayRow ? handoverDisplayRow.eq : "-";
                      var eqRes = await sbGet("equipment?select=id&name=eq." + encodeURIComponent(eqName));
                      var eqId = eqRes && eqRes[0] ? eqRes[0].id : null;
                      
                      if (eqId) {
                        // 1. lost_items 저장
                        var result = await sbPost("lost_items", {
                          instructor_id: instId,
                          equipment_id: eqId,
                          qty: diff,
                          type: handoverDiffType,
                          status: "open",
                          note: handoverDiffNote || (handoverDiffType === "lost" ? "인계 시 분실" : handoverDiffType === "damaged" ? "인계 시 훼손" : "인계 시 분실/훼손"),
                          report_date: new Date().toISOString().split('T')[0]
                        });
                        console.log("분실/훼손 기록 저장 성공:", result);
                        
                        // DB에서 받은 실제 id로 lostItems 상태 업데이트
                        if (result && result[0] && result[0].id) {
                          var realId = result[0].id;
                          setLostItems(function(prev) {
                            return prev.map(function(item) {
                              return item.id === tempId ? Object.assign({}, item, { id: realId }) : item;
                            });
                          });
                        }
                        
                        // 2. handover_logs에도 received_qty 기록 (분실 수량 반영)
                        // 기존 레코드 있으면 삭제 후 INSERT
                        try {
                          await sbDelete("handover_logs?instructor_id=eq." + instId + "&equipment_id=eq." + eqId + "&week=eq." + encodeURIComponent(handoverDisplayRow.week) + "&year=eq.2026");
                        } catch(e) {
                          console.warn("기존 handover_logs 삭제 실패 (무시):", e);
                        }
                        
                        // 수령 수량을 handover_logs에 저장
                        var receivedQtyNum = handoverReceivedQty ? parseInt(handoverReceivedQty) : 50;
                        var hResult = await sbPost("handover_logs", {
                          instructor_id: instId,
                          equipment_id: eqId,
                          year: 2026,
                          week: handoverDisplayRow.week,
                          received_qty: receivedQtyNum,
                          sent_qty: receivedQtyNum,  // 분실 등록 시점에는 아직 전달 안 함
                          transfer_method: "delivery",
                          diff_type: handoverDiffType,
                          diff_qty: diff,
                          diff_note: handoverDiffNote || (handoverDiffType === "lost" ? "인계 시 분실" : handoverDiffType === "damaged" ? "인계 시 훼손" : "인계 시 분실/훼손")
                        });
                        console.log("분실/훼손 반영 handover_logs 저장 성공:", hResult);
                        
                        // 3. myHandoverLogs 상태 업데이트 (즉시 반영)
                        setMyHandoverLogs(function(prev) {
                          var exists = prev.find(function(l) { return l.week === handoverDisplayRow.week && l.eq === eqName; });
                          if (exists) {
                            return prev.map(function(l) {
                              return (l.week === handoverDisplayRow.week && l.eq === eqName)
                                ? Object.assign({}, l, { receivedQty: receivedQtyNum, diffType: handoverDiffType, diffQty: diff, note: handoverDiffNote })
                                : l;
                            });
                          } else {
                            return prev.concat([{
                              id: hResult[0].id,
                              instId: instId,
                              week: handoverDisplayRow.week,
                              qty: receivedQtyNum,
                              receivedQty: receivedQtyNum,
                              note: handoverDiffNote,
                              transferMethod: "delivery",
                              diffType: handoverDiffType,
                              diffQty: diff,
                              eq: eqName
                            }]);
                          }
                        });
                      } else {
                        console.warn("교구 ID를 찾을 수 없음:", eqName);
                      }
                    }
                  } catch(e) {
                    console.error("분실/훼손 기록 DB 저장 실패:", e);
                    alert("분실/훼손 기록 저장 실패: " + (e.message || e));
                  }
                })();
              }
              // 전달 수량을 handoverLogs에 기록 (관리자 뷰에 반영)
              var sendQtyNum = handoverSendQty ? parseInt(handoverSendQty) : BASE_QTY;
              var receivedQtyNum = handoverReceivedQty ? parseInt(handoverReceivedQty) : BASE_QTY;
              
              // 필수 입력값 검증
              if (!handoverReceivedQty || handoverReceivedQty === "") {
                alert("실제 수령 수량을 입력해주세요.");
                return;
              }
              
              if (!isNaN(sendQtyNum) && currentRow && currentRow.week) {
                var noteText = handoverSendQty && sendQtyNum < BASE_QTY ? (BASE_QTY - sendQtyNum) + "개 " + (handoverSendDiffType === "lost" ? "분실" : handoverSendDiffType === "damaged" ? "훼손" : "감소") : "";

                // Supabase handover_logs 저장
                (async function() {
                  try {
                    // myId 사용 (로그인한 강사 ID)
                    var instId = myId;

                    // 교구 ID 조회
                    var eqName = handoverDisplayRow.eq;
                    var eqRes = await sbGet("equipment?select=id&name=eq." + encodeURIComponent(eqName));
                    var eqId = eqRes && eqRes[0] ? eqRes[0].id : null;

                    if (instId && eqId) {
                      // UPSERT 사용 - 기존 레코드가 있으면 UPDATE, 없으면 INSERT
                      var result = await sbUpsert("handover_logs", {
                        instructor_id: instId,
                        equipment_id: eqId,
                        year: 2026,
                        week: handoverDisplayRow.week,
                        received_qty: receivedQtyNum,
                        sent_qty: sendQtyNum,
                        transfer_method: handoverMethod,
                        diff_type: handoverSendDiffType || null,
                        diff_qty: sendQtyNum < receivedQtyNum ? receivedQtyNum - sendQtyNum : null,
                        diff_note: noteText || null,
                        extra_note: handoverExtraNote || null
                      });
                      console.log("인계 기록 저장 성공:", result);
                      
                      // myHandoverLogs에도 추가 (이동이력 탭에 즉시 반영)
                      setMyHandoverLogs(function(prev) {
                        var exists = prev.find(function(l) { return l.week === handoverDisplayRow.week && l.eq === handoverDisplayRow.eq; });
                        if (exists) {
                          return prev.map(function(l) {
                            return (l.week === handoverDisplayRow.week && l.eq === handoverDisplayRow.eq)
                              ? Object.assign({}, l, { qty: sendQtyNum, receivedQty: receivedQtyNum, note: noteText })
                              : l;
                          });
                        } else {
                          return prev.concat([{
                            id: result[0].id,
                            instId: myId,
                            week: handoverDisplayRow.week,
                            qty: sendQtyNum,
                            receivedQty: receivedQtyNum,
                            note: noteText,
                            transferMethod: handoverMethod,
                            diffType: handoverSendDiffType,
                            diffQty: sendQtyNum < receivedQtyNum ? receivedQtyNum - sendQtyNum : null,
                            eq: handoverDisplayRow.eq
                          }]);
                        }
                      });
                    } else {
                      console.warn("강사 ID 또는 교구 ID 없음:", { instId, eqId });
                      alert("강사 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
                    }
                  } catch(e) {
                    console.error("인계 DB 저장 실패:", e);
                    alert("인계 기록 저장 실패: " + (e.message || e));
                  }
                })();

                setHandoverLogs(function(prev) {
                  var exists = prev.find(function(l) { return l.instId === myId && l.week === handoverDisplayRow.week; });
                  if (exists) {
                    return prev.map(function(l) {
                      return (l.instId === myId && l.week === handoverDisplayRow.week)
                        ? Object.assign({}, l, { qty: sendQtyNum, note: noteText })
                        : l;
                    });
                  } else {
                    return prev.concat([{ id: Date.now(), instId: myId, week: handoverDisplayRow.week, qty: sendQtyNum, note: noteText }]);
                  }
                });
              }
              setHandoverReceivedQty("");
              setHandoverSendQty("");
              setHandoverDiffType(null);
              setHandoverDiffNote("");
              setHandoverDiffPhotos([]);
              setHandoverAllowExtra(false);
              setHandoverExtraNote("");
              setHandoverCompleted(true);  // 완료 화면으로 전환
            }} style={{ padding: "13px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}>
              인계 등록 완료
            </button>
              </>
            )}
          </div>
        )}

        {}
        {activeTab === "lost" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

            {/* 섹션1: 회수 기록 */}
            <div style={{ background: "#fff", borderRadius: "11px", border: "1px solid #E2E8F0", overflow: "hidden" }}>
              <div style={{ padding: "11px 13px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#0F172A" }}>회수 기록</span>
                  <span style={{ fontSize: "9px", background: "#FEF2F2", color: "#EF4444", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>{lostItems.filter(function(i) { return i.type === "lost" && !i.closed; }).length}건 미종결</span>
                  <span style={{ fontSize: "9px", background: "#F1F5F9", color: "#64748B", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>{lostItems.filter(function(i) { return i.closed; }).length}건 종결</span>
                </div>
                <div style={{ fontSize: "9px", color: "#94A3B8" }}>인계 등록 탭에서 자동 기록</div>
              </div>

              {lostItems.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: "11px" }}>분실/훼손 기록이 없습니다</div>
              )}

              {lostItems.map(function(item) {
                var col = eqColor(item.eq);
                var isLost = item.type === "lost";
                var isDamaged = item.type === "damaged";
                var typeLabel = isLost ? "분실" : isDamaged ? "훼손" : "분실+훼손";
                var typeColor = isLost ? "#EF4444" : isDamaged ? "#F97316" : "#8B5CF6";
                var typeBg = isLost ? "#FEF2F2" : isDamaged ? "#FFF7ED" : "#F5F3FF";
                var typeIcon = item.closed ? "🔒" : (isLost ? "🔍" : isDamaged ? "🔧" : "📋");
                var recovered = recoveries.filter(function(r) { return r.lostId === item.id; });
                var recoveredQty = recovered.filter(function(r) { return r.method !== "fulllost"; }).reduce(function(s, r) { return s + r.qty; }, 0);
                var remaining = item.qty - recoveredQty;
                var isClosed = !!item.closed;
                return (
                  <div key={item.id} style={{ borderBottom: "1px solid #F1F5F9", opacity: isClosed ? 0.65 : 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "11px 13px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: isClosed ? "#F1F5F9" : typeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>{typeIcon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px", flexWrap: "wrap" }}>
                          <span style={{ background: col + "18", color: col, border: "1px solid " + col + "35", padding: "2px 7px", borderRadius: "7px", fontSize: "11px", fontWeight: "700" }}>{item.eq}</span>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: isClosed ? "#94A3B8" : typeColor }}>{item.qty}개 {typeLabel}</span>
                          {recoveredQty > 0 && (
                            <span style={{ fontSize: "9px", background: "#F0FDF4", color: "#16A34A", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>회수 {recoveredQty}개</span>
                          )}
                          {!isClosed && remaining > 0 && (
                            <span style={{ fontSize: "9px", background: "#FEF2F2", color: "#EF4444", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>미회수 {remaining}개</span>
                          )}
                          {!isClosed && remaining <= 0 && recoveredQty > 0 && (
                            <span style={{ fontSize: "9px", background: "#F0FDF4", color: "#16A34A", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>완전 회수</span>
                          )}
                          {isClosed && (
                            <span style={{ fontSize: "9px", background: "#F1F5F9", color: "#64748B", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>종결</span>
                          )}
                          {item.photos && item.photos.length > 0 && (
                            <span style={{ fontSize: "9px", background: "#EFF6FF", color: "#3B82F6", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>사진 {item.photos.length}장</span>
                          )}
                        </div>
                        <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: item.photos && item.photos.length > 0 ? "6px" : "0" }}>{item.reportDate} &nbsp;|&nbsp; {item.note}</div>
                        {isClosed && item.closeNote && (
                          <div style={{ fontSize: "9px", color: "#64748B", marginTop: "2px", fontStyle: "italic" }}>종결 사유: {item.closeNote}</div>
                        )}
                        {item.photos && item.photos.length > 0 && (
                          <div style={{ display: "flex", gap: "5px" }}>
                            {item.photos.map(function(p, pi) {
                              return <img key={pi} src={typeof p === "string" ? p : p.url} alt="증빙" style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "5px", border: "1px solid #E2E8F0" }} />;
                            })}
                          </div>
                        )}
                        {recovered.filter(function(r) { return r.method !== "fulllost"; }).length > 0 && (
                          <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                            {recovered.filter(function(r) { return r.method !== "fulllost"; }).map(function(r, ri) {
                              var methodLabel = r.method === "prev" ? "이전 강사" : r.method === "post" ? "본사 택배" : "사무실 반납";
                              var transferLabel = r.transferMethod === "direct" ? "직접전달" : "택배";
                              return (
                                <div key={ri} style={{ background: r.handedOver ? "#F0FDF4" : "#FFF7ED", borderRadius: "7px", padding: "6px 9px", border: "1px solid " + (r.handedOver ? "#86EFAC" : "#FED7AA") }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: r.handedOver ? "3px" : "0" }}>
                                    <span style={{ fontSize: "9px", color: r.handedOver ? "#16A34A" : "#F97316", fontWeight: "700" }}>회수 {r.qty}개</span>
                                    <span style={{ fontSize: "9px", color: "#64748B" }}>{r.date}</span>
                                    <span style={{ fontSize: "9px", color: "#64748B" }}>{methodLabel}</span>
                                    {r.handedOver
                                      ? <span style={{ fontSize: "9px", background: "#DCFCE7", color: "#15803D", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>✓ 인계 완료</span>
                                      : <span style={{ fontSize: "9px", background: "#FEF3C7", color: "#D97706", padding: "1px 5px", borderRadius: "4px", fontWeight: "700" }}>인계 대기</span>
                                    }
                                  </div>
                                  {r.handedOver && (
                                    <div style={{ fontSize: "9px", color: "#64748B" }}>
                                      {r.handoverDate} · {transferLabel}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
                        <span style={{ fontSize: "9px", background: isClosed ? "#F1F5F9" : typeBg, color: isClosed ? "#64748B" : typeColor, padding: "2px 7px", borderRadius: "5px", fontWeight: "700" }}>
                          {isClosed ? "종결" : typeLabel}
                        </span>
                        {isLost && !isClosed && remaining > 0 && (
                          <button onClick={function() {
                            setRecoveryModal(item);
                            setRecoveryModalQty(String(remaining));
                            setRecoveryModalMethod("");
                          }} style={{ padding: "4px 9px", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: "6px", fontSize: "9px", fontWeight: "700", color: "#16A34A", cursor: "pointer", whiteSpace: "nowrap" }}>
                            + 회수 기록
                          </button>
                        )}
                        {(isDamaged || item.type === "both") && !isClosed && (
                          <button onClick={function() {
                            setDamagedModal(item);
                            setDamagedModalAction("");
                          }} style={{ padding: "4px 9px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "6px", fontSize: "9px", fontWeight: "700", color: "#F97316", cursor: "pointer", whiteSpace: "nowrap" }}>
                            + 훼손 처리
                          </button>
                        )}
                        {isClosed && (
                          <button onClick={function() {
                            setLostItems(function(prev) {
                              return prev.map(function(li) {
                                return li.id === item.id
                                  ? Object.assign({}, li, { closed: false, closeNote: "" })
                                  : li;
                              });
                            });
                            setRecoveries(function(prev) {
                              return prev.filter(function(r) { return r.lostItemId !== item.id || r.method !== "fulllost"; });
                            });
                            
                            // DB 업데이트
                            (async function() {
                              try {
                                await sbPatch("lost_items?id=eq." + item.id, {
                                  status: "open",
                                  close_note: null,
                                  closed_at: null
                                });
                                console.log("✅ 종결 취소 완료:", item.eq);
                              } catch(e) {
                                console.error("종결 취소 DB 업데이트 실패:", e);
                              }
                            })();
                          }} style={{ padding: "4px 9px", background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "9px", fontWeight: "700", color: "#64748B", cursor: "pointer", whiteSpace: "nowrap" }}
                            title="종결을 취소하고 미종결 상태로 되돌립니다">
                            종결 취소
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {}
        {showHandoverModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: "640px", padding: "22px 18px 32px" }}>
              <div style={{ fontSize: "15px", fontWeight: "800", color: "#0F172A", marginBottom: "4px" }}>회수 교구 인계</div>
              <div style={{ fontSize: "11px", color: "#94A3B8", marginBottom: "18px" }}>
                보관 중인 회수 교구를 누구에게 인계할지 선택하세요
              </div>

              {handoverTargets.map(function(t) {
                var isSelected = handoverTarget === t.value;
                return (
                  <div key={t.value} onClick={function() { setHandoverTarget(t.value); }}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 14px", borderRadius: "10px", border: "2px solid " + (isSelected ? "#6366F1" : "#E2E8F0"), background: isSelected ? "#EEF2FF" : "#fff", marginBottom: "8px", cursor: "pointer" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: isSelected ? "#6366F1" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>
                      {t.value === "manager1" ? "👑" : t.value === "office" ? "🏢" : "👤"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: isSelected ? "#4338CA" : "#0F172A" }}>{t.label}</div>
                      <div style={{ fontSize: "10px", color: "#94A3B8" }}>{t.sub}</div>
                    </div>
                    <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid " + (isSelected ? "#6366F1" : "#CBD5E1"), background: isSelected ? "#6366F1" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isSelected && <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff" }} />}
                    </div>
                  </div>
                );
              })}

              <div style={{ background: "#F8FAFC", borderRadius: "8px", padding: "10px 12px", marginBottom: "16px", marginTop: "8px" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#374151", marginBottom: "4px" }}>인계 대상 회수 교구</div>
                {recoveries.filter(function(r) { return !r.handedOver; }).map(function(r) {
                  var col = eqColor(r.eq);
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                      <span style={{ background: col + "18", color: col, border: "1px solid " + col + "35", padding: "1px 6px", borderRadius: "6px", fontSize: "10px", fontWeight: "700" }}>{r.eq}</span>
                      <span style={{ fontSize: "10px", color: "#374151", fontWeight: "600" }}>{r.qty}개</span>
                      <span style={{ fontSize: "9px", color: "#94A3B8" }}>{r.recoveryDate}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={function() { setShowHandoverModal(false); }} style={{ flex: 1, padding: "12px", background: "#F1F5F9", color: "#64748B", border: "none", borderRadius: "9px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>취소</button>
                <button onClick={doHandover} style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", border: "none", borderRadius: "9px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>인계 완료</button>
              </div>
            </div>
          </div>
        )}

        {/* 회수 기록 모달 */}
        {recoveryModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: "640px", padding: "22px 18px 36px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <div style={{ fontSize: "15px", fontWeight: "800", color: "#0F172A" }}>회수 기록 등록</div>
                <button onClick={function() { setRecoveryModal(null); setRecoveryModalQty(""); setRecoveryModalMethod(""); setRecoveryModalDate("2026-03-14"); setRecoveryModalTransfer("delivery"); }} style={{ background: "none", border: "none", fontSize: "18px", color: "#94A3B8", cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>x</button>
              </div>
              <div style={{ fontSize: "11px", color: "#94A3B8", marginBottom: "18px" }}>분실 교구의 회수 수량과 인계 방법을 입력하세요</div>

              {/* 분실 교구 정보 */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#FEF2F2", borderRadius: "9px", padding: "10px 12px", marginBottom: "18px" }}>
                <div style={{ fontSize: "20px" }}>🔍</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "1px" }}>분실 교구</div>
                  <div style={{ fontSize: "13px", fontWeight: "800", color: "#EF4444" }}>{recoveryModal.eq}</div>
                  <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "1px" }}>
                    총 {recoveryModal.qty}개 분실 &nbsp;|&nbsp; {recoveryModal.reportDate}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "2px" }}>미회수</div>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "#EF4444" }}>
                    {recoveryModal.qty - recoveries.filter(function(r) { return r.lostId === recoveryModal.id; }).reduce(function(s, r) { return s + r.qty; }, 0)}개
                  </div>
                </div>
              </div>

              {/* 회수 수량 - 완전 분실 선택 시 숨김 */}
              {recoveryModalMethod !== "fulllost" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "6px" }}>회수 수량</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input type="number" min="0" value={recoveryModalQty} 
                    onChange={function(e) { 
                      var val = e.target.value;
                      if (val !== "" && parseInt(val) < 0) val = "0";
                      setRecoveryModalQty(val);
                    }}
                    onKeyDown={function(e) { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: "8px", border: "1.5px solid #E2E8F0", fontSize: "16px", fontWeight: "800", outline: "none", boxSizing: "border-box", color: "#0F172A" }} />
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#64748B" }}>개</span>
                </div>
              </div>
              )}

              {/* 인계 방법 */}
              <div style={{ marginBottom: "22px" }}>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "8px" }}>인계 방법</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { value: "prev", icon: "👤", label: "이전 강사", sub: prevInst ? prevInst.name + "에게 전달" : "이전 강사에게 전달" },
                    { value: "post", icon: "📦", label: "본사 택배 발송", sub: "본사 주소로 택배 발송" },
                    { value: "office", icon: "🏢", label: "사무실 반납", sub: "지역 사무실에 직접 반납" },
                    { value: "fulllost", icon: "🔒", label: "완전 분실 종결", sub: "회수 불가 - 해당 교구 건을 종결 처리합니다" },
                  ].map(function(opt) {
                    var isSel = recoveryModalMethod === opt.value;
                    var isClose = opt.value === "fulllost";
                    var selBorder = isClose ? "#64748B" : "#22C55E";
                    var selBg = isClose ? "#F8FAFC" : "#F0FDF4";
                    var selColor = isClose ? "#374151" : "#15803D";
                    var iconBg = isClose ? (isSel ? "#475569" : "#F1F5F9") : (isSel ? "#22C55E" : "#F1F5F9");
                    return (
                      <div key={opt.value} onClick={function() { setRecoveryModalMethod(opt.value); }}
                        style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "10px", border: "2px solid " + (isSel ? selBorder : "#E2E8F0"), background: isSel ? selBg : "#fff", cursor: "pointer" }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>{opt.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: isSel ? selColor : "#0F172A" }}>{opt.label}</div>
                          <div style={{ fontSize: "9px", color: isClose ? (isSel ? "#EF4444" : "#94A3B8") : "#94A3B8", marginTop: "1px" }}>{opt.sub}</div>
                        </div>
                        <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid " + (isSel ? selBorder : "#CBD5E1"), background: isSel ? selBorder : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {isSel && <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff" }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 완전 분실 선택 시 경고 + 사유 입력 */}
                {recoveryModalMethod === "fulllost" && (
                  <div style={{ marginTop: "10px", background: "#FFF8F8", border: "1.5px solid #FCA5A5", borderRadius: "9px", padding: "12px 13px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#EF4444", marginBottom: "6px" }}>종결 처리 확인</div>
                    <div style={{ fontSize: "10px", color: "#64748B", marginBottom: "10px" }}>
                      미회수 교구를 완전 분실로 종결합니다. 이 작업은 취소할 수 없으며 관리자에게 알림이 발송됩니다.
                    </div>
                    <label style={{ fontSize: "9px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "4px" }}>종결 사유 (선택)</label>
                    <input id="closeNoteInput" placeholder="예: 수업 중 분실 후 수소문했으나 확인 불가" style={{ width: "100%", padding: "8px 9px", borderRadius: "6px", border: "1.5px solid #FCA5A5", fontSize: "11px", outline: "none", boxSizing: "border-box" }} />
                  </div>
                )}

                {/* 인계 정보 - fulllost 제외 + 방법 선택 후 노출 */}
                {recoveryModalMethod && recoveryModalMethod !== "fulllost" && (
                  <div style={{ marginTop: "12px", background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: "9px", padding: "13px 14px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: "#15803D", marginBottom: "10px" }}>📋 인계 정보 (동시 등록)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <label style={{ fontSize: "10px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>인계 날짜 <span style={{ color: "#EF4444" }}>*</span></label>
                        <input type="date" value={recoveryModalDate} onChange={function(e) { setRecoveryModalDate(e.target.value); }}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: "7px", border: "1.5px solid #BBF7D0", fontSize: "12px", outline: "none", boxSizing: "border-box", background: "#fff" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "10px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "5px" }}>이동 방법 <span style={{ color: "#EF4444" }}>*</span></label>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={function() { setRecoveryModalTransfer("delivery"); }}
                            style={{ flex: 1, padding: "8px", border: "2px solid " + (recoveryModalTransfer === "delivery" ? "#22C55E" : "#E2E8F0"), borderRadius: "7px", background: recoveryModalTransfer === "delivery" ? "#F0FDF4" : "#fff", color: recoveryModalTransfer === "delivery" ? "#15803D" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                            택배
                          </button>
                          <button onClick={function() { setRecoveryModalTransfer("direct"); }}
                            style={{ flex: 1, padding: "8px", border: "2px solid " + (recoveryModalTransfer === "direct" ? "#22C55E" : "#E2E8F0"), borderRadius: "7px", background: recoveryModalTransfer === "direct" ? "#F0FDF4" : "#fff", color: recoveryModalTransfer === "direct" ? "#15803D" : "#64748B", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                            직접전달
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "9px", color: "#16A34A" }}>✓ 회수 등록과 동시에 인계 완료 처리됩니다. 인계 등록 탭을 별도로 작성할 필요가 없습니다.</div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={function() { setRecoveryModal(null); setRecoveryModalQty(""); setRecoveryModalMethod(""); setRecoveryModalDate("2026-03-14"); setRecoveryModalTransfer("delivery"); }}
                  style={{ flex: 1, padding: "13px", background: "#F1F5F9", color: "#64748B", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>취소</button>
                <button onClick={function() {
                  if (!recoveryModalMethod) { return; }
                  if (recoveryModalMethod === "fulllost") {
                    var closeNote = document.getElementById("closeNoteInput") ? document.getElementById("closeNoteInput").value : "";
                    setLostItems(function(prev) {
                      return prev.map(function(item) {
                        return item.id === recoveryModal.id ? Object.assign({}, item, { closed: true, closeNote: closeNote || "완전 분실 종결" }) : item;
                      });
                    });
                    // DB에 종결 기록 저장
                    (async function() {
                      try {
                        if (recoveryModal.id) {
                          // 기존 lost_items 레코드를 closed로 업데이트
                          await sbPatch("lost_items?id=eq." + recoveryModal.id, {
                            status: "closed"
                          });
                        }
                      } catch(e) {
                        console.error("종결 기록 DB 저장 실패:", e);
                      }
                    })();
                  } else {
                    if (!recoveryModalQty || parseInt(recoveryModalQty) <= 0) { return; }
                    var newRec = { id: Date.now(), lostId: recoveryModal.id, eq: recoveryModal.eq, qty: parseInt(recoveryModalQty), date: recoveryModalDate, note: "", method: recoveryModalMethod, transferMethod: recoveryModalTransfer, handedOver: true, handoverDate: recoveryModalDate };
                    setRecoveries(function(prev) { return prev.concat([newRec]); });
                    
                    // 로컬 상태에서 lostItems 업데이트 (회수 완료 표시)
                    setLostItems(function(prev) {
                      return prev.map(function(item) {
                        return item.id === recoveryModal.id 
                          ? Object.assign({}, item, { status: "closed", closed: true })
                          : item;
                      });
                    });
                    
                    // DB에 회수 기록 저장
                    (async function() {
                      try {
                        var instId = myId;
                        if (instId && recoveryModal.id) {
                          // 1. recovery_logs에 회수 기록 저장
                          await sbPost("recovery_logs", {
                            instructor_id: instId,
                            lost_item_id: recoveryModal.id,
                            recovered_qty: parseInt(recoveryModalQty),
                            handover_date: recoveryModalDate,
                            transfer_method: recoveryModalTransfer,
                            recovery_method: recoveryModalMethod
                          });
                          
                          // 2. lost_items 상태를 closed로 업데이트
                          await sbPatch("lost_items?id=eq." + recoveryModal.id, {
                            status: "closed"
                          });
                          
                          // 3. rotation_schedule에서 본사(또는 기본 위치)의 수량 증가
                          // 회수된 교구를 본사로 반환 처리
                          var eqName = recoveryModal.eq;
                          var eqRes = await sbGet("equipment?select=id&name=eq." + encodeURIComponent(eqName));
                          var eqId = eqRes && eqRes[0] ? eqRes[0].id : null;
                          
                          if (eqId) {
                            // 본사 rotation_schedule 조회 (instructor_id가 null 또는 특정 본사 ID)
                            var hqRes = await sbGet("rotation_schedule?equipment_id=eq." + eqId + "&week=eq.main&year=eq.2026&sheet_id=eq.main&select=id,instructor_id");
                            if (hqRes && hqRes.length > 0) {
                              // 본사 레코드 업데이트 (수량 증가)
                              var hqId = hqRes[0].id;
                              await sbPatch("rotation_schedule?id=eq." + hqId, {
                                updated_at: new Date().toISOString()
                              });
                            }
                          }
                          
                          console.log("✅ 회수 기록 저장 성공 - 교구 일정 및 이동 이력 반영됨");
                        }
                      } catch(e) {
                        console.error("회수 기록 DB 저장 실패:", e);
                        alert("회수 기록 저장 실패: " + (e.message || e));
                      }
                    })();
                  }
                  setRecoveryModal(null);
                  setRecoveryModalQty("");
                  setRecoveryModalMethod("");
                  setRecoveryModalDate("2026-03-14");
                  setRecoveryModalTransfer("delivery");
                }}
                  style={{ flex: 2, padding: "13px", background: !recoveryModalMethod || (recoveryModalMethod !== "fulllost" && (!recoveryModalQty || parseInt(recoveryModalQty) <= 0)) ? "#E2E8F0" : recoveryModalMethod === "fulllost" ? "linear-gradient(135deg,#475569,#334155)" : "linear-gradient(135deg,#22C55E,#16A34A)", color: !recoveryModalMethod || (recoveryModalMethod !== "fulllost" && (!recoveryModalQty || parseInt(recoveryModalQty) <= 0)) ? "#94A3B8" : "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: !recoveryModalMethod ? "not-allowed" : "pointer" }}>
                  {recoveryModalMethod === "fulllost" ? "종결 처리" : "회수 등록 완료"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 훼손 처리 모달 */}
        {damagedModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: "640px", padding: "22px 18px 36px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <div style={{ fontSize: "15px", fontWeight: "800", color: "#0F172A" }}>훼손 처리</div>
                <button onClick={function() { setDamagedModal(null); setDamagedModalAction(""); }}
                  style={{ background: "none", border: "none", fontSize: "18px", color: "#94A3B8", cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>x</button>
              </div>
              <div style={{ fontSize: "11px", color: "#94A3B8", marginBottom: "18px" }}>훼손된 교구의 처리 방법을 선택하세요</div>

              {/* 훼손 교구 정보 */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#FFF7ED", borderRadius: "9px", padding: "10px 12px", marginBottom: "20px" }}>
                <div style={{ fontSize: "20px" }}>🔧</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "1px" }}>훼손 교구</div>
                  <div style={{ fontSize: "13px", fontWeight: "800", color: "#F97316" }}>{damagedModal.eq}</div>
                  <div style={{ fontSize: "9px", color: "#94A3B8", marginTop: "1px" }}>
                    {damagedModal.qty}개 훼손 &nbsp;|&nbsp; {damagedModal.reportDate}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "9px", color: "#94A3B8", marginBottom: "2px" }}>처리 대기</div>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "#F97316" }}>{damagedModal.qty}개</div>
                </div>
              </div>

              {/* 처리 방법 선택 */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "10px" }}>처리 방법</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[
                    {
                      value: "reinforce",
                      icon: "🔨",
                      label: "교구 보강",
                      sub: "수리 또는 추가 구매로 수량 보충",
                      accentColor: "#3B82F6",
                      activeBorder: "#3B82F6",
                      activeBg: "#EFF6FF",
                      activeColor: "#1D4ED8",
                    },
                    {
                      value: "dispose",
                      icon: "🗑",
                      label: "폐기처분",
                      sub: "사용 불가 교구 폐기 처리 및 종결",
                      accentColor: "#64748B",
                      activeBorder: "#64748B",
                      activeBg: "#F8FAFC",
                      activeColor: "#374151",
                    },
                  ].map(function(opt) {
                    var isSel = damagedModalAction === opt.value;
                    return (
                      <div key={opt.value} onClick={function() { setDamagedModalAction(opt.value); }}
                        style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", borderRadius: "12px", border: "2px solid " + (isSel ? opt.activeBorder : "#E2E8F0"), background: isSel ? opt.activeBg : "#fff", cursor: "pointer" }}>
                        <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: isSel ? opt.accentColor : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>{opt.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "13px", fontWeight: "800", color: isSel ? opt.activeColor : "#0F172A", marginBottom: "2px" }}>{opt.label}</div>
                          <div style={{ fontSize: "10px", color: "#94A3B8" }}>{opt.sub}</div>
                        </div>
                        <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid " + (isSel ? opt.activeBorder : "#CBD5E1"), background: isSel ? opt.activeBorder : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {isSel && <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff" }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 선택별 상세 입력 */}
              {damagedModalAction === "reinforce" && (
                <div style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: "9px", padding: "12px 13px", marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#1D4ED8", marginBottom: "8px" }}>보강 정보 입력</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "9px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "3px" }}>보강 수량</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input type="number" id="reinforceQtyInput" min="0" defaultValue={damagedModal.qty}
                          onKeyDown={function(e) { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                          style={{ flex: 1, padding: "7px 8px", borderRadius: "6px", border: "1.5px solid #BFDBFE", fontSize: "12px", fontWeight: "700", outline: "none", boxSizing: "border-box", color: "#1D4ED8" }} />
                        <span style={{ fontSize: "10px", color: "#64748B" }}>개</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: "9px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "3px" }}>보강 방법</label>
                      <select id="reinforceMethodInput" style={{ width: "100%", padding: "7px 8px", borderRadius: "6px", border: "1.5px solid #BFDBFE", fontSize: "11px", outline: "none", background: "#fff", boxSizing: "border-box" }}>
                        <option value="repair">수리</option>
                        <option value="purchase">추가 구매</option>
                        <option value="spare">예비 교구 사용</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <label style={{ fontSize: "9px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "3px" }}>비고 (선택)</label>
                    <input id="reinforceNoteInput" placeholder="예: 본사 수리 후 재지급" style={{ width: "100%", padding: "7px 8px", borderRadius: "6px", border: "1.5px solid #BFDBFE", fontSize: "11px", outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              )}

              {damagedModalAction === "dispose" && (
                <div style={{ background: "#F8FAFC", border: "1.5px solid #CBD5E1", borderRadius: "9px", padding: "12px 13px", marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#374151", marginBottom: "6px" }}>폐기 처리 확인</div>
                  <div style={{ fontSize: "10px", color: "#64748B", marginBottom: "10px" }}>
                    훼손 교구를 폐기 처리하고 해당 건을 종결합니다. 관리자에게 알림이 발송됩니다.
                  </div>
                  <label style={{ fontSize: "9px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "3px" }}>폐기 사유 (선택)</label>
                  <input id="disposeNoteInput" placeholder="예: 파손 심각, 수리 불가 판단" style={{ width: "100%", padding: "7px 8px", borderRadius: "6px", border: "1.5px solid #CBD5E1", fontSize: "11px", outline: "none", boxSizing: "border-box" }} />
                </div>
              )}

              {/* 버튼 */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={function() { setDamagedModal(null); setDamagedModalAction(""); }}
                  style={{ flex: 1, padding: "13px", background: "#F1F5F9", color: "#64748B", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>취소</button>
                <button
                  onClick={function() {
                    if (!damagedModalAction) return;
                    if (damagedModalAction === "dispose") {
                      var disposeNote = document.getElementById("disposeNoteInput") ? document.getElementById("disposeNoteInput").value : "";
                      setLostItems(function(prev) {
                        return prev.map(function(it) {
                          return it.id === damagedModal.id
                            ? Object.assign({}, it, { closed: true, closeNote: disposeNote || "폐기처분 종결" })
                            : it;
                        });
                      });
                    } else if (damagedModalAction === "reinforce") {
                      var reinforceNote = document.getElementById("reinforceNoteInput") ? document.getElementById("reinforceNoteInput").value : "";
                      setLostItems(function(prev) {
                        return prev.map(function(it) {
                          return it.id === damagedModal.id
                            ? Object.assign({}, it, { closed: true, closeNote: reinforceNote || "교구 보강 완료" })
                            : it;
                        });
                      });
                    }
                    setDamagedModal(null);
                    setDamagedModalAction("");
                  }}
                  style={{
                    flex: 2, padding: "13px", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: damagedModalAction ? "pointer" : "not-allowed",
                    background: !damagedModalAction ? "#E2E8F0" : damagedModalAction === "reinforce" ? "linear-gradient(135deg,#3B82F6,#1D4ED8)" : "linear-gradient(135deg,#64748B,#475569)",
                    color: !damagedModalAction ? "#94A3B8" : "#fff"
                  }}>
                  {damagedModalAction === "reinforce" ? "보강 완료 처리" : damagedModalAction === "dispose" ? "폐기 처리" : "처리 방법 선택"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── 로그인/회원가입 화면 컴포넌트 ───────────────────────────
function LoginScreen({ onLogin }) {
  const [tab, setTab]           = useState("login"); // "login" | "signup"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");       // 회원가입용 강사명
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  function reset() { setEmail(""); setPassword(""); setName(""); setError(""); setSuccess(""); }

  async function handleLogin() {
    if (!email || !password) { setError("이메일과 비밀번호를 입력하세요."); return; }
    setLoading(true); setError("");
    try {
      var res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.msg || "로그인 실패");

      var accessToken = data.access_token;
      var refreshToken = data.refresh_token;
      var userId = data.user && data.user.id;

      var roleRes = await fetch(SUPABASE_URL + "/rest/v1/user_roles?user_id=eq." + userId + "&select=role", {
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + accessToken }
      });
      var roleData = await roleRes.json();
      var role = roleData && roleData[0] ? roleData[0].role : "instructor";

      var instructorId = null;
      var instructorName = "";
      if (role === "instructor") {
        // 1차: user_id로 조회
        var instRes = await fetch(SUPABASE_URL + "/rest/v1/instructors?user_id=eq." + userId + "&select=id,name,region", {
          headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + accessToken }
        });
        var instData = await instRes.json();
        console.log("🔐 로그인 강사 조회 (user_id):", "userId:", userId, "결과:", instData);
        if (instData && instData[0]) {
          instructorId   = instData[0].id;
          instructorName = (instData[0].region ? instData[0].region + " - " : "") + instData[0].name;
          console.log("✅ 강사 ID 확인 (user_id):", instructorId, "이름:", instructorName);
        } else {
          // 2차: 이메일로 조회 (user_id 컬럼 미설정 계정 대응)
          console.warn("⚠️  user_id 조회 실패, 이메일로 재시도:", email);
          var instRes2 = await fetch(SUPABASE_URL + "/rest/v1/instructors?email=eq." + encodeURIComponent(email) + "&select=id,name,region", {
            headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + accessToken }
          });
          var instData2 = await instRes2.json();
          console.log("🔐 로그인 강사 조회 (email):", "email:", email, "결과:", instData2);
          if (instData2 && instData2[0]) {
            instructorId   = instData2[0].id;
            instructorName = (instData2[0].region ? instData2[0].region + " - " : "") + instData2[0].name;
            console.log("✅ 강사 ID 확인 (email):", instructorId, "이름:", instructorName);
          } else {
            console.warn("⚠️  이메일 조회도 실패. instData2:", instData2);
          }
        }
      }
      onLogin({ accessToken, refreshToken, userId, email, role, instructorId, instructorName });
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    if (!name.trim())  { setError("강사명을 입력하세요."); return; }
    if (!email)        { setError("이메일을 입력하세요."); return; }
    if (password.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    setLoading(true); setError("");
    try {
      // Supabase Auth 회원가입 (instructors 테이블에는 관리자가 추가할 때만 저장됨)
      var res = await fetch(SUPABASE_URL + "/auth/v1/signup", {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          data: { name: name.trim() }  // 메타데이터로만 저장 (instructors 테이블에는 미저장)
        })
      });
      var data = await res.json();
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

        {/* 로고 */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <span style={{ color: "#fff", fontSize: "22px", fontWeight: "900" }}>B</span>
          </div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "#F1F5F9" }}>브레인힐 LMS</div>
          <div style={{ fontSize: "12px", color: "#64748B", marginTop: "3px" }}>교구 로테이션 관리 시스템</div>
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", background: "#0F1117", borderRadius: "10px", padding: "3px", marginBottom: "22px" }}>
          {["login","signup"].map(function(t) {
            var isActive = tab === t;
            return (
              <button key={t} onClick={function() { setTab(t); reset(); }}
                style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "700", background: isActive ? "#6366F1" : "transparent", color: isActive ? "#fff" : "#64748B", transition: "all 0.15s" }}>
                {t === "login" ? "로그인" : "강사 회원가입"}
              </button>
            );
          })}
        </div>

        {/* 폼 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>

          {/* 회원가입 전용: 강사명 */}
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

// ── App 메인 ─────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser]   = useState(function() {
    // localStorage에서 저장된 로그인 정보 복원
    try {
      var saved = localStorage.getItem("brainheal_auth");
      return saved ? JSON.parse(saved) : null;
    } catch(e) {
      return null;
    }
  });
  const [view, setView]           = useState(function() {
    // localStorage에서 저장된 view 복원
    try {
      var saved = localStorage.getItem("brainheal_view");
      return saved ? JSON.parse(saved) : "admin";
    } catch(e) {
      return "admin";
    }
  });
  const [handoverLogs, setHandoverLogs] = useState([]);

  // ── DB 초기 로딩 ─────────────────────────────────────
  const [dbLoading, setDbLoading]         = useState(true);
  const [dbInstructors, setDbInstructors] = useState(null);
  const [dbEquipment,   setDbEquipment]   = useState(null);
  const [dbSchedule,    setDbSchedule]    = useState(null);

  // authUser 변경 시 localStorage에 저장
  useEffect(function() {
    if (authUser) {
      localStorage.setItem("brainheal_auth", JSON.stringify(authUser));
      setAccessToken(authUser.accessToken);
      if (authUser.refreshToken) {
        setRefreshToken(authUser.refreshToken);
      }
    } else {
      localStorage.removeItem("brainheal_auth");
      setAccessToken(null);
      setRefreshToken(null);
    }
  }, [authUser]);

  // view 변경 시 localStorage에 저장
  useEffect(function() {
    localStorage.setItem("brainheal_view", JSON.stringify(view));
  }, [view]);

  useEffect(function() {
    // authUser가 없으면 DB 로딩 스킵
    if (!authUser) {
      setDbLoading(false);
      return;
    }

    async function loadAll() {
      try {
        console.log("DB 데이터 로딩 시작... (authUser:", authUser.role, ")");
        
        // 1. instructors 테이블에서 강사 정보 조회
        var insts = [];
        try {
          insts = await sbGet("instructors?select=id,name,region,note,sort_order&is_active=eq.true&order=sort_order.asc");
          console.log("instructors 조회 성공:", insts);
        } catch(e) {
          console.error("instructors 조회 실패:", e.message);
          insts = [];
        }
        
        // 2. equipment 테이블에서 교구 정보 조회
        var eqs = [];
        try {
          eqs = await sbGet("equipment?select=id,name,base_qty&is_active=eq.true&order=name.asc");
          console.log("equipment 조회 성공:", eqs);
        } catch(e) {
          console.error("equipment 조회 실패:", e.message);
          eqs = [];
        }
        
        // 3. rotation_schedule 테이블에서 로테이션 정보 조회
        var schedRows = [];
        try {
          schedRows = await sbGet("rotation_schedule?select=instructor_id,equipment_id,week,equipment(name)&year=eq.2026&sheet_id=eq.main&order=week.asc");
          console.log("rotation_schedule 조회 성공:", schedRows);
        } catch(e) {
          console.error("rotation_schedule 조회 실패:", e.message);
          schedRows = [];
        }
        
        // 4. handover_logs 테이블에서 인계 로그 조회
        var logs = [];
        try {
          logs = await sbGet("handover_logs?select=id,instructor_id,equipment_id,week,sent_qty,diff_note&year=eq.2026&order=week.asc&limit=5000");
          console.log("handover_logs 조회 성공:", logs.length, "건");
        } catch(e) {
          console.error("handover_logs 조회 실패:", e.message);
          logs = [];
        }

        // 📊 이전 주간 데이터 자동 생성 (rotation_schedule 기반)
        const CURRENT_WEEK_LOCAL = getCurrentWeek();  // 동적 계산
        const WEEKS_ARR = ["1-1","1-2","1-3","1-4","1-5","2-1","2-2","2-3","2-4","3-1","3-2","3-3","3-4","4-1","4-2","4-3","4-4","5-1","5-2","5-3","5-4","5-5","6-1","6-2","6-3","6-4","7-1","7-2","7-3","7-4","7-5","8-1","8-2","8-3","8-4","9-1","9-2","9-3","9-4","10-1","10-2","10-3","10-4","10-5","11-1","11-2","11-3","11-4","12-1","12-2","12-3","12-4"];
        const currentWkIdx = WEEKS_ARR.indexOf(CURRENT_WEEK_LOCAL);
        
        console.log("현재 주차:", CURRENT_WEEK_LOCAL, "인덱스:", currentWkIdx);
        console.log("handover_logs:", logs.length, "건 / rotation_schedule:", schedRows.length, "건");

        // 강사 정보 처리
        var instList = insts.map(function(r) {
          return { 
            id: r.id, 
            name: (r.region ? r.region + " - " : "") + r.name, 
            note: r.note || "", 
            sort_order: r.sort_order 
          };
        });
        
        // 로테이션 스케줄 처리
        var schedObj = {};
        instList.forEach(function(inst) {
          schedObj[inst.id] = {};
          WEEKS.forEach(function(w) { schedObj[inst.id][w] = "-"; });
        });
        schedRows.forEach(function(r) {
          if (schedObj[r.instructor_id]) {
            schedObj[r.instructor_id][r.week] = (r.equipment && r.equipment.name) || "-";
          }
        });
        
        // 인계 로그 처리
        var hLogs = logs.map(function(r) {
          return { 
            id: r.id, 
            instId: r.instructor_id, 
            week: r.week, 
            qty: r.sent_qty, 
            note: r.diff_note || "" 
          };
        });

        console.log("처리된 강사 목록:", instList);
        console.log("처리된 로테이션 스케줄:", schedObj);
        
        setDbInstructors(instList);
        setDbEquipment(eqs);
        setDbSchedule(schedObj);
        setHandoverLogs(hLogs.length > 0 ? hLogs : []);
        
        console.log("DB 데이터 로딩 완료. 강사 수:", instList.length, "교구 수:", eqs.length);
      } catch(e) {
        console.error("DB 로딩 중 예상치 못한 오류:", e);
        // DB 연결 실패 시 빈 상태로 유지
        setDbInstructors([]);
        setDbEquipment([]);
        setDbSchedule({});
        setHandoverLogs([]);
      } finally {
        setDbLoading(false);
      }
    }
    loadAll();
  }, [authUser]);

  // DB 스케줄 재로딩 (관리자 저장 후 강사뷰 반영용)
  async function reloadSchedule() {
    try {
      var schedRows = await sbGet("rotation_schedule?select=instructor_id,equipment_id,week,equipment(name)&year=eq.2026&sheet_id=eq.main&order=week.asc");
      var instList = dbInstructors || [];
      var schedObj = {};
      instList.forEach(function(inst) {
        schedObj[inst.id] = {};
        WEEKS.forEach(function(w) { schedObj[inst.id][w] = "-"; });
      });
      schedRows.forEach(function(r) {
        if (schedObj[r.instructor_id]) schedObj[r.instructor_id][r.week] = (r.equipment && r.equipment.name) || "-";
      });
      setDbSchedule(schedObj);
    } catch(e) { console.warn("스케줄 재로딩 실패:", e.message); }
  }

  // 로그인 성공 콜백
  function handleLogin(user) {
    setAuthUser(user);
    setView(user.role === "admin" ? "admin" : "instructor");
  }

  // 로그아웃
  function handleLogout() {
    setAuthUser(null);
    setView("admin");
  }

  // 로딩 중
  if (dbLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0F1117", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ width: "40px", height: "40px", border: "3px solid #334155", borderTop: "3px solid #6366F1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ color: "#64748B", fontSize: "13px", fontWeight: "600" }}>데이터 불러오는 중...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 미로그인 → 로그인 화면
  if (!authUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // 로그인 완료 → 역할별 화면
  return (
    <div>
      {/* 상단 네비 바 */}
      <div style={{ position: "fixed", top: "8px", right: "10px", zIndex: 9999, display: "flex", gap: "3px", alignItems: "center", background: "rgba(15,17,23,0.88)", borderRadius: "8px", padding: "3px", border: "1px solid rgba(255,255,255,0.07)" }}>
        {/* 관리자만 뷰 전환 가능 */}
        {authUser.role === "admin" && (
          <>
            <button onClick={function() { setView("admin"); }} style={{ padding: "5px 11px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "700", background: view === "admin" ? "#6366F1" : "transparent", color: view === "admin" ? "#fff" : "#64748B" }}>관리자</button>
            <button onClick={function() { setView("instructor"); }} style={{ padding: "5px 11px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "700", background: view === "instructor" ? "#6366F1" : "transparent", color: view === "instructor" ? "#fff" : "#64748B" }}>강사</button>
            <div style={{ width: "1px", background: "rgba(255,255,255,0.07)", margin: "3px 2px" }} />
          </>
        )}
        {/* 로그인 사용자 정보 */}
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

      {/* 뷰 렌더 */}
      {view === "admin"
        ? <AdminView
            handoverLogs={handoverLogs}
            dbInstructors={dbInstructors}
            dbSchedule={dbSchedule}
            dbEquipment={dbEquipment}
            setHandoverLogs={setHandoverLogs}
            setDbInstructors={setDbInstructors}
            onSaved={reloadSchedule}
          />
        : <InstructorView
            authUser={authUser}
            handoverLogs={handoverLogs}
            setHandoverLogs={setHandoverLogs}
            dbInstructors={dbInstructors}
            currentInstructorId={authUser.instructorId}
            currentInstructorName={authUser.instructorName}
            dbSchedule={dbSchedule}
          />}
    </div>
  );
}
