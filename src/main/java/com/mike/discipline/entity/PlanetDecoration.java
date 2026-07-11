package com.mike.discipline.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 兼容旧版星球页的装饰：地表装饰用 posX 定位，轨道装饰（卫星/月亮）忽略坐标。 */
@Entity
@Table(name = "planet_decoration", indexes =
        @Index(name = "idx_planet_decoration_user_created_at", columnList = "user_id, created_at"))
@Getter
@Setter
@NoArgsConstructor
public class PlanetDecoration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DecorationItem code;

    /** 旧版地表的横向位置（0-100，占地表总宽度的百分比） */
    @Column(nullable = false)
    private double posX;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
