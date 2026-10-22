import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';
import { PLAIN_LINK } from '../library/linkStyles';

export function ToolsBackLink() {
  return (
    <div className="px-1 pt-2">
      <Link to="/tools" className={PLAIN_LINK}>
        <ChevronLeft className="size-5" aria-hidden />
        Tools
      </Link>
    </div>
  );
}
