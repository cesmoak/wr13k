## Water depth flicker and fast builds (September 13)

- Reproduced irregular surface holes in a frozen-frame comparison. Applying a `(1,1)` polygon offset only to the water depth prepass removed them; the blended color pass retains its unbiased depth. The offset is disabled before other effects render.
- Added `test/water-depth.html` to compare biased/unbiased passes at a fixed camera and time.
- Added `npm run build:fast`: the scoped-numbers variant with 15 Zopfli iterations. Measured build time: 1.18 seconds on this machine; current ZIP 22,587 bytes. Full `npm run build` still compares all 15 variants using 15 and 1,000 iterations.
- All 108 automated tests pass; ZIP integrity passes. Visually checked the corrected surface in the browser.

## Visual wakes and shared atmosphere (September 13)

- Removed boat-generated wave displacement from CPU buoyancy and GPU water height, plus wake queues, timers, and uniforms. Existing particle foam, spray, collision splashes, and sounds remain.
- Shared one sky-color function between sky rendering, water reflections, and distance fog. Stars retain their night/twilight attenuation.
- Adjusted the existing wet-hull upward rebound damping after removing wake forces; unchanged jump-height, ballistic flight, rider, and full-course tests pass.
- Prototyped a generated shoreline-distance texture. The matching compression candidate grew from 22,553 to 22,627 bytes, so the texture was reverted. Scenery counts and analytic shoreline calculations remain intact.
- Final ZIP: **22,553 bytes**, down **443 bytes** from 22,996. Offline HTML: 55,184 bytes. ZIP integrity check passes.
- `npm test`: **108 passing tests**, including full AI races across all four race courses. Browser course-mode checks passed, with no WebGL errors; day/night water previews were visually inspected. The final packed build passed 52 checks across all five modes, with no runtime/WebGL errors or subresource requests.

# First-pass validation

## Larger architecture prototypes

- Prototyped four approaches: model instruction rows, a shared audio voice graph, compiled racing lines, and one reusable menu panel. Kept the compiled lines and menu redesign. In the combined prototype, reverting model instructions saved 69 bytes and reverting the audio graph saved 18 bytes; those two experiments were reverted. Their geometry was verified unchanged before rejection.
- Builds regenerate src/racing-lines.js from the development planner. Compact digit strings encode each rider's original buoy-corridor offsets. Production reconstructs only the next three points and retains live steering, corner-speed control, and obstacle avoidance. Exact-point tests cover every course and rider; the original planner is omitted from production.
- Title, pause, loss, and finish now share one panel and shared Start/Resume and Courses controls. The HUD retains its information; responsive CSS is simpler and the title camera is unchanged.
- All **104 automated tests**, **52 packaged-game checks**, **18 speed-level/shared-panel checks**, and **64 production CSS comparisons** pass. All five rendered scenes are pixel-identical to the baseline, including spray/foam. Audio note timing matches; waveform differences match native repeat-render variation. No packed runtime/WebGL errors or subresource requests; ZIP integrity passes.
- ZIP: **23,528 → 23,052 bytes**, saving **476 bytes**. Built HTML: **56,424 bytes**; CSS: **3,247 bytes**, down from 4,898. The UI-only prototype measured 23,111 bytes; compiled lines saved a further 59 bytes in that configuration.

## Shared rendering buffer and smaller runtime state

- Tried all ten candidates. Kept one shared dynamic geometry buffer, development-only contactFraction storage, redundant shadow-clear/flare-guard removal, production-only removal of initialized-field fallbacks, an object for key state, uncached speed-level updates, and shared minimap path construction. Development fixtures follow the updated key/buffer APIs.
- Tested Math aliases for all common functions, sin/cos, and hypot: each increased compressed size. The general shader-number formatter added six bytes; the shorter trailing-zero formatter tied the existing code, so both formatter experiments were left out.
- ZIP: **23,573 → 23,528 bytes**, saving **45 bytes**. Built HTML: **58,250 bytes**. All 103 automated tests pass. GPU comparisons across all five courses are pixel-identical; sound cue scheduling matches, and waveform differences are comparable to repeat rendering of the original. All five minimaps issue identical drawing commands. Eleven real keyboard/pause/focus checks, 15 speed-level checks, and all 52 packaged-mode checks pass. No runtime/WebGL errors or subresource requests; ZIP integrity passes.

## Equal-length limb solver and torso rotation size comparison

- Final full suite: **102 passing tests**, including production/source equivalence.

- Specialized `solveJoint(a, b, bend)` for two .55-unit segments. Forearms grow from .53 to .55; all other limb lengths and pelvis reach limits remain unchanged. The solver retains bend projection, near-parallel fallback, and .001–1.099 distance limits, with a fallback axis for coincident endpoints.
- Compared four isolated builds with the same source snapshot and build configuration: baseline **23,593 bytes**; direct torso rotation **23,602**; equal-length joints **23,573**; both **23,579**. Kept joints only: **20 ZIP bytes** and **149 source bytes** saved. The direct matrix matched the old rotation within the planned 1e-6 tolerance, but was discarded because it increased compressed size.
- Updated fixed-length arm assertions and added coincident, near-parallel, tiny-distance, and excessive-reach cases. Visually inspected left/right turns, held bank, airborne extension, and landing compression; hands/feet remain attached, joints remain bent, and WebGL reports zero errors.

## Further CSS reduction

- Fresh working-tree baseline with identical build settings: ZIP **23,827 → 23,589 bytes**, saving **238 bytes**. Source CSS **6,596 → 5,983 bytes**; production CSS **5,504 → 4,898 bytes**; packed HTML **59,322 → 58,508 bytes**. Both builds select frequency-inline; ZIP integrity passes. The archive remains 10,277 bytes over 13 KiB.

- Inlined the three fixed color variables, retained runtime `--level`, removed the unused modal primary-button margin and pause override, and shared the minimap's 100% canvas width while preserving responsive container widths and canvas heights. Grouped the four identical tabular-number declarations: this saves another 7 ZIP bytes relative to the other edits alone. Grouping font weights increased ZIP size, so it was not retained.

- Removed box/text shadows, backdrop blur, primary-button movement/transition, and the vignette element and styles. Focus outlines, hover brightness, colors, selection/warning borders, typography, spacing, breakpoints, and gameplay are preserved. Build/minifier configuration and runtime JavaScript are unchanged by this pass.

- All **101 automated tests**, **52 packed-game checks**, and **64 source/production CSS comparisons** pass. The packed game reports no runtime/WebGL errors or subresource requests. The first packed-game run under forced software rendering missed the fixture's 80 ms pause-state wait; the unchanged fixture passes using normal Chrome rendering.

- **512 before/after comparisons** preserve element geometry and non-decorative computed styles, including pseudo-elements: eight viewport sizes (including breakpoint boundaries and short/mobile screens), four screens, both themes, race/free play, normal/danger warnings, and speed levels 1/5. Comparisons exclude only removed decorative properties/color custom properties and equivalent unresolved percentage widths on hidden minimaps. Keyboard focus retains its 3 px solid outline with 5 px offset; hover retains brightness(1.08) with no translation or transition. Visually inspected 24 desktop/tablet/short-mobile screen/theme captures and live packed title, HUD/countdown, and pause views; controls and text remain positioned correctly.

## Rainbow trailing foam

- Trailing foam reuses the spray color function and cycles through rainbow bands at speed level 5. Levels 1–4 remain white; six flat foam triangles are still emitted each time. Existing particles keep their colors as they shrink away.
- All 101 automated tests pass, including both particle types using the rainbow palette at low and high speeds only at level 5. Visually checked rainbow spray and foam in the wake fixture; WebGL reports OK.
- Isolated production builds with unrelated inputs frozen: ZIP **23,589 → 23,593 bytes**, a change of **+4 bytes**.

## Simpler spray strength, foam, and rainbow colors

- Side-spray strength depends only on speed; removed the ahead-of-hull wave sample and crest-closing calculation. Foam uses flat shrinking triangles with one center water sample and no stored rotation. Level 5 switches directly to full rainbow spray colors instead of blending by speed; foam stays white.
- All 101 automated tests pass, including full rainbow colors at low and high speeds. Visually checked ordinary and maximum-level spray with flat foam in the wake fixture; WebGL reports OK. Flat foam can intersect steep waves slightly, and crests no longer strengthen the spray fan.
- Isolated builds with all unrelated source and build settings frozen: ZIP **23,942 → 23,827 bytes**, saving **115 bytes**; built HTML **59,561 → 59,322 bytes**. The current workspace build produces the same result.

## WASD-only driving

- Compared WASD-only and arrow-only variants with the same frequency-inline build settings: **23,596** versus **23,629 bytes**. Kept WASD and removed arrow handling and its default-action suppression. Escape pause and Enter start remain.
- Direct input checks cover throttle, braking, both steering directions, and all four removed arrow mappings. All 52 packaged-game checks pass without runtime/WebGL errors or subresource requests. ZIP integrity passes; final archive is **23,596 bytes**.

## Minimap direction marker removed

- Removed the player heading triangle; all four position dots and the player dot outline remain. A drawing-command comparison confirms changing heading no longer changes minimap output.
- Production build and ZIP integrity pass. ZIP: **23,972 → 23,942 bytes**, saving **30 bytes**.

