Original prompt: enshort app에 대한 수정사항 검토- 모바일에서 사용 시 실제 숏폼 처럼 스와이프하는 느낌이 들지 않고 있음 동적으로 명확히 스와이프하는 느낌이 있었으면 좋겠음- 보상이 왜 보상인지 명확하지 않음 문제를 어렵게 풀었기 때문에 확실히 보상으로 느껴질만한 걸 고민해봤으면 함 - 원 컨셉은 고양이 등 귀여운 영상을 보여주는 컨셉이었는데 ui를 지키면서도 명확히 보상으로 느껴질 만한 것을 준비 했으면 함. 가능한 스킬을 사용해서 개선 방안을 도출해줘

## 2026-02-15
- Start implementation based on approved plan.
- Scope: drag-swipe UX, snap/restore feel, reward reason clarity, cute clip unlock reward.
- Investigation: Playwright run was interrupted by rowserType.launch: spawn EPERM in sandbox.
- Mitigation: Re-ran Playwright with escalated permission outside sandbox.
- Secondary blocker: page.screenshot timeout occurred in headless mode.
- Resolution: Switched test run to headed mode (--headless false) and confirmed stable screenshot capture.
- Fix applied: Added <link rel="icon" href="data:," /> in index.html to avoid 404 console error that prematurely stops the loop.
- Verification: Playwright client completed 3 iterations and generated output/web-game/shot-0.png..shot-2.png with no errors-*.json.- Policy update: Removed video-based reward system entirely (no unlock/watch flow).
- Implemented combo escalation loop: CALM -> WARM -> BLAZE tiers based on streak thresholds (3, 6).
- Replaced reward HUD with energy tier badge (E CALM/WARM/BLAZE) and added peak combo/tier session metrics.
- Added escalating UI intensity via CSS energy variable and tier classes (	ier-calm, 	ier-warm, 	ier-blaze, burst effect on tier-up).
- Added tier-aware SFX layering (correct/tier-up/wrong) to reinforce progression and break states.
- Added test hooks: window.render_game_to_text and window.advanceTime(ms).
- Verification: Playwright loop completed 4 iterations in headed mode, generated shot-0..3.png and state-0..3.json, no errors-*.json generated.
- Update: Enforced 4 options for multiple-choice cards by changing EASY_BONUS and SPEED_PICK generation to 4 choices (1 correct + 3 distractors).
- Bugfix: Improved initial load robustness by adding CSV fetch fallback path (encodeURIComponent filename) and no-store fetch mode.
- Bugfix: Improved sound reliability on mobile by adding webkitAudioContext fallback and explicit esume() on sound toggle.
- Validation: Mode select + sound toggle test returned 사운드 ON with no console errors.
- Validation: Playwright run completed 2 iterations, generated shot-0..1.png and state-0..1.json with no errors-*.json.