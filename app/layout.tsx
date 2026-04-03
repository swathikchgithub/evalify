import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Evalify — LLM Evaluation Platform',
  description: 'Compare LLMs side by side, test custom endpoints, and run MT-Bench style AI evaluations with BYOJ Judge.',
  icons: { icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
