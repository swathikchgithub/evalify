import type { Metadata } from 'next';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'Evalify — LLM Evaluation Platform',
  description: 'Compare LLMs side by side, test custom endpoints, and run MT-Bench style AI evaluations with BYOJ Judge.',
  icons: { icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer style={{textAlign:'center', padding:'24px 0 20px', fontSize:11, color:'var(--text-muted)'}}>
          {'Developed by '}
          <span style={{color:'#c9d1d9'}}>Swathi Kumar Chadalavada</span>
          {' · '}
          <a href="https://github.com/swathikchgithub/evalify" target="_blank" rel="noopener noreferrer"
            style={{color:'#818cf8'}}>
            GitHub ↗
          </a>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
