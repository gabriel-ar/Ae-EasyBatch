/**
 * Shared application state using Svelte 5 runes
 * Only contains state that needs to be accessed across multiple components
 */

import type { Tabs } from "./Settings.svelte";

/**
 * Writable state class for shared application state
 */
class AppStateStore {
  /** Whether there are no templates found in the project */
  no_templs = $state(false);
  
  /** Last opened tab (for tracking tab changes) */
  last_opened_tab = $state<Tabs | null>(null);
}

export const app_state = new AppStateStore();

