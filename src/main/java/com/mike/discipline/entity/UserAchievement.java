package com.mike.discipline.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_achievement",
        uniqueConstraints = @UniqueConstraint(columnNames = {"userId", "achievementCode"}))
@Getter
@Setter
@NoArgsConstructor
public class UserAchievement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 50)
    private String achievementCode;

    @Column(nullable = false, updatable = false)
    private LocalDateTime earnedAt = LocalDateTime.now();
}
