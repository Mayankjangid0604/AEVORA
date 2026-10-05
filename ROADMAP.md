# AEVORA roadmap: 101 features

Status as of 2026-09-27. ✅ done · 🔶 in progress · ⬜ not started. Numbers are the feature IDs.

**Tally (listed items):** 86 done · 12 partly done or needs review · 0 not started. The 17 ambient features are grouped in one paragraph.
**Needs the owner's decision:** anything that moves money or writes HR/economy data (payday, promotions, cafeteria/lounge AC spending), a weather API, a calendar source, backup telemetry, integration health checks, real worldwide outreach, a web view in the mobile app, and a VR-headset check.
**Also pending:** re-check Part 13 against the seeded local database once Postgres is running.

## Part 12: Game shell ✅ (merged, PR #8)
- ✅ 1. App opens straight into the world
- ✅ 2. Office computer login
- ✅ 3. Current pages become apps
- ✅ 4. Replay section (now the monthly time-lapse, item 97)

## Part 12 extension: Characters, seats, room ✅ (merged)
- ✅ 5. Real characters for hired employees (see Part 13)
- ✅ 6. Sit on executive lounge sofa
- ✅ 7. Separate Assistant desk in Chairman Office
- ✅ 8. Assistant wakes and follows when you stand
- ✅ 9. Assistant holds tablet, takes notes
- ✅ 10. Chairman desk: one monitor, login screen
- ✅ 11. Working employees animate, black screen when empty
- ✅ Room renamed to "Chairman Office"
- ✅ Click-to-talk to the Assistant (seated or following)

## 17 ambient features ✅ (merged)
Night mode, real Sikar time of day, attendance streak, mini-map, subtitles, wardrobe, car, office decorations,
DND sign, weekly vibe, seasons, ambient sound, subtitle languages, tablet glow while seated, CEO re-seating,
overtime lamps, festival decorations.

## Part 13: Employee characters ✅ (PR #9; real-data re-check pending)
- ✅ 5. Real characters from Employee data (verified with scripted data; re-check against the seeded DB when Postgres is up)
- ✅ Task 2: per-employee live screens
- ✅ Task 3: role desk items (= 68): Sales headset, Marketing drawing tablet, Development dual monitor, Management documents
- ✅ Task 4: thought bubbles (= 70), from the real `activity` field
- ✅ Task 5: absent employees, via `GET /health/models` (read-only); gateway down → everyone AWAY
- ✅ Task 6: departures (TERMINATED → box, walk out, removed)

