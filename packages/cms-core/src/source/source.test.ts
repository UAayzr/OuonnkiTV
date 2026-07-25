import { describe, expect, it, vi } from 'vitest'
import type { SourceStore, VideoSource } from '../types'
import {
  addSource,
  deselectAllSources,
  getEnabledSources,
  getSource,
  removeSource,
  resetSources,
  selectAllSources,
  toggleSource,
  updateSource,
} from './store'
import { allValid, validateSource, validateSources } from './validator'
import { exportSources, importSources, parseSourcesFromJson, parseSourcesFromUrl } from './importer'

const source: VideoSource = {
  id: 'one',
  name: '源一',
  url: 'https://one.example.com',
  isEnabled: true,
}

describe('视频源校验和导入', () => {
  it('返回所有字段的清楚错误', () => {
    const result = validateSource({ name: ' ', url: 'not-a-url', timeout: -1, retry: -2 })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      '源名称不能为空',
      '源URL格式无效',
      '超时时间必须为非负数',
      '重试次数必须为非负数',
    ])
  })

  it('批量校验能判断是否全部有效', () => {
    const results = validateSources([source, { name: '', url: '' }])
    expect(allValid(results)).toBe(false)
    expect(allValid([validateSource(source)])).toBe(true)
  })

  it('导入时补默认值、跳过坏数据和重复数据', () => {
    const initial: SourceStore = { sources: [source], version: 1 }
    const { store, result } = importSources(
      initial,
      [
        { name: '源二', url: 'https://two.example.com' },
        { name: '源一', url: 'https://one.example.com' },
        { name: '', url: 'bad' },
      ],
      { defaultTimeout: 5000, defaultRetry: 2 },
    )

    expect(result).toMatchObject({ success: true, imported: 1, skipped: 2 })
    expect(store.sources[1]).toMatchObject({
      name: '源二',
      detailUrl: 'https://two.example.com',
      timeout: 5000,
      retry: 2,
      isEnabled: true,
    })
  })

  it('解析单个、数组、带引号文本和远程内容', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(parseSourcesFromJson(`'{"name":"单个","url":"https://one.example"}'`)).toHaveLength(1)
    expect(parseSourcesFromJson('[{"name":"一","url":"https://one.example"}]')).toHaveLength(1)
    expect(parseSourcesFromJson('{bad json')).toEqual([])

    const fetchFn = vi.fn(async () => new Response('[{"name":"远程","url":"https://remote.example"}]'))
    await expect(parseSourcesFromUrl('https://config.example/sources.json', fetchFn)).resolves.toHaveLength(1)
  })
})

describe('视频源存储操作', () => {
  it('添加、更新、切换、查询和删除时不修改旧对象', () => {
    const empty: SourceStore = { sources: [], version: 1 }
    const added = addSource(empty, source)
    const updated = updateSource(added, 'one', { name: '新名称' })
    const toggled = toggleSource(updated, 'one')
    const removed = removeSource(toggled, 'one')

    expect(empty.sources).toEqual([])
    expect(getSource(updated, 'one')?.name).toBe('新名称')
    expect(getEnabledSources(toggled)).toEqual([])
    expect(removed.sources).toEqual([])
  })

  it('支持全选、全不选、重置和安全导出', () => {
    const store = resetSources([source, { ...source, id: 'two', name: '源二', isEnabled: false }])
    expect(selectAllSources(store).sources.every(item => item.isEnabled)).toBe(true)
    expect(deselectAllSources(store).sources.every(item => !item.isEnabled)).toBe(true)

    const exported = exportSources(store)
    exported[0].name = '外部修改'
    expect(store.sources[0].name).toBe('源一')
  })
})
