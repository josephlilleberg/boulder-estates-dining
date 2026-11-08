import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PAGE, type Paper } from './model';
import type { PageData } from './pages';
import { SheetPage } from './SheetPage';

// Printing renders the same SheetPage components at true size into a hidden
// container, sets the paper with @page, and opens the system print dialog
// (which also offers Save as PDF). One dialog per paper size: the setup sheet
// is 11 × 17 and the others are Letter, and a single job can't reliably feed a
// printer two paper sizes.

const PAPER_ORDER: Paper[] = ['tabloid', 'letter'];

function waitForAfterPrint(): Promise<void> {
  return new Promise((resolve) => {
    // Chromium's window.print() blocks until the dialog closes; afterprint covers webviews where it doesn't.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', finish);
      resolve();
    };
    window.addEventListener('afterprint', finish);
    window.print();
    setTimeout(finish, 0);
  });
}

export async function printPages(pages: PageData[]): Promise<void> {
  for (const paper of PAPER_ORDER) {
    const group = pages.filter((p) => p.paper === paper);
    if (!group.length) continue;
    const { w, h } = PAGE[paper];
    const style = document.createElement('style');
    style.textContent = `@page { size: ${w / 96}in ${h / 96}in; margin: 0; }`;
    const host = document.createElement('div');
    host.className = 'print-root';
    document.head.appendChild(style);
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      flushSync(() =>
        root.render(
          <>
            {group.map((p) => (
              <SheetPage key={p.key} page={p} shadow={false} />
            ))}
          </>,
        ),
      );
      await document.fonts.ready;
      await waitForAfterPrint();
    } finally {
      root.unmount();
      host.remove();
      style.remove();
    }
  }
}
