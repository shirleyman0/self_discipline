package com.mike.discipline.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 搭档之间的戳一戳：加油 / 催促 */
@Entity
@Table(name = "nudge")
@Getter
@Setter
@NoArgsConstructor
public class Nudge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long fromUserId;

    @Column(nullable = false)
    private Long toUserId;

    /** CHEER 加油 / POKE 催促 */
    @Column(nullable = false, length = 10)
    private String type;

    @Column(length = 200)
    private String message;

    @Column(nullable = false)
    private boolean readFlag = false;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
