# titles-snark (SAMPLE, not built or deployed)

Pop-Up-Video-style rewrites of the Idomeneo and Tosca pop-up facts. The originals in `../titles/` are untouched.

* `idomeneo.json`, `tosca.json`: same schema as `../titles` plus `plain` (original wording, `null` for new bubbles), `kicker`, `icon`, `emoji`, `new`, and `legend`.
* `mk_snark.py` regenerates them from `../titles` plus the rewrites. `node check.js` re-verifies every bubble's evidence against `../sources` and prints length stats.
* `STYLE.md` covers the research and rules. `IDEAS.md` covers data-backed gags.
* `idomeneo-candidates.json` (`mk_candidates.py`): 24 bubbles for the Met HD of 2017-03-25, with Matt's ratings (22 good, 2 bad) and an `attribution` line on quote bubbles.
* `idomeneo-candidates-music.json` (`mk_candidates_music.py`): M1–M14 about the score, including Mozart's letters to Leopold.
* `node check_candidates.js [file]` verifies evidence, Met scene titles (`idomeneo-2017-scenes.json`) and the 20-word limit.
