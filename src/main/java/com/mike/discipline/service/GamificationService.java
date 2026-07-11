package com.mike.discipline.service;

import com.mike.discipline.entity.Achievement;
import com.mike.discipline.entity.PointKind;
import com.mike.discipline.entity.PointLog;
import com.mike.discipline.entity.User;
import com.mike.discipline.entity.UserAchievement;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.PointLogRepository;
import com.mike.discipline.repository.UserAchievementRepository;
import com.mike.discipline.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 游戏化核心：XP / 积分 / 等级 / 成就 / 商店兑换。
 * 奖励：打卡 +10；任务 +任务分值；番茄钟(>=25min) +5；成就 +50；连续 7/30 天 +30/+100。
 * 惩罚：每日结算扣分（DailySettlementJob）。兑换：商店扣分（需余额充足）。
 */
@Service
public class GamificationService {

    public static final int CHECKIN_XP = 10;
    public static final int CHECKIN_POINTS = 10;
    public static final int POMODORO_XP = 5;
    public static final int POMODORO_POINTS = 5;
    public static final int POMODORO_MIN_MINUTES = 25;
    public static final int ACHIEVEMENT_BONUS = 50;
    public static final int STREAK_7_BONUS = 30;
    public static final int STREAK_30_BONUS = 100;

    private final UserRepository userRepository;
    private final PointLogRepository pointLogRepository;
    private final UserAchievementRepository userAchievementRepository;

    public GamificationService(UserRepository userRepository,
                               PointLogRepository pointLogRepository,
                               UserAchievementRepository userAchievementRepository) {
        this.userRepository = userRepository;
        this.pointLogRepository = pointLogRepository;
        this.userAchievementRepository = userAchievementRepository;
    }

    /** 等级公式：level = floor(sqrt(xp / 100)) + 1 */
    public static int levelOf(long xp) {
        return (int) Math.floor(Math.sqrt(xp / 100.0)) + 1;
    }

    /** 达到 level 级所需的最低 XP */
    public static long xpForLevel(int level) {
        long n = level - 1L;
        return n * n * 100;
    }

    /** 奖励：加 XP、加积分并记流水，然后检查等级成就 */
    @Transactional
    public void reward(Long userId, long xp, long points, String reason, PointKind kind) {
        User user = mustFindForUpdate(userId);
        user.setXp(user.getXp() + xp);
        user.setPoints(user.getPoints() + points);
        userRepository.save(user);
        if (points != 0) {
            log(userId, points, reason, kind);
        }
        checkLevelAchievements(userId, user.getXp());
    }

    /** 惩罚：只扣积分，不动 XP（记为失败流水） */
    @Transactional
    public void punish(Long userId, long points, String reason) {
        User user = mustFindForUpdate(userId);
        user.setPoints(user.getPoints() - points);
        userRepository.save(user);
        log(userId, -points, reason, PointKind.PUNISH);
    }

    /** 商店兑换：余额不足则拒绝 */
    @Transactional
    public long redeem(Long userId, long cost, String reason) {
        if (cost <= 0) {
            throw ApiException.badRequest("兑换积分必须大于 0");
        }
        // 行锁保证同一用户并发建造/兑换时不会超额消费。
        User user = mustFindForUpdate(userId);
        if (user.getPoints() < cost) {
            throw ApiException.badRequest("积分不足，还差 " + (cost - user.getPoints()) + " P");
        }
        user.setPoints(user.getPoints() - cost);
        userRepository.save(user);
        log(userId, -cost, reason, PointKind.REDEEM);
        return user.getPoints();
    }

    /** 解锁成就（幂等）：已解锁则忽略，新解锁奖励 50 分 */
    @Transactional
    public void unlock(Long userId, Achievement achievement) {
        // 与 reward/redeem 保持相同的加锁顺序，避免成就奖励与兑换互相覆盖。
        mustFindForUpdate(userId);
        if (userAchievementRepository.existsByUserIdAndAchievementCode(userId, achievement.name())) {
            return;
        }
        UserAchievement ua = new UserAchievement();
        ua.setUserId(userId);
        ua.setAchievementCode(achievement.name());
        userAchievementRepository.save(ua);
        reward(userId, ACHIEVEMENT_BONUS, ACHIEVEMENT_BONUS,
                "解锁成就：" + achievement.getTitle(), PointKind.ACHIEVEMENT);
    }

    private void checkLevelAchievements(Long userId, long xp) {
        int level = levelOf(xp);
        if (level >= 5) {
            unlockQuietly(userId, Achievement.LEVEL_5);
        }
        if (level >= 10) {
            unlockQuietly(userId, Achievement.LEVEL_10);
        }
    }

    /** 等级成就不再触发 reward 递归，避免无限循环 */
    private void unlockQuietly(Long userId, Achievement achievement) {
        if (userAchievementRepository.existsByUserIdAndAchievementCode(userId, achievement.name())) {
            return;
        }
        UserAchievement ua = new UserAchievement();
        ua.setUserId(userId);
        ua.setAchievementCode(achievement.name());
        userAchievementRepository.save(ua);
        log(userId, ACHIEVEMENT_BONUS, "解锁成就：" + achievement.getTitle(), PointKind.ACHIEVEMENT);
        // 等级成就由 reward() 触发；这里复用同一事务中的用户行锁。
        User user = mustFindForUpdate(userId);
        user.setPoints(user.getPoints() + ACHIEVEMENT_BONUS);
        userRepository.save(user);
    }

    /** 所有积分/XP 写入都锁定同一用户行，避免奖励、惩罚和兑换并发覆盖。 */
    private User mustFindForUpdate(Long userId) {
        return userRepository.findForUpdateById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));
    }

    private void log(Long userId, long delta, String reason, PointKind kind) {
        PointLog entry = new PointLog();
        entry.setUserId(userId);
        entry.setDelta(delta);
        entry.setReason(reason);
        entry.setKind(kind);
        pointLogRepository.save(entry);
    }
}
