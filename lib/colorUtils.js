// Color utilities for week and equipment coloring

export const PALETTE = [
  { bg: "#0D2340", border: "#3B82F6", text: "#93C5FD", label: "파랑" },
  { bg: "#0A2E1E", border: "#22C55E", text: "#86EFAC", label: "초록" },
  { bg: "#2D1500", border: "#F97316", text: "#FDC97E", label: "주황" },
  { bg: "#251040", border: "#A855F7", text: "#D8B4FE", label: "보라" },
  { bg: "#2D0F1A", border: "#EF4444", text: "#FCA5A5", label: "빨강" },
];

export const EQ_COLORS = [
  "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#84CC16",
  "#F97316","#6366F1","#14B8A6","#F43F5E","#A855F7","#22C55E","#FB923C","#0EA5E9",
  "#E879F9","#FB7185","#34D399","#60A5FA","#FBBF24","#A78BFA","#4ADE80","#F472B6"
];

export function calcWeekColors(sched, instId, WEEKS) {
  const result = {};
  let ci = 0;
  let lastEq = null;
  for (let wi = 0; wi < WEEKS.length; wi++) {
    const w = WEEKS[wi];
    const eq = sched && sched[instId] ? sched[instId][w] : null;
    if (eq && eq !== "-" && eq !== lastEq) {
      ci++;
      lastEq = eq;
    }
    result[w] = eq && eq !== "-" ? (ci - 1) % 5 : -1;
  }
  return result;
}

export function getWeekPalette(week, weekColorMap) {
  const idx = weekColorMap ? weekColorMap[week] : -1;
  if (idx === undefined || idx < 0) return null;
  return PALETTE[idx];
}

export function getEqPalette(name, EQUIPMENT_LIST) {
  if (!name || name === "-") return null;
  const idx = EQUIPMENT_LIST.indexOf(name);
  return idx >= 0 ? EQ_COLORS[idx % EQ_COLORS.length] : "#475569";
}
