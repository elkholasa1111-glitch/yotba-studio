import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: "#0D0D11",
          950: "#08080B",
          900: "#0D0D11",
          850: "#121217",
          800: "#15151C",
          700: "#1C1C24",
          600: "#24242F",
        },
        surface: {
          DEFAULT: "#15151C",
          elevated: "#1C1C24",
          modal: "#22222C",
        },
        border: {
          subtle: "#2A2A36",
          strong: "#3D3D4E",
        },
        crimson: {
          deep: "#8B1E24",
          DEFAULT: "#A8202A",
          bright: "#C92A37",
          glow: "rgba(168, 32, 42, 0.35)",
          subtle: "rgba(168, 32, 42, 0.12)",
        },
        editorial: {
          ivory: "#F8F6F0",
          canvas: "#F9F7F2",
          secondary: "#A9A8A2",
          // Keep metadata readable on the obsidian canvas (WCAG AA target).
          muted: "#92918C",
        },
      },
      fontFamily: {
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
        reading: ["var(--font-reading)", "serif"],
        display: ["var(--font-display)", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "4px",
        md: "8px",
        lg: "16px",
        xl: "24px",
      },
      boxShadow: {
        cinematic: "0 12px 36px -8px rgba(0, 0, 0, 0.7)",
        poster: "0 16px 40px -10px rgba(0, 0, 0, 0.8)",
        halo: "0 0 45px -10px rgba(168, 32, 42, 0.4)",
        "halo-intense": "0 0 65px -5px rgba(168, 32, 42, 0.6)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.02)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out both",
        "slide-up": "slide-up 220ms ease-out both",
        "pulse-subtle": "pulse-subtle 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
