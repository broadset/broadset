# Permissively-licensed PPTX corpus

This directory carries [`manifest.json`](./manifest.json) — a list of
real-world `.pptx` fixtures pulled from upstream open-source projects
(Apache POI, Apache Tika, python-pptx). The bytes themselves are
**never** committed; running the fetcher populates `.cache/` (which is
git-ignored) on demand from upstream raw GitHub URLs pinned by commit
SHA and SHA-256 hash.

The corpus exercises the importer + exporter against bytes we did not
produce ourselves, surfacing OOXML quirks specific to PowerPoint /
Keynote / LibreOffice / Google Slides / Canva / WPS authoring chains
that synthesised fixtures may miss.

## Usage

Fetch the corpus into `.cache/`:

```sh
npm run pptx:corpus:fetch -w @broadset/formats
```

Then run the harness:

```sh
npm run test -w @broadset/formats -- --run pptx/corpus
```

The harness skips cleanly when `.cache/` is empty, so CI without
network access (or contributors who haven't fetched) stay green. CI
that wants real coverage runs the fetch step before tests.

## Why fetch instead of commit

- **Licence cleanliness.** Apache 2.0 and MIT permit redistribution,
  but pinning by URL + hash means we *reference* the upstream project
  rather than re-publishing it under our repository's licence header.
  If any upstream fixture turns out to embed third-party trademarks the
  contributor missed, deleting our manifest entry is enough — we never
  redistributed.
- **Repo size.** `.pptx` blobs add up; manifest-only is a few KB.
- **Pinned but live.** A commit-SHA URL on `raw.githubusercontent.com`
  is immutable (the bytes live in the upstream git tree forever), so
  pin stability matches "vendored" without the bloat.

## Sources

| Source        | Licence    | Repository                                                |
| ------------- | ---------- | --------------------------------------------------------- |
| `apache-poi`  | Apache 2.0 | https://github.com/apache/poi                             |
| `apache-tika` | Apache 2.0 | https://github.com/apache/tika                            |
| `python-pptx` | MIT        | https://github.com/scanny/python-pptx                     |

Each entry in `manifest.json` references one of these by `source` and
inherits the licence + commit pin from the top-level `sources` map.

## Refreshing or extending the corpus

1. Pick a new fixture from one of the supported sources (or add a new
   source — must be a permissive licence and the upstream must publish
   raw bytes at a stable, commit-pinned URL).
2. Compute its SHA-256: `shasum -a 256 path/to/fixture.pptx`.
3. Add an entry to `manifest.json` with `name` (our local cache name),
   `source` (matches the `sources` map key), `upstreamName` (file path
   inside the source's `fixtureRoot`), `sha256`, `bytes`, and `tags`.
4. Re-run `npm run pptx:corpus:fetch` to verify the new entry resolves
   and the SHA matches.
5. Run the harness to confirm the importer survives the new file.

When upgrading a source's pinned commit (e.g. POI's `commit` field),
re-compute every SHA-256 derived from that source — fixtures may have
been re-saved upstream.

## Failure mode if upstream rewrites or removes a fixture

The fetcher errors out with the expected hash vs the received hash.
That's a deliberate failure: if upstream silently changes the bytes,
our pin is no longer valid and either the manifest needs updating
(after auditing the new bytes) or the fixture should be dropped. Never
`--force` past a hash mismatch.
