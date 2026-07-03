package com.mike.discipline.repository;

import com.mike.discipline.entity.RewardItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RewardItemRepository extends JpaRepository<RewardItem, Long> {

    List<RewardItem> findByUserIdOrderByCostAsc(Long userId);
}
