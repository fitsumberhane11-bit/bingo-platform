import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefcf3",
          100: "#d6f7e2",
          200: "#aeedc8",
          300: "#7bdda9",
          400: "#45c586",
          500: "#22a86b",
          600: "#158757",
          700: "#126c48",
          800: "#12563b",
          900: "#0f4732",
          950: "#07281c",
        },
        gold: {
          400: "#f2c94c",
          500: "#e0ac1f",
          600: "#b8860f",
        },
        ink: {
          900: "#0b1220",
          800: "#111a2e",
          700: "#1a2740",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.06), 0 1px 3px 0 rgb(0 0 0 / 0.08)",
      },
      keyframes: {
        "ball-pop": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "roll-in": {
          "0%": { transform: "translateX(-24px) rotate(-90deg)", opacity: "0" },
          "100%": { transform: "translateX(0) rotate(0deg)", opacity: "1" },
        },
      },
      animation: {
        "ball-pop": "ball-pop 350ms ease-out",
        "roll-in": "roll-in 420ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
