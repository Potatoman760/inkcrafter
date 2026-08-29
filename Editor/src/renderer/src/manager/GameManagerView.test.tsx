// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyMap } from "@shared/bundle/mapDoc";
import { emptyNpcs } from "@shared/bundle/npcDoc";
import { emptyMedia } from "@shared/mediaDoc";
import { emptyGallery } from "@shared/bundle/galleryDoc";
import { emptyGame } from "@shared/bundle/gameDoc";
import { emptyAchievements } from "@shared/bundle/achievementDoc";
import { emptyMinigames } from "@shared/bundle/minigameDoc";
import { addStat, emptyStats, newStat } from "@shared/statsDoc";
import { emptyPlan } from "@shared/planDoc";
import {
  GameManagerView,
  MANAGER_SECTIONS,
  SECTION_FILES,
  type ManagerSection,
} from "./GameManagerView";

/**
 * The window four dialogs became. What matters is that a section is *one* thing
 * on screen at a time, that its own controls came with it, and that closing is
 * in one place — the four copies of the Escape handler it replaced are how the
 * second one stopped matching the first.
 */

function manager(section: ManagerSection = "media") {
  const onSection = vi.fn();

  render(
    <GameManagerView
      project={null}
      plan={emptyPlan()}
      section={section}
      onSection={onSection}
      media={{
        doc: emptyMedia(),
        files: [],
        saving: false,
        error: null,
        onChange: vi.fn(),
        onRescan: vi.fn(),
        onReveal: vi.fn(),
      }}
      stats={{
        doc: addStat(emptyStats(), newStat("Courage")),
        saving: false,
        error: null,
        findUses: async () => [],
        onChange: vi.fn(),
        onOpenUse: vi.fn(),
      }}
      cast={{ doc: emptyNpcs(), saving: false, error: null, onChange: vi.fn() }}
      map={{
        doc: emptyMap(),
        saving: false,
        error: null,
        knots: [],
        knotSources: [],
        backgrounds: [],
        backgroundUrl: () => null,
        hotspots: [],
        hotspotUrl: () => null,
        onChange: vi.fn(),
      }}
      gallery={{
        doc: emptyGallery(),
        saving: false,
        error: null,
        onChange: vi.fn(),
      }}
      achievements={{
        doc: emptyAchievements(),
        saving: false,
        error: null,
        onChange: vi.fn(),
      }}
      game={{ doc: emptyGame(), saving: false, error: null, onChange: vi.fn() }}
      minigames={{
        doc: emptyMinigames(),
        saving: false,
        error: null,
        onChange: vi.fn(),
        onTest: vi.fn(),
      }}
    />,
  );

  return { onSection };
}

describe("GameManagerView", () => {
  it("offers every catalogue as a section", () => {
    manager();

    for (const label of ["Media", "Variables", "Cast", "Map", "Gallery", "Config", "Minigames"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }

    // Steam moved a level down: it is something you configure about the game
    // rather than one of the catalogues the story is made of.
    expect(screen.queryByRole("tab", { name: "Steam" })).not.toBeInTheDocument();
  });

  // Two levels, as the Media section already has: Steam is a thing you
  // configure about the game, not one of the catalogues the story is made of.
  it("puts Steam and Game Settings inside Config", async () => {
    manager("config");

    expect(screen.getByRole("tab", { name: "Steam" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Game Settings" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Game Settings" }));
    expect(screen.getByText("Startup background")).toBeInTheDocument();
  });

  it("asks for the section rather than switching itself, so the app can deep-link", async () => {
    const { onSection } = manager();

    await userEvent.click(screen.getByRole("tab", { name: "Cast" }));

    expect(onSection).toHaveBeenCalledWith("cast");
  });

  // One section at a time. Rendering all four and hiding three would keep four
  // sets of draft state alive and load four catalogues that are not being read.
  it("shows only the section it was given", () => {
    manager("stats");

    expect(screen.getByRole("tab", { name: "Variables" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Stats\s*\(1\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Characters/ }),
    ).not.toBeInTheDocument();
  });

  it("carries each section its own controls", async () => {
    manager("media");
    expect(screen.getByRole("button", { name: "Rescan" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add someone" }),
    ).not.toBeInTheDocument();
  });

  /**
   * No overlay, no Close, no Escape of its own. It is a view now — you leave it
   * by going somewhere else — and the right panel beside it is the whole reason
   * it stopped being a dialog.
   */
  it("is a view rather than a dialog", () => {
    manager();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  });
});

describe("SECTION_FILES", () => {
  it("names the file each section actually edits", () => {
    // The cast section is called `cast` and its file is `npcs.json`. Deriving
    // the name from the section id gave a header naming a file that has never
    // existed, which read as proof the assistant had written it.
    expect(SECTION_FILES.cast).toBe("npcs.json");
    expect(SECTION_FILES).toEqual({
      media: "media.json",
      stats: "stats.json",
      cast: "npcs.json",
      map: "map.json",
      gallery: "gallery.json",
      config: "game.json",
      minigames: "minigames.json",
    });
  });

  it("covers every section, so a new one cannot ship unnamed", () => {
    expect(Object.keys(SECTION_FILES).sort()).toEqual(
      [...MANAGER_SECTIONS].sort(),
    );
  });
});
