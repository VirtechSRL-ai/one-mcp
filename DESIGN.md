---
name: ONE
description: A quiet connection ledger for operating an AI connection layer.
colors:
  bg: "#f5f4ef"
  surface: "#fffefa"
  fg: "#212922"
  muted: "#59645b"
  line: "#d3d9d1"
  accent: "#146741"
  accent-bg: "#e1eee4"
  danger: "#a22e25"
  button-fg: "#fff"
  dark-bg: "#17221c"
  dark-surface: "#202d25"
  dark-fg: "#e4ebe2"
  dark-muted: "#aab9ac"
  dark-line: "#3b4c3e"
  dark-accent: "#92d3a9"
  dark-accent-bg: "#273e30"
  dark-danger: "#f0a99e"
  dark-button-fg: "#14261a"
  nav-bg: "#202d26"
  nav-fg: "#c3cfc5"
  nav-hover: "#2e3d33"
  nav-selected-bg: "#e4ebe0"
  nav-selected-fg: "#1c3023"
  focus: "#618d72"
  error-bg: "#f9e4df"
  error-fg: "#82271e"
  dark-error-bg: "#4d2d29"
  dark-error-fg: "#ffd3c9"
typography:
  headline:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(30px, 3vw, 44px)"
    fontWeight: 550
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 550
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "12px"
rounded:
  chip: "5px"
  nav: "7px"
  control: "8px"
  panel: "12px"
spacing:
  compact: "8px"
  small: "12px"
  control-gap: "16px"
  medium: "20px"
  group: "24px"
  large: "32px"
  section: "40px"
  workspace: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.button-fg}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    padding: "5px 0"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
    width: "100%"
  status-good:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
    rounded: "{rounded.chip}"
    padding: "4px 9px"
  review-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.panel}"
    padding: "26px"
---

# Design System: ONE

## Overview

**Creative North Star: "The Connection Ledger"**

The implemented dashboard is a quiet workspace for operating connections. Warm ivory content, graphite-green navigation, readable type and horizontal ledger rows keep account names, access decisions and connection state easy to scan. ONE remains a provisional product name.

The same visual language serves Overview, Connections, AI Clients, MCP Servers, Tool Explorer, Activity, Approvals and Settings. This document records the current implementation in `apps/dashboard/app/style.css`, `page.tsx` and `layout.tsx`; it describes visual behavior, not proof of working third-party connections or hosted deployment.

**Key Characteristics:**
- Row-based lists with fine horizontal rules.
- Green actions and positive states with restrained tonal backgrounds.
- Self-hosted Geist Sans and compact monospace technical details.
- Native labelled forms, visible keyboard focus and responsive navigation.
- Light, dark and system theme choices.

## Colors

The palette combines warm neutral surfaces with forest-green actions and muted green neutrals. Frontmatter contains the source values; `dark-*` records the corresponding theme overrides rather than another accent family.

### Primary

- **Forest Green** (`accent`): primary actions, links, caret, revealed key text and positive status text.
- **Soft Green** (`accent-bg`): positive chips, notices and endpoint strips.
- **Dark-theme Mint** (`dark-accent`): keeps the same action and status roles on dark surfaces.

### Secondary

- **Brick Red** (`danger`): destructive action text. Error messages use dedicated tinted backgrounds and text, including explicit dark-theme overrides.

### Neutral

- **Warm Ivory** (`bg`) and **Pale Paper** (`surface`): workspace and inset form/review surfaces.
- **Graphite Ink** (`fg`), **Muted Sage** (`muted`) and **Fine Rule** (`line`): content hierarchy, supporting copy and separators.
- **Graphite Navigation** (`nav-bg`): sidebar and authentication story background; navigation retains its own fixed palette in both themes.
- **Pale Selected Row** (`nav-selected-bg`): selected navigation with dark text, including on hover.

**The Semantic Green Rule.** Use green for actions, positive state and related connection surfaces; retain text labels so color never carries state alone.

## Typography

**Body and heading font:** Geist Sans, self-hosted through `geist/font/sans` and applied by the root layout. The documented fallback stack expresses system resilience; the generated Next font class supplies the actual runtime family.

**Technical font:** the native monospace stack in the frontmatter.

### Hierarchy

- **Headline:** fluid page title with a compact line height and negative tracking.
- **Title:** section and ledger item headings; medium weight rather than heavy bold.
- **Body:** normal reading text with a generous line height; paragraphs stop at 70ch.
- **Label:** native form labels; supporting copy uses a smaller size (13px).
- **Mono:** endpoints, keys, tool schemas and preformatted output. Long strings wrap; preformatted output scrolls vertically after 360px.
- **Authentication display:** a larger fluid title (`clamp(40px, 4.7vw, 72px)`), limited to 12ch, switching to 44px on mobile. Authentication form headings use 30px.

