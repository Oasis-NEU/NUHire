/** @type {import('tailwindcss').Config} */

// Primitives from the Figma "Design Systems - Source of Truth" file
// (Systems > SOT/App UI foundations). Each hex appears once; the scales below
// reuse them so a design change is a one-line edit.
const neuRed = '#DA192C';
const neuRed300 = '#EE6D79';
const neuRed100 = '#F9C8CD';
const neuRed900 = '#800F1A';
const lightNeuRed = '#F48F8F';
const red700 = '#B01322';
const red50 = '#FEF1F2';

const steelBlue = '#3F61A1';
const steelBlue300 = '#7B97CB';
const steelBlue100 = '#C4D1E8';
const steelBlue900 = '#223558';
const blue100 = '#E4EAF5';

const gray0 = '#F7F7F7';
const gray05 = '#EDEDED';
const gray1 = '#DDDDDD';
const gray2 = '#8A8A8A';
const gray3 = '#6B6B6B';
const gray4 = '#484848';
const gray5 = '#1A1A1A';

// Tailwind's default gray, red and blue scales are replaced so existing
// gray-*/red-*/blue-* classes render the design system. Figma defines fewer
// steps than Tailwind; a missing step takes the nearest Figma value. Every step
// is set because `extend` merges by key and would keep Tailwind's otherwise.
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',

    // Or if using `src` directory:
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'neu-red': neuRed,
        'steel-blue': steelBlue,
        gray: {
          50: gray0,
          100: gray05,
          200: gray1,
          300: gray1,
          400: gray2,
          500: gray3,
          600: gray4,
          700: gray4,
          800: gray5,
          900: gray5,
          950: gray5,
        },
        red: {
          50: red50,
          100: neuRed100,
          200: lightNeuRed,
          300: neuRed300,
          400: neuRed300,
          500: neuRed,
          600: neuRed,
          700: red700,
          800: neuRed900,
          900: neuRed900,
          950: neuRed900,
        },
        blue: {
          50: blue100,
          100: blue100,
          200: steelBlue100,
          300: steelBlue300,
          400: steelBlue300,
          500: steelBlue,
          600: steelBlue,
          700: steelBlue900,
          800: steelBlue900,
          900: steelBlue900,
          950: steelBlue900,
        },
      },
      fontFamily: {
        sans: ['var(--font-lato)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
