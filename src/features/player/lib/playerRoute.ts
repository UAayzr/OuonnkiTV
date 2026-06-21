interface PlayerRouteValidationParams {
  sourceCode?: string
  vodId?: string
}

interface PlayerRouteValidationBase {
  isValid: boolean
}

export interface PlayerRouteValidationCmsResult extends PlayerRouteValidationBase {
  isValid: true
  mode: 'cms'
  sourceCode: string
  vodId: string
}

export interface PlayerRouteValidationInvalidResult extends PlayerRouteValidationBase {
  isValid: false
  mode: 'invalid'
  message: string
}

export type PlayerRouteValidationResult =
  | PlayerRouteValidationCmsResult
  | PlayerRouteValidationInvalidResult

export const INVALID_PLAYER_ROUTE_MESSAGE = '无效的播放地址，请返回重试'

export function validatePlayerRoute(params: PlayerRouteValidationParams): PlayerRouteValidationResult {
  const sourceCode = params.sourceCode?.trim() || ''
  const vodId = params.vodId?.trim() || ''

  if (sourceCode && vodId) {
    return {
      isValid: true,
      mode: 'cms',
      sourceCode,
      vodId,
    }
  }

  return {
    isValid: false,
    mode: 'invalid',
    message: INVALID_PLAYER_ROUTE_MESSAGE,
  }
}
