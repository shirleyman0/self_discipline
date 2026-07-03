package com.mike.discipline.entity;

import lombok.Getter;

/** 成就定义硬编码在代码里，数据库只存用户已解锁的记录 */
@Getter
public enum Achievement {

    FIRST_CHECKIN("初次打卡", "完成第一次习惯打卡"),
    STREAK_7("坚持一周", "任一习惯连续打卡 7 天"),
    STREAK_30("月度达人", "任一习惯连续打卡 30 天"),
    POMODORO_10("专注新手", "累计完成 10 个番茄钟"),
    POMODORO_100("专注大师", "累计完成 100 个番茄钟"),
    FOCUS_4H_DAY("心流状态", "单日专注满 4 小时"),
    TASKS_10("行动派", "累计完成 10 个任务"),
    TASKS_100("执行力爆表", "累计完成 100 个任务"),
    LEVEL_5("小有所成", "达到 5 级"),
    LEVEL_10("自律之星", "达到 10 级");

    private final String title;
    private final String description;

    Achievement(String title, String description) {
        this.title = title;
        this.description = description;
    }
}
