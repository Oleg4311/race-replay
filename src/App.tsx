import { useEffect, useRef, useState } from 'react';
import { createEngine, LATENCY, SCENARIO_GAP, type Engine, type Mode, type Outcome, type Snapshot } from './engine';

const MODES: { id: Mode; title: string; text: string }[] = [
  {
    id: 'race',
    title: 'Гонка (баг)',
    text: 'Каждый ответ просто записывается в состояние. Кто пришёл последним, тот и на экране.',
  },
  {
    id: 'abort',
    title: 'Отмена',
    text: 'При новом выборе предыдущий запрос отменяется через AbortController, его ответ не придёт.',
  },
  {
    id: 'guard',
    title: 'Проверка актуальности',
    text: 'Запросы не отменяются, но ответ принимается, только если он от последнего выбора.',
  },
];

const OUTCOME_TEXT: Record<Outcome, string> = {
  pending: 'ждём ответ…',
  shown: 'на экране',
  replaced: 'был на экране, затёрт',
  ignored: 'ответ отброшен как устаревший',
  aborted: 'запрос отменён',
};

const emptySnapshot = (mode: Mode): Snapshot => ({
  mode,
  entries: [],
  shownItem: null,
  wanted: null,
  stale: false,
  pending: false,
});

export function App() {
  const [mode, setMode] = useState<Mode>('race');
  const [snap, setSnap] = useState<Snapshot>(() => emptySnapshot('race'));
  const [elapsed, setElapsed] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const engineRef = useRef<Engine | null>(null);

  // Новый движок при смене режима или сбросе: история и таймеры предыдущего снимаются в cleanup.
  useEffect(() => {
    const engine = createEngine(mode, () => performance.now(), setSnap);
    engineRef.current = engine;
    setSnap(engine.snapshot());
    setElapsed(0);
    return () => engine.dispose();
  }, [mode, resetKey]);

  // Пока есть запросы в полёте, двигаем «сейчас» на таймлайне.
  useEffect(() => {
    if (!snap.pending) return;
    const id = setInterval(() => setElapsed(engineRef.current?.elapsed() ?? 0), 50);
    return () => clearInterval(id);
  }, [snap.pending]);

  const last = snap.entries.reduce((m, e) => Math.max(m, e.endedAt ?? 0), 0);
  const axis = Math.max(1500, last, elapsed);
  const pct = (ms: number) => `${(ms / axis) * 100}%`;
  const settled = snap.entries.length > 0 && !snap.pending;
  const verdict = !settled ? null : snap.stale ? 'bug' : 'ok';
  const current = MODES.find((m) => m.id === mode)!;

  return (
    <main>
      <h1>Race Replay</h1>
      <p className="sub">
        Пользователь быстро выбирает A, затем B. Ответ на A идёт {LATENCY.A} мс, на B — {LATENCY.B} мс, поэтому A
        приходит позже. Что окажется на экране?
      </p>

      <section className="card" aria-label="Режим">
        <div role="radiogroup" aria-label="Режим обработки ответа" className="modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              data-testid={`mode-${m.id}`}
              className={mode === m.id ? 'on' : ''}
              onClick={() => setMode(m.id)}
            >
              {m.title}
            </button>
          ))}
        </div>
        <p className="mode-text">{current.text}</p>
      </section>

      <section className="card" aria-label="Управление">
        <div className="actions">
          <button className="primary" data-testid="scenario" onClick={() => engineRef.current?.playScenario()}>
            ▶ Быстро A → B (через {SCENARIO_GAP} мс)
          </button>
          <button data-testid="select-a" onClick={() => engineRef.current?.select('A')}>
            Выбрать A
          </button>
          <button data-testid="select-b" onClick={() => engineRef.current?.select('B')}>
            Выбрать B
          </button>
          <button data-testid="reset" onClick={() => setResetKey((k) => k + 1)}>
            Сбросить
          </button>
        </div>
      </section>

      <section className="card" aria-label="Таймлайн">
        <h2>Таймлайн запросов</h2>
        {snap.entries.length === 0 ? (
          <p className="muted">Запустите сценарий или выберите элементы вручную.</p>
        ) : (
          <div className="timeline" data-testid="timeline">
            {snap.entries.map((e) => (
              <div
                key={e.seq}
                className="row"
                data-testid={`entry-${e.seq}`}
                data-item={e.item}
                data-outcome={e.outcome}
                data-start={Math.round(e.startedAt)}
                data-end={e.endedAt === null ? '' : Math.round(e.endedAt)}
              >
                <span className="label">
                  #{e.seq} {e.item}
                </span>
                <div className="track">
                  <div
                    className={`bar ${e.outcome}`}
                    style={{
                      left: pct(e.startedAt),
                      width: pct(Math.max((e.endedAt ?? elapsed) - e.startedAt, 4)),
                    }}
                  />
                </div>
                <span className="status">
                  {Math.round(e.startedAt)}→{e.endedAt === null ? '…' : Math.round(e.endedAt)} мс · {OUTCOME_TEXT[e.outcome]}
                </span>
              </div>
            ))}
            <div className="axis">
              <span>0</span>
              <span>{Math.round(axis)} мс</span>
            </div>
          </div>
        )}
      </section>

      <section className={`card result ${verdict ?? ''}`} aria-live="polite" aria-label="Результат">
        <h2>На экране</h2>
        <p className="shown" data-testid="result" data-stale={snap.stale}>
          {snap.shownItem ?? '—'}
        </p>
        {verdict === 'bug' && (
          <p className="verdict" data-testid="verdict">
            Баг: пользователь выбрал {snap.wanted}, а на экране {snap.shownItem}. Устаревший ответ перезаписал новый.
          </p>
        )}
        {verdict === 'ok' && (
          <p className="verdict" data-testid="verdict">
            Верно: на экране {snap.shownItem}, как и выбрал пользователь.
          </p>
        )}
      </section>

      <footer>
        <a href="https://github.com/Oleg4311/race-replay">Исходный код</a> · Задержки фиксированы, поэтому порядок ответов
        воспроизводится при каждом запуске.
      </footer>
    </main>
  );
}