## Fixed-yaw handlebars

- Isolated before/after builds using the same build configuration and all unrelated source frozen: ZIP **24,077 → 24,052 bytes**, saving **25 bytes**. Runtime source shrank by **228 bytes**. Other concurrent workspace optimizations are excluded from this comparison.

- Removed handlebar yaw position/rate, its spring and interpolation, and yaw-dependent grip transforms. The remaining spring updates pitch directly with the original travel limits and damping. Steering still turns the craft and shifts the rider inward; the crossbar no longer twists.
- All 100 automated tests pass. Pitch/suspension state matches the previous implementation exactly over 3,000 steps spanning left/right/neutral steering, flight, and varying vertical load. Updated tests cover fixed crossbar alignment, planted hands, pitch lift/reset, interpolation, and production equivalence.
- Visually checked left/right turns and a jumping side view in the rider fixture; hands remain attached and the pole still lifts. WebGL reported zero errors.

## Reef, HUD, and compression experiments

- ZIP: **24,066 → 23,972 bytes**, saving **94 bytes**. Built HTML: **59,730 bytes**; CSS: **5,504 bytes** (129 bytes smaller). The frequency-inline candidate wins; ZIP integrity passes.

- Replaced the two reef mapping expressions with one rock list and constructor. A common seed increment preserves the two original sequences. Original order, coordinates, dimensions, seeds, outer-reef subset, and generated island geometry match exactly.
- Consolidated shared miss/speed-level panel styling, removed unused anchor styling, and removed the redundant single-column grid declaration. All 24 before/after title/HUD/pause/results layout and style comparisons pass across three sizes and both lighting themes.
- Added build candidates for frequency-ordered GLSL names, JavaScript inline level 1, and their combination. Identifier ties use deterministic lexical ordering. Existing candidates remain available; the build always selects the smallest actual ZIP.
- Tested shared clamp calls, a clamp01 helper, alternative module ordering, inline levels 0/1/2/3, and disabled reduce_funcs. Retained the useful build candidates; reverted math-helper changes because their compressed output was larger.
- All 100 automated tests, 52 packed-game checks, and 64 production CSS comparisons pass, with no runtime/WebGL errors or subresource requests. All five source/optimized scenes render pixel-identically, including spray and foam. Sound cue scheduling matches exactly; waveform differences are comparable to repeated rendering of the original. No scenery or gameplay features were removed.

## Particle, state, and sky-gradient cleanup

- ZIP: **24,458 → 24,066 bytes**, saving **392 bytes**. Built HTML: **60,084 bytes**; CSS remains **5,633 bytes**. ZIP integrity passes.

- Merged the identical wake/foam particle flags and moved droplet-only size, height, and color calculations into the droplet branch. Foam shapes, colors, wave sampling, and all particle counts remain unchanged.
- Production omits the always-zero rider roll fields/interpolation, standalone updateRacer test path, and unused gate/miss event diagnostics. Development fixtures retain those fields and convenience checks. Removed duplicate racer initialization and replaced stored checkpoint indices with the existing array/nextGate indices; checkpoint index metadata remains development-only.
- Sky and distance fog now share the same GLSL gradient helper, retaining star composition and all gradient constants. Extended shader-local renaming to preserve parameter qualifiers such as out, with a regression test.
- All **100 automated tests** and **52 packed-game checks** pass, with no runtime/WebGL errors or subresource requests. GPU comparisons across all five courses, including foam and spray, are pixel-identical to the pre-change version. Sound note scheduling matches; maximum offline waveform difference is below one 16-bit PCM step.

## Front-only flag markings

- Arrows and finish checkerboards now appear only on the approach face (local -Z); the opaque colored flag hides them from behind. Placement, passing directions, colors, and buoy movement are unchanged.
- Updated the marker regression test to require front markings and no rear markings for both buoy sides and active states.

## Model generation simplification

- Consolidated boxes through the existing tapered-box builder. Simplified rider accessories and torso, lighthouse details, fish bodies/fins, bird wings/details, and flag markings. Rider pose solving, physics, animal counts and paths, scenery, craft design, rainbow, and lighting are unchanged.
- Compared builds from the working tree immediately before this pass: ZIP **24,458 → 24,134 bytes**, saving **324 bytes (1.3%)**; built HTML **61,347 → 60,317 bytes**. Combined `src/mesh.js` and `src/atmosphere.js` source is **15,641 → 14,294 bytes**, down **1,347 bytes (8.6%)**. The archive remains **10,822 bytes** over 13 KiB.
- Triangle counts: rider **390 → 260**, lighthouse **762 → 324**, ordinary buoy **110 → 88**, finish buoy **206 → 118**, bird flock **342 → 180**, each fish **33 → 9**. These are geometry reductions, not measured frame-rate gains.
- All **99 automated tests** pass, including production/source equivalence and new box-normal, marker-direction, and deterministic wildlife checks. The actual packed game passes **52 browser checks** across all five modes with no runtime/WebGL errors or subresource requests.
- Compared baseline/current rider views and inspected banking, steering, jumping, and landing compression. Hands/feet stay planted and the torso meets the helmet after removal of the neck block. Inspected both faces of arrows/checkerboards, day/night lighthouse views, animated fish/birds, and the frozen full scene. WebGL reported zero errors.
- Baseline/current comparisons confirm island and craft colored surfaces and normals match despite box triangulation changes; rainbow, seabed, seagrass, and beacon vertex data match exactly. Only `src/mesh.js` and `src/atmosphere.js` changed among runtime/build source files during this pass.
- Visible tradeoffs: boxier rider torso, bare lighthouse lantern area without supports/railings, pointed fish without side fins, and plain triangular bird wings without dark tips. Flat flag markings are offset on both sides to remain visible from either approach.

## Approximate hull spray contacts

- Replaced the transformed hull-side bisection search (up to eight water samples per contact) with one sample at a fixed lateral offset and approximate pitch/roll height offsets. Dry or submerged sections skip side spray; crest response remains. This affects visual spray placement only, not buoyancy or collision physics.
- All 97 automated tests pass, including single-sample contact, dry/submerged rejection, bank/trim, and yaw checks. Visually inspected ordinary foam and side spray in the wake fixture; WebGL reports OK.
- Before/after production builds selected combined transforms: ZIP **24,807 → 24,506 bytes**, saving **301 bytes**; built HTML **62,255 → 61,478 bytes**.

## Foam-only particle wakes

- Replaced the two expanding ripple-arc particles with ordinary shrinking foam triangles, retaining six wake particles per emission. Removed the ripple flag and segmented quad geometry; spray, rainbow eligibility, particle limits, and water physics remain unchanged.
- All 96 automated tests pass. The wake fixture renders white foam and side spray at levels 1 and 5 with WebGL OK; visually inspected both levels. Wake assertions verify six flecks per emission and no ripple arcs.
- Using identical production build settings, ZIP size fell from **24,870 to 24,807 bytes**, saving **63 bytes**. Built HTML fell from **62,411 to 62,255 bytes** (156 bytes). Both builds selected the combined transforms candidate.

## Production transforms and shared runtime code

- Removed unread finish-order storage; interpolation keeps its stored view only in development. Production strips checkpoint channel metadata and redundant course defaults, checking that callers supply the required arguments. The default course used by procedural fish remains intact.
- Added token-aware shader-local renaming, scoped WebGL constant inlining, and context-aware numeric encoding for race phases, events, and lighting. Browser strings, shader interfaces/swizzles, and course IDs retain their meaning. Added the private course field to property shortening. Each build compares the real compressed candidates and selects the smallest.
- Shared fullscreen rendering setup, sound cue playback, and title/countdown moored physics. Removed the Start button wrapper and unnecessary layout rules. The generic uniform helper increased ZIP size, so direct uniform calls remain. No object counts or features were reduced; the lighthouse lens flare is preserved.
- All **95 automated tests**, **52 packed-game checks**, **64 CSS comparisons**, and **9 before/after menu geometry comparisons** pass. All five source/optimized scenes render pixel-identically. Audio note scheduling matches exactly; maximum waveform difference is 0.000018634, compared with 0.000018630 when rendering the original twice. No packed-game runtime/WebGL errors or subresource requests; ZIP integrity passes.
- ZIP: **25,510 → 24,666 bytes**, saving **844 bytes**. The starting baseline includes the newer lighthouse flare. Built HTML: **61,772 bytes**; CSS: **5,633 bytes**. The combined transforms win over the baked-shader candidate (24,837 bytes).

## Course buttons with direct handlers

- Replaced repeated static course-button HTML with buttons created directly from course data. Labels use textContent; each click handler closes over its course ID. A selected class is updated in code, with no data-course/aria-pressed attributes or inner bold wrappers. The selected button remains clickable.
- Course names now serve the production UI, so metadata stripping retains them and no longer rewrites the course constructor signature. Updated browser fixtures to select generated buttons and verify their selected class; CSS checks populate the same generated labels.
- All 90 automated tests, 52 packed-game checks across all five courses, and 64 CSS layout comparisons pass. No runtime/WebGL errors or subresource requests; ZIP integrity passes.
- ZIP: **25,438 → 25,409 bytes**, saving **29 bytes**. Built HTML: **64,879 bytes**; CSS: **5,748 bytes**.

