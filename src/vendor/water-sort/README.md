# Evgeny-/water-sort render components

Source: https://github.com/Evgeny-/water-sort/tree/9405d54dfc15ab361148e12655ee9de096237c05/lab
Author: Evgeny- / upstream contributors.

Copied render/shapes.ts, materials.ts, vessel.ts, fx.ts; supporting palette.ts and engine/types.ts, rules.ts. ui.css contains selected original color, background, button, and HUD styles. Application integration and adapted original Stage pour choreography are in ../../view.js. Original palette, bottle geometry and optical shaders are retained, with one intentional materials.ts adjustment: remove the extra dark stroke at liquid boundaries, per the project owner’s visual request. Contiguous identical-color units are merged before rendering, as in the original setContents implementation.

Permission basis: on 2026-10-26 the project owner explicitly confirmed in this chat: “已有作者授权，可直接复用”. Upstream did not provide a public LICENSE at the inspected revision. This directory is used under that separately obtained permission; this notice does not grant third parties a new license or assert upstream is MIT. Before redistributing outside the scope of that authorization, retain the author's authorization terms. Three.js is separately MIT licensed.
