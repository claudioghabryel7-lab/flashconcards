'use client'

/**
 * Ponte react-router-dom → Next.js App Router.
 * Mantém os componentes legacy funcionando sem reescrever centenas de imports.
 */
import NextLink from 'next/link'
import {
  usePathname,
  useRouter,
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
} from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from 'react'

type To = string | { pathname?: string; search?: string; hash?: string }

function resolveTo(to: To): string {
  if (typeof to === 'string') return to
  return `${to.pathname || '/'}${to.search || ''}${to.hash || ''}`
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function Link({
  to,
  replace,
  children,
  className,
  onClick,
  ...rest
}: {
  to: To
  replace?: boolean
  children: ReactNode
  className?: string
  onClick?: ComponentProps<'a'>['onClick']
} & Omit<ComponentProps<'a'>, 'href'>) {
  const href = resolveTo(to)
  return (
    <NextLink href={href} replace={replace} className={className} onClick={onClick} {...rest}>
      {children}
    </NextLink>
  )
}

export function NavLink({
  to,
  children,
  className,
  end,
}: {
  to: To
  children: ReactNode | ((props: { isActive: boolean }) => ReactNode)
  className?: string | ((props: { isActive: boolean }) => string)
  end?: boolean
}) {
  const pathname = usePathname() || '/'
  const href = resolveTo(to)
  const isActive = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  const resolvedClass = typeof className === 'function' ? className({ isActive }) : className
  const content = typeof children === 'function' ? children({ isActive }) : children

  return (
    <NextLink href={href} className={resolvedClass}>
      {content}
    </NextLink>
  )
}

export function useNavigate() {
  const router = useRouter()

  return useCallback(
    (to: To | number, options?: { replace?: boolean; state?: unknown }) => {
      if (typeof to === 'number') {
        window.history.go(to)
        return
      }
      const href = resolveTo(to)
      if (options?.replace) router.replace(href)
      else router.push(href)
    },
    [router],
  )
}

export function useLocation() {
  const pathname = usePathname() || '/'
  const searchParams = useNextSearchParams()
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : ''

  return useMemo(
    () => ({
      pathname,
      search,
      hash: typeof window !== 'undefined' ? window.location.hash : '',
      state: null,
      key: 'default',
    }),
    [pathname, search],
  )
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  return useNextParams() as T
}

export function useSearchParams() {
  const searchParams = useNextSearchParams()
  const router = useRouter()
  const pathname = usePathname() || '/'

  const setSearchParams = useCallback(
    (
      nextInit: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams),
      _navigateOptions?: { replace?: boolean },
    ) => {
      const current = new URLSearchParams(searchParams?.toString() || '')
      let next: URLSearchParams

      if (typeof nextInit === 'function') {
        next = nextInit(current)
      } else if (nextInit instanceof URLSearchParams) {
        next = nextInit
      } else {
        next = new URLSearchParams(nextInit)
      }

      const qs = next.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  return [searchParams || new URLSearchParams(), setSearchParams] as const
}

export function Navigate({ to, replace = false }: { to: To; replace?: boolean }) {
  const router = useRouter()

  useEffect(() => {
    const href = resolveTo(to)
    if (replace) router.replace(href)
    else router.push(href)
  }, [to, replace, router])

  return null
}

export function Routes({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function Route(_props: { path?: string; element?: ReactNode; index?: boolean }) {
  return null
}

export function Outlet() {
  return null
}

export function useOutletContext<T>() {
  return {} as T
}