## Smaller race UI and color constants

- Removed the live leaderboard, its row generator/update cache/styles, and the finish placing/time summary. Every finishing place uses “Race complete”; five-miss losses still use “Race over.” Result ranks are 1–4, without leading zeroes. Per-rider finish times remain in the results list.
- Replaced the five decorative speed-bar `<i>` elements and class updates with one masked CSS gradient driven by the speed level. Removed the redundant `aria-hidden` on those empty decorations; course selection still uses `aria-pressed`.
- Rounded constant shader color vectors to one decimal for values at least .1, retaining two decimals below .1 so dark night colors do not disappear. Shader geometry, waves, spectral phase offsets, and vehicle blob shadows are unchanged. Sun-disc and flare source colors were updated together.
- Dynamic course button experiments were larger after compression: **25,451 bytes** with a label table, or **25,445 bytes** sharing labels with course data, versus **25,438 bytes** for static buttons. Kept static HTML.
- All 90 automated tests, 52 packed-game checks, 15 speed-level/loss checks, 64 CSS layout comparisons, and six flare GPU checks pass. Verified all four finish positions show the same heading and unpadded ranks with no extra summary/leaderboard. Visually checked the gradient gauge and rounded night colors. ZIP integrity passes; no packed-game runtime/WebGL errors or subresource requests.
- ZIP: **25,774 → 25,438 bytes**, saving **336 bytes**. Built HTML: **65,276 bytes**; CSS: **5,785 bytes**.

## Broader production property shortening

- Expanded the explicit internal-field allowlist for simulation state, geometry, rendering, audio, and rider/buoy fields. Browser, WebGL, Web Audio, and dataset names keep their public spelling. Readable source names remain intact.
- Rider and hull loops use explicit axis/rate pairs. Build-only Terser key annotations coordinate computed accesses, interpolation lists, and axis comparisons with direct property accesses. The build rejects reintroduced rate-name concatenation.
- All 90 automated tests pass, including expanded production parity coverage for rider meshes, handlebar rates, and interpolated buoy fields. A 1,200-step rough-water comparison exactly matches the pre-change physics.
- All 52 packed-game checks pass without runtime/WebGL errors or subresource requests. Property-shortened and unshortened builds produce pixel-identical renders across all five modes; maximum stereo audio difference is 0.00000012. ZIP integrity passes, and the final build settings reproduce the packaged HTML byte for byte.
- ZIP: **26,138 → 25,774 bytes**, saving **364 bytes**. Built HTML: **66,168 bytes**. CSS remains **6,150 bytes**; no features or object counts changed.

## Shared geometry, UI, lighting, and shoreline helpers

- Fairings and rider torsos share tapered-box construction. Leaderboard/results share row markup and common CSS; menu returns and course selection share reset code; blur and hidden-tab events share one pause handler.
- Race and title lighting share the altitude/azimuth calculation. Seabed generation, AI clearance, and surf audio share shoreline-distance math while retaining their existing margins. Geometry, lighting, seabed, and surf comparisons against the previous source match exactly, including the steep island.
- Removed per-island `collisionScale`: every landform now uses the main beach's fixed .915 collision margin. The smaller island remains steep. Updated shoreline/reef assertions for the common contact boundary; boost-reset behavior is preserved.
- All 89 automated checks pass across the full run and targeted rerun of the 27 simulation/reef checks after updating collision expectations. All 52 packed-game checks and 64 CSS layout comparisons pass. No runtime/WebGL errors or subresource requests; ZIP integrity passes.
- ZIP: **26,264 → 26,138 bytes**, saving **126 bytes**. Built HTML: **68,415 bytes**; CSS: **6,150 bytes**. All scenery and racer counts are unchanged.

## Shared controllers, rendering, audio, and shader build experiment

- All preview riders now use the opponents' look-ahead controller. Player ID 0 uses the leading rival's speed targets with the player's normal physics multiplier; manual controls are unchanged. All four courses finish reliably; the offshore integration run finished in 117.33 seconds with no player misses and the existing rough-water clearance bound intact. Updated its old minimum-duration assertion for the faster controller.
- Fish, gulls, riders, and particles share dynamic-buffer upload/draw code. Water vertices use a constant unused color instead of random values. Side-by-side GPU captures were pixel-identical on all five modes, including impact particles; mesh and scenery counts are unchanged.
- Shared audio gain/filter creation, engine chains, playback/cleanup, and envelopes preserve all sound parameters. Ten offline waveform comparisons (engines, small/large splashes, gulls, and cues, with/without stereo panners) passed. Maximum differences in the final comparison were below 0.0000003, comparable to rendering the original twice.
- Added a build candidate that evaluates shader templates and compacts numeric literals. Tests verify all five shader programs remain equivalent apart from comments/whitespace/numeric spelling. Baked shaders produced a **26,498-byte ZIP**, 234 bytes larger than the selected runtime-template variant, so automatic size selection retains the smaller output.
- All 89 automated tests, 36 browser mode checks, and 52 packed-game checks pass, with no runtime/WebGL errors or subresource requests. ZIP integrity passes. Final ZIP: **26,634 → 26,264 bytes**, saving **370 bytes**. Individually restoring the old audio, renderer, or simulation module increases the final ZIP by 70, 83, or 242 bytes respectively (compression savings are not additive).

## Stronger ZIP compression

- Packaging now compares zlib level 9 with Zopfli at 15 and 1,000 iterations and keeps the smallest stream. The selected iteration count is recorded in the size report. This remains ordinary ZIP Deflate.
- On the current HTML, 15/100/500/1,000 iterations produced 26,645/26,643/26,636/26,634-byte ZIPs. A 5,000-iteration experiment reached 26,632 bytes but took about five times longer than 1,000; alternative block splitting settings did not improve it.
- All three production/packaging tests pass, including deterministic Unicode round trips and minification parity. `unzip -t` passes. Extracted content is unchanged: built HTML is byte-for-byte identical to the previous build.
- ZIP: **26,645 → 26,634 bytes**, saving **11 bytes**.

## Remove redundant HUD text and unused metadata

- Removed the off-course warning, timer, nearest-course helper (including unused index), and its repeated scans. Removed speed-level popups, the shared notice element/styles, leaderboard YOU/AI badges and their styles, results filler, hidden DNF branch, and Space-key suppression. The existing speed gauge and synthesized cues remain.
- Removed stored buoy `t` and lighting label/returned-progress fields. Lighting still uses angular progress internally; tests now verify actual altitude/night transitions and lap continuity. The unread camera target was already removed in the previous change.
- All 88 automated tests and 52 packed-game browser checks pass, with no runtime/WebGL errors or subresource requests. Rebuilt ZIP: **27,064 → 26,645 bytes**, saving **419 bytes**. Built CSS: **6,185 bytes**.

## Fixed title camera and camera cleanup

- Replaced the time-driven title orbit with a fixed view at its previous opening position: eye `[255.85,39.92,329.53]`, target `[125,0,-90]`. Course changes preserve that framing while scenery and lighting continue animating.
- Removed the unread camera-target property, overwritten constructor eye/yaw defaults, and the missing-velocity fallback used only by incomplete test hulls. The race camera retains speed-based distance/height, forward-motion heading follow, turn-rate limiting, and stable vertical pitch.
- All 88 automated tests and 36 browser mode checks pass, including fixed camera positions across course changes, clean race starts, smooth chase behavior, and lighthouse framing above the horizon at three desktop aspect ratios.
- ZIP: **27,138 → 27,064 bytes**, saving 74 bytes.

## Remove sound and lighting shortcuts

- Removed M/N handlers, mute state and toggle method, and the manual lighting mode parameter/state/branches. Audio starts through the existing start interaction; lighting always follows the course profile.
- Updated browser fixtures and documentation. Lighting fixtures use course profiles directly, and obsolete mute controls/checks are removed.
- All 88 automated tests pass; six updated browser fixtures pass script parsing. Production builds successfully. ZIP: **27,280 → 27,138 bytes**, saving 142 bytes.

## Angular lighting progress

- Replaced the 240-segment nearest-path search with an angle around a course-specific center, relative to the starting line and corrected for travel direction. This is a lighting approximation only; checkpoints, laps, standings, and AI retain their existing logic.
- All 88 automated tests pass, including dense three-lap sunset/sunrise continuity checks, lap seams, radial position independence, fixed day/night settings, and the time-driven free-play cycle.
- Rebuilt ZIP: **27,289 → 27,280 bytes**, saving 9 bytes. The primary benefit is constant-time lighting progress evaluation.

## Remove level descriptions

- Removed all five course descriptions and their constructor parameter. The development course preview displays the course name instead; production metadata stripping now matches the simpler constructor.
- All 86 automated tests pass. Rebuilt HTML and ZIP are byte-for-byte identical to the previous build: descriptions were already stripped from production. ZIP remains **27,289 bytes**.

## Shared title-race starting grid

- Every title preview reuses the normal starting grid near course point 0. Removed course-specific entry positions, custom lane/heading/velocity placement, checkpoint lookup/progress setup, and three seconds of warm-up simulation. Riders accelerate through the regular AI/physics path.
- Free play still previews the main course without markers. Course changes preserve camera, lighthouse, and water time; hull heights are aligned to that water time at initialization.
- All 86 automated tests and 36 browser mode/title checks pass, including shared grid/progress state, moving riders on every route, clean game starts, and continuous scenery clocks. ZIP integrity and whitespace checks pass.
- ZIP: **27,456 → 27,289 bytes**, saving 167 bytes.

