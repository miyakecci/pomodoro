// 音声ファイルを使わず Web Audio API で通知音を合成する

export type SoundId = 'bell' | 'chime' | 'digital' | 'marimba' | 'gong' | 'none'

export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: 'bell', label: 'ベル' },
  { id: 'chime', label: 'チャイム' },
  { id: 'digital', label: '電子音' },
  { id: 'marimba', label: 'マリンバ' },
  { id: 'gong', label: 'やさしい鐘' },
  { id: 'none', label: '鳴らさない' },
]

let ctx: AudioContext | null = null
function getCtx() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

type Tone = {
  freq: number
  at: number // 開始秒
  dur: number // 長さ（秒）
  type?: OscillatorType
  gain?: number // 0〜1 の相対音量
  attack?: number
}

function playTones(tones: Tone[], volume: number) {
  const c = getCtx()
  const master = c.createGain()
  master.gain.value = volume
  master.connect(c.destination)
  const now = c.currentTime + 0.02
  for (const t of tones) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = t.type ?? 'sine'
    osc.frequency.value = t.freq
    const peak = t.gain ?? 0.5
    const attack = t.attack ?? 0.01
    g.gain.setValueAtTime(0.0001, now + t.at)
    g.gain.exponentialRampToValueAtTime(peak, now + t.at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, now + t.at + t.dur)
    osc.connect(g).connect(master)
    osc.start(now + t.at)
    osc.stop(now + t.at + t.dur + 0.05)
  }
}

// 倍音を重ねて金属っぽい響きを作る
const metallic = (freq: number, at: number, dur: number, gain = 0.4): Tone[] => [
  { freq, at, dur, gain },
  { freq: freq * 2.76, at, dur: dur * 0.6, gain: gain * 0.35 },
  { freq: freq * 5.4, at, dur: dur * 0.3, gain: gain * 0.15 },
]

const PATTERNS: Record<Exclude<SoundId, 'none'>, Tone[]> = {
  bell: [...metallic(880, 0, 1.2), ...metallic(880, 0.45, 1.2), ...metallic(880, 0.9, 1.6)],
  chime: [
    ...metallic(659, 0, 1.4, 0.45), // ミ
    ...metallic(523, 0.55, 1.4, 0.45), // ド
    ...metallic(587, 1.1, 1.4, 0.45), // レ
    ...metallic(392, 1.65, 2.2, 0.45), // ソ
  ],
  digital: [0, 0.18, 0.36, 0.8, 0.98, 1.16].map((at) => ({
    freq: 1760,
    at,
    dur: 0.12,
    type: 'square' as OscillatorType,
    gain: 0.15,
    attack: 0.005,
  })),
  marimba: [523, 659, 784, 1047].flatMap((f, i) => [
    { freq: f, at: i * 0.16, dur: 0.6, gain: 0.5, attack: 0.005 },
    { freq: f * 4, at: i * 0.16, dur: 0.12, gain: 0.12, attack: 0.002 },
  ]),
  gong: [
    { freq: 196, at: 0, dur: 4, gain: 0.5, attack: 0.03 },
    { freq: 196 * 2.01, at: 0, dur: 3, gain: 0.25, attack: 0.03 },
    { freq: 196 * 3.2, at: 0, dur: 2, gain: 0.12, attack: 0.03 },
  ],
}

/** volume: 0〜100 */
export function playSound(id: SoundId, volume: number) {
  if (id === 'none' || volume <= 0) return
  try {
    playTones(PATTERNS[id], Math.min(1, volume / 100))
  } catch {
    /* 音が出せない環境では無視 */
  }
}
