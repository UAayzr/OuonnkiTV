import { track } from '@vercel/analytics'
import { getPublicEnv } from './runtimeEnv'

// 自定义事件跟踪
// properties 参数可以是 string, number, boolean, null 类型的值
export const trackEvent = (
  eventName: string,
  properties?: Record<string, string | number | boolean | null>,
) => {
  // 当禁用Analytics时不执行跟踪
  if (getPublicEnv('OKI_DISABLE_ANALYTICS') !== 'true') {
    track(eventName, properties)
  }
}
