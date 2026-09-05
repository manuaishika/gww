import type { Config } from "tailwindcss";

// Palette is spec §10 (paper/ink/slate/signal), amber for stale/disputed only.
// gain/loss encode DIRECTION ONLY — never scaled by how big a move is; that's
// the materiality bar and the card size's job. Muted enough for the paper
// ground, not neon.
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
        gain: "#15803D",
        loss: "#B4443A",
      },
      fontFamily: {
        sans: ["var(--font-plex)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
