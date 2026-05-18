/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,js}'],
  theme: {
    extend: {
      colors: {
        abyss: 'var(--abyss)',
        carbon: 'var(--carbon)',
        charcoal: 'var(--charcoal)',
        signal: 'var(--signal)',
        mint: 'var(--mint)',
        snow: 'var(--snow)',
        parchment: 'var(--parchment)',
        slate: 'var(--slate)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        info: 'var(--info)',
      },
      fontFamily: {
        heading: ['system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
      },
    },
  },
  plugins: [],
}
