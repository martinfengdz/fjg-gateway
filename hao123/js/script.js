/**
 * 奇易智能导航系统 - 完整版主逻辑脚本
 * 版本: 13.4
 * 作者: 奇易科技
 * 功能: 七行五列布局 + 去图标化 + 完整权限管理 + 精准农历日期 + 问候语功能
 */

// ==================== 全局配置 ====================
const CONFIG = {
    VERSION: '13.4',
    DEFAULT_PASSWORD: 'admin123',
    LINKS_PER_PAGE: 35,
    SEARCH_ENGINES: {
        'baidu': {
            name: '百度',
            url: 'https://www.baidu.com/s?wd=',
            icon: '🔍'
        },
        'google': {
            name: '谷歌',
            url: 'https://www.google.com/search?q=',
            icon: '🌐'
        },
        'bing': {
            name: '必应',
            url: 'https://www.bing.com/search?q=',
            icon: '🔎'
        },
        '360': {
            name: '360搜索',
            url: 'https://www.so.com/s?q=',
            icon: '🔍'
        }
    },
    QUICK_SEARCHES: [
        { text: '天气预报', type: 'weather' },
        { text: '今日新闻', type: 'news' },
        { text: '股票行情', type: 'stock' },
        { text: '汇率换算', type: 'currency' },
        { text: '快递查询', type: 'express' },
        { text: '地图导航', type: 'map' }
    ],
    CATEGORIES: {
        'recommended': { name: '推荐网址', icon: 'fas fa-star' },
        'proxy': { name: '代理系统', icon: 'fas fa-server' },
        'internal': { name: '内部系统', icon: 'fas fa-building' },
        'software': { name: '软件工具', icon: 'fas fa-laptop' },
        'business': { name: '在线业务', icon: 'fas fa-briefcase' },
        'common': { name: '常用网址', icon: 'fas fa-globe' },
        'finance': { name: '财务理财', icon: 'fas fa-chart-line' },
        'work': { name: '工作工具', icon: 'fas fa-tools' },
        'side': { name: 'AI工具', icon: 'fas fa-robot' }
    }
};

// ==================== 应用状态管理 ====================
const APP_STATE = {
    hasPermission: false,
    permissionTimeout: null,
    PERMISSION_DURATION: 30 * 60 * 1000,
    currentTab: 'recommended',
    currentPage: 1,
    totalPages: 1,
    linksPerPage: CONFIG.LINKS_PER_PAGE,
    currentSearchEngine: 'baidu',
    searchHistory: [],
    MAX_SEARCH_HISTORY: 20,
    darkMode: false,
    linkData: {},
    filteredLinks: [],
    visitCount: 0,
    todayVisits: 0,
    lastVisitDate: null,
    editingLink: null,
    batchMode: false,
    selectedLinks: new Set(),
    menuVisible: false,
    greetingTimeout: null
};

// ==================== 农历计算工具函数 ====================

/**
 * 精准农历计算工具类
 * 使用2026年精确农历数据，确保农历日期准确
 */
