(function () {
  const { $, $$, toast } = window.MAKO;
  const C = window.MAKO_CONFIG;

  // fill config-driven values
  $$("[data-cfg]").forEach(el => {
    const [g, k] = el.dataset.cfg.split(".");
    el.textContent = String(C[g][k]);
  });
  $$("[data-addr]").forEach(el => {
    const a = C.contracts[el.dataset.addr];
    el.innerHTML = a ? `<a class="lk" href="${C.chain.explorer}/address/${a}" target="_blank" rel="noopener">${a}</a>` : `<span class="muted">Published at deployment</span>`;
  });

  // syntax highlight (single-pass tokenizer)
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const KW = "pragma|solidity|interface|contract|function|external|view|returns|memory|event|enum|struct|indexed|import|from|const|await|return|if|else|new|let";
  const TY = "uint256|uint64|uint8|int256|address|bool|bytes32|string";
  const re = new RegExp(`(\\/\\/[^\\n]*)|("(?:[^"\\\\]|\\\\.)*")|\\b(${KW})\\b|\\b(${TY})\\b|\\b(\\d[\\d_.]*)\\b|\\b([A-Za-z_]\\w*)(?=\\()`, "g");
  $$("pre[data-lang]").forEach(pre => {
    const src = pre.textContent;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "t" : m[5] ? "n" : "f";
      out += `<span class="tk-${cls}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    pre.innerHTML = out + esc(src.slice(last));
  });

  // copy code
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copycode]");
    if (!b) return;
    const txt = b.closest(".code").querySelector("pre").textContent;
    navigator.clipboard && navigator.clipboard.writeText(txt).then(() => { b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 1400); });
  });

  // mobile sidebar toggle
  $("#dtoggle").addEventListener("click", () => $("#dside").classList.toggle("open"));
  $$(".dgroup a").forEach(a => a.addEventListener("click", () => $("#dside").classList.remove("open")));

  // search filter
  const q = $("#dq");
  const sections = $$(".dmain section");
  const links = $$(".dgroup a");
  q.addEventListener("input", () => {
    const v = q.value.trim().toLowerCase();
    links.forEach(a => {
      const sec = document.getElementById(a.getAttribute("href").slice(1));
      const hit = !v || (sec && sec.textContent.toLowerCase().includes(v));
      a.classList.toggle("hidden", !hit);
    });
  });
  q.addEventListener("keydown", e => {
    if (e.key === "Enter") { const first = links.find(a => !a.classList.contains("hidden")); if (first) location.hash = first.getAttribute("href"); }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });

  // TOC (h2 of current section + h3s)
  const toc = $("#toc");
  function buildToc(sec) {
    const hs = [sec.querySelector("h1, h2"), ...sec.querySelectorAll("h3")].filter(Boolean);
    hs.forEach((h, i) => { if (!h.id) h.id = sec.id + "-" + i; });
    toc.innerHTML = hs.map(h => `<a href="#${h.id}" style="${h.tagName === "H3" ? "padding-left:22px" : ""}">${h.textContent}</a>`).join("");
  }

  // scrollspy
  let current = null;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting && current !== en.target) {
        current = en.target;
        links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current.id));
        buildToc(current);
      }
    });
  }, { rootMargin: "-20% 0px -70% 0px" });
  sections.forEach(s => io.observe(s));
  buildToc(sections[0]);
})();
