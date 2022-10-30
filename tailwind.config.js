/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1d9bf0",
        primaryDark: "#1a8cd8",
        green: "#00ba7c",
        pink: "#f91880",
      },
      spacing: {
        mh: "32rem",
        tweet: "29rem",
      },
    },
  },
  plugins: [],
};
