/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af',
          400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c',
          800: '#9f1239', 900: '#881337'
        },
        // 新增這兩行：你的 primary（藍色）與 hover 用的深藍
        primary: '#3B82F6',
        primaryDark: '#2563EB',
      },
      boxShadow: { soft: '0 10px 30px rgba(0,0,0,0.08)' }
    }
  },
  // 可留可不留；保險起見加著，避免 purge 掃掉
  safelist: ['text-primary', 'bg-primary', 'hover:bg-primaryDark', 'border-primary']
};
