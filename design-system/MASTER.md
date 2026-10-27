# CropGuard design rules

CropGuard is a tool a gardener opens with soil on their hands, standing next to a
plant. It should feel like a calm, well-made, friendly tool, not a landing page.

## Principles
1. **The task is the home screen.** The first thing on Home is the "Check a leaf" card. No marketing hero, no feature tour.
2. **Warm and soft, not decorated.** Cream paper, deep forest green, soft shadows, generous radius. One gentle wash at the top of the page and one line-drawn leaf in the Home card; no glows, glass or blurred orbs.
3. **Sentence case everywhere.** No all-caps labels, no letter-spaced kickers.
4. **Colour means something.** Green = act / healthy. Amber = uncertain. Terracotta = needs attention / regulated. Never colour alone: always an icon and words too.
5. **Honest numbers.** Tabular figures, never "100%", the threshold is always explained.
6. **Motion explains, never decorates.** Every animation shows cause and effect, and all of it respects reduced motion.

## Tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F4F0E6` | `#0F130E` | page (warm paper) |
| `--surface` | `#FFFDF8` | `#171C15` | cards, list rows, inputs |
| `--surface-2` | `#EDE7D9` | `#20261D` | tracks, pressed rows, segmented controls |
| `--ink` / `--ink-2` / `--ink-3` | `#1B2318` / `#475244` / `#5F6A5B` | `#EDF0E8` / `#B9C2B3` / `#98A291` | text, secondary (≥ 7:1), captions (≥ 4.5:1) |
| `--line` / `--line-strong` | `#E0D8C6` / `#CBBFA8` | `#2B3227` / `#3D4738` | dividers / input borders |
| `--forest` | `#1E4A2C` | `#183A23` | Home card, emblems, avatar |
| `--green` | `#2C6A3D` | `#86C796` | primary action, healthy |
| `--amber` / `--clay` | `#8A5A00` / `#A4452A` | `#E6B65C` / `#EE9A7E` | uncertain / attention (text-safe) |

Type: **Fraunces** (soft axis, self-hosted, latin only) for headings and the wordmark; **Public Sans** 400–700 for everything else. Scale 13 / 15 / 17 / 20 / 24 / 32. Body 17px, line-height 1.55. Figures `tabular-nums`.
Space: 4 / 8 / 12 / 16 / 24 / 32 / 48. Gutter 20px. Radius: 24px hero and result cards, 16px cards, 12px buttons and inputs, 999px chips.
Icons: Phosphor, regular (duotone for emblems), always beside a text label or with `aria-label`.
Touch: every target ≥ 44px tall; 8px minimum between targets.

## Components
Buttons follow shadcn's variants in plain CSS: `.btn` (secondary), `.btn.primary`, `.btn.ghost`, `.btn.danger`, `.btn.danger-outline`; sizes `.big`, `.full`. Busy buttons show a spinner and an "…ing" label. Inputs have a visible label, a leading icon and a 4px focus ring. Segmented controls (`.mode-switch`) have a sliding thumb. The one-time code field is one real input drawn as six slots, so paste and autofill work.
Tailwind and Radix are deliberately not used: Radix's scroll lock injects `<style>` tags, which the strict CSP (`style-src 'self'`) blocks.

## Motion
| Token | Value | Use |
|---|---|---|
| `--d-1` / `--d-2` / `--d-3` / `--d-4` | 120 / 200 / 320 / 520 ms | press, small state, enter, emphasis |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | things arriving |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | things leaving (shorter than enter) |
| `--spring` | CSS `linear()` spring | things you touch: buttons, thumbs, checkmarks |

- Screen changes use the View Transitions API: forward slides in from the right, back from the left (`DEPTH` in `App.tsx`).
- Lists rise in with a 40ms stagger; result meters grow from zero; badges and checkmarks pop with the spring.
- Errors nudge once. The analysis screen sweeps the photo and ticks off three steps.
- Under reduced motion, everything snaps to its final state; only the spinner keeps turning.

## Don't
Glows · glass · neon · coloured left/top borders on cards · stat banner rows · all-caps tracked labels · emoji icons · "AI-powered" badges · looping decorative animation.
