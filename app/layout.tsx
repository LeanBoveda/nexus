import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Nexo · Rendimiento deportivo',
  description:
    'Planificación, seguimiento y evaluación para preparadores físicos de handball indoor y beach handball.',
  openGraph: {
    title: 'Nexo · Rendimiento deportivo',
    description: 'Rutinas flexibles, seguimiento individual y evaluaciones para equipos y deportistas.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Nexo · Rendimiento deportivo, conectado' }],
    locale: 'es_AR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexo · Rendimiento deportivo',
    description: 'Rutinas flexibles, seguimiento individual y evaluaciones para equipos y deportistas.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
