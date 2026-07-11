package com.mike.discipline.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @JsonIgnore
    @Column(nullable = false)
    private String passwordHash;

    @Column(length = 50)
    private String nickname;

    /** 经验值：只增不减，决定等级 */
    @Column(nullable = false)
    private long xp = 0;

    /** 积分：奖励增加、惩罚扣除，可为负 */
    @Column(nullable = false)
    private long points = 0;

    /** 共航搭档的用户 id */
    private Long partnerId;

    /** 搭档邀请码 */
    @Column(unique = true, length = 10)
    private String inviteCode;

    /** 星球名字 */
    @Column(length = 30)
    private String planetName;

    /**
     * 3D 世界中的方块角色职业外观。
     * 兼容已有用户数据：旧行可以为 null，读取时由 PlanetService 补默认值。
     */
    @Column(length = 20)
    private String avatarStyle = "EXPLORER";

    /** 角色主题色（#RRGGBB） */
    @Column(length = 10)
    private String avatarColor = "#57e6d5";

    /** 方块角色肤色与发色，让角色不只是职业预设换色。 */
    @Column(length = 10)
    private String avatarSkinColor = "#E0AD82";

    @Column(length = 10)
    private String avatarHairColor = "#4C3328";

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
