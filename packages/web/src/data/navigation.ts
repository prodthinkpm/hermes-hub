import type { NavItem } from '@/types/hub'

export const navItems: NavItem[] = [
  { key: 'dashboard', icon: '⌂', label: 'Dashboard', to: '/' },
  { key: 'nodes', icon: '◈', label: 'Nodes', to: '/nodes' },
  { key: 'profiles', icon: '◎', label: 'Agents', to: '/profiles' },
  { key: 'services', icon: '◿', label: 'Gateway / API', to: '/services' },
  { key: 'logs', icon: '⌁', label: 'Logs', to: '/logs' },
  { key: 'settings', icon: '⚙', label: 'Settings', to: '/settings' },
]
