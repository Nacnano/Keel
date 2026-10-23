import { Link } from 'react-router';
import { AudioLines, ChartNoAxesColumn, ChevronRight, Ear, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Group, PageHeader } from '../kit';

const tools = [
  {
    to: '/analyze',
    title: 'Analyze a song',
    description: 'Find the key and chords in an audio file.',
    icon: AudioLines,
  },
  {
    to: '/train',
    title: 'Ear training',
    description: 'Practice recognizing chords, progressions and keys.',
    icon: Ear,
  },
  {
    to: '/stats',
    title: 'Stats',
    description: 'Your playing time, streaks and the keys you play most.',
    icon: ChartNoAxesColumn,
  },
];

export function ToolsScreen() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl pb-[max(env(safe-area-inset-bottom),32px)] lg:px-4">
        <PageHeader title="Tools" subtitle="A little help before or after you play." />
        <div className="flex flex-col gap-8 px-4 pt-4">
          <Group aria-label="Music tools">
            {tools.map((tool) => (
              <ToolLink key={tool.to} {...tool} />
            ))}
          </Group>
          <Group aria-label="App settings">
            <ToolLink
              to="/settings"
              title="Settings"
              description="Choose your input, listening preferences and appearance."
              icon={Settings}
            />
          </Group>
        </div>
      </div>
    </div>
  );
}

function ToolLink({
  to,
  title,
  description,
  icon: Icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-20 items-center gap-4 px-4 py-4 transition-colors hover:bg-fill-4 active:bg-fill-3"
    >
      <Icon className="size-5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-label">{title}</span>
        <span className="mt-1 block text-subhead text-label-2">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-label-3" aria-hidden />
    </Link>
  );
}
