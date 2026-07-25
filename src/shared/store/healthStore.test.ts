import { beforeEach, describe, expect, it } from 'vitest'
import { useHealthStore } from './healthStore'

beforeEach(() => {
  useHealthStore.setState({ results: {} })
})

describe('视频源健康状态', () => {
  it('设置单个结果时保留未修改字段', () => {
    useHealthStore.getState().setResult('one', { status: 'online', latency: 120 })
    useHealthStore.getState().setResult('one', { checkedAt: 1000 })
    expect(useHealthStore.getState().results.one).toEqual({
      status: 'online',
      latency: 120,
      errorMessage: null,
      checkedAt: 1000,
    })
  })

  it('支持批量标记检测中和全部清空', () => {
    useHealthStore.getState().setManyTesting(['one', 'two'])
    expect(useHealthStore.getState().results.one.status).toBe('testing')
    expect(useHealthStore.getState().results.two.status).toBe('testing')
    useHealthStore.getState().clearAll()
    expect(useHealthStore.getState().results).toEqual({})
  })
})
