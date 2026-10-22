import type { ReactNode } from 'react';
import { ChevronDown, Copy, FileJson, FileText, Link2 } from 'lucide-react';
import type { SessionFull } from '@/data';
import { Button } from '../../kit';
import { toast } from '../../components/toastStore';
import { copyChart, downloadChart, downloadJSON, runExport } from './exportActions';
import { Menu, MenuItem, MenuSeparator } from './Menu';

export interface ExportMenuProps {
  /** Loads the full session on demand (library rows only hold the session row). */
  getFull(): Promise<SessionFull | undefined>;
  label?: string;
  className?: string;
  align?: 'left' | 'right';
  /** Adds a "Share link…" item. */
  share?: {
    onSelect(): void;
    /** When set, the item is disabled and this hint is shown under it. */
    disabledReason?: string;
  };
  /** Custom trigger content (e.g. an icon); defaults to a gray "Export" button. */
  icon?: ReactNode;
}

/** Copy chart / download text / download JSON, as menu items (shared by the row menu). */
export function ExportItems({ getFull }: Pick<ExportMenuProps, 'getFull'>) {
  return (
    <>
      <MenuItem
        icon={<Copy />}
        onSelect={() =>
          void runExport(getFull, async (full) => {
            const how = await copyChart(full);
            toast(how === 'copied' ? 'Chord chart copied' : 'Chord chart downloaded', {
              tone: 'success',
            });
          })()
        }
      >
        Copy chord chart
      </MenuItem>
      <MenuItem icon={<FileText />} onSelect={() => void runExport(getFull, downloadChart)()}>
        Download chart (.txt)
      </MenuItem>
      <MenuItem icon={<FileJson />} onSelect={() => void runExport(getFull, downloadJSON)()}>
        Download JSON
      </MenuItem>
    </>
  );
}

/** "Export" button opening a menu with the export actions and an optional share item. */
export function ExportMenu({
  getFull,
  label = 'Export',
  className,
  align = 'right',
  share,
  icon,
}: ExportMenuProps) {
  return (
    <span className={className}>
      <Menu
        align={align === 'right' ? 'end' : 'start'}
        width={248}
        aria-label={label}
        trigger={(t) =>
          icon ? (
            <Button icon variant="plain" aria-label={label} {...t}>
              {icon}
            </Button>
          ) : (
            <Button
              variant="gray"
              trailing={<ChevronDown className="size-3.5 opacity-60" aria-hidden />}
              {...t}
            >
              {label}
            </Button>
          )
        }
      >
        <ExportItems getFull={getFull} />
        {share && (
          <>
            <MenuSeparator />
            <MenuItem
              icon={<Link2 />}
              disabled={!!share.disabledReason}
              hint={share.disabledReason}
              onSelect={share.onSelect}
            >
              Share link…
            </MenuItem>
          </>
        )}
      </Menu>
    </span>
  );
}
