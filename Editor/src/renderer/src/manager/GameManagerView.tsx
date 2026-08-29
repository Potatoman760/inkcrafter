import type { MapDocument } from "@shared/bundle/mapDoc";
import type { NpcDocument } from "@shared/bundle/npcDoc";
import type { KnotSource } from "@shared/inkKnots";
import type { HotspotState, MediaDocument } from "@shared/mediaDoc";
import type { StatsDocument } from "@shared/statsDoc";
import type { GalleryDocument } from "@shared/bundle/galleryDoc";
import type { AchievementDocument } from "@shared/bundle/achievementDoc";
import type { MinigameDocument } from "@shared/bundle/minigameDoc";
import type { PlanDocument } from "@shared/planDoc";
import type { Project } from "@shared/project";
import type { MediaFile, NameUse } from "@shared/types";
import { MapPanel } from "../map/MapPanel";
import { MediaPanel } from "../media/MediaPanel";
import { CastPanel } from "../npcs/CastPanel";
import { StatsPanel } from "../stats/StatsPanel";
import { GalleryPanel } from "../gallery/GalleryPanel";
import { AchievementPanel } from "../achievements/AchievementPanel";
import { MinigamePanel } from "../minigames/MinigamePanel";
import { type IconName } from "../design/Icon";
import { Tabs } from "../design/components";

/**
 * One view for everything the game is made of.
 *
 * These four were four dialogs and two of them were only in the app menu. They
 * are not four unrelated tools: media, stats, cast and map are the story's data,
 * they are edited in the same sitting, and three of the four already hold a
 * `# tag:` or a variable that points at another.
 *
 * A view rather than a dialog, because a dialog has no right-hand panel beside
 * it — and the assistant belongs beside the catalogues more than anywhere else,
 * where "add five potions to the alchemy set" is the obvious thing to say.
 *
 * Two rows of tabs, deliberately. The top row is *which catalogue*, the row
 * under it is that catalogue's own — Backgrounds / Video, Stats / Items — and
 * flattening the two would put six peers in a line. Each section keeps whatever
 * its old header held at the right of its own row, because those buttons act on
 * the section rather than on the view.
 *
 * Characters are not one of the media tabs. A character's sprites are edited in
 * the cast, beside the state the story tracks about them, because a person is
 * one thing — which is why the cast section is handed the media document too.
 */

export const MANAGER_SECTIONS = [
  "media",
  "stats",
  "cast",
  "map",
  "gallery",
  "steam",
  "minigames",
] as const;
export type ManagerSection = (typeof MANAGER_SECTIONS)[number];

const SECTION_LABELS: Record<ManagerSection, string> = {
  media: "Media",
  stats: "Variables",
  cast: "Cast",
  map: "Map",
  gallery: "Gallery",
  steam: "Steam",
  minigames: "Minigames",
};

/**
 * The file each section edits.
 *
 * Held here rather than derived from the section id, which is what the toolbar
 * used to do — and got wrong, because the cast section is called `cast` and its
 * file is `npcs.json`. A header naming a file that has never existed is worse
 * than no header at all: it was read as proof the file had been written.
 */
export const SECTION_FILES: Record<ManagerSection, string> = {
  media: "media.json",
  stats: "stats.json",
  cast: "npcs.json",
  map: "map.json",
  gallery: "gallery.json",
  steam: "achievements.json",
  minigames: "minigames.json",
};

/** One glyph per catalogue, so the row reads before it is read. */
const SECTION_ICONS: Record<ManagerSection, IconName> = {
  media: "image",
  stats: "package",
  cast: "users",
  map: "map",
  gallery: "image",
  steam: "trophy",
  minigames: "gauge",
};

interface GameManagerViewProps {
  /** The plan, for offering the map's knots grouped by act and chapter. */
  plan: PlanDocument;
  section: ManagerSection;
  onSection: (section: ManagerSection) => void;
  /** Which project's folder a picture would be brought into. */
  project: Project | null;

  media: {
    doc: MediaDocument;
    files: MediaFile[];
    saving: boolean;
    error: string | null;
    onChange: (next: MediaDocument) => void;
    onRescan: () => void;
    onReveal: () => void;
  };

  stats: {
    doc: StatsDocument;
    saving: boolean;
    error: string | null;
    findUses: (name: string) => Promise<NameUse[]>;
    onChange: (next: StatsDocument) => void;
    onOpenUse: (use: NameUse) => void;
  };

  cast: {
    doc: NpcDocument;
    saving: boolean;
    error: string | null;
    onChange: (next: NpcDocument) => void;
  };

  map: {
    doc: MapDocument;
    saving: boolean;
    error: string | null;
    knots: string[];
    knotSources: KnotSource[];
    backgrounds: string[];
    backgroundUrl: (name: string) => string | null;
    hotspots: string[];
    hotspotUrl: (name: string, state: HotspotState) => string | null;
    onChange: (next: MapDocument) => void;
  };

  gallery: {
    doc: GalleryDocument;
    saving: boolean;
    error: string | null;
    onChange: (next: GalleryDocument) => void;
  };

  achievements: {
    doc: AchievementDocument;
    saving: boolean;
    error: string | null;
    onChange: (next: AchievementDocument) => void;
  };
  minigames: {
    doc: MinigameDocument;
    saving: boolean;
    error: string | null;
    onChange: (next: MinigameDocument) => void;
    onTest: (name: string) => Promise<void>;
  };
}

export function GameManagerView({
  section,
  onSection,
  project,
  plan,
  media,
  stats,
  cast,
  map,
  gallery,
  achievements,
  minigames,
}: GameManagerViewProps): React.JSX.Element {
  return (
    <div
      className={`manager-view manager-${section}`}
      aria-label="Game Manager"
    >
      <Tabs
        className="manager-tabs"
        level="pane"
        label="Sections"
        value={section}
        onChange={(next) => onSection(next as ManagerSection)}
        items={MANAGER_SECTIONS.map((candidate) => ({
          value: candidate,
          label: SECTION_LABELS[candidate],
          icon: SECTION_ICONS[candidate],
        }))}
      />

      {section === "media" && <MediaPanel {...media} project={project} />}
      {section === "stats" && <StatsPanel {...stats} />}
      {/* The cast edits the character half of the media catalogue, so it takes
          the same document and files the media section does. */}
      {section === "cast" && (
        <CastPanel
          {...cast}
          project={project}
          media={media.doc}
          files={media.files}
          onMediaChange={media.onChange}
          onMediaRescan={media.onRescan}
        />
      )}
      {section === "map" && (
        <MapPanel {...map} plan={plan} stats={stats.doc} npcs={cast.doc} />
      )}
      {section === "gallery" && (
        <GalleryPanel {...gallery} media={media.doc} files={media.files} />
      )}
      {section === "steam" && (
        <AchievementPanel
          {...achievements}
          stats={stats.doc}
          npcs={cast.doc}
        />
      )}
      {section === "minigames" && (
        <MinigamePanel
          {...minigames}
          project={project}
          stats={stats.doc}
          media={media.doc}
          files={media.files}
          onMediaChange={media.onChange}
          onMediaRescan={media.onRescan}
        />
      )}
    </div>
  );
}
