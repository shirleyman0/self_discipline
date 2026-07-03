package com.mike.discipline.repository;

import com.mike.discipline.entity.Nudge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NudgeRepository extends JpaRepository<Nudge, Long> {

    List<Nudge> findTop10ByToUserIdOrderByCreatedAtDesc(Long toUserId);

    List<Nudge> findByToUserIdAndReadFlagFalse(Long toUserId);
}
