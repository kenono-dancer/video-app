/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                background: '#0E1117',
                card: '#1E1E1E',
                accent: '#FF8C00',
            },
            backgroundImage: {
                'glass': 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0))',
            },
        },
    },
    plugins: [],
}
