# PDF fonts

Used by `server/lib/pdf-text.ts` (pdf-lib + @pdf-lib/fontkit) so invoices, billing notes and
quotations print Thai and Chinese. Loaded from disk at runtime (Vercel functions include
`server/**`). Each PDF embeds only the glyphs it uses (`subset: true`), so documents stay ~40 KB.

| File | Covers | Source | Size |
|---|---|---|---|
| `NotoSansSC-Regular-subset.ttf`, `NotoSansSC-Bold-subset.ttf` | Latin, punctuation, Simplified Chinese | Noto Sans SC variable font (google/fonts `ofl/notosanssc`), instanced at wght 400 / 700 and subset | ~2.5 MB each |
| `NotoSansThai-Regular.ttf`, `NotoSansThai-Bold.ttf` | Thai | notofonts.github.io `NotoSansThai/hinted/ttf` | ~38 KB each |

Licence: SIL Open Font License 1.1 (`OFL.txt`) — redistribution and subsetting are allowed.

## Why a subset
The full Noto Sans SC is ~17 MB (variable) / ~8 MB per static weight. The subset keeps all
6,763 GB2312 hanzi (covers everyday business Chinese), every Chinese character used in the app's
own strings, Latin-1/Latin Extended-A, general punctuation, arrows and CJK/full-width symbols.
A character outside the subset prints as "?" instead of failing the document.

## Rebuilding
`build-sc-subset.py` (needs `pip install fonttools`): put the variable font next to it as `sc.ttf`,
plus `extra.txt` with any extra characters to keep (e.g. all hanzi found in `src/` and `server/`),
then run it. It must keep `glyf.padding = 4`: fontkit's own subsetter truncates odd-length glyphs.

Thai is drawn without OpenType shaping (pdf-lib limitation); Noto Sans Thai's default mark
positions are used, which reads correctly for normal text.
