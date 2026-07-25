import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  importVideoAPIs: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/shared/store/apiStore', () => ({
  useApiStore: () => ({
    importVideoAPIs: mocks.importVideoAPIs,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

vi.mock('@/shared/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogClose: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { TextSourceModal, URLSourceModal } from './ImportSourceModal'

beforeEach(() => {
  mocks.importVideoAPIs.mockClear()
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  vi.unstubAllGlobals()
})

describe('ImportSourceModal', () => {
  it('可以从 URL 成功导入视频源', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const sources = [{ name: '测试源', url: 'https://example.com/api.php/provide/vod' }]
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sources,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<URLSourceModal open onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('URL 地址'), 'https://example.com/source.json')
    await user.click(screen.getByRole('button', { name: '导入' }))

    await waitFor(() => {
      expect(mocks.importVideoAPIs).toHaveBeenCalledWith(sources)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('成功导入 1 个视频源')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('URL 请求失败时显示错误提示', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    )

    render(<URLSourceModal open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText('URL 地址'), 'https://example.com/source.json')
    await user.click(screen.getByRole('button', { name: '导入' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('导入失败：请求错误或解析失败')
    })
    expect(mocks.importVideoAPIs).not.toHaveBeenCalled()
  })

  it('可以从文本 JSON 成功导入视频源', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const sources = [{ name: '文本源', url: 'https://example.com/api.php/provide/vod' }]

    render(<TextSourceModal open onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('JSON 内容'), {
      target: { value: JSON.stringify(sources) },
    })
    await user.click(screen.getByRole('button', { name: '导入' }))

    await waitFor(() => {
      expect(mocks.importVideoAPIs).toHaveBeenCalledWith(sources)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('成功导入 1 个视频源')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('文本不是 JSON 数组时显示校验错误', async () => {
    const user = userEvent.setup()

    render(<TextSourceModal open onOpenChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('JSON 内容'), {
      target: { value: '{"name":"不是数组"}' },
    })
    await user.click(screen.getByRole('button', { name: '导入' }))

    expect(await screen.findByText('请输入有效的 JSON 数组格式')).toBeInTheDocument()
    expect(mocks.importVideoAPIs).not.toHaveBeenCalled()
  })
})
