import type { Config } from 'tailwindcss';

const optipackPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E8F5E9',
          100: '#C8E6C9',
          200: '#A5D6A7',
          300: '#81C784',
          400: '#66BB6A',
          500: '#4CAF50',
          600: '#43A047',
          700: '#388E3C',
          800: '#2E7D32',
          900: '#1B5E20',
          950: '#0D3B10',
        },
        success: {
          50: '#E8F5E9',
          500: '#4CAF50',
          700: '#388E3C',
        },
        warning: {
          50: '#FFF3E0',
          500: '#FF9800',
          700: '#F57C00',
        },
        error: {
          50: '#FFEBEE',
          500: '#F44336',
          700: '#D32F2F',
        },
        info: {
          50: '#E3F2FD',
          500: '#2196F3',
          700: '#1976D2',
        },
        sidebar: {
          bg: '#1B5E20',
          hover: '#2E7D32',
          active: '#388E3C',
          text: '#FFFFFF',
          muted: '#A5D6A7',
        },
      },
      borderRadius: {
        DEFAULT: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        elevated: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        modal: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        'bell-ring': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '15%': { transform: 'rotate(30deg)' },
          '30%': { transform: 'rotate(-25deg)' },
          '45%': { transform: 'rotate(20deg)' },
          '60%': { transform: 'rotate(-15deg)' },
          '75%': { transform: 'rotate(10deg)' },
          '90%': { transform: 'rotate(-5deg)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'skeleton-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'bell-ring': 'bell-ring 0.8s ease-in-out',
        'fade-in': 'fade-in 200ms ease-out',
        'fade-out': 'fade-out 150ms ease-in',
        'slide-in-left': 'slide-in-left 200ms ease-out',
        'skeleton-pulse': 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
};

export default optipackPreset;