## Part 14: Daily rhythm and environment
- ✅ 14. Lunch break (13:00–14:00 IST: walk to a cafeteria seat and sit, then back)
- ✅ 15. Overtime lights (Assistant/CEO lamps + a glowing desk lamp for every employee still at their desk after dark)
- ✅ 16. 5 pm wrap-up (17:00: idle staff walk out; anyone WORKING stays late; everyone walks back in at 9:00)
- ✅ 17. Night mode
- 🔶 18. Real Sikar weather (time of day ✅; weather API deferred, owner's decision)
- ✅ 19. Festivals and anniversaries (hire anniversaries: 🎉 bubble + subtitle, from the real hireDate)
- ✅ 20. Office attendance streak
- ✅ 59. Wardrobe (built; no UI trigger yet)
- ✅ 60. Your car (placeholder look)
- ✅ 61. Decorate your office (list-based; no drag-and-drop UI yet)
- ✅ 63. Do-not-disturb sign
- ✅ 92. Weekly vibe
- ✅ 93. Sikar seasons
- ✅ 94. Ambience and music

## Part 15: Talking and voice
- ✅ 21. Click to talk to any employee (messages go through the Assistant, who answers via the real /assistant/message backend)
- ✅ 22. Intercom (office-wide announcement: subtitle, everyone looks up, pinned for the notice board)
- ✅ 23. Wake word (“Hey Aevora …” via browser speech recognition → /voice/command; Chrome/Edge, needs mic permission)
- ✅ 24. "Take me to…" (voice or typed in the talk box; loose room matching)
- ✅ 25. Water-cooler talk (two idle employees meet at the cooler in office hours and chat)
- ✅ 62. Voice diary (OfficeOS app; recorded in the browser, kept in IndexedDB, never uploaded)
- ✅ 64. Sticky-note tasks (OfficeOS app; open notes stuck around your monitor; browser-local)
- ✅ 98. Languages (subtitles)
- ✅ 99. Subtitles

## Part 16: Assistant's brain
- ✅ 26. Real assistant: answers via /assistant/message (server keeps history), briefing when you sit at your desk (balance, approvals, CEO questions, inbox, projects, alerts). 🔶 Calendar: needs review — no calendar data exists
- ✅ 27. Meeting minutes (written after the Monday meeting; OfficeOS → Minutes; browser-local)
- ✅ 67. Daily quests (3 per day in the overlay, ticked off automatically; browser-local)

## Part 17: Business events
- ✅ 28. Payment celebration (project newly paid → confetti, chime, subtitle)
- ✅ 30. CEO asks in person, files on desk (new CEO question → he walks to your desk, leaves a file; click it to answer)
- ✅ 31. Desk phone (rings on new client replies; click → Inbox)
- ✅ 33. Monday meeting (Mon 10:00–10:30 IST in the Board Room; minutes afterwards)
- ✅ 65. Big red button (pause/resume the simulation, always confirmed)
- ✅ 77. War room (active alerts → Data & Analytics goes red with an alert wall)
- ✅ 78. Fire drill (Drill button: siren, flashing lights, everyone to the forecourt and back)
- ✅ 79. Invoice printer (Finance; prints when a project becomes INVOICED)
- ✅ 80. Signing desk (pending decisions as a document stack; click → Decisions)
- ✅ 85. Approval stamp (decision PROPOSED → APPROVED stamps on your desk)

## Part 18: Walls and screens
- ✅ 36. Lead-map wall (Sales; pins from /map/pins over India, Sikar HQ marked)
- ✅ 38. Deadline clocks (Projects & Ops; real Project.targetEndDate, red when overdue)
- ✅ 39. Ideas whiteboard (Product; from /ideas)
- ✅ 40. Poster wall (Cafeteria back wall)
- ✅ 44. Finance vault (Finance; balance, revenue, expenses)
- ✅ 45. Newspaper (Reception; “The Aevora Times” from the CEO feed and office events)
- ✅ 81. Strategy board (Strategy & Planning; themes and initiatives)
- ✅ 82. Decision timeline (Board Room)
- ✅ 83. Pipeline funnel (Sales; lead statuses → projects → paid)
- ✅ 84. Target banner (over the atrium; a real revenue KPI if one exists, otherwise says none is set)

## Part 19: People management
- ✅ 34. One-on-ones (talk box → “1:1 in my office”: they walk over; panel shows their record + work diary)
- ✅ 53. Employee of the Month (Reception frame; highest real performance score)
- 🔶 54. Cafeteria AC spending — needs review: it moves AC money (economy writes), a product/economy decision
- ✅ 55. Training room (employees whose activity is TRAINING sit in Human Resources)
- ✅ 69. Look over their shoulder (camera behind them; their screen shows their current task)
- ✅ 71. Work diary (what the office has seen each employee doing; shown in the 1:1; browser-local)
- 🔶 72. Payday — needs review: paying salaries writes money (payroll/AC), a product/economy decision
- 🔶 73. Promotions — approved PROMOTION decisions are celebrated ✅; creating promotions (role/salary writes) needs review
- ✅ 74. Mentoring (most experienced in a department visits the least experienced; real experience field)
- ✅ 75. Burnout warning (⚠ bubble when real reliability < 30 or seen working overtime on 2+ evenings)
- ✅ 76. Skill board (Human Resources; real skills and proficiency)

## Part 20: Special rooms
- ✅ 42. Server room (racks in Data & Analytics; LEDs follow real API/model health)
- ✅ 47. Client plants (Reception; one per real customer, bigger with more paid revenue)
- ✅ 48. Wall of clients (Reception)
- ✅ 56. Security guard (at the entrance; greets you when you walk in)
- ✅ 86. Lost-deals archive (Legal & Compliance; disqualified leads)
- 🔶 87. Backup room — needs review: nothing reports backup status yet (no backup telemetry to show)
- 🔶 88. Connection lights — API and AI-model lights are real ✅; email, Razorpay and Google Places show “not reported” until those integrations expose a health check
- ✅ 90. Bubbling lab (R&D; bubbles while lab projects are active)
- ✅ 91. Notice board (cafeteria entrance; announcements, events, burnout warnings)
- ✅ 95. History museum (Reception; milestones from real dates)

## Part 21: Progression
- ✅ 49. Office grows with revenue (rooms unlock by company level; a room someone works in is always open)
- 🔶 50. Elevator (Reception; doors open as you approach, indicator shows the company level) — only the ground floor exists, so no ride yet
- ✅ 51. Trophy shelf (behind the Chairman's desk; 7 real milestones)
- ✅ 52. Company level/XP (from real revenue, paid projects, clients, leads, staff; shown in the office panel)
- ✅ 89. Launch fireworks (venture FORMING → ACTIVE)

## Part 22: Outside the office
- 🔶 57. Worldwide lead gen — needs review: it's real outreach, and PUBLIC_API_URL must be a real public URL first (the lead map already shows every pin)
- 🔶 58. Mobile CCTV — CCTV mode ✅ (six cycling security-camera views, REC overlay; `?cctv=1` opens it, works in a phone browser). Inside the native mobile app needs review: it has no web view (new dependency)
- ✅ 96. Photo mode (Photo button: hides the UI, saves a PNG)
- ✅ 97. Monthly time-lapse (one snapshot per day; OfficeOS → Replay plays the last 30 days)
- 🔶 100. VR mode (WebXR; the button only enables when a headset is detected) — needs a human check with a VR headset

## Part 23: Cafeteria and lounge economy
- 🔶 12. Cafeteria menu, staff sell coffee/snacks — needs review: a purchasable menu and AC payments are backend economy logic (planned with Part 23)
- 🔶 13. Lounge ordering with cart delivery — needs review: AC balances and payments are backend economy logic (planned with Part 23)
