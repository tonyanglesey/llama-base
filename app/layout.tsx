import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "lla.ma · base",
  description: "Self-hosted Postgres management console for lla.ma",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Dark is the default; the no-flash script below upgrades it to the saved
    // choice before paint. Theme is driven by the `data-theme` attribute that
    // @lla-ma/ui's tokens key off of.
    <html lang="en" data-theme="dark">
      <body className="min-h-screen antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
