package com.mike.discipline.entity;

import lombok.Getter;

/** 3D 世界可建造物目录：用积分购买后放置在星球地表 */
@Getter
public enum WorldItem {

    ROCKS("岩石群", "自然", 30, "几组可攀爬的方块岩石"),
    GARDEN("繁花花园", "自然", 50, "让荒地长出一片彩色花园"),
    CAMP("星空营地", "生活", 80, "篝火、木桩和冒险帐篷"),
    FOREST("橡木森林", "自然", 120, "生成一整片可穿行的方块森林"),
    FOUNTAIN("星辉喷泉", "景观", 150, "会发光的中心喷泉"),
    CRYSTAL("能量水晶", "景观", 150, "夜间仍然闪耀的能量晶簇"),
    PAVILION("东方凉亭", "建筑", 180, "建造一座可进入的东方方亭"),
    LAKE("蓝晶湖泊", "自然", 240, "真正改变地形并生成动态湖水"),
    CABIN("林间木屋", "建筑", 200, "带门窗、烟囱和室内空间的小屋"),
    FARM("自动农场", "建筑", 260, "麦田、水渠、风车组成的农场"),
    LIBRARY("知识图书馆", "建筑", 420, "宏伟的双层图书馆，打卡学习的地标"),
    CASTLE("云顶城堡", "奇观", 800, "塔楼、城墙与旗帜组成的终极建筑");

    private final String title;
    private final String category;
    private final int cost;
    private final String description;

    WorldItem(String title, String category, int cost, String description) {
        this.title = title;
        this.category = category;
        this.cost = cost;
        this.description = description;
    }
}
