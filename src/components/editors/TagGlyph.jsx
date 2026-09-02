import {
  BookIcon,
  BriefcaseIcon,
  BulbIcon,
  CarIcon,
  CartIcon,
  CoffeeIcon,
  DumbbellIcon,
  FlagIcon,
  GameControllerIcon,
  GraduationCapIcon,
  HeartIcon,
  HomeIcon,
  LeafIcon,
  MailIcon,
  MoonIcon,
  MusicNoteIcon,
  PaletteIcon,
  PhoneIcon,
  PillIcon,
  PlaneIcon,
  StarIcon,
  UsersIcon,
  UtensilsIcon,
  WalletIcon,
} from '../icons.jsx'

export const TAG_ICON_COMPONENTS = {
  briefcase: BriefcaseIcon,
  home: HomeIcon,
  book: BookIcon,
  heart: HeartIcon,
  wallet: WalletIcon,
  plane: PlaneIcon,
  users: UsersIcon,
  coffee: CoffeeIcon,
  bulb: BulbIcon,
  flag: FlagIcon,
  star: StarIcon,
  dumbbell: DumbbellIcon,
  pill: PillIcon,
  musicNote: MusicNoteIcon,
  cart: CartIcon,
  utensils: UtensilsIcon,
  car: CarIcon,
  phone: PhoneIcon,
  mail: MailIcon,
  gameController: GameControllerIcon,
  palette: PaletteIcon,
  graduationCap: GraduationCapIcon,
  leaf: LeafIcon,
  moon: MoonIcon,
}

/* A plain dot renders fine at 7–9px; none of these glyphs do — so an icon
   always claims a bit more room than the dot it replaces, keyed by which of
   the app's tag-colour spots (the inline list chip, the <select>'s own dot,
   or a swatch square) is asking. */
const ICON_SIZE = { chip: 12, select: 13, swatch: 12 }

/** However a tag paints itself, in one place: a plain colour dot when it
    carries no icon — the original look, and still the default — or its
    chosen glyph in that same colour when it does. Shared by the tag chip in
    task lists, the dot beside a tag <select>, and the swatch in the Tag
    Manager and item panels, so picking an icon changes a tag everywhere at
    once instead of in whichever of those happened to be taught about it. */
export function TagGlyph({ tag, variant = 'swatch', className }) {
  if (!tag) return null
  const GlyphIcon = tag.icon ? TAG_ICON_COMPONENTS[tag.icon] : null

  if (!GlyphIcon) {
    return <span className={className} style={{ background: tag.color }} aria-hidden="true" />
  }

  // The base class still positions the glyph (a select's absolutely-placed
  // dot, a chip's inline one); `--icon` is the one place that resizes it,
  // since none of these shapes read at plain-dot size.
  const size = ICON_SIZE[variant] ?? ICON_SIZE.swatch
  return (
    <GlyphIcon
      className={`${className ?? ''} ${className ? `${className}--icon` : ''} tag-glyph-icon`.trim()}
      width={size}
      height={size}
      style={{ color: tag.color }}
      aria-hidden="true"
    />
  )
}
