# Backlog

## Next

- [x] Visually checked the home/work scenes and capture fixture at 320×568, 390×844, 844×390, and 1366×768. No horizontal overflow; the full character fits, laptop work scene is present, and the escape button stays clear of the van.
- [x] Fixed the invalid top inset in short landscape layouts; added safe-area/orientation tests and gated fullscreen requests behind Telegram Bot API 8.0.
- [x] Added one-shot van arrival, character reaction, siren and sound to the actual game capture scene, with replay prevention on reload and reduced-motion handling.
- [x] Simulated Telegram's 92 px legacy header reserve and verified the HUD starts below it; actual iOS/Android Telegram safe areas still need device testing.
- [ ] Verify Telegram safe areas and the live TCC escape scene inside real iOS/Android clients.
- [ ] Set the repository Actions variable `KEEPALIVE_URL` and verify the keepalive workflow against the public game URL after the owner publishes the build.

## Later

- [ ] Review every hat and hood variant visually to confirm the selected hairstyle remains visible without overlapping glasses or face details.
- [ ] Test the capture animation, escape cooldown, and server state after reconnecting with a test account.
