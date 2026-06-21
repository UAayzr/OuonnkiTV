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
