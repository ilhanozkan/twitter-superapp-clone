/** @type {import('tailwindcss').Config} */

// Theme colors are CSS variables (styles/globals.css) so the light and dark
// themes swap them without touching components; `<alpha-value>` keeps
// opacity modifiers (bg-primary/10) working. Text colors meet WCAG AA (4.5:1)
// on the page and panel backgrounds in both themes.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Twitter's phone breakpoint: below it the sidebar becomes a tab bar.
        xs: "500px",
      },
      colors: {
        brand: "#1d9bf0",
        primary: token("primary"),
        // Filled buttons: white text on it is 5.1:1.
        "primary-fill": { DEFAULT: "#1570c2", hover: "#125fa6" },
        like: token("like"),
        retweet: token("retweet"),
        danger: token("danger"),
        warning: token("warning"),
        surface: token("surface"),
        subtle: token("subtle"),
        fg: token("fg"),
        muted: token("muted"),
        line: token("line"),
        banner: token("banner"),
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
      boxShadow: {
        // Themed: a soft grey shadow in light mode, a white glow in dark mode.
        menu: "var(--shadow-menu)",
      },
      keyframes: {
        "toast-in": {
          from: { opacity: "0", transform: "translateY(0.5rem)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        progress: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(-10%)" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.25)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "toast-in": "toast-in 200ms ease-out",
        progress: "progress 8s cubic-bezier(0.1, 0.7, 0.3, 1) forwards",
        pop: "pop 250ms ease-out",
      },
    },
  },
  plugins: [],
};
