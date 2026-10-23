import { Solar } from 'lunar-javascript';
export { createMobileChart, parseMobileRequest } from '../../lib/mobile/chart';
export { readHistory, saveHistory } from '../../lib/mobile/history';
export { parseInterpretation } from '../../lib/mobile/interpretation';
export { BRANCHES, STEMS } from '../../lib/ziwei/constants';

export const TIME_LABELS = [
  '早子时 00:00–00:59', '丑时 01:00–02:59', '寅时 03:00–04:59',
  '卯时 05:00–06:59', '辰时 07:00–08:59', '巳时 09:00–10:59',
  '午时 11:00–12:59', '未时 13:00–14:59', '申时 15:00–16:59',
  '酉时 17:00–18:59', '戌时 19:00–20:59', '亥时 21:00–22:59',
  '晚子时 23:00–23:59（次日排盘）',
];

export function todayISO(now = new Date()): string {
  const date = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

/** 农历正月初一换流年；不使用设备所在时区或 Intl。 */
export function getCurrentLunarYear(now = new Date()): number {
  const [year, month, day] = todayISO(now).split('-').map(Number);
  return Solar.fromYmd(year, month, day).getLunar().getYear();
}
