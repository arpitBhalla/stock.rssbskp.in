const KEY = "stock.recentItems";
const MAX = 8;

export function getRecentItemIds(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export function pushRecentItem(id: number) {
  const next = [id, ...getRecentItemIds().filter((x) => x !== id)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
}
