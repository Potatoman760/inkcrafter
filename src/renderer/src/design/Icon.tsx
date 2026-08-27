import bookOpen from 'lucide-static/icons/book-open.svg?raw'
import check from 'lucide-static/icons/check.svg?raw'
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw'
import chevronLeft from 'lucide-static/icons/chevron-left.svg?raw'
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw'
import chevronUp from 'lucide-static/icons/chevron-up.svg?raw'
import circleAlert from 'lucide-static/icons/circle-alert.svg?raw'
import circleDashed from 'lucide-static/icons/circle-dashed.svg?raw'
import circleDot from 'lucide-static/icons/circle-dot.svg?raw'
import clipboardPaste from 'lucide-static/icons/clipboard-paste.svg?raw'
import copy from 'lucide-static/icons/copy.svg?raw'
import cornerDownRight from 'lucide-static/icons/corner-down-right.svg?raw'
import feather from 'lucide-static/icons/feather.svg?raw'
import filePen from 'lucide-static/icons/file-pen.svg?raw'
import fileText from 'lucide-static/icons/file-text.svg?raw'
import folder from 'lucide-static/icons/folder.svg?raw'
import folderOpen from 'lucide-static/icons/folder-open.svg?raw'
import folderPlus from 'lucide-static/icons/folder-plus.svg?raw'
import gitBranch from 'lucide-static/icons/git-branch.svg?raw'
import gripVertical from 'lucide-static/icons/grip-vertical.svg?raw'
import image from 'lucide-static/icons/image.svg?raw'
import info from 'lucide-static/icons/info.svg?raw'
import lock from 'lucide-static/icons/lock.svg?raw'
import map from 'lucide-static/icons/map.svg?raw'
import mapPin from 'lucide-static/icons/map-pin.svg?raw'
import maximize2 from 'lucide-static/icons/maximize-2.svg?raw'
import packageIcon from 'lucide-static/icons/package.svg?raw'
import panelRight from 'lucide-static/icons/panel-right.svg?raw'
import pencil from 'lucide-static/icons/pencil.svg?raw'
import play from 'lucide-static/icons/play.svg?raw'
import plug from 'lucide-static/icons/plug.svg?raw'
import plus from 'lucide-static/icons/plus.svg?raw'
import rotateCcw from 'lucide-static/icons/rotate-ccw.svg?raw'
import save from 'lucide-static/icons/save.svg?raw'
import eye from 'lucide-static/icons/eye.svg?raw'
import gauge from 'lucide-static/icons/gauge.svg?raw'
import messageCircle from 'lucide-static/icons/message-circle.svg?raw'
import music from 'lucide-static/icons/music.svg?raw'
import scissors from 'lucide-static/icons/scissors.svg?raw'
import search from 'lucide-static/icons/search.svg?raw'
import send from 'lucide-static/icons/send.svg?raw'
import settings from 'lucide-static/icons/settings.svg?raw'
import slidersHorizontal from 'lucide-static/icons/sliders-horizontal.svg?raw'
import sparkles from 'lucide-static/icons/sparkles.svg?raw'
import trash2 from 'lucide-static/icons/trash-2.svg?raw'
import triangleAlert from 'lucide-static/icons/triangle-alert.svg?raw'
import trophy from 'lucide-static/icons/trophy.svg?raw'
import users from 'lucide-static/icons/users.svg?raw'
import wandSparkles from 'lucide-static/icons/wand-sparkles.svg?raw'
import x from 'lucide-static/icons/x.svg?raw'

/**
 * The house icon set, and all of it.
 *
 * The readme's list plus four Lucide chevrons. The set names nothing for
 * "move this up", "move it down", "go back" or "go on to the next one", and
 * all four affordances exist here; a chevron is the same family and the same
 * weight, so it is an extension rather than a second vocabulary.  and  join
 * them for the file tree, which makes folders and renames what is in them.
 *
 * `file-pen` joins them for opening a Scene's ink to write in it.  alone
 * already means *rename* in the file tree, and a page with no pencil on it read
 * as "look at this file" rather than "write here" — the plan is where the
 * prose is actually reached from, so it is worth its own glyph.
 *
 * The design system's Icon fetches each glyph from disk at runtime. That
 * cannot work here: the packaged renderer runs under `connect-src 'none'`, so
 * the fetch is refused and every icon silently renders as nothing. These are
 * `?raw` imports instead, so Vite inlines the markup at build time and there
 * is no request to make.
 *
 * Listing them by hand is the point rather than a chore — an icon that is not
 * in this map cannot be used, which is how the house set stays a set. Adding
 * one is a deliberate line here, not an incidental string in a component.
 */
const ICONS: Record<string, string> = {
  'book-open': bookOpen,
  check,
  'chevron-down': chevronDown,
  'chevron-left': chevronLeft,
  'chevron-right': chevronRight,
  'chevron-up': chevronUp,
  'circle-alert': circleAlert,
  'circle-dashed': circleDashed,
  'circle-dot': circleDot,
  'clipboard-paste': clipboardPaste,
  copy,
  'corner-down-right': cornerDownRight,
  eye,
  feather,
  'file-pen': filePen,
  'file-text': fileText,
  folder,
  'folder-open': folderOpen,
  'folder-plus': folderPlus,
  gauge,
  'git-branch': gitBranch,
  'grip-vertical': gripVertical,
  image,
  info,
  lock,
  map,
  'map-pin': mapPin,
  'maximize-2': maximize2,
  'message-circle': messageCircle,
  music,
  package: packageIcon,
  'panel-right': panelRight,
  pencil,
  play,
  plug,
  plus,
  'rotate-ccw': rotateCcw,
  save,
  scissors,
  search,
  send,
  settings,
  'sliders-horizontal': slidersHorizontal,
  sparkles,
  'trash-2': trash2,
  'triangle-alert': triangleAlert,
  trophy,
  users,
  'wand-sparkles': wandSparkles,
  x,
}

export type IconName = keyof typeof ICONS

/**
 * Lucide's source carries `width="24" height="24"`, which would win over CSS.
 * Stripping both lets the span below size the glyph, and the licence comment
 * is dropped because it would otherwise be inlined once per icon per render.
 */
function prepare(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(width|height)="[^"]*"/g, '')
    .trim()
}

const PREPARED = new Map<string, string>()

for (const [name, source] of Object.entries(ICONS)) {
  PREPARED.set(name, prepare(source))
}

interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: IconName
  /** 13–14 in controls, 16 in toolbars, 12 in chips. */
  size?: number
}

/**
 * A Lucide glyph, tinted with currentColor so it takes the colour of whatever
 * it sits in. Decorative by construction: every icon in this app is beside a
 * label, or inside a control whose aria-label names it.
 */
export function Icon({ name, size = 14, style, ...rest }: IconProps): React.JSX.Element {
  const svg = PREPARED.get(name)

  return (
    <span
      aria-hidden="true"
      data-icon={name}
      style={{
        display: 'inline-flex',
        flex: 'none',
        width: size,
        height: size,
        lineHeight: 0,
        color: 'inherit',
        ...style,
      }}
      dangerouslySetInnerHTML={{
        __html: svg ? svg.replace('<svg', `<svg width="${size}" height="${size}"`) : '',
      }}
      {...rest}
    />
  )
}
