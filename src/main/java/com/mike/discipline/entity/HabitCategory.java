package com.mike.discipline.entity;

import lombok.Getter;

/** 习惯分类：决定星球档案里成长为哪种分类建筑 */
@Getter
public enum HabitCategory {

    STUDY("学习", "从书摊到大学城"),
    EXERCISE("运动", "从跑道到体育场"),
    HEALTH("作息", "从篝火到灯塔"),
    CREATE("创作", "从画架到艺术宫"),
    LIFE("生活", "从菜园到游乐园");

    private final String title;
    private final String description;

    HabitCategory(String title, String description) {
        this.title = title;
        this.description = description;
    }
}
