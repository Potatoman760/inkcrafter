import type { LoadedBundle } from "@/bundle/loadBundle";
import {
  customDialogueFontName,
  type DialogueTextStyle,
} from "@/bundle/spec/bundle/gameDoc";

/** Install every custom dialogue font before Phaser measures its first text object. */
export async function loadGameFonts(bundle: LoadedBundle): Promise<void> {
  const files = [...new Set(
    [bundle.game.dialogue.text, bundle.game.dialogue.name]
      .filter(isCustomFont)
      .map((style) => style.file),
  )];

  await Promise.all(files.map(async (file) => {
    const asset = bundle.manifest.assets.find((candidate) => candidate.path === file);
    if (!asset || asset.kind !== "font") {
      console.error(`Custom font ${file} is not present in the bundle.`);
      return;
    }

    try {
      const url = await bundle.assetUrl(file);
      const face = new FontFace(customDialogueFontName(file), `url(${JSON.stringify(url)})`);
      await face.load();
      document.fonts.add(face);
    } catch (error) {
      // dialogueFontFamily includes a generic sans-serif fallback, so a bad
      // font never prevents the game from launching or leaves text invisible.
      console.error(`Could not load custom font ${file}.`, error);
    }
  }));
}

function isCustomFont(style: DialogueTextStyle): style is DialogueTextStyle & { file: string } {
  return style.font === "custom" && style.file !== null;
}
