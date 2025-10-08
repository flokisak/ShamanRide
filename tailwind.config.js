/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./app.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial'],
      },
      colors: {
        shaman: {
          primary: '#10b981', // soft green (modern)
          sun: '#fbbf24', // warm sun accent
          neon: '#8b5cf6', // soft purple
          cyan: '#06b6d4', // cyan accent
          dark: '#1f2937', // gray-800
          card: '#ffffff',
        },
        accent: {
          green: '#10b981',
          teal: '#06b6d4',
          neon: '#8b5cf6'
        },
        inspire: {
          purple: 'hsl(247, 88%, 70%)',
          magenta: 'hsl(282, 82%, 51%)',
          orange: 'hsl(25, 60%, 50%)',
          blue: 'hsl(231, 60%, 50%)',
          green: 'hsl(120, 60%, 50%)',
          red: 'hsl(0, 60%, 50%)',
        }
      },
      borderRadius: {
        'lg-blob': '22px',
      },
      boxShadow: {
        glass: '0 6px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.45s ease-in-out',
        'slide-in': 'slideIn 0.32s ease-out',
        'pulse-neon': 'pulseNeon 2.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseNeon: {
          '0%': { boxShadow: '0 0 6px rgba(124,58,237,0.25)' },
          '50%': { boxShadow: '0 0 20px rgba(34,211,238,0.25)' },
          '100%': { boxShadow: '0 0 6px rgba(124,58,237,0.25)' },
        },
      },
    },
  },
  plugins: [],
}