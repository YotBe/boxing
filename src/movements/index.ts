import type { MovementDefinition } from '../engine/types';

/**
 * The movement registry. Every `*.json` file in this folder is loaded
 * automatically via Vite's glob import. Adding a new movement is therefore a
 * pure-data change: drop a JSON file here and it appears in the app. No engine
 * code and no registration boilerplate to touch.
 */
const modules = import.meta.glob<MovementDefinition>('./*.json', {
  eager: true,
  import: 'default',
});

export const movements: MovementDefinition[] = Object.values(modules).sort(
  (a, b) => a.name.localeCompare(b.name),
);
