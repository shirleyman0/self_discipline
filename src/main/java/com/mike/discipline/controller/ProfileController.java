package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.entity.Achievement;
import com.mike.discipline.entity.PointKind;
import com.mike.discipline.entity.User;
import com.mike.discipline.entity.UserAchievement;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.PointLogRepository;
import com.mike.discipline.repository.UserAchievementRepository;
import com.mike.discipline.repository.UserRepository;
import com.mike.discipline.service.GamificationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final UserRepository userRepository;
    private final UserAchievementRepository achievementRepository;
    private final PointLogRepository pointLogRepository;

    public ProfileController(UserRepository userRepository,
                             UserAchievementRepository achievementRepository,
                             PointLogRepository pointLogRepository) {
        this.userRepository = userRepository;
        this.achievementRepository = achievementRepository;
        this.pointLogRepository = pointLogRepository;
    }

    @GetMapping
    public Map<String, Object> profile() {
        Long userId = CurrentUser.id();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));

        int level = GamificationService.levelOf(user.getXp());
        long currentLevelXp = GamificationService.xpForLevel(level);
        long nextLevelXp = GamificationService.xpForLevel(level + 1);

        Map<String, LocalDateTime> earned = achievementRepository.findByUserId(userId).stream()
                .collect(Collectors.toMap(UserAchievement::getAchievementCode,
                        UserAchievement::getEarnedAt));

        List<Map<String, Object>> achievements = java.util.Arrays.stream(Achievement.values())
                .map((Function<Achievement, Map<String, Object>>) a -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("code", a.name());
                    m.put("title", a.getTitle());
                    m.put("description", a.getDescription());
                    m.put("earned", earned.containsKey(a.name()));
                    m.put("earnedAt", earned.get(a.name()));
                    return m;
                })
                .toList();

        Map<String, Object> result = new HashMap<>();
        result.put("username", user.getUsername());
        result.put("nickname", user.getNickname());
        result.put("xp", user.getXp());
        result.put("points", user.getPoints());
        result.put("level", level);
        result.put("levelProgress", Map.of(
                "current", user.getXp() - currentLevelXp,
                "needed", nextLevelXp - currentLevelXp));
        result.put("achievements", achievements);
        result.put("recentFailures",
                pointLogRepository.findTop10ByUserIdAndKindOrderByCreatedAtDesc(userId, PointKind.PUNISH));
        result.put("recentPoints", pointLogRepository.findTop20ByUserIdOrderByCreatedAtDesc(userId));
        return result;
    }
}
