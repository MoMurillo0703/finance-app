/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          400: '#a78bfa',
          600: '#7c3aed',
        }
      }
    },
  },
  plugins: [],
}