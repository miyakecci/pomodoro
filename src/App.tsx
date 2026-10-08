import { useCallback, useEffect, useRef, useState } from 'react'
import { playSound, SOUNDS, type SoundId } from './sounds'

type Mode = 'work' | 'short' | 'long'

type Settings = {
  work: number // 分
  short: number
  long: number
  longEvery: number // 何回集中したら長い休憩か
  autoStart: boolean
  soundId: SoundId
  volume: number // 0〜100
}

const DEFAULT_SETTINGS: Settings = {
  work: 25,
  short: 5,
  long: 15,
  longEvery: 4,
  autoStart: false,
  soundId: 'bell',
  volume: 70,
}

const LABEL: Record<Mode, string> = { work: '集中', short: '休憩', long: '長い休憩' }
const MESSAGE: Record<Mode, string> = {
  work: '目の前の作業ひとつに集中しましょう',
  short: '席を立って、軽く体を動かしましょう',
  long: 'しっかり休んで、頭をリフレッシュ',
}

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// サイクル：集中→休憩→…→集中→長い休憩（step は 0 始まり）
const cycleLength = (s: Settings) => s.longEvery * 2
const modeOf = (step: number, s: Settings): Mode =>
  step % 2 === 0 ? 'work' : step === cycleLength(s) - 1 ? 'long' : 'short'

// localStorage は使えない環境もあるので必ず try/catch で包む
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...fallback, ...JSON.parse(v) } : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 保存できなくても動作は続ける */
  }
}