class LunarCalendar {
    // 2026年（丙午马年）农历数据 - 修正版
    static lunar2026Data = {
        // 2026年（丙午马年）完整农历数据 - 精确天文计算
        // 格式: 'MM-DD': {month: 农历月, day: 农历日}
        '01-01': {month: 11, day: 13}, '01-02': {month: 11, day: 14}, '01-03': {month: 11, day: 15},
        '01-04': {month: 11, day: 16}, '01-05': {month: 11, day: 17}, '01-06': {month: 11, day: 18},
        '01-07': {month: 11, day: 19}, '01-08': {month: 11, day: 20}, '01-09': {month: 11, day: 21},
        '01-10': {month: 11, day: 22}, '01-11': {month: 11, day: 23}, '01-12': {month: 11, day: 24},
        '01-13': {month: 11, day: 25}, '01-14': {month: 11, day: 26}, '01-15': {month: 11, day: 27},
        '01-16': {month: 11, day: 28}, '01-17': {month: 11, day: 29}, '01-18': {month: 11, day: 30},
        '01-19': {month: 12, day: 1}, '01-20': {month: 12, day: 2}, '01-21': {month: 12, day: 3},
        '01-22': {month: 12, day: 4}, '01-23': {month: 12, day: 5}, '01-24': {month: 12, day: 6},
        '01-25': {month: 12, day: 7}, '01-26': {month: 12, day: 8}, '01-27': {month: 12, day: 9},
        '01-28': {month: 12, day: 10}, '01-29': {month: 12, day: 11}, '01-30': {month: 12, day: 12},
        '01-31': {month: 12, day: 13}, '02-01': {month: 12, day: 14}, '02-02': {month: 12, day: 15},
        '02-03': {month: 12, day: 16}, '02-04': {month: 12, day: 17}, '02-05': {month: 12, day: 18},
        '02-06': {month: 12, day: 19}, '02-07': {month: 12, day: 20}, '02-08': {month: 12, day: 21},
        '02-09': {month: 12, day: 22}, '02-10': {month: 12, day: 23}, '02-11': {month: 12, day: 24},
        '02-12': {month: 12, day: 25}, '02-13': {month: 12, day: 26}, '02-14': {month: 12, day: 27},
        '02-15': {month: 12, day: 28}, '02-16': {month: 12, day: 29}, '02-17': {month: 1, day: 1},
        '02-18': {month: 1, day: 2}, '02-19': {month: 1, day: 3}, '02-20': {month: 1, day: 4},
        '02-21': {month: 1, day: 5}, '02-22': {month: 1, day: 6}, '02-23': {month: 1, day: 7},
        '02-24': {month: 1, day: 8}, '02-25': {month: 1, day: 9}, '02-26': {month: 1, day: 10},
        '02-27': {month: 1, day: 11}, '02-28': {month: 1, day: 12}, '03-01': {month: 1, day: 13},
        '03-02': {month: 1, day: 14}, '03-03': {month: 1, day: 15}, '03-04': {month: 1, day: 16},
        '03-05': {month: 1, day: 17}, '03-06': {month: 1, day: 18}, '03-07': {month: 1, day: 19},
        '03-08': {month: 1, day: 20}, '03-09': {month: 1, day: 21}, '03-10': {month: 1, day: 22},
        '03-11': {month: 1, day: 23}, '03-12': {month: 1, day: 24}, '03-13': {month: 1, day: 25},
        '03-14': {month: 1, day: 26}, '03-15': {month: 1, day: 27}, '03-16': {month: 1, day: 28},
        '03-17': {month: 1, day: 29}, '03-18': {month: 1, day: 30}, '03-19': {month: 2, day: 1},
        '03-20': {month: 2, day: 2}, '03-21': {month: 2, day: 3}, '03-22': {month: 2, day: 4},
        '03-23': {month: 2, day: 5}, '03-24': {month: 2, day: 6}, '03-25': {month: 2, day: 7},
        '03-26': {month: 2, day: 8}, '03-27': {month: 2, day: 9}, '03-28': {month: 2, day: 10},
        '03-29': {month: 2, day: 11}, '03-30': {month: 2, day: 12}, '03-31': {month: 2, day: 13},
        '04-01': {month: 2, day: 14}, '04-02': {month: 2, day: 15}, '04-03': {month: 2, day: 16},
        '04-04': {month: 2, day: 17}, '04-05': {month: 2, day: 18}, '04-06': {month: 2, day: 19},
        '04-07': {month: 2, day: 20}, '04-08': {month: 2, day: 21}, '04-09': {month: 2, day: 22},
        '04-10': {month: 2, day: 23}, '04-11': {month: 2, day: 24}, '04-12': {month: 2, day: 25},
        '04-13': {month: 2, day: 26}, '04-14': {month: 2, day: 27}, '04-15': {month: 2, day: 28},
        '04-16': {month: 2, day: 29}, '04-17': {month: 3, day: 1}, '04-18': {month: 3, day: 2},
        '04-19': {month: 3, day: 3}, '04-20': {month: 3, day: 4}, '04-21': {month: 3, day: 5},
        '04-22': {month: 3, day: 6}, '04-23': {month: 3, day: 7}, '04-24': {month: 3, day: 8},
        '04-25': {month: 3, day: 9}, '04-26': {month: 3, day: 10}, '04-27': {month: 3, day: 11},
        '04-28': {month: 3, day: 12}, '04-29': {month: 3, day: 13}, '04-30': {month: 3, day: 14},
        '05-01': {month: 3, day: 15}, '05-02': {month: 3, day: 16}, '05-03': {month: 3, day: 17},
        '05-04': {month: 3, day: 18}, '05-05': {month: 3, day: 19}, '05-06': {month: 3, day: 20},
        '05-07': {month: 3, day: 21}, '05-08': {month: 3, day: 22}, '05-09': {month: 3, day: 23},
        '05-10': {month: 3, day: 24}, '05-11': {month: 3, day: 25}, '05-12': {month: 3, day: 26},
        '05-13': {month: 3, day: 27}, '05-14': {month: 3, day: 28}, '05-15': {month: 3, day: 29},
        '05-16': {month: 3, day: 30}, '05-17': {month: 4, day: 1}, '05-18': {month: 4, day: 2},
        '05-19': {month: 4, day: 3}, '05-20': {month: 4, day: 4}, '05-21': {month: 4, day: 5},
        '05-22': {month: 4, day: 6}, '05-23': {month: 4, day: 7}, '05-24': {month: 4, day: 8},
        '05-25': {month: 4, day: 9}, '05-26': {month: 4, day: 10}, '05-27': {month: 4, day: 11},
        '05-28': {month: 4, day: 12}, '05-29': {month: 4, day: 13}, '05-30': {month: 4, day: 14},
        '05-31': {month: 4, day: 15}, '06-01': {month: 4, day: 16}, '06-02': {month: 4, day: 17},
        '06-03': {month: 4, day: 18}, '06-04': {month: 4, day: 19}, '06-05': {month: 4, day: 20},
        '06-06': {month: 4, day: 21}, '06-07': {month: 4, day: 22}, '06-08': {month: 4, day: 23},
        '06-09': {month: 4, day: 24}, '06-10': {month: 4, day: 25}, '06-11': {month: 4, day: 26},
        '06-12': {month: 4, day: 27}, '06-13': {month: 4, day: 28}, '06-14': {month: 4, day: 29},
        '06-15': {month: 5, day: 1}, '06-16': {month: 5, day: 2}, '06-17': {month: 5, day: 3},
        '06-18': {month: 5, day: 4}, '06-19': {month: 5, day: 5}, '06-20': {month: 5, day: 6},
        '06-21': {month: 5, day: 7}, '06-22': {month: 5, day: 8}, '06-23': {month: 5, day: 9},
        '06-24': {month: 5, day: 10}, '06-25': {month: 5, day: 11}, '06-26': {month: 5, day: 12},
        '06-27': {month: 5, day: 13}, '06-28': {month: 5, day: 14}, '06-29': {month: 5, day: 15},
        '06-30': {month: 5, day: 16}, '07-01': {month: 5, day: 17}, '07-02': {month: 5, day: 18},
        '07-03': {month: 5, day: 19}, '07-04': {month: 5, day: 20}, '07-05': {month: 5, day: 21},
        '07-06': {month: 5, day: 22}, '07-07': {month: 5, day: 23}, '07-08': {month: 5, day: 24},
        '07-09': {month: 5, day: 25}, '07-10': {month: 5, day: 26}, '07-11': {month: 5, day: 27},
        '07-12': {month: 5, day: 28}, '07-13': {month: 5, day: 29}, '07-14': {month: 6, day: 1},
        '07-15': {month: 6, day: 2}, '07-16': {month: 6, day: 3}, '07-17': {month: 6, day: 4},
        '07-18': {month: 6, day: 5}, '07-19': {month: 6, day: 6}, '07-20': {month: 6, day: 7},
        '07-21': {month: 6, day: 8}, '07-22': {month: 6, day: 9}, '07-23': {month: 6, day: 10},
        '07-24': {month: 6, day: 11}, '07-25': {month: 6, day: 12}, '07-26': {month: 6, day: 13},
        '07-27': {month: 6, day: 14}, '07-28': {month: 6, day: 15}, '07-29': {month: 6, day: 16},
        '07-30': {month: 6, day: 17}, '07-31': {month: 6, day: 18}, '08-01': {month: 6, day: 19},
        '08-02': {month: 6, day: 20}, '08-03': {month: 6, day: 21}, '08-04': {month: 6, day: 22},
        '08-05': {month: 6, day: 23}, '08-06': {month: 6, day: 24}, '08-07': {month: 6, day: 25},
        '08-08': {month: 6, day: 26}, '08-09': {month: 6, day: 27}, '08-10': {month: 6, day: 28},
        '08-11': {month: 6, day: 29}, '08-12': {month: 6, day: 30}, '08-13': {month: 7, day: 1},
        '08-14': {month: 7, day: 2}, '08-15': {month: 7, day: 3}, '08-16': {month: 7, day: 4},
        '08-17': {month: 7, day: 5}, '08-18': {month: 7, day: 6}, '08-19': {month: 7, day: 7},
        '08-20': {month: 7, day: 8}, '08-21': {month: 7, day: 9}, '08-22': {month: 7, day: 10},
        '08-23': {month: 7, day: 11}, '08-24': {month: 7, day: 12}, '08-25': {month: 7, day: 13},
        '08-26': {month: 7, day: 14}, '08-27': {month: 7, day: 15}, '08-28': {month: 7, day: 16},
        '08-29': {month: 7, day: 17}, '08-30': {month: 7, day: 18}, '08-31': {month: 7, day: 19},
        '09-01': {month: 7, day: 20}, '09-02': {month: 7, day: 21}, '09-03': {month: 7, day: 22},
        '09-04': {month: 7, day: 23}, '09-05': {month: 7, day: 24}, '09-06': {month: 7, day: 25},
        '09-07': {month: 7, day: 26}, '09-08': {month: 7, day: 27}, '09-09': {month: 7, day: 28},
        '09-10': {month: 7, day: 29}, '09-11': {month: 8, day: 1}, '09-12': {month: 8, day: 2},
        '09-13': {month: 8, day: 3}, '09-14': {month: 8, day: 4}, '09-15': {month: 8, day: 5},
        '09-16': {month: 8, day: 6}, '09-17': {month: 8, day: 7}, '09-18': {month: 8, day: 8},
        '09-19': {month: 8, day: 9}, '09-20': {month: 8, day: 10}, '09-21': {month: 8, day: 11},
        '09-22': {month: 8, day: 12}, '09-23': {month: 8, day: 13}, '09-24': {month: 8, day: 14},
        '09-25': {month: 8, day: 15}, '09-26': {month: 8, day: 16}, '09-27': {month: 8, day: 17},
        '09-28': {month: 8, day: 18}, '09-29': {month: 8, day: 19}, '09-30': {month: 8, day: 20},
        '10-01': {month: 8, day: 21}, '10-02': {month: 8, day: 22}, '10-03': {month: 8, day: 23},
        '10-04': {month: 8, day: 24}, '10-05': {month: 8, day: 25}, '10-06': {month: 8, day: 26},
        '10-07': {month: 8, day: 27}, '10-08': {month: 8, day: 28}, '10-09': {month: 8, day: 29},
        '10-10': {month: 9, day: 1}, '10-11': {month: 9, day: 2}, '10-12': {month: 9, day: 3},
        '10-13': {month: 9, day: 4}, '10-14': {month: 9, day: 5}, '10-15': {month: 9, day: 6},
        '10-16': {month: 9, day: 7}, '10-17': {month: 9, day: 8}, '10-18': {month: 9, day: 9},
        '10-19': {month: 9, day: 10}, '10-20': {month: 9, day: 11}, '10-21': {month: 9, day: 12},
        '10-22': {month: 9, day: 13}, '10-23': {month: 9, day: 14}, '10-24': {month: 9, day: 15},
        '10-25': {month: 9, day: 16}, '10-26': {month: 9, day: 17}, '10-27': {month: 9, day: 18},
        '10-28': {month: 9, day: 19}, '10-29': {month: 9, day: 20}, '10-30': {month: 9, day: 21},
        '10-31': {month: 9, day: 22}, '11-01': {month: 9, day: 23}, '11-02': {month: 9, day: 24},
        '11-03': {month: 9, day: 25}, '11-04': {month: 9, day: 26}, '11-05': {month: 9, day: 27},
        '11-06': {month: 9, day: 28}, '11-07': {month: 9, day: 29}, '11-08': {month: 9, day: 30},
        '11-09': {month: 10, day: 1}, '11-10': {month: 10, day: 2}, '11-11': {month: 10, day: 3},
        '11-12': {month: 10, day: 4}, '11-13': {month: 10, day: 5}, '11-14': {month: 10, day: 6},
        '11-15': {month: 10, day: 7}, '11-16': {month: 10, day: 8}, '11-17': {month: 10, day: 9},
        '11-18': {month: 10, day: 10}, '11-19': {month: 10, day: 11}, '11-20': {month: 10, day: 12},
        '11-21': {month: 10, day: 13}, '11-22': {month: 10, day: 14}, '11-23': {month: 10, day: 15},
        '11-24': {month: 10, day: 16}, '11-25': {month: 10, day: 17}, '11-26': {month: 10, day: 18},
        '11-27': {month: 10, day: 19}, '11-28': {month: 10, day: 20}, '11-29': {month: 10, day: 21},
        '11-30': {month: 10, day: 22}, '12-01': {month: 10, day: 23}, '12-02': {month: 10, day: 24},
        '12-03': {month: 10, day: 25}, '12-04': {month: 10, day: 26}, '12-05': {month: 10, day: 27},
        '12-06': {month: 10, day: 28}, '12-07': {month: 10, day: 29}, '12-08': {month: 10, day: 30},
        '12-09': {month: 11, day: 1}, '12-10': {month: 11, day: 2}, '12-11': {month: 11, day: 3},
        '12-12': {month: 11, day: 4}, '12-13': {month: 11, day: 5}, '12-14': {month: 11, day: 6},
        '12-15': {month: 11, day: 7}, '12-16': {month: 11, day: 8}, '12-17': {month: 11, day: 9},
        '12-18': {month: 11, day: 10}, '12-19': {month: 11, day: 11}, '12-20': {month: 11, day: 12},
        '12-21': {month: 11, day: 13}, '12-22': {month: 11, day: 14}, '12-23': {month: 11, day: 15},
        '12-24': {month: 11, day: 16}, '12-25': {month: 11, day: 17}, '12-26': {month: 11, day: 18},
        '12-27': {month: 11, day: 19}, '12-28': {month: 11, day: 20}, '12-29': {month: 11, day: 21},
        '12-30': {month: 11, day: 22}, '12-31': {month: 11, day: 23},
    };

