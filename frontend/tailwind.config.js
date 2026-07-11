/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0B0C15",
        panel: "#131522",
        panel2: "#1B1E30",
        spotlight: "#FFB84D",
        beam: "#6E7BFF",
        paper: "#F2F3FA",
        mist: "#A7ABC4",
        live: "#4ADE80",
        spent: "#FF7A7A",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        lift: "0 12px 32px -12px rgba(0, 0, 0, 0.6)",
        glow: "0 0 24px -6px rgba(255, 184, 77, 0.35)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        rise: "rise 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
