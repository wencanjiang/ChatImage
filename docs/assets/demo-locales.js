(function initDemoLocales() {
  "use strict";

  var TEXT = {
    "real-west-lake-tour-map": {
      module_broken_bridge: {
        en: {
          label: "Broken Bridge",
          detail: "Broken Bridge is treated as its own north-side bridge target so it does not get merged into the larger Bai Causeway region."
        }
      },
      module_bai: {
        en: {
          label: "Bai Causeway",
          detail: "Bai Causeway is the east-west northern walking causeway, connecting the Broken Bridge area with Gushan and the north shore."
        }
      },
      module_su: {
        en: {
          label: "Su Causeway",
          detail: "Su Causeway is the north-south green corridor through the western half of West Lake, visually distinct from the horizontal Bai Causeway."
        }
      },
      module_three_pools: {
        en: {
          label: "Three Pools Mirroring the Moon",
          detail: "Three Pools Mirroring the Moon sits on Lesser Yingzhou island south of the lake center, combining a small island, three stone pagodas, and surrounding water into a compact visual focus."
        }
      },
      module_leifeng: {
        en: {
          label: "Leifeng Pagoda",
          detail: "Leifeng Pagoda is the vertical anchor on the south bank at Sunset Hill, helping viewers recognize direction while connecting lake reflections, hillside, and local legend."
        }
      },
      module_gushan: {
        en: {
          label: "Gushan Hill",
          detail: "Gushan Hill adds a cultural and topographic layer to the north shore, extending the Bai Causeway context into gardens, pavilions, and elevated lake views."
        }
      },
      module_baochu: {
        en: {
          label: "Baoshi Hill and Baochu Pagoda",
          detail: "Baoshi Hill and Baochu Pagoda create the north-to-northeast skyline, giving the otherwise flat lake map depth, direction, and a recognizable mountain backdrop."
        }
      },
      module_quyuan: {
        en: {
          label: "Quyuan Lotus Garden",
          detail: "Quyuan Lotus Garden is a smaller-scale garden area where lotus ponds, curved bridges, and near-shore vegetation shift the experience from open water to seasonal detail."
        }
      },
      module_orioles: {
        en: {
          label: "Orioles Singing in the Willows",
          detail: "Orioles Singing in the Willows represents the softer south-eastern shoreline, emphasizing willow-lined paths, garden soundscape, and slow near-water walking."
        }
      }
    },
    "real-healthy-breakfast-options": {
      module_1: {
        en: {
          label: "Breakfast Overview",
          detail: "The overview compares several healthy breakfast choices in one scene so users can judge protein, carbohydrates, fiber, drinks, preparation time, and satiety together."
        }
      },
      module_2: {
        en: {
          label: "Oatmeal Bowl",
          detail: "The oatmeal bowl is a balanced, filling option that highlights slow carbohydrates, fruit, nuts, and easy preparation for a steady-energy morning."
        }
      },
      module_3: {
        en: {
          label: "Greek Yogurt Cup",
          detail: "The Greek yogurt cup emphasizes protein, fruit, and light preparation, making it useful when the user wants a quick breakfast with clear nutritional structure."
        }
      },
      module_4: {
        en: {
          label: "Whole-grain Sandwich",
          detail: "The whole-grain sandwich presents a portable breakfast with grains, protein, and vegetables, suitable for busier mornings or longer time before lunch."
        }
      },
      module_5: {
        en: {
          label: "Boiled Egg Plate",
          detail: "The boiled egg plate focuses on compact protein and simple sides, helping users understand a minimal breakfast that still feels structured and satisfying."
        }
      },
      module_6: {
        en: {
          label: "Fresh Fruit and Black Coffee",
          detail: "Fresh fruit and black coffee show a lighter breakfast pairing, useful when the user wants hydration, freshness, and a low-prep start rather than a heavy meal."
        }
      }
    },
    "real-boutique-coffee-scene": {
      module_1: {
        en: {
          label: "Barista",
          detail: "The barista anchors the service flow, connecting orders, espresso preparation, customer interaction, and the overall rhythm of the cafe."
        }
      },
      module_2: {
        en: {
          label: "Espresso Machine",
          detail: "The espresso machine is the production center of the bar, making the cafe workflow visible through equipment placement, service speed, and drink preparation."
        }
      },
      module_3: {
        en: {
          label: "Pastry Display",
          detail: "The pastry display supports visual choice at the counter, pairing food with coffee and shaping how customers pause, browse, and add items to an order."
        }
      },
      module_4: {
        en: {
          label: "Window Seating",
          detail: "The window seats define the slower stay-in experience, using light, street views, and table spacing to distinguish lingering customers from takeaway traffic."
        }
      },
      module_5: {
        en: {
          label: "Pickup Shelf",
          detail: "The pickup shelf separates completed drinks from ordering, keeping customer movement clear and reducing congestion around the bar."
        }
      },
      module_6: {
        en: {
          label: "Entrance Queue",
          detail: "The entrance queue shows how visitors enter, wait, and approach the counter, revealing whether the cafe layout can support busy service periods."
        }
      }
    },
    "real-plant-care-corner": {
      module_1: {
        zh: {
          label: "龟背竹",
          detail: "龟背竹是植物护理角的视觉中心，大叶片需要明亮散射光、稳定湿度和适当留白，能帮助用户判断整套护理布置是否围绕植物需求展开。"
        }
      },
      module_2: {
        zh: {
          label: "长嘴浇水壶",
          detail: "长嘴浇水壶让水能准确落到土壤根部，减少叶面残水和桌面溅水，是日常护理中最直接影响植物状态的工具。"
        }
      },
      module_3: {
        zh: {
          label: "植物补光灯",
          detail: "全光谱补光灯补足室内或冬季光照，把自然光不足的问题转化为可控条件，尤其适合需要稳定生长节奏的观叶植物。"
        }
      },
      module_4: {
        zh: {
          label: "换盆工作台",
          detail: "换盆工作台把修剪、施肥、换土和工具收纳集中到一个区域，让护理流程更干净，也让泥土和小工具不会散落到生活空间。"
        }
      },
      module_5: {
        zh: {
          label: "湿度托盘",
          detail: "湿度托盘通过水分蒸发改善植物附近的小环境，适合用来解释为什么室内植物护理不只依赖浇水，还要关注空气湿度。"
        }
      }
    },
    "real-record-store-corner": {
      module_1: {
        zh: {
          label: "试听台",
          detail: "试听台让顾客在购买前实际聆听唱片，连接浏览、判断和购买决策，是唱片店区别于普通货架陈列的重要体验点。"
        }
      },
      module_2: {
        zh: {
          label: "黑胶唱片箱",
          detail: "黑胶唱片箱承载翻找和发现的动作，分类、密度和摆放高度会直接影响顾客探索音乐的节奏。"
        }
      },
      module_3: {
        zh: {
          label: "店员柜台",
          detail: "店员柜台既是结账位置，也是推荐、预留和交流的中心，让唱片店的社群属性从空间关系中显现出来。"
        }
      },
      module_4: {
        zh: {
          label: "新品上架墙",
          detail: "新品上架墙把最新库存和精选推荐放在高可见位置，引导顾客快速发现新音乐，并形成进入店内后的第一层注意力。"
        }
      },
      module_5: {
        zh: {
          label: "海报展示区",
          detail: "海报展示区通过乐队、演出和专辑视觉强化音乐文化氛围，让空间不仅是销售场所，也像一个可浏览的文化角落。"
        }
      }
    },
    "real-sunny-reading-nook": {
      module_1: {
        zh: {
          label: "扶手椅",
          detail: "扶手椅是阅读角的核心锚点，舒适度、朝向和与光线的关系决定了这个空间是否适合长时间阅读。"
        }
      },
      module_2: {
        zh: {
          label: "书架",
          detail: "书架提供收纳并构成阅读角的背景，让书本、墙面和座椅形成一个完整而安静的使用场景。"
        }
      },
      module_3: {
        zh: {
          label: "落地灯",
          detail: "落地灯补充夜间或阴天阅读光线，避免依赖刺眼的顶灯，使阅读区在不同时间都保持可用。"
        }
      },
      module_4: {
        zh: {
          label: "窗户",
          detail: "窗户提供自然光和外部视线，是阅读角最重要的环境来源，也决定了座椅摆放和白天阅读的舒适度。"
        }
      },
      module_5: {
        zh: {
          label: "茶几",
          detail: "茶几让茶杯、眼镜、便签或当前阅读的书保持在手边，把阅读角从单个座椅扩展成完整的停留区域。"
        }
      }
    }
  };

  function currentLang() {
    if (window.ChatImageI18n && typeof window.ChatImageI18n.getLang === "function") {
      return window.ChatImageI18n.getLang() === "zh" ? "zh" : "en";
    }
    return document.documentElement.lang === "zh-CN" ? "zh" : "en";
  }

  function demoId(demo) {
    return String((demo && (demo.id || demo.slug || demo.demoId)) || "");
  }

  function getHotspotText(demo, hotspot, lang) {
    var id = demoId(demo);
    var key = String((hotspot && (hotspot.id || hotspot.label)) || "");
    var entry = TEXT[id] && TEXT[id][key] && TEXT[id][key][lang || currentLang()];
    return {
      label: String((entry && entry.label) || (hotspot && hotspot.label) || "Untitled region"),
      shortText: String((entry && entry.shortText) || (hotspot && hotspot.shortText) || ""),
      detail: String((entry && entry.detail) || (hotspot && (hotspot.detail || hotspot.shortText)) || "No detail text is available for this region.")
    };
  }

  window.ChatImageDemoLocale = {
    getLang: currentLang,
    getHotspotText: getHotspotText
  };
})();
