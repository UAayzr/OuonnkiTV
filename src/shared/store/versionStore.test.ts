import { beforeEach, describe, expect, it } from 'vitest'
import { useVersionStore } from './versionStore'

beforeEach(() => {
  localStorage.clear()
  useVersionStore.setState({ currentVersion: '2.0.4', lastViewedVersion: '1.0.0', showUpdateModal: false })
})

describe('版本状态', () => {
  it('识别新版本并记录已查看版本', () => {
    expect(useVersionStore.getState().hasNewVersion()).toBe(true)
    useVersionStore.getState().setShowUpdateModal(true)
    useVersionStore.getState().markVersionAsViewed('2.0.4')
    expect(useVersionStore.getState()).toMatchObject({
      lastViewedVersion: '2.0.4',
      showUpdateModal: false,
    })
    expect(useVersionStore.getState().hasNewVersion()).toBe(false)
  })

  it('能获取当前版本的更新说明', () => {
    expect(useVersionStore.getState().getLatestUpdate()).toMatchObject({ version: '2.0.4' })
    useVersionStore.getState().setCurrentVersion('missing')
    expect(useVersionStore.getState().getLatestUpdate()).toBeNull()
  })
})
