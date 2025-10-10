import fs from 'fs';
import path from 'path';

// Function to read all component files
function getContentPaths() {
  const dirs = ['.', './components', './contexts', './services'];
  const patterns = ['*.{js,ts,jsx,tsx}', '**/*.{js,ts,jsx,tsx}'];
  const content = dirs.flatMap(dir =>
    patterns.map(pattern => path.join(dir, pattern))
  );
  return content;
}

export default {
  content: getContentPaths(),
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Override default colors with Nord
        transparent: 'transparent',
        current: 'currentColor',
        black: '#000000',
        white: 'rgb(var(--nord-snow-3))',
        gray: {
          50: 'rgb(var(--nord-polar-4))',
          100: 'rgb(var(--nord-polar-3))',
          200: 'rgb(var(--nord-polar-2))',
          300: 'rgb(var(--nord-polar-1))',
          400: 'rgb(67, 76, 94)',
          500: 'rgb(var(--nord-snow-1))',
          600: 'rgb(var(--nord-snow-2))',
          700: 'rgb(59, 66, 82)',
          800: 'rgb(67, 76, 94)',
          900: 'rgb(46, 52, 64)',
        },
        slate: {
          50: 'rgb(var(--nord-polar-4))',
          100: 'rgb(var(--nord-polar-3))',
          200: 'rgb(var(--nord-polar-2))',
          300: 'rgb(var(--nord-polar-1))',
          400: 'rgb(var(--nord-snow-1))',
          500: 'rgb(var(--nord-snow-2))',
          600: 'rgb(var(--nord-snow-3))',
          700: 'rgb(var(--nord-polar-2))',
          800: 'rgb(var(--nord-polar-1))',
          900: 'rgb(46, 52, 64)',
        },
        // Nord specific colors
        nord: {
          polar1: 'rgb(var(--nord-polar-1))',
          polar2: 'rgb(var(--nord-polar-2))',
          polar3: 'rgb(var(--nord-polar-3))',
          polar4: 'rgb(var(--nord-polar-4))',
          snow1: 'rgb(var(--nord-snow-1))',
          snow2: 'rgb(var(--nord-snow-2))',
          snow3: 'rgb(var(--nord-snow-3))',
          frost1: 'rgb(var(--nord-frost-1))',
          frost2: 'rgb(var(--nord-frost-2))',
          frost3: 'rgb(var(--nord-frost-3))',
          frost4: 'rgb(var(--nord-frost-4))',
          aurora1: 'rgb(var(--nord-aurora-1))',
          aurora2: 'rgb(var(--nord-aurora-2))',
          aurora3: 'rgb(var(--nord-aurora-3))',
          aurora4: 'rgb(var(--nord-aurora-4))',
          aurora5: 'rgb(var(--nord-aurora-5))',
        },
        // Accent colors for highlights
        primary: 'rgb(var(--nord-frost-3))',
        secondary: 'rgb(var(--nord-aurora-4))',
        accent: 'rgb(var(--nord-frost-2))',
        danger: 'rgb(var(--nord-aurora-1))',
        warning: 'rgb(var(--nord-aurora-3))',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-nord': 'linear-gradient(135deg, rgb(var(--nord-polar-1)), rgb(var(--nord-polar-2)), rgb(var(--nord-polar-3)))',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'nord': '0 4px 32px rgba(var(--nord-polar-1), 0.5)',
        'nord-lg': '0 8px 64px rgba(var(--nord-polar-1), 0.6)',
        'frost': '0 4px 20px rgba(var(--nord-frost-3), 0.3)',
        'frost-lg': '0 8px 40px rgba(var(--nord-frost-3), 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in': 'slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        glow: {
          from: {
            boxShadow: '0 0 20px rgba(var(--nord-frost-2), 0.2)',
            borderColor: 'rgba(var(--nord-frost-3), 0.3)'
          },
          to: {
            boxShadow: '0 0 30px rgba(var(--nord-frost-2), 0.4)',
            borderColor: 'rgba(var(--nord-frost-3), 0.6)'
          },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      backdropSaturate: {
        180: '1.8',
      },
    },
  },
  plugins: [],
}