    // 天干
    static heavenlyStems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];

    // 地支
    static earthlyBranches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

    // 生肖
    static zodiacAnimals = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];

    // 月份名称
    static lunarMonths = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];

    // 日期名称
    static lunarDays = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
                       "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
                       "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

    /**
     * 获取今天的农历日期（2026年准确版）
     */
    static getTodayLunarDate(date = new Date()) {
        try {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();

            // 生成日期键
            const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // 计算天干地支（2026年是丙午年，马年）
            // 天干计算：(year - 4) % 10
            // 地支计算：(year - 4) % 12
            const stemIndex = (year - 4) % 10;
            const branchIndex = (year - 4) % 12;
            const heavenlyStem = this.heavenlyStems[stemIndex];
            const earthlyBranch = this.earthlyBranches[branchIndex];
            const zodiac = this.zodiacAnimals[branchIndex];

            // 查找农历日期
            let lunarMonth = 1;
            let lunarDay = 1;

            if (this.lunar2026Data[dateKey]) {
                // 有精确数据
                lunarMonth = this.lunar2026Data[dateKey].month;
                lunarDay = this.lunar2026Data[dateKey].day;
            } else {
                // 没有精确数据，使用估算算法
                // 2026年春节是2月17日
                const springFestival = new Date(2026, 1, 17); // 2月17日
                const today = new Date(year, month - 1, day);
                const diffDays = Math.floor((today - springFestival) / (1000 * 60 * 60 * 24));

                if (diffDays >= 0) {
                    // 春节后
                    lunarMonth = 1 + Math.floor(diffDays / 30);
                    lunarDay = 1 + (diffDays % 30);
                } else {
                    // 春节前（属于上一年农历腊月）
                    lunarMonth = 12;
                    lunarDay = 30 + diffDays;
                }

                // 边界处理
                if (lunarMonth < 1) lunarMonth = 1;
                if (lunarMonth > 12) lunarMonth = 12;
                if (lunarDay < 1) lunarDay = 1;
                if (lunarDay > 30) {
                    lunarMonth += 1;
                    lunarDay -= 30;
                }
            }

            const lunarMonthName = this.lunarMonths[lunarMonth - 1] || "正月";
            const lunarDayName = this.lunarDays[lunarDay - 1] || "初一";

            return {
                year: year,
                month: lunarMonth,
                day: lunarDay,
                heavenlyStem: heavenlyStem,
                earthlyBranch: earthlyBranch,
                zodiac: zodiac,
                lunarMonthName: lunarMonthName,
                lunarDayName: lunarDayName,
                fullName: `${heavenlyStem}${earthlyBranch}年 ${zodiac}年 ${lunarMonthName}${lunarDayName}`
            };
        } catch (error) {
            console.error('计算农历日期失败:', error);
            return null;
        }
    }

    /**
     * 获取农历日期字符串
     */
    static getLunarDateString(date = new Date()) {
        try {
            const lunar = this.getTodayLunarDate(date);
            if (!lunar) {
                return "农历日期获取失败";
            }

            // 获取节气信息
            const month = date.getMonth() + 1;
            const day = date.getDate();
            let solarTerm = '';
            
            // 24节气检查
            if (month === 2 && day === 4) solarTerm = ' (立春)';
            else if (month === 2 && day === 19) solarTerm = ' (雨水)';
            else if (month === 3 && day === 5) solarTerm = ' (惊蛰)';
            else if (month === 3 && day === 20) solarTerm = ' (春分)';
            else if (month === 4 && day === 4) solarTerm = ' (清明)';
            else if (month === 4 && day === 20) solarTerm = ' (谷雨)';

            return `${lunar.heavenlyStem}${lunar.earthlyBranch}年 ${lunar.zodiac}年 ${lunar.lunarMonthName}${lunar.lunarDayName}${solarTerm}`;
        } catch (error) {
            console.error('计算农历日期失败:', error);
            return "农历日期计算中...";
        }
    }

    /**
     * 检查是否是周末
     */
    static isWeekend(date = new Date()) {
        const day = date.getDay();
        return day === 0 || day === 6;  // 0是周日，6是周六
    }

    /**
     * 检查是否是农历节日
     */
    static checkLunarFestival(lunarMonth, lunarDay) {
        // 农历节日对照表
        const festivals = {
            '1-1': '春节',
            '1-15': '元宵节',
            '2-2': '龙抬头',
            '5-5': '端午节',
            '7-7': '七夕',
            '7-15': '中元节',
            '8-15': '中秋节',
            '9-9': '重阳节',
            '12-8': '腊八节',
            '12-23': '小年',
            '12-30': '除夕'
        };

        const key = `${lunarMonth}-${lunarDay}`;
        return festivals[key] || null;
    }
}

// ==================== 问候语功能 ====================

/**
 * 获取时间段问候语
 */
function getTimeBasedGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[now.getDay()];

    let greeting = '';

    if (hour >= 5 && hour < 8) {
        greeting = '清晨好！🌅 新的一天开始了，愿您有个美好的开始！';
    } else if (hour >= 8 && hour < 12) {
        greeting = '上午好！☀️ 祝您工作顺利，精神饱满！';
    } else if (hour >= 12 && hour < 14) {
        greeting = '中午好！🍚 用餐愉快，记得休息片刻哦！';
    } else if (hour >= 14 && hour < 18) {
        greeting = '下午好！🌤️ 保持专注，高效工作！';
    } else if (hour >= 18 && hour < 22) {
        greeting = '晚上好！🌙 放松一下，享受夜晚时光！';
    } else if (hour >= 22 || hour < 5) {
        greeting = '深夜好！🌃 夜深了，注意休息，晚安！';
    }

    // 添加特殊日期问候
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const lunarInfo = LunarCalendar.getTodayLunarDate(now);

    if (lunarInfo) {
        const festival = LunarCalendar.checkLunarFestival(lunarInfo.month, lunarInfo.day);
        if (festival) {
            greeting = `${festival}快乐！🎉 ${greeting}`;
        }
    }

    // 周末特殊问候
    if (hour >= 8 && (now.getDay() === 0 || now.getDay() === 6)) {
        greeting = '周末愉快！🎈 ' + (greeting || '放松心情，享受美好时光！');
    }

    return greeting || `您好！今天是周${weekday}，祝您使用愉快！`;
}

/**
 * 显示问候语
 */
function showGreeting() {
    const greetingContainer = document.getElementById('greeting-container');
    const greetingText = document.getElementById('greeting-text');

    if (!greetingContainer || !greetingText) return;

    const greeting = getTimeBasedGreeting();
    greetingText.textContent = greeting;

    // 显示问候语
    greetingContainer.classList.remove('hidden');

    // 清除之前的定时器
    if (APP_STATE.greetingTimeout) {
        clearTimeout(APP_STATE.greetingTimeout);
    }

    // 30秒后自动隐藏
    APP_STATE.greetingTimeout = setTimeout(() => {
        hideGreeting();
    }, 30000); // 30秒

    // 保存显示状态
    localStorage.setItem('qiyiGreetingShown', new Date().toDateString());
    logActivity('显示问候语', 'info');
}

/**
 * 隐藏问候语
 */
