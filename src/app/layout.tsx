import type { Metadata } from 'next';
import './legacy.css';
import './theme.css';

export const metadata: Metadata = { title: '한숨, 그리고 시작 | 윤솔 인트라넷' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