## Remove restart and keyboard hints

- Removed R-to-restart and Enter-to-retry on finished/lost races. The start handler only accepts the title phase; beginning another race requires Courses → Start. Escape pause/resume remains.
- Removed the keyboard-hint footer, its keycap/responsive styles, and the restart instruction from the off-course notice.
- All 86 automated tests and 52 packed-game checks pass. Fifteen speed/loss browser checks confirm R/Enter leave the loss screen unchanged and Courses → Start creates a fresh race. Static checks confirm no restart binding or hint markup/styles remain, and DOM references and ZIP integrity pass.
- ZIP: **27,589 → 27,456 bytes**, saving 133 bytes; built CSS is 6,451 bytes.

## Remove error UI and warm sun flare

- Deleted the graphics error panel, startup catch/display path, context-loss reload handler, and redundant renderer-availability branches. Detailed WebGL/shader diagnostics remain in development and are compiled out of production.
- Removed the sun's warm sky glow, bloom, starburst rays, and horizontal streak. Retained the sun disc, rainbow lens halo, six internal reflections, opposite-axis rainbow ring, and visibility/angle/night attenuation. Updated lens occlusion's expected source color to match the sun without added glow.
- ZIP: **28,041 → 27,591 bytes**, saving 450 bytes. All 86 automated tests and 52 packed-game checks pass. Six GPU/browser checks confirm visible lens reflections, no added bloom at the sun center, and suppression for covered, nighttime, behind-camera, and offscreen sources, with no WebGL errors.
- Static DOM references and archive integrity pass; production contains neither the removed error flow nor development shader diagnostics.

## Minimal game UI

- Removed favicon markup, ARIA labels and their runtime updates, in-race game branding/map header/caption, pause button, menu restart/retry buttons, decorative reload arrow, and countdown slogans. The title-menu heading remains. Countdown is now a single text element showing numbers/GO; Escape and R remain the pause/restart controls.
- UI styling uses one generic sans-serif family and rounded #rgb/#rgba colors. Procedural model/water colors are unchanged. Removed styles and DOM handlers belonging to deleted elements; the build now also removes unused course-name metadata. Remaining hidden HUD/countdown/pause/results/error panels are all active states.
- ZIP: **28,762 → 28,041 bytes**, saving 721 bytes. Built CSS: **6,823 bytes**. All 86 automated tests, 52 packed-game checks, and 80 source/packed layout comparisons pass. The 14 buoy-speed/loss browser checks confirm the loss screen, frozen simulation, and R-key restart after removing Retry.
- Every static main.js DOM lookup resolves; archive integrity and whitespace checks pass. Favicon markup is unnecessary for gameplay; browsers may independently request a default icon.

## CSS cleanup and production selector renaming

- Removed unused eyebrow/modal helper rules and obsolete title/menu declarations that later rules override. Source class and ID names remain readable; the build tries shorter names across styles, markup, DOM lookups, class toggles, and generated leaderboard/results markup.
- The build now measures every candidate's final Zopfli ZIP and selects the smallest actual archive. The development size report includes CSS sizes and the selected identifier map, which is not shipped in the ZIP.
- Built CSS: **9,766 → 7,739 bytes**. ZIP: **29,308 → 28,762 bytes**, saving 546 bytes (194 from cleanup and another 352 from coordinated selector renaming).
- All 86 automated tests pass. A browser comparison against the pre-cleanup stylesheet passed 80 layouts across four viewport sizes, day/night, free play, title, HUD, pause, results, and error screens, including pseudo-elements. Equivalent zero lengths from CSS minification are normalized for comparison.
- All 52 packed-game checks pass across five modes, with no game runtime/WebGL errors or subresource requests. ZIP integrity and diff whitespace checks pass.

## Redundant source cleanup

- Simplified the player-only preview controller after the opponent early return; removed unused imports and the unread acceleration diagnostic/capture; flattened the single-buoy mesh loop; removed `.stamp-top`, `.wide`, `h1 i`, and `.course-menu small` styles.
- Before/after comparisons matched AI inputs across every course, racer, and sampled speed/heading, and matched every buoy's generated vertices for both sides and highlight states exactly. All 85 automated tests and ZIP integrity checks pass.
- ZIP reduced from 29,426 to **29,308 bytes**, saving 118 more bytes. The removed imports and acceleration diagnostic were already absent from production; their removal improves source clarity without additional ZIP savings.

## Build-only metadata removal

- Removed production-only page description/theme metadata, favicon artwork, and the browser-title tagline. Retained charset, viewport, accessible control names, and menu selection attributes. An empty favicon data URL prevents a fallback network request.
- The build removes unused course descriptions and checkpoint metadata (`slalom`, `offshore`, duplicate `buoy` coordinates), plus the spray diagnostic tag. Runtime course fields and procedural item counts are unchanged; source fixtures keep their metadata. The transform rejects direct runtime reads of stripped fields to catch future dependencies.
- ZIP: **29,426 bytes**, saving another 451 bytes from 29,877. All 85 automated tests and archive integrity checks pass, including exact source/production simulation and generated-geometry parity.
- All 52 packed-game browser checks pass across five modes, with no game runtime/WebGL errors or subresource requests.

## Production size pass

- ZIP reduced from 44,374 to **29,877 bytes (29.18 KiB)**: 14,497 bytes / 32.7% saved. Packed HTML reduced from 134,325 to 80,703 bytes. Still 16,565 bytes above the eventual 13 KiB target.
- Added build-only JS/HTML/CSS minification, shader whitespace/interface compaction, an explicit internal-property rename list, development diagnostic stripping, and deterministic Zopfli ZIP packaging. Removed unused styles, the unused projection helper, and redundant initial course-mesh allocation. No gameplay, scenery counts, simulation steps, or visual-effect budgets were reduced.
- All 84 Node tests passed. After correcting the production diagnostic flag, both production tests passed again: exact source/minified simulation, checkpoint, interpolation, and generated-geometry parity; plus deterministic Unicode ZIP round-trip. Existing simulations verify all race courses finish reliably.
- The actual minified package passed 52 browser checks across all five modes: course selection, throttle, pause/resume, focus loss, restart, WebGL health, no runtime errors, and zero subresource requests. Inspected day and night rendering and menu/HUD layouts in the in-app browser. Chrome and Safari were not separately rechecked for this size pass.
- Archive integrity passed using `unzip -t`; the ZIP contains only `index.html`. Build dependencies and test fixtures are excluded. `dist/size-report.json` records the measured compression candidates.

## Sunrise reef loop

- Added six procedural reef outcrops between the smaller sandy island and the lighthouse, sharing collision, shallow-water shading, seabed, and minimap geometry. An opening preserves the original offshore route.
- Added the fifth menu option, Sunrise reef loop: 18 checkpoints around the second island and lighthouse, three laps, expert opponents, and a continuous predawn-to-daylight sun rise tied to race progress.
- All 68 automated checks pass, including every buoy corridor clearing all land, reef collision, sunrise direction and lap continuity, and all four AI-controlled riders finishing the new course with rare misses. Inspected the production menu and race start in the in-app browser. Chrome and Safari were not separately checked.
- Production build: ZIP 39,531 bytes (38.60 KB).

## Racing title background and lighthouse framing

- Added a separate four-rider AI preview for the title screen. Each selection uses its own race route; Free play previews the main island loop while keeping its cycling lighting. The preview starts with riders already underway, includes wakes/spray and buoy interactions, and lets finished riders continue through the line without returning to the grid. Preview events stay silent and never alter the actual game's timer, checkpoint state, or starting grid.
- Reframed the title camera into a gentle panoramic drift with the lighthouse on the right. Reduced distant fog only for this title view so the rocky island remains visible. The in-race chase camera is unchanged.
- All 64 automated tests pass, including moving riders on each route, Free play's main-loop mapping, clean actual starts, continued finish-line motion, and right-side lighthouse framing at desktop aspect ratios. All 22 browser title/mode checks pass, including visible preview motion and clean transitions into one-player Free play. Inspected the production background in daylight and at night.
- Build, bundled syntax, offline dependency checks, and archive integrity pass. ZIP: 38,950 bytes (38.04 KB).

## Rainbow spray with ordinary wakes

- Removed rainbow ribbon emission/rendering and its trail-head state. Spray still turns rainbow at maximum buoy-earned level 5; all levels now emit the same broken white foam and outward ripples. This applies to player and opponents.
- All six lighting/effect checks pass, including no ribbon particles at any level, white foam at level 5, and rainbow spray eligibility independent of Space charge. Inspected maximum-level output in the browser: foam patches, zero ribbon strips, and no WebGL errors.
- Production build regenerated. ZIP: 38,587 bytes (37.68 KB).

## Fixed-step rendering interpolation

