import type { CPPageHeaderProps } from './CPPageLayout'

export type LegacyPageMeta = Omit<CPPageHeaderProps, 'actions'> & {
  backHref?: string | null
  backLabel?: string
  actions?: CPPageHeaderProps['actions']
}

export const LEGACY_PAGE_META: Record<string, LegacyPageMeta> = {
  '/guia-mentorado': {
    badge: 'Cronograma',
    title: 'Guia Mentorado',
    subtitle: 'Cronograma estratégico baseado no edital verticalizado',
  },
  '/vespera-de-prova': {
    badge: 'Revisão',
    title: 'Véspera de Prova',
    subtitle: 'Revisão final e simulados antes da prova',
  },
  '/flashcards': {
    badge: 'SRS · IA',
    title: 'Flashcards com IA',
    subtitle: 'Sistema de repetição espaçada por tópico do edital',
    backLabel: 'Voltar ao Dashboard',
  },
  '/flashquestoes': {
    badge: 'Questões · IA',
    title: 'FlashQuestões com IA',
    subtitle: 'Questões por tópico do edital verticalizado',
  },
  '/edital-verticalizado': {
    badge: 'Edital',
    title: 'Edital Verticalizado',
    subtitle: 'Disciplinas colapsáveis, busca rápida e progresso por tópico',
    backHref: null,
  },
  '/conteudo-completo': {
    badge: 'Conteúdo',
    title: 'Conteúdo Completo',
    subtitle: 'Material completo por tópico do edital',
  },
  '/simulado': {
    badge: 'Simulado',
    title: 'Simulado',
    subtitle: 'Provas simuladas no padrão da banca',
  },
  '/treino-redacao': {
    badge: 'Redação',
    title: 'Treino de Redação',
    subtitle: 'Pratique e receba feedback com IA',
  },
  '/calendario': {
    badge: 'Progresso',
    title: 'Progresso',
    subtitle: 'Gráficos por matéria, questões, flashcards e calendário de estudos',
  },
  '/mentoria': {
    badge: 'Mentoria',
    title: 'Mentoria',
    subtitle: 'Acompanhamento e orientação de estudos',
  },
  '/materia-revisada': {
    badge: 'Revisão',
    title: 'Matéria Revisada',
    subtitle: 'Registro do que você já revisou',
  },
  '/ranking-simulado': {
    badge: 'Ranking',
    title: 'Ranking Simulado',
    subtitle: 'Compare seu desempenho com outros candidatos',
  },
  '/guia-estudos': {
    badge: 'Guia',
    title: 'Guia de Estudos',
    subtitle: 'Orientações e trilhas para sua preparação',
    backHref: '/',
    backLabel: 'Voltar ao início',
  },
  '/cursos': {
    badge: 'Cursos',
    title: 'Concursos',
    subtitle: 'Escolha o concurso para iniciar seus estudos',
    backHref: '/',
    backLabel: 'Voltar ao início',
  },
  '/perfil': {
    badge: 'Conta',
    title: 'Meu perfil',
    subtitle: 'Foto, dados pessoais e privacidade na comunidade',
  },
  '/comunidade': {
    badge: 'Comunidade',
    title: 'Destaques de estudo',
    subtitle: 'Estudos publicados na Trilha — curta e comente',
  },
  '/admin': {
    badge: 'Admin',
    title: 'Painel Admin',
    subtitle: 'Gerencie flashcards, usuários, cursos e configurações',
  },
}

export function getLegacyPageMeta(pathname: string): LegacyPageMeta | null {
  if (LEGACY_PAGE_META[pathname]) return LEGACY_PAGE_META[pathname]

  const base = pathname.split('/').slice(0, 2).join('/') || pathname
  if (base !== pathname && LEGACY_PAGE_META[base]) return LEGACY_PAGE_META[base]

  return null
}
