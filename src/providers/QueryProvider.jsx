import { readEnv, isDevEnv } from '@/lib/env.js'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export const QueryProvider = ({ children }) => {
  // Criar QueryClient dentro do componente para evitar problemas com React 19
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5 * 60 * 1000, // 5 minutos
        gcTime: 10 * 60 * 1000, // 10 minutos (cacheTime foi renomeado para gcTime na v5)
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Devtools desabilitado - descomente a linha abaixo para ativar em desenvolvimento */}
      {/* {isDevEnv() && <ReactQueryDevtools initialIsOpen={false} />} */}
    </QueryClientProvider>
  )
}

