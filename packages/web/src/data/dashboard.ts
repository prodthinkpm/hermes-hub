import type { ServiceCard } from '@/types/hub'

export const services: ServiceCard[] = [
  {
    tone: 'running',
    status: 'running',
    title: 'coder gateway',
    description: 'Telegram + API server，端口 8643。',
    command: 'HERMES_HOME=~/.hermes/profiles/coder hermes gateway',
  },
  {
    tone: 'running',
    status: 'running',
    title: 'researcher gateway',
    description: 'Slack + API server，端口 8644。',
    command: 'hermes -p researcher gateway',
  },
  {
    tone: 'bad',
    status: 'blocked',
    title: 'deployer gateway',
    description: 'Token lock：与 ops profile 使用了同一个 Bot Token。',
    command: 'deployer gateway start',
  },
]
