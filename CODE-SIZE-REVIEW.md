# Final ZIP size review

Measured September 13, 2026 against a frozen working-tree snapshot. Baseline: **16,460 bytes** using the current scoped-numbers configuration and 15-iteration Zopfli. The 13 KiB target is 13,312 bytes, leaving **3,148 bytes** to save. This snapshot includes mesh simplifications made while the review was underway, so it is smaller than the previous 16,612-byte buoy build.

These are isolated whole-ZIP measurements, not source-length estimates. Savings are not additive. Game source and the production package were not changed by this review. Prototypes passed JavaScript syntax and compression round-trip checks; they have not passed browser, visual, audio, or simulation parity testing. Each uses the same fixed build configuration rather than rerunning the full 15-configuration search.

## Small changes to try first

| Candidate | ZIP saving | Implementation and consequence |
| --- | ---: | --- |
| Extend private-property mangling | 36 bytes | `scripts/optimize.mjs:104`: include remaining application-owned fields such as `grid`, `data`, `context`, `master`, `engine`, `program`, `water`, `eye`, `view`, `random`, `count`, `night`, `foam`, `life`, `center`, `points`, `events`, and `gl`. Audit external and computed access before landing. No intended behavior change. |
| Simplify water-material checks | 8 bytes | `src/renderer.js:88` and `:136`: replace `uWater>.5 && uWater<1.5` with `uWater>.5`. Current rendering no longer uses the removed underwater material values above 1. No intended behavior change under current call sites. |
| Reuse one buoy mesh per marker | 34 bytes | `src/mesh.js:127` and `Renderer.syncCourse`: eliminate `activeGates`, its upload/delete path, and alternate active color literals. Keep the existing shader brightness highlight. Active markers retain their normal coral/cyan hue instead of the slightly different active palette. |
| Increase Zopfli search | 5 bytes | `scripts/zip.mjs:4`: compare 15 and 1,000 iterations and retain the smaller archive. No runtime change, but slower builds for a very small return; 100 iterations saved 4 bytes. |

Property mangling plus material-check simplification saves **32 bytes together**. Adding the single buoy mesh yields **59 bytes total**, for a **16,401-byte ZIP**. This is the best first implementation batch from this review because it preserves gameplay and makes only a small marker-color change.

## Optional visual and audio cuts

| Candidate | ZIP saving | What changes |
| --- | ---: | --- |
| Remove all audio | 1,024 bytes | Engine, water, checkpoint, countdown, impact, lap, and result cues disappear. Useful as a size bound, not a preferred cut. |
| Remove lighthouse beam | 333 bytes | Remove the translucent rainbow fan, projected lighting shader, beacon uniform, and blend pass. Lighthouse tower and lamp remain. |
| Remove side-contact spray | 210 bytes | Remove `hullSprayContact` and the side-spray emitter. Rear spray, trailing foam, and impact particles remain. |
| Remove craft shadows | 209 bytes | Remove water-shadow uniforms, per-frame packing, and GLSL blob shadows. Loses a useful height/landing cue. |
| Remove seagulls | 179 bytes | Remove the draw call and let dead-code elimination remove the flock generator. |
| Remove water noise audio | 130 bytes | Remove generated noise, its source/filter/gain, and gain updates. Engine and event cues remain. |
| Remove distant island silhouettes | 93 bytes | Remove the final decoration loop in `createIslandMesh`. Playable islands and collisions remain. |
| Simplify foam noise | 71 bytes | Replace smooth lattice noise with a direct hash. Likely a poor visual trade: foam becomes much noisier and needs inspection in motion. |
| Simplify splash audio | 57 bytes | Replace three impact-dependent tones with one fixed descending tone. Loses splash-strength variation. |
| Moored title boats | 41 bytes | Run the existing title/countdown boat motion instead of an AI title race. Boats bob on the grid; the title screen stops showing racing. |
| Fixed shadow size/opacity | 29 bytes | Shadows still track position and heading, but no longer soften or expand with airborne height. |
| Remove rainbow spray | 19 bytes | Spray/foam stay ordinary colors at maximum speed level. Very little saving for removing the reward. |

Removing side spray, seagulls, distant silhouettes, and the lighthouse beam **together saves 794 bytes**, producing **15,666 bytes**. This still exceeds the target by **2,354 bytes**. These are aesthetic choices, not required cleanups.

## Experiments that did not pay off

- Factoring repeated shoreline GLSL into a helper **added 33 bytes**. Deflate already compresses the repeated generated code effectively.
- Baking course gates and starting grids instead of calculating them **added 1,619 bytes** with exact values, **335 bytes** with four-decimal values, and **51 bytes** with two-decimal values. Quantization also changes geometry and tangents; none is a win in the tested representation.
- Raising Terser compression passes from 3 to 5 or 10 saved nothing; 2 passes tied. One pass added 63 bytes.
- Changing the current shader-compacted candidate's inlining from 1 to 0, 2, or 3 added 11, 7, and 7 bytes respectively.
- Decreasing generated bird counts, mesh subdivisions, or physics substeps mainly reduces runtime work. Those loops are already compact; changing loop bounds does not remove the feature's implementation.
- Removing comments, tests, old study scripts, and development diagnostics will not materially reduce the shipped ZIP: those are already excluded or minified away.

## Larger architectural direction

The remaining implementation is mostly the game itself: hull/rider dynamics, course handling, water/sky rendering, and effects. Small cleanup alone will not close a 3,148-byte gap.

The existing `RIDER-PHYSICS-STUDY.md` is useful prior evidence: its older snapshot measured 350 bytes for simpler animated motion/joints and 775 bytes for a fixed rider. Those are historical figures, not fresh measurements or additive savings. Its midpoint joints can stretch visibly, and rider offsets feed back into hull torques, so animation changes need handling and full-race checks too.

If reaching 13 KiB is mandatory, the next substantial study should compare a deliberately simpler hull/rider model or reduced course/atmosphere scope. Those require a product decision about which parts of the game's feel and appearance matter most. Avoid spending that budget by accumulating low-value cuts such as removing rainbow rewards for 19 bytes.

## Reproduction

The frozen snapshot and experiment scripts are in `/tmp/wr13k-size-review-5n5MCJ/`; this temporary directory may be cleaned by the system. `review.mjs`, `review-more.mjs`, `review-title.mjs`, `review-course.mjs`, and `review-combined.mjs` contain the size prototypes. The corrected title experiment is `review-title.mjs`; an earlier broad-range title edit was invalid and its result is excluded here. The no-op course-points entry in the first report is also excluded.

Snapshot SHA-256 of concatenated source, HTML, and CSS: `51a4d4faa162c90d9641d9e75112765c05b63995701244c8d32c8631ad86281f`.
