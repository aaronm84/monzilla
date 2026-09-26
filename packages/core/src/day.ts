import type { MemberSave } from './save.js';
import { brokenBlocks } from './world.js';

/**
 * What happened today. The island has a clear end to each day: once the
 * villain is beaten and the blocks are fixed, the alarm turns into a moon
 * and a "good night" wraps the day up. Nothing here is lost by skipping
 * it; it is a bow on the session, not a gate.
 */
export interface DayLog {
  day: number;
  /** The day's villain was beaten. */
  beaten: boolean;
  /** Blocks he snapped back into place today. */
  repaired: number;
  fragments: number;
  cards: number;
  stars: number;
  /** He said good night; the island rests until tomorrow. */
  done: boolean;
}

export function emptyDay(day: number): DayLog {
  return { day, beaten: false, repaired: 0, fragments: 0, cards: 0, stars: 0, done: false };
}

/** Today's log, or a fresh one if the saved log is from another day. */
export function todayLog(save: Pick<MemberSave, 'today'>, day: number): DayLog {
  return save.today && save.today.day === day ? save.today : emptyDay(day);
}

/** Add to today's counters (booleans are set, numbers are summed). */
export function bumpDay(save: MemberSave, day: number, delta: Partial<DayLog>): MemberSave {
  const log = todayLog(save, day);
  const next: DayLog = { ...log };
  for (const [k, v] of Object.entries(delta)) {
    if (k === 'day') continue;
    if (typeof v === 'number') (next as unknown as Record<string, number>)[k] = (log as unknown as Record<string, number>)[k]! + v;
    else if (typeof v === 'boolean') (next as unknown as Record<string, boolean>)[k] = v;
  }
  return { ...save, today: next };
}

/** Everything the day asks for is done: villain beaten, nothing left broken. */
export function dayComplete(save: MemberSave, day: number): boolean {
  const log = todayLog(save, day);
  return log.beaten && !save.activeBattle && brokenBlocks(save.blocks).length === 0;
}

/** Collect a villain card. Returns the new count for that species. */
export function addCard(cards: Record<string, number>, key: string): Record<string, number> {
  return { ...cards, [key]: (cards[key] ?? 0) + 1 };
}
