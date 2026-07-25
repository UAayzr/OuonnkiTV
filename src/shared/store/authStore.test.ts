import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'

beforeEach(() => {
  sessionStorage.clear()
  useAuthStore.setState({ sessionToken: null, salt: null, isInitialized: false })
  vi.stubGlobal('crypto', {
    getRandomValues: (array: Uint8Array) => {
      array.fill(7)
      return array
    },
    subtle: {
      digest: async (_algorithm: string, data: BufferSource) => {
        const bytes = new Uint8Array(data as ArrayBuffer)
        return Uint8Array.from(bytes, byte => (byte + 17) % 256).buffer
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('认证状态', () => {
  it('没有设置密码时直接允许访问', async () => {
    vi.stubEnv('OKI_ACCESS_PASSWORD', '')
    await expect(useAuthStore.getState().login('anything')).resolves.toBe(true)
    await expect(useAuthStore.getState().validateSession()).resolves.toBe(true)
  })

  it('只接受正确密码，并可验证保存的会话', async () => {
    vi.stubEnv('OKI_ACCESS_PASSWORD', 'secret')
    await expect(useAuthStore.getState().login('wrong')).resolves.toBe(false)
    await expect(useAuthStore.getState().login('secret')).resolves.toBe(true)

    const loggedIn = useAuthStore.getState()
    expect(loggedIn.sessionToken).toBeTruthy()
    expect(loggedIn.salt).toBe('07'.repeat(16))
    await expect(loggedIn.validateSession()).resolves.toBe(true)
  })

  it('发现会话被修改时自动清除，并支持退出', async () => {
    vi.stubEnv('OKI_ACCESS_PASSWORD', 'secret')
    useAuthStore.setState({ sessionToken: 'tampered', salt: 'salt', isInitialized: true })

    await expect(useAuthStore.getState().validateSession()).resolves.toBe(false)
    expect(useAuthStore.getState()).toMatchObject({ sessionToken: null, salt: null })

    await useAuthStore.getState().login('secret')
    useAuthStore.getState().logout()
    expect(useAuthStore.getState()).toMatchObject({
      sessionToken: null,
      salt: null,
      isInitialized: true,
    })
  })
})
