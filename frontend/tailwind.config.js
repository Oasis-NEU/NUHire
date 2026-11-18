/** @type {import('tailwindcss').Config} */

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
      // From the "Design Systems - Source of Truth" Figma library's Palette.
      // Each scale runs light to dark.
      colors: {
        northeasternRed: '#da192c',
        red100: '#f9c8cd',
        red300: '#ee6d79',
        red700: '#800f1a',
        steelBlue: '#3f61a1',
        steel100: '#c4d1e8',
        steel300: '#7b97cb',
        steel700: '#223558',
        gray0: '#f7f7f7',
        gray1: '#dddddd',
        gray2: '#ababab',
        gray3: '#7f7f7f',
        gray4: '#484848',
        // A session that is open right now.
        live: '#1f3a2f',
        liveMint: '#80ffc5',

        // Older names, kept until the pages using them are rebuilt. sand and
        // navy are white and black, not what they say.
        northeasternBlack: '#000',
        northeasternWhite: '#fff',
        redHeader: '#da192c',
        sand: '#fff',
        navy: '#000',
        wood: '#D6C9B4',
        springWater: '#F7F9FB',
      },
      fontFamily: {
        rubik: ['Rubik', 'sans-serif'],
      },
      fontSize: {
        subheader: ['2rem', { lineHeight: 'normal' }],
      },
      boxShadow: {
        raised: '0 4px 2px rgba(0, 0, 0, 0.25)',
        pill: '0 4px 4px rgba(0, 0, 0, 0.25)',
        // Hover and pressed: the library swaps the raised shadow for this.
        pressed: 'inset 0 4px 4px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
