package com.mike.discipline.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "habit")
@Getter
@Setter
@NoArgsConstructor
public class Habit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 100)
    private String name;

    /** emoji 图标，如 📚 */
    @Column(length = 10)
    private String icon;

    /** 主题色，如 #5470c6 */
    @Column(length = 10)
    private String color;

    /** 分类：决定星球上长出什么建筑 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private HabitCategory category = HabitCategory.LIFE;

    @Column(nullable = false)
    private boolean archived = false;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
