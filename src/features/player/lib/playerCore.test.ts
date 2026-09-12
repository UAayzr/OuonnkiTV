import { describe, expect, it } from 'vitest'
import { BARE_PLAYER_OPTIONS, isPlayerControlTarget } from './playerCore'

describe('playerCore', () => {
  describe('isPlayerControlTarget', () => {
    it('控制条内的按钮被识别为控制目标（手势放行）', () => {
      const root = document.createElement('div')
      root.className = 'oki-player-controls'
      const button = document.createElement('button')
      root.appendChild(button)

      expect(isPlayerControlTarget(button)).toBe(true)
    })

    it('video 画面本身不是控制目标（画面手势接管）', () => {
      const video = document.createElement('video')
      expect(isPlayerControlTarget(video)).toBe(false)
    })

    it('滑块与输入框均放行', () => {
      const slider = document.createElement('div')
      slider.setAttribute('role', 'slider')
      const input = document.createElement('input')

      expect(isPlayerControlTarget(slider)).toBe(true)
      expect(isPlayerControlTarget(input)).toBe(true)
    })

    it('空目标安全返回 false', () => {
      expect(isPlayerControlTarget(null)).toBe(false)
      expect(isPlayerControlTarget(document)).toBe(false)
    })
  })

  describe('BARE_PLAYER_OPTIONS', () => {
    it('关闭全部默认皮肤与内置交互', () => {
      expect(BARE_PLAYER_OPTIONS.controls).toEqual([])
      expect(BARE_PLAYER_OPTIONS.setting).toBe(false)
      expect(BARE_PLAYER_OPTIONS.contextmenu).toEqual([])
      expect(BARE_PLAYER_OPTIONS.gesture).toBe(false)
      expect(BARE_PLAYER_OPTIONS.fastForward).toBe(false)
      expect(BARE_PLAYER_OPTIONS.lock).toBe(false)
      expect(BARE_PLAYER_OPTIONS.miniProgressBar).toBe(false)
      expect(BARE_PLAYER_OPTIONS.subtitleOffset).toBe(false)
    })
  })
})
