import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "sans-serif"],
        mono: ["monospace"],
      },
      colors: {
        brand: {
          50:  "#eef4ff",
          100: "#d9e7ff",
          200: "#bcd2ff",
          400: "#7aaeff",
          500: "#4f8ef7",
          600: "#3370e8",
          700: "#2558c8",
          800: "#1e44a0",
          900: "#1a3880",
        },
      },
    },
  },
  plugins: [],
};
export default config;
