/** @type {import('tailwindcss').Config} */

// Theme colors are CSS variables (styles/globals.css) so themes can swap them
// without touching components; `<alpha-value>` keeps opacity modifiers working.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#1d9bf0", hover: "#1a8cd8" },
        like: "#f91880",
        retweet: "#00ba7c",
        surface: token("surface"),
        subtle: token("subtle"),
        fg: token("fg"),
        muted: token("muted"),
        line: token("line"),
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      maxWidth: {
        feed: "600px",
      },
    },
  },
  plugins: [],
};
