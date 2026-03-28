// 인계 관련 비즈니스 로직
import { sbGet, sbPost, sbUpsert, sbDelete, sbPatch } from "./supabaseClient";

/**
 * 인계 기록 저장 (UPSERT)
 */
export async function saveHandoverLog(instId, eqId, week, data) {
  return await sbUpsert("handover_logs", {
    instructor_id: instId,
    equipment_id: eqId,
    year: 2026,
    week: week,
    received_qty: data.receivedQty,
    sent_qty: data.sentQty,
    transfer_method: data.transferMethod,
    diff_type: data.diffType || null,
    diff_qty: data.diffQty || null,
    diff_note: data.diffNote || null,
    extra_note: data.extraNote || null
  });
}

/**
 * 인계 기록 및 연결된 회수 기록 삭제
 */
export async function deleteHandoverAndRecovery(instId, eqId, week, eqName) {
  try {
    // 1. 해당 주차의 lost_items 조회
    const lostItemsRes = await sbGet(
      `lost_items?instructor_id=eq.${instId}&equipment_id=eq.${eqId}`
    );

    // 2. lost_items에 연결된 recovery_logs 삭제
    if (lostItemsRes && lostItemsRes.length > 0) {
      for (let i = 0; i < lostItemsRes.length; i++) {
        await sbDelete(`recovery_logs?lost_item_id=eq.${lostItemsRes[i].id}`);
      }
    }

    // 3. handover_logs 삭제
    await sbDelete(
      `handover_logs?instructor_id=eq.${instId}&equipment_id=eq.${eqId}&week=eq.${encodeURIComponent(week)}&year=eq.2026`
    );

    console.log("✅ 인계 기록 및 회수 기록 삭제 완료");
    return true;
  } catch (e) {
    console.warn("기록 삭제 실패:", e);
    return false;
  }
}

/**
 * 교구 ID 조회
 */
export async function getEquipmentId(eqName) {
  try {
    const eqRes = await sbGet(
      `equipment?select=id&name=eq.${encodeURIComponent(eqName)}`
    );
    return eqRes && eqRes[0] ? eqRes[0].id : null;
  } catch (e) {
    console.error("교구 ID 조회 실패:", e);
    return null;
  }
}

/**
 * 분실/훼손 기록 저장
 */
export async function saveLostItem(instId, eqId, data) {
  return await sbPost("lost_items", {
    instructor_id: instId,
    equipment_id: eqId,
    qty: data.qty,
    type: data.type,
    status: "open",
    note: data.note,
    report_date: new Date().toISOString().split("T")[0]
  });
}

/**
 * 회수 기록 저장
 */
export async function saveRecoveryLog(instId, lostItemId, data) {
  return await sbPost("recovery_logs", {
    instructor_id: instId,
    lost_item_id: lostItemId,
    recovered_qty: parseInt(data.recoveredQty),
    handover_date: data.handoverDate,
    transfer_method: data.transferMethod,
    recovery_method: data.recoveryMethod
  });
}

/**
 * 종결 처리
 */
export async function closeLostItem(lostItemId, closeNote) {
  return await sbPatch(`lost_items?id=eq.${lostItemId}`, {
    status: "closed",
    close_note: closeNote || "완전 분실 종결",
    closed_at: new Date().toISOString()
  });
}

/**
 * 종결 취소
 */
export async function reopenLostItem(lostItemId) {
  return await sbPatch(`lost_items?id=eq.${lostItemId}`, {
    status: "open",
    close_note: null,
    closed_at: null
  });
}
