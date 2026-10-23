import { FileJson, FileText, Link2, Share } from 'lucide-react';
import type { SessionFull } from '@/data';
import { downloadChart, downloadJSON, runExport, shareChartWithToast } from './exportActions';
import { MenuItem } from './Menu';

type GetFull = () => Promise<SessionFull | undefined>;

/** "Share…": the system share sheet with the text chart, or Copy where there is none. */
export function ShareItem({ getFull }: { getFull: GetFull }) {
  return (
    <MenuItem icon={<Share />} onSelect={() => void runExport(getFull, shareChartWithToast)()}>
      Share…
    </MenuItem>
  );
}

/** "Share link…" for cloud sync; render it only when sync is configured. */
export function ShareLinkItem({ onSelect }: { onSelect(): void }) {
  return (
    <MenuItem icon={<Link2 />} onSelect={onSelect}>
      Share link…
    </MenuItem>
  );
}

/** Download the chart as plain text or the whole session as JSON. */
export function DownloadItems({ getFull }: { getFull: GetFull }) {
  return (
    <>
      <MenuItem icon={<FileText />} onSelect={() => void runExport(getFull, downloadChart)()}>
        Download .txt
      </MenuItem>
      <MenuItem icon={<FileJson />} onSelect={() => void runExport(getFull, downloadJSON)()}>
        Download JSON
      </MenuItem>
    </>
  );
}
