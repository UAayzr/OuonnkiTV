import { describe, expect, it } from 'vitest'
import { buildCmsPlayPath } from '@/shared/lib/routes'
import { INVALID_PLAYER_ROUTE_MESSAGE, validatePlayerRoute } from './playerRoute'

describe('validatePlayerRoute', () => {
  it('CMS 路由参数合法时返回 cms 模式', () => {
    const result = validatePlayerRoute({
      sourceCode: 'source-a',
      vodId: 'vod-1',
    })

    expect(result).toEqual({
      isValid: true,
      mode: 'cms',
      sourceCode: 'source-a',
      vodId: 'vod-1',
    })
  })

  it('缺少 CMS 参数会判定为无效路由', () => {
    const result = validatePlayerRoute({
      sourceCode: 'source-a',
    })

    expect(result).toEqual({
      isValid: false,
      mode: 'invalid',
      message: INVALID_PLAYER_ROUTE_MESSAGE,
    })
  })

  it('切集路径参数应完整生成', () => {
    const path = buildCmsPlayPath('source-a', 'vod-1', 5)

    expect(path).toBe('/play/cms/source-a/vod-1?ep=5')
  })
})