- Diagnosed a 60 Hz simulation / high-refresh rendering mismatch: each raw craft pose was held across multiple frames while the chase camera advanced every frame. Added a separate presentation snapshot that interpolates hull translation/rotation, rider pose, buoy motion, and world time using the fixed-step remainder. The camera and effects consume the same displayed state. Simulation, collisions, gate logic, and audio events keep their authoritative state.
- Presentation runs up to one tick (16.7 ms) behind simulation, with no extrapolation. Restart/course changes, pause/results, and large teleports bypass stale snapshots. Angular interpolation takes the short path through wraparound.
- Live browser measurement: 119.6 FPS, raw pose repeated on 151/300 moving frames, interpolated pose repeated on 0/300. All four frame-pacing checks and all 19 mode/lifecycle checks pass, with no WebGL errors. Added Check frame pacing to the development browser harness.
- All 61 automated tests pass, including even motion at 60/120/144/240 Hz, synchronized rider/buoy/time interpolation, state immutability, angular wraparound, and lifecycle discontinuities. Build, bundled syntax, offline dependency checks, and archive integrity pass. ZIP: 38,881 bytes (37.97 KB).

## Shared buoy-earned boosts

- Every rider now gains the same +8% power/speed step for correct buoy passes, capped at level 5. Any miss resets that rider's earned bonus and clamps horizontal speed to their own base cap; correct passes rebuild it. Opponents retain the previously requested 15% base pace increase. AI target speeds follow the earned multiplier, and existing rainbow effects apply to all riders at level 5. Opponent events carry their actual IDs and do not trigger player HUD/audio notifications.
- Increased wet-hull upward rebound damping from 6 to 8 after the faster traffic exposed an excessive jump in the existing rough-water regression. Gravity and free-flight equations remain unchanged.
- All 58 tests pass. Added shared progression/reset/rebuild checks across all four riders, including normal and boost reset caps, preserved vertical velocity and Space charge, event ownership, and restart. Actual opponent top-speed checks verify earned bonuses. Complete three-lap runs on all routes finish reliably; tests permit at most two misses per opponent and require fewer than 3% missed crossings overall rather than perfect AI. No deliberate misses were added. The rough-water clearance regression also passes.
- Rebuilt offline HTML/ZIP; bundled syntax, dependency checks, and archive integrity pass. ZIP: 38,368 bytes (37.47 KB). Full browser race not repeated.

## Minimal title screen

- Removed the masthead, duplicate branding, tagline, course descriptions/subtitles, statistics, stamp, footer copy, and visible lighting/sound toggle buttons. The title screen now contains only SUNWAKE RUSH, the four course names, and START, with spacing adjusted for the reduced content. Removed the decorative racing telemetry slogan as well. Existing keyboard shortcuts remain functional.
- Inspected the packaged title screen and accessibility tree. All 19 browser mode checks pass, covering selection, starting all courses, free play, pause/menu navigation, restart, and WebGL state. Removed obsolete DOM references; the development mute check now reads audio state rather than the deleted label.
- Build, bundled syntax, offline dependency checks, and ZIP integrity pass. ZIP: 38,361 bytes (37.46 KB). Physics tests were not repeated for this menu-only change.

## Faster opponents and softer splash audio

- All opponents now receive a fixed 1.15 multiplier on target speeds, thrust, and normal/boost caps (57.5 / 78.2). Course difficulty tuning remains additive, and opponents still do not earn speed levels from buoys. Player power and shared hull/contact rules remain unchanged.
- Deterministic three-lap rival finish times improve from 102.12–109.32 to 89.17–95.77 seconds on main, 124.68–127.72 to 110.55–115.33 on reverse, and 147.37–154.60 to 135.40–140.15 on rocky. Every rival finishes every route with zero misses. Actual lap gains vary with turns and wave contact; the configured speed increase is 15%.
- Splash peak gain and the low-pass cutoff sweep are halved at every impact strength; the softer small-impact curve and durations remain intact. Direct synthesis-parameter checks verify 50% gain/cutoff at small, medium, and hard impacts.
- All 57 tests pass, including updated actual opponent normal/boost speed checks, independence from buoy levels, and complete clean races. Production HTML/ZIP rebuilt; ZIP: 39,223 bytes (38.30 KB). A full browser race and subjective audio listening were not repeated.

## Reduced rough-water launches

- Added upward rebound damping while the hull remains in contact with water, acting only above vertical speed 4 and scaled by wet contact fraction. This dissipates excess launch energy; wave height, gravity, and airborne arcs retain their existing equations. All craft use the same damping.
- In the deterministic rocky-route player run, maximum height above the sampled local surface drops from 8.00 to 4.47 units, peak airborne upward velocity from 13.48 to 7.30, and total airtime from 35.93 to 27.10 seconds. Race completion is 164.83 seconds with zero misses. These are simulation measurements; a full browser race was not repeated.
- All 57 tests pass, including a rough-water clearance bound added to the existing full-race test, stable buoyancy, small ballistic hops, rider landing response, and clean AI finishes on every course. Production build regenerated; ZIP: 39,181 bytes (38.26 KB).

## Course-specific lighting and stronger later-course opponents

- Main stays in daylight; reverse fades from sunset to dusk continuously over three laps; rocky stays at night. Free play cycles through day, sunset, night, and sunrise every 240 seconds of unpaused world time, independently of player position. Manual overrides remain available; selecting a course restores its automatic profile. Menu descriptions show atmosphere and rival difficulty.
- Reverse and rocky rivals use progressively faster target speeds, tighter line variation, quicker steering decisions, and more frequent safe boost opportunities. Hull forces, engine limits, checkpoint rules, and player controls remain shared. Main AI tuning is unchanged.
- Deterministic three-lap comparisons: reverse rivals improve from 131.03–138.87 seconds to 120.55–127.53 (about 8% faster on average); rocky improves from 174.82–185.03 to 153.00–159.12 (about 14%). All three rivals complete both courses with zero misses. Main rivals retain their approximately 102–109 second baseline.
- All 57 tests pass, covering course lighting, dusk continuity, free-play cycle/seam behavior, manual overrides, normalized sky directions, and clean race finishes with later-course performance bounds. All 19 browser mode checks pass, including menu changes, race/restart behavior, free play, and WebGL status. Inspected production sunset/night menus; a full browser race was not repeated.
- Rebuilt offline HTML and ZIP; bundled syntax, offline dependency checks, and archive integrity pass. ZIP: 39,097 bytes (38.18 KB).

## Speed-responsive chase camera

- Camera offset eases from 11 units behind / 6 above sea level when stationary to 17 behind / 9 high at speed 48. A smoothed speed blend suppresses rapid changes and eases back in when stopping. Fixed downward pitch and hull-independent height preserve the steady horizon; idle heading hold remains intact.
- All 55 tests pass, including smooth outward/upward travel, return to idle, and no height response to hull bobbing, flight, or the boost button at constant speed. Browser preview confirmed cruising height 9.00 and idle height 6.00, visibly distinct framing, and no WebGL errors. Added Stop / cruise to the wake preview fixture.
- Production build, bundled syntax, offline dependency checks, and archive integrity pass. ZIP: 38,798 bytes (37.89 KB).

## Distinct buoy and maximum-level sounds

- Clean player passes now use a brighter rising two-note chime; misses use a descending buzz. Entering buoy-earned speed level 5 adds a short ascending fanfare after the pass chime. Existing speed-level transition events prevent repeated maximum cues while holding level 5. All tones skip scheduling while muted.
- All 54 tests pass, including verification that a clean streak crossing additional buoys emits exactly one maximum-level event. Added `test/audio.html` to audition the three cues through the production audio class and measure output. Browser output checks confirm active audio generation; subjective sound quality was not assessed.
- Production build, bundled syntax, offline dependency checks, and ZIP integrity pass. ZIP: 38,735 bytes (37.83 KB).

## Faster stationary player steering

- Tripled the player's zero-speed steering authority from 0.21 to 0.63 radians/second. The extra assist fades smoothly to zero by speed 8; cruising steering and AI steering retain their prior tuning.
- All 54 tests pass. The steering regression verifies three times the actual stationary yaw over two seconds, no invented forward motion, and unchanged steering authority at speeds 8 and above. Production build regenerated; ZIP: 38,536 bytes (37.63 KB).

## Wave whitecaps and incoming beach foam

- Added procedural, textured foam to larger crests directly in the water material. Wide curved bands travel toward the sandy islands at approximately 2.4 world units per second, about 18 units apart, with a broken wash around the waterline. Shore distance follows the islands' existing irregular contours. Foam increases local opacity while gaps retain translucent water; dusk/night lighting and distant fading apply.
- Inspected the beach fronts and exposed offshore whitecaps in the browser, including night lighting, with no WebGL errors. Added a Beach surf viewpoint to `test/course-preview.html`. This is a water-material change; wave geometry and hull forces remain unchanged. No separate Chrome/Safari or frame-rate benchmark was run.
- All 54 existing tests pass. Production HTML/ZIP rebuilt; bundled syntax, offline dependency checks, and archive integrity pass. ZIP: 38,454 bytes (37.55 KB).

## Water landing splash audio

