package com.mike.discipline.entity;

import lombok.Getter;

/** 星球装饰目录：用积分购买后放置在星球表面 */
@Getter
public enum DecorationItem {

    FLOWER("🌸", "花丛", 20, false),
    TREE("🌲", "松树", 30, false),
    LANTERN("🏮", "灯笼", 35, false),
    MUSHROOM("🍄", "蘑菇", 40, false),
    TENT("⛺", "帐篷", 45, false),
    FLAG("🚩", "旗帜", 50, false),
    SNOWMAN("⛄", "雪人", 55, false),
    MOUNTAIN("⛰️", "山峰", 60, false),
    CRYSTAL("💎", "水晶", 100, false),
    FOUNTAIN("⛲", "喷泉", 120, false),
    SATELLITE("🛰️", "人造卫星", 150, true),
    MOON("🌙", "小月亮", 300, true);

    private final String emoji;
    private final String title;
    private final int cost;
    /** true = 环绕星球轨道运行，false = 放置在星球表面 */
    private final boolean orbit;

    DecorationItem(String emoji, String title, int cost, boolean orbit) {
        this.emoji = emoji;
        this.title = title;
        this.cost = cost;
        this.orbit = orbit;
    }
}
