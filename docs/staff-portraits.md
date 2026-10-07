# Staff pixel portraits

Latest set-wide correction: all three detailed portraits were regenerated on 7 October 2026 to bring coarse clothing, hair and landscape edges toward the finer facial pixel scale. Their existing detailed filenames are retained. Exact prompts, input order, prior target hashes and generated output paths are recorded in `staff-portrait-resolution-prompts.json`.

The shared art-direction target is a 128-by-128 logical grid, preserving the settled facial proportions and expressions while refining coarse regions. This is a generation instruction, not a mathematically verified grid: the raster results were visually compared for consistency. The output canvas dimensions were checked separately. Large flat background or fabric areas may contain many same-color cells; they do not need added texture to demonstrate resolution. Future edits should match the facial scale throughout, including outline steps, without making the faces coarser.

Latest eburakova correction: the detailed portrait's face was made more upright and its smile leveled to reduce the diagonal mouth slope. The exact alignment prompt and prior generated image reference are preserved in `staff-portrait-detailed-prompts.json`; the existing detailed filename is retained.

Final cleanup on 7 October 2026. Generated with the built-in image-generation tool.

## Retained images

Each person has two versions in `assets/staff/`. The previously selected coarse portraits keep their original filenames. The latest versions are saved separately as detailed portraits.

| Person ID | Previously selected portrait | Latest detailed portrait |
| --- | --- | --- |
| mpeters | `pixel-character_mpeters.png` | `pixel-character_mpeters_detailed.png` |
| parlinghaus | `pixel-character_parlinghaus.png` | `pixel-character_parlinghaus_detailed.png` |
| eburakova | `pixel-character_eburakova.png` | `pixel-character_eburakova_detailed.png` |

The detailed Marco image includes the cleanup of fine hair strokes. The detailed parlinghaus image is his latest likeness refinement. The detailed eburakova image includes a subsequent correction to relax excessive face narrowing and simplify the jacket to match the face and hair pixel scale. Its exact correction prompt and references are included in the consolidated detailed prompt archive. Superseded project image drafts were removed; six portraits are retained.

## Prompts

- `staff-portrait-primary-prompt.txt`: reusable coarse pixel style.
- `staff-portrait-backup-prompt.txt`: alternate soft-background style, retained as requested.
- `staff-portrait-detailed-prompts.json`: consolidated exact generation and refinement prompts for all three detailed images, including original reference order. Historical temporary paths and removed intermediate filenames record provenance; they are not required project assets.

For another person, use their photographs as the authority for identity, facial proportions and natural expression. Use a retained portrait only as a style reference. Choose the coarse or detailed family explicitly. For detailed portraits, preserve distinguishing eye shape, nose, jaw, smile and hairline through pixel shape and placement instead of photographic texture. Do not standardize everyone's eyes or smile into identical shapes. Keep one consistent logical pixel grid across face, hair, clothing and accessories; never introduce finer fabric texture or smaller pixel cells in the jacket. Check natural proportions and avoid horizontally squeezed faces.

## Landscape consistency

Give each new person a different quiet background composition within the same Satify palette. Vary hill silhouettes, horizon height, clouds and presence or position of a river or distant ridge; keep low contrast and broad pixel shapes.

Existing arrangements: mpeters has layered hills, a distant ridge and two clouds; parlinghaus has a single cloud upper left and a ridge on the right with no river; eburakova has a cloud upper right and a river bend on the left. Avoid duplicating these exact arrangements.

Record the filled-in prompt, reference order and landscape brief for future images. Keep filenames `pixel-character_{person_id}.png` for the selected standard portrait and `pixel-character_{person_id}_detailed.png` for its detailed alternative.
