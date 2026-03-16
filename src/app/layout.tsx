import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeighborhoodPulse — Montgomery, AL",
  description: "Community Health Intelligence Dashboard for the City of Montgomery, Alabama. Real-time neighborhood health scoring powered by Montgomery's Open Data Portal.",
  keywords: "Montgomery, Alabama, neighborhood health, city analytics, open data, public safety",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