- Added procedural filtered-noise splashes for the player's water landings. Fresh hull contact records the closing speed relative to the moving wave, separately from the lingering rider-recoil value. Harder impacts increase sound volume, brightness, and duration. A 1.5-unit impact threshold and 0.22-second cooldown suppress minor contact chatter; muted audio skips splash playback.
- All 54 tests pass, including a new actual-drop check for impact scaling, one splash per landing, pause behavior, and restart reset. The browser landing fixture dispatched one splash for both small and hard drops (observed strengths 11.2 and 19.9), with the AudioContext running and no WebGL errors. Browser checks verify dispatch and audio state, not subjective sound quality.
- Rebuilt the self-contained HTML and ZIP; bundled syntax, offline dependency checks, and archive integrity pass. ZIP: 37,904 bytes (37.02 KB).

## Broken foam wakes

- Ordinary wakes use scattered foam flecks and short, separated ripple arcs instead of the seven joined ribbon strips. Patches drift outward, follow wave height at each vertex, and shrink away over their lifetime. Existing spray and the 650-particle cap remain in place. Only buoy-earned speed level 5 produces rainbow ribbons and colored spray.
- All 53 tests pass; the existing effect check now verifies ordinary wakes contain moving foam and ripples with no ribbon corners at levels 1–4, independently of Space boost charge. Inspected both ordinary foam and maximum-level rainbow trails in `test/wakes.html`, with no WebGL errors. A full browser race was not repeated for this visual change.
- Production build, bundled syntax, offline dependency checks, and ZIP integrity pass. ZIP: 37,519 bytes (36.64 KB).

## Stable vertical camera and rocky-island lighthouse

- Chase-camera height is fixed at 8.5 world units above sea level, and its downward pitch stays fixed as horizontal following distance changes. Hull height, wave motion, jumps, and boost no longer move or pitch the camera vertically. Existing damped horizontal following and idle-heading hold remain intact. Entering a ride initializes directly at the chase height.
- Moved the lighthouse to the rocky island summit, extended its buried foundation, and adjusted the beam drop and matching shader illumination for its new height. The rainbow beam continues to reach the sea near its far end.
- All 53 tests pass, including constant camera height/pitch over changing hull heights, turns, and boosts; idle-heading hold; lighthouse placement; and clean AI finishes on all race routes. Browser preview kept camera height at 8.50 while the hull moved above and below sea level. Inspected the relocated lighthouse and beam in daylight/night with no WebGL errors. A full browser race was not repeated for this rendering change.
- Offline resource checks, bundled syntax, and ZIP integrity pass. ZIP: 37,103 bytes (36.23 KB).

## Heavier gravity and shorter jumps

- Increased gravity from 14 to 22 world units/s², preserving the existing wave fields, hull spring/damper, and ballistic flight. Resting draft adjusts naturally through buoyancy; there is no forced airtime or height cap.
- A controlled launch at upward velocity 8 from height 2 now rises 1.44 units versus 2.27 and lands after 0.88 seconds versus 1.31. In a deterministic rocky-route AI-driven player run, total airborne time falls from 63.75 to 32.55 seconds, with zero missed buoys; course completion changes from 176.08 to 164.18 seconds as the craft maintains more water contact. These are simulation measurements, not a browser playtest.
- The prior 49 tests pass, including clean finishes on all three race routes. An additional jump-height, airtime, and landing-settle regression check also passes, bringing the suite to 50 checks.
- Production HTML and ZIP rebuilt; bundled syntax and archive integrity pass. ZIP: 37,076 bytes (36.21 KB).

## Course menu and free play

- Added four title-screen choices: free play, an easy clockwise main-island loop (10 checkpoints), a varied counterclockwise main-island loop with narrower slalom lines (16 checkpoints), and the existing choppy rocky-island route (18 checkpoints). The easy route is the menu default. Race restart preserves the selected route, and the pause menu can return to course selection.
- Course geometry, buoy widths, spawns, AI targets, ordered progress, sky progress, and minimap routes now come from each race’s course object. Switching courses replaces and disposes the old marker/rainbow GPU buffers. The three islands and geographic offshore chop are shared scenery.
- Free play has one rider, no buoys or start arch, no opponents, no countdown, no race clock/progress, and no off-course or missed-buoy penalties. Racing HUD is hidden; driving, waves, boost, sound, lighting controls, the exploration map, pause, and restart remain available.
- The automated suite now has 49 passing checks: the prior 44 plus five mode tests covering free exploration, opposite route direction, corridor clearance, actual easy/hard crossing tolerance, complete clean AI races, and route-preserving restart. All AI riders finish the easy route in approximately 97–111 seconds and the reverse route in approximately 134–144 seconds.
- Nineteen browser mode checks pass, including hidden racing UI, free-play acceleration, marker replacement, four-rider starts, pause/menu navigation, restart, and no WebGL errors. The complete reverse-course keyboard playtest passes all 21 checks in 131.60 seconds at approximately 120 FPS locally. Inspected the packaged menu and free-play scene; Chrome and Safari were not separately rechecked.
- Self-contained production HTML and ZIP regenerated. Bundled syntax, offline-resource checks, and ZIP integrity pass. ZIP: 37,033 bytes (36.17 KB).

## Third rocky island and exposed offshore loop

- Added a small gray, craggy island offshore from the lighthouse beach, with no palms, procedural rocks, a submerged shelf, and shoreline collisions. The route now sails out around it and returns to the original two-island channel. Eighteen ordered checkpoints (seven on the offshore excursion) enforce the longer route; a three-lap race processes 55 crossings. The minimap and title show three islands. Circuit length is approximately 1,655 world units.
- A smooth elliptical exposure field raises offshore swells and strengthens the shorter crossing-wave layers. CPU hull physics and the GPU water shader share all exposure parameters. At sampled offshore/channel points, RMS wave height is 1.56 versus 0.91 units and RMS slope is 0.303 versus 0.115. The sheltered channel retains its existing waves.
- All 44 automated tests pass, including three-island shoreline clearance, complete legal checkpoint corridors, offshore-route coverage, new-island collisions, minimap bounds, exposure continuity, relative wave roughness, and all four racers completing three laps with zero misses in approximately 176–196 seconds.
- The full browser keyboard race passes all 21 checks, finishing in 185.73 seconds at approximately 120 FPS locally, with working boost/jumps/rider physics, results, and no WebGL errors. Inspected the offshore waves and island in the in-app browser. Chrome and Safari were not separately rechecked.
- Rebuilt self-contained HTML and ZIP; bundled syntax, offline-resource checks, and archive integrity pass. ZIP: 35,322 bytes (34.49 KB).

## Rainbow effects at maximum speed level

- Corrected rainbow wake/spray eligibility to the buoy-earned speed level of 5/5. A full rechargeable Space meter no longer enables rainbows at lower levels. Missing a buoy stops new rainbow emissions; existing particles fade naturally. Removed the misleading rainbow text from the Space meter label.
- All 42 tests pass. Effect checks cover both ribbons and spray at every speed level against empty, partial, nearly full, and full Space charge. Rebuilt offline ZIP: 34,789 bytes (33.97 KB).

## Day, sunset, and night across three laps

- Automatic lighting now spans the full race: lap one stays in daylight, the sun sets progressively through lap two, and lap three stays at night. Celestial directions and lighting values are continuous across both lap changes. Fixed Day/Night overrides remain available.
- Checkpoint state disambiguates the course projection near start/finish, keeping the initial run-up in daylight, preventing an early lighting rewind at the lap line, and retaining night after finishing. Restart resets automatic lighting through the new race state.
- All 42 tests pass, including daylight/night coverage across their entire laps, sunset progression, lap-boundary continuity, start/finish edge cases, and world-space camera projection. Browser previews show each lap lighting state with no WebGL errors. Offline syntax/resource checks and ZIP integrity pass. ZIP: 34,794 bytes (33.98 KB).

## World-anchored sky

- Replaced screen-coordinate sky rendering with world-space camera rays. Stars retain fixed spherical directions; sun and moon follow a continuous course-driven orbit. Camera rotation and pitch change the visible sky, while camera translation alone produces no distant-sky parallax. Manual Day/Night keeps fixed celestial directions.
- Flare position is projected from the same sun direction and is suppressed outside the viewport or behind the camera. Surface light and water highlights now follow the celestial direction.
- All 42 automated tests pass, including camera rotation, pitch, translation invariance, behind-camera rejection, normalized sun directions, and lap-seam continuity. In-app browser inspection with frozen simulation verified sun/flare leaving view and stars shifting with the horizon during 30-degree camera turns. Five flare fixture checks pass, including offscreen/behind-camera suppression and no WebGL errors. Chrome and Safari were not separately rechecked.
- Offline syntax, resource checks, and ZIP integrity pass. ZIP: 34,626 bytes (33.81 KB).

## Sun flare and procedural seagulls

- Added a warm sun halo, rays, horizontal streak, and faint hexagonal lens ghosts. A 9×9 GPU color sample around the rendered sun center estimates source visibility; the effect fades behind scenery and switches off at night. This is a lightweight color-based occlusion approximation, with no production CPU pixel readback or external textures.
- Eighteen seagulls in three flocks orbit the island shores, with low coastal passes and higher inland glides, banking and phased wing beats. The batched mesh contains 342 triangles. Flight uses simulation time, so pausing freezes animation.
- All 40 existing automated tests pass. Separate geometry checks verified finite vertices, deterministic animation, changing flight poses, and water clearance at six sampled times. Browser atmosphere checks pass for visible-source flare, covered-source suppression, nighttime suppression, and no WebGL errors. Inspected bird silhouettes and daylight/night scenes in the in-app browser; Chrome and Safari were not separately rechecked.
- Rebuilt the single-file offline package, including the new atmosphere module. Bundled syntax, external-resource checks, and ZIP integrity pass. ZIP: 34,054 bytes (33.26 KB). The development-only `/test/atmosphere.html` fixture provides bird animation and flare checks.

