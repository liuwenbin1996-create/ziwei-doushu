import { parseMobileRequest, type MobileRequest } from "./chart";
export const HISTORY_KEY = "ziwei-guanxing-history-v1";
export interface SavedChart {
  id: string;
  savedAt: string;
  request: MobileRequest;
}
export function readHistory(raw: string | null): SavedChart[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data))
    throw new Error("历史记录格式异常，请清除后重新保存。");
  return data.slice(0, 20).map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw new Error("历史记录格式异常。");
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      entry.id.length > 100 ||
      typeof entry.savedAt !== "string" ||
      !Number.isFinite(Date.parse(entry.savedAt))
    )
      throw new Error("历史记录格式异常。");
    return {
      id: entry.id,
      savedAt: entry.savedAt,
      request: parseMobileRequest(entry.request),
    };
  });
}
export function saveHistory(
  entries: SavedChart[],
  request: MobileRequest,
  id: string,
  now: string,
): SavedChart[] {
  const valid = parseMobileRequest(request);
  return [
    { id, savedAt: now, request: valid },
    ...entries.filter(
      (e) => JSON.stringify(e.request.birth) !== JSON.stringify(valid.birth),
    ),
  ].slice(0, 20);
}
