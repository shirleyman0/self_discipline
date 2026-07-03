package com.mike.discipline.service;

import com.mike.discipline.entity.Nudge;
import com.mike.discipline.entity.PointKind;
import com.mike.discipline.entity.PointLog;
import com.mike.discipline.entity.User;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.FocusSessionRepository;
import com.mike.discipline.repository.HabitCheckinRepository;
import com.mike.discipline.repository.NudgeRepository;
import com.mike.discipline.repository.PointLogRepository;
import com.mike.discipline.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 共航搭档：邀请码绑定、双方数据对比、动态流、戳一戳 */
@Service
public class PartnerService {

    private final UserRepository userRepository;
    private final HabitCheckinRepository checkinRepository;
    private final FocusSessionRepository focusRepository;
    private final PointLogRepository pointLogRepository;
    private final NudgeRepository nudgeRepository;
    private final StatsService statsService;

    public PartnerService(UserRepository userRepository,
                          HabitCheckinRepository checkinRepository,
                          FocusSessionRepository focusRepository,
                          PointLogRepository pointLogRepository,
                          NudgeRepository nudgeRepository,
                          StatsService statsService) {
        this.userRepository = userRepository;
        this.checkinRepository = checkinRepository;
        this.focusRepository = focusRepository;
        this.pointLogRepository = pointLogRepository;
        this.nudgeRepository = nudgeRepository;
        this.statsService = statsService;
    }

    /** 搭档总览：我的邀请码 + 双方今日/本周数据 + 收到的戳一戳（返回后标记已读） */
    @Transactional
    public Map<String, Object> overview(Long userId) {
        User me = mustFind(userId);
        ensureInviteCode(me);

        Map<String, Object> result = new HashMap<>();
        result.put("inviteCode", me.getInviteCode());
        result.put("me", side(me));

        if (me.getPartnerId() != null) {
            User partner = mustFind(me.getPartnerId());
            result.put("partner", side(partner));
        } else {
            result.put("partner", null);
        }

        // 收到的戳一戳：先取未读数，返回后全部标记已读
        List<Nudge> unread = nudgeRepository.findByToUserIdAndReadFlagFalse(userId);
        result.put("unreadNudges", unread.size());
        result.put("nudges", nudgeRepository.findTop10ByToUserIdOrderByCreatedAtDesc(userId));
        unread.forEach(n -> n.setReadFlag(true));
        nudgeRepository.saveAll(unread);
        return result;
    }

    /** 一侧的数据面板：等级、今日打卡/任务/专注、本周积分净变化 */
    private Map<String, Object> side(User user) {
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);
        LocalDateTime weekStart = today.with(DayOfWeek.MONDAY).atStartOfDay();

        List<PointLog> todayLogs = pointLogRepository.findByUserIdAndCreatedAtBetween(
                user.getId(), dayStart, dayEnd);

        Map<String, Object> m = new HashMap<>();
        m.put("nickname", user.getNickname());
        m.put("xp", user.getXp());
        m.put("points", user.getPoints());
        m.put("level", GamificationService.levelOf(user.getXp()));
        m.put("todayCheckins", checkinRepository.findByUserIdAndCheckinDate(user.getId(), today).size());
        m.put("todayTasksDone", todayLogs.stream().filter(p -> p.getKind() == PointKind.TASK).count());
        m.put("todayFocusMinutes", focusRepository.sumMinutes(user.getId(), dayStart, dayEnd));
        m.put("weekPoints", pointLogRepository.sumDelta(user.getId(), weekStart, dayEnd));
        return m;
    }

    /** 用对方邀请码绑定搭档（双向） */
    @Transactional
    public Map<String, Object> bind(Long userId, String code) {
        User me = mustFind(userId);
        if (me.getPartnerId() != null) {
            throw ApiException.conflict("你已经有搭档了，先解绑再换");
        }
        User other = userRepository.findByInviteCode(code.trim().toUpperCase())
                .orElseThrow(() -> ApiException.notFound("邀请码不存在"));
        if (other.getId().equals(userId)) {
            throw ApiException.badRequest("不能和自己组队");
        }
        if (other.getPartnerId() != null) {
            throw ApiException.conflict("对方已经有搭档了");
        }
        me.setPartnerId(other.getId());
        other.setPartnerId(me.getId());
        userRepository.save(me);
        userRepository.save(other);
        return Map.of("partnerNickname", other.getNickname());
    }

    /** 解绑（双向） */
    @Transactional
    public void unbind(Long userId) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            return;
        }
        userRepository.findById(me.getPartnerId()).ifPresent(p -> {
            p.setPartnerId(null);
            userRepository.save(p);
        });
        me.setPartnerId(null);
        userRepository.save(me);
    }

    /** 给搭档发戳一戳：CHEER 加油 / POKE 催促 */
    @Transactional
    public void nudge(Long userId, String type, String message) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            throw ApiException.badRequest("还没有搭档");
        }
        if (!"CHEER".equals(type) && !"POKE".equals(type)) {
            throw ApiException.badRequest("未知的类型");
        }
        Nudge nudge = new Nudge();
        nudge.setFromUserId(userId);
        nudge.setToUserId(me.getPartnerId());
        nudge.setType(type);
        nudge.setMessage(message);
        nudgeRepository.save(nudge);
    }

    /** 搭档动态流：TA 的积分流水（含失败记录，公开处刑） */
    public List<Map<String, Object>> feed(Long userId) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            throw ApiException.badRequest("还没有搭档");
        }
        return pointLogRepository.findTop20ByUserIdOrderByCreatedAtDesc(me.getPartnerId()).stream()
                .map(p -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("reason", p.getReason());
                    m.put("delta", p.getDelta());
                    m.put("kind", p.getKind());
                    m.put("createdAt", p.getCreatedAt());
                    return m;
                })
                .toList();
    }

    /** 双方趋势对比（复用单人统计） */
    public Map<String, Object> compare(Long userId, String range) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            throw ApiException.badRequest("还没有搭档");
        }
        return Map.of(
                "me", statsService.summary(userId, range),
                "partner", statsService.summary(me.getPartnerId(), range));
    }

    /** 旧账号没有邀请码时补生成 */
    private void ensureInviteCode(User user) {
        if (user.getInviteCode() != null) {
            return;
        }
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var random = new SecureRandom();
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder(6);
            for (int i = 0; i < 6; i++) {
                sb.append(chars.charAt(random.nextInt(chars.length())));
            }
            String code = sb.toString();
            if (userRepository.findByInviteCode(code).isEmpty()) {
                user.setInviteCode(code);
                userRepository.save(user);
                return;
            }
        }
        throw new IllegalStateException("生成邀请码失败");
    }

    private User mustFind(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));
    }
}
