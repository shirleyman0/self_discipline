package com.mike.discipline.service;

import com.mike.discipline.entity.Habit;
import com.mike.discipline.entity.HabitCategory;
import com.mike.discipline.entity.HabitCheckin;
import com.mike.discipline.entity.PlanetMessage;
import com.mike.discipline.entity.PointKind;
import com.mike.discipline.entity.PointLog;
import com.mike.discipline.entity.User;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.FocusSessionRepository;
import com.mike.discipline.repository.HabitCheckinRepository;
import com.mike.discipline.repository.HabitRepository;
import com.mike.discipline.repository.PlanetMessageRepository;
import com.mike.discipline.repository.PointLogRepository;
import com.mike.discipline.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 星球场景数据：分类建筑成长、健康度（荒漠化）、留言板。
 *
 * 建筑等级：按分类累计打卡次数（含已归档习惯）
 *   0 次=工地，>=1 一级，>=10 二级，>=30 三级，>=80 四级
 *
 * 健康度：看最近 7 天
 *   failStreak = 从今天往回数，连续「有失败且无产出」的天数（当天有任何打卡/任务/专注即视为产出）
 *   state: DESERT(failStreak>=4) / GLOOMY(failStreak>=2) / FLOURISHING
 */
@Service
public class PlanetService {

    private static final int[] LEVEL_THRESHOLDS = {1, 10, 30, 80};

    private final UserRepository userRepository;
    private final HabitRepository habitRepository;
    private final HabitCheckinRepository checkinRepository;
    private final PointLogRepository pointLogRepository;
    private final FocusSessionRepository focusRepository;
    private final PlanetMessageRepository messageRepository;

    public PlanetService(UserRepository userRepository,
                         HabitRepository habitRepository,
                         HabitCheckinRepository checkinRepository,
                         PointLogRepository pointLogRepository,
                         FocusSessionRepository focusRepository,
                         PlanetMessageRepository messageRepository) {
        this.userRepository = userRepository;
        this.habitRepository = habitRepository;
        this.checkinRepository = checkinRepository;
        this.pointLogRepository = pointLogRepository;
        this.focusRepository = focusRepository;
        this.messageRepository = messageRepository;
    }

    /** 我的星球 */
    public Map<String, Object> myPlanet(Long userId) {
        return planetOf(userId, true);
    }

    /** 搭档的星球（访问） */
    public Map<String, Object> partnerPlanet(Long userId) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            throw ApiException.badRequest("还没有搭档，无法起飞");
        }
        return planetOf(me.getPartnerId(), true);
    }

    @Transactional
    public void rename(Long userId, String name) {
        User user = mustFind(userId);
        user.setPlanetName(name.trim());
        userRepository.save(user);
    }

    /** 在搭档的星球留言（可带小礼物 emoji） */
    @Transactional
    public void leaveMessage(Long userId, String content, String gift) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            throw ApiException.badRequest("还没有搭档");
        }
        PlanetMessage msg = new PlanetMessage();
        msg.setOwnerId(me.getPartnerId());
        msg.setFromUserId(userId);
        msg.setFromNickname(me.getNickname());
        msg.setContent(content);
        msg.setGift(gift);
        messageRepository.save(msg);
    }

    // ================= 内部实现 =================

    private Map<String, Object> planetOf(Long userId, boolean withMessages) {
        User user = mustFind(userId);
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);

        Map<String, Object> m = new HashMap<>();
        m.put("nickname", user.getNickname());
        m.put("planetName", user.getPlanetName() == null || user.getPlanetName().isBlank()
                ? user.getNickname() + " 的星球" : user.getPlanetName());
        m.put("xp", user.getXp());
        m.put("points", user.getPoints());
        m.put("level", GamificationService.levelOf(user.getXp()));
        m.put("buildings", buildings(userId));
        m.put("health", health(userId));
        m.put("today", Map.of(
                "checkins", checkinRepository.findByUserIdAndCheckinDate(userId, today).size(),
                "focusMinutes", focusRepository.sumMinutes(userId, dayStart, dayEnd)));
        if (withMessages) {
            m.put("messages", messageRepository.findTop10ByOwnerIdOrderByCreatedAtDesc(userId));
        }
        return m;
    }

    /** 各分类建筑：累计打卡次数 → 建筑等级 */
    private List<Map<String, Object>> buildings(Long userId) {
        List<Habit> allHabits = habitRepository.findByUserId(userId);
        Map<Long, HabitCategory> habitCategory = allHabits.stream()
                .collect(Collectors.toMap(Habit::getId, Habit::getCategory));

        Map<HabitCategory, Integer> counts = new EnumMap<>(HabitCategory.class);
        for (HabitCheckin c : checkinRepository.findByUserId(userId)) {
            HabitCategory cat = habitCategory.get(c.getHabitId());
            if (cat != null) {
                counts.merge(cat, 1, Integer::sum);
            }
        }
        // 有未归档习惯但还没打过卡的分类也要出现（工地状态）
        Set<HabitCategory> active = allHabits.stream()
                .filter(h -> !h.isArchived())
                .map(Habit::getCategory)
                .collect(Collectors.toSet());

        List<Map<String, Object>> result = new ArrayList<>();
        for (HabitCategory cat : HabitCategory.values()) {
            int count = counts.getOrDefault(cat, 0);
            if (count == 0 && !active.contains(cat)) {
                continue;
            }
            result.add(Map.of(
                    "category", cat.name(),
                    "title", cat.getTitle(),
                    "checkins", count,
                    "level", buildingLevel(count)));
        }
        return result;
    }

    private int buildingLevel(int checkins) {
        int level = 0;
        for (int threshold : LEVEL_THRESHOLDS) {
            if (checkins >= threshold) {
                level++;
            }
        }
        return level; // 0=工地, 1..4
    }

    /** 健康度：最近 7 天失败/产出 → FLOURISHING / GLOOMY / DESERT */
    private Map<String, Object> health(Long userId) {
        LocalDate today = LocalDate.now();
        LocalDateTime weekAgo = today.minusDays(6).atStartOfDay();
        List<PointLog> logs = pointLogRepository.findByUserIdAndCreatedAtBetween(
                userId, weekAgo, today.plusDays(1).atStartOfDay());

        Set<LocalDate> failedDays = new HashSet<>();
        Set<LocalDate> productiveDays = new HashSet<>();
        for (PointLog log : logs) {
            LocalDate day = log.getCreatedAt().toLocalDate();
            if (log.getKind() == PointKind.PUNISH) {
                failedDays.add(day);
            } else if (log.getKind() == PointKind.CHECKIN || log.getKind() == PointKind.TASK
                    || log.getKind() == PointKind.FOCUS || log.getKind() == PointKind.STREAK) {
                productiveDays.add(day);
            }
        }

        // 从今天往回数连续「颓废日」（有失败且无产出；今天无任何记录不打断也不累计）
        int failStreak = 0;
        for (LocalDate d = today; !d.isBefore(today.minusDays(6)); d = d.minusDays(1)) {
            boolean failed = failedDays.contains(d);
            boolean productive = productiveDays.contains(d);
            if (productive) {
                break;
            }
            if (failed) {
                failStreak++;
            }
        }

        String state = failStreak >= 4 ? "DESERT" : (failStreak >= 2 ? "GLOOMY" : "FLOURISHING");
        return Map.of(
                "state", state,
                "failStreak", failStreak,
                "recentFails", failedDays.size(),
                "recentProductiveDays", productiveDays.size());
    }

    private User mustFind(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));
    }
}
