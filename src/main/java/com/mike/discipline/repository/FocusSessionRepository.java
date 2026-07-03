package com.mike.discipline.repository;

import com.mike.discipline.entity.FocusSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface FocusSessionRepository extends JpaRepository<FocusSession, Long> {

    List<FocusSession> findByUserIdAndStartTimeBetweenOrderByStartTimeDesc(
            Long userId, LocalDateTime start, LocalDateTime end);

    long countByUserId(Long userId);

    @Query("select coalesce(sum(f.durationMinutes), 0) from FocusSession f " +
            "where f.userId = :userId and f.startTime between :start and :end")
    int sumMinutes(@Param("userId") Long userId,
                   @Param("start") LocalDateTime start,
                   @Param("end") LocalDateTime end);
}
