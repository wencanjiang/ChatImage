(function initDemoLightboxDetailPanel() {
  var lb = document.getElementById("lightbox");
  if (!lb) return;

  var demoStageEl = document.getElementById("demoStage");
  var demoHotspots = document.getElementById("demoHotspots");
  var demoPopover = document.getElementById("demoPopover");
  var demoDetail = document.getElementById("demoDetail");
  var demoDetailPreview = document.getElementById("demoDetailPreview");
  var demoDetailTitle = document.getElementById("demoDetailTitle");
  var demoDetailText = document.getElementById("demoDetailText");
  var demoDetailCount = document.getElementById("demoDetailCount");
  if (!demoStageEl || !demoHotspots || !demoDetail || !demoDetailPreview || !demoDetailTitle || !demoDetailText) return;

  function pickStrategy(demo, hotspot) {
    var pm = window.ChatImagePreviewStrategy;
    var stateLike = (demo && demo.state) || { visualMode: (demo && demo.visualMode) || "" };
    if (pm && typeof pm.inferPreviewStrategy === "function") {
      try {
        return pm.inferPreviewStrategy(stateLike, hotspot) || {};
      } catch (e) {}
    }
    var rk = String((hotspot && hotspot.regionKind) || "").toLowerCase();
    var subjectKinds = ["object", "product", "character", "robot", "subject", "exhibit", "tool", "vehicle", "machine", "plant", "furniture"];
    var independent = subjectKinds.indexOf(rk) >= 0;
    return { preferContextCrop: !independent, independentSubject: independent, regionKind: rk, visualMode: stateLike.visualMode || "" };
  }

  function clearPreview() {
    demoDetailPreview.classList.remove("cutout", "organic", "fallback");
    demoDetailPreview.setAttribute("aria-hidden", "true");
    while (demoDetailPreview.firstChild) demoDetailPreview.removeChild(demoDetailPreview.firstChild);
  }

  function setPreview(demo, hotspot) {
    clearPreview();
    if (!hotspot) return;
    var mask = hotspot.mask || {};
    var strategy = pickStrategy(demo, hotspot);
    var organicImg = mask.organicImage || "";
    var cutoutImg = mask.cutoutImage || "";
    var fallbackImg = (demo && (demo.image || demo.thumbnail)) || "";
    var imgUrl = "";
    var kind = "fallback";

    // Public demos should show context first. Transparent cutouts are useful for
    // isolated objects, but they look abrupt for maps/scenes and can feel like a
    // mask artifact. Prefer the outward-expanded organic preview whenever it exists.
    if (organicImg) {
      imgUrl = organicImg;
      kind = "organic";
    } else if (strategy && strategy.independentSubject && cutoutImg) {
      imgUrl = cutoutImg;
      kind = "cutout";
    } else if (fallbackImg) {
      imgUrl = fallbackImg;
      kind = "fallback";
    }

    if (!imgUrl) return;
    var img = document.createElement("img");
    img.alt = (hotspot.label || "Region") + " preview";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    img.src = imgUrl;
    demoDetailPreview.appendChild(img);
    demoDetailPreview.classList.add(kind);
    demoDetailPreview.setAttribute("aria-hidden", "false");
  }

  function setEmpty(count) {
    clearPreview();
    demoDetailTitle.textContent = "Select a region";
    demoDetailText.textContent = "Click a region on the image to inspect its preserved preview and explanation.";
    if (demoDetailCount) demoDetailCount.textContent = String(count || 0) + " hotspots";
    demoDetail.classList.remove("active");
  }

  var openIndex = -1;
  var hostState = window.__chatimageLightboxHooks = window.__chatimageLightboxHooks || {};

  hostState.openPopover = function (demo, hotspot, index, buttons) {
    if (!hotspot) return;
    var hotspots = demo && demo.state && Array.isArray(demo.state.hotspots) ? demo.state.hotspots : [];
    if (buttons) buttons.forEach(function (button, i) { button.classList.toggle("active", i === index); });
    if (demoPopover) {
      demoPopover.classList.remove("open");
      demoPopover.setAttribute("aria-hidden", "true");
    }
    openIndex = index;
    setPreview(demo, hotspot);
    demoDetailTitle.textContent = String(hotspot.label || "Untitled region");
    demoDetailText.textContent = String(hotspot.detail || hotspot.shortText || "No detail text is available for this region.");
    var buttonCount = buttons && typeof buttons.length === "number" ? buttons.length : 0;
    if (demoDetailCount) demoDetailCount.textContent = String(index + 1) + " / " + String(hotspots.length || buttonCount || 0);
    demoDetail.classList.add("active");
  };

  hostState.closePopover = function () {
    var btns = demoHotspots.querySelectorAll(".demo-hotspot");
    btns.forEach(function (button) { button.classList.remove("active"); });
    if (demoPopover) {
      demoPopover.classList.remove("open");
      demoPopover.setAttribute("aria-hidden", "true");
    }
    openIndex = -1;
    setEmpty(btns.length);
  };

  hostState.repositionIfOpen = function () {};

  demoStageEl.addEventListener("click", function (event) {
    if (event.target && event.target.classList && event.target.classList.contains("demo-hotspot")) return;
    hostState.closePopover();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") hostState.closePopover();
  });

  setEmpty(0);
})();
