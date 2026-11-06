# ping_pong_scoreboard

Ping pong scoreboard for iPhone, built as a web app you add to your home screen.
It's a sibling of [jpx_scoreboard_ios](https://github.com/SamuelFicke/jpx_scoreboard_ios) without the drink timers.
It runs full-screen and works offline after the first load.

## Install on iPhone
1. Open https://samuelficke.github.io/ping_pong_scoreboard/ in **Safari** → Share → **Add to Home Screen**.
2. Launch it from the home screen icon, turn the phone sideways, tap the splash to start.

## Controls
| Action | Gesture |
|---|---|
| +1 point | tap the team's side |
| −1 point | swipe down on the team's side, or long-press it |
| switch serve | tap the middle arrow |
| new game (after a win) | tap anywhere |
| reset to 0-0 | **reset** |

Rules: first to 11, win by 2. Serve switches every 2 points, then every point from 10-10.
Players alternate serving first each game. "Nice!" plays at 9-6 or 6-9.
If the winning point was a mistake, swipe down on that side to take it back.

## Updating
After changing any file, bump `VERSION` in `sw.js` so installed phones fetch the new files.

## Local testing
`python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## Credits
App icon: 🏓 ping pong emoji from [Twemoji](https://github.com/jdecked/twemoji),
© Twitter, Inc. and other contributors, licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
