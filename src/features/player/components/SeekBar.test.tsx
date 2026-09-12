import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SeekBar } from './SeekBar'

const mockRect = (width = 100) => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: width,
    top: 0,
    bottom: 10,
    width,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

const renderBar = (props: Partial<Parameters<typeof SeekBar>[0]> = {}) => {
  const onSeek = vi.fn()
  const onScrubChange = vi.fn()
  render(
    <SeekBar
      currentTime={30}
      duration={120}
      bufferedRanges={[]}
      onSeek={onSeek}
      onScrubChange={onScrubChange}
      {...props}
    />,
  )
  return { onSeek, onScrubChange }
}

describe('SeekBar', () => {
  it('按当前时间渲染无障碍进度', () => {
    renderBar()
    const slider = screen.getByRole('slider', { name: '播放进度' })
    expect(slider).toHaveAttribute('aria-valuenow', '30')
    expect(slider).toHaveAttribute('aria-valuemax', '120')
  })

  it('点击进度条触发 onSeek（按坐标比例映射）', () => {
    mockRect(200)
    const { onSeek } = renderBar()

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 })

    // 100/200 * 120 = 60
    expect(onSeek).toHaveBeenCalledWith(60)
  })

  it('拖拽中不立即 seek，松手后才 seek', () => {
    mockRect(200)
    const { onSeek } = renderBar()

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.pointerDown(slider, { clientX: 20, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 })
    expect(onSeek).not.toHaveBeenCalled()

    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 })
    // 100/200 * 120 = 60
    expect(onSeek).toHaveBeenCalledWith(60)
  })

  it('拖拽中播放头与已播进度跟随光标，而不是停留在真实播放进度', () => {
    mockRect(200)
    renderBar({ currentTime: 30, duration: 120 })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    const thumb = screen.getByTestId('seek-thumb')
    const played = screen.getByTestId('seek-played')

    // 初始 30/120 = 25%
    expect(thumb.style.left).toBe('25%')
    expect(played.style.width).toBe('25%')

    fireEvent.pointerDown(slider, { clientX: 20, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 150, pointerId: 1 })

    // 150/200 * 120 = 90 → 75%
    expect(thumb.style.left).toBe('75%')
    expect(played.style.width).toBe('75%')
  })

  it('缓冲按真实 TimeRange 渲染（seek 后不会从 0 重新铺满）', () => {
    renderBar({ bufferedRanges: [{ start: 40, end: 80 }], duration: 120 })

    const bars = screen.getAllByTestId('seek-buffered')
    expect(bars).toHaveLength(1)
    expect(bars[0].style.left).toBe(`${(40 / 120) * 100}%`)
    expect(bars[0].style.width).toBe(`${((80 - 40) / 120) * 100}%`)
  })

  it('多段缓冲区间分别渲染', () => {
    renderBar({
      bufferedRanges: [
        { start: 0, end: 20 },
        { start: 60, end: 100 },
      ],
      duration: 120,
    })
    expect(screen.getAllByTestId('seek-buffered')).toHaveLength(2)
  })

  it('拖拽目标与当前播放位置几乎重合时不 seek（防误触）', () => {
    mockRect(200)
    const { onSeek } = renderBar({ currentTime: 30, duration: 120 })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    // 50/200 * 120 = 30，与当前播放位置重合
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 50, pointerId: 1 })

    expect(onSeek).not.toHaveBeenCalled()
  })

  it('拖拽期间上报 scrubbing 状态，松手上报结束', () => {
    mockRect(200)
    const { onScrubChange } = renderBar()

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 })
    expect(onScrubChange).toHaveBeenLastCalledWith(60)

    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 })
    expect(onScrubChange).toHaveBeenLastCalledWith(null)
  })

  it('disabled 时不响应点击', () => {
    mockRect(200)
    const { onSeek } = renderBar({ disabled: true })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 })

    expect(onSeek).not.toHaveBeenCalled()
  })

  it('hover 时显示时间气泡预览', () => {
    mockRect(200)
    renderBar()

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1, pointerType: 'mouse' })

    // 100/200 * 120 = 60 → 1:00
    expect(screen.getByText('1:00')).toBeInTheDocument()
  })

  it('键盘方向键可跳转', () => {
    const { onSeek } = renderBar({ currentTime: 30, duration: 120 })
    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenCalledWith(35)

    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSeek).toHaveBeenCalledWith(0)
  })
})
