// docs/assets/i18n.js - bilingual EN/ZH switcher.
// Dictionary lives in i18n.json; engine fetches it on init and swaps text.
(function () {
  "use strict";
  var DICT = null;
  var origCaptured = false;
  var META = null;
  var currentLang = "en";

  function captureOrig() {
    if (origCaptured) return;
    var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var t = (p.tagName || "").toLowerCase();
        if (t === "script" || t === "style" || t === "code" || t === "pre") {
          return NodeFilter.FILTER_REJECT;
        }
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = tw.nextNode())) {
      if (node._i18nOrig === undefined) node._i18nOrig = node.nodeValue;
    }
    var h1 = document.querySelector(".hero h1");
    if (h1 && h1._i18nOrigHtml === undefined) h1._i18nOrigHtml = h1.innerHTML;
    origCaptured = true;
  }

  function setLang(lang) {
    if (!DICT) return;
    captureOrig();
    var isZh = lang === "zh";
    currentLang = isZh ? "zh" : "en";
    document.documentElement.lang = isZh ? "zh-CN" : "en";
    if (META) {
      document.title = isZh ? META.zh.title : META.en.title;
      var md = document.querySelector('meta[name="description"]');
      if (md) md.setAttribute("content", isZh ? META.zh.desc : META.en.desc);
    }
    var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var t = (p.tagName || "").toLowerCase();
        if (t === "script" || t === "style" || t === "code" || t === "pre") {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = tw.nextNode())) {
      // First-time discovery (e.g. nodes added after page load by demo
      // rendering). Capture their original English so we can restore on
      // a later EN switch.
      if (node._i18nOrig === undefined) node._i18nOrig = node.nodeValue;
      var orig = node._i18nOrig;
      if (orig === undefined) continue;
      var key = orig.trim();
      if (!key) continue;
      if (isZh && DICT[key]) {
        node.nodeValue = orig.replace(key, DICT[key]);
      } else {
        node.nodeValue = orig;
      }
    }
    var h1 = document.querySelector(".hero h1");
    if (h1 && h1._i18nOrigHtml !== undefined) {
      h1.innerHTML = isZh && DICT.__hero ? DICT.__hero : h1._i18nOrigHtml;
    }
    var btn = document.getElementById("langToggle");
    if (btn) btn.textContent = isZh ? "EN" : "中文";
    try { localStorage.setItem("ci.lang", isZh ? "zh" : "en"); } catch (e) {}
  }

  // Public API: re-apply the currently-active language. Callers (e.g. the
  // demo lightbox after injecting hotspot detail HTML) invoke this so newly
  // added text nodes are captured and translated immediately.
  function applyCurrent() {
    if (!DICT) return;
    setLang(currentLang);
  }

  function init() {
    fetch("assets/i18n.json").then(function (r) { return r.json(); }).then(function (data) {
      DICT = data.dict || {};
      META = data.meta || null;
      var saved = null;
      try { saved = localStorage.getItem("ci.lang"); } catch (e) {}
      var initial = saved || (navigator.language && navigator.language.toLowerCase().indexOf("zh") === 0 ? "zh" : "en");
      var btn = document.getElementById("langToggle");
      if (btn) {
        btn.addEventListener("click", function () {
          var cur = document.documentElement.lang === "zh-CN" ? "zh" : "en";
          setLang(cur === "zh" ? "en" : "zh");
        });
      }
      setLang(initial);
    }).catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Public API for dynamic-content consumers (e.g. demo lightbox).
  window.ChatImageI18n = {
    apply: applyCurrent,
    setLang: setLang,
    getLang: function () { return currentLang; }
  };
})();
