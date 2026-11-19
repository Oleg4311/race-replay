// Ядро демо: имитация запросов с управляемыми задержками и три стратегии обработки ответа.
// Логика не зависит от React, поэтому проверяется обычными юнит-тестами.

export type Mode = 'race' | 'abort' | 'guard';
export type Item = 'A' | 'B';
/** pending — ждём ответ; shown — ответ сейчас на экране; replaced — был на экране, затем затёрт другим;
 *  ignored — ответ пришёл, но отброшен как устаревший; aborted — запрос отменён до ответа. */
export type Outcome = 'pending' | 'shown' | 'replaced' | 'ignored' | 'aborted';

export interface Entry {
  seq: number;
  item: Item;
  startedAt: number;
  endedAt: number | null;
  outcome: Outcome;
}

export interface Snapshot {
  mode: Mode;
  entries: Entry[];
  shownItem: Item | null;
  /** Последний выбор пользователя; именно он должен оказаться на экране. */
  wanted: Item | null;
  /** На экране показан не тот элемент, который пользователь выбрал последним. */
  stale: boolean;
  pending: boolean;
}

/** Задержки «сервера»: A отвечает медленно, B быстро, поэтому A приходит после B. */
export const LATENCY: Record<Item, number> = { A: 1200, B: 300 };
/** Пауза между кликом по A и кликом по B в готовом сценарии. */
export const SCENARIO_GAP = 100;

export function abortError(): Error {
  const e = new Error('Запрос отменён');
  e.name = 'AbortError';
  return e;
}

export function fakeFetch(item: Item, ms: number, signal?: AbortSignal): Promise<Item> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => resolve(item), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    });
  });
}

export interface Engine {
  select(item: Item): void;
  /** Быстро выбрать A, затем B. */
  playScenario(): void;
  snapshot(): Snapshot;
  /** Сколько миллисекунд прошло с первого выбора (0 до начала). */
  elapsed(): number;
  dispose(): void;
}

export function createEngine(
  mode: Mode,
  now: () => number,
  onChange: (s: Snapshot) => void,
  latency: Record<Item, number> = LATENCY,
): Engine {
  const entries: Entry[] = [];
  let seq = 0;
  let t0: number | null = null;
  let latest = 0;
  let wanted: Item | null = null;
  let shown: Entry | null = null;
  let controller: AbortController | null = null;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const rel = () => now() - (t0 ?? now());
  const snapshot = (): Snapshot => ({
    mode,
    entries: entries.map((e) => ({ ...e })),
    shownItem: shown?.item ?? null,
    wanted,
    stale: shown !== null && wanted !== null && shown.item !== wanted,
    pending: entries.some((e) => e.outcome === 'pending'),
  });
  const emit = () => {
    if (!disposed) onChange(snapshot());
  };

  function select(item: Item) {
    if (disposed) return;
    if (t0 === null) t0 = now();
    const mySeq = ++seq;
    latest = mySeq;
    wanted = item;
    const entry: Entry = { seq: mySeq, item, startedAt: rel(), endedAt: null, outcome: 'pending' };
    entries.push(entry);

    let signal: AbortSignal | undefined;
    if (mode === 'abort') {
      controller?.abort(); // отменяем предыдущий запрос, если он ещё в полёте
      controller = new AbortController();
      signal = controller.signal;
    }
    emit();

    fakeFetch(item, latency[item], signal).then(
      () => {
        if (disposed) return;
        entry.endedAt = rel();
        if (mode === 'guard' && mySeq !== latest) {
          entry.outcome = 'ignored'; // проверка актуальности: ответ не от последнего запроса
        } else {
          if (shown) shown.outcome = 'replaced';
          entry.outcome = 'shown';
          shown = entry;
        }
        emit();
      },
      (err: Error) => {
        if (disposed) return;
        if (err.name !== 'AbortError') throw err;
        entry.endedAt = rel();
        entry.outcome = 'aborted';
        emit();
      },
    );
  }

  function playScenario() {
    select('A');
    const t = setTimeout(() => {
      timers.delete(t);
      select('B');
    }, SCENARIO_GAP);
    timers.add(t);
  }

  return {
    select,
    playScenario,
    snapshot,
    elapsed: () => (t0 === null ? 0 : rel()),
    dispose() {
      disposed = true;
      controller?.abort();
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
