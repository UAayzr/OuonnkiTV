import { useCallback, useLayoutEffect, useRef } from 'react'
import {
  computeDisplacements,
  sameContent,
  staggerDelayMs,
  type Displacement,
  type FlipLayout,
} from './flipLayoutMath'

/*
 * FLIP v2 —— 零测量位置过渡:
 * 卡片位置由 grid 布局公式从新旧序位直接推算(见 flipLayoutMath),
 * 无 DOM 测量、无强制 reflow、与滚动/虚拟化窗口无关。
 * 播放用微过冲弹性曲线(FLIP_EASE,与 --motion-ease-rebound 同值),
 * 按方向分道错峰(上升块先飞、让位块逐行补位)呈现拼图式填充。
 */

/** 弹性过渡时长 */
export const FLIP_DURATION_MS = 480
/**
 * 微过冲弹性曲线(仅 4% 过冲,拖拽手感但不夸张)。
 * 字面量内联而非 var():transition 简写需可被测试断言与 JS 读取,
 * 与 main.css 的 --motion-ease-rebound(cubic-bezier(0.22, 1.04, 0.36, 1))保持同值。
 */
export const FLIP_EASE = 'cubic-bezier(0.22, 1.04, 0.36, 1)'
/** 飞行结束后的清理宽限(transitionend 不触发时的兜底余量) */
const FLIGHT_CLEANUP_GRACE_MS = 150
/**
 * 只对位移不超过此行数的卡片做 FLIP:
 * 超过的位移(视口外/跨屏)直接落位——大距离动画在视口内不可见,
 * 反而制造「卡片全部飞走、大片格子空置」的中间帧(浏览器实测:全量重排可达 10 行开外)。
 */
const FLIP_MAX_DISTANCE_ROWS = 2

export interface FlipLayoutOptions extends FlipLayout {
  /** 虚拟化阈值:重排使两侧数量跨过此值时跳过动画(整页跳位场景直接落位) */
  minVirtualizedItems?: number
  /** 行距校准:每次布局一次,返回实测 rowHeight/gap;失败返回 null 用估计值 */
  calibrate?: () => { rowHeight: number; gap: number } | null
}

interface FlightRecord {
  delta: Displacement
  delay: number
  /** 播放开始时间;null = 冻结未播(被打断前的续链用) */
  startAt: number | null
  /** 兜底清理 timeout id */
  timer: number
  /** 飞行所属元素:重挂载(新元素)时旧记录失效,防止续链误用 */
  el: HTMLElement
}

/** 从当前 transform 字符串解析位移偏移(只读样式,不触发 layout) */
const parseTransformOffset = (transform: string): { x: number; y: number } => {
  if (!transform || transform === 'none') return { x: 0, y: 0 }
  const match = transform.match(/matrix(?:3d)?\(([^)]+)\)/)
  if (!match) return { x: 0, y: 0 }
  const values = match[1].split(',').map(value => parseFloat(value.trim()))
  if (values.length === 16) return { x: values[12], y: values[13] } // matrix3d
  if (values.length === 6) return { x: values[4], y: values[5] } // matrix
  return { x: 0, y: 0 }
}

/**
 * 列表重排 FLIP hook。
 * keys 为全量有序 key(过滤掉不渲染的项);序位变化时对挂载中的位移卡片做弹性补位过渡。
 * 返回「按 key 绑定的 callback ref 工厂」。
 * @example
 * const bindFlipRef = useFlipLayout(keys, { columns, columnWidth, rowHeight, gap })
 * // 渲染处(每项外层 wrapper,key 必须稳定):
 * <div key={key} ref={bindFlipRef(key)}>...</div>
 */
