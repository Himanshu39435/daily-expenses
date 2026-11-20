/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      colors: { ink: { 900: '#0f2036', 800: '#16304d', 700: '#1f4167' } },
    },
  },
  plugins: [],
};
