package com.mike.discipline.entity;

import lombok.Getter;

/**
 * 3D 世界可建造物目录：用积分购买后放置在星球地表。
 *
 * 「从荒原到盖亚」——目录按星球演化史组织成七个纪元（epoch 0..6）：
 *   0 洪荒纪（荒芜星球，始终解锁）→ 1 大气纪 → 2 海洋纪 → 3 生命纪
 *   → 4 绿色纪 → 5 动物纪 → 6 文明纪
 *
 * keystone=true 的「里程碑工程」每种只能建一座，建成后永久改变全球环境
 * 并解锁下一纪元；普通摆件可重复建造，且可用积分逐级升级（1..maxLevel），
 * 升到 L+1 级花费 cost × L。
 */
@Getter
public enum WorldItem {

    /* ---- 0 · 洪荒纪：荒芜星球 ---- */
    CRATER("环形山群", "洪荒纪", 20, "在荒原上砸出一圈崭新的撞击坑", 0, false, 3),
    ROCKS("嶙峋荒岩", "洪荒纪", 30, "几组嶙峋的荒原巨岩", 0, false, 3),
    ROVER("星面探测车", "洪荒纪", 60, "孤独巡视荒原的六轮探测车", 0, false, 3),
    CRYSTAL("能量水晶", "洪荒纪", 150, "深埋荒原的晶簇，夜间仍然闪耀", 0, false, 3),

    /* ---- 1 · 大气纪 ---- */
    ATMOSPHERE("盖亚大气机", "大气纪", 300, "启动后天空第一次泛起蓝色，云与风开始流动", 1, true, 1),

    /* ---- 2 · 海洋纪 ---- */
    COMET("引水彗星核", "海洋纪", 500, "牵引一颗彗星坠落，为星球带来第一场雨", 2, true, 1),
    SPRING("云雾温泉", "海洋纪", 150, "蒸汽袅袅的火山温泉池", 2, false, 3),
    LAKE("蓝晶湖泊", "海洋纪", 240, "真正改变地形并生成动态湖水", 2, false, 3),

    /* ---- 3 · 生命纪 ---- */
    SOUP("原初生命池", "生命纪", 800, "翻涌的原始汤，水边开始泛起第一抹藻绿", 3, true, 1),
    STROMA("叠层石群", "生命纪", 90, "最古老的生命痕迹，一层层缓慢生长", 3, false, 3),
    MUSHROOM("荧光蘑菇林", "生命纪", 120, "夜里发光的巨型菌类聚落", 3, false, 3),

    /* ---- 4 · 绿色纪 ---- */
    SEEDVAULT("万物种子库", "绿色纪", 1200, "开启后草原蔓延全球，森林随星球成长愈发茂密", 4, true, 1),
    GARDEN("繁花花园", "绿色纪", 50, "让土地长出一片彩色花园", 4, false, 3),
    FOREST("橡木森林", "绿色纪", 120, "生成一整片可穿行的方块森林", 4, false, 3),
    FOUNTAIN("星辉喷泉", "绿色纪", 150, "会发光的中心喷泉", 4, false, 3),

    /* ---- 5 · 动物纪 ---- */
    ARK("生命方舟", "动物纪", 1600, "方舟落成，飞鸟、游鱼与小兽从此栖息于这颗星球", 5, true, 1),
    FIREFLY("萤火之丘", "动物纪", 130, "暮色中飞舞着点点萤光的小丘", 5, false, 3),

    /* ---- 6 · 文明纪 ---- */
    CAMP("星空营地", "文明纪", 80, "篝火、木桩和冒险帐篷", 6, false, 3),
    PAVILION("东方凉亭", "文明纪", 180, "建造一座可进入的东方方亭", 6, false, 3),
    CABIN("林间木屋", "文明纪", 200, "带门窗、烟囱和室内空间的小屋", 6, false, 3),
    FARM("自动农场", "文明纪", 260, "麦田、水渠、风车组成的农场", 6, false, 3),
    LIBRARY("知识图书馆", "文明纪", 420, "宏伟的双层图书馆，打卡学习的地标", 6, false, 3),
    OBSERVATORY("星海天文台", "文明纪", 500, "银色穹顶缓缓开启，望远镜指向深空", 6, false, 3),
    CASTLE("云顶城堡", "文明纪", 800, "塔楼、城墙与旗帜组成的终极建筑", 6, false, 3);

    private final String title;
    private final String category;
    private final int cost;
    private final String description;
    /** 所属纪元 0..6 */
    private final int epoch;
    /** 是否里程碑工程（唯一、不可升级、解锁下一纪元） */
    private final boolean keystone;
    /** 摆件最高等级；里程碑固定为 1 */
    private final int maxLevel;

    WorldItem(String title, String category, int cost, String description,
              int epoch, boolean keystone, int maxLevel) {
        this.title = title;
        this.category = category;
        this.cost = cost;
        this.description = description;
        this.epoch = epoch;
        this.keystone = keystone;
        this.maxLevel = maxLevel;
    }

    /** 从 level 升到 level+1 的积分花费 */
    public int upgradeCost(int level) {
        return cost * Math.max(1, level);
    }
}
