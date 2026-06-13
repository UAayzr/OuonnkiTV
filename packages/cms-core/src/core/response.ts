export interface JsonResponseResult<T = unknown> {
  data: T | null
  error: string | null
}

/**
 * CMS 源经常在异常时返回 HTML 错误页、空文本或 text/plain JSON。
 * 统一先读 text 再 JSON.parse，避免 response.json() 抛出冗长堆栈。
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<JsonResponseResult<T>> {
  const text = await response.text()
  const trimmed = text.trim()

  if (!trimmed) {
    return { data: null, error: 'API返回空内容' }
  }

  try {
    return { data: JSON.parse(trimmed) as T, error: null }
  } catch {
    const preview = trimmed.replace(/\s+/g, ' ').slice(0, 120)
    const contentType = response.headers.get('content-type') || ''
    const isHtml =
      contentType.includes('text/html') ||
      /^<!doctype html/i.test(trimmed) ||
      /^<html[\s>]/i.test(trimmed)

    return {
      data: null,
      error: isHtml
        ? 'API返回了HTML页面而不是JSON'
        : `API返回内容不是有效JSON: ${preview}`,
    }
  }
}
