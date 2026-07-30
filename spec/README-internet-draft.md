# Building and submitting the SEAL Internet-Draft

`draft-nsokin-seal-00.md` is the SEAL specification written as an IETF Internet-Draft, in
[kramdown-rfc](https://github.com/cabo/kramdown-rfc) format. This file explains how to
turn it into the XML the IETF datatracker accepts, how to check it, and how to submit it.

The draft tracks `SPEC.md` and the reference implementation. `SPEC.md` stays the working
document; the draft is the version written in RFC register for third-party review.

## What you need

Two tools, in a chain: kramdown-rfc converts the markdown to RFC XML, and xml2rfc renders
that XML to text or HTML.

```bash
gem install kramdown-rfc2629     # provides kramdown-rfc2629 and kdrfc
pip install xml2rfc              # provides xml2rfc
```

Recent kramdown-rfc needs Ruby 3.2 or later. macOS still ships 2.6, so install a current
Ruby first and put it ahead of the system one on `PATH`:

```bash
brew install ruby
export PATH="/opt/homebrew/opt/ruby/bin:/opt/homebrew/lib/ruby/gems/4.0.0/bin:$PATH"
```

The gem's own executables land in that second directory, so both entries are needed. The
combination last known to build this draft cleanly is Ruby 4.0.6, kramdown-rfc2629 1.7.39
and xml2rfc 3.34.0.

Failing that, the older gem chain installs against system Ruby:

```bash
gem install 'connection_pool:2.5.5' 'json_pure:2.6.3'
gem install kramdown-rfc2629 -v 1.7.39
```

## Build

Build into a scratch directory outside the repository, with an absolute path to the
source. kramdown-rfc writes its reference cache into the working directory, and xml2rfc
writes beside its output, so building in place would leave build artefacts in the tracked
`spec/` directory. Start from the repository root:

```bash
SRC="$PWD/spec/draft-nsokin-seal-00.md"
mkdir -p /tmp/seal-draft && cd /tmp/seal-draft

# markdown -> RFC XML (this is the file you submit)
kramdown-rfc2629 "$SRC" > draft-nsokin-seal-00.xml

# XML -> plain text, for reading and for a page count
xml2rfc --text draft-nsokin-seal-00.xml -o draft-nsokin-seal-00.txt

# XML -> HTML, for review in a browser
xml2rfc --html draft-nsokin-seal-00.xml -o draft-nsokin-seal-00.html
```

`kdrfc "$SRC"` does the XML and text in one step, and `kdrfc -h "$SRC"` adds the HTML,
using the IETF author tools service when local tooling is missing.

The first build fetches every RFC reference from `bib.ietf.org` and caches it in a
`.refcache/` directory in the working directory, so later builds from that same directory
are offline and fast. Building in the scratch directory keeps that cache, and the
generated `.xml`, `.txt` and `.html`, out of the repository. If you would rather build in
`spec/`, add `spec/.refcache/`, `spec/*.xml`, `spec/*.txt` and `spec/*.html` to
`.gitignore` first.

## Check before submitting

* xml2rfc warnings are the first pass. Treat "unused reference", "too long line" and
  "artwork too wide" as things to fix rather than to live with: the submission tool runs
  the same renderer.
* `idnits` is the traditional nit checker
  (<https://author-tools.ietf.org/idnits>). The datatracker runs its own checks on
  upload, and the web version of idnits gives you the same list beforehand.
* The author tools site <https://author-tools.ietf.org/> renders and checks an uploaded
  file without installing anything, which is a useful second opinion.
* Keep the filename and the `docname:` in the front matter in step with each other. The
  datatracker takes the draft name and revision from `docname:` inside the file, and a
  mismatched filename is a source of confusion rather than a hard failure.

## Submit

1. Go to <https://datatracker.ietf.org/submit/>.
2. Upload `draft-nsokin-seal-00.xml`. The tool renders it and reports any errors it
   finds. Submitting the XML is preferred; the datatracker generates the text and HTML
   renderings from it.
3. The tool matches the author addresses in the draft and emails a confirmation link to
   them. The draft goes live once that link is followed, so the address in the front
   matter (`tech@letsseal.org`) has to be one you can read.
4. The draft then appears at
   <https://datatracker.ietf.org/doc/draft-nsokin-seal/> with a stable
   URL and a diff view across versions.

This is an individual submission: no working group adoption is required to post it, and
posting it makes it a citable, archived document that anyone can review. The front matter
sets `submissiontype: independent`, which reaches the XML as
`submissionType="independent"` and puts the document on the stream for work produced
outside an IETF working group. There is deliberately no `workgroup:` line: RFC 7991
defines that element for an actual working group.

The rendered draft still carries "Network Working Group" at the top left, which is
xml2rfc's default for an Internet-Draft with no working group, and it is not a sign the
submission type was dropped. "Independent Submission" is what the stream prints on a
published RFC rather than on a draft; check the XML attribute if you want to confirm it.

Publication as an RFC on that stream is a separate, later step: it goes to the Independent
Submissions Editor (<rfc-ise@rfc-editor.org>), who arranges review. See
<https://www.rfc-editor.org/about/independent/> for what that process asks for.

## Two deadlines to keep in mind

**Submission windows close before each IETF meeting.** A single Internet-Draft submission
cut-off applies before each meeting, covering all drafts including `-00`. The date is on
the meeting's "Important Dates" page, for example
<https://datatracker.ietf.org/meeting/important-dates/>. Posting well ahead of it avoids a
scramble; the window reopens after the meeting.

**A draft expires six months after it is posted.** The cover page carries the expiry
date, which the tooling fills in automatically. After that date the draft moves to the
expired list and is marked as such wherever it is cited. Keeping it current means posting
a revision before then.

## Revising

To publish a revision:

1. Edit `draft-nsokin-seal-00.md`.
2. Rename it to `draft-nsokin-seal-01.md` and change `docname:` in the front matter to
   `draft-nsokin-seal-01` so the two agree.
3. Rebuild and submit as above. The datatracker links the versions and offers a diff.

Version numbers only ever go up, and a posted version stays posted, so each revision is a
permanent record of what the specification said on that date.
