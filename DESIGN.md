# Design

## Color Palette

### Theme System

The app uses CSS custom properties with 5 built-in themes.

#### Light Theme (Default)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#ffffff` | Main background |
| `--bg-secondary` | `#f3f3f3` | Sidebar, panels |
| `--bg-tertiary` | `#fafafa` | Elevated surfaces |
| `--text-primary` | `#24292e` | Primary text |
| `--text-secondary` | `#586069` | Secondary text |
| `--text-muted` | `#6a737d` | Muted text |
| `--border-color` | `#e1e4e8` | Borders, dividers |
| `--hover-bg` | `#f6f8fa` | Hover states |
| `--active-bg` | `#e8f0fe` | Active/selected states |
| `--accent-color` | `#0366d6` | Links, focus rings, primary actions |

#### Dark Theme
| Token | Value |
|-------|-------|
| `--bg-primary` | `#0f0f10` |
| `--bg-secondary` | `#18181a` |
| `--bg-tertiary` | `#232326` |
| `--text-primary` | `#f4f4f5` |
| `--text-secondary` | `#b4b4bb` |
| `--text-muted` | `#7c7c86` |
| `--border-color` | `#2a2a2f` |
| `--hover-bg` | `#232326` |
| `--active-bg` | `#2d2d32` |
| `--accent-color` | `#8f8f99` |

#### Nord Theme
Based on the [Nord](https://www.nordtheme.com/) color scheme. Cool arctic tones with `#88c0d0` accent.

#### Dracula Theme
Based on the [Dracula](https://draculatheme.com/) color scheme. Purple accent `#bd93f9`.

#### Solarized Theme
Based on the [Solarized](https://ethanschoonover.com/solarized/) color scheme. Teal accent `#2aa198`.

## Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### Code Font

```css
font-family: "SF Mono", "Fira Code", Consolas, "Courier New", monospace;
```

### Scale

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Editor content | 16px (configurable) | 400 | 1.8 (configurable) |
| H1 | 2em | 700 | 1.3 |
| H2 | 1.5em | 600 | 1.35 |
| H3 | 1.25em | 600 | 1.4 |

## Spacing

- Base unit: 4px
- Editor padding: 60px (configurable)
- Sidebar padding: 8-12px
- Component gaps: 2-8px

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `lg` | 0.5rem (8px) | Cards, modals |
| `md` | 0.375rem (6px) | Buttons, inputs |
| `sm` | 0.25rem (4px) | Small elements |

## Shadows

| Level | Value | Usage |
|-------|-------|-------|
| Dropdown | `0 4px 16px rgba(0,0,0,0.12)` | Slash menus, dropdowns |
| Tooltip | `0 2px 12px rgba(0,0,0,0.1)` | Toolbars, tooltips |
| Image | `0 2px 8px rgba(0,0,0,0.1)` | Content images |

## Components

### Layout

- **TitleBar**: Custom frameless window title bar with drag region
- **Sidebar**: Resizable left panel (file tree, search, git, settings)
- **Editor**: Main content area with BlockNote/Milkdown editor
- **StatusBar**: Bottom bar with file info and sync status

### Panels

Uses `react-resizable-panels` for resizable split views.

### Scrollbar

Custom styled: 8px width, transparent track, rounded thumb with 20% opacity.

## Animation

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| fadeIn | 0.15s | ease-out | Menu appearances |
| spin | 1s | linear | Loading indicators |

Reduced motion: Not yet implemented.

## Editor Styles

### Code Blocks

- Background: `--bg-secondary`
- Border: 1px solid `--border-color`
- Border radius: 8px
- Padding: 16px 20px

### Blockquotes

- Left border: 4px solid `--accent-color`
- Background: `--bg-tertiary`
- Font style: italic
- Border radius: 0 8px 8px 0

### Tables

- Full width, collapsed borders
- Header: `--bg-secondary` background, 600 weight
- Hover row: `--hover-bg`

## Design Principles

1. **Content first**: Maximize editor space, minimize UI chrome
2. **Progressive complexity**: Basic features at zero friction, advanced features discoverable
3. **Visual restraint**: Minimal color, motion, decoration
4. **Consistency**: Unified interaction logic across themes
5. **Native feel**: Desktop conventions (shortcuts, drag, context menus)
