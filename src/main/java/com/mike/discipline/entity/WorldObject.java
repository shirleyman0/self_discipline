package com.mike.discipline.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 3D 世界里用户建造的物件 */
@Entity
@Table(name = "world_object", indexes =
        @Index(name = "idx_world_object_user_created_at", columnList = "user_id, created_at"))
@Getter
@Setter
@NoArgsConstructor
public class WorldObject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WorldItem kind;

    /** 世界坐标 */
    @Column(nullable = false)
    private double x;

    @Column(nullable = false)
    private double z;

    /** 摆件等级 1..maxLevel；default 1 保证老数据自动补齐 */
    @Column(nullable = false, columnDefinition = "int not null default 1")
    private int level = 1;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
