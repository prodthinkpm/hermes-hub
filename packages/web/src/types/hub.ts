// Re-export shared domain types from @hermes-hub/core
export {
  type ProfileRow,
  type BadgeTone,
  type HermesApiResponse,
  type LogEntry,
  type LogTone,
  type HubNode,
  type ManagedAgent,
} from '@hermes-hub/core'

export type RouteKey = 'dashboard' | 'profiles' | 'create' | 'profile' | 'profileLogs' | 'services' | 'logs' | 'settings'

export interface NavItem {
  key: RouteKey
  icon: string
  label: string
  to: string
}

export interface StatItem {
  label: string
  icon: string
  value: string
  hint: string
}

export interface ServiceCard {
  tone: import('@hermes-hub/core').BadgeTone
  status: string
  title: string
  description: string
  command: string
}

export interface SkillCard {
  tone: import('@hermes-hub/core').BadgeTone
  status: string
  title: string
  description: string
}