function hideGreeting() {
    const greetingContainer = document.getElementById('greeting-container');
    if (greetingContainer) {
        greetingContainer.classList.add('hidden');
        logActivity('问候语已隐藏', 'info');
    }
}

/**
 * 初始化问候语
 */
function initGreeting() {
    // 检查今天是否已经显示过问候语
    const lastShown = localStorage.getItem('qiyiGreetingShown');
    const today = new Date().toDateString();

    // 如果今天已经显示过，就不再自动显示
    if (lastShown === today) {
        return;
    }

    // 等待页面加载完成后再显示问候语
    setTimeout(() => {
        showGreeting();
    }, 1500); // 延迟1.5秒显示，让用户先看到页面
}

/**
 * 问候语事件监听
 */
function initGreetingEvents() {
    // 关闭问候语按钮
    const closeBtn = document.getElementById('close-greeting');
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            hideGreeting();
            showNotification('问候语已关闭，明天会再次显示', 'info');

            // 标记为今天已关闭
            localStorage.setItem('qiyiGreetingShown', new Date().toDateString());
        });
    }

    // 鼠标悬停时停止自动隐藏
    const greetingContainer = document.getElementById('greeting-container');
    if (greetingContainer) {
        let hideTimeout;

        greetingContainer.addEventListener('mouseenter', function() {
            // 清除自动隐藏的定时器
            if (APP_STATE.greetingTimeout) {
                clearTimeout(APP_STATE.greetingTimeout);
                APP_STATE.greetingTimeout = null;
            }
        });

        greetingContainer.addEventListener('mouseleave', function() {
            // 重新设置30秒后隐藏
            if (!greetingContainer.classList.contains('hidden')) {
                APP_STATE.greetingTimeout = setTimeout(() => {
                    hideGreeting();
                }, 30000);
            }
        });
    }

    // 主题切换时保持问候语可见性
    const themeBtn = document.getElementById('toggle-theme');
    if (themeBtn) {
        const originalClick = themeBtn.onclick;
        themeBtn.onclick = function() {
            if (typeof originalClick === 'function') {
                originalClick();
            }

            // 主题切换后，如果问候语是显示的，短暂显示一下确保样式正确
            const greetingContainer = document.getElementById('greeting-container');
            if (greetingContainer && !greetingContainer.classList.contains('hidden')) {
                greetingContainer.style.opacity = '0';
                setTimeout(() => {
                    greetingContainer.style.opacity = '1';
                }, 100);
            }
        };
    }
}

/**
 * 手动显示问候语（可以绑定到某个按钮）
 */
function showGreetingManually() {
    showGreeting();
    showNotification('问候语已显示', 'success');
}

// ==================== 工具函数 ====================

/**
 * 显示通知消息
 */
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');

    if (!notification || !notificationText) {
        console.error('通知组件未找到');
        return;
    }

    notificationText.textContent = message;

    ['success', 'error', 'warning', 'info'].forEach(t => {
        notification.classList.remove(t);
    });

    notification.classList.add(type);
    notification.classList.add('show');

    logActivity(`通知: ${message}`, type);

    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

/**
 * 防抖函数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 格式化时间
 */
