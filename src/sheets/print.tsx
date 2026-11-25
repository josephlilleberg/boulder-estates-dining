import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

// Printing renders the pages at true size into a hidden container, sets the paper with @page, and
// opens the system print dialog (which also offers Save as PDF). The app's own Print window
// (PrintDialog) picks the pages and calls this once per paper size.

// Windows (WebView2) opens its print preview without waiting: window.print() returns at once and the
// preview is drawn from the page afterwards, so the pages must stay until the window closes
// (afterprint). On the Mac the print sheet is drawn before print() returns.
const WINDOWS = /Windows/.test(navigator.userAgent);
// If afterprint never comes, don't leave the Print buttons stuck.
const GIVE_UP_MS = 10 * 60 * 1000;

function waitForAfterPrint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', finish);
      clearTimeout(timer);
      resolve();
    };
    window.addEventListener('afterprint', finish);
    window.print();
    timer = window.setTimeout(finish, WINDOWS ? GIVE_UP_MS : 0);
  });
}

/** One print dialog for pages `w` × `h` (CSS px at 96/in; a portrait page is taller than wide). */
export async function printSized(w: number, h: number, pages: ReactNode): Promise<void> {
  const style = document.createElement('style');
  style.textContent = `@page { size: ${w / 96}in ${h / 96}in; margin: 0; }`;
  const host = document.createElement('div');
  host.className = 'print-root';
  document.head.appendChild(style);
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(pages));
    await document.fonts.ready;
    await waitForAfterPrint();
  } finally {
    root.unmount();
    host.remove();
    style.remove();
  }
}
