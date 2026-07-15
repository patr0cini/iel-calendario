/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter Variable",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,16,32,0.04), 0 8px 24px -12px rgba(16,16,32,0.10)",
        pop: "0 4px 12px rgba(16,16,32,0.08), 0 16px 40px -12px rgba(16,16,32,0.18)",
      },
    },
  },
  plugins: [],
};
