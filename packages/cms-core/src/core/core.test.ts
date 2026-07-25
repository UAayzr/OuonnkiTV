import { describe, expect, it, vi } from 'vitest'
import type { ApiPathConfig, RequestAdapter, VideoSource } from '../types'
import { createDirectStrategy, createUrlPrefixProxyStrategy } from '../adapters/proxy.adapter'
import { getVideoDetail } from './detail'
import { listVideos } from './list'
import { extractM3u8FromContent, parsePlayUrl } from './parser'
import { searchVideos } from './search'
import { buildDetailUrl, buildListUrl, buildSearchUrl } from '../utils/url'

const source: VideoSource = {
  id: 'source-a',
  name: '测试源',
  url: 'https://example.com',
  isEnabled: true,
  timeout: 1000,
  retry: 0,
}

const apiConfig: ApiPathConfig = {
  search: { path: '/api.php/provide/vod/?ac=videolist&wd=', headers: { Accept: 'application/json' } },
  detail: { path: '/api.php/provide/vod/?ac=videolist&ids=' },
}

function createAdapter(body: unknown, status = 200, contentType = 'application/json') {
  const fetch = vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType },
    }),
  )
  return { adapter: { fetch } satisfies RequestAdapter, fetch }
}

describe('CMS 地址拼接', () => {
  it('拼接搜索、详情和分页地址', () => {
    expect(buildSearchUrl('https://example.com/', '海 边', 2)).toBe(
      'https://example.com/api.php/provide/vod/?ac=videolist&wd=%E6%B5%B7%20%E8%BE%B9&pg=2',
    )
    expect(buildDetailUrl('https://example.com/api.php/provide/vod/', 'vod-1')).toBe(
      'https://example.com/api.php/provide/vod?ac=videolist&ids=vod-1',
    )
    expect(buildListUrl('https://example.com', 3)).toBe(
      'https://example.com/api.php/provide/vod/?ac=videolist&pg=3',
    )
  })

  it('保留已有查询参数并追加新参数', () => {
    expect(buildSearchUrl('https://example.com/api.php/provide/vod/?token=abc', '测试')).toBe(
      'https://example.com/api.php/provide/vod/?token=abc&ac=videolist&wd=%E6%B5%8B%E8%AF%95',
    )
  })
})

describe('搜索和列表请求', () => {
  it('搜索成功后补充来源信息和分页信息', async () => {
    const { adapter, fetch } = createAdapter({
      list: [{ vod_id: '1', vod_name: '影片' }],
      page: '2',
      pagecount: '4',
      total: '20',
    })

    const result = await searchVideos(
      '影片',
      source,
      { requestAdapter: adapter, proxyStrategy: createUrlPrefixProxyStrategy('/proxy?url='), apiConfig },
      2,
    )

    expect(result).toMatchObject({
      success: true,
      pagination: { page: 2, totalPages: 4, totalResults: 20 },
      items: [{ vod_id: '1', source_name: '测试源', source_code: 'source-a' }],
    })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/proxy\?url=/),
      expect.objectContaining({ timeout: 1000, retry: 0 }),
    )
  })

  it('把非 JSON 响应变成清楚的错误', async () => {
    const { adapter } = createAdapter('<html>维护中</html>', 200, 'text/html')
    const result = await searchVideos('影片', source, {
      requestAdapter: adapter,
      proxyStrategy: createDirectStrategy(),
      apiConfig,
    })

    expect(result).toEqual({ success: false, items: [], error: 'API返回了HTML页面而不是JSON' })
  })

  it('拒绝空搜索词，并保留列表接口的状态码错误', async () => {
    const { adapter } = createAdapter({}, 503)
    await expect(
      searchVideos('', source, { requestAdapter: adapter, proxyStrategy: createDirectStrategy(), apiConfig }),
    ).resolves.toMatchObject({ success: false, error: '缺少搜索参数' })

    await expect(
      listVideos(source, { requestAdapter: adapter, proxyStrategy: createDirectStrategy() }),
    ).resolves.toEqual({ success: false, items: [], error: 'API请求失败: 503' })
  })

  it('列表成功后补充来源信息', async () => {
    const { adapter } = createAdapter({ list: [{ vod_id: '2', vod_name: '最新' }], page: 1 })
    const result = await listVideos(source, {
      requestAdapter: adapter,
      proxyStrategy: createDirectStrategy(),
    })

    expect(result.items[0]).toMatchObject({
      vod_id: '2',
      source_name: '测试源',
      source_code: 'source-a',
      api_url: 'https://example.com',
    })
  })
})

describe('详情和播放地址解析', () => {
  it('读取详情并优先选择 m3u8 播放线路', async () => {
    const { adapter } = createAdapter({
      list: [
        {
          vod_id: '1',
          vod_name: '连续剧',
          vod_play_from: '普通$$$m3u8',
          vod_play_url:
            '第1集$https://example.com/one.mp4$$$第1集$https://cdn.example.com/one.m3u8#第2集$https://cdn.example.com/two.m3u8',
        },
      ],
    })

    const result = await getVideoDetail('1', source, {
      requestAdapter: adapter,
      proxyStrategy: createDirectStrategy(),
      apiConfig,
    })

    expect(result).toMatchObject({
      success: true,
      episodes: ['https://cdn.example.com/one.m3u8', 'https://cdn.example.com/two.m3u8'],
      videoInfo: { title: '连续剧', episodes_names: ['第1集', '第2集'] },
    })
  })

  it('播放字段为空时从介绍文字提取 m3u8 地址', async () => {
    const { adapter } = createAdapter({
      list: [
        {
          vod_id: '1',
          vod_name: '影片',
          vod_content: '备用地址 $https://cdn.example.com/fallback.m3u8',
        },
      ],
    })

    const result = await getVideoDetail('1', source, {
      requestAdapter: adapter,
      proxyStrategy: createDirectStrategy(),
      apiConfig,
    })

    expect(result.episodes).toEqual(['https://cdn.example.com/fallback.m3u8'])
    expect(result.videoInfo?.episodes_names).toEqual(['第1集'])
  })

  it('拒绝危险格式的视频编号', async () => {
    const { adapter, fetch } = createAdapter({ list: [] })
    const result = await getVideoDetail('../secret', source, {
      requestAdapter: adapter,
      proxyStrategy: createDirectStrategy(),
      apiConfig,
    })

    expect(result).toEqual({ success: false, episodes: [], error: '无效的视频ID格式' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('解析缺少名称的播放项并提取正文地址', () => {
    expect(parsePlayUrl('https://example.com/a.m3u8')).toEqual({ urls: [], names: ['第1集'] })
    expect(extractM3u8FromContent('A $https://a.test/a.m3u8 B $https://b.test/b.m3u8')).toEqual([
      'https://a.test/a.m3u8',
      'https://b.test/b.m3u8',
    ])
  })
})