export function useFlipLayout(
  keys: readonly string[],
  options: FlipLayoutOptions,
): (key: string) => (element: HTMLElement | null) => void {
  const prevKeysRef = useRef<readonly string[]>([])
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map())
  const recordsRef = useRef<Map<string, FlightRecord>>(new Map())
  const pendingRafsRef = useRef<number[]>([])
  const optionsRef = useRef(options)
  optionsRef.current = options // 渲染期写入,effect 闭包读最新

  const clearFlight = useCallback((el: HTMLElement, key: string) => {
    el.style.transform = ''
    el.style.transition = ''
    el.style.willChange = ''
    el.classList.remove('flip-flight', 'flip-flight--lead')
    const record = recordsRef.current.get(key)
    if (record) {
      window.clearTimeout(record.timer)
      recordsRef.current.delete(key)
    }
  }, [])

  const bindFlipRef = useCallback(
    (key: string) =>
      (element: HTMLElement | null): (() => void) | void => {
        if (element) {
          elementsRef.current.set(key, element)
          // 元素重建（虚拟化卸载后重挂）= 干净布局：该 key 上一轮未播完的飞行记录失效，
          // 否则续链会把旧偏移全额误加到重挂卡片，freeze 到错误位置（视觉空位）
          const prevRecord = recordsRef.current.get(key)
          if (prevRecord && prevRecord.el !== element) {
            window.clearTimeout(prevRecord.timer)
            recordsRef.current.delete(key)
          }
          // 返回 cleanup:React 19 对引用变化的 ref 先调旧 cleanliness 再重设。
          // 这里只维护元素表——飞行记录不能误清:「ref 引用变化」的临时卸载
          // 对应同一元素,它的动画记录仍有效;真实重构由上方 el 身份判断兜底
          return () => {
            elementsRef.current.delete(key)
          }
        }
        // 显式 null 调用(挂载前旧引用清理,或测试直调)
        elementsRef.current.delete(key)
        return undefined
      },
    [],
  )

  useLayoutEffect(() => {
    const layout = optionsRef.current
    const prevKeys = prevKeysRef.current

    // 幂等重排(序位未变):不动画,仅推进记录
    if (sameContent(prevKeys, keys)) {
      prevKeysRef.current = keys
      return
    }

    // 跨虚拟化阈值:整页跳位场景直接落位(冷启动追加阶段少一次动画)
    const minVirtualized = layout.minVirtualizedItems
    if (minVirtualized !== undefined) {
      const prevCrossed = prevKeys.length < minVirtualized
      const curCrossed = keys.length < minVirtualized
      if (prevCrossed !== curCrossed) {
        prevKeysRef.current = keys
        return
      }
    }

    // prefers-reduced-motion:无动画
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      prevKeysRef.current = keys
      return
    }

    // 行距校准(每次布局一次;失败回退估计值,偏差 <4px/行可接受)
    let rowHeight = layout.rowHeight
    let gap = layout.gap
    const calibrated = layout.calibrate?.()
    if (calibrated) {
      rowHeight = calibrated.rowHeight
      gap = calibrated.gap
    }

    const displacements = computeDisplacements(prevKeys, keys, {
      ...layout,
      rowHeight,
      gap,
    })
    // 视口内位移才做动画:超过 FLIP_MAX_DISTANCE_ROWS 行的移动直接落位(不 freeze 不动画),
    // 避免全量重排时卡片全部飞走、格子大面积空置的中间帧
    const flipMaxDy = FLIP_MAX_DISTANCE_ROWS * rowHeight
    const moves = new Map<string, Displacement>()
    for (const [key, d] of displacements) {
      if (Math.abs(d.dy) <= flipMaxDy) moves.set(key, d)
    }
    // 无动画位移(或全部未挂载):不注册 rAF,零开销
    if (moves.size === 0) {
      prevKeysRef.current = keys
      return
    }
    const delays = staggerDelayMs(moves, layout.columns)

    // 取消上一轮 pending 帧(防连环重排的 rAF 残留)
    for (const rafId of pendingRafsRef.current) {
      cancelAnimationFrame(rafId)
    }
    pendingRafsRef.current = []

    // 冻结:定格到旧位(带续链偏移),并记录本轮飞行参数
    for (const [key, d] of moves) {
      const el = elementsRef.current.get(key)
      if (!el) continue

      // 续链:上一轮未播完的视觉偏移并入新冻结位
      let offsetX = 0
      let offsetY = 0
      const prevRecord = recordsRef.current.get(key)
      if (prevRecord) {
        if (prevRecord.startAt === null) {
          offsetX = prevRecord.delta.dx
          offsetY = prevRecord.delta.dy
        } else {
          const offset = parseTransformOffset(getComputedStyle(el).transform)
          offsetX = offset.x
          offsetY = offset.y
        }
      }

      el.style.transition = 'none'
      el.style.transform = `translate3d(${d.dx + offsetX}px, ${d.dy + offsetY}px, 0)`
      el.style.willChange = 'transform'
      el.classList.add('flip-flight')
      if (d.dy > 0) {
        el.classList.add('flip-flight--lead') // 上升卡飞行期抬升,压盖同列对穿
      }
      const delay = delays.get(key) ?? 0
      recordsRef.current.set(key, { delta: d, delay, startAt: null, timer: 0, el })
    }

    // 双 rAF 后播放(保证冻结帧至少上屏一帧)
    const raf1 = requestAnimationFrame(() => {
      pendingRafsRef.current = []
      const raf2 = requestAnimationFrame(() => {
        pendingRafsRef.current = []
        for (const [key] of moves) {
          const el = elementsRef.current.get(key)
          const record = recordsRef.current.get(key)
          if (!el || !record) continue

          el.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASE} ${record.delay}ms`
          el.style.transform = ''
          record.startAt = performance.now()

          // 逐卡清理:transitionend 优先,兜底 timeout(jsdom/隐藏页不触发 transitionend)
          const endHandler = (event: TransitionEvent) => {
            if (event.propertyName !== 'transform') return
            el.removeEventListener('transitionend', endHandler)
            clearFlight(el, key)
          }
          el.addEventListener('transitionend', endHandler, { once: true })
          record.timer = window.setTimeout(() => {
            el.removeEventListener('transitionend', endHandler)
            clearFlight(el, key)
          }, record.delay + FLIP_DURATION_MS + FLIGHT_CLEANUP_GRACE_MS)
        }
      })
      pendingRafsRef.current = [raf2]
    })
    pendingRafsRef.current = [raf1]

    prevKeysRef.current = keys
  }, [clearFlight, keys])

  // 卸载清理:pending 帧、全部飞行记录与类
  useLayoutEffect(() => {
    // 拷贝引用供 cleanup 读取(卸载后 ref 不再变化,消除 exhaustive-deps 误报)
    const pendingRafs = pendingRafsRef.current
    const records = recordsRef.current
    const elements = elementsRef.current
    return () => {
      for (const rafId of pendingRafs) {
        cancelAnimationFrame(rafId)
      }
      pendingRafsRef.current = []
      for (const [key, record] of records) {
        window.clearTimeout(record.timer)
        const el = elements.get(key)
        if (el) {
          el.classList.remove('flip-flight', 'flip-flight--lead')
        }
      }
      records.clear()
    }
  }, [])

  return bindFlipRef
}