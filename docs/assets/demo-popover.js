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

  function getHotspotText(demo, hotspot) {
    var locale = window.ChatImageDemoLocale;
    if (locale && typeof locale.getHotspotText === "function") {
      try {
        return locale.getHotspotText(demo, hotspot);
      } catch (e) {}
    }
    return {
      label: String((hotspot && hotspot.label) || "Untitled region"),
      detail: String((hotspot && (hotspot.detail || hotspot.shortText)) || "No detail text is available for this region.")
    };
  }

  function currentLang() {
    if (window.ChatImageDemoLocale && typeof window.ChatImageDemoLocale.getLang === "function") {
      return window.ChatImageDemoLocale.getLang() === "zh" ? "zh" : "en";
    }
    if (window.ChatImageI18n && typeof window.ChatImageI18n.getLang === "function") {
      return window.ChatImageI18n.getLang() === "zh" ? "zh" : "en";
    }
    return document.documentElement.lang === "zh-CN" ? "zh" : "en";
  }

  function phrase(en, zh) {
    return currentLang() === "zh" ? zh : en;
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
    img.alt = getHotspotText(demo, hotspot).label + " preview";
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
    demoDetailTitle.textContent = phrase("Select a region", "选择一个区域");
    demoDetailText.textContent = phrase(
      "Click a region on the image to inspect its preserved preview and explanation.",
      "点击图片中的区域，查看保留的局部预览和对应说明。"
    );
    if (demoDetailCount) {
      demoDetailCount.textContent = currentLang() === "zh"
        ? String(count || 0) + " 个热点"
        : String(count || 0) + " hotspots";
    }
    demoDetail.classList.remove("active");
  }

  var openIndex = -1;
  var activeDemo = null;
  var activeButtons = [];
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
    activeDemo = demo;
    activeButtons = buttons || [];
    setPreview(demo, hotspot);
    var copy = getHotspotText(demo, hotspot);
    demoDetailTitle.textContent = copy.label;
    demoDetailText.textContent = copy.detail;
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
    activeDemo = null;
    activeButtons = [];
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

  window.addEventListener("chatimage:i18n", function () {
    var hotspots = activeDemo && activeDemo.state && Array.isArray(activeDemo.state.hotspots) ? activeDemo.state.hotspots : [];
    var hotspot = hotspots[openIndex];
    if (!hotspot) {
      if (!demoDetail.classList.contains("active")) {
        setEmpty(demoHotspots.querySelectorAll(".demo-hotspot").length);
      }
      return;
    }
    var copy = getHotspotText(activeDemo, hotspot);
    demoDetailTitle.textContent = copy.label;
    demoDetailText.textContent = copy.detail;
    if (activeButtons && activeButtons.length) {
      activeButtons.forEach(function (button, index) {
        if (!hotspots[index]) return;
        var label = getHotspotText(activeDemo, hotspots[index]).label || "Region " + (index + 1);
        button.dataset.label = label;
        button.setAttribute("aria-label", label);
      });
    }
  });

  setEmpty(0);
})();
