import type { Config } from 'tailwindcss';

/**
 * Marketing design tokens.
 *
 * The app itself is styled by the CSS-first `@theme` block in globals.css —
 * that is where shadcn's semantic tokens live and where dark mode is wired.
 * This legacy-style config is loaded alongside it (`@config` in globals.css)
 * purely to *add* the guest-side palette, type scale and motion primitives.
 * It overrides nothing: no semantic token, no `sans` family, no existing
 * colour. The landing page opts in with `bg-paper`, `text-forest` and friends.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bright: '#9FE870',
        brightDeep: '#8BDA57',
        forest: '#163300',
        moss: '#454B45',
        mint: '#D3F4C5',
        paper: '#FFFFFF',
        bone: '#F9F9F7',
        sand: '#F0EEE4',
        edge: '#E4E4DF',
        coral: '#FFC091',
        // Error text needs a dark tone: coral on paper is far below AA, and
        // the brief requires AA for all body copy.
        rust: '#8C2F0D',
      },
      fontFamily: {
        // `sans` is deliberately untouched — the app is already on Inter.
        display: ['var(--font-inter-tight)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        h1: ['clamp(2.75rem, 6vw, 5.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        h2: ['clamp(2rem, 4vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        h3: ['clamp(1.25rem, 2vw, 1.75rem)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body-base': ['1rem', { lineHeight: '1.65' }],
        micro: ['0.8125rem', { lineHeight: '1.2', letterSpacing: '0.12em' }],
      },
      borderRadius: {
        '4xl': '40px',
      },
      maxWidth: {
        container: '1200px',
      },
      boxShadow: {
        float: '0 24px 60px -20px rgba(22,51,0,0.25)',
      },
      keyframes: {
        'marquee-x': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-x-reverse': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        'scroll-y': {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(-50%)' },
        },
        'drift-slow': {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-14px,0)' },
        },
      },
      animation: {
        'marquee-x': 'marquee-x 40s linear infinite',
        'marquee-x-reverse': 'marquee-x-reverse 40s linear infinite',
        'scroll-y': 'scroll-y 22s linear infinite',
        'drift-slow': 'drift-slow 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