Counts and activity timestamps use tabular numerals. Case is predominantly sentence case; connection row headings capitalize their text.

## Layout

The desktop shell pairs a sticky full-height sidebar (236px) with a fluid workspace. Main content is centered with a maximum width of 1240px and generous workspace padding. A slim header and ruled footer frame the workspace; sections use typography and dividers rather than a metric-card grid.

At 1000px and below, the sidebar narrows to 205px and content padding becomes 36px vertically and 28px horizontally. At 720px and below, the shell stacks, the sidebar becomes a static top band, and navigation becomes a horizontally scrolling row. The tagline and sidebar footer are hidden. Content padding becomes 32px vertically and 20px horizontally; rows wrap and align their trailing content left. Two-column forms become one column. Inline forms wrap. The authentication split screen also stacks.

The connection summary remains an inline group of counts, wrapping on mobile. Endpoint strips wrap their technical text and action. Empty states are textual, with the small connection mark and no decorative illustration.

## Elevation & Depth

The implementation has no box shadows. Surface tint, thin borders, negative space and the solid sidebar establish depth. Review and secret panels are inset surfaces; ledger rows remain flat and share the workspace background.

**The Flat Ledger Rule.** Keep recurring records as ruled rows; reserve bordered inset panels for focused review or revealed secrets.

Buttons declare a background transition (0.18s ease-out); their current hover effect is a brightness filter. Reduced-motion preference disables transitions and animation. There is no animated page transition or ornamental motion.

## Shapes

Corners are softly squared: compact chips, navigation items, controls and inset panels use distinct established radii from the frontmatter. Buttons and inputs share the control radius. Borders are thin and neutral. The small geometric connection mark uses an inline stroked SVG rather than an external image or icon font.

## Components

### Buttons

Primary buttons use the action color and theme-specific contrasting text. Secondary buttons are transparent with a fine border; link buttons remove the border and reduce padding; destructive buttons use danger text with the same fine border. Hover darkens buttons through a brightness filter; disabled buttons reduce opacity to 0.5 and use the unavailable cursor. Keyboard focus uses a visible outline (3px with 4px offset).

### Chips

Compact rectangular status chips use the neutral rule color by default. Connected, success, executed and active statuses receive the positive treatment where the shared status helper is used; activity rows independently mark success. Text remains visible in every chip. These chips are status labels, not filter controls.

### Cards / Containers

Review and revealed-secret panels use the surface color, a fine border and panel corners. Their padding reduces on mobile (18px). Endpoint strips use the soft green background and wrapping inline contents. Ordinary connection and activity records use horizontal rules without enclosing cards.

### Inputs / Fields

Native inputs fill their container, use a surface background and fine border, and inherit the typeface. Labels wrap their controls; placeholders use muted text. Native required, email, password and checkbox behavior is retained. Checkboxes have explicit dimensions (18px) and use the action accent. Shared keyboard focus applies to inputs, buttons, links and disclosure summaries. Error messages use `role="alert"`; notices and loading text use `role="status"`. No separate custom invalid-input visual treatment is implemented.

### Navigation

Eight button-based destinations occupy a vertical sidebar on desktop. Active destinations expose `aria-current="page"` and a pale selected background; hover uses a darker navigation surface, while selected hover keeps the selected treatment. Mobile navigation scrolls horizontally; it does not wrap or become a drawer. Settings exposes system, light and dark theme controls with pressed state; the sidebar also has a theme toggle, hidden with its footer on mobile.

### Ledger and tool disclosure

Ledger rows pair a name and supporting text with state or actions. Activity adds a timestamp and status. Native `details` and `summary` disclose tool information; JSON appears in wrapped monospace blocks. Supporting summaries stack on mobile. Empty states explain the missing connection or data without substituting demonstration records.

## Do's and Don'ts

### Do:

- **Do** use the existing semantic custom properties so new content follows both themes.
- **Do** keep record lists flat, readable and separated by fine rules.
- **Do** retain visible labels, keyboard focus and native form semantics.
- **Do** let long endpoints, identifiers and ledger rows wrap on narrow screens.
- **Do** show honest empty and error states alongside real API-backed content.

### Don't:

- **Don't** replace the scrolling mobile navigation with an undocumented interaction pattern.
- **Don't** use color alone to communicate connection or approval state.
- **Don't** introduce decorative shadows, illustrations or metric-card grids into this ledger without an intentional design revision.
- **Don't** treat ONE as a finalized brand or imply live integration proof from a styled component.
