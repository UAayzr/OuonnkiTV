import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingStore } from '@/shared/store/settingStore'

vi.mock('@/shared/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }) => (
    <button type="button" aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>
      开关
    </button>
  ),
}))

import NetworkSettings from './NetworkSettings'
import SearchSettings from './SearchSettings'

function getInput(container: HTMLElement, selector: string) {
  const input = container.querySelector<HTMLInputElement>(selector)
  if (!input) {
    throw new Error('找不到输入框：' + selector)
  }
  return input
}

beforeEach(() => {
  useSettingStore.getState().resetSettings()
})

describe('设置组件', () => {
  it('网络设置可以修改代理、超时、重试和并发', async () => {
    const user = userEvent.setup()
    const { container } = render(<NetworkSettings />)

    expect(screen.getByText('网络设置')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开关' }))
    expect(useSettingStore.getState().network.isProxyEnabled).toBe(false)

    const proxyInput = getInput(container, '#proxyUrl')
    await user.clear(proxyInput)
    await user.type(proxyInput, '/api/proxy?url=')
    expect(useSettingStore.getState().network.proxyUrl).toBe('/api/proxy?url=')

    const timeoutInput = getInput(container, '#timeout')
    fireEvent.change(timeoutInput, { target: { value: '4500' } })
    expect(useSettingStore.getState().network.defaultTimeout).toBe(4500)

    const retryInput = getInput(container, '#retry')
    fireEvent.change(retryInput, { target: { value: '2' } })
    expect(useSettingStore.getState().network.defaultRetry).toBe(2)

    const concurrencyInput = getInput(container, '#concurrency')
    fireEvent.change(concurrencyInput, { target: { value: '5' } })
    expect(useSettingStore.getState().network.concurrencyLimit).toBe(5)
  })

  it('搜索设置可以修改两个开关和历史数量上限', async () => {
    const user = userEvent.setup()
    const { container } = render(<SearchSettings />)

    expect(screen.getByText('搜索设置')).toBeInTheDocument()

    const switches = screen.getAllByRole('button', { name: '开关' })
    await user.click(switches[0])
    await user.click(switches[1])
    expect(useSettingStore.getState().search.isSearchHistoryEnabled).toBe(false)
    expect(useSettingStore.getState().search.isSearchHistoryVisible).toBe(false)

    const countInput = getInput(container, 'input[type="number"]')
    fireEvent.change(countInput, { target: { value: '35' } })
    expect(useSettingStore.getState().search.maxSearchHistoryCount).toBe(35)
  })
})
