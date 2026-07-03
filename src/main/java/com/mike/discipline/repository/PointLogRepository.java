package com.mike.discipline.repository;

import com.mike.discipline.entity.PointLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface PointLogRepository extends JpaRepository<PointLog, Long> {

    List<PointLog> findTop20ByUserIdOrderByCreatedAtDesc(Long userId);

    /** 失败记录 = 负分流水 */
    List<PointLog> findTop10ByUserIdAndDeltaLessThanOrderByCreatedAtDesc(Long userId, long delta);

    List<PointLog> findByUserIdAndCreatedAtBetween(Long userId, LocalDateTime start, LocalDateTime end);

    long countByUserIdAndDeltaLessThanAndCreatedAtBetween(
            Long userId, long delta, LocalDateTime start, LocalDateTime end);
}
