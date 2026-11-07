const encodeSegment = (value: string | number) => encodeURIComponent(String(value))

export function buildCmsPlayPath(
  sourceCode: string,
  vodId: string,
  episodeIndex?: number,
): string {
  const basePath = `/play/cms/${encodeSegment(sourceCode)}/${encodeSegment(vodId)}`
  if (typeof episodeIndex !== 'number') {
    return basePath
  }
  return `${basePath}?ep=${episodeIndex}`
}

const CMS_PLAY_PATH_PATTERN = /^\/play\/cms\/([^/]+)\/([^/]+)(?:\?.*)?$/

/**
 * buildCmsPlayPath 的逆函数：从播放页路由路径解析出源标识与影片 ID。
 * 解析失败返回 null。
 */
export function parseCmsPlayPath(pathname: string): { sourceCode: string; vodId: string } | null {
  const match = CMS_PLAY_PATH_PATTERN.exec(pathname)
  if (!match) return null
  return {
    sourceCode: decodeURIComponent(match[1]),
    vodId: decodeURIComponent(match[2]),
  }
}