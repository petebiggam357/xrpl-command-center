/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#040811',
        panel: '#0a1222',
        panelHi: '#101c33',
        hudBorder: '#1b2c4a',
        xrplCyan: '#22d3ee',
        xrplBlue: '#38bdf8',
        xrplMint: '#34d399',
        xrplAmber: '#fbbf24',
        xrplViolet: '#a78bfa',
        xrplMagenta: '#f472b6',
        xrplRose: '#fb7185',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        hud: '0 0 0 1px rgba(56, 189, 248, 0.14), 0 12px 32px rgba(2, 6, 23, 0.72)',
        glowCyan: '0 0 22px rgba(34, 211, 238, 0.25)',
      },
    },
  },
  plugins: [],
};
