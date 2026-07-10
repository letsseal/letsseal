(function () {
  "use strict";
  var SELF = document.currentScript;
  var DEFAULT_APP = SELF ? new URL(SELF.src, location.href).origin : location.origin;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "style") n.style.cssText = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".c{border:1px solid #e3e6ea;border-radius:12px;padding:16px;max-width:420px;background:#fff;color:#172033}" +
    ".row{display:flex;align-items:center;gap:10px}" +
    ".mark{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:18px;color:#fff}" +
    ".ok{background:#1a73e8}.bad{background:#9aa1ab}.pend{background:#e8a33d}" +
    ".t{font-weight:600;font-size:15px;line-height:1.2}" +
    ".s{color:#5b6472;font-size:12.5px;margin-top:2px}" +
    ".meta{margin-top:12px;border-top:1px solid #eef0f2;padding-top:10px;font-size:13px}" +
    ".meta div{display:flex;justify-content:space-between;gap:12px;padding:3px 0}" +
    ".meta .k{color:#5b6472}.meta .v{font-weight:500;text-align:right}" +
    "a{color:#1a73e8;text-decoration:none}a:hover{text-decoration:underline}" +
    ".actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}" +
    ".btn{font-size:13px;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid #e3e6ea;cursor:pointer;background:#fff;color:#172033}" +
    ".btn.p{background:#1a73e8;color:#fff;border-color:#1a73e8}" +
    ".drop{border:2px dashed #d3d8de;border-radius:10px;padding:22px;text-align:center;color:#5b6472;font-size:13.5px;cursor:pointer}" +
    ".drop:hover{border-color:#1a73e8}" +
    "details{margin-top:10px;font-size:12px;color:#5b6472}summary{cursor:pointer}" +
    "code{background:#f2f4f6;border-radius:4px;padding:1px 5px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px}" +
    ".ft{margin-top:12px;font-size:11px;color:#8a92a0}";

  function independent(app, otsUrl, isPdf) {
    var d = el("details", null, [el("summary", null, ["Verify independently — don't take our word for it"])]);
    var body = el("div", { style: "margin-top:6px;line-height:1.5" });
    body.innerHTML =
      "This document's timestamp is anchored to Bitcoin and its certificate chain is embedded in the PDF, " +
      "so it can be verified without Let's Seal or this site" +
      (otsUrl ? ": download the <a href='" + otsUrl + "'>.ots proof</a> and run <code>ots verify " + (isPdf ? "your-file.pdf" : "your-file") + "</code>." : ".");
    d.appendChild(body);
    return d;
  }

  function verdictCard(app, data, opts) {
    opts = opts || {};
    var sealed = !!data.sealed;
    var intact = data.intact !== false;
    var good = opts.fromUpload ? (sealed && intact && data.valid) : sealed;
    var issuer = data.issuer || (data.signer ? String(data.signer).split(",")[0].replace(/^Common Name:\s*/, "") : null);
    var anchor = data.anchor || null;
    var sha = data.sha256;
    var proof = data.proof || (sha ? app + "/d/" + sha : null);
    var otsUrl = (anchor && anchor.otsUrl) || (sha ? app + "/api/anchor/" + sha : null);

    var markCls = good ? "ok" : sealed ? "bad" : "bad";
    var title = good ? "Authentic & unaltered" : sealed ? "Altered since sealing" : "Not a sealed document";
    var sub = good
      ? (issuer ? "Sealed by " + issuer + (data.title ? " · " + data.title : "") : "Carries a valid Let's Seal seal.")
      : sealed ? "The seal is present but the file changed after sealing." : "No Let's Seal signature was found.";

    var kids = [
      el("div", { class: "row" }, [
        el("div", { class: "mark " + markCls }, [good ? "✓" : "✗"]),
        el("div", null, [el("div", { class: "t" }, [title]), el("div", { class: "s" }, [sub])]),
      ]),
    ];

    if (good) {
      var meta = el("div", { class: "meta" });
      if (issuer) meta.appendChild(el("div", null, [el("span", { class: "k" }, ["Issuer"]), el("span", { class: "v" }, [issuer])]));
      if (anchor && anchor.state && anchor.state !== "none") {
        var astate = anchor.state === "confirmed" ? "Confirmed on-chain" + (anchor.btcBlock ? " (block " + anchor.btcBlock + ")" : "") : "Confirming (~hours)";
        meta.appendChild(el("div", null, [el("span", { class: "k" }, ["Independent timestamp"]), el("span", { class: "v" }, [astate])]));
      }
      kids.push(meta);
    }

    var actions = el("div", { class: "actions" });
    if (proof) actions.appendChild(el("a", { class: "btn p", href: proof, target: "_blank", rel: "noopener" }, ["View full proof →"]));
    kids.push(actions);
    kids.push(independent(app, otsUrl, true));
    kids.push(el("div", { class: "ft" }, [el("a", { href: app, target: "_blank", rel: "noopener", style: "color:#8a92a0" }, ["Secured by Let’s Seal"])]));
    return el("div", { class: "c" }, kids);
  }

  function errorCard(msg) {
    return el("div", { class: "c" }, [el("div", { class: "row" }, [
      el("div", { class: "mark bad" }, ["!"]),
      el("div", null, [el("div", { class: "t" }, ["Couldn’t verify"]), el("div", { class: "s" }, [msg])]),
    ])]);
  }

  function mount(host) {
    var app = (host.getAttribute("data-app") || DEFAULT_APP).replace(/\/$/, "");
    var hash = host.getAttribute("data-hash");
    var shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    shadow.appendChild(el("style", { html: CSS }));
    var slot = el("div");
    shadow.appendChild(slot);
    var set = function (node) { slot.innerHTML = ""; slot.appendChild(node); };

    if (hash) {
      set(el("div", { class: "c" }, [el("div", { class: "s" }, ["Checking…"])]));
      fetch(app + "/api/v1/documents/" + encodeURIComponent(hash.toLowerCase()))
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) { set(res.ok ? verdictCard(app, res.j, {}) : errorCard(res.j.error || "Not on record")); })
        .catch(function () { set(errorCard("Network error")); });
      return;
    }

    var drop = el("div", { class: "drop" }, ["Drop a sealed PDF here, or click to choose"]);
    var input = el("input", { type: "file", accept: "application/pdf", style: "display:none" });
    var card = el("div", { class: "c" }, [el("div", { class: "t", style: "font-size:14px;margin-bottom:10px" }, ["Verify a document"]), drop, input,
      el("div", { class: "ft" }, ["Your file is checked and discarded — nothing is stored."])]);
    set(card);
    var pick = function () { input.click(); };
    var handle = function (file) {
      if (!file) return;
      set(el("div", { class: "c" }, [el("div", { class: "s" }, ["Verifying…"])]));
      var fd = new FormData(); fd.append("file", file, file.name || "document.pdf");
      fetch(app + "/api/v1/verify", { method: "POST", body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) { set(res.ok ? verdictCard(app, res.j, { fromUpload: true }) : errorCard(res.j.error || "Verify failed")); })
        .catch(function () { set(errorCard("Network error")); });
    };
    drop.addEventListener("click", pick);
    input.addEventListener("change", function (e) { handle(e.target.files[0]); });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.style.borderColor = "#1a73e8"; });
    drop.addEventListener("dragleave", function () { drop.style.borderColor = ""; });
    drop.addEventListener("drop", function (e) { e.preventDefault(); handle(e.dataTransfer.files[0]); });
  }

  function init() {
    var hosts = document.querySelectorAll("[data-letsseal-verify]");
    for (var i = 0; i < hosts.length; i++) if (!hosts[i].__ls) { hosts[i].__ls = 1; mount(hosts[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
