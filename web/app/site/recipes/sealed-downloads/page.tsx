import { PageHead, Container, H2, serif, CodeBlock, LinkArrow } from "../../_components/ui";

export const metadata = {
  title: "Sealing on download, Let's Seal",
  description:
    "Serve a sealed copy of a document from your own site, and give every download its own verifiable identity so you can tell copies apart later.",
};

export default function SealedDownloadsPage() {
  return (
    <>
      <PageHead
        eyebrow="Recipe"
        title="Seal a document as it is downloaded."
        lede="Publish a report, seal it once, and every reader who downloads it holds a copy that proves itself. Or seal per download, and each copy gets its own identity you can recognise later."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <H2>Most of the time, seal it once</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            A download is a byte-for-byte copy. The signature lives inside the PDF, so it travels
            with the file: every reader who downloads it, forwards it, or emails it on is holding a
            document that carries its own proof. They all share one digest and one proof page.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            So for a published report, seal the file once and serve the sealed copy. Nothing else is
            needed. Readers can check it in any PDF reader, or against the public transparency log
            and the blockchain anchor, without an account and without asking you.
          </p>
          <div className="mt-6">
            <CodeBlock>{`curl -X POST https://letsseal.org/api/v1/seal \\
  -H "Authorization: Bearer $LETSSEAL_API_KEY" \\
  -F file=@quarterly-report.pdf \\
  -F stamp=line \\
  -o quarterly-report.sealed.pdf`}</CodeBlock>
          </div>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px]">stamp</code> decides what
            appears on the page: <b>badge</b> puts a scannable QR and a typable code in the corner of
            the first page, <b>line</b> puts one grey sentence along the foot of the last page, and{" "}
            <b>none</b> leaves the document exactly as you designed it. The choice is cosmetic. A
            report with nothing printed on it verifies exactly like one with a QR, because what
            proves a document is its signature and its digest.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Serve the sealed file from your own site as you would any other. The response headers
            carry the digest and the proof URL, so you can store them alongside the publication.
          </p>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <H2>Sealing per download, so copies can be told apart</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Sealing the same file twice produces two different files. The signing time and the
            signature itself differ, so each sealed copy has its own digest, its own short proof code
            and its own proof page. That happens whether you plan for it or not.
          </p>
          <div className="mt-6">
            <CodeBlock>{`same source PDF, sealed three times

  copy 1  ->  819e69a92168923545f8711e...
  copy 2  ->  0f00f06454be67f27e3f7798...
  copy 3  ->  f3167ebcd1e9e87688194b5c...`}</CodeBlock>
          </div>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            You can use that. Call the seal endpoint on each download, record which digest you served
            to which customer in your own database, and you can recognise any copy that comes back to
            you later. If an exact copy of your report turns up where it should not be, hash it and
            look up the digest.
          </p>
          <div className="mt-6">
            <CodeBlock>{`// on your download route
const sealed = await sealForThisDownload(reportPdf);   // POST /api/v1/seal
await db.downloads.insert({
  customerId,                                    // stays in YOUR database
  sha256: sealed.headers["x-letsseal-sha256"],   // the copy's identity
  issuedAt: new Date(),
});
return sealed.body;`}</CodeBlock>
          </div>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Let&rsquo;s Seal never needs to know who your customer is. The digest means nothing
            without your records, so the identity stays yours and the lookup happens on your side.
          </p>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <H2>What this does and does not tell you</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            This recognises an <b>exact copy</b>. Someone who forwards the file unchanged, which is
            how most documents travel, is recognisable from the digest alone.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            A copy that has been printed to PDF, screenshotted, re-exported or run through a PDF
            optimiser is a different file. Its digest changes and the seal reports it as altered,
            which is the tamper-evidence doing its job, and it also means the trail stops there.
            Recognising a re-rendered copy is a different technique, and treating a digest match as
            proof of who leaked something is a claim worth being careful with.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            If you are relying on this and it matters, tell us what you are doing with it. Real use
            decides what gets built next here.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            <LinkArrow href="/site/developers">API reference</LinkArrow>
            <LinkArrow href="https://github.com/letsseal/letsseal/discussions">Tell us how you use it</LinkArrow>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-14 sm:py-18">
          <h2 className={`${serif} text-[26px] font-medium tracking-tight`}>A note on tracking readers</h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Giving each copy an identity is useful for licensed material, and it is also a record of
            who received what. Where that record points at a person, it is personal data, and it is
            yours to hold and to account for. We hold digests, which say nothing on their own.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Telling recipients that copies are individually identified tends to work better than not,
            both because it deters casual sharing and because it is the fair thing to do.
          </p>
        </Container>
      </section>
    </>
  );
}