function formatTime(date = new Date(), format = 'full') {
    const now = date;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

    if (format === 'full') {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const weekday = weekdays[now.getDay()];

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} 周${weekday}`;
    } else if (format === 'date') {
        return now.toLocaleDateString('zh-CN');
    } else if (format === 'time') {
        return now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } else if (format === 'relative') {
        const diff = Date.now() - now.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;
        return formatTime(now, 'date');
    }

    return now.toLocaleString('zh-CN');
}

/**
 * 验证URL格式
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// ==================== 农历日期功能 ====================

/**
 * 更新农历日期显示
 */
function updateLunarDate() {
    try {
        const lunarElement = document.getElementById('lunar-date');
        if (!lunarElement) return;

        const now = new Date();
        const lunarDateStr = LunarCalendar.getLunarDateString(now);
        lunarElement.textContent = lunarDateStr;

        // 根据星期几设置不同样式
        const isWeekend = LunarCalendar.isWeekend(now);
        const hour = now.getHours();

        // 周末添加特殊类名
        if (isWeekend) {
            lunarElement.classList.add('weekend');
        } else {
            lunarElement.classList.remove('weekend');
        }

        // 根据时间段调整样式
        if (hour >= 18 || hour < 6) {
            // 晚上时间，降低透明度
            lunarElement.style.opacity = '0.7';
        } else {
            lunarElement.style.opacity = '0.9';
        }

        // 农历特殊节日标记
        const lunarInfo = LunarCalendar.getTodayLunarDate(now);
        if (lunarInfo) {
            // 检查是否是农历节日
            const festival = LunarCalendar.checkLunarFestival(lunarInfo.month, lunarInfo.day);
            if (festival) {
                lunarElement.style.fontWeight = '600';
                lunarElement.style.color = APP_STATE.darkMode ? '#ff9d76' : '#e74c3c';
                lunarElement.title = `今天是${festival}`;
            } else {
                lunarElement.style.fontWeight = '500';
                lunarElement.title = '';
            }
        }

    } catch (error) {
        console.error('更新农历日期失败:', error);
        const lunarElement = document.getElementById('lunar-date');
        if (lunarElement) {
            lunarElement.textContent = "农历日期获取中...";
            lunarElement.style.color = APP_STATE.darkMode ? '#a0aec0' : '#666';
            lunarElement.classList.remove('weekend');
        }
    }
}

// ==================== 时间管理 ====================

/**
 * 更新时间和日期显示
 */
function updateTimeDisplay() {
    const now = new Date();

    // 更新当前时间（公历）
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = formatTime(now, 'full');

        // 根据时间段调整公历日期颜色
        const hour = now.getHours();
        if (hour >= 18 || hour < 6) {
            timeElement.style.opacity = '0.9';
        } else {
            timeElement.style.opacity = '1';
        }
    }

    // 更新农历日期
    updateLunarDate();

    // 更新年份
    const yearElements = document.querySelectorAll('#current-year, #current-year-footer');
    yearElements.forEach(el => {
        if (el) el.textContent = now.getFullYear();
    });

    // 更新最后更新时间
    const lastUpdatedElement = document.getElementById('last-updated-time');
    if (lastUpdatedElement) {
        lastUpdatedElement.textContent = formatTime(now, 'time');
    }
}

// ==================== 数据管理 ====================

/**
 * 从本地存储加载所有数据
 */
function loadAllDataFromStorage() {
    APP_STATE.linkData = loadLinkData();

    const savedTheme = localStorage.getItem('qiyiTheme');
    if (savedTheme === 'dark') {
        APP_STATE.darkMode = true;
        document.body.classList.add('dark-mode');
        updateThemeButton();
    }

    loadVisitStats();

    const savedSearchHistory = localStorage.getItem('qiyiSearchHistory');
    if (savedSearchHistory) {
        try {
            APP_STATE.searchHistory = JSON.parse(savedSearchHistory).slice(0, APP_STATE.MAX_SEARCH_HISTORY);
        } catch (e) {
            console.error('加载搜索历史失败:', e);
        }
    }

    const savedLinksPerPage = localStorage.getItem('qiyiLinksPerPage');
    if (savedLinksPerPage) {
        APP_STATE.linksPerPage = parseInt(savedLinksPerPage) || CONFIG.LINKS_PER_PAGE;
    }
}

/**
 * 加载链接数据
 */
function loadLinkData() {
    const defaultData = window.getDefaultLinkData ? window.getDefaultLinkData() : {};

    try {
        const savedData = localStorage.getItem('qiyiTechLinkData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);

            for (const category in parsedData) {
                if (defaultData[category]) {
                    const existingUrls = new Set(defaultData[category].map(item => item.url));
                    const customItems = parsedData[category].filter(item => !existingUrls.has(item.url));

                    defaultData[category] = [...customItems, ...defaultData[category]];
                } else {
                    defaultData[category] = parsedData[category];
                }
            }
        }
    } catch (e) {
        console.error('加载保存的数据失败:', e);
        showNotification('加载数据失败，使用默认数据', 'warning');
    }

    return defaultData;
}

/**
 * 保存数据到本地存储
 */
function saveDataToStorage() {
    try {
        const customData = {};
        for (const category in APP_STATE.linkData) {
            customData[category] = APP_STATE.linkData[category];
        }

        localStorage.setItem('qiyiTechLinkData', JSON.stringify(customData));
        logActivity('数据保存成功', 'success');
        return true;
    } catch (e) {
        console.error('保存数据失败:', e);
        showNotification('保存数据失败，存储空间可能已满', 'error');
        return false;
    }
}

/**
 * 保存主题设置
 */
function saveThemeSetting() {
    localStorage.setItem('qiyiTheme', APP_STATE.darkMode ? 'dark' : 'light');
}

/**
 * 保存搜索历史
 */
function saveSearchHistory() {
    localStorage.setItem('qiyiSearchHistory', JSON.stringify(APP_STATE.searchHistory.slice(0, APP_STATE.MAX_SEARCH_HISTORY)));
}

// ==================== 主题控制 ====================

/**
 * 切换主题模式
 */
function toggleTheme() {
    APP_STATE.darkMode = !APP_STATE.darkMode;

    if (APP_STATE.darkMode) {
        document.body.classList.add('dark-mode');
        showNotification('已切换为暗色主题', 'info');
        logActivity('切换到暗色主题', 'info');
    } else {
        document.body.classList.remove('dark-mode');
        showNotification('已切换为亮色主题', 'info');
        logActivity('切换到亮色主题', 'info');
    }

    updateThemeButton();
    saveThemeSetting();
}

/**
 * 更新主题按钮图标
 */
function updateThemeButton() {
    const themeBtn = document.getElementById('toggle-theme');
    const floatingThemeBtn = document.getElementById('floating-theme');

    if (themeBtn) {
        const icon = themeBtn.querySelector('i');
        if (APP_STATE.darkMode) {
            icon.className = 'fas fa-sun';
            themeBtn.title = '切换为亮色主题';
        } else {
            icon.className = 'fas fa-moon';
            themeBtn.title = '切换为暗色主题';
        }
    }

    if (floatingThemeBtn) {
        const icon = floatingThemeBtn.querySelector('i');
        if (APP_STATE.darkMode) {
            icon.className = 'fas fa-sun';
            floatingThemeBtn.title = '切换为亮色主题';
        } else {
            icon.className = 'fas fa-moon';
            floatingThemeBtn.title = '切换为暗色主题';
        }
    }
}

// ==================== 访问统计 ====================

/**
 * 加载访问统计
 */
function loadVisitStats() {
    const stats = JSON.parse(localStorage.getItem('qiyiVisitStats') || '{}');
    const today = formatTime(new Date(), 'date');

    if (!stats.totalVisits) stats.totalVisits = 0;
    if (!stats.todayVisits) stats.todayVisits = 0;
    if (!stats.lastVisit) stats.lastVisit = today;
    if (!stats.visitDates) stats.visitDates = {};

    if (stats.lastVisit !== today) {
        stats.todayVisits = 0;
        stats.lastVisit = today;
    }

    stats.totalVisits++;
    stats.todayVisits++;

    if (!stats.visitDates[today]) {
        stats.visitDates[today] = 0;
    }
    stats.visitDates[today]++;

    localStorage.setItem('qiyiVisitStats', JSON.stringify(stats));

    APP_STATE.visitCount = stats.totalVisits;
    APP_STATE.todayVisits = stats.todayVisits;
    APP_STATE.lastVisitDate = today;

    updateStatsDisplay();

    logActivity(`访问计数: 总${stats.totalVisits}次, 今日${stats.todayVisits}次`, 'info');
}

/**
 * 更新统计显示
 */
function updateStatsDisplay() {
    const visitCountElement = document.getElementById('visit-count');
    if (visitCountElement) {
        visitCountElement.textContent = `访问: ${APP_STATE.visitCount}`;
    }
}

/**
 * 记录活动日志
 */
function logActivity(text, type = 'info') {
    const activities = JSON.parse(localStorage.getItem('qiyiActivities') || '[]');

    activities.unshift({
        id: Date.now().toString(),
        text: text,
        type: type,
        time: new Date().toISOString(),
        timestamp: Date.now()
    });

    if (activities.length > 50) {
        activities.length = 50;
    }

    localStorage.setItem('qiyiActivities', JSON.stringify(activities));
}

// ==================== 权限管理 ====================

/**
 * 从存储中获取管理密码
 */
function getPasswordFromStorage() {
    return localStorage.getItem('qiyiTechAdminPassword') || CONFIG.DEFAULT_PASSWORD;
}

/**
 * 保存密码到存储
 */
function setPasswordToStorage(password) {
    localStorage.setItem('qiyiTechAdminPassword', password);
}

/**
 * 检查权限密码
 */
function checkPermission(password) {
    return password === getPasswordFromStorage();
}

/**
 * 授予管理权限
 */
function grantPermission() {
    APP_STATE.hasPermission = true;
    updatePermissionUI();

    if (APP_STATE.permissionTimeout) {
        clearTimeout(APP_STATE.permissionTimeout);
    }
    APP_STATE.permissionTimeout = setTimeout(() => {
        APP_STATE.hasPermission = false;
        updatePermissionUI();
        showNotification('管理权限已过期，请重新验证', 'warning');
        logActivity('管理权限已过期', 'warning');
    }, APP_STATE.PERMISSION_DURATION);

    logActivity('管理权限已解锁', 'success');
}

/**
 * 撤销管理权限
 */
function revokePermission() {
    APP_STATE.hasPermission = false;
    updatePermissionUI();

    if (APP_STATE.permissionTimeout) {
        clearTimeout(APP_STATE.permissionTimeout);
        APP_STATE.permissionTimeout = null;
    }

    logActivity('管理权限已锁定', 'info');
}

/**
 * 更新权限UI状态
 */
function updatePermissionUI() {
    const addLinkBtn = document.getElementById('add-link-btn-bottom');
    if (addLinkBtn) {
        if (APP_STATE.hasPermission) {
            addLinkBtn.disabled = false;
            addLinkBtn.title = '添加网址';
        } else {
            addLinkBtn.disabled = true;
            addLinkBtn.title = '需要管理权限';
        }
    }

    const adminBtn = document.getElementById('admin-management');
    if (adminBtn) {
        const icon = adminBtn.querySelector('i');
        if (APP_STATE.hasPermission) {
            icon.className = 'fas fa-user-shield';
            adminBtn.title = '管理面板 (已授权)';
        } else {
            icon.className = 'fas fa-cogs';
            adminBtn.title = '管理面板 (需要授权)';
        }
    }
}

/**
 * 需要权限检查
 */
function requirePermission(callback) {
    if (APP_STATE.hasPermission) {
        callback();
    } else {
        showNotification('需要管理权限才能执行此操作', 'warning');
        const modal = document.getElementById('permission-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.dataset.callback = callback.toString();
        }
        logActivity('请求管理权限', 'info');
    }
}

// ==================== 链接管理 ====================

/**
 * 加载标签数据
 */
function loadTabData(tabName, page = 1) {
    const container = document.getElementById(`${tabName}-links`);
    if (!container || !APP_STATE.linkData[tabName]) return;

    let links = APP_STATE.linkData[tabName];
    const searchQuery = document.getElementById('search-links-input')?.value.trim();

    if (searchQuery) {
        links = links.filter(link => {
            return link.name.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }

    APP_STATE.filteredLinks = links;
    APP_STATE.currentPage = page;
    APP_STATE.totalPages = Math.max(1, Math.ceil(links.length / APP_STATE.linksPerPage));

    const startIndex = (page - 1) * APP_STATE.linksPerPage;
    const endIndex = startIndex + APP_STATE.linksPerPage;
    const pageLinks = links.slice(startIndex, endIndex);

    container.innerHTML = '';

    if (pageLinks.length === 0) {
        container.innerHTML = `
            <div class="no-links-message">
                <i class="fas fa-inbox"></i>
                <p>${searchQuery ? '没有找到匹配的链接' : '此分类暂无链接'}</p>
                ${searchQuery ? '<p>尝试其他搜索词或<a href="#" class="clear-search">清除搜索</a></p>' : ''}
            </div>
        `;

        if (searchQuery) {
            const clearSearchBtn = container.querySelector('.clear-search');
            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    document.getElementById('search-links-input').value = '';
                    loadTabData(tabName, 1);
                });
            }
        }

        updateLinksCount(0);
        updatePagination();
        return;
    }

    const fragment = document.createDocumentFragment();

    pageLinks.forEach((link, index) => {
        const linkItem = createLinkElement(link, tabName, startIndex + index);
        fragment.appendChild(linkItem);
    });

    container.appendChild(fragment);

    updateLinksCount(links.length);
    updatePagination();
}

/**
 * 创建链接元素
 */
function createLinkElement(link, category, index) {
    const linkItem = document.createElement('div');
    linkItem.className = `link-item ${link.class || ''}`;
    linkItem.title = `${link.name}\n${link.url}`;
    linkItem.dataset.id = link.id || `link_${Date.now()}_${index}`;

    const actionsHtml = APP_STATE.hasPermission ? 
        `<div class="link-actions">
            <button class="btn btn-small btn-secondary edit-link" 
                    data-category="${category}" data-index="${index}" 
                    title="编辑链接">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-small btn-danger delete-link" 
                    data-category="${category}" data-index="${index}"
                    title="删除链接">
                <i class="fas fa-trash"></i>
            </button>
        </div>` : '';

    linkItem.innerHTML = `
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-main">
            <span class="link-name">${link.name}</span>
        </a>
        ${actionsHtml}
    `;

    const linkAnchor = linkItem.querySelector('.link-main');
    if (linkAnchor) {
        linkAnchor.addEventListener('click', function() {
            logActivity(`访问链接: ${link.name}`, 'info');
        });
    }

    if (APP_STATE.hasPermission) {
        const editBtn = linkItem.querySelector('.edit-link');
        const deleteBtn = linkItem.querySelector('.delete-link');

        if (editBtn) {
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const category = this.dataset.category;
                const index = parseInt(this.dataset.index);
                editLink(category, index);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const category = this.dataset.category;
                const index = parseInt(this.dataset.index);
                deleteLink(category, index);
            });
        }
    }

    return linkItem;
}

/**
 * 更新链接计数显示
 */
function updateLinksCount(count) {
    const countElement = document.getElementById('links-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

/**
 * 更新分页显示
 */
function updatePagination() {
    const currentPageElement = document.getElementById('current-page');
    const totalPagesElement = document.getElementById('total-pages');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');

    if (currentPageElement) {
        currentPageElement.textContent = APP_STATE.currentPage;
    }

    if (totalPagesElement) {
        totalPagesElement.textContent = APP_STATE.totalPages;
    }

    if (prevPageBtn) {
        prevPageBtn.disabled = APP_STATE.currentPage <= 1;
    }

    if (nextPageBtn) {
        nextPageBtn.disabled = APP_STATE.currentPage >= APP_STATE.totalPages;
    }
}

/**
 * 添加新链接
 */
function addLink(category, name, url, colorClass = '', favicon = '') {
    if (!APP_STATE.linkData[category]) {
        APP_STATE.linkData[category] = [];
    }

    const exists = APP_STATE.linkData[category].some(link => 
        link.url === url
    );

    if (exists) {
        showNotification('链接已存在，请勿重复添加', 'warning');
        return false;
    }

    const newLink = {
        id: `new_${Date.now()}`,
        name: name,
        url: url,
        class: colorClass || '',
        favicon: favicon || '',
        createdAt: new Date().toISOString(),
        visitCount: 0
    };

    APP_STATE.linkData[category].unshift(newLink);

    if (saveDataToStorage()) {
        if (APP_STATE.currentTab === category) {
            loadTabData(category, 1);
        }
        showNotification('网址添加成功！', 'success');
        logActivity(`添加链接: ${name}`, 'success');
        return true;
    }

    return false;
}

/**
 * 编辑链接
 */
function editLink(category, index) {
    const links = APP_STATE.linkData[category];
    if (!links || !links[index]) return;

    const link = links[index];

    document.getElementById('modal-action').textContent = '编辑';
    document.getElementById('link-index').value = index;
    document.getElementById('link-original-category').value = category;
    document.getElementById('link-name').value = link.name;
    document.getElementById('link-url').value = link.url;
    document.getElementById('link-category').value = category;
    document.getElementById('link-color').value = link.class || '';
    document.getElementById('link-favicon').value = link.favicon || '';

    document.getElementById('link-modal').style.display = 'flex';
}

/**
 * 删除链接
 */
function deleteLink(category, index) {
    if (confirm('确定要删除这个网址吗？此操作不可撤销。')) {
        APP_STATE.linkData[category].splice(index, 1);

        if (saveDataToStorage()) {
            const currentPage = APP_STATE.currentPage;
            const links = APP_STATE.linkData[category];
            const totalPages = Math.max(1, Math.ceil(links.length / APP_STATE.linksPerPage));

            const newPage = currentPage > totalPages ? totalPages : currentPage;

            loadTabData(category, newPage);
            showNotification('网址删除成功！', 'success');
            logActivity(`删除链接: ${category}分类中的链接`, 'warning');
        }
    }
}

/**
 * 保存链接
 */
function saveLink(event) {
    event.preventDefault();

    const name = document.getElementById('link-name').value.trim();
    const url = document.getElementById('link-url').value.trim();
    const category = document.getElementById('link-category').value;
    const color = document.getElementById('link-color').value;
    const favicon = document.getElementById('link-favicon').value.trim();
    const indexValue = document.getElementById('link-index').value;
    const originalCategory = document.getElementById('link-original-category').value;

    if (!name || !url) {
        showNotification('请填写完整的链接信息', 'warning');
        return;
    }

    if (!isValidUrl(url) && !url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('请输入有效的网址（以http://或https://开头）', 'warning');
        return;
    }

    const fullUrl = isValidUrl(url) ? url : 
                   (url.startsWith('http') ? url : `https://${url}`);

    if (indexValue !== '') {
        const index = parseInt(indexValue);

        const originalLinks = APP_STATE.linkData[originalCategory];
        if (!originalLinks || !originalLinks[index]) {
            showNotification('链接不存在', 'error');
            return;
        }

        const link = originalLinks[index];

        link.name = name;
        link.url = fullUrl;
        link.class = color;
        link.favicon = favicon;

        if (originalCategory !== category) {
            originalLinks.splice(index, 1);

            if (!APP_STATE.linkData[category]) {
                APP_STATE.linkData[category] = [];
            }
            APP_STATE.linkData[category].unshift(link);

            loadTabData(originalCategory, 1);
            loadTabData(category, 1);
        } else {
            loadTabData(category, APP_STATE.currentPage);
        }

        saveDataToStorage();
        showNotification('网址更新成功！', 'success');
        logActivity(`更新链接: ${name}`, 'success');
    } else {
        if (addLink(category, name, fullUrl, color, favicon)) {
            document.getElementById('link-name').value = '';
            document.getElementById('link-url').value = '';
            document.getElementById('link-favicon').value = '';
            document.getElementById('link-color').value = '';
        }
    }

    document.getElementById('link-modal').style.display = 'none';
}

