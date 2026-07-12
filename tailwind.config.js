/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './app.js'],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: 'rgb(var(--c-bg) / <alpha-value>)', soft: 'rgb(var(--c-soft) / <alpha-value>)', panel: 'rgb(var(--c-panel) / <alpha-value>)', card: 'rgb(var(--c-card) / <alpha-value>)', line: 'rgb(var(--c-line) / <alpha-value>)' },
        steel: { 100: 'rgb(var(--c-text) / <alpha-value>)', 200: 'rgb(var(--c-text) / <alpha-value>)', 300: 'rgb(var(--c-text2) / <alpha-value>)', 400: 'rgb(var(--c-text3) / <alpha-value>)', 500: 'rgb(var(--c-text3) / <alpha-value>)', 700: 'rgb(var(--c-text4) / <alpha-value>)' },
        safety: { DEFAULT: 'rgb(var(--c-gold) / <alpha-value>)', dim: 'rgb(var(--c-gold-dim) / <alpha-value>)' },
        cyber: { DEFAULT: 'rgb(var(--c-green) / <alpha-value>)', dim: 'rgb(var(--c-green-dim) / <alpha-value>)' },
        alert: { DEFAULT: '#FF5A3C' }
      },
      fontFamily: {
        sans: ['Barlow', 'ui-sans-serif', 'system-ui'],
        mono: ['ui-monospace', 'monospace'],
        titulo: ['"Saira Stencil One"', 'sans-serif']
      }
    }
  },
  plugins: []
}
