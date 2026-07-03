package com.mike.discipline.service;

import com.mike.discipline.entity.Achievement;
import com.mike.discipline.entity.Habit;
import com.mike.discipline.entity.HabitCategory;
import com.mike.discipline.entity.HabitCheckin;
import com.mike.discipline.entity.PointKind;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.HabitCheckinRepository;
import com.mike.discipline.repository.HabitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class HabitService {

    private final HabitRepository habitRepository;
    private final HabitCheckinRepository checkinRepository;
    private final GamificationService gamificationService;

    public HabitService(HabitRepository habitRepository,
                        HabitCheckinRepository checkinRepository,
                        GamificationService gamificationService) {
        this.habitRepository = habitRepository;
        this.checkinRepository = checkinRepository;
        this.gamificationService = gamificationService;
    }

    /** 习惯列表，附带今日是否已打卡和当前连续天数 */
    public List<Map<String, Object>> list(Long userId) {
        LocalDate today = LocalDate.now();
        Set<Long> checkedToday = checkinRepository.findByUserIdAndCheckinDate(userId, today).stream()
                .map(HabitCheckin::getHabitId)
                .collect(Collectors.toSet());
        return habitRepository.findByUserIdAndArchivedFalseOrderByCreatedAtAsc(userId).stream()
                .map(h -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", h.getId());
                    m.put("name", h.getName());
                    m.put("icon", h.getIcon());
                    m.put("color", h.getColor());
                    m.put("category", h.getCategory().name());
                    m.put("categoryTitle", h.getCategory().getTitle());
                    m.put("checkedToday", checkedToday.contains(h.getId()));
                    m.put("streak", streakOf(h.getId()));
                    return m;
                })
                .toList();
    }

    @Transactional
    public Habit create(Long userId, String name, String icon, String color, HabitCategory category) {
        Habit habit = new Habit();
        habit.setUserId(userId);
        habit.setName(name);
        habit.setIcon(icon == null || icon.isBlank() ? "✅" : icon);
        habit.setColor(color == null || color.isBlank() ? "#5470c6" : color);
        habit.setCategory(category == null ? HabitCategory.LIFE : category);
        return habitRepository.save(habit);
    }

    @Transactional
    public Habit update(Long userId, Long habitId, String name, String icon, String color,
                        HabitCategory category) {
        Habit habit = owned(userId, habitId);
        if (name != null && !name.isBlank()) {
            habit.setName(name);
        }
        if (icon != null && !icon.isBlank()) {
            habit.setIcon(icon);
        }
        if (color != null && !color.isBlank()) {
            habit.setColor(color);
        }
        if (category != null) {
            habit.setCategory(category);
        }
        return habitRepository.save(habit);
    }

    /** 删除 = 归档，保留历史打卡记录 */
    @Transactional
    public void archive(Long userId, Long habitId) {
        Habit habit = owned(userId, habitId);
        habit.setArchived(true);
        habitRepository.save(habit);
    }

    /** 当天打卡；重复打卡返回 409 */
    @Transactional
    public Map<String, Object> checkin(Long userId, Long habitId, String note) {
        Habit habit = owned(userId, habitId);
        LocalDate today = LocalDate.now();
        if (checkinRepository.existsByHabitIdAndCheckinDate(habitId, today)) {
            throw ApiException.conflict("今天已经打过卡了");
        }
        HabitCheckin checkin = new HabitCheckin();
        checkin.setHabitId(habitId);
        checkin.setUserId(userId);
        checkin.setCheckinDate(today);
        checkin.setNote(note);
        checkinRepository.save(checkin);

        gamificationService.reward(userId, GamificationService.CHECKIN_XP,
                GamificationService.CHECKIN_POINTS, "习惯打卡：" + habit.getName(), PointKind.CHECKIN);

        int streak = streakOf(habitId);
        gamificationService.unlock(userId, Achievement.FIRST_CHECKIN);
        if (streak == 7) {
            gamificationService.reward(userId, GamificationService.STREAK_7_BONUS,
                    GamificationService.STREAK_7_BONUS, "连续打卡 7 天：" + habit.getName(), PointKind.STREAK);
            gamificationService.unlock(userId, Achievement.STREAK_7);
        }
        if (streak == 30) {
            gamificationService.reward(userId, GamificationService.STREAK_30_BONUS,
                    GamificationService.STREAK_30_BONUS, "连续打卡 30 天：" + habit.getName(), PointKind.STREAK);
            gamificationService.unlock(userId, Achievement.STREAK_30);
        }
        return Map.of("streak", streak);
    }

    /** ECharts calendar 热力图数据：[["2026-07-04", 1], ...] */
    public List<List<Object>> heatmap(Long userId, Long habitId, int year) {
        owned(userId, habitId);
        LocalDate start = LocalDate.of(year, 1, 1);
        LocalDate end = LocalDate.of(year, 12, 31);
        return checkinRepository.findByHabitIdAndCheckinDateBetween(habitId, start, end).stream()
                .map(c -> List.<Object>of(c.getCheckinDate().toString(), 1))
                .toList();
    }

    /** 从今天（或昨天）往前数连续打卡天数 */
    private int streakOf(Long habitId) {
        Set<LocalDate> dates = checkinRepository.findByHabitIdOrderByCheckinDateDesc(habitId).stream()
                .map(HabitCheckin::getCheckinDate)
                .collect(Collectors.toSet());
        LocalDate cursor = LocalDate.now();
        if (!dates.contains(cursor)) {
            cursor = cursor.minusDays(1); // 今天还没打卡不算断签
        }
        int streak = 0;
        while (dates.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    private Habit owned(Long userId, Long habitId) {
        Habit habit = habitRepository.findById(habitId)
                .orElseThrow(() -> ApiException.notFound("习惯不存在"));
        if (!habit.getUserId().equals(userId)) {
            throw ApiException.notFound("习惯不存在");
        }
        return habit;
    }
}