function notify(body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ポモドーロタイマー', { body })
    }
  } catch {
    /* 通知非対応 */
  }
}

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => load('pomo-settings', DEFAULT_SETTINGS))
  const [step, setStep] = useState(0)
  const mode = modeOf(step, settings)
  const [remaining, setRemaining] = useState(settings.work * 60)
  const [running, setRunning] = useState(false)
  const [today, setToday] = useState<{ date: string; count: number; minutes: number }>(() => {
    const d = load('pomo-today', { date: todayKey(), count: 0, minutes: 0 })
    return d.date === todayKey() ? d : { date: todayKey(), count: 0, minutes: 0 }
  })
  const [showSettings, setShowSettings] = useState(false)

  // 終了予定時刻を持つことで、バックグラウンドタブでもズレない
  const endAt = useRef<number | null>(null)

  useEffect(() => save('pomo-settings', settings), [settings])
  useEffect(() => save('pomo-today', today), [today])

  const goTo = useCallback(
    (nextStep: number, autoStart: boolean) => {
      const n = ((nextStep % cycleLength(settings)) + cycleLength(settings)) % cycleLength(settings)
      setStep(n)
      const sec = settings[modeOf(n, settings)] * 60
      setRemaining(sec)
      if (autoStart) {
        endAt.current = Date.now() + sec * 1000
        setRunning(true)
      } else {
        endAt.current = null
        setRunning(false)
      }
    },
    [settings],
  )

  const finish = useCallback(
    (byUser: boolean) => {
      const next = (step + 1) % cycleLength(settings)
      const nextMode = modeOf(next, settings)
      if (!byUser) playSound(settings.soundId, settings.volume)
      if (mode === 'work' && !byUser) {
        setToday((t) =>
          t.date === todayKey()
            ? { ...t, count: t.count + 1, minutes: t.minutes + settings.work }
            : { date: todayKey(), count: 1, minutes: settings.work },
        )
      }
      if (!byUser) {
        notify(mode === 'work' ? `お疲れさまです！${LABEL[nextMode]}に入りましょう。` : '休憩終了。次の集中を始めましょう。')
      }
      goTo(next, !byUser && settings.autoStart)
    },
    [step, mode, settings, goTo],
  )

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (endAt.current === null) return
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) finish(false)
    }, 250)
    return () => clearInterval(id)
  }, [running, finish])

  useEffect(() => {
    document.title = `${fmt(remaining)} ${LABEL[mode]} | ポモドーロタイマー`
  }, [remaining, mode])

  const start = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    endAt.current = Date.now() + remaining * 1000
    setRunning(true)
  }
  const pause = () => {
    endAt.current = null
    setRunning(false)
  }

  const total = settings[mode] * 60
  const progress = total > 0 ? 1 - remaining / total : 0
  const R = 140
  const C = 2 * Math.PI * R
  const nextMode = modeOf((step + 1) % cycleLength(settings), settings)
  const roundNo = Math.floor(step / 2) + 1

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    if (key === 'longEvery') {
      // サイクルの長さが変わるので最初に戻す
      setStep(0)
      endAt.current = null
      setRunning(false)
      setRemaining(next.work * 60)
    } else if (!running && key === mode) {
      setRemaining(Number(value) * 60)
    }
  }

  const steps = Array.from({ length: cycleLength(settings) }, (_, i) => modeOf(i, settings))

  return (
    <div className={`app mode-${mode}`}>
      <header>
        <h1>ポモドーロタイマー！</h1>
      </header>

      <div className="layout">
        {/* 左：タイマー */}
        <section className="timer card">
          <div className="phase">
            <span className="badge">{LABEL[mode]}</span>
            <span className="round">
              {roundNo} / {settings.longEvery} セット目
            </span>
          </div>

          <div className="ring">
            <svg viewBox="0 0 320 320">
              <circle cx="160" cy="160" r={R} className="track" />
              <circle cx="160" cy="160" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
            </svg>
            <div className="time">
              <span className="digits">{fmt(remaining)}</span>
              <span className="message">{MESSAGE[mode]}</span>
            </div>
          </div>

          <div className="controls">
            <button className="ghost" onClick={() => goTo(step, false)} title="今のタイマーを最初から">
              リセット
            </button>
            {running ? (
              <button className="primary" onClick={pause}>一時停止</button>
            ) : (
              <button className="primary" onClick={start}>
                {remaining === total ? 'スタート' : '再開'}
              </button>
            )}
            <button className="ghost" onClick={() => finish(true)} title="次のステップへ進む">
              スキップ
            </button>
          </div>

          <p className="next">
            次は <strong className={`c-${nextMode}`}>{LABEL[nextMode]}</strong>（{settings[nextMode]}分）
          </p>

          <div className="sound">
            <div className="sound-head">
              <span>通知音</span>
              <button className="ghost small" onClick={() => playSound(settings.soundId, settings.volume)} disabled={settings.soundId === 'none' || settings.volume === 0}>
                ▶ 試聴
              </button>
            </div>
            <div className="chips" role="radiogroup" aria-label="通知音">
              {SOUNDS.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={settings.soundId === s.id}
                  className={`chip ${settings.soundId === s.id ? 'on' : ''}`}
                  onClick={() => {
                    updateSetting('soundId', s.id)
                    playSound(s.id, settings.volume)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="volume">
              <span aria-hidden>{settings.volume === 0 ? '🔇' : settings.volume < 50 ? '🔉' : '🔊'}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.volume}
                disabled={settings.soundId === 'none'}
                onChange={(e) => updateSetting('volume', Number(e.target.value))}
                onPointerUp={() => playSound(settings.soundId, settings.volume)}
                onKeyUp={() => playSound(settings.soundId, settings.volume)}
                aria-label="音量"
              />
              <span className="vol-num">{settings.volume}</span>
            </label>
          </div>
        </section>

        {/* 右：サイクル・記録・設定 */}
        <aside className="side">
          <section className="card">
            <h2>今日のサイクル</h2>
            <ol className="flow">
              {steps.map((m, i) => (
                <li key={i} className={`f-${m} ${i < step ? 'done' : ''} ${i === step ? 'current' : ''}`}>
                  <span className="dot" />
                  <span className="name">{LABEL[m]}</span>
                  <span className="min">{settings[m]}分</span>
                </li>
              ))}
            </ol>
            <button className="link" onClick={() => goTo(0, false)}>
              サイクルを最初からやり直す
            </button>
          </section>

          <section className="card stats">
            <h2>今日の記録</h2>
            <div className="nums">
              <div>
                <strong>{today.count}</strong>
                <span>回 集中</span>
              </div>
              <div>
                <strong>{today.minutes}</strong>
                <span>分 集中</span>
              </div>
            </div>
          </section>

          <section className="card">
            <button className="settings-toggle" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
              <h2>設定</h2>
              <span>{showSettings ? '閉じる ▲' : '開く ▼'}</span>
            </button>
            {showSettings && (
              <div className="settings">
                {(
                  [
                    ['work', '集中（分）'],
                    ['short', '休憩（分）'],
                    ['long', '長い休憩（分）'],
                    ['longEvery', '長い休憩までの集中回数'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={settings[key]}
                      onChange={(e) => updateSetting(key, Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                ))}
                <label className="check">
                  <input type="checkbox" checked={settings.autoStart} onChange={(e) => updateSetting('autoStart', e.target.checked)} />
                  次のタイマーを自動で開始
                </label>
                <button className="ghost small" onClick={() => setSettings(DEFAULT_SETTINGS)}>
                  初期値に戻す
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
