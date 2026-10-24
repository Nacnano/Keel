/*
  Router links styled like kit buttons (a <Link> cannot be a kit <Button>). Local kit addition;
  shared by Library, Review and the public Share page.
*/

/** Like `Button variant="filled"`: the one primary action. */
export const FILLED_LINK =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-action px-5 text-subhead font-semibold whitespace-nowrap text-accent-fg transition-[filter] duration-150 hover:brightness-110 active:brightness-95';

/** Like `Button variant="gray"`. */
export const GRAY_LINK =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-fill-3 px-4 text-subhead font-medium whitespace-nowrap text-label transition-colors duration-150 hover:bg-fill-2 active:bg-fill';

/** Like `Button variant="plain"` (toolbar text button). */
export const PLAIN_LINK =
  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 text-subhead font-medium whitespace-nowrap text-accent transition-colors duration-150 hover:bg-fill-4 active:bg-fill-3';
