package com.mike.discipline.service;

import com.mike.discipline.entity.Achievement;
import com.mike.discipline.entity.FocusSession;
import com.mike.discipline.entity.PointKind;
import com.mike.discipline.repository.FocusSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
public class FocusService {

    private final FocusSessionRepository focusRepository;
    private final GamificationService gamificationService;

    public FocusService(FocusSessionRepository focusRepository,
                        GamificationService gamificationService) {
        this.focusRepository = focusRepository;
        this.gamificationService = gamificationService;
    }

    /** 番茄钟结束上报；>=25 分钟才有积分奖励 */
    @Transactional
    public FocusSession record(Long userId, Long taskId, int durationMinutes, String note) {
        FocusSession session = new FocusSession();
        session.setUserId(userId);
        session.setTaskId(taskId);
        session.setDurationMinutes(durationMinutes);
        session.setStartTime(LocalDateTime.now().minusMinutes(durationMinutes));
        session.setNote(note);
        focusRepository.save(session);

        if (durationMinutes >= GamificationService.POMODORO_MIN_MINUTES) {
            gamificationService.reward(userId, GamificationService.POMODORO_XP,
                    GamificationService.POMODORO_POINTS,
                    "完成番茄钟 " + durationMinutes + " 分钟", PointKind.FOCUS);
        }

        long total = focusRepository.countByUserId(userId);
        if (total >= 10) {
            gamificationService.unlock(userId, Achievement.POMODORO_10);
        }
        if (total >= 100) {
            gamificationService.unlock(userId, Achievement.POMODORO_100);
        }
        if (todayMinutes(userId) >= 240) {
            gamificationService.unlock(userId, Achievement.FOCUS_4H_DAY);
        }
        return session;
    }

    public Map<String, Object> todayStats(Long userId) {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        LocalDateTime end = start.plusDays(1);
        List<FocusSession> sessions =
                focusRepository.findByUserIdAndStartTimeBetweenOrderByStartTimeDesc(userId, start, end);
        int minutes = sessions.stream().mapToInt(FocusSession::getDurationMinutes).sum();
        return Map.of("minutes", minutes, "count", sessions.size(), "sessions", sessions);
    }

    private int todayMinutes(Long userId) {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        return focusRepository.sumMinutes(userId, start, start.plusDays(1));
    }
}