## Course-driven daylight and full-charge rainbow wakes

- Automatic lighting projects the player onto the course: day, sunset, night, and sunrise once per circuit. It depends on location rather than elapsed time or checkpoint success, with a continuous lap seam. Sky, sun/moon position, water reflections, fog, and surface lighting transition together. The header displays the phase; N/header cycles Auto / Night / Day overrides.
- Newly emitted wake ribbons and spray use rainbow colors only at a completely full Space boost meter. Partial charge emits white foam; existing trails fade naturally. Speed still controls color strength when fully charged.
- All 40 automated tests pass, including lighting on lateral racing lines, lap seam continuity, overrides, full versus partial charge for both effect types, and complete AI races.
- Inspected all four course-position lighting fixtures in the in-app browser, each reporting no WebGL errors. Verified production Auto / Night / Day controls and race start. Chrome and Safari were not separately rechecked for this rendering change.
- Offline bundled syntax, resource checks, and ZIP integrity pass. ZIP: 32,350 bytes (31.59 KB).

## Five-miss races, wider buoy spacing, and translucent shallows

- Removed automatic recovery and its teleport/timer. Each expected buoy crossing is consumed once, including misses; misses reset the speed bonus and advance the next target. Five total misses end the race, freeze simulation, and display a DNF/retry screen. The HUD shows misses out of five, with a warning color at four. Restart clears the count.
- Reduced the course from 24 to 12 checkpoints, roughly doubling spacing while retaining the shoreline route, channel, alternating passing sides, and three laps. A complete race now processes 37 checkpoints. All four AI-controlled racers finish with zero misses in 102–113 seconds.
- Added a sloping procedural sand shelf, swaying seagrass, animated caustic shading, and up to 96 fish in locally culled schools. Water opacity increases with depth and grazing angle. A water depth prepass prevents overlapping crests from accumulating transparency. Marine scenery does not change boat physics.
- All 37 automated tests pass. Fourteen browser fixture checks pass, including speed reset/advance, fifth-miss loss, frozen simulation, retry, miss-counter UI, and no WebGL errors. Inspected submerged vegetation and fish through the surface.
- Full browser keyboard playtest passes all 21 checks, completing three laps in 106.53 seconds at approximately 120 FPS locally, including boost, jumps, wake physics, results, and no WebGL errors.
- Offline build syntax, inline-resource checks, and archive integrity pass. ZIP: 31,504 bytes (30.77 KB).

## Night mode and rainbow lighthouse

- Added a header toggle and N shortcut, with smooth day/night lighting, procedural stars, moonlit water and fog, readable markers, and a matching title theme. Mode belongs to the renderer and survives race restart.
- Generated a striped lighthouse, balcony, lantern, and rotating seven-band light volume beside the island channel. Additive translucent beams and matching surface illumination sweep across the water; no asset files or dependencies are added.
- All 35 simulation tests pass. Lighthouse/beacon geometry is finite and the tower is inland. Browser inspection covered night title/race views, visible tower and rainbow beam, and night selection surviving restart. The new shaders compile and render in the in-app browser; Safari was not separately rechecked.
- Production build syntax, self-contained resource checks, and ZIP integrity pass. ZIP: 30,163 bytes (29.46 KB).

## Closer shoreline and island channel

- Replaced the wide outer circuit with a roughly 1,028-unit shoreline loop. The east leg passes between the main island and a taller, elongated second island. Every course sample is within 60 units of land; central channel checkpoints are within 40 units of both banks.
- Narrowed checkpoint half-width from 25 to 18 and adjusted buoy offsets to keep the entire passing corridor clear of shore. Retained 24 alternating markers, the longer opening straight, three laps, and mandatory slalom direction changes. The minimap bounds include the second island outside the racing loop.
- AI takes a centered channel line and brakes earlier for the tighter bends; the opening straight retains boost. All four AI-controlled racers complete three laps without recovery in 162–174 seconds, with player boost reaching 56.58 units/s.
- All 35 tests pass, including full corridor clearance, both channel banks, minimap coverage, and complete races. Inspected the channel entrance in the in-app browser. Build syntax, inline-resource checks, and ZIP integrity pass; archive size 28,287 bytes (27.62 KB).

## Upright rider balance and forgiving articulation

- Upper-body rotation now balances independently toward world up while the pelvis and limb anchors follow the hull. Softer vertical suspension deepens landing compression; constrained hips and bent knees/elbows preserve fixed segment lengths and planted contacts.
- All 34 automated tests pass, including combined pitch/roll at multiple headings, angular spring recovery/reset, 288 extreme rider/hull poses, landing compression, and all four AI-controlled riders completing three laps without recovery.
- Inspected the close-up browser fixture with a held 37-degree bank (torso 0 degrees), rapidly varying combined pitch/roll (small torso sway), and landing impulses. No WebGL errors. Production title/countdown and racer rendering checked in the in-app browser; this revision was not separately rechecked in Safari.
- Rebuilt the offline HTML and ZIP. JavaScript syntax, self-contained resource checks, and archive integrity pass. ZIP: 28,038 bytes (27.38 KB).

## Turquoise water, rainbow trails, and course arch

- Restored turquoise water with shallow-water color, sky reflection, glints, foam, and the existing blob shadows. Removed the oil-film shader.
- Seven adjacent wake ribbons and cycling spray colors blend from pale foam into a full rainbow as speed rises from 8 to 48 units/s. Emission remains capped at 650 particles, stops in the air, and resets its trail history on restart/recovery-sized jumps.
- Added a procedural seven-band rainbow arch across start/finish, with a clear opening wider than the checkpoint corridor. Browser inspection confirmed the arch, normal water, colored wake trails, and progression through the start line at approximately 120 FPS locally.
- All 11 initial browser control checks pass after isolating their idle fixture from opponent bumps/wakes. This visual-only pass did not repeat a full three-lap browser race.
- Offline build regenerated; bundled syntax, no-external-script, and archive integrity checks pass. ZIP: 27,420 bytes (26.78 KB).

## Vehicle blob shadows

- Added four procedural, softly feathered hull-aligned blobs directly to the water shader. Their centers stay beneath the craft; increased water clearance broadens and softens them. No extra textures, translucent geometry, or depth offsets are needed.
- The chase camera aims slightly lower during higher jumps to retain the water-level landing cue. Browser inspection of `test/shadows.html` verified all four grounded shadows and the player six meters above the water. The preview is excluded from production.
- Production build regenerated; bundled JavaScript syntax and ZIP integrity checks pass. ZIP: 27,221 bytes (26.58 KB).

## Buoy and racer interactions

- Physical hull contacts transfer momentum, preserve glancing motion, and jostle hull rotation and rider springs. Buoys recoil, tilt, and return to their moorings. Airborne clearance, finished-racer exclusion, anchored checkpoint logic, bounded wakes/spray, and impact sound feedback are included.
- All 31 automated tests pass, including momentum/energy behavior, coincident hull separation, glancing contacts, buoy recoil/settling, jumping clear, pause/reset, and full AI races. All eight focused browser collision checks pass with no WebGL errors.
- A full digital-steering simulation recorded 50 impact events, with all four racers finishing in 194.75–207.53 seconds and no recoveries. Speed levels are unaffected by a bump alone.
- Offline build regenerated. Bundled JavaScript syntax and archive integrity pass. ZIP: 26,796 bytes (26.17 KB).

## Player speed levels

- Player-only speed progression starts at 1 and caps at 5. Each correct ordered checkpoint adds one level and 8% engine power/top speed. Invalid forward checkpoint crossings reset immediately without advancing the gate; duplicate misses emit one notice, correcting the miss rebuilds, and recovery/restart resets the chain.
- Five HUD bars, a numeric level, and level-up/reset notices expose the state. All 26 automated tests and 10 focused browser fixture checks pass. Physics checks verify higher acceleration, 50/66 normal caps and 68/89.76 boosted caps at levels 1/5, and unchanged AI power.
- A full digital-steering simulation reached level 5 and finished the player in 196.90 seconds, encountering four missed crossings and rebuilding after them, without recovery. All opponents also finished. Peak player speed was 67.81 units/s.
- Offline HTML/ZIP rebuilt; archive integrity passes. ZIP: 25,088 bytes (24.50 KB).

## Larger, closer waves and tighter slaloms

