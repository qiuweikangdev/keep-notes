/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border-color)",
        input: "var(--border-color)",
        ring: "var(--accent-color)",
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        primary: {
          DEFAULT: "var(--accent-color)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--text-primary)",
        },
        destructive: {
          DEFAULT: "#ff4d4f",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--hover-bg)",
          foreground: "var(--text-primary)",
        },
        popover: {
          DEFAULT: "var(--bg-primary)",
          foreground: "var(--text-primary)",
        },
        card: {
          DEFAULT: "var(--bg-primary)",
          foreground: "var(--text-primary)",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require("@tailwindcss/forms")],
};
