package com.mike.discipline.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 星球留言：搭档访问时留下的话/小礼物 */
@Entity
@Table(name = "planet_message")
@Getter
@Setter
@NoArgsConstructor
public class PlanetMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 留言所在星球的主人 */
    @Column(nullable = false)
    private Long ownerId;

    @Column(nullable = false)
    private Long fromUserId;

    /** 冗余昵称，避免展示时再查一次 */
    @Column(nullable = false, length = 50)
    private String fromNickname;

    @Column(nullable = false, length = 200)
    private String content;

    /** 小礼物 emoji，可空 */
    @Column(length = 10)
    private String gift;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
