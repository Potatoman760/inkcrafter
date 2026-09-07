/**
 * Every player-facing string owned by the player itself.
 *
 * Story text, game titles, stat/item names, and other bundle-authored data do
 * not belong here. Named placeholders keep dynamic UI phrases translatable
 * without making scenes responsible for English word order or punctuation.
 */
export const UI_TEXT = {
  loading: "Loading…",

  mainMenuNewGame: "New Game",
  mainMenuContinue: "Continue",
  mainMenuLoadGame: "Load Game",
  mainMenuSettings: "Settings",
  mainMenuGallery: "Gallery",

  galleryTitle: "Gallery",
  galleryBack: "Back",
  galleryLocked: "Locked",
  galleryEmpty: "Nothing has been added to this gallery yet.",

  settingsTitle: "Settings",
  settingsAudio: "Audio",
  settingsDisplayAccessibility: "Display & Accessibility",
  settingsMasterVolume: "Master Volume",
  settingsMusicVolume: "Music Volume",
  settingsSfxVolume: "SFX Volume",
  settingsVolumeValue: "{value}%",
  settingsFullscreen: "Fullscreen",
  settingsDialogueText: "Dialogue Text",
  settingsTextSpeed: "Text Speed",
  settingsReducedMotion: "Reduced Motion",
  settingsHighContrast: "High Contrast UI",
  settingsOn: "On",
  settingsOff: "Off",
  settingsSmall: "Small",
  settingsNormal: "Normal",
  settingsLarge: "Large",
  settingsSlow: "Slow",
  settingsFast: "Fast",
  settingsInstant: "Instant",
  settingsClose: "Close",

  mainMenuQuit: "Quit",

  saveMenuTitle: "Save / Load",
  saveMenuResume: "Resume",
  saveMenuReturnToTitle: "Return to Title",
  saveMenuSlot: "{slot}. {description}",
  saveMenuQuickSlot: "Quick {slot}: {description}",
  saveMenuAutoSlot: "Auto {slot}: {description}",
  saveMenuPageAuto: "Auto",
  saveMenuPageQuick: "Quick",
  saveMenuDescription: "{label} — {date}{stale}",
  saveMenuOlderDraft: "  (older draft)",
  saveMenuEmptySlot: "— empty —",
  saveMenuSave: "Save",
  saveMenuLoad: "Load",
  saveMenuDefaultLabel: "Saved game",

  mapClose: "Close Map",

  characterTitle: "Character",
  characterClose: "Close",
  /** The word prompt: a question the reader answers once, in their own words. */
  wordHint: "This is what the story will call it from now on. Leave it as it is to keep the story's own word.",
  wordKeep: "Keep as written",
  wordUse: "Use this word",
  characterStats: "Stats",
  characterNoStats: "No stats",
  characterStatValue: "{label}: {value}",
  characterInventory: "Inventory",
  characterEmptyInventory: "Empty",
  characterInventoryItem: "• {item}",
  characterYes: "Yes",
  characterNo: "No",
  characterMissingValue: "—",
  characterScrollMarker: "↕",

  toolbarMenuIcon: "☰",
  toolbarMenuLabel: "Menu",
  toolbarMapIcon: "🗺",
  toolbarMapLabel: "Map",
  toolbarCharacterIcon: "👤",
  toolbarCharacterLabel: "Character",

  quickBack: "◀ Back",
  quickSkip: "▶▶ Skip",
  quickStop: "■ Stop",
  quickSave: "Q.Save",
  quickLoad: "Q.Load",
  choiceSaveLabel: "Choice",
  autosaveDefaultLabel: "Checkpoint",

  dialogueMoreMarker: "▾",

  loadErrorTitle: "No story to play",
  loadErrorLocation: "Nothing loadable at <code>{base}</code>.",
  loadErrorHelp:
    "Export a game from InkCrafter into a folder under <code>game/</code>, then play it with <code>?game=&lt;folder&gt;</code> — or point at a bundle served elsewhere with <code>?bundle=&lt;url&gt;</code>.",
  bundleLoadFailed: "{url} could not be loaded ({status} {statusText}).",
  bundleInvalidJson: "{url} is not valid JSON.",
} as const;

/** Replace named placeholders in a UI catalogue entry. */
export function formatUiText(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder,
  );
}
