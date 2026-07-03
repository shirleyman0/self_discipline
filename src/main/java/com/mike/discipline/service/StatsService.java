package com.mike.discipline.service;

import com.mike.discipline.repository.FocusSessionRepository;
import com.mike.discipline.repository.HabitCheckinRepository;
import com.mike.discipline.repository.PointLogRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class StatsService {

    private final HabitCheckinRepository checkinRepository;
    private final FocusSessionRepository focusRepository;
    private final PointLogRepository pointLogRepository;

    public StatsService(HabitCheckinRepository checkinRepository,
                        FocusSessionRepository focusRepository,
                        PointLogRepository pointLogRepository) {
        this.checkinRepository = checkinRepository;
        this.focusRepository = focusRepository;
        this.pointLogRepository = pointLogRepository;
    }

    /**
     * 近 N 天逐日数据 + 汇总。range = week(7天) / month(30天)
     */
    public Map<String, Object> summary(Long userId, String range) {
        int days = "month".equalsIgnoreCase(range) ? 30 : 7;
        LocalDate today = LocalDate.now();
        LocalDate startDate = today.minusDays(days - 1L);

        // 一次性取回区间数据，内存中按天分组，避免每天一条 SQL
        Map<LocalDate, Integer> checkinsByDay = new HashMap<>();
        checkinRepository.findByUserIdAndCheckinDateBetween(userId, startDate, today)
                .forEach(c -> checkinsByDay.merge(c.getCheckinDate(), 1, Integer::sum));

        // 任务完成数从积分流水统计（reason 以「完成任务」开头），
        // 因为每日结算会重置 DAILY 任务的 completedAt，直接查 task 表会丢历史
        Map<LocalDate, Integer> tasksDoneByDay = new HashMap<>();
        pointLogRepository.findByUserIdAndCreatedAtBetween(userId,
                        startDate.atStartOfDay(), today.plusDays(1).atStartOfDay()).stream()
                .filter(p -> p.getReason().startsWith("完成任务"))
                .forEach(p -> tasksDoneByDay.merge(p.getCreatedAt().toLocalDate(), 1, Integer::sum));

        Map<LocalDate, Integer> focusByDay = new HashMap<>();
        focusRepository.findByUserIdAndStartTimeBetweenOrderByStartTimeDesc(userId,
                        startDate.atStartOfDay(), today.plusDays(1).atStartOfDay())
                .forEach(f -> focusByDay.merge(f.getStartTime().toLocalDate(),
                        f.getDurationMinutes(), Integer::sum));

        List<Map<String, Object>> series = new ArrayList<>();
        int totalCheckins = 0;
        int totalTasksDone = 0;
        int totalFocusMinutes = 0;
        for (LocalDate d = startDate; !d.isAfter(today); d = d.plusDays(1)) {
            int checkins = checkinsByDay.getOrDefault(d, 0);
            int tasksDone = tasksDoneByDay.getOrDefault(d, 0);
            int focusMinutes = focusByDay.getOrDefault(d, 0);
            totalCheckins += checkins;
            totalTasksDone += tasksDone;
            totalFocusMinutes += focusMinutes;
            series.add(Map.of(
                    "date", d.toString(),
                    "checkins", checkins,
                    "tasksDone", tasksDone,
                    "focusMinutes", focusMinutes));
        }

        long failures = pointLogRepository.countByUserIdAndDeltaLessThanAndCreatedAtBetween(
                userId, 0, startDate.atStartOfDay(), today.plusDays(1).atStartOfDay());

        return Map.of(
                "days", series,
                "totals", Map.of(
                        "checkins", totalCheckins,
                        "tasksDone", totalTasksDone,
                        "focusMinutes", totalFocusMinutes,
                        "failures", failures));
    }
}
