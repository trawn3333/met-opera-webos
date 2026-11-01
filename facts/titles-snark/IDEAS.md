# Ideas to make pop-ups more amusing (each backed by data we can actually get)

1. **Body count** (running tally). Count the deaths in each opera's synopsis and pop "Body count: 2" when each one happens on stage. Example: Tosca has 4 (Angelotti kills himself offstage, Scarpia is stabbed, Cavaradossi is shot, Tosca leaps). Idomeneo: one sea serpent. *Data:* the Wikipedia synopsis we already cache, plus the Met scene markers for timing.
2. **"Addio" counter** (and "amore", "morte", "Dio"…). Count the word live in the Met's Italian subtitle track, which the player already loads (tracks: en, de, es, fr, it, pt, sv), then pop "Addio count tonight: 3". *Data:* the actual subtitle cues.
3. **Countdown to the death scene.** "Scarpia has about 6 minutes left." Timed from the Met scene marker that the death-scene `sceneMatch` hits. *Data:* scene markers and video time.
4. **Aria length vs. stage time.** "This aria lasts 4:12. The firing squad is waiting." *Data:* the Met scene-marker durations (start of this scene to start of the next).
5. **"What they're actually singing."** Deadpan, literal one-line translations of aria titles: "Non ho colpa" = "I am not guilty". *Data:* the aria lists with translations in the cached Wikipedia articles, and the English subtitle cue at that moment.
6. **The Met's performance number tonight.** The Met Opera Archives number every performance, e.g. "Tosca (782)". "This was the Met's 782nd Tosca." *Data:* the archive records already matched for the 1.3.3 credits (`archive/cache`).
7. **Debut alerts.** The archive lists "Debut :" for each performance: "Tonight is X's Met debut." *Data:* the same archive records.
8. **On this date in Met history.** "On this date in 1910, the Met performed …" *Data:* the archive's per-date pages, which are already crawled.
9. **Running gags and callbacks.** Recurring kickers that pay off later. Idomeneo has a "Neptune status" tracker: vow made → storm → sea serpent → Voice of Neptune. Tosca has Scarpia's supper. Chained pops, as Thompson describes. *Data:* the synopsis plus scene markers.
10. **Scene stats.** "Longest scene tonight: 11 minutes." "Shortest: 19 seconds." *Data:* the scene markers.
11. **Pop quiz.** True-or-false bubbles drawn from the verified facts, answered by the next bubble (like VH1's Pop Up Quiz spin-off). *Data:* the existing fact set.
12. **Legend vs. fact.** Label famous anecdotes honestly ("Legend has it…" / "Fact:"), e.g. the bouncing Tosca. *Data:* sources that call them legends.