// ==================== 搜索功能 ====================

/**
 * 执行搜索
 */
function performSearch() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput.value.trim();

    if (!searchTerm || searchTerm === '请输入搜索关键词...') {
        showNotification('请输入搜索关键词', 'warning');
        searchInput.focus();
        return;
    }

    const selectedEngine = document.querySelector('input[name="search-engine"]:checked');
    const engine = selectedEngine ? selectedEngine.value : 'baidu';

    let searchUrl = '';
    const encodedTerm = encodeURIComponent(searchTerm);

    if (CONFIG.SEARCH_ENGINES[engine]) {
        searchUrl = CONFIG.SEARCH_ENGINES[engine].url + encodedTerm;
    } else {
        searchUrl = CONFIG.SEARCH_ENGINES.baidu.url + encodedTerm;
    }

    window.open(searchUrl, '_blank');

    APP_STATE.searchHistory.unshift({
        term: searchTerm,
        engine: engine,
        time: new Date().toISOString()
    });

    if (APP_STATE.searchHistory.length > APP_STATE.MAX_SEARCH_HISTORY) {
        APP_STATE.searchHistory.length = APP_STATE.MAX_SEARCH_HISTORY;
    }

    saveSearchHistory();

    showNotification(`正在搜索: ${searchTerm} (${CONFIG.SEARCH_ENGINES[engine].name})`, 'success');
    logActivity(`搜索: ${searchTerm} (${CONFIG.SEARCH_ENGINES[engine].name})`, 'info');
}

/**
 * 初始化搜索建议
 */
function initSearchSuggestions() {
    const container = document.getElementById('search-quick-links');
    if (!container) return;

    container.innerHTML = '';

    CONFIG.QUICK_SEARCHES.forEach(item => {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'search-quick-link';
        link.textContent = item.text;
        link.dataset.type = item.type;

        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('search-input').value = item.text;
            performSearch();
        });

        container.appendChild(link);
    });
}

// ==================== 浮动菜单功能 ====================

/**
 * 初始化浮动菜单
 */
