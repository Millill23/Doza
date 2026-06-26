/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0E0D0A",
          800: "#15130E",
          700: "#1E1B14",
          600: "#2A2519",
        },
        gold: {
          300: "#F2D98D",
          400: "#E3C16F",
          500: "#C9A24B",
          600: "#A57C2B",
        },
        wood: {
          400: "#A77E4F",
          500: "#7C5A35",
          600: "#5A3F24",
        },
        botanical: {
          300: "#8FA67A",
          500: "#4F6F44",
          700: "#2C3E28",
        },
        ivory: {
          DEFAULT: "#F5F1E8",
          muted: "#B6AD98",
          faint: "#8A8170",
        },
      },
      fontFamily: {
        serif: ["Cormorant", "Georgia", "serif"],
        sans: ["Montserrat", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gold-gradient":
          "linear-gradient(135deg,#F2D98D 0%,#C9A24B 45%,#A57C2B 100%)",
      },
      boxShadow: {
        gold: "0 0 24px rgba(201,162,75,.25)",
        "gold-lg": "0 8px 40px rgba(201,162,75,.20)",
      },
      letterSpacing: {
        luxe: "0.15em",
      },
    },
  },
  plugins: [],
};
