# Sunwake Rush

A procedural, low-poly jet-ski racer: three islands, three laps, and three AI opponents. All meshes, colors, waves, effects, and audio are generated in code. No runtime dependencies, textures, fonts, or audio files are downloaded.

The title screen contains only the game title, five course names, and START. Title, pause, loss, and results reuse one menu panel, with a shared Start/Resume button and Courses action. Responsive sizing uses a compact stylesheet. In-race branding, the map header/caption, and the pause button are removed. The countdown displays only numbers and GO. The UI uses one generic sans-serif font and rounded short hex colors; procedural world colors remain unchanged. Four AI riders race behind the menu on the selected course; Free play previews the main island loop without buoys or a start arch. Every preview uses the normal starting grid near course point 0 and accelerates immediately. There are no course-specific entry positions or warm-up simulation; course switching preserves the shared camera, lighthouse, and water clock. A fixed panoramic camera uses the former orbit’s initial 30-second-offset view, keeping the rocky-island lighthouse on the right. The preview is separate from the actual race and loops continuously. All four preview riders share the opponents’ look-ahead controller. Lighting follows the selected course and sound starts with the game; neither has a toggle.

## Play

Requires Node.js 20+. Install the pinned build dependencies once:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5179 and choose a ride:

- **Free play:** explore all three islands while three AI riders cruise the main island loop continuously, with no buoys, race timer, laps, or miss limit. Throttle, braking, collisions with land, and waves remain active.
- **Main island loop:** clockwise around the main island and through the channel, with 10 wider checkpoints and simple passing lines.
- **Main island reverse:** counterclockwise with a varied shoreline route, 16 narrower checkpoints, and alternating slalom lines.
- **Rocky island loop:** the extended 18-checkpoint route out around the rocky island and back, with taller crossing waves in the exposed sea.
- **Sunrise reef loop:** 18 checkpoints around the smaller beach island and out past the reef to the lighthouse, weaving through four staggered outcrops on the outer side of the smaller island, with expert opponents. The sun rises from predawn to daylight over three laps.

Use WASD to drive and Escape to pause. The pause menu offers **Resume** and **Courses**. There is no restart shortcut or retry button. Return to Courses and press Start to begin a new race. No keyboard hints appear in the game UI. Race modes have three AI opponents and three laps. Pass the highlighted buoys in order on the side shown by the flag and HUD; five total missed buoys end the race. There is no automatic recovery or teleporting.

Each course has its own automatic lighting: the main loop stays in daylight, reverse gradually changes from sunset to dusk across the race, the rocky loop stays at night, and the reef loop progresses from predawn through sunrise to daylight. Free play cycles through day, sunset, night, and sunrise every four minutes, including while stationary. Pausing freezes that cycle. Starting from the course menu resets race progress. The minimap shows the selected route, all three islands, and the reef rocks; free play shows the land, your position, and the other riders.

Translucent shallows reveal a sloping sand bed, swaying seagrass, and procedural schools of fish. Deep water becomes more opaque and reflective. The lighthouse stands on the rocky island and sweeps a rainbow beam across the surrounding sea. Six procedural rock outcrops extend toward it from behind the smaller beach island, with a gap for the original offshore route. Four more outcrops form a slalom east of the beach, opposite the main island. The rocks have shoreline collisions and shallow seabed shelves. Offshore chop grows smoothly between the sandy island beach and the rocky island; hull physics and rendered water share the same wave parameters. Race routes have a rainbow arch at their start line. Side spray uses one water-height sample per hull station with approximate bank and trim offsets. Spray strength follows speed, and spray and trailing foam switch directly to full rainbow colors at buoy-earned speed level 5/5. Particle wakes remain six scattered flat foam triangles per emission, white below level 5; ripple arcs and rainbow ribbons are disabled. Missing a buoy resets the level. Existing trails fade naturally. Wakes are visual foam and spray only: they do not deform the wave surface or apply forces to boats and buoys.


Large background rock silhouettes sit far offshore beyond the playable islands. Light local haze gives way to a longer distance fade, with fog colors following the sky through daylight, sunset, and night. The extended ocean and view distance keep the distant scenery visible.

Eighteen procedural seagulls circle the islands in small flocks, banking, flapping, and gliding. The sun, moon, and stars occupy world directions: turning or pitching the camera reveals different sky, while the sun and moon also travel with the free-play time cycle or reverse-course sunset. Water highlights follow that same light direction. Rainbow lens rings and internal reflections fade when the sun is covered and switch off at night. The sun has no added warm bloom, rays, or streak. Both effects use generated geometry and shaders without image assets.

