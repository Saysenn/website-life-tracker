# Design rule

Pick one warm neutral ground, one ink colour in 4 strengths, and one accent. Give every status colour a soft and a strong version. Lock all of these, plus a small type scale, a radius scale, 2 shadows and 1 easing curve, into theme tokens before building anything. Separate areas with tint and shadow, never borders. Keep text small and dense. Keep motion under 300ms. Make every action feel instant with optimistic updates, skeletons, toasts and tooltips. Build all of it from a single set of accessible primitives (Radix plus your own `ui/` folder), and don't let pages invent their own styles.

## What makes it work

1. **Everything comes from tokens.** Replace Tailwind's default colours, font sizes, radii and shadows in the `@theme` block. Every component uses those same values, so the site looks consistent.
2. **A warm palette with meaning built in.** Warm beige background (`ground #f3eee6`), slightly lighter cards (`surface`), and near-black brown text in 4 strengths (`ink`, `ink-2`, `ink-3`, `ink-4`) instead of grey. Each status colour has a strong and a soft version (`danger` / `danger-soft`), so badges are the soft tint behind the strong text.
3. **Small, dense type.** Root font size is 8px on mobile, 9px on tablet and 10px on desktop, and everything is set in rem. The whole UI scales from one number.
4. **Surfaces are separated by shadow and tint, not lines.** No thick borders or line designs. Cards use a very faint two-layer warm shadow (`shadow-card`). Only popovers and dialogs get the stronger `shadow-float`.
5. **Short, consistent motion.** All animation is 160–280ms on one easing curve, `cubic-bezier(0.2, 0.9, 0.3, 1)`. Things fade and rise by 4–8px, and drawers slide in. Nothing bounces or runs long.
6. **Feedback everywhere.** Optimistic updates, skeleton loaders, toasts (sonner), tooltips on every icon button, a command palette (cmdk), and a soft warm focus ring.
7. **Accessible building blocks.** Radix provides dialog, menu, tooltip and switch behaviour, styled once in `src/components/ui/`. Pages are assembled from those parts and don't add their own styling.
8. **Small details.** Tinted text selection, thin warm scrollbars, and font smoothing turned on.

## Starting a new site

Copy the `@theme` and `@layer base` blocks from `src/app/globals.css` into the new project and change the colours.
