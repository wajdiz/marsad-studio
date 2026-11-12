<img src="assets/marsad-logo-256.png" alt="MARSAD" width="88" align="right">

# MARSAD Studio

A social media and text analysis dashboard that runs entirely in your browser. Load a file and get 90
analyses over it. Nothing is installed, no account is needed, and the file never leaves your computer:
the Python that does the work runs inside the page itself.

**Live: https://wajdiz.github.io/marsad-studio**

Studio is the analysis half of MARSAD Analytics. It reads files and nothing else. It makes no request to
any platform, holds no API key, and has no login. Collection happens elsewhere, in the MARSAD platform or in
a tool like Zeeschuimer, and this page reads what those produce.

## What it does

**Reads the files researchers already have.** CSV, Excel, JSON or NDJSON. Exports from CrowdTangle, Meta
Content Library, Meltwater, Communalytic, Zeeschuimer and the common API dumps are recognised and mapped
automatically, so no column has to be renamed. A file it does not recognise is read generically, and it
tells you which columns it matched to what.

**Checks the file before it counts anything.** Duplicate text, posts too short to analyse, missing
engagement columns, mixed time zones, reach reported where interactions are not: each one is stated above
the results in plain words, with the number of rows it affects.

**Runs 90 analyses**, in the sections the menu shows.

| Section | Analyses |
| --- | --- |
| Society | 17 |
| Words | 11 |
| Spread and facts | 10 |
| Ways of speaking | 10 |
| Reactions | 10 |
| When | 8 |
| People | 8 |
| Check my data | 7 |
| Feelings and tone | 5 |
| My report | 3 |
| Topics | 1 |

Every one of them runs here. Analyses that need a GPU language model, a Python package with no browser
build, or an API are not in this version at all, rather than listed with a notice that they cannot run.
What is left covers the same ground with word lists built for Arabic: sentiment, emotion, offensive
language, propaganda-technique wording and the Society measures all work on your own file.

**Handles a file too large for a browser.** Above 40 MB the file is not opened. It is read in slices
instead, which costs no memory, and you are told how many rows it has and what columns it carries. From
there you can keep a sample (at random, the most engaged, keeping the share of any column, or spread
evenly over time), set a word-length range and a date range, drop repeated text, or split the file into
parts. Every sample records its seed, so the same settings return the same rows. A sample can also be
downloaded as a pack ready for annotation: one file per annotator with the same posts in a different
order, a shared calibration set, and a record of how it was drawn.

**Works in Arabic and English.** The whole interface switches, right to left included. The Arabic language
tools (dialect identification, sentiment, stance, named entities, politeness, sarcasm) are built for Arabic
specifically rather than translated from English ones. Arabic writes the conjunction, the preposition and
the article joined to the next word, so before anything is counted those come off: الحكومة، والحكومة،
بالحكومة and للحكومة are one word, not four. A word that merely begins with one of those letters, such as
وزير or فلسطين, is left alone. The switch sits beside the time zone and can be turned off.

**Gives the work back.** Every chart downloads as PNG or SVG, every table as Excel or CSV, the network
graphs as GraphML for Gephi, the whole session as a draft report, and the cleaned dataset itself as a CSV
so any number on screen can be checked by hand.

## Running it

It is a static site. Open `index.html` over HTTP, or publish the folder with GitHub Pages. There is no
build step and no server to run. The first load fetches about 25 MB of Python runtime and word lists, then
caches them.

### Four files to add before it will run

The Python runtime, the chart library and the word lists are third-party files, identical to the ones in
the `marsad-analytics` repository and unchanged by this build. They are not in this archive because of
their size. Copy them across, keeping the paths:

| From `marsad-analytics` | Size |
| --- | --- |
| `pyodide/` (the whole folder, 9 files) | 42 MB |
| `bundle_py.zip.wasm` | 6.8 MB |
| `wordfreq_data.zip.wasm` | 6.6 MB |
| `plotly.min.js` | 4.8 MB |

The page will load without them and then stop at "Loading", because the analyses have nowhere to run.

## The logos

`assets/logo-nuq.png`, `assets/logo-qrdi.png` and `assets/logo-hbku.png` are placeholders. Replace the three
files, keeping the names, and the footer picks them up. They are shown 46 px tall, so supply them at roughly
three times that height with a transparent background. Nothing else needs editing.

## Privacy

The file you open is read inside the browser. No part of it is uploaded, and the page makes no request to
any server other than the one serving these files. Closing the tab discards everything.

## Licence and credit

This repository has no licence declared yet. Until one is added, the default applies: all rights reserved,
and others may read the code but may not reuse it. Add a LICENSE file to change that.

Built for the MARSAD Observatory at Northwestern University in Qatar. When MARSAD Analytics contributes to
published work, please cite the observatory.
