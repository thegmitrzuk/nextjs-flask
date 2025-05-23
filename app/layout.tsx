import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Meeting Guru',
  description: 'AI-powered meeting assistant with real-time transcription and insights',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/image.png" sizes="any" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
