package com.mike.discipline.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 奖励商店：自定义奖励，用积分兑换 */
@Entity
@Table(name = "reward_item")
@Getter
@Setter
@NoArgsConstructor
public class RewardItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 10)
    private String icon;

    @Column(nullable = false)
    private int cost;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