The chase camera eases from a close, lower view at rest to a wider, higher view at cruising speed. Height follows smoothed speed relative to sea level, with a steady horizon and no hull bobbing or jump tracking. Idle pivots retain the camera's heading until the craft starts moving. Rendering interpolates craft, rider, buoys, and water time between physics ticks for smooth motion on high-refresh displays.

Soft blob shadows stay on the water beneath all four craft, spreading and softening with jump height to make airtime and landing position easier to judge.

Opponents drive faster on reverse and faster again on the rocky course, with more precise lines, quicker steering decisions, and faster straight-line targets. All opponents retain their fixed 15% base pace increase and now earn the same buoy speed levels as the player: +8% per clean pass up to level 5, reset to level 1 on any miss. They follow a smooth line through the buoy corridors, look two buoys ahead to choose corner speeds, and brake early if their momentum would miss the next buoy. The build compiles the existing planner into compact per-rider corridor offsets; production decodes only the next three points. Runtime steering and obstacle avoidance remain intact. Run `npm run courses` to regenerate the checked-in line data after editing courses; `npm run build` also regenerates it automatically. Planned segments keep clearance from islands and reef rocks. Their driving target speeds follow the earned bonus, and level 5 produces rainbow spray. Occasional natural misses are allowed; no misses are forced.

Craft can bump buoys and other racers. Impacts transfer momentum, jostle riders, and produce procedural splash and sound feedback. Buoys recoil and tilt before their moorings pull them home; jumping clear avoids the body collision. Checkpoint locations remain anchored.

Landing back on the water plays a synthesized splash. Its volume, brightness, and duration follow the hull's closing speed against the wave surface, with a short cooldown to suppress contact chatter. Splash audio follows the sound toggle and uses a softer low-pass filter with half the previous gain.

Clean buoy passes play a rising chime, misses play a descending buzz, and reaching buoy-earned speed level 5 adds an ascending fanfare once per streak. All cues are synthesized.

Larger wave crests carry broken whitecaps. Broad, curved foam fronts travel inward toward the sandy beaches, with a smaller wash at the waterline. Foam is generated in the water shader, follows the wave surface, and takes on sunset and night colors. Sky, reflected sky, and distance fog share the same atmosphere palette.

The player starts at speed level 1. Each correctly passed buoy raises the level by one, up to 5, adding 8% engine power and top speed per step (32% maximum). Passing the expected buoy on the wrong side immediately resets the level to 1, and advances to the next checkpoint. Starting a new race resets the chain and miss count. The HUD shows the current level with five bars drawn by one CSS gradient. The live leaderboard is omitted; final results list all four riders with ranks 1–4 and a single “Race complete” heading, without the extra placing/time summary. A five-miss loss still says “Race over.”

Speed bonuses apply automatically as you pass buoys; there is no boost button or rechargeable resource. At level 1, the speed cap is 120 on the HUD, rising to about 158 at level 5; actual speed depends on turning drag and water contact. You can pivot slowly without throttle. Steering strengthens as you get moving, then broadens at high speed. Hold S while turning to brake into a tighter corner.

## Build and check

```sh
npm test
npm run build
npm run check:size
npm run preview
```

`npm run build:fast` uses the current compact shader/code variant and 15 Zopfli iterations for quick playtesting. `npm run build` retains the full 15-variant search, using 15 compression iterations for each variant.

The production build is a self-contained `dist/index.html`, also packaged as `dist/sunwake-rush.zip`. Extract the ZIP and open `index.html` directly to play offline. The build reports ZIP size without enforcing the eventual 13,312-byte limit.

Source modules stay readable. The build minifies JavaScript, CSS, HTML, and shader text; shortens an explicit list of internal properties and shader interface names; and excludes physics diagnostics used only by development fixtures. Production candidates also shorten shader-local names, try frequency-based name allocation and reduced JavaScript inlining, inline WebGL constants, and encode race states, event types, and lighting modes numerically. Redundant course defaults, checkpoint channel metadata, and stored interpolation diagnostics are omitted from production; development fixtures retain their defaults and diagnostics. It also tries coordinated class/ID renaming across HTML, CSS, and DOM references in JavaScript. It also tries evaluating shader templates during the build and shortening their numeric literals, checking that the generated programs match development. It compares final ZIP sizes for every candidate and packages the smallest using standard ZIP Deflate with Zopfli, fixed metadata, and a round-trip integrity check. Compression compares zlib level 9 and Zopfli at 15 iterations, retaining the smallest result. No system `zip` command is needed. These npm packages are build tools only: none are shipped or loaded by the game. `dist/size-report.json` records candidate sizes, CSS bytes, the final archive size, and the selected identifier map for development fixtures. The identifier map is excluded from the ZIP.

