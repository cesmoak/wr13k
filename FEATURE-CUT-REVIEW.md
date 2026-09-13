# Remaining feature-cut review — September 13, 2026

Frozen current-source baseline: **14,000 ZIP bytes**, **688 bytes over 13 KiB**. Every candidate uses identical scoped-numbers options and 15-iteration Zopfli. These are isolated whole-ZIP measurements; savings are not additive. Game source and production output were not changed. Prototypes pass JavaScript syntax and compression round-trip checks, but have not undergone visual, browser, audio, or full gameplay validation.

| Cut | ZIP bytes | Saving | Visible or audible consequence |
| --- | ---: | ---: | --- |
| lighthouse-beam | 13,833 | 167 | Remove the rotating translucent rainbow beam; tower and lamp remain. |
| palm-trees | 13,858 | 142 | Remove palm trees from the playable islands. |
| distant-rocks | 13,925 | 75 | Remove the four distant decorative rock silhouettes; playable landforms and collisions remain. |
| shore-decorative-stones | 13,930 | 70 | Remove small decorative shoreline stones; reef landforms and collisions remain. |
| craft-shadows | 13,894 | 106 | Remove circular craft shadows on the water, reducing height/landing cues. |
| sun-moon-discs | 13,874 | 126 | Remove visible sun/moon discs and moon halo; sky gradients, course lighting and water highlights remain. |
| engine-audio | 13,871 | 129 | Remove continuous engine sound; event cues remain. |
| all-audio | 13,445 | 555 | Remove audio playback and setup. This conservative probe leaves simulation event bookkeeping in place. |
| all-wake-particles | 13,521 | 479 | Remove rear droplets and trailing foam, including rainbow trails. Ambient whitecaps and shoreline foam remain. |
| title-racing | 13,914 | 86 | Replace the menu AI demonstration with boats bobbing on their starting grid. |
| fixed-course-lighting | 13,984 | 16 | Freeze each course at a representative light level; remove sunrise/sunset progression, retain course differences and easing. |
| cosmetic-bundle | 13,431 | 569 | Combine lighthouse beam, palms, distant rocks, shoreline decorative stones, and sun/moon discs. |
| particles-and-beam | 13,320 | 680 | Combine all wake particles and the lighthouse beam. |
| cosmetics-shadows-title | 13,246 | 754 | Combine cosmetic bundle, craft shadows and title racing. |
| particles-beam-distant | 13,260 | 740 | Combine all wake particles, lighthouse beam and distant rocks. |
| cosmetics-engine | 13,298 | 702 | Combine cosmetic bundle and engine audio. |

The cosmetics/shadows/title bundle preserves all four courses, racing physics, AI, wake particles, and audio. It reaches 13,246 bytes (66 bytes below the limit). The smaller three-feature particles/beam/distant-rocks bundle reaches 13,260 bytes (52 below), but loses an important sense of speed. Cosmetics plus engine audio reaches 13,298 bytes, leaving only 14 bytes of headroom.

Fixed course lighting alone saves only 16 bytes and is a poor trade for losing sunrise/sunset progression. Removing audio event generation/cooldowns could increase the all-audio saving further, but that was not included in this playback-only probe.

Frozen inputs, per-candidate packages, report.json and reproduction script are under dist/feature-cut-review/. The script uses the frozen input and does not modify source or the main production package.
