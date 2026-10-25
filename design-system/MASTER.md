# CropGuard design rules

CropGuard is a tool a gardener opens with soil on their hands, standing next to a
plant. It should feel like a calm, well-made utility, not a landing page.

## Principles
1. **The task is the home screen.** Open the app → pick what you're growing → camera. No hero, no marketing copy.
2. **Plain over decorated.** Solid colours, 1px borders, almost no shadow. No gradients, glows, blurred orbs, or glass.
3. **Sentence case everywhere.** No all-caps labels, no letter-spaced kickers, no badges above headings.
4. **Colour means something.** Green = act / healthy. Amber = uncertain. Terracotta = needs attention / regulated. Never colour alone: always an icon and words too.
5. **Honest numbers.** Tabular figures, never "100%", the threshold is always explained.

## Tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F4EE` | `#151714` | page (warm paper) |
| `--surface` | `#FFFFFF` | `#1D201C` | cards, list rows |
| `--surface-2` | `#EEEBE3` | `#252923` | pressed rows, tracks |
| `--ink` | `#1E211D` | `#ECEEE9` | text |
| `--ink-2` | `#4D544C` | `#B6BDB3` | secondary text (≥ 7:1) |
| `--ink-3` | `#6A7168` | `#959C92` | captions (≥ 4.5:1) |
| `--line` | `#E1DDD2` | `#30352E` | borders, dividers |
| `--green` | `#2F6B3E` | `#7DBB8A` | primary action, healthy |
| `--green-soft` | `#E4EEE4` | `#22301F` | healthy result background |
| `--amber` | `#8A5A00` | `#E6B65C` | uncertain (text-safe) |
| `--amber-soft` | `#FAF0D9` | `#2E2716` | uncertain background |
| `--clay` | `#A4452A` | `#EE9A7E` | attention / regulated |
| `--clay-soft` | `#F8E7E0` | `#33201A` | attention background |

Type: **Public Sans** 400/500/600/700, self-hosted. Scale 13 / 15 / 17 / 20 / 24 / 30. Body 17px, line-height 1.5. Figures `tabular-nums`.
Space: 4 / 8 / 12 / 16 / 24 / 32 / 48. Gutter 20px. Radius: 12px cards, 10px buttons, 999px only for the shutter.
Icons: Phosphor, regular weight, 20/24px, always beside a text label or with `aria-label`.
Motion: 150ms colour/opacity on press; 200ms screen fade. Nothing loops except the analysis spinner. Respect reduced motion.
Touch: every target ≥ 48px tall; 8px minimum between targets.

## Don't
Gradients · glows · coloured left/top borders on cards · stat banner rows · all-caps tracked labels · dark hero blocks · serif-italic accents · emoji icons · centred marketing hero · "AI-powered" badges.
