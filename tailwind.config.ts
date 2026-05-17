import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0a0a0f',
        panel: '#111118',
        border: '#1e1e2e',
        accent: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        muted: '#6b7280',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      }
    }
  },
  plugins: []
}
export default config
