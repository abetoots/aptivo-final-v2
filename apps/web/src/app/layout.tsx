import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aptivo',
  description: 'AI-augmented workflow automation platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
