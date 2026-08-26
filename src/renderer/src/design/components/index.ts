/**
 * The design system's component layer.
 *
 * One import per screen. `Icon` and `Splitter` are re-exported from where they
 * already live so a screen never has to know that two of these thirty came
 * from somewhere else — see design/README.md for why those two are the app's
 * own rather than the upstream versions.
 */

export { Icon, type IconName } from '../Icon'
export { Splitter } from '../../layout/Splitter'

export { Button, type ButtonProps } from './Button'
export { IconButton, type IconButtonProps } from './IconButton'
export { Field, type FieldProps } from './Field'
/** The info mark beside a label. `Field` renders one for `about`. */
export { Tooltip, type TooltipProps } from './Tooltip'
export {
  Input,
  Textarea,
  Select,
  Checkbox,
  Segmented,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type CheckboxProps,
  type SegmentedProps,
  type SegmentedOption
} from './fields'
export {
  Badge,
  Chip,
  ChipRow,
  Thumb,
  Placeholder,
  ListRow,
  type BadgeProps,
  type ChipProps,
  type ThumbProps,
  type ListRowProps
} from './data'
export {
  Meter,
  StatusPill,
  EmptyState,
  Hint,
  type MeterProps,
  type StatusPillProps,
  type EmptyStateProps
} from './feedback'
export {
  Tabs,
  Toolbar,
  ToolbarBrand,
  ToolbarSpacer,
  ToolbarRule,
  ToolbarGroup,
  ToolbarFile,
  PaneHeader,
  GroupLabel,
  type TabItem,
  type TabsProps
} from './navigation'
export {
  Card,
  CardHead,
  CardTitle,
  CardSummary,
  CardFoot,
  MasterDetail,
  MasterList,
  Diagnostics,
  type CardProps,
  type DiagnosticItem
} from './layout'
export {
  Dialog,
  DialogSpacer,
  Menu,
  MenuItem,
  MenuSeparator,
  Popover,
  type DialogProps,
  type MenuItemProps
} from './overlays'
export { Toast, ToastStack, type ToastProps, type ToastTone } from './Toast'
