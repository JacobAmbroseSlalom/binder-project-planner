import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

import { ToastProvider } from '@/shared/feedback';
import { AppHeader, AppHeaderTitleProvider } from '@/shared/navigation';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Binder Project Planner',
  description: 'Plan how to organize trading and collectible cards into binders.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Mounted once so every page can start/update save-status toasts
            through useSaveStatusToast (story 3). */}
        <ToastProvider>
          {/* Persistent header (every page) with a link back to the home
              page. The title provider wraps both the header and the routed
              page so a page (e.g. a binder view/edit page) can surface its
              title in the header bar. */}
          <AppHeaderTitleProvider>
            <AppHeader />
            {children}
          </AppHeaderTitleProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
