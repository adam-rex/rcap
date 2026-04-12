/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/**/*.{js,jsx,ts,tsx,html}",
      "./index.html",
    ],
    theme: {
      extend: {
        colors: {
          // The warm off-white/cream background color seen in the "What we do." section
          cream: {
            DEFAULT: '#F5F5F0', // Adjust slightly based on exact color picker if needed
            light: '#F8F8F5',
          },
          // Deep dark tones for text and button backgrounds
          charcoal: {
            DEFAULT: '#111111',
            light: '#2A2A2A',
          },
          // Muted tones for secondary text
          muted: '#E5E5E5', 
        },
        fontFamily: {
          // The elegant serif used for the primary headings ("Access to the deals...", "What we do.")
          serif: ['"Playfair Display"', '"GT Super"', 'Georgia', 'serif'],
          
          // The clean sans-serif used for the navigation and paragraph text
          sans: ['"Inter"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        },
        borderRadius: {
          // For the highly rounded navigation pill and network button
          'pill': '9999px',
          // For the slightly softer rounded corners on the "What we do" image cards
          'card': '1.25rem', // 20px
        },
        backgroundImage: {
          // Useful for the dark gradient overlay on the image cards to make text readable
          'card-gradient': 'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 50%)',
        }
      },
    },
    plugins: [],
  }