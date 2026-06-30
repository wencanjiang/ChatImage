(function initHeroInlineDemo() {
  var heroDemo = document.getElementById("heroDemo");
  if (!heroDemo) return;
  var heroStage = document.getElementById("heroStage");
  var heroStageImg = document.getElementById("heroStageImg");
  var heroHotspots = document.getElementById("heroHotspots");
  var popover = document.getElementById("heroPopover");
  var preview = document.getElementById("heroPopoverPreview");
  var titleEl = document.getElementById("heroPopoverTitle");
  var detailEl = document.getElementById("heroPopoverDetail");
  var closeBtn = document.getElementById("heroPopoverClose");
  if (!heroStage || !heroHotspots || !popover || !preview || !titleEl || !detailEl) return;

  function clamp01(v) {
    var n = Number(v);
    return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  }
  function normalizeBounds(b) {
    if (!b || typeof b !== "object") return null;
    var x = clamp01(b.x);
    var y = clamp01(b.y);
    var w = clamp01(b.width || b.w || 0);
    var h = clamp01(b.height || b.h || 0);
    if (x + w > 1) w = Math.max(0, 1 - x);
    if (y + h > 1) h = Math.max(0, 1 - y);
    return w > 0 && h > 0 ? { x: x, y: y, width: w, height: h } : null;
  }
  function pickStrategy(demo, hotspot) {
    var pm = window.ChatImagePreviewStrategy;
    var stateLike =
      (demo && demo.state) || { visualMode: (demo && demo.visualMode) || "" };
    if (pm && typeof pm.inferPreviewStrategy === "function") {
      try {
        return pm.inferPreviewStrategy(stateLike, hotspot) || {};
      } catch (e) {}
    }
    var rk = String((hotspot && hotspot.regionKind) || "").toLowerCase();
    var subjectKinds = [
      "object", "product", "character", "robot", "subject", "exhibit",
      "tool", "vehicle", "machine", "plant", "furniture"
    ];
    var independent = subjectKinds.indexOf(rk) >= 0;
    return {
      preferContextCrop: !independent,
      independentSubject: independent,
      regionKind: rk,
      visualMode: stateLike.visualMode || ""
    };
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
  function setHotspotButtonLabel(btn, demo, hotspot, index) {
    var text = getHotspotText(demo, hotspot).label || "Region " + (index + 1);
    btn.dataset.label = text;
    btn.setAttribute("aria-label", text);
  }
  function clearPreview() {
    preview.classList.remove("cutout", "organic", "fallback");
    while (preview.firstChild) preview.removeChild(preview.firstChild);
  }
  function buildPreview(demo, hotspot) {
    clearPreview();
    if (!hotspot) return;
    var mask = hotspot.mask || {};
    var cutoutImg = mask.cutoutImage || "";
    var organicImg = mask.organicImage || "";
    var strategy = pickStrategy(demo, hotspot);
    var preferCutout =
      !!(strategy && (strategy.independentSubject || strategy.cardLike)) &&
      !strategy.preferContextCrop;
    var useCutout = preferCutout && cutoutImg;
    var useOrganic = !useCutout && organicImg;
    var imgUrl = "";
    var kind = "fallback";
    if (useCutout) { imgUrl = cutoutImg; kind = "cutout"; }
    else if (useOrganic) { imgUrl = organicImg; kind = "organic"; }
    else if (demo && demo.image) { imgUrl = demo.image; kind = "fallback"; }
    if (!imgUrl) return;
    var img = document.createElement("img");
    img.alt = getHotspotText(demo, hotspot).label + " preview";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    img.src = imgUrl;
    preview.appendChild(img);
    preview.classList.add(kind);
  }
  var openHotspotIndex = -1;
  var heroButtons = [];
  function clampPx(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  function positionPopover(hotspot) {
    if (!hotspot) return;
    var bounds = normalizeBounds(hotspot.bounds || hotspot);
    if (!bounds) return;
    var stageW = heroStage.clientWidth || 1;
    var stageH = heroStage.clientHeight || 1;
    var gap = 14;
    var margin = 12;
    // Measure popover size (currently invisible: opacity 0, visibility hidden,
    // but layout box is still computed). Width is fixed by CSS but height
    // depends on text content, so we force a temporary measurement.
    var prevVis = popover.style.visibility;
    var prevOpacity = popover.style.opacity;
    popover.style.visibility = "hidden";
    popover.style.opacity = "0";
    // Reset position so we can measure intrinsic size.
    popover.style.left = "0px";
    popover.style.top = "0px";
    var pw = popover.offsetWidth || 320;
    var ph = popover.offsetHeight || 200;
    popover.style.visibility = prevVis;
    popover.style.opacity = prevOpacity;

    var hx = bounds.x * stageW;
    var hy = bounds.y * stageH;
    var hw = bounds.width * stageW;
    var hh = bounds.height * stageH;
    var hCx = hx + hw / 2;
    var hCy = hy + hh / 2;

    // Choose side with most free space: right > left > bottom > top.
    var spaceRight = stageW - (hx + hw) - margin;
    var spaceLeft = hx - margin;
    var spaceBottom = stageH - (hy + hh) - margin;
    var spaceTop = hy - margin;

    var side;
    if (spaceRight >= pw + gap) side = "right";
    else if (spaceLeft >= pw + gap) side = "left";
    else if (spaceBottom >= ph + gap) side = "bottom";
    else if (spaceTop >= ph + gap) side = "top";
    else {
      // Not enough room on any side; fall back to whichever side has most space.
      var max = Math.max(spaceRight, spaceLeft, spaceBottom, spaceTop);
      side = max === spaceRight ? "right" : max === spaceLeft ? "left" : max === spaceBottom ? "bottom" : "top";
    }

    var left;
    var top;
    var origin;
    if (side === "right") {
      left = hx + hw + gap;
      top = hCy - ph / 2;
      origin = "left center";
    } else if (side === "left") {
      left = hx - pw - gap;
      top = hCy - ph / 2;
      origin = "right center";
    } else if (side === "bottom") {
      left = hCx - pw / 2;
      top = hy + hh + gap;
      origin = "center top";
    } else {
      left = hCx - pw / 2;
      top = hy - ph - gap;
      origin = "center bottom";
    }
    // Clamp inside stage so popover never leaves the image edges.
    left = clampPx(left, margin, Math.max(margin, stageW - pw - margin));
    top = clampPx(top, margin, Math.max(margin, stageH - ph - margin));
    popover.style.left = left + "px";
    popover.style.top = top + "px";
    popover.style.setProperty("--hero-popover-origin", origin);
    popover.dataset.side = side;
  }
  function openPopover(demo, hotspot, index) {
    if (!hotspot) return;
    buildPreview(demo, hotspot);
    var copy = getHotspotText(demo, hotspot);
    titleEl.textContent = copy.label;
    detailEl.textContent = copy.detail;
    popover.setAttribute("aria-hidden", "false");
    heroButtons.forEach(function (btn, i) {
      btn.classList.toggle("active", i === index);
    });
    openHotspotIndex = index;
    // Position before reveal so the entrance animation plays from the
    // chosen origin point.
    positionPopover(hotspot);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        popover.classList.add("open");
      });
    });
  }
  function closePopover() {
    popover.classList.remove("open");
    popover.setAttribute("aria-hidden", "true");
    heroButtons.forEach(function (btn) { btn.classList.remove("active"); });
    openHotspotIndex = -1;
  }
  function refreshOpenPopover() {
    var demo = window.__heroDemoActive;
    var hotspots = demo && demo.state && Array.isArray(demo.state.hotspots) ? demo.state.hotspots : [];
    var hotspot = hotspots[openHotspotIndex];
    if (!hotspot) return;
    var copy = getHotspotText(demo, hotspot);
    titleEl.textContent = copy.label;
    detailEl.textContent = copy.detail;
    positionPopover(hotspot);
  }
  function refreshHotspotLabels(demo) {
    var hotspots = demo && demo.state && Array.isArray(demo.state.hotspots) ? demo.state.hotspots : [];
    heroButtons.forEach(function (btn, index) {
      if (hotspots[index]) setHotspotButtonLabel(btn, demo, hotspots[index], index);
    });
  }
  function renderHotspots(demo) {
    heroHotspots.innerHTML = "";
    heroButtons = [];
    var hotspots =
      demo && demo.state && Array.isArray(demo.state.hotspots)
        ? demo.state.hotspots
        : [];
    hotspots.forEach(function (hotspot, index) {
      var bounds = hotspot.bounds || hotspot;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hero-hotspot";
      setHotspotButtonLabel(btn, demo, hotspot, index);
      btn.style.left = Number(bounds.x || 0) * 100 + "%";
      btn.style.top = Number(bounds.y || 0) * 100 + "%";
      btn.style.width = Number(bounds.width || 0) * 100 + "%";
      btn.style.height = Number(bounds.height || 0) * 100 + "%";
      btn.style.zIndex = String(10 + Number(hotspot.zIndex || index));
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (openHotspotIndex === index) {
          closePopover();
        } else {
          openPopover(demo, hotspot, index);
        }
      });
      heroHotspots.appendChild(btn);
      heroButtons.push(btn);
    });
  }

  // close handlers
  if (closeBtn) closeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    closePopover();
  });
  // click outside popover (but still inside stage) closes
  heroStage.addEventListener("click", function (e) {
    if (popover.contains(e.target)) return;
    var hit = e.target && e.target.classList && e.target.classList.contains("hero-hotspot");
    if (hit) return;
    closePopover();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePopover();
  });
  // Reposition open popover on viewport changes so it stays anchored to its hotspot.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (openHotspotIndex < 0) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var hs = (window.__heroDemoActive && window.__heroDemoActive.state && window.__heroDemoActive.state.hotspots) || [];
      var hotspot = hs[openHotspotIndex];
      if (hotspot) positionPopover(hotspot);
    }, 80);
  });
  window.addEventListener("chatimage:i18n", function () {
    var demo = window.__heroDemoActive;
    if (!demo) return;
    refreshHotspotLabels(demo);
    if (openHotspotIndex >= 0) refreshOpenPopover();
  });

  var url = heroDemo.dataset.demo;
  var fallback = {
    title: heroDemo.dataset.title || "",
    image: heroDemo.dataset.img || "",
    state: { hotspots: [] }
  };
  function start(demo) {
    window.__heroDemoActive = demo;
    if (demo && demo.image && heroStageImg) heroStageImg.src = demo.image;
    renderHotspots(demo);
    // ensure popover is closed initially per user request
    closePopover();
  }
  if (!url) { start(fallback); return; }
  fetch(url, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("hero demo JSON failed: " + res.status);
      return res.json();
    })
    .then(start)
    .catch(function () { start(fallback); });
})();
