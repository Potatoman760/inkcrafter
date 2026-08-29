import { writeCastTool } from './castTools'
import { writeCodexTool, writeStatsTool } from './catalogueTools'
import { removeBackgroundTool } from './cutoutTools'
import { generateImageTool } from './imageTools'
import { writeMapTool } from './mapTools'
import { writeMediaTool } from './mediaTools'
import { writePlanTool } from './planTools'
import { TOOLS, type ToolDefinition } from './workspaceTools'

/**
 * Every tool the assistant has, in the order it is offered them.
 *
 * Kept in its own module so `workspaceTools` does not have to import the
 * document tools that import it back. The file tools come first because they
 * are what most requests need; the rest are one per document the app owns, in
 * the order a story is usually built — plan, then what it tracks, then who and
 * what is in it, then where.
 *
 * Each exists because writing the file is not enough, and the shortfall is
 * silent. Two regenerate the ink declarations without which the catalogue is
 * invisible to the story; one mints the ids the plan links through; one checks
 * that a hotspot points at a knot that exists; one that a look points at a file
 * that exists; one files a codex entry in a library the project actually links.
 * A model told only "write the JSON" gets all six of those wrong in ways
 * nothing reports until much later.
 *
 * The last two are the odd ones. Every tool above files something that already
 * exists; those two change pixels on the author's own machine — one draws a
 * picture, one takes the white card out from behind it — and then file the
 * result. They are here for the same reason as the rest all the same: writing
 * the file is not enough, and a picture nobody catalogued, or a look still
 * pointing at the uncut version, is art the story cannot show.
 */
export const ALL_TOOLS: ToolDefinition[] = [
  ...TOOLS,
  writePlanTool,
  writeStatsTool,
  writeCastTool,
  writeMediaTool,
  writeMapTool,
  writeCodexTool,
  generateImageTool,
  removeBackgroundTool
]
