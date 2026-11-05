/* ===== Export Word (.docx) minimal, sans dépendance autre que JSZip ===== */
const DOCX = (() => {
  const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const run = (r, extra = "") => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${r.b ? "<w:b/>" : ""}${extra}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${x(r.text)}</w:t></w:r>`;
  const para = (inner, pPr = "") => `<w:p><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/>${pPr}</w:pPr>${inner}</w:p>`;
  // Image de signature (relation rIdS) : largeur 4 cm, hauteur proportionnelle
  const imgPara = (sig) => {
    const cx = 1440000, cy = Math.round(cx * sig.h / sig.w);
    return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Signature"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdS"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };
  function body(blocks, sig) {
    return blocks.map((b) => {
      if (b.t === "title") return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9300"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9300" w:type="dxa"/></w:tcPr>${b.lines.map((l) => para(run({ text: l, b: true }, '<w:sz w:val="24"/>'), '<w:jc w:val="center"/>')).join("")}</w:tc></w:tr></w:tbl>` + para("");
      if (b.t === "h") return para(b.runs.map((r) => run(r, "<w:u w:val=\"single\"/>")).join(""), '<w:keepNext/><w:spacing w:before="200" w:after="80"/>');
      if (b.t === "li") return para(run({ text: "-  " }) + b.runs.map((r) => run(r)).join(""), '<w:ind w:left="567" w:hanging="283"/><w:jc w:val="both"/>');
      if (b.t === "right") return para(b.runs.map((r) => run(r)).join(""), '<w:jc w:val="right"/>');
      if (b.t === "tbl") {
        const bd = '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>';
        const row = (cells, bold) => `<w:tr>${cells.map((c, i) => `<w:tc><w:tcPr><w:tcW w:w="${i ? 2300 : 7000}" w:type="dxa"/></w:tcPr>${para(run({ text: String(c ?? ""), b: bold }), i ? '<w:jc w:val="right"/>' : "")}</w:tc>`).join("")}</w:tr>`;
        return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/>${bd}</w:tblPr><w:tblGrid><w:gridCol w:w="7000"/><w:gridCol w:w="2300"/></w:tblGrid>${b.rows.map((rw) => row(rw.cells, rw.b)).join("")}</w:tbl>` + para("");
      }
      if (b.t === "sig") {
        const cell = (lines, img) => `<w:tc><w:tcPr><w:tcW w:w="4650" w:type="dxa"/></w:tcPr>${lines.map((l) => para(run({ text: l }))).join("")}${img ? imgPara(sig) : para("") + para("") + para("")}</w:tc>`;
        return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4650"/><w:gridCol w:w="4650"/></w:tblGrid><w:tr>${cell(b.left)}${cell(b.right, !!sig)}</w:tr></w:tbl>`;
      }
      return para(b.runs.map((r) => run(r)).join(""), '<w:jc w:val="both"/>');
    }).join("");
  }
  /* sig (facultatif) : { png: octets PNG, w, h } — signature de l'employeur dans le bloc de signatures */
  async function build(blocks, paraphes = true, sig = null) {
    const z = new JSZip();
    if (sig) z.file("word/media/signature.png", sig.png);
    z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`);
    z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    z.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${sig ? '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature.png"/>' : ""}</Relationships>`);
    z.file("word/footer1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> / </w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:tab/><w:t xml:space="preserve">${paraphes ? "          Paraphes : ______" : ""}</w:t></w:r></w:p></w:ftr>`);
    z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body(blocks, sig)}<w:sectPr><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return z.generateAsync({ type: "arraybuffer" });
  }
  function html(blocks, esc, sigUrl) {
    return blocks.map((b) => {
      const R = (runs) => runs.map((r) => (r.b ? `<b>${esc(r.text)}</b>` : esc(r.text))).join("");
      if (b.t === "title") return `<div class="doc-title">${b.lines.map(esc).join("<br>")}</div>`;
      if (b.t === "h") return `<h4>${R(b.runs)}</h4>`;
      if (b.t === "li") return `<p class="li">– ${R(b.runs)}</p>`;
      if (b.t === "right") return `<p style="text-align:right">${R(b.runs)}</p>`;
      if (b.t === "tbl") return `<table class="doc-tbl">${b.rows.map((rw) => `<tr${rw.b ? ' class="b"' : ""}>${rw.cells.map((c, i) => `<td${i ? ' class="num"' : ""}>${esc(c ?? "")}</td>`).join("")}</tr>`).join("")}</table>`;
      if (b.t === "sig") return `<div class="sig"><div>${b.left.map(esc).join("<br>")}</div><div>${b.right.map(esc).join("<br>")}${sigUrl ? `<br><img src="${sigUrl}" alt="Signature" style="height:48px;margin-top:4px">` : ""}</div></div>`;
      return `<p>${R(b.runs)}</p>`;
    }).join("");
  }
  return { build, html };
})();

