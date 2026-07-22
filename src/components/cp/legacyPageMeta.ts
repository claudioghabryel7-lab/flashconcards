import type { CPPageHeaderProps } from './CPPageLayout'

export type LegacyPageMeta = Omit<CPPageHeaderProps, 'actions' | 'tech'> & {
  backHref?: string | null
  backLabel?: string
  actions?: CPPageHeaderProps['actions']
}

export const LEGACY_PAGE_META: Record<string, LegacyPageMeta> = {
  '/guia-mentorado': {
    badge: 'Guia',
    title: 'Guia Mentorado',
    subtitle: 'Cronograma até a prova, dia a dia.',
  },
  '/vespera-de-prova': {
    badge: 'Véspera',
    title: 'Véspera de Prova',
    subtitle: 'Revisão final antes do dia D.',
  },
  '/flashcards': {
    badge: 'Flashcards',
    title: 'Flashcards',
    subtitle: 'Repetição espaçada por tópico.',
  },
  '/flashquestoes': {
    badge: 'Questões',
    title: 'FlashQuestões',
    subtitle: 'Questões por tópico do edital.',
  },
  '/resolver-questoes': {
    badge: 'Questões',
    title: 'Questões',
    subtitle: 'Pratique e acompanhe acertos.',
  },
  '/edital-verticalizado': {
    badge: 'Edital',
    title: 'Edital Verticalizado',
    subtitle: 'Disciplinas, tópicos e progresso.',
    backHref: null,
  },
  '/conteudo-completo': {
    badge: 'Conteúdo',
    title: 'Conteúdo Completo',
    subtitle: 'Material por tópico do edital.',
  },
  '/simulado': {
    badge: 'Simulado',
    title: 'Simulado',
    subtitle: 'Provas no padrão da banca.',
  },
  '/treino-redacao': {
    badge: 'Redação',
    title: 'Treino de Redação',
    subtitle: 'Tema semanal com feedback por IA.',
  },
  '/calendario': {
    badge: 'Progresso',
    title: 'Progresso',
    subtitle: 'Gráficos, streak e calendário.',
  },
  '/trilha': {
    badge: 'Trilha',
    title: 'Trilha de estudo',
    subtitle: 'Tempo líquido, ciclo e metas.',
  },
  '/mentoria': {
    badge: 'Mentoria',
    title: 'Mentoria',
    subtitle: 'Acompanhamento da preparação.',
  },
  '/materia-revisada': {
    badge: 'Revisão',
    title: 'Matéria Revisada',
    subtitle: 'O que você já revisou.',
  },
  '/ranking-simulado': {
    badge: 'Ranking',
    title: 'Ranking Simulado',
    subtitle: 'Compare seu desempenho.',
  },
  '/guia-estudos': {
    badge: 'Guia',
    title: 'Guia de Estudos',
    subtitle: 'Orientações para a preparação.',
    backHref: '/',
    backLabel: 'Voltar ao início',
  },
  '/cursos': {
    badge: 'Cursos',
    title: 'Concursos',
    subtitle: 'Escolha o concurso para estudar.',
    backHref: '/',
    backLabel: 'Voltar ao início',
  },
  '/perfil': {
    badge: 'Conta',
    title: 'Meu perfil',
    subtitle: 'Dados e privacidade.',
  },
  '/comunidade': {
    badge: 'Comunidade',
    title: 'Comunidade',
    subtitle: 'Feed de estudos da trilha.',
  },
  '/admin': {
    badge: 'Admin',
    title: 'Painel Admin',
    subtitle: 'Cursos, conteúdo e configurações.',
  },
}

export function getLegacyPageMeta(pathname: string): LegacyPageMeta | null {
  if (LEGACY_PAGE_META[pathname]) return LEGACY_PAGE_META[pathname]

  const base = pathname.split('/').slice(0, 2).join('/') || pathname
  if (base !== pathname && LEGACY_PAGE_META[base]) return LEGACY_PAGE_META[base]

  return null
}
