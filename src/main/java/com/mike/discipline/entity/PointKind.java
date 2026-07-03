package com.mike.discipline.entity;

/** 积分流水类型：区分奖励来源 / 惩罚 / 商店兑换 */
public enum PointKind {
    CHECKIN,      // 习惯打卡
    TASK,         // 完成任务
    FOCUS,        // 番茄钟
    ACHIEVEMENT,  // 解锁成就
    STREAK,       // 连续打卡奖励
    PUNISH,       // 结算惩罚（失败记录）
    REDEEM        // 商店兑换
}
