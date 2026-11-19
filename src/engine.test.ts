import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, LATENCY, type Mode, type Snapshot } from './engine';

async function run(mode: Mode) {
  let last: Snapshot | undefined;
  const engine = createEngine(mode, () => Date.now(), (s) => (last = s));
  engine.playScenario();
  await vi.advanceTimersByTimeAsync(2000);
  return { engine, snap: () => last!, outcomes: () => last!.entries.map((e) => e.outcome) };
}

describe('engine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('race: поздний A перезаписывает B', async () => {
    const r = await run('race');
    expect(r.snap().shownItem).toBe('A');
    expect(r.snap().stale).toBe(true);
    expect(r.outcomes()).toEqual(['shown', 'replaced']); // #1 A на экране, #2 B затёрт
  });

  it('abort: A отменён, остаётся B', async () => {
    const r = await run('abort');
    expect(r.snap().shownItem).toBe('B');
    expect(r.snap().stale).toBe(false);
    expect(r.outcomes()).toEqual(['aborted', 'shown']);
  });

  it('guard: ответ A отброшен, остаётся B', async () => {
    const r = await run('guard');
    expect(r.snap().shownItem).toBe('B');
    expect(r.snap().stale).toBe(false);
    expect(r.outcomes()).toEqual(['ignored', 'shown']);
  });

  it('порядок ответов детерминирован: B завершается раньше A', async () => {
    const r = await run('guard');
    const [a, b] = r.snap().entries;
    expect(b.startedAt - a.startedAt).toBe(100);
    expect(b.endedAt).toBe(100 + LATENCY.B);
    expect(a.endedAt).toBe(LATENCY.A);
    expect(b.endedAt!).toBeLessThan(a.endedAt!);
  });

  it('отмена не затрагивает уже завершённый запрос', async () => {
    let last: Snapshot | undefined;
    const e = createEngine('abort', () => Date.now(), (s) => (last = s));
    e.select('B');
    await vi.advanceTimersByTimeAsync(LATENCY.B + 10); // B уже на экране
    e.select('A');
    await vi.advanceTimersByTimeAsync(LATENCY.A + 10);
    expect(last!.entries.map((x) => x.outcome)).toEqual(['replaced', 'shown']);
    expect(last!.shownItem).toBe('A');
  });

  it('dispose гасит таймеры и события', async () => {
    const spy = vi.fn();
    const e = createEngine('race', () => Date.now(), spy);
    e.playScenario();
    const calls = spy.mock.calls.length;
    e.dispose();
    await vi.runAllTimersAsync();
    expect(spy.mock.calls.length).toBe(calls);
  });
});
