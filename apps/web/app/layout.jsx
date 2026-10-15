import './globals.css'

export const metadata = {
  title: 'Cadence',
  description: 'A personal time-blocking scheduler: plan the day in blocks, and see where the hours actually went.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
