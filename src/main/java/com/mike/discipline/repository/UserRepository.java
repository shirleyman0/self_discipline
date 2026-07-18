package com.mike.discipline.repository;

import com.mike.discipline.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    boolean existsByEmailIgnoreCase(String email);

    Optional<User> findByInviteCode(String inviteCode);

    /** 积分/XP 写操作统一锁住用户行，避免奖励、惩罚、兑换与建造并发覆盖。 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findForUpdateById(@Param("id") Long id);

    boolean existsByUsername(String username);
}
