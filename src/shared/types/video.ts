// 从 cms-core 重新导出类型（保持向后兼容）
export type {
  VideoItem,
  VideoDetail,
  SearchResult,
  DetailResult,
  VideoSource as VideoApi,
} from '@ouonnki/cms-core'

// 观看历史项
export interface ViewingHistoryItem {
  // 记录类型：CMS 直连播放记录
  recordType: 'cms'
  title: string
  imageUrl: string
  episodeIndex: number
  episodeName?: string // 集数名称，例如 "第01集"、"第1集" 等
  sourceCode: string
  sourceName: string
  vodId: string
  timestamp: number
  playbackPosition: number
  duration: number
}
