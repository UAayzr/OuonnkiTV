import Artplayer from 'artplayer'

/**
 * 控制条/可交互元素选择器。
 * 落在这些区域内的事件必须放行，否则自绘按钮、滑块将无法点击。
 */
const PLAYER_CONTROL_SELECTOR = [
  '.oki-player-controls',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'a[href]',
  '[role="slider"]',
  '[role="button"]',
].join(', ')

/**
 * 事件目标是否落在控制条/可交互元素内。
 * 画面手势（单击/双击/滑动）在控制条区域一律放行，交给 React 处理。
 */
export const isPlayerControlTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (!element || typeof element.closest !== 'function') return false
  return element.closest(PLAYER_CONTROL_SELECTOR) !== null
}

/**
 * Artplayer 裸内核配置：关闭全部默认皮肤与内置交互。
 *
 * 注意：Artplayer 5 的默认 controls 由其布尔选项（setting/pip/fullscreen…）无条件追加，
 * `controls: []` 只表示"不额外追加"，并不会移除它们，因此这些开关必须逐个显式关闭，
 * 再由 CSS（.art-controls）兜底隐藏。
 */
export const BARE_PLAYER_OPTIONS = {
  /** 不追加任何自定义控件 */
  controls: [],
  /** 关闭内置设置面板 */
  setting: false,
  /** 关闭内置右键菜单（必须传数组，传 false 会抛类型错误） */
  contextmenu: [],
  /** 关闭内置手势（避免与自绘手势冲突） */
  gesture: false,
  /** 关闭长按快进 */
  fastForward: false,
  /** 关闭锁屏按钮 */
  lock: false,
  /** 关闭收起态迷你进度条 */
  miniProgressBar: false,
  /** 关闭字幕偏移设置 */
  subtitleOffset: false,
  /** 关闭 AirPlay（桌面端 Safari 才会出现） */
  airplay: false,
  /** 关闭自动迷你播放器 */
  autoMini: false,
}

export type BarePlayerOptions = ConstructorParameters<typeof Artplayer>[0]

/**
 * 创建"裸内核"播放器：Artplayer 只负责解码与渲染，
 * 所有交互（单击/双击/右键/手势）由 usePlayerGestures 在捕获阶段接管。
 */
export function createBareArtplayer(options: BarePlayerOptions): Artplayer {
  const art = new Artplayer(options)

  // 左上角信息层是 Artplayer 的内置装饰，与自绘顶部条重叠，始终隐藏
  if (art.info) {
    art.info.show = false
  }

  // progress / thumbnails 是 position:"top" 的控件，挂在 .art-bottom 顶部而不是
  // .art-controls 内，因此隐藏默认控制条时不会一并消失，必须显式移除，
  // 否则默认进度条（跟随主题色）会残留在自绘控制条上方。
  art.controls.remove('progress')
  art.controls.remove('thumbnails')

  // 标记裸内核，供 CSS 处理内置层（构造后 $player 可能尚未就绪，ready 时再补一次）
  const markBarePlayer = () => {
    art.template?.$player?.classList.add('oki-bare-player')
  }
  markBarePlayer()
  art.on('ready', markBarePlayer)

  return art
}