- Halved steering authority at every speed, including idle and braking turns. On flat water a cruising U-turn takes approximately 2.40 seconds with a 70.60-unit footprint; the slow stationary pivot remains available.
- Raised wave amplitude by 50% and spatial frequency by 35% (approximately 26% shorter wavelengths). Shared parameters keep hull contacts and the oily water rendering synchronized.
- Increased checkpoint count from 12 to 24, with approximately 62–114 units between checkpoint centers (median 83). Seven offset checkpoints form sharper slalom clusters; going straight along the nominal course fails these crossings. Shifted the northern route outward to keep the tighter lines clear of both islands.
- AI riders use earlier braking and legal passing lines with the same reduced steering and wave physics. All 23 automated tests pass, including the 73 ordered crossings needed for three laps, slalom enforcement, shore clearance, and all four riders finishing without recovery. Simulated races now take approximately 3½ minutes.
- The browser keyboard driver completed all three laps without recovery at approximately 120 FPS; its boost-speed check exposed conflicting AI braking. Fixed the controller to permit boosting on suitable straights. Revalidated full analog and digital races in simulation: all riders finish without recovery, and the player reaches 58.15/58.27 units/s above the 50-unit cruising cap. The automated AI race now guards against this boost regression. A second full browser race after that controller correction was not run.
- Offline build regenerated: ZIP 24,373 bytes (23.80 KB).

## Oily, iridescent water

- Replaced the fixed rainbow bands with a dark water base, procedural sky reflection, Fresnel reflectivity, and sun glints. Warped, drifting film thickness drives an RGB thin-film approximation whose colors change with viewing angle and wave normals. All shading remains procedural.
- Browser inspection confirms visible iridescent patches during racing. All 21 browser checks pass, including a 101.67-second race without recovery or WebGL errors at approximately 120 FPS locally. This change affects rendering only.
- Rebuilt offline HTML and ZIP; bundled JavaScript syntax, inline-resource checks, and archive integrity pass. ZIP: 23,951 bytes (23.39 KB).

## Varied wave patterns

- Six shared wave layers add long crossing swells, rolling trains, short chop, and wind ripples. Smooth spatial patches and traveling amplitude groups vary conditions across the course and over time. The GPU equations are generated from the same layer coefficients used by hull contact sampling.
- All 23 automated tests pass, including complete AI races without recovery. All 21 browser checks pass; the keyboard-controlled player finishes in 101.67 seconds without recovery or WebGL errors, at approximately 120 FPS locally.
- Offline build and ZIP regenerated; archive integrity passes. ZIP size: 23,484 bytes (22.93 KB).

## Twin-island course and rainbow water

- Extended the opening straight and the first island; added a second island with its own procedural terrain, palms, rocks, and matching shoreline collision. The curved circuit is approximately 1,611 world units long.
- Replaced paired gates with alternating coral/cyan buoys, varied lateral offsets, and checkpoint spacing of approximately 99–181 units. Checkered buoys mark start/finish. The HUD and flags show the required passing side, and the minimap fits the full route and both islands.
- Water uses procedural rainbow bands with wave shading, highlights, and shoreline foam. CPU buoyancy and GPU waves retain the shared wave scale; camera and handling tuning are preserved.
- All 23 automated tests pass, including both island boundaries, offshore course clearance, variable spacing, wrong-side rejection, ordered laps, recovery, and complete AI races. All four AI-controlled racers finish in approximately 112–122 seconds without recovery.
- All 21 browser checks pass through the real keyboard handlers. The player finishes three laps in 124.17 seconds with no recovery or WebGL errors, at approximately 120 FPS locally. Rebuilt offline ZIP: 23,060 bytes (22.52 KB); archive integrity and bundled JavaScript syntax checks pass.

## Gentler steering and larger waves

- Moving steering authority reduced by approximately 19%, preserving the idle pivot and speed-dependent response. Base wave amplitude increased by 60%, with one shared scale driving water rendering and hull contact sampling.
- All 21 automated tests pass. Flat-water acceleration reaches 46.32 world units/s after three seconds; a full-throttle U-turn takes 1.27 seconds with a 36.28-unit footprint. The handling test now isolates engine/steering behavior from wave phase.
- All four AI-controlled racers finish in 76.68–83.32 seconds without recovery. The actual keyboard browser harness passes all 21 checks, completing three laps in 86.22 seconds without recovery or WebGL errors, at approximately 120 FPS locally.
- Production HTML and ZIP rebuilt; archive integrity passes. ZIP: 22,065 bytes (21.55 KB).

## Hull and rider physics revision

- Reviewed the primary hull/contact and secondary rider pipelines in `../race64/fnport`; implementation decisions and approximation boundaries are in `PHYSICS.md`.
- `npm test`: 21 passing tests, including stationary torque, speed-dependent steering authority, buoyancy equilibrium, wave-induced pitch/roll, ballistic flight, landing/rider compression, fixed limb lengths, rider-to-hull load transfer, wake feedback, timestep consistency, and recovery reset.
- The browser harness passed all 21 checks and finished three laps in 82.22 seconds, without recovery or WebGL errors, at approximately 120 FPS on the development machine. It verified idle pivoting through the real keyboard handlers, independent rider motion, six live hull contacts, and wake generation.
- The full AI simulation finished all four riders without recovery. Production packaging remains self-contained and all assets remain procedural. The later 13 KB optimization pass is still deferred.

## Handling revision

- Raised normal/boost speed caps from 34/46 to 50/68 world units per second; cruising speed previously settled near 33.3. Acceleration reaches 46.38 units per second after three seconds, versus 25.48 before.
- A full-throttle cruising U-turn now takes 1.10 seconds and spans 33.80 world units, versus 3.25 seconds and 67.11 before. Steering responds faster, braking increases turn rate, and stronger lateral grip keeps the craft following its heading.
- Camera follow is faster to keep tight turns readable. Boost release now sheds excess speed smoothly.
- `npm test`: 12 passing tests, including tighter turn geometry, braking, and smooth boost release. The four AI controllers finish in approximately 73–81 seconds without recovery; a digital-keyboard controller completes the race in approximately 65 seconds in simulation.
- The updated browser harness passed all 17 checks and completed the full race in 64.92 seconds with no recoveries or WebGL errors, at approximately 120 FPS on the development machine.

## Original first-pass checks

- `npm test`: 10 passing simulation tests covering countdown, checkpoint order and crossing direction, three laps, boost, braking, pause, restart, recovery, collisions, ranking, and finished-rider behavior.
- The deterministic AI simulation finished all four riders in approximately 113–122 seconds without recovery.
- The development browser harness passed 17 checks through the actual keyboard event listeners and game UI. Its digital-keyboard driver finished all three laps in **100.02 seconds**, without recovery, with working boost and wave jumps, and with no WebGL error. Observed frame rate was approximately **120 FPS** in the in-app browser on the development machine; this is not a guarantee for other hardware.
- Results displayed all four riders. Clicking **One more wave** restored the countdown, lap one, zero time, and a full boost meter.
- Safari: production build rendered the title screen, race scene, and countdown correctly.
- Chrome: extracted ZIP opened directly from a local `file:` URL; race rendering, countdown, audio playback activation, and the pause menu worked.
- The ZIP contains only `index.html`, passes archive integrity verification, and the HTML contains no external script or stylesheet references. Its JavaScript also passes a standalone syntax check.

Run `npm run build` and `npm run check:size` for the current archive size. The first pass deliberately does not enforce the eventual 13,312-byte limit. Subjective handling and audio balance remain open to player feedback.

### Shader name reuse and caustics review (2026-09-13)

- Added conservative short-name reuse across disjoint GLSL functions and value-preserving numeric shortening independent of template baking. Generated-shader token checks and scope/global-name fixtures pass.
- Full Node suite passed 107 tests. After restoring the original caustics, the seven production tests and seven transform tests passed again.
- Removing the nested caustic distortion produced a visible grid and was rejected by the user. The original expression is restored in source and production. Single-sample foam remains preview-only because it visibly reduces texture detail.
- `/test/caustics.html` defaults to the restored original, with a rejected-grid comparison, freeze, two cameras, lighting selection, and an optional foam trial. All preview variants inspected rendered without WebGL errors.
- Final build selected `scoped-numbers`: 56,376 HTML bytes / 23,010 ZIP bytes. The same build's previous `frequency-inline` configuration was 23,039 ZIP bytes, so the retained shader optimizations save 29 bytes. Scoped-only tied at 23,010 ZIP bytes.
- Restored packed game passed all 52 browser checks across five modes, without runtime/WebGL errors or subresource requests. ZIP round-trip and `git diff --check` passed. The package remains 9,698 bytes over 13 KiB.

### Rival engine mix simplification (2026-09-13)

Replaced the product of distance fades with one fifth-power fade and reused the shared clamp for stereo panning. Retained speed-dependent gain, the speed cap, camera-relative stereo, overlap protection, and silence at 140 units. Nearby rivals are slightly quieter (about 1 dB at 12 units). Both rival-audio tests pass, covering direction, camera reversal, overlap, monotonic attenuation, finite bounded panning, cutoff, and speed saturation. Full production build is 23,003 ZIP bytes versus 23,010 before this change (7 bytes saved after candidate selection). `git diff --check` passes.

### Bird mesh generator simplification (2026-09-13)

Replaced four explicit body triangle calls with two existing quad-helper calls, retaining the original diagonals and winding. A before/after comparison at times 0, 12, 12.25, and 100 confirmed identical triangle membership, vertex positions, colors, and normals (maximum normal difference zero). All 18 birds retain 10 triangles each and their existing flight/flapping animation. The three mesh tests and `git diff --check` pass. Source is 71 bytes shorter. Full rebuild is 22,996 ZIP bytes versus 23,003 previously: 7 bytes saved after candidate selection.
