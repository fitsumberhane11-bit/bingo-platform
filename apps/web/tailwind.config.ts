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
        // The default slate scale, re-pointed at CSS variables (see
        // globals.css) so every existing `bg-slate-*` / `text-slate-*` /
        // `border-slate-*` usage across the app automatically becomes
        // theme-aware — the values flip under `.dark` without needing a
        // `dark:` variant added at each of the 40+ call sites.
        slate: {
          50: "rgb(var(--slate-50) / <alpha-value>)",
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
          700: "rgb(var(--slate-700) / <alpha-value>)",
          800: "rgb(var(--slate-800) / <alpha-value>)",
          900: "rgb(var(--slate-900) / <alpha-value>)",
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
