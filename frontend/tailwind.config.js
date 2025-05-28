/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'node': {
          'worker': '#3B82F6',
          'supervisor': '#9333EA',
          'planner': '#10B981',
          'watcher': '#F59E0B',
          'scheduler': '#EC4899',
          'flow': '#EF4444',
          'storage': '#6B7280',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': {
            boxShadow: '0 0 5px rgb(59 130 246 / 0.5), 0 0 20px rgb(59 130 246 / 0.2)',
          },
          '100%': {
            boxShadow: '0 0 10px rgb(59 130 246 / 0.8), 0 0 30px rgb(59 130 246 / 0.4)',
          },
        },
      },
    },
  },
  plugins: [],
}