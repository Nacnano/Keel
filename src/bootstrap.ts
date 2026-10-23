/**
 * Side effects that must run before any app module evaluates. `main.tsx`
 * imports this first; ES modules evaluate imports in order, so this finishes
 * before `./app/App` and its dependencies load.
 */
import { migrateLegacyLocalStorage } from './data/legacyStorage';

migrateLegacyLocalStorage();
