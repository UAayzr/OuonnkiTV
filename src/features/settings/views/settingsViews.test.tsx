import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingStore } from '@/shared/store/settingStore'

vi.mock('../components/common', () => ({
  SettingsPageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsSection: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  SettingsItem: ({ title, control }: { title: string; control: ReactNode }) => <div><span>{title}</span>{control}</div>,
}))
vi.mock('../components/VideoSource', () => ({ default: () => <div>视频源列表</div> }))
vi.mock('../components/VideoSource/SubscriptionManager', () => ({ default: () => <div>订阅管理</div> }))
vi.mock('../components/PlaybackSettings', () => ({ default: () => <div>播放设置内容</div> }))
vi.mock('../components/PersonalConfig', () => ({ default: () => <div>个人配置内容</div> }))
vi.mock('../components/AboutProject', () => ({ default: () => <div>项目说明内容</div> }))
vi.mock('../components/NetworkSettings', () => ({ default: () => <div>网络设置</div> }))
vi.mock('../components/SearchSettings', () => ({ default: () => <div>搜索设置</div> }))
vi.mock('../components/ThemeSettings', () => ({ default: () => <div>主题设置</div> }))
vi.mock('@/shared/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) => (
    <button aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>切换</button>
  ),
}))

import SourceSettings from './SourceSettings'
import PlaybackSettings from './PlaybackSettings'
import SystemSettings from './SystemSettings'
import PersonalConfigSettings from './PersonalConfigSettings'
import AboutSettings from './AboutSettings'

beforeEach(() => {
  useSettingStore.getState().resetSettings()
})

describe('设置页面', () => {
  it('显示视频源、播放、个人配置和项目说明页面', () => {
    const { rerender } = render(<SourceSettings />)
    expect(screen.getByText('订阅管理')).toBeInTheDocument()
    expect(screen.getByText('视频源列表')).toBeInTheDocument()
    rerender(<PlaybackSettings />)
    expect(screen.getByText('播放设置内容')).toBeInTheDocument()
    rerender(<PersonalConfigSettings />)
    expect(screen.getByText('个人配置内容')).toBeInTheDocument()
    rerender(<AboutSettings />)
    expect(screen.getByText('项目说明内容')).toBeInTheDocument()
  })

  it('系统页显示各设置模块并可修改开关', async () => {
    const user = userEvent.setup()
    render(<SystemSettings />)
    expect(screen.getByText('网络设置')).toBeInTheDocument()
    expect(screen.getByText('搜索设置')).toBeInTheDocument()
    expect(screen.getByText('主题设置')).toBeInTheDocument()
    const switches = screen.getAllByRole('button', { name: '切换' })
    await user.click(switches[0])
    expect(useSettingStore.getState().system.isUpdateLogEnabled).toBe(true)
  })
})
