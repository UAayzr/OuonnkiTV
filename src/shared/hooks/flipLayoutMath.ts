/*
 * FLIP 位置推算的纯数学:卡片在 grid 中的位置由序位与布局参数直接计算,
 * 零 DOM 测量、零 reflow。位移 = (旧位 - 新位),grid 原点在减法中抵消,
 * 与滚动、虚拟化窗口、容器偏移无关。
 */

export interface FlipLayout {
  /** 列数 */
  columns: number
  /** 列宽 */
  columnWidth: number
  /** 行距(卡片块高 + 行 gap) */
  rowHeight: number
  /** 列 gap(与 CSS gap 一致) */
  gap: number
}

export interface Displacement {
  /** 列方向位移(旧-新,px) */
  dx: number
  /** 行方向位移(旧-新,px) */
  dy: number
  /** 新序位 */
  newIdx: number
}

/** 亚像素位移阈值 */
const EPSILON = 0.5

/** 内容相同检测(幂等重排 → 无位移) */
export function sameContent(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * 计算新旧序位间的位移矩阵。
 * 只含「新旧都存在的 key 且位移 ≥0.5px」;新入场/已离场跳过。
 */
export function computeDisplacements(
  prevKeys: readonly string[],
  keys: readonly string[],
  layout: FlipLayout,
): Map<string, Displacement> {
  const result = new Map<string, Displacement>()
  if (sameContent(prevKeys, keys)) return result

  const { columns, columnWidth, rowHeight, gap } = layout
  const stepX = columnWidth + gap
  const prevIndex = new Map<string, number>()
  for (let index = 0; index < prevKeys.length; index += 1) {
    prevIndex.set(prevKeys[index], index)
  }

  for (let newIdx = 0; newIdx < keys.length; newIdx += 1) {
    const key = keys[newIdx]
    const oldIdx = prevIndex.get(key)
    if (oldIdx === undefined) continue // 新入场:无旧位

    const oldRow = Math.floor(oldIdx / columns)
    const oldCol = oldIdx % columns
    const newRow = Math.floor(newIdx / columns)
    const newCol = newIdx % columns

    const dx = (oldCol - newCol) * stepX
    const dy = (oldRow - newRow) * rowHeight
    if (Math.abs(dx) + Math.abs(dy) < EPSILON) continue
    result.set(key, { dx, dy, newIdx })
  }
  return result
}

/** 错峰步长:让位块每行级联延迟 */
export const STAGGER_STEP_MS = 20
/** 错峰封顶层数(140ms 上限,覆盖 2-8 列整屏传导) */
export const STAGGER_MAX_STEPS = 7

/**
 * 方向分道错峰:
 * - 上升卡(dy > 0,新位在上方)delay 0——整块起飞,不拉伸;
 * - 让位卡(dy ≤ 0,含同行横移)按【落点行】从最小行起 20ms/行级联,
 *   同一落点行同拍;逐行传导 = 拼图填充补位。封顶 7 层。
 */
export function staggerDelayMs(
  displacements: Map<string, Displacement>,
  columns: number,
): Map<string, number> {
  const result = new Map<string, number>()

  // 让位卡的落点行按升序编层
  const rowLayer = new Map<number, number>()
  let nextLayer = 0
  const rows = new Set<number>()
  for (const d of displacements.values()) {
    if (d.dy > 0) continue
    rows.add(Math.floor(d.newIdx / columns))
  }
  for (const row of [...rows].sort((a, b) => a - b)) {
    rowLayer.set(row, Math.min(nextLayer, STAGGER_MAX_STEPS - 1))
    nextLayer += 1
  }

  for (const [key, d] of displacements) {
    if (d.dy > 0) {
      result.set(key, 0)
    } else {
      const row = Math.floor(d.newIdx / columns)
      result.set(key, (rowLayer.get(row) ?? STAGGER_MAX_STEPS - 1) * STAGGER_STEP_MS)
    }
  }
  return result
}
