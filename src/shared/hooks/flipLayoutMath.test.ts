import { describe, expect, it } from 'vitest'
import {
  STAGGER_MAX_STEPS,
  STAGGER_STEP_MS,
  computeDisplacements,
  sameContent,
  staggerDelayMs,
  type Displacement,
  type FlipLayout,
} from './flipLayoutMath'

const LAYOUT: FlipLayout = { columns: 2, columnWidth: 100, gap: 10, rowHeight: 150 }

/* ---------- computeDisplacements ---------- */

describe('computeDisplacements', () => {
  it('单列换位:上移卡 dy 为正,下移卡 dy 为负', () => {
    const map = computeDisplacements(['a', 'b'], ['b', 'a'], { ...LAYOUT, columns: 1 })
    // b 从第 1 行上移到第 0 行 → dy=(1-0)*150=+150(冻结时向下补回旧位)
    expect(map.get('b')).toMatchObject({ dx: 0, dy: 150, newIdx: 0 })
    expect(map.get('a')).toMatchObject({ dx: 0, dy: -150, newIdx: 1 })
  })

  it('多列横移:dx = ±stepX = columnWidth + gap', () => {
    // 4 项 2 列:同一行内左右互换 → 列差为 ∓1
    const map = computeDisplacements(['a', 'b', 'c', 'd'], ['b', 'a', 'd', 'c'], LAYOUT)
    expect(map.get('a')).toMatchObject({ dx: -110, dy: 0 }) // a(0,0)→(0,1):dx=(0-1)*110
    expect(map.get('b')).toMatchObject({ dx: 110, dy: 0 })
    expect(map.get('c')).toMatchObject({ dx: -110, dy: 0 })
    expect(map.get('d')).toMatchObject({ dx: 110, dy: 0 })
  })

  it('行列混合:整行换位时四张卡都动', () => {
    // ['a','b','c','d'] → ['c','d','a','b']:a/b 下移一行,c/d 上移一行
    const map = computeDisplacements(['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b'], LAYOUT)
    expect(map.get('a')).toMatchObject({ dx: 0, dy: -150 })
    expect(map.get('b')).toMatchObject({ dx: 0, dy: -150 })
    expect(map.get('c')).toMatchObject({ dx: 0, dy: 150 })
    expect(map.get('d')).toMatchObject({ dx: 0, dy: 150 })
  })

  it('整除边界:单列三连上移时首位位移两行', () => {
    // c 从行 2 上移到行 0 → dy=(2-0)*150=+300
    const map = computeDisplacements(['a', 'b', 'c'], ['c', 'a', 'b'], { ...LAYOUT, columns: 1 })
    expect(map.get('c')).toMatchObject({ dy: 300 })
    expect(map.get('a')).toMatchObject({ dy: -150 })
    expect(map.get('b')).toMatchObject({ dy: -150 })
  })

  it('新入场/已离场 key 跳过', () => {
    const map = computeDisplacements(['a', 'b'], ['a', 'c'], LAYOUT)
    expect(map.has('b')).toBe(false) // 离场
    expect(map.has('c')).toBe(false) // 入场
    expect(map.has('a')).toBe(false) // 位置不变
  })

  it('亚像素位移(<0.5px)过滤', () => {
    const map = computeDisplacements(['a'], ['a'], LAYOUT)
    expect(map.size).toBe(0)
  })

  it('幂等 keys(内容相同的新数组)返回空表', () => {
    expect(computeDisplacements(['a', 'b'], ['a', 'b'], LAYOUT).size).toBe(0)
    expect(sameContent(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameContent(['a', 'b'], ['b', 'a'])).toBe(false)
  })

  it('网格参数化:4 列与 8 列下位移正确', () => {
    const layout4: FlipLayout = { columns: 4, columnWidth: 50, gap: 10, rowHeight: 100 }
    // 8 项 4 列:后 4 项上移一行 → dy 为正;前 4 项下移 → dy 为负
    const map4 = computeDisplacements(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      ['e', 'f', 'g', 'h', 'a', 'b', 'c', 'd'],
      layout4,
    )
    expect(map4.get('a')).toMatchObject({ dx: 0, dy: -100 })
    expect(map4.get('e')).toMatchObject({ dx: 0, dy: 100 })

    const layout8: FlipLayout = { columns: 8, columnWidth: 30, gap: 5, rowHeight: 80 }
    const map8 = computeDisplacements(
      Array.from({ length: 16 }, (_, i) => `k${i}`),
      Array.from({ length: 16 }, (_, i) => `k${(i + 8) % 16}`),
      layout8,
    )
    expect(map8.get('k0')).toMatchObject({ dy: -80 })
    expect(map8.get('k8')).toMatchObject({ dy: 80 })
  })
})

/* ---------- staggerDelayMs ---------- */

describe('staggerDelayMs', () => {
  it('上升卡(dy>0)delay 0;让位卡按落点行 20ms 级联', () => {
    // 单列 4 项:c,d 上移两行(上升卡);a,b 下移(让位卡)
    const map = computeDisplacements(['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b'], {
      ...LAYOUT,
      columns: 1,
    })
    const delays = staggerDelayMs(map, 1)
    expect(delays.get('c')).toBe(0) // 上升
    expect(delays.get('d')).toBe(0)
    // 让位:a 落行 2、b 落行 3 → 层 0、1
    expect(delays.get('a')).toBe(0)
    expect(delays.get('b')).toBe(STAGGER_STEP_MS)
  })

  it('同一落点行同拍(含行内横移)', () => {
    const map = computeDisplacements(['a', 'b', 'c', 'd'], ['b', 'a', 'c', 'd'], LAYOUT)
    const delays = staggerDelayMs(map, 2)
    expect(delays.get('a')).toBe(delays.get('b')) // 都在第 0 行同拍
  })

  it('封顶 7 层(140ms)', () => {
    // 单列 8 项全部下移一行(让位卡,dy 为负)→ 落点行 0..7 → 层 0..6
    const map = new Map<string, Displacement>([
      ['k0', { dx: 0, dy: -150, newIdx: 1 }],
      ['k1', { dx: 0, dy: -150, newIdx: 2 }],
      ['k2', { dx: 0, dy: -150, newIdx: 3 }],
      ['k3', { dx: 0, dy: -150, newIdx: 4 }],
      ['k4', { dx: 0, dy: -150, newIdx: 5 }],
      ['k5', { dx: 0, dy: -150, newIdx: 6 }],
      ['k6', { dx: 0, dy: -150, newIdx: 7 }],
      ['k7', { dx: 0, dy: -150, newIdx: 8 }],
    ])
    const delays = staggerDelayMs(map, 1)
    const maxDelay = Math.max(...delays.values())
    expect(maxDelay).toBe((STAGGER_MAX_STEPS - 1) * STAGGER_STEP_MS)
  })
})