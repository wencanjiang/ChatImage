(function initDemoLocales() {
  "use strict";

  function both(enLabel, enDetail, zhLabel, zhDetail) {
    return {
      en: { label: enLabel, detail: enDetail },
      zh: { label: zhLabel, detail: zhDetail }
    };
  }

  var TEXT = {
    "real-west-lake-tour-map": {
      module_1: both("West Lake Water", "The lake surface is the spatial center of the route, tying islands, bridges, hills, and shoreline gardens into one readable tour map.", "西湖水域", "湖面是整张导览图的空间中心，把岛屿、桥堤、山体和岸线园林组织成一个可读的游览关系。"),
      module_2: both("Bai Causeway and Broken Bridge", "Broken Bridge is handled within the northern Bai Causeway area so the bridge and causeway stay visually connected instead of drifting into separate labels.", "白堤断桥", "断桥被放在白堤北线区域内，桥与堤保持连续关系，避免出现标签和视觉位置脱节。"),
      module_3: both("Su Causeway", "Su Causeway is the north-south green corridor across the western part of West Lake, distinct from the more horizontal Bai Causeway.", "苏堤春晓", "苏堤是西湖西侧纵向贯穿的绿色长堤，与更偏横向的白堤形成清晰区别。"),
      module_4: both("Three Pools Mirroring the Moon", "This island-and-pagoda landmark sits south of the lake center, combining a compact island, water, and three small stone pagodas.", "三潭印月", "三潭印月位于湖心偏南，由小岛、水面和三座石塔构成紧凑而明确的视觉目标。"),
      module_5: both("Leifeng Pagoda", "Leifeng Pagoda anchors the southern lakeshore and gives the map a recognizable vertical landmark.", "雷峰塔", "雷峰塔作为南岸的竖向地标，帮助用户判断方位并识别西湖南线。"),
      module_6: both("Gushan Hill", "Gushan Hill adds a north-shore cultural and topographic anchor near the Bai Causeway route.", "孤山", "孤山为北岸提供文化和地形锚点，也让白堤一线的空间关系更完整。"),
      module_7: both("Baoshi Hill", "Baoshi Hill frames the northern skyline and gives the otherwise flat lake map a mountain backdrop.", "宝石山", "宝石山构成北侧天际线，让平面的湖区导览图有了山体背景和方向感。"),
      module_8: both("Quyuan Lotus Garden", "Quyuan Lotus Garden represents the quieter garden-and-lotus area along the northwestern shore.", "曲院风荷", "曲院风荷代表西北岸更细腻的园林和荷塘体验，区别于开阔湖面。"),
      module_9: both("Orioles Singing in the Willows", "This southeastern shoreline garden emphasizes willow-lined paths and slower near-water walking.", "柳浪闻莺", "柳浪闻莺强调东南岸柳荫步道和近水慢行，是更柔和的岸线区域。")
    },
    "real-healthy-breakfast-options": {
      module_1: both("Breakfast Overview", "The overview compares the breakfast choices as one table scene, helping users scan protein, fiber, satiety, and preparation effort together.", "早餐选择总览", "总览把多种早餐放在同一桌面场景里，方便同时比较蛋白质、纤维、饱腹感和准备成本。"),
      module_2: both("Oatmeal Bowl", "The oatmeal bowl represents a steady-energy breakfast built from grains, fruit, and nuts.", "燕麦碗", "燕麦碗代表由谷物、水果和坚果构成的稳定能量早餐。"),
      module_3: both("Greek Yogurt Cup", "Greek yogurt emphasizes protein with fruit and light preparation, useful for a quick morning routine.", "希腊酸奶杯", "希腊酸奶杯突出蛋白质和水果搭配，适合准备时间较短的早晨。"),
      module_4: both("Whole-grain Sandwich", "The sandwich is a portable choice that combines grains, protein, and vegetables for longer satiety.", "全麦三明治", "全麦三明治便于携带，结合谷物、蛋白质和蔬菜，饱腹时间更长。"),
      module_5: both("Boiled Egg Plate", "The egg plate focuses on compact protein with simple sides.", "水煮蛋拼盘", "水煮蛋拼盘强调小体积高蛋白，并搭配简单配菜。"),
      module_6: both("Fresh Fruit and Black Coffee", "Fruit and coffee form a light option when the user wants freshness and low preparation effort.", "新鲜水果和黑咖啡", "水果和黑咖啡适合想要清爽、低准备成本早餐的场景。")
    },
    "real-boutique-coffee-scene": {
      module_1: both("Barista", "The barista anchors ordering, drink preparation, and customer interaction.", "咖啡师", "咖啡师连接点单、制作和顾客交流，是咖啡店服务流程的中心。"),
      module_2: both("Espresso Machine", "The espresso machine is the production center of the bar and makes the drink workflow visible.", "意式咖啡机", "意式咖啡机是吧台生产中心，让饮品制作流程变得可见。"),
      module_3: both("Pastry Display", "The pastry case supports browsing and add-on choices at the counter.", "甜品柜", "甜品柜支持顾客在柜台前浏览和追加选择。"),
      module_4: both("Window Seating", "Window seats define the slower stay-in experience through light, view, and spacing.", "靠窗座位", "靠窗座位通过光线、视野和间距塑造更适合停留的体验。"),
      module_5: both("Pickup Shelf", "The pickup shelf separates completed drinks from ordering and keeps movement clear.", "取餐架", "取餐架把已完成饮品与点单区分开，让动线更清楚。"),
      module_6: both("Entrance Queue", "The queue shows how visitors enter, wait, and approach the counter during busy periods.", "入口排队区", "入口排队区展示顾客进入、等待和靠近柜台的动线。")
    },
    "real-sunny-reading-nook": {
      module_1: both("Armchair", "The armchair is the comfort anchor; its orientation and distance from light decide whether the nook works for long reading.", "扶手椅", "扶手椅是舒适度锚点，朝向和与光线的距离决定阅读角是否适合长时间使用。"),
      module_2: both("Bookshelf", "The bookshelf provides storage and forms the quiet background of the reading scene.", "书架", "书架提供收纳，并形成阅读角安静的背景。"),
      module_3: both("Floor Lamp", "The floor lamp keeps the nook usable at night or on cloudy days.", "落地灯", "落地灯让阅读角在夜间或阴天仍然可用。"),
      module_4: both("Window", "The window supplies natural light and an outside view, shaping the chair placement.", "窗户", "窗户提供自然光和外部视线，影响座椅摆放。"),
      module_5: both("Side Table with Tea", "The side table keeps tea, glasses, bookmarks, or the current book within reach.", "茶几", "茶几让茶杯、眼镜、书签或当前阅读的书保持在手边。")
    },
    "real-record-store-corner": {
      module_1: both("Listening Station", "The listening station lets customers test records before buying and turns browsing into an experience.", "试听台", "试听台让顾客购买前实际聆听唱片，把浏览变成体验。"),
      module_2: both("Vinyl Bins", "Vinyl bins carry the core search action: flipping, comparing, and discovering records.", "黑胶唱片箱", "黑胶唱片箱承载翻找、比较和发现唱片的核心动作。"),
      module_3: both("Staff Counter", "The counter handles checkout, recommendations, holds, and conversation.", "店员柜台", "店员柜台承担结账、推荐、预留和交流功能。"),
      module_4: both("New Arrivals Wall", "The new-arrivals wall puts fresh stock in a high-visibility place.", "新品墙", "新品墙把最新库存放在高可见位置，引导快速发现。"),
      module_5: both("Poster Display", "Posters reinforce the music culture and make the store feel browsable beyond products.", "海报展示区", "海报强化音乐文化氛围，让空间不只是商品陈列。")
    },
    "real-plant-care-corner": {
      module_1: both("Monstera Plant", "The monstera is the main plant target and shows why light, humidity, and spacing matter.", "龟背竹", "龟背竹是主要植物目标，用来说明光照、湿度和留白对观叶植物护理的重要性。"),
      module_2: both("Watering Can", "The watering can represents the daily care action and controls where water reaches the soil.", "浇水壶", "浇水壶代表日常护理动作，影响水分是否准确到达土壤。"),
      module_3: both("Grow Light", "The grow light compensates for weak indoor light and makes growth conditions more controllable.", "补光灯", "补光灯弥补室内光照不足，让生长条件更可控。"),
      module_4: both("Potting Bench", "The bench concentrates pruning, repotting, soil, and tools into one clean work area.", "换盆工作台", "换盆工作台把修剪、换土和工具收纳集中到一个干净区域。"),
      module_5: both("Humidity Tray", "The humidity tray improves the small microclimate around the plant.", "湿度托盘", "湿度托盘改善植物附近的小环境湿度。")
    },
    "real-poet-comparison-li-bai-shakespeare": {
      module_1: both("Li Bai", "Li Bai is the Tang-dynasty Chinese poet anchor of the comparison, associated here with travel, wine, moonlight, and lyrical imagination.", "李白", "李白是对比中的唐代中国诗人锚点，画面用旅行、酒、月色和抒情想象来组织他的视觉主题。"),
      module_2: both("Moonlit Mountains", "The moonlit landscape points to the nature imagery often used to frame Li Bai's poetic world.", "月下山水", "月下山水对应李白诗歌中常见的自然意象，也让左侧人物与山水空间建立联系。"),
      module_3: both("Wine Cup and Travel Scroll", "The cup and scroll combine two visual motifs: convivial drinking and the roaming scholar-poet persona.", "酒杯与行旅卷轴", "酒杯与卷轴把饮酒意象和行旅诗人形象结合起来，是李白侧的重要可视化线索。"),
      module_4: both("Shakespeare", "Shakespeare is the English poet and playwright anchor, placed with stage and manuscript cues rather than false contact with Li Bai.", "莎士比亚", "莎士比亚是英国诗人与剧作家锚点，画面通过舞台和手稿建立语境，而不虚构他与李白的历史接触。"),
      module_5: both("Theatre and Manuscript", "The theatre and manuscript represent performance, dramatic writing, and the textual basis of Shakespeare's work.", "剧场与手稿", "剧场与手稿代表表演、戏剧写作以及莎士比亚作品的文本基础。"),
      module_6: both("Shared Literary Legacy", "The center bridge frames the comparison as parallel literary influence across different cultures and periods.", "共同文学遗产", "中央连接区域把二者组织为跨文化、跨时代的文学影响对比，而不是人物会面。")
    },
    "real-transformer-development-timeline": {
      module_1: both("2017 Transformer", "The 2017 Transformer milestone marks the attention-based architecture that became the foundation for many later language models.", "2017 Transformer", "2017 年 Transformer 代表以注意力机制为核心的架构起点，成为后续许多语言模型的基础。"),
      module_2: both("2018 GPT", "GPT represents generative pretraining with a Transformer decoder, connecting architecture to language generation.", "2018 GPT", "GPT 代表基于 Transformer 解码器的生成式预训练，把架构能力连接到语言生成。"),
      module_3: both("2018 BERT", "BERT represents bidirectional pretraining for language understanding tasks.", "2018 BERT", "BERT 代表面向语言理解任务的双向预训练路线。"),
      module_4: both("2019 GPT-2", "GPT-2 scaled decoder-only language modeling and made broad zero-shot behavior more visible.", "2019 GPT-2", "GPT-2 扩大了解码器语言模型规模，让更广泛的零样本行为变得可见。"),
      module_5: both("2020 GPT-3", "GPT-3 pushed scaling further and made few-shot prompting a central interaction pattern.", "2020 GPT-3", "GPT-3 进一步推动规模化，并让少样本提示成为重要交互方式。"),
      module_6: both("2022 ChatGPT", "ChatGPT represents the shift toward instruction-following and conversational interactive use.", "2022 ChatGPT", "ChatGPT 代表从模型能力走向指令遵循和对话式交互使用的阶段。")
    },
    "real-zju-yuquan-campus-map": {
      module_1: both("Zheda Road 38 Address Edge", "The address edge gives the guide a stable public-facing reference for Zhejiang University's Yuquan Campus in Xihu District.", "浙大路38号地址边界", "浙大路 38 号地址边界为玉泉校区提供清晰的外部方位参照，帮助访客先确认到达位置。"),
      module_2: both("Campus Main Walk", "The main walk organizes movement inside the illustrative campus map and connects the visible academic, library, and landscape areas.", "校园主路", "校园主路组织示意图内部动线，连接教学、图书馆和景观背景区域。"),
      module_3: both("Engineering Teaching Zone", "This zone represents Yuquan's engineering-oriented academic core.", "工科教学区", "工科教学区代表玉泉校区的学术核心，突出工程教育、实验与课堂活动的校园特征。"),
      module_4: both("Yuquan Library", "The library is presented as a study-oriented campus landmark within the orientation map.", "玉泉图书馆", "玉泉图书馆作为学习导向的校内地标出现，为访客提供清晰的学术目的地参照。"),
      module_5: both("Hangzhou Botanical Garden Edge", "The botanical-garden edge provides nearby orientation context for the surrounding West Lake area.", "杭州植物园相邻边界", "杭州植物园相邻边界用于说明校区周边方位关系，连接玉泉与西湖片区的绿色步行环境。"),
      module_6: both("Laohe Mountain Backdrop", "The mountain backdrop places Yuquan in its hillside landscape setting.", "老和山背景", "老和山背景把校区放回山体环境之中，说明玉泉与周边自然景观的关系。")
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
    var preferredLang = lang || currentLang();
    var group = TEXT[id] && TEXT[id][key];
    var entry = group && (group[preferredLang] || group.en || group.zh);
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
