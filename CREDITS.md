# Small Hours: credits

Everything in the game that was not made here, where it came from, and its licence. All of it is CC0 (public domain),
so nothing below has to be credited, but it is credited anyway. The files are in `assets/` and are packed into the
game by `tools/assets.mjs`.

| What you see | File in `assets/` | Name | Author | Source | Licence | What we changed |
|---|---|---|---|---|---|---|
| Jo (body, face, hair, clothes) | `jo-real.glb` | MakeHuman base mesh and `game_engine` rig (via MPFB 2.0.18) with the MakeHuman system assets: skin `young_african_female`, outfit `male_casualsuit01`, shoes `shoes06`, hair `ponytail01`, brows `eyebrow010`, lashes `eyelashes02`, eyes `high-poly` | MakeHuman Community (Data Collection AB, Joel Palmius, Jonas Hauquier); built in the shared asset library (`asset-lib/bodies/realistic/jo.glb`, the same file) | https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html and https://extensions.blender.org/add-ons/mpfb/ | CC0 1.0 (MPFB is GPL 3 but is only a tool; none of its code ships) | The outfit cut in two at her belt (shirt and trousers) so each is painted its own palette colour; the shoes' collars that rode up inside the trouser legs cut away. Repainted in the game's palette by a shader. Scaled to 1.62 m. |
| The neighbour (body, face, hair, clothes) | `tam-real.glb` (`asset-lib/bodies/realistic/tam.glb`, the same file) | the same, with skin `middleage_asian_male`, outfit `male_casualsuit05` (jacket, shirt, jeans), shoes `shoes02`, hair `short01`, brows `eyebrow001`, lashes `eyelashes01` | MakeHuman Community | as above | CC0 1.0 | Outfit cut into jacket and trousers by its bones; shoe collars cut away. Repainted the same way. Scaled to 1.78 m. |
| The stylised people of rounds seven to ten (`gardener-woman.glb`, `neighbour-man.glb`), kept for a side by side build (`SH_BODIES=lib`), not in the game | | Universal Base Characters and Modular Character Outfits - Fantasy | Quaternius | https://quaternius.com/packs/universalbasecharacters.html | CC0 1.0 | |
| How both people move: standing, sitting down, sitting, kneeling, carrying the tray, bending to the barrel, reaching for the cup, crouching to set the bucket down | clips inside `jo-real.glb` (copied there by bone name from the library, hips scaled to her) | Universal Animation Library and Universal Animation Library 2 (Standard): `Idle_Loop`, `Sitting_Enter`, `Sitting_Idle_Loop`, `Fixing_Kneeling`, `Walk_Carry_Loop`, `PickUp_Table`, `Interact`, `Crouch_Idle_Loop`, `Idle_Talking_Loop` (whoever is speaking), `Yes` (a small nod, listening) | Quaternius | https://quaternius.com/packs/universalanimationlibrary.html | CC0 1.0 | Resampled to 30 frames a second. Hands are placed on the cup, tray, book and barrel rim on top of the clips. Standing, the hips are lifted so the knees are nearly straight (the idle clip stands with them bent). Standing still, the feet are brought under the hips (the library's idle stands with one foot well behind the other). Feet are placed on the stair treads. |
| How both people walk on the deck and the stairs: `Walk_Formal_Loop` | in `jo-real.glb` (`ual-clips.glb` for the stylised build) | Universal Animation Library (Standard), clip file from the shared asset library | Quaternius | https://quaternius.com/packs/universalanimationlibrary.html | CC0 1.0 | Resampled to 30 frames a second; only this clip is packed. Its phase is tied to distance walked. |
| The folding seat | `chair.glb` | Folding Wooden Stool | Poly Haven | https://polyhaven.com/a/folding_wooden_stool | CC0 1.0 | Texture to 256 px, repainted by the same shader. |
| The book (open, and shut in her hand) | `book.glb` | Book Encyclopedia Set 01 | Poly Haven | https://polyhaven.com/a/book_encyclopedia_set_01 | CC0 1.0 | One volume cut out of the set. For the open book its page block is cut through the middle and the two halves laid open from the spine, with a plain sheet over each cut for the open pages. Textures to 256 px, repainted by the same shader (worn red boards, cream page edges). |
| The bucket | `bucket.glb` | Wooden Bucket 01 | Poly Haven | https://polyhaven.com/a/wooden_bucket_01 | CC0 1.0 | Scaled to 0.72, texture to 256 px, repainted by the same shader. |

Made here, in code (see `src/`): the roof, the stairwell, the shelf, the pots and every plant, the barrel, the beds,
the city and sky, the water, the hat, the cap, the cup, the tray, the door of 4B, the paint shader, and every sound.
Also made here: the lowered eyelids while she reads (painted on the MakeHuman eye mesh, like the blink), and (round
fourteen) a bone for each eyeball, hung from the head, so her eyes can turn to the page. The MakeHuman rig has no face bones.
Round fifteen: her shirt's shading normals are smoothed in code (no new asset), and the ponytail is hidden while the hat is on.

Checked in rounds thirteen and fourteen: the shared library's realistic `jo.glb` and `tam.glb` are byte for byte the files above
(same SHA-1), so the game already uses the realistic people. Its other new people (mother, old woman, old man, child) are not used.

Software: three.js 0.170 (MIT) is bundled in the game. Build and test tools: esbuild (MIT), Playwright (Apache 2.0),
glTF-Transform (MIT), meshoptimizer (MIT), sharp (Apache 2.0).

Rules kept: no real person's likeness, no ta moko or other taonga designs, nothing taken from a small indie game.
Textures are re-encoded when packed, so no image in the game carries EXIF or other metadata.
