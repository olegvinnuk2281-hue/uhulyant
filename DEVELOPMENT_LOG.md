# Development log

## 2026-11-05 · UI and animation pass

- Put the TCC escape action on the game scene and removed its duplicate from the capture card.
- Grouped home actions into home/safety, today's tasks, and at-home work; aligned controls and added a narrow-screen layout for the active job.
- Kept the character's full-body SVG frame for scene and equipment previews, made hair layers render above the lower edge of headwear, and kept the cigarette control visible in the character editor.
- Added distinct animated laptop scenes for text writing and comment moderation, including active shifts.
- Added UI regression coverage for the full-body frame, capture escape, hair/headwear layering, cigarette toggle, laptop props and responsive home groups. `npm test`: 33 tests.
- Visually checked the local memory-only browser preview at 320×568, 390×844 and 1366×768 with a disposable account. The full figure fit the scene and there was no horizontal overflow; text work showed the animated laptop scene. The mock TCC seed did not activate a live capture state, so that scene still needs a dynamic check.
- No live Render/Supabase changes were made. Telegram safe-area layout still needs checking inside real iOS and Android Telegram clients.

## 2026-11-05 · Telegram safe-area regression fix

- Found and removed an undefined `--v27-tg-top` reference in the short-landscape CSS rule. Body top clearance now stays with the shared safe-area calculation; compact audio controls use the same inset.
- Added executable checks for legacy portrait and landscape fallbacks, live orientation changes, and Telegram content-safe-area values.
- Guarded `requestFullscreen()` in both launch paths behind Telegram Bot API 8.0; the official WebApp SDK had logged unsupported-method errors in the 6.0 compatibility preview.
- Reloaded the compatibility page at Telegram 6.0 after the fix. The 320×568 and 390×844 layouts used the 92 px legacy header reserve without horizontal overflow; the preview remained at the Telegram login gate, so it did not expose live gameplay. The two console errors captured earlier were from the pre-fix load; none were added after reload.
- Added a deterministic escape regression covering success, the next capture stage, busy reset and retry cooldown.
- `npm test`: 36/36 passed. `node --check`: all nine server/client/keepalive scripts passed.
- Next: verify the live capture/escape experience and safe-area behavior in real Telegram iOS/Android clients.

## 2026-11-05 · main-scene capture animation

- Added a one-shot TCC van arrival to the primary game scene, with flashing lights, a brief character reaction and a short arrival sound.
- The animation starts on local capture and on a live server state transition, but does not replay when a saved captured state is loaded. Its timer removes the van after the motion finishes; the escape button stays above the scene.
- Added a reduced-motion static state and a wider van on narrow screens.
- Added regression coverage for the animation window, timer replacement, actual `renderScene()` markup, replay prevention for saved detention, coexistence with the escape button and cleanup after the timer.
- The ordinary local game route reached the account/login gate; no account was created. An isolated local copy with a test-only captured save was used to visually inspect the real scene, bus and escape button without login or API. Server-confirmed capture and reconnection still need an existing test account.

## 2026-11-05 · compact HUD controls

- A real browser render exposed the floating music/sound pill over the desktop HUD. Hid that duplicate bar across platforms; both controls remain in the existing Settings dialog.
- A 90 px landscape scene cropped the van and its first route passed beneath the escape button. Its width now caps at 160 px and the short-landscape van enters from the left, passes the character, then stops in the center-left lane.
- Added regression checks for the hidden bar, both settings actions and landscape bus size. Checked 320×568, 390×844, 844×390 and 1366×768: document/body widths match each viewport, the full-body avatar stays inside the scene, and the escape button does not overlap the van during or after its short-landscape route.
- Simulated the older Telegram top reserve at 92 px and verified the HUD begins at y=96 on a 390×844 viewport. Real Telegram iOS/Android clients remain untested.

## Next concrete task

Verify the live TCC capture/escape scene and final header clearance inside real iOS/Android Telegram clients; test cooldown and server state after reconnecting.
