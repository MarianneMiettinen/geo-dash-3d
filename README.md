# Geo Dash 3D

A browser runner that starts flat and doesn't stay that way.

You begin in a side-view auto-runner: one cube, one button, jump the blocks.
Around 30 points a portal appears — and instead of loading a second game, the
camera swings around behind the cube and the same world opens into a three-lane
3D corridor. Same run, same score, no loading screen.

Part of my 30 apps by September 30 challenge.

## Play

```bash
npm install
npm run dev
```

## Controls

| | 2D | 3D |
|---|---|---|
| **Space / ↑ / W / tap** | jump | jump |
| **← → / A D** | — | change lane, and take the corners |
| **Tap left / right third** | jump anywhere | change lane |

At a corner the corridor dead-ends and an arrow tells you which way to go.
Press it in time or you hit the wall.

## How the transformation works

There is only ever one 3D scene and one renderer. The "2D" mode is that same
world watched from the side, so the flat square was always a cube. The shift is
a real camera orbit — the view arcs from side-on to behind the player while the
walls rise, the lane markers fade in and the outer ground drops away. Nothing is
swapped out, which is why the score and the run carry straight through.

## Built with

Vite and Three.js, no physics engine, no models, no textures — primitives only.
About 100 meshes, ~1100 triangles, all recycled from fixed pools; nothing is
allocated per frame. Movement is delta-timed and the jump uses exact integration,
so the arc is identical from 20 to 144 fps.

Not affiliated with Geometry Dash; no assets, levels or audio from it are used.
