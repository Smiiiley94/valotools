# ValoTools

Random agent, random sens, random crosshair, strat roulette and a 1v1 bracket with a lucky wheel draw. Every tool has its own OBS overlay, its own page, and can be triggered from chat commands or channel point redeems.

No accounts: each streamer creates a "space" and gets a private control link.

## Run it

Needs Node 18 or newer. There are no dependencies to install.

```
node server.js
```

Open http://localhost:3000 and press "Create my space".

| Setting | Default | What it does |
|---|---|---|
| `PORT` | 3000 | Port to listen on |
| `DATA_DIR` | `./data` | Where spaces are stored (one JSON file each). Put this on a persistent disk |
| `MAX_SPACES` | 10000 | Stops new spaces when the disk could fill up |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy so the per-IP limit on creating spaces uses `X-Forwarded-For` |

## URLs

| URL | For |
|---|---|
| `/` | Landing page, create a space |
| `/s/<id>` | Control panel home. `<id>` is the private control token |
| `/s/<id>/bracket` `agent` `sens` `crosshair` `strat` `style` `connect` | One page per tool |
| `/o/<ov>/<tool>` | OBS overlay for one tool: `bracket`, `agent`, `sens`, `crosshair`, `strat`, or `all`. `<ov>` is a separate read-only token |
| `/api/t/<id>/<tool>` | Trigger link for chat bots and Streamer.bot (GET or POST). Add `?text=1` for a plain-text answer |

The overlay token can be reset from the "Chat & Streamer.bot" page if it leaks. The control token cannot be changed yet.

## Deploying

Any host that runs a long-lived Node process works (a VPS, Fly.io, Railway, Render and similar). Serve it over HTTPS, because OBS and Streamer.bot will use the public URL. If you use a reverse proxy, turn off response buffering for `/api/*/events`, which is a live event stream (the server already sends `X-Accel-Buffering: no` for nginx).

It keeps live connections in memory and stores spaces on local disk, so run one instance.

## Adding accounts later

Every space already has an `owner` field (currently `null`). To add logins: add a login route, set `owner` when a logged-in user creates or claims a space, and add a "my spaces" page. The `/s/<id>` and `/o/<ov>/...` links can keep working as they are, so nothing streamers already pasted into OBS breaks.

## Known limits

- Spaces are never deleted automatically. Add a cleanup job for spaces that have not been used for a long time.
- Anyone with a control link can control that space. That is the trade-off of having no accounts.
- Crosshair codes are generated in the Valorant import format from memory. Test a few in the game.