The build strips page descriptions/theme metadata, unused checkpoint diagnostics, and the spray debug tag. Level descriptions are removed from the source. Course names are retained to generate the five menu buttons; direct click handlers select their courses, and a selected class supplies the highlight. No data-course, aria-pressed, or extra label wrappers are needed. Favicon markup and ARIA labels are removed. No icon is required to run the game, although a browser may independently look for favicon.ico.

Size passes reduced the ZIP from **44,374 to 23,052 bytes (48.1%)**, preserving all course, scenery, fish, bird, effect, and racer counts. CSS cleanup, UI simplification, short UI colors, and selector renaming reduced built CSS from 9,766 to 3,247 bytes. Further optimization is needed for 13 KiB.

A subsequent model-generation pass reduced its working-tree ZIP from **24,458 to 24,134 bytes**, saving **324 bytes**. It simplifies riders, lighthouse details, wildlife, and marker markings while retaining scenery, rider motion, and all animal counts. The two model source files are 1,347 bytes shorter; geometry reductions are larger than the compressed-code savings.

## Structure

- `src/simulation.js`: fixed-step handling, AI, collisions, checkpoints, five-miss loss, and rankings.
- `src/racing-lines.js`: generated course/rider offsets; the original planner remains available in development.
- `src/interactions.js`: hull collisions, momentum transfer, buoy moorings, rider impacts, and collision splash events.
- `src/boat-physics.js`: six-point hull buoyancy, angular dynamics, rider springs, and anchored limb constraints.
- `src/course.js`: fixed course, shoreline, and shared wave function.
- `src/mesh.js` and `src/renderer.js`: procedural geometry, custom WebGL renderer, water shader, camera, wakes, and spray.
- `src/atmosphere.js`: procedural seagull flocks and flight animation.
- `src/presentation.js`: interpolation between fixed physics ticks for consistent render motion.
- `src/audio.js`: synthesized engines, water, and race cues.
- `src/main.js`, `index.html`, and `style.css`: input, race screens, HUD, and minimap.
- `scripts/`: dependency-free development server, production minification, and deterministic single-file ZIP packaging.

Desktop keyboard controls and WebGL are required. Audio starts after the player starts a race. Losing focus pauses the race; resume with Escape or the on-screen button. There is no custom graphics error panel or reload flow. Shader/context diagnostics remain development-only and are stripped from production. No multiplayer or competition submission is included.

## Browser checks

After building, `/test/production.html` checks the actual minified package through its public UI: all five modes, driving, pause/resume, focus loss, removed restart shortcuts, WebGL, and zero subresource requests. The Node production test compares source and minified simulation/checkpoint/interpolation outputs and generated geometry exactly. Test fixtures are excluded from the ZIP.

`/test/css.html` compares source and packed computed styles across 64 layouts, including four viewport sizes, day/night, free play, HUD, menus, and pseudo-elements. It accounts for equivalent zero-length serialization produced by minification. The fixture uses the build's identifier map without adding any lookup code to the game.

With the development server running, open `/test/browser.html` and click **Run keyboard + full race checks**. It tests the actual keyboard event handlers, pause, focus loss, returning to Courses, and drives a full race using digital steering. Keep that page active while it runs (about three minutes). The harness reports results and observed frame rate for the currently selected race route. **Check modes** verifies free exploration, hidden race UI, changing layouts, four-rider starts, removed restart shortcuts, and WebGL state. **Check speed levels** runs quick deterministic checkpoint fixtures through the simulation and HUD to verify progression, the level cap, missed-buoy reset, rebuilding, five-miss loss, simulation freeze, removed restart shortcuts, and starting again through Courses. **Check collisions** drives a buoy impact and places a racer collision fixture to verify deflection, buoy recoil/tilt, rider reaction, effects, and WebGL rendering. Test files and the development state export are excluded from the production package.

### Shader size and caustics comparison

The build also compares conservative shader-name reuse between separate functions and value-preserving GLSL numeric shortening without baking shader templates. Names within the same function remain distinct, and global/interface names remain protected. The smallest actual ZIP wins.

The original underwater caustics retain their nested distortion: removing it produced a regular grid and was rejected during visual review. Open `/test/caustics.html` to compare the restored original with the rejected grid experiment at the same camera/time, freeze animation, compare beach/channel views, and change lighting. The optional single-sample foam experiment is confined to that preview; the game retains its two-sample foam detail. Preview controls and original shader expressions are excluded from the ZIP.
