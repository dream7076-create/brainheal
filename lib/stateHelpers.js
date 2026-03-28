// 상태 업데이트 헬퍼 함수들

/**
 * 인계 폼 초기화
 */
export function resetHandoverForm(setters) {
  setters.setHandoverReceivedQty("");
  setters.setHandoverSendQty("");
  setters.setHandoverDiffType(null);
  setters.setHandoverDiffNote("");
  setters.setHandoverDiffPhotos([]);
  setters.setHandoverAllowExtra(false);
  setters.setHandoverExtraNote("");
}

/**
 * 회수 모달 초기화
 */
export function resetRecoveryModal(setters) {
  setters.setRecoveryModal(null);
  setters.setRecoveryModalQty("");
  setters.setRecoveryModalMethod("");
  setters.setRecoveryModalDate(new Date().toISOString().split("T")[0]);
  setters.setRecoveryModalTransfer("delivery");
}

/**
 * 훼손 모달 초기화
 */
export function resetDamagedModal(setters) {
  setters.setDamagedModal(null);
  setters.setDamagedModalAction("");
}

/**
 * 인계 기록 로컬 상태 업데이트
 */
export function updateMyHandoverLogs(setMyHandoverLogs, newLog, week, eqName) {
  setMyHandoverLogs(function(prev) {
    const exists = prev.find(
      (l) => l.week === week && l.eq === eqName
    );
    if (exists) {
      return prev.map((l) =>
        l.week === week && l.eq === eqName
          ? Object.assign({}, l, newLog)
          : l
      );
    } else {
      return prev.concat([newLog]);
    }
  });
}

/**
 * 인계 기록 로컬 상태 제거
 */
export function removeMyHandoverLog(setMyHandoverLogs, week, eqName) {
  setMyHandoverLogs(function(prev) {
    return prev.filter((log) => !(log.week === week && log.eq === eqName));
  });
}

/**
 * 회수 기록 로컬 상태 제거
 */
export function removeLostItem(setLostItems, week, eqName) {
  setLostItems(function(prev) {
    return prev.filter((item) => !(item.week === week && item.eq === eqName));
  });
}

/**
 * 종결 상태 업데이트
 */
export function updateLostItemClosed(setLostItems, itemId, closed, closeNote) {
  setLostItems(function(prev) {
    return prev.map((li) =>
      li.id === itemId
        ? Object.assign({}, li, { closed: closed, closeNote: closeNote })
        : li
    );
  });
}
