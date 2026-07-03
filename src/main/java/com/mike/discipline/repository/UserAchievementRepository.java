package com.mike.discipline.repository;

import com.mike.discipline.entity.UserAchievement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserAchievementRepository extends JpaRepository<UserAchievement, Long> {

    boolean existsByUserIdAndAchievementCode(Long userId, String code);

    List<UserAchievement> findByUserId(Long userId);
}
