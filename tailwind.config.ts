import type { Config } from "tailwindcss";

// Palette is spec §10. Five values, no gradients. amber is reserved ONLY for
// stale or disputed data — do not use it for anything else.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FBFBF9",
        ink: "#141619",
        slate: "#6B7280",
        signal: "#1B4F9C",
        amber: "#B45309",
      },
      fontFamily: {
        sans: ["var(--font-plex)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