function initFloatingMenu() {
    const menuBtn = document.getElementById('floating-menu');
    const menuPanel = document.getElementById('floating-menu-panel');

    if (!menuBtn || !menuPanel) return;

    menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        APP_STATE.menuVisible = !APP_STATE.menuVisible;

        if (APP_STATE.menuVisible) {
            menuPanel.classList.add('show');
        } else {
            menuPanel.classList.remove('show');
        }
    });

    document.addEventListener('click', function(e) {
        if (APP_STATE.menuVisible && 
            !menuPanel.contains(e.target) && 
            !menuBtn.contains(e.target)) {
            APP_STATE.menuVisible = false;
            menuPanel.classList.remove('show');
        }
    });

    document.getElementById('menu-export-data')?.addEventListener('click', function() {
        exportData();
        closeFloatingMenu();
    });

    document.getElementById('menu-clear-cache')?.addEventListener('click', function() {
        clearCache();
        closeFloatingMenu();
    });

    document.getElementById('menu-show-stats')?.addEventListener('click', function() {
        showStatistics();
        closeFloatingMenu();
    });

    document.getElementById('menu-admin-management')?.addEventListener('click', function() {
        document.getElementById('admin-management')?.click();
        closeFloatingMenu();
    });

    document.getElementById('menu-edit-mode')?.addEventListener('click', function() {
        toggleEditMode();
        closeFloatingMenu();
    });

    document.getElementById('menu-batch-delete')?.addEventListener('click', function() {
        startBatchDelete();
        closeFloatingMenu();
    });

    document.getElementById('menu-show-greeting')?.addEventListener('click', function() {
        showGreetingManually();
        closeFloatingMenu();
    });
}

/**
 * 关闭浮动菜单
 */
function closeFloatingMenu() {
    APP_STATE.menuVisible = false;
    document.getElementById('floating-menu-panel')?.classList.remove('show');
}

// ==================== 事件绑定和初始化 ====================

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    console.log('开始初始化事件监听器...');

    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });

    document.getElementById('search-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        performSearch();
    });

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('focus', function() {
            this.classList.add('focused');
        });

        searchInput.addEventListener('blur', function() {
            this.classList.remove('focused');
        });

        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        });
    }

    document.getElementById('search-links-input')?.addEventListener('input', debounce(function() {
        loadTabData(APP_STATE.currentTab, 1);
    }, 300));

    document.getElementById('prev-page')?.addEventListener('click', function() {
        if (!this.disabled) {
            loadTabData(APP_STATE.currentTab, APP_STATE.currentPage - 1);
        }
    });

    document.getElementById('next-page')?.addEventListener('click', function() {
        if (!this.disabled) {
            loadTabData(APP_STATE.currentTab, APP_STATE.currentPage + 1);
        }
    });

    document.getElementById('toggle-theme')?.addEventListener('click', toggleTheme);
    document.getElementById('floating-theme')?.addEventListener('click', toggleTheme);

    document.getElementById('add-link-btn-bottom')?.addEventListener('click', function() {
        requirePermission(() => {
            document.getElementById('modal-action').textContent = '添加';
            document.getElementById('link-index').value = '';
            document.getElementById('link-original-category').value = APP_STATE.currentTab;
            document.getElementById('link-name').value = '';
            document.getElementById('link-url').value = '';
            document.getElementById('link-favicon').value = '';
            document.getElementById('link-category').value = APP_STATE.currentTab;
            document.getElementById('link-color').value = '';

            document.getElementById('link-modal').style.display = 'flex';
        });
    });

    document.getElementById('floating-add')?.addEventListener('click', function() {
        document.getElementById('add-link-btn-bottom').click();
    });

    document.getElementById('modal-close')?.addEventListener('click', function() {
        document.getElementById('link-modal').style.display = 'none';
    });

    document.getElementById('cancel-btn')?.addEventListener('click', function() {
        document.getElementById('link-modal').style.display = 'none';
    });

    document.getElementById('link-form')?.addEventListener('submit', saveLink);

    document.getElementById('permission-modal-close')?.addEventListener('click', function() {
        document.getElementById('permission-modal').style.display = 'none';
    });

    document.getElementById('cancel-permission')?.addEventListener('click', function() {
        document.getElementById('permission-modal').style.display = 'none';
    });

    document.getElementById('confirm-permission')?.addEventListener('click', function() {
        const password = document.getElementById('permission-password').value;

        if (checkPermission(password)) {
            grantPermission();
            document.getElementById('permission-modal').style.display = 'none';
            document.getElementById('permission-password').value = '';

            const callbackStr = document.getElementById('permission-modal').dataset.callback;
            if (callbackStr && callbackStr !== 'undefined') {
                try {
                    const callback = eval('(' + callbackStr + ')');
                    if (typeof callback === 'function') {
                        callback();
                    }
                } catch (e) {
                    console.error('执行回调函数失败:', e);
                }
            }

            showNotification('管理权限验证成功！', 'success');
        } else {
            showNotification('密码错误，请重试', 'error');
            document.getElementById('permission-password').focus();
            document.getElementById('permission-password').select();
        }
    });

    document.getElementById('notification-close')?.addEventListener('click', function() {
        document.getElementById('notification').classList.remove('show');
    });

    document.getElementById('floating-top')?.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    document.getElementById('refresh-page')?.addEventListener('click', function() {
        location.reload();
    });

    document.getElementById('set-homepage')?.addEventListener('click', function() {
        if (confirm('是否将此页面设为浏览器主页？')) {
            try {
                if (window.external && ('AddFavorite' in window.external)) {
                    window.external.AddFavorite(location.href, document.title);
                }
                showNotification('请手动在浏览器设置中设置为主页', 'info');
            } catch (e) {
                showNotification('设置为主页功能需要浏览器支持', 'warning');
            }
        }
    });

    document.getElementById('sort-links')?.addEventListener('click', function() {
        const category = APP_STATE.currentTab;
        const links = APP_STATE.linkData[category];

        if (links && links.length > 0) {
            links.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            saveDataToStorage();
            loadTabData(category, 1);
            showNotification('已按名称排序', 'success');
        }
    });

    document.getElementById('admin-management')?.addEventListener('click', function() {
        requirePermission(() => {
            showNotification('管理面板功能开发中', 'info');
        });
    });

    console.log('基本事件监听器初始化完成');
}

/**
 * 切换标签页
 */
function switchTab(tabName) {
    console.log(`切换标签页到: ${tabName}`);

    APP_STATE.currentTab = tabName;

    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    const addBtn = document.getElementById('add-link-btn-bottom');
    if (addBtn) {
        addBtn.dataset.tab = tabName;
    }

    document.querySelectorAll('.links-grid').forEach(container => {
        container.style.display = 'none';
    });

    const currentContainer = document.getElementById(`${tabName}-links`);
    if (currentContainer) {
        currentContainer.style.display = 'grid';
    }

    loadTabData(tabName, 1);

    logActivity(`切换到分类: ${CONFIG.CATEGORIES[tabName]?.name || tabName}`, 'info');
}

// ==================== 其他功能 ====================

/**
 * 导出数据
 */
function exportData() {
    const data = {
        version: CONFIG.VERSION,
        exportDate: new Date().toISOString(),
        categories: CONFIG.CATEGORIES,
        linkData: APP_STATE.linkData,
        settings: {
            darkMode: APP_STATE.darkMode,
            linksPerPage: APP_STATE.linksPerPage
        }
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `奇易导航_备份_${new Date().toISOString().slice(0, 10)}.json`;
    const linkElement = document.createElement('a');

    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showNotification('数据导出成功', 'success');
    logActivity('导出完整数据', 'success');
}

/**
 * 清除缓存
 */
function clearCache() {
    if (confirm('确定要清除所有缓存数据吗？此操作不可撤销。')) {
        localStorage.removeItem('qiyiTechLinkData');
        localStorage.removeItem('qiyiSearchHistory');
        localStorage.removeItem('qiyiVisitStats');
        localStorage.removeItem('qiyiActivities');

        location.reload();

        showNotification('缓存已清除，重新加载页面', 'success');
    }
}

/**
 * 显示统计信息
 */
function showStatistics() {
    const totalLinks = Object.values(APP_STATE.linkData).reduce((sum, links) => sum + links.length, 0);

    showNotification(`总链接数: ${totalLinks}, 今日访问: ${APP_STATE.todayVisits}`, 'info');
}

/**
 * 切换编辑模式
 */
function toggleEditMode() {
    if (!APP_STATE.hasPermission) {
        showNotification('需要管理权限才能进入编辑模式', 'warning');
        return;
    }

    showNotification('编辑模式功能开发中', 'info');
}

/**
 * 开始批量删除
 */
function startBatchDelete() {
    if (!APP_STATE.hasPermission) {
        showNotification('需要管理权限才能进行批量删除', 'warning');
        return;
    }

    showNotification('批量删除功能开发中', 'info');
}

// ==================== 应用初始化 ====================

/**
 * 主初始化函数
 */
function init() {
    console.log('正在初始化奇易智能导航系统...');

    loadAllDataFromStorage();

    // 初始化时间显示
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);

    // 初始化农历日期
    updateLunarDate();
    setInterval(updateLunarDate, 60000); // 每分钟更新一次

    // 初始化问候语
    initGreeting();
    initGreetingEvents();

    // 更新问候语中的日期信息（每小时更新一次）
    setInterval(() => {
        const greetingText = document.getElementById('greeting-text');
        if (greetingText && document.getElementById('greeting-container')?.classList.contains('hidden')) {
            // 如果问候语是隐藏的，更新但不显示
            return;
        }

        const hour = new Date().getHours();
        const greeting = getTimeBasedGreeting();
        if (greetingText && greeting) {
            greetingText.textContent = greeting;
        }
    }, 3600000); // 每小时更新一次

    initSearchSuggestions();
    initSearchAutocomplete();

    initEventListeners();

    initFloatingMenu();

    loadTabData('recommended', 1);

    updatePermissionUI();

    // 显示欢迎消息和系统信息
    setTimeout(() => {
        console.log('系统初始化完成');
        logActivity('系统启动成功', 'success');

        // 显示系统信息（延迟显示，避免与问候语冲突）
        setTimeout(() => {
            const now = new Date();
            const lunarInfo = LunarCalendar.getTodayLunarDate(now);
            const isWeekend = LunarCalendar.isWeekend(now);
            const festival = lunarInfo ? LunarCalendar.checkLunarFestival(lunarInfo.month, lunarInfo.day) : null;

            let welcomeMsg = `奇易智能导航系统 ${CONFIG.VERSION} 已就绪`;
            if (festival) {
                welcomeMsg += `，今天是${festival}`;
            } else if (isWeekend) {
                welcomeMsg += '，周末愉快！';
            }

            showNotification(welcomeMsg, 'success', 3000);
        }, 1000);
    }, 500);
}

