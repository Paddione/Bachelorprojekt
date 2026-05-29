# Character Skin Credits — CC0

## Quaternius — Animated Men & Women Characters (Feb 2019)

Source: https://quaternius.com/  ·  License: CC0 1.0 Universal (Public Domain)

Patron link (optional support): https://www.patreon.com/quaternius

All 6 shipped skins are the **Smooth_** variant of the original Quaternius low-poly
mesh, converted from FBX → GLB via `FBX2glTF 0.9.7`. Each model embeds 11 animation
clips: `Idle`, `Walk`, `Run`, `Jump`, `RunningJump`, `Punch`, `SwordSlash`,
`Clapping`, `Sitting`, `Standing`, `Death`.

| skinId | Source FBX | Display name |
|--------|------------|--------------|
| male-casual | Smooth_Male_Casual.fbx | Mann · Casual |
| male-suit | Smooth_Male_Suit.fbx | Mann · Anzug |
| male-shirt | Smooth_Male_Shirt.fbx | Mann · Shirt |
| female-casual | Smooth_Female_Casual.fbx | Frau · Casual |
| female-dress | Smooth_Female_Dress.fbx | Frau · Kleid |
| female-tanktop | Smooth_Female_TankTop.fbx | Frau · TankTop |

Bones use Quaternius (Blender-style) naming (`Hips`, `UpperArm.L/R`, `LowerLeg.L/R`,
`Foot.L/R`, etc.) — `skin-controller.js` maps these to the 14 brett bones in
parallel with Mixamo's `mixamorig*` scheme. Animation clip names
(`HumanArmature|Man_Idle`, `Female_Run`, …) are aliased to brett's state-machine
keys (`idle`, `run`, …) via the `QUATERNIUS_CLIP_ALIASES` table in the same file.

CC0 requires no attribution, but these credits are kept for provenance.
