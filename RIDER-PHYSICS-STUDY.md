# Rider physics size study

Measured 2026-09-13. Simplifying rider motion and limb posing saved **350 ZIP bytes (1.90%)** in a working prototype. Replacing the entire moving rider with an authored fixed pose saved **775 bytes (4.20%)**. These savings are modest relative to the remaining 13 KiB budget gap.

| Approach | ZIP bytes | Saved versus baseline | Tradeoff |
| --- | ---: | ---: | --- |
| Current implementation | 18,445 | — | Translation, pitch and handlebar springs; upright torso; fixed-length anchored limbs |
| Algebraically simplify torso rotation | 18,446 | -1 | Equivalent orientation within Float32 rounding; no size benefit |
| Approximate elbows/knees, keep springs | 18,268 | 177 | Hands/feet remain anchored, but limbs stretch; removes pelvis reach projection |
| Smooth target following, keep limb constraints | 18,293 | 152 | Changes inertia, impact recovery and landing rebound; moving handlebar follows suspension directly |
| Combine smoothed motion and approximate joints | 18,095 | 350 | Keeps animated lean/crouch and anchor contacts; loses spring rebound and fixed limb lengths |
| Authored fixed pose attached to hull | 17,670 | 775 | Removes independent rider balance, motion, collision reactions and weight feedback |

Savings are whole-package measurements, so individual cuts are not additive. The moving-rider combination closes 6.8% of the baseline's 5,133-byte budget gap and remains 4,783 bytes over 13,312 bytes. The fixed pose closes 15.1% and remains 4,358 bytes over.

## Assessment

Keep the current approach unless the visual downgrade is acceptable for a few hundred bytes. It is already a compact custom solver with no physics library to remove. The more conservative motion-only change saves just 152 bytes. Replacing the articulated rider is a possible feature cut, but does not solve the size target by itself.

The current rider is coupled to handling: lateral and fore/aft offsets feed hull roll and pitch torque. Changing the motion model therefore requires handling and AI race validation, in addition to animation review. The midpoint-joint prototype can more than double a limb segment's length at extreme poses; it is a size experiment, not a polished replacement. Limiting its motion to hide stretching would also change its appearance and may require additional code.

The experiments measure download size, not frame rate. The baseline runs rider springs in each hull substep and constructs four posed rider meshes per rendered frame. Reducing that work could help CPU time, but no runtime speedup is claimed here.

## Method and checks

- Captured the working source, HTML and CSS once; each alternative used that same snapshot. Other working-tree edits can change later build totals.
- Built self-contained HTML and standard ZIP files with the existing minifier, selector/property/shader transforms and 15-iteration Zopfli compressor, including the normal Deflate fallback and decompression round-trip verification.
- Compared `scoped` and `scoped-numbers`, the two strongest candidates in the existing size report. Did not run the complete 15-candidate search; exact totals may shift with that search or subsequent edits.
- Executed each alternative's minified simulation for 900 ticks in each of five modes. Checked finite hull states and 200 generated rider meshes per alternative, plus 27 extreme rider poses. These are sanity checks, not full race completion or visual acceptance tests.
- Checked simplified torso orientation across 135 combined hull/rider poses: largest matrix difference was 0.0000001192. The baseline, direct-rotation and procedural-joint alternatives produced the same sampled hull-trajectory checksum. Motion-changing alternatives produced different trajectories as expected.
- No game source or main production package was changed by this study. Only the study script and this report are new tracked-file candidates; experimental packages are under ignored `dist/rider-study/`.

Reproduce from current source with `node scripts/rider-study.mjs`. Add `--snapshot` to reuse the captured inputs, or `--full` for all 15 build candidates. Run from the repository root.

Detailed results: `dist/rider-study/report.json`. Captured input SHA-256: `b8788fc09d94de583c409929bc87147044692a6d20409dcecacd4057a13c1e9d`.
