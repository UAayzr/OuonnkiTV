import React, { useState, useEffect, useRef } from 'react'
import { ArrowRight, Lock } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { useAuthStore } from '@/shared/store/authStore'
import { OkiLogo } from '@/shared/components/icons'
import { toast } from 'sonner'
import { getPublicEnv } from '@/shared/config/runtimeEnv'

interface AuthGuardProps {
  children: React.ReactNode
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { login, validateSession } = useAuthStore()
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isDismissing, setIsDismissing] = useState(false)
  const revealRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const revealOriginRef = useRef('50% 50%')

  const accessPassword = getPublicEnv('OKI_ACCESS_PASSWORD')
  const isProtectionEnabled = !!accessPassword && accessPassword.trim() !== ''

  useEffect(() => {
    const checkAuth = async () => {
      if (!isProtectionEnabled) {
        setIsAuthenticated(true)
        return
      }
      const isValid = await validateSession()
      setIsAuthenticated(isValid)
    }
    checkAuth()
  }, [validateSession, isProtectionEnabled])

  // 验证成功后，从按钮位置扩散圆形 clip-path 揭开页面内容
  useEffect(() => {
    if (!isDismissing) return

    const reveal = revealRef.current
    if (reveal) {
      const origin = revealOriginRef.current
      const animation = reveal.animate(
        [
          { clipPath: `circle(0% at ${origin})` },
          { clipPath: `circle(150% at ${origin})` },
        ],
        {
          duration: 300,
          easing: 'cubic-bezier(0.2, 1.08, 0.34, 1)',
          fill: 'forwards',
        },
      )
      animation.onfinish = () => setIsAuthenticated(true)

      return () => animation.cancel()
    }

    setIsAuthenticated(true)
  }, [isDismissing])

  if (isProtectionEnabled && isAuthenticated === null) {
    return null
  }

  if (!isProtectionEnabled || isAuthenticated) {
    return <>{children}</>
  }

  const handleLogin = async () => {
    setIsLoading(true)
    await new Promise(resolve => setTimeout(resolve, 600))

    const success = await login(password)
    if (success) {
      toast.success('验证成功')
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        revealOriginRef.current = `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`
      }
      setIsDismissing(true)
    } else {
      toast.error('验证失败')
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin()
    }
  }

  return (
    <>
      {/* 验证成功后渲染页面内容，clip-path 从按钮位置向外扩散 */}
      {isDismissing && (
        <div
          ref={revealRef}
          className="fixed inset-0 z-[10000]"
          style={{ clipPath: `circle(0% at ${revealOriginRef.current})` }}
        >
          {children}
        </div>
      )}

      {/* 守卫层 */}
      <div
        className="fixed inset-0 z-[9999] flex flex-col bg-background md:flex-row"
      >
        {/* 左侧品牌区 — 移动端顶部横栏，桌面端左侧半屏 */}
        <div
          className="relative flex shrink-0 animate-[auth-fade-in_var(--motion-duration-panel)_var(--motion-ease-standard)] flex-col items-center justify-center overflow-hidden bg-muted/40 px-8 py-12 motion-reduce:animate-none md:w-1/2 md:py-0"
        >
          {/* 装饰性模糊光晕 */}
          <div className="pointer-events-none absolute -top-20 -left-20 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 -bottom-16 size-56 rounded-full bg-primary/5 blur-3xl" />

          <div className="relative flex flex-col items-center gap-4">
            <div
              className="flex animate-[auth-rise-in_var(--motion-duration-panel)_80ms_var(--motion-ease-soft-rebound)_both] flex-col items-center gap-3 motion-reduce:animate-none"
            >
              <OkiLogo size={80} />
              <div className="text-xl font-bold tracking-widest">UAayZR TV</div>
            </div>

            <p
              className="max-w-xs animate-[auth-fade-in_var(--motion-duration-panel)_140ms_var(--motion-ease-standard)_both] text-center text-sm text-muted-foreground motion-reduce:animate-none"
            >
              你的私人流媒体影院
            </p>
          </div>
        </div>

        {/* 右侧表单区 — 移动端占满剩余空间，桌面端右侧半屏 */}
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 md:px-16">
          <div className="w-full max-w-sm space-y-8">
            {/* 信息区域 */}
            <div
              className="animate-[auth-rise-in_var(--motion-duration-panel)_120ms_var(--motion-ease-soft-rebound)_both] space-y-4 motion-reduce:animate-none"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted/70 ring-1 ring-border/60">
                <Lock className="size-5 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">访问受限</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  当前站点通过密码保护，请输入访问密码以继续
                </p>
              </div>
            </div>

            {/* 表单区域 */}
            <div
              className="animate-[auth-rise-in_var(--motion-duration-panel)_180ms_var(--motion-ease-soft-rebound)_both] motion-reduce:animate-none"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder="请输入访问密码"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-11 rounded-full"
                />
                <Button
                  ref={buttonRef}
                  size="icon-lg"
                  className="shrink-0 rounded-full"
                  onClick={handleLogin}
                  disabled={isLoading}
                >
                  {isLoading ? <Spinner size="sm" /> : <ArrowRight className="size-5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
