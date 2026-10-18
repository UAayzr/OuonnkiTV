import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FLIP_DURATION_MS,
  FLIP_EASE,
  useFlipLayout,
  type FlipLayoutOptions,
} from './useFlipLayout'

/* ---------- rAF 控制 ---------- */

let rafQueue: Array<() => void> = []

const flushRaf = () => {
  const callbacks = rafQueue
  rafQueue = []
  for (const callback of callbacks) {
    callback()
  }
}

beforeEach(() => {
  rafQueue = []
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    rafQueue.push(callback)
    return rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ---------- 测试工具 ---------- */

/** 与 flipLayoutMath 单测同款布局:2 列、列宽 100、gap 10、行高 150 */
const BASE_LAYOUT: FlipLayoutOptions = { columns: 2, columnWidth: 100, rowHeight: 150, gap: 10 }

const TestList = ({
  keys,
  options = BASE_LAYOUT,
}: {
  keys: string[]
  options?: FlipLayoutOptions
}) => {
  const bindFlipRef = useFlipLayout(keys, options)
  return (
    <div>
      {keys.map(key => (
        <div key={key} ref={bindFlipRef(key)}>
          {key}
        </div>
      ))}
    </div>
  )
}

const renderList = (keys: string[], options?: FlipLayoutOptions) => {
  const view = render(<TestList keys={keys} options={options} />)
  return {
    rerenderKeys: (nextKeys: string[], nextOptions?: FlipLayoutOptions) =>
      view.rerender(<TestList keys={nextKeys} options={nextOptions ?? options} />),
    container: view.container,
  }
}

const wrapperOf = (container: HTMLElement, id: string): HTMLElement => {
  const grid = container.querySelector('div > div')
  const found = Array.from(grid?.children ?? []).find(el => el.textContent === id)
  if (!found) throw new Error(`wrapper ${id} not found`)
  return found as HTMLElement
}

/** 播放中断后的清理(模拟 transitionend 不触发,由兜底 timeout 收尾) */
const playAll = () => {
  act(() => {
    flushRaf()
  })
  act(() => {
    flushRaf()
  })
}

/* ---------- 用例 ---------- */

describe('useFlipLayout v2', () => {
  it('初次渲染不产生 transform', () => {
    const { container } = renderList(['a', 'b', 'c', 'd'])
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(wrapperOf(container, id).style.transform).toBe('')
    }
  })

  it('重排后:按公式定格旧位,双 rAF 后弹性转场', () => {
    const { container, rerenderKeys } = renderList(['a', 'b', 'c', 'd'])
    const elA = wrapperOf(container, 'a')

    // a(0,0)→(1,0):dy=(0-1)*150=-150(下移,冻结向上补)
    rerenderKeys(['c', 'd', 'a', 'b'])
    expect(elA.style.transform).toBe('translate3d(0px, -150px, 0)')
    expect(elA.style.transition).toBe('none')
    expect(elA.style.willChange).toBe('transform')
    expect(elA.classList.contains('flip-flight')).toBe(true)

    // 双 rAF 后:清除 transform 触发弹性过渡
    playAll()
    expect(elA.style.transform).toBe('')
    expect(elA.style.transition).toBe(
      `transform ${FLIP_DURATION_MS}ms ${FLIP_EASE} 0ms`,
    )
    // c 是上升卡(dy=+150)→ flip-flight--lead
    expect(wrapperOf(container, 'c').classList.contains('flip-flight--lead')).toBe(true)
  })

  it('错峰:让位卡按落点行级联 delay(单列场景)', () => {
    const single: FlipLayoutOptions = { ...BASE_LAYOUT, columns: 1 }
    const { container, rerenderKeys } = renderList(['a', 'b', 'c', 'd'], single)
    rerenderKeys(['c', 'd', 'a', 'b'])

    // 上升卡(c,d)delay 0;让位卡 a 落行 2(层 0)、b 落行 3(层 1 → 20ms)
    playAll()
    expect(wrapperOf(container, 'c').style.transition).toContain(' 0ms')
    expect(wrapperOf(container, 'a').style.transition).toContain(' 0ms')
    expect(wrapperOf(container, 'b').style.transition).toContain(' 20ms')
  })

  it('幂等重排(内容相同的新数组)不触发动画', () => {
    const { container, rerenderKeys } = renderList(['a', 'b'])
    rerenderKeys(['a', 'b'])
    expect(wrapperOf(container, 'a').style.transform).toBe('')
    expect(rafQueue).toHaveLength(0)
  })

  it('新入场卡片不 FLIP,其余无位移不 FLIP', () => {
    const { container, rerenderKeys } = renderList(['a'])
    rerenderKeys(['a', 'c']) // c 入场、a 位置不变
    playAll()
    expect(wrapperOf(container, 'a').style.transform).toBe('')
    expect(wrapperOf(container, 'c').style.transform).toBe('')
  })

  it('calibrate 覆盖行高与 gap', () => {
    const calibrate = () => ({ rowHeight: 200, gap: 20 }) // 实测行距
    const { container, rerenderKeys } = renderList(
      ['a', 'b', 'c', 'd'],
      { ...BASE_LAYOUT, calibrate },
    )
    rerenderKeys(['c', 'd', 'a', 'b'])
    // a dy = (0-1) × 200 = -200
    expect(wrapperOf(container, 'a').style.transform).toBe('translate3d(0px, -200px, 0)')
  })

  it('跨虚拟化阈值时跳过动画直接落位', () => {
    const options: FlipLayoutOptions = { ...BASE_LAYOUT, minVirtualizedItems: 4 }
    const { container, rerenderKeys } = renderList(['a', 'b', 'c'], options)
    // 3 → 5 跨过阈值 4
    rerenderKeys(['e', 'f', 'g', 'h', 'i'])
    expect(wrapperOf(container, 'e').style.transform).toBe('')
    expect(rafQueue).toHaveLength(0)
  })

  it('超过 2 行的大位移跳过动画直接落位(视口外不制造空位)', () => {
    const single: FlipLayoutOptions = { ...BASE_LAYOUT, columns: 1 }
    const { container, rerenderKeys } = renderList(['a', 'b', 'c', 'd', 'e', 'f'], single)
    // 单列翻转:a 从行 0 下移到行 5(dy=-750,超 2 行阈值)→ 不 freeze 不动画;
    // b-f 各上移一行(dy=+150)→ 正常动画
    rerenderKeys(['b', 'c', 'd', 'e', 'f', 'a'])
    const elA = wrapperOf(container, 'a')
    expect(elA.style.transform).toBe('')
    expect(elA.classList.contains('flip-flight')).toBe(false)

    playAll()
    // 上升卡 b 正常飞(dy=+150)
    expect(wrapperOf(container, 'b').style.transform).toBe('')
    expect(wrapperOf(container, 'b').style.transition).toContain(
      `transform ${FLIP_DURATION_MS}ms ${FLIP_EASE}`,
    )
  })

  it('恰好等于 2 行的位移仍做动画(阈值边界)', () => {
    const single: FlipLayoutOptions = { ...BASE_LAYOUT, columns: 1 }
    const { container, rerenderKeys } = renderList(['a', 'b', 'c'], single)
    // a 从行 0 下移到行 2:dy=-300 = 2 行 → 阈值内,正常 freeze
    rerenderKeys(['b', 'c', 'a'])
    expect(wrapperOf(container, 'a').style.transform).toBe('translate3d(0px, -300px, 0)')
  })

  it('prefers-reduced-motion 时不播放动画', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const { container, rerenderKeys } = renderList(['a', 'b'])
    rerenderKeys(['b', 'a'])
    expect(wrapperOf(container, 'b').style.transform).toBe('')
    expect(rafQueue).toHaveLength(0)
  })

  it('transitionend 后清理飞行状态', () => {
    const { container, rerenderKeys } = renderList(['a', 'b'])
    rerenderKeys(['b', 'a'])
    playAll()
    const elB = wrapperOf(container, 'b')

    act(() => {
      elB.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }))
    })
    expect(elB.classList.contains('flip-flight')).toBe(false)
    expect(elB.style.willChange).toBe('')
    expect(elB.style.transition).toBe('')
  })

  it('兜底 timeout 清理(transitionend 不触发时)', () => {
    vi.useFakeTimers()
    const { container, rerenderKeys } = renderList(['a', 'b'])
    act(() => {
      rerenderKeys(['b', 'a'])
    })
    act(() => {
      flushRaf()
      flushRaf()
    })
    const elB = wrapperOf(container, 'b')
    expect(elB.classList.contains('flip-flight')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(FLIP_DURATION_MS + 200)
    })
    expect(elB.classList.contains('flip-flight')).toBe(false)
    expect(elB.style.transform).toBe('')
    vi.useRealTimers()
  })

  it('续链:冻结未播时被打断,新冻结位并入旧偏移全额', () => {
    const single: FlipLayoutOptions = { ...BASE_LAYOUT, columns: 1 }
    const { container, rerenderKeys } = renderList(['a', 'b', 'c'], single)

    // 第一轮:a 从行 0 下移到行 1(dy=-150),冻结但未到播放帧
    rerenderKeys(['c', 'a', 'b'])
    const elA = wrapperOf(container, 'a')
    expect(elA.style.transform).toBe('translate3d(0px, -150px, 0)')

    // 第二轮(冻结未播):a 继续下移到行 2(新 dy=-150)
    rerenderKeys(['c', 'b', 'a'])
    // 旧偏移全额 -150 并入新冻结 → -150 + (-150) = -300
    expect(elA.style.transform).toBe('translate3d(0px, -300px, 0)')
  })
})