// ==================== 搜索框自动提示功能 ====================

/**
 * 构建全局搜索索引（从所有分类的链接数据中提取）
 */
function buildSearchIndex() {
    const index = [];
    const data = APP_STATE.linkData;
    if (!data || typeof data !== 'object') return index;

    const catNames = CONFIG.CATEGORIES;
    const seen = new Set(); // 去重
    for (const [catKey, links] of Object.entries(data)) {
        if (!Array.isArray(links)) continue;
        const catName = catNames[catKey]?.name || catKey;
        links.forEach(link => {
            if (link && link.name) {
                const key = link.name + '|' + (link.url || '');
                if (seen.has(key)) return;
                seen.add(key);
                index.push({
                    name: link.name,
                    url: link.url || '',
                    category: catName,
                    catKey: catKey
                });
            }
        });
    }
    return index;
}

let _searchIndex = null;
function getSearchIndex() {
    if (!_searchIndex || _searchIndex.length === 0) _searchIndex = buildSearchIndex();
    return _searchIndex;
}

/** 刷新搜索索引（管理员增删改链接后调用） */
function refreshSearchIndex() {
    _searchIndex = null;
}

let _suggestionSelectedIndex = -1;
let _suggestionDebounceTimer = null;

/**
 * 显示搜索建议下拉框
 */
function showSuggestions(query) {
    const dropdown = document.getElementById('search-suggestions');
    if (!dropdown) return;

    const q = (query || '').trim();
    if (q.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    const ql = q.toLowerCase();
    const index = getSearchIndex();

    const matches = [];
    // 精确前缀优先，其次包含
    for (const item of index) {
        const nameL = item.name.toLowerCase();
        if (nameL.startsWith(ql)) {
            matches.push(item);
        }
    }
    for (const item of index) {
        const nameL = item.name.toLowerCase();
        if (nameL.includes(ql) && !nameL.startsWith(ql)) {
            matches.push(item);
        }
    }

    const results = matches.slice(0, 12);

    if (results.length === 0) {
        dropdown.innerHTML = '<div class="suggestion-empty">💡 未找到匹配的网址，按回车使用搜索引擎搜索</div>';
        dropdown.style.display = 'block';
        _suggestionSelectedIndex = -1;
        return;
    }

    _suggestionSelectedIndex = -1;
    const escaped = ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('(' + escaped + ')', 'gi');

    let html = '';
    for (const item of results) {
        const nameHtml = item.name.replace(pattern, '<span class="suggestion-highlight">$1</span>');
        html += `<div class="suggestion-item" data-url="${item.url.replace(/"/g, '&quot;')}" data-name="${item.name.replace(/"/g, '&quot;')}">
            <span class="suggestion-icon">🔗</span>
            <span class="suggestion-name">${nameHtml}</span>
            <span class="suggestion-category">${item.category}</span>
        </div>`;
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    // 用事件委托代替逐个绑定（先移除旧的再绑定，避免重复）
    dropdown.removeEventListener('click', dropdown._suggestionClickHandler);
    dropdown._suggestionClickHandler = function onSuggestionClick(e) {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        const name = item.dataset.name;
        const url = item.dataset.url;
        const input = document.getElementById('search-input');
        if (input) {
            input.value = name;
            dropdown.style.display = 'none';
            if (url) window.open(url, '_blank');
        }
    };
    dropdown.addEventListener('click', dropdown._suggestionClickHandler);
}

/**
 * 处理建议下拉框的键盘导航
 */
function handleSuggestionsKeydown(e) {
    const dropdown = document.getElementById('search-suggestions');
    if (!dropdown || dropdown.style.display === 'none' || dropdown.style.display === '') return;

    const items = dropdown.querySelectorAll('.suggestion-item:not(.suggestion-empty)');
    if (items.length === 0) {
        // 没有可选项时，Enter 走默认搜索
        if (e.key === 'Enter') {
            dropdown.style.display = 'none';
        }
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _suggestionSelectedIndex = (_suggestionSelectedIndex + 1) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _suggestionSelectedIndex = (_suggestionSelectedIndex - 1 + items.length) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'Enter' && _suggestionSelectedIndex >= 0) {
        e.preventDefault();
        items[_suggestionSelectedIndex].click();
    } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        _suggestionSelectedIndex = -1;
    }
}

function updateActiveSuggestion(items) {
    items.forEach((el, idx) => {
        el.classList.toggle('active', idx === _suggestionSelectedIndex);
        if (idx === _suggestionSelectedIndex) {
            el.scrollIntoView({ block: 'nearest' });
        }
    });
}

/**
 * 初始化搜索框自动提示
 */
function initSearchAutocomplete() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-suggestions');
    if (!input || !dropdown) return;

    refreshSearchIndex();

    // 输入防抖：避免频繁重建
    input.addEventListener('input', function() {
        if (_suggestionDebounceTimer) clearTimeout(_suggestionDebounceTimer);
        _suggestionDebounceTimer = setTimeout(() => {
            showSuggestions(this.value);
        }, 80);
    });

    // 键盘导航
    input.addEventListener('keydown', handleSuggestionsKeydown);

    // 点击外部关闭下拉
    document.addEventListener('click', function(e) {
        if (dropdown.style.display !== 'none' &&
            !input.contains(e.target) &&
            !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            _suggestionSelectedIndex = -1;
        }
    });

    // 获取焦点时有关键词则显示
    input.addEventListener('focus', function() {
        if (this.value.trim().length > 0) {
            showSuggestions(this.value);
        }
    });

    // 表单提交前关闭下拉
    document.getElementById('search-form')?.addEventListener('submit', function() {
        dropdown.style.display = 'none';
    });
}

// ==================== 无痕模式（退出时自动清理浏览数据） ====================

/** 保存链接数据（确保自定义链接不丢失） */
function saveLinkData() {
    if (APP_STATE.linkData && typeof APP_STATE.linkData === 'object') {
        try {
            localStorage.setItem('qiyiTechLinkData', JSON.stringify(APP_STATE.linkData));
            localStorage.setItem('qiyiTheme', APP_STATE.darkMode ? 'dark' : 'light');
        } catch (e) {
            console.warn('保存链接数据失败:', e);
        }
    }
}

/** 清理非必要的浏览数据，保留链接数据和主题设置 */
function clearBrowsingData() {
    // 先保存链接数据（确保用户增删的网址不丢）
    saveLinkData();

    // 清理浏览痕迹
    const keysToRemove = [
        'qiyiGreetingShown',
        'qiyiSearchHistory',
        'qiyiLinksPerPage',
        'qiyiVisitStats',
        'qiyiLastTab'
    ];
    keysToRemove.forEach(key => {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    });

    console.log('🔒 无痕清理完成：浏览痕迹已清除，链接数据已保留');
}

// 页面关闭/刷新时自动清理
window.addEventListener('beforeunload', function() {
    clearBrowsingData();
});

// 用户离开页面（切换标签/关闭标签）时也清理
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        // 延迟一点保存，确保当前状态被记录
        saveLinkData();
    }
});

// ==================== 启动应用 ====================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.addEventListener('error', function(e) {
    console.error('全局错误:', e.error);
    showNotification(`系统错误: ${e.message}`, 'error');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('未处理的Promise错误:', e.reason);
    showNotification('发生未预期的错误', 'error');
});