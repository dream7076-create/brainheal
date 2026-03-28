// 입력값 검증 로직

/**
 * 인계 등록 필수 입력값 검증
 */
export function validateHandoverInput(receivedQty, sendQty) {
  if (!receivedQty || receivedQty === "") {
    return { valid: false, message: "실제 수령 수량을 입력해주세요." };
  }

  const receivedNum = parseInt(receivedQty);
  if (isNaN(receivedNum) || receivedNum < 0) {
    return { valid: false, message: "수령 수량은 0 이상의 숫자여야 합니다." };
  }

  return { valid: true };
}

/**
 * 회수 수량 검증
 */
export function validateRecoveryQty(qty) {
  if (!qty || qty === "") {
    return { valid: false, message: "회수 수량을 입력해주세요." };
  }

  const qtyNum = parseInt(qty);
  if (isNaN(qtyNum) || qtyNum <= 0) {
    return { valid: false, message: "회수 수량은 0보다 커야 합니다." };
  }

  return { valid: true };
}

/**
 * 회수 방법 검증
 */
export function validateRecoveryMethod(method) {
  if (!method || method === "") {
    return { valid: false, message: "회수 방법을 선택해주세요." };
  }

  return { valid: true };
}

/**
 * 분실/훼손 수량 검증
 */
export function validateDiffQty(diffQty, diffType) {
  if (!diffType) {
    return { valid: false, message: "분실/훼손 유형을 선택해주세요." };
  }

  if (!diffQty || diffQty === "") {
    return { valid: false, message: "분실/훼손 수량을 입력해주세요." };
  }

  const qtyNum = parseInt(diffQty);
  if (isNaN(qtyNum) || qtyNum <= 0) {
    return { valid: false, message: "분실/훼손 수량은 0보다 커야 합니다." };
  }

  return { valid: true };
}
