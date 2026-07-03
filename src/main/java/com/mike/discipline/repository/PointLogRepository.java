package com.mike.discipline.repository;

import com.mike.discipline.entity.PointKind;
import com.mike.discipline.entity.PointLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface PointLogRepository extends JpaRepository<PointLog, Long> {

    List<PointLog> findTop20ByUserIdOrderByCreatedAtDesc(Long userId);

    /** 失败记录 = 结算惩罚流水 */
    List<PointLog> findTop10ByUserIdAndKindOrderByCreatedAtDesc(Long userId, PointKind kind);

    List<PointLog> findByUserIdAndCreatedAtBetween(Long userId, LocalDateTime start, LocalDateTime end);

    long countByUserIdAndKindAndCreatedAtBetween(
            Long userId, PointKind kind, LocalDateTime start, LocalDateTime end);

    /** 区间内积分净变化（周 PK 用） */
    @Query("select coalesce(sum(p.delta), 0) from PointLog p " +
            "where p.userId = :userId and p.createdAt between :start and :end")
    long sumDelta(@Param("userId") Long userId,
                  @Param("start") LocalDateTime start,
                  @Param("end") LocalDateTime end);
}
