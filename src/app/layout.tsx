import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PhotoForge — AI Photo & Video Presentations',
  description: 'Create stunning motion presentations from your photos and videos with AI-powered face detection, smart templates, and cinematic effects.',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/logo.svg',
  },
  openGraph: {
    title: 'PhotoForge — AI Photo & Video Presentations',
    description: 'Drop photos & videos, pick a template, add music — export a cinematic video in seconds.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg-main text-white antialiased hex-pattern">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent-gold focus:text-bg-main focus:rounded-lg focus:font-bold">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
