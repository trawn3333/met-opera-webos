# Pop-up facts: "Pop-Up Video" voice (sample pass)

## How Pop-Up Video bubbles worked (research summary)

* **Readable in about 4 seconds.** "We're not going to put paragraphs on the video. We're gonna tell you stories that are really interesting and in like, 4 seconds." (Woody Thompson, [Billboard, 2018](https://www.billboard.com/culture/tv-film/pop-up-video-co-creators-interview-8467146/)). Bubbles appeared about every 10–15 seconds ([Wikipedia](https://en.wikipedia.org/wiki/Pop-Up_Video); "every 10 seconds or so", [Newsweek, 1997](https://www.newsweek.com/pop-goes-tv-screen-172208)).
* **Everything is true; the joke comes from where you put it.** "In our stuff, everything is true. We try to keep an ironic, sort of distanced voice where we allow the viewer at home to make the connection by juxtaposing the fact to the image on the screen." (Tad Low, [Mr. Media interview, 1997](https://mrmedia.com/2007/10/tad-low-and-woody-thompson-pop-up-video-producers-mr-media-interview-classic/)). "The minute you think you're working on our comedy show, and you're here to write jokes, you're gonna lose your job … They're never gonna remember a joke, they're gonna remember a fact." (Thompson, Billboard). General facts were double- or triple-sourced (Wikipedia, citing Burns 2004).
* **Point at what's on screen.** "The text works in conjunction with what's going on in the background" (Low, Billboard). If a story couldn't be tied to what viewers were watching, the writers didn't use it (Thompson, [Wired, 2011](https://www.wired.com/2011/10/tv-fact-checkers-pop-up-video/)).
* **Chain the bubbles.** "We're trying as best we can to make connections between 'pops' to tell a story on top of a story." (Thompson, Wired). Each pop had to be "just as good or even better than the pop that preceded it" (Low, Billboard).
* **Mix three kinds.** "a nice mix of biographical information about the artist and a bit about the process of the video, and the random reference train rides" (Low, Billboard). That means stats, definitions and history tangents (Wikipedia).
* **Sideways, not cheap.** Low's example: instead of mocking a singer's body, pop a related statistic. "That is a smarter way" ([Mr. Media](https://mrmedia.com/2007/10/tad-low-and-woody-thompson-pop-up-video-producers-mr-media-interview-classic/)).

### Real bubbles, as quoted in the press

1. Over Phil Collins in a hat: **"41 percent of balding men wear hats."** ([Newsweek, 1997](https://www.newsweek.com/pop-goes-tv-screen-172208))
2. Over Sheryl Crow's "Leaving Las Vegas": **"people are not leaving Las Vegas. Its population has doubled in the past 10 years."** (Newsweek, 1997)
3. A chain over No Doubt's "Don't Speak": **"Tony and Gwen had no doubt about their love for eight years."** → **"The night before this shoot the band fought and almost broke up."** → **"[Guitarist] Tom [Dumont] convinced the others a video about their 'anger' would be good therapy."** ([Los Angeles Times, 19 Aug 1997](https://www.latimes.com/archives/la-xpm-1997-aug-19-ca-23734-story.html))

## Rules for our bubbles

1. **20 words or fewer**, one idea, about 2 short lines (target 90–110 characters).
2. **The fact must be true, sourced and verified.** Evidence must appear word for word in the cached source (`check.js`). Humor comes from framing, juxtaposition, a callback or a deadpan aside. No invented quotes, reactions or bloopers.
3. **Aim at the situation, the plot and history.** No cheap shots at real living people. Dead legends get affectionate ribbing at most.
4. **Lead with the fact and end with the aside.** Short tags work: "Read the room." "Guess who won." "Opera puberty."
5. **Tie it to the scene** (`sceneMatch`) whenever the fact is about what's on stage.
6. **Kickers** (the small label) set the tone: Did you know? · Fun fact · Ouch. · Plot hole alert · Plot twist · Critics: not fans · Critics: big fans · Burn. · Diva moment · Villain moment · Listen for it · Blooper · Legend has it · Remix · Borrowed! · Box office · Translation · Set piece · Director's cut · Behind the music · Meanwhile, in YEAR…. Suggested icons are in `mk_snark.py` (`ICONS`), each with a Material Symbols name and an emoji fallback.
7. **Mark legends as legends.** Apocryphal stories (like the bouncing Tosca) carry `legend: true`, the kicker "Legend has it", and wording like "reportedly" or "legend".

## What Matt's ratings taught us (Idomeneo, Met HD 2017-03-25; 22 good / 2 bad)

* **It's for opera fans.** Never suggest the opera or the show is boring, long or tedious, and never mock the art form. Aim for wry, affectionate and in the know: delight in the work.
* **Gentle wryness lands; sarcasm about the plot's logic doesn't.** #9 ("…On an inhabited island. Bold.") missed. #17 (the Munich review praised the scenery and never named Mozart) and #18 (Sidon is a fictional city) landed. Smile *with* the opera, not *at* it.
* **Name-dropping needs a hook.** #7, a bare 1982 cast list, missed. A name has to come with a story, or a link to what's on screen right now (e.g. #11: Ponnelle filmed Cenerentola with von Stade, then made her his first Met Idamante).
* **Be specific to this production and performance.** Draw on the Ponnelle staging, the Met's own history with the opera (the archive's performance count), tonight's singers and conductor, and the music under way at this moment.
* **Quotes need who, where and when.** A quote without its details doesn't land (feedback on #23). Every bubble that quotes a critic, a letter or a review names the speaker, the publication and the date, either in the text or in the **`attribution`** line. That is a small second line under the bubble, rendered smaller by the UI. Translations of the libretto get "Varesco's libretto (English translation)".

## What Matt's ratings taught us about MUSIC bubbles (M1–M14; 8 good / 6 bad)

* **Point the ear at what's sounding right now.** Bubbles that landed tell you what to listen for in the number that's playing: the orchestration (M5's four solo winds, M12's trombones and horns for Neptune, M8's piccolo), the form (M2's secco vs accompagnato recitative, M11's march), the keys (M14's return to D major), a model it echoes (M3's Gluck storm), or Mozart's own verdict on this very number (M10, the quartet).
* **Anecdotes that don't change what you hear miss.** Singer stories, rehearsal logistics and letter trivia missed even when true and well sourced: M1 (the orchestra's reputation), M4 ("very French"), M6 (Raaff singing his aria at bedtime), M7 (Wendling "very satisfied"), M9 (storm logistics), M13 (shortening the oracle). Test: after reading it, does the viewer hear the next 30 seconds differently? If not, cut it.
* **One bubble per topic.** Where a music bubble and an earlier bubble covered the same thing (piccolo #19/M8, trombones #22/M12, final key #24/M14), 1.4.1 keeps one, merging the details, and prefers the richer music version.
