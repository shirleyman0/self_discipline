package com.mike.discipline.service;

import com.mike.discipline.entity.DecorationItem;
import com.mike.discipline.entity.Habit;
import com.mike.discipline.entity.HabitCategory;
import com.mike.discipline.entity.HabitCheckin;
import com.mike.discipline.entity.PlanetDecoration;
import com.mike.discipline.entity.PlanetMessage;
import com.mike.discipline.entity.PointKind;
import com.mike.discipline.entity.PointLog;
import com.mike.discipline.entity.User;
import com.mike.discipline.entity.WorldItem;
import com.mike.discipline.entity.WorldObject;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.FocusSessionRepository;
import com.mike.discipline.repository.HabitCheckinRepository;
import com.mike.discipline.repository.HabitRepository;
import com.mike.discipline.repository.PlanetDecorationRepository;
import com.mike.discipline.repository.PlanetMessageRepository;
import com.mike.discipline.repository.PointLogRepository;
import com.mike.discipline.repository.UserRepository;
import com.mike.discipline.repository.WorldObjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 星球场景数据：分类建筑成长、健康度（荒漠化）、留言板。
 *
 * 建筑等级：按分类累计打卡次数（含已归档习惯）
 *   0 次=工地，>=1 一级，>=10 二级，>=30 三级，>=80 四级
 *
 * 健康度：看最近 7 天
 *   failStreak = 从今天往回数，连续「有失败且无产出」的天数（当天有任何打卡/任务/专注即视为产出）
 *   state: DESERT(failStreak>=4) / GLOOMY(failStreak>=2) / FLOURISHING
 */
@Service
public class PlanetService {

    private static final int[] LEVEL_THRESHOLDS = {1, 10, 30, 80};
    private static final double WORLD_LIMIT = 190.0;
    private static final int MAX_WORLD_OBJECTS = 500;
    private static final Set<String> AVATAR_STYLES = Set.of(
            "EXPLORER", "ARCHITECT", "RANGER", "ASTRONAUT");

    /** 稳定的 API 输出 DTO，不把 userId 等持久化细节暴露给前端。 */
    public record WorldObjectView(Long id, String kind, String title, double x, double z,
                                  int level, int maxLevel, boolean keystone) {
        static WorldObjectView from(WorldObject object) {
            WorldItem item = object.getKind();
            return new WorldObjectView(object.getId(), item.name(), item.getTitle(),
                    object.getX(), object.getZ(),
                    Math.max(1, object.getLevel()), item.getMaxLevel(), item.isKeystone());
        }
    }

    private final UserRepository userRepository;
    private final HabitRepository habitRepository;
    private final HabitCheckinRepository checkinRepository;
    private final PointLogRepository pointLogRepository;
    private final FocusSessionRepository focusRepository;
    private final PlanetMessageRepository messageRepository;
    private final PlanetDecorationRepository decorationRepository;
    private final GamificationService gamificationService;
    private final WorldObjectRepository worldObjectRepository;

    public PlanetService(UserRepository userRepository,
                         HabitRepository habitRepository,
                         HabitCheckinRepository checkinRepository,
                         PointLogRepository pointLogRepository,
                         FocusSessionRepository focusRepository,
                         PlanetMessageRepository messageRepository,
                         PlanetDecorationRepository decorationRepository,
                         GamificationService gamificationService,
                         WorldObjectRepository worldObjectRepository) {
        this.userRepository = userRepository;
        this.habitRepository = habitRepository;
        this.checkinRepository = checkinRepository;
        this.pointLogRepository = pointLogRepository;
        this.focusRepository = focusRepository;
        this.messageRepository = messageRepository;
        this.decorationRepository = decorationRepository;
        this.gamificationService = gamificationService;
        this.worldObjectRepository = worldObjectRepository;
    }

    /** 我的星球 */
    public Map<String, Object> myPlanet(Long userId) {
        return planetOf(userId, true);
    }

    /** 搭档的星球（访问） */
    public Map<String, Object> partnerPlanet(Long userId) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            throw ApiException.badRequest("还没有搭档，无法起飞");
        }
        return planetOf(me.getPartnerId(), true);
    }

    @Transactional
    public void rename(Long userId, String name) {
        User user = mustFind(userId);
        user.setPlanetName(name.trim());
        userRepository.save(user);
    }

    /** 在搭档的星球留言（可带小礼物 emoji） */
    @Transactional
    public void leaveMessage(Long userId, String content, String gift) {
        User me = mustFind(userId);
        if (me.getPartnerId() == null) {
            throw ApiException.badRequest("还没有搭档");
        }
        PlanetMessage msg = new PlanetMessage();
        msg.setOwnerId(me.getPartnerId());
        msg.setFromUserId(userId);
        msg.setFromNickname(me.getNickname());
        msg.setContent(content);
        msg.setGift(gift);
        messageRepository.save(msg);
    }

    /** 建造装饰：扣积分并放置到地表指定位置 */
    @Transactional
    public PlanetDecoration addDecoration(Long userId, String code, double posX) {
        DecorationItem item;
        try {
            item = DecorationItem.valueOf(code == null ? "" : code.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("未知的装饰");
        }
        if (!Double.isFinite(posX) || posX < 0 || posX > 100) {
            throw ApiException.badRequest("装饰位置必须在 0 到 100 之间");
        }
        double normalizedPosX = Math.round(posX * 10.0) / 10.0;
        // 与世界建造一样先锁住用户，保证并发放置时也只有一个请求消费余额。
        userRepository.findForUpdateById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));
        gamificationService.redeem(userId, item.getCost(),
                "建造装饰：" + item.getEmoji() + " " + item.getTitle());
        PlanetDecoration deco = new PlanetDecoration();
        deco.setUserId(userId);
        deco.setCode(item);
        deco.setPosX(normalizedPosX);
        return decorationRepository.save(deco);
    }

    /** 拆除装饰（不退积分） */
    @Transactional
    public void removeDecoration(Long userId, Long decorationId) {
        if (decorationId == null || decorationId <= 0) {
            throw ApiException.notFound("装饰不存在");
        }
        PlanetDecoration deco = decorationRepository.findById(decorationId)
                .orElseThrow(() -> ApiException.notFound("装饰不存在"));
        if (!deco.getUserId().equals(userId)) {
            throw ApiException.notFound("装饰不存在");
        }
        decorationRepository.delete(deco);
    }

    /** 在 3D 世界指定坐标建造，费用、纪元解锁与坐标都由服务端校验。 */
    @Transactional
    public WorldObjectView buildWorldObject(Long userId, String kind, Double x, Double z) {
        WorldItem item;
        try {
            item = WorldItem.valueOf(kind == null ? "" : kind.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("未知的建造项目");
        }
        if (x == null || z == null || !Double.isFinite(x) || !Double.isFinite(z)) {
            throw ApiException.badRequest("建造坐标不能为空且必须是有效数字");
        }
        double newRadius = placementRadius(item);
        // 整个建筑占地都必须留在可建造区域内，而不只是中心点在边界内。
        double centerLimit = WORLD_LIMIT - newRadius;
        if (Math.abs(x) > centerLimit || Math.abs(z) > centerLimit) {
            throw ApiException.badRequest("只能在星球可建造区域内放置");
        }
        double normalizedX = Math.round(x * 10.0) / 10.0;
        double normalizedZ = Math.round(z * 10.0) / 10.0;

        // 一个用户的建造请求串行化，避免并发放置导致建筑重叠或超额消费。
        userRepository.findForUpdateById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));
        List<WorldObject> objects = worldObjectRepository.findByUserIdOrderByCreatedAtAsc(userId);
        if (objects.size() >= MAX_WORLD_OBJECTS) {
            throw ApiException.badRequest("建造物已达上限，请先拆除一些建筑");
        }
        // 纪元锁：里程碑要求上一纪元已解锁，普通摆件要求所属纪元已解锁。
        int unlocked = unlockedEpoch(objects);
        int required = item.isKeystone() ? item.getEpoch() - 1 : item.getEpoch();
        if (unlocked < required) {
            throw ApiException.badRequest("「" + item.getTitle() + "」尚未解锁，请先完成上一纪元的里程碑工程");
        }
        if (item.isKeystone() && objects.stream().anyMatch(o -> o.getKind() == item)) {
            throw ApiException.badRequest("「" + item.getTitle() + "」是里程碑工程，整颗星球只能建造一座");
        }
        // 避免物件完全叠在一起；湖泊和大型建筑预留更大的空间。
        boolean occupied = objects.stream().anyMatch(o -> {
            // 两个占地圆都要完整分离，不能只取较大的那个半径。
            double requiredGap = newRadius + placementRadius(o.getKind());
            return Math.hypot(o.getX() - normalizedX, o.getZ() - normalizedZ) < requiredGap;
        });
        if (occupied) {
            throw ApiException.badRequest("这里离其他建筑太近，请换一个位置");
        }
        gamificationService.redeem(userId, item.getCost(), "星球建造：" + item.getTitle());
        WorldObject object = new WorldObject();
        object.setUserId(userId);
        object.setKind(item);
        object.setX(normalizedX);
        object.setZ(normalizedZ);
        return WorldObjectView.from(worldObjectRepository.save(object));
    }

    /** 摆件升级：扣 cost × 当前等级 的积分，外观逐级豪华。 */
    @Transactional
    public WorldObjectView upgradeWorldObject(Long userId, Long objectId) {
        if (objectId == null || objectId <= 0) {
            throw ApiException.notFound("建筑不存在");
        }
        // 与建造一样先锁用户，防止并发升级双扣或跳级。
        userRepository.findForUpdateById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));
        WorldObject object = worldObjectRepository.findById(objectId)
                .orElseThrow(() -> ApiException.notFound("建筑不存在"));
        if (!object.getUserId().equals(userId)) {
            throw ApiException.notFound("建筑不存在");
        }
        WorldItem item = object.getKind();
        int level = Math.max(1, object.getLevel());
        if (item.isKeystone() || level >= item.getMaxLevel()) {
            throw ApiException.badRequest("「" + item.getTitle() + "」已经是最高等级");
        }
        gamificationService.redeem(userId, item.upgradeCost(level),
                "升级建筑：" + item.getTitle() + " → Lv." + (level + 1));
        object.setLevel(level + 1);
        return WorldObjectView.from(worldObjectRepository.save(object));
    }

    /**
     * 已解锁的最高纪元：
     *  - 里程碑工程逐级解锁（动物纪方舟落成后直接开放文明纪）；
     *  - 老存档兜底：只要拥有某纪元的任意摆件，视为该纪元及之前全部解锁，
     *    避免升级前建好的世界因为缺里程碑而倒退回荒芜月面。
     */
    private int unlockedEpoch(List<WorldObject> objects) {
        int unlocked = 0;
        for (WorldObject o : objects) {
            WorldItem k = o.getKind();
            unlocked = Math.max(unlocked, k.isKeystone() ? k.getEpoch() : Math.min(6, k.getEpoch()));
        }
        // 连续里程碑链才是正路，但上面的 max 已经覆盖“拥有即解锁”的兜底；
        // 动物纪（5）的方舟建成后没有第 6 纪元里程碑，直接放行文明纪。
        return unlocked >= 5 ? 6 : unlocked;
    }

    @Transactional
    public void removeWorldObject(Long userId, Long objectId) {
        if (objectId == null || objectId <= 0) {
            throw ApiException.notFound("建筑不存在");
        }
        WorldObject object = worldObjectRepository.findById(objectId)
                .orElseThrow(() -> ApiException.notFound("建筑不存在"));
        if (!object.getUserId().equals(userId)) {
            throw ApiException.notFound("建筑不存在");
        }
        worldObjectRepository.delete(object);
    }

    @Transactional
    public void updateAvatar(Long userId, String style, String color,
                             String skinColor, String hairColor) {
        String normalized = style == null ? "" : style.trim().toUpperCase();
        if (!AVATAR_STYLES.contains(normalized)) {
            throw ApiException.badRequest("未知的角色形象");
        }
        validateAvatarColor(color, "角色主题色");
        validateAvatarColor(skinColor, "角色肤色");
        validateAvatarColor(hairColor, "角色发色");
        User user = mustFind(userId);
        user.setAvatarStyle(normalized);
        user.setAvatarColor(color.toUpperCase());
        user.setAvatarSkinColor(skinColor.toUpperCase());
        user.setAvatarHairColor(hairColor.toUpperCase());
        userRepository.save(user);
    }

    private void validateAvatarColor(String color, String field) {
        if (color == null || !color.matches("^#[0-9a-fA-F]{6}$")) {
            throw ApiException.badRequest(field + "格式不正确");
        }
    }

    // ================= 内部实现 =================

    private Map<String, Object> planetOf(Long userId, boolean withMessages) {
        User user = mustFind(userId);
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);

        Map<String, Object> m = new HashMap<>();
        m.put("nickname", user.getNickname());
        m.put("planetName", user.getPlanetName() == null || user.getPlanetName().isBlank()
                ? user.getNickname() + " 的星球" : user.getPlanetName());
        m.put("xp", user.getXp());
        m.put("points", user.getPoints());
        m.put("level", GamificationService.levelOf(user.getXp()));
        m.put("buildings", buildings(userId));
        m.put("health", health(userId));
        // 兼容升级前已经存在的用户：旧数据没有 avatarStyle，Set.of.contains(null)
        // 会直接抛出 NPE，导致整个星球首页无法打开。
        String avatarStyle = user.getAvatarStyle() != null
                && AVATAR_STYLES.contains(user.getAvatarStyle())
                ? user.getAvatarStyle() : "EXPLORER";
        String avatarColor = user.getAvatarColor() != null
                && user.getAvatarColor().matches("^#[0-9a-fA-F]{6}$")
                ? user.getAvatarColor() : "#57E6D5";
        String skinColor = user.getAvatarSkinColor() != null
                && user.getAvatarSkinColor().matches("^#[0-9a-fA-F]{6}$")
                ? user.getAvatarSkinColor() : "#E0AD82";
        String hairColor = user.getAvatarHairColor() != null
                && user.getAvatarHairColor().matches("^#[0-9a-fA-F]{6}$")
                ? user.getAvatarHairColor() : "#4C3328";
        m.put("avatar", Map.of(
                "style", avatarStyle,
                "color", avatarColor,
                "skinColor", skinColor,
                "hairColor", hairColor));
        List<WorldObject> worldObjects = worldObjectRepository.findByUserIdOrderByCreatedAtAsc(userId);
        int unlockedEpoch = unlockedEpoch(worldObjects);
        Set<WorldItem> ownedKinds = worldObjects.stream()
                .map(WorldObject::getKind)
                .collect(Collectors.toSet());
        m.put("worldObjects", worldObjects.stream()
                .map(WorldObjectView::from)
                .toList());
        m.put("unlockedEpoch", unlockedEpoch);
        m.put("worldCatalog", Arrays.stream(WorldItem.values())
                .map(item -> {
                    boolean locked = unlockedEpoch <
                            (item.isKeystone() ? item.getEpoch() - 1 : item.getEpoch());
                    Map<String, Object> im = new HashMap<>();
                    im.put("code", item.name());
                    im.put("title", item.getTitle());
                    im.put("category", item.getCategory());
                    im.put("cost", item.getCost());
                    im.put("description", item.getDescription());
                    im.put("epoch", item.getEpoch());
                    im.put("keystone", item.isKeystone());
                    im.put("maxLevel", item.getMaxLevel());
                    im.put("locked", locked);
                    im.put("owned", ownedKinds.contains(item));
                    return im;
                })
                .toList());
        m.put("decorations", decorationRepository.findByUserIdOrderByCreatedAtAsc(userId).stream()
                .map(d -> {
                    Map<String, Object> dm = new HashMap<>();
                    dm.put("id", d.getId());
                    dm.put("code", d.getCode().name());
                    dm.put("emoji", d.getCode().getEmoji());
                    dm.put("title", d.getCode().getTitle());
                    dm.put("orbit", d.getCode().isOrbit());
                    dm.put("posX", d.getPosX());
                    return dm;
                })
                .toList());
        m.put("catalog", Arrays.stream(DecorationItem.values())
                .map(item -> Map.<String, Object>of(
                        "code", item.name(),
                        "emoji", item.getEmoji(),
                        "title", item.getTitle(),
                        "cost", item.getCost(),
                        "orbit", item.isOrbit()))
                .toList());
        m.put("today", Map.of(
                "checkins", checkinRepository.findByUserIdAndCheckinDate(userId, today).size(),
                "focusMinutes", focusRepository.sumMinutes(userId, dayStart, dayEnd)));
        if (withMessages) {
            m.put("messages", messageRepository.findTop10ByOwnerIdOrderByCreatedAtDesc(userId));
        }
        return m;
    }

    /** 各分类建筑：累计打卡次数 → 建筑等级 */
    private List<Map<String, Object>> buildings(Long userId) {
        List<Habit> allHabits = habitRepository.findByUserId(userId);
        Map<Long, HabitCategory> habitCategory = allHabits.stream()
                .collect(Collectors.toMap(Habit::getId, Habit::getCategory));

        Map<HabitCategory, Integer> counts = new EnumMap<>(HabitCategory.class);
        for (HabitCheckin c : checkinRepository.findByUserId(userId)) {
            HabitCategory cat = habitCategory.get(c.getHabitId());
            if (cat != null) {
                counts.merge(cat, 1, Integer::sum);
            }
        }
        // 有未归档习惯但还没打过卡的分类也要出现（工地状态）
        Set<HabitCategory> active = allHabits.stream()
                .filter(h -> !h.isArchived())
                .map(Habit::getCategory)
                .collect(Collectors.toSet());

        List<Map<String, Object>> result = new ArrayList<>();
        for (HabitCategory cat : HabitCategory.values()) {
            int count = counts.getOrDefault(cat, 0);
            if (count == 0 && !active.contains(cat)) {
                continue;
            }
            result.add(Map.of(
                    "category", cat.name(),
                    "title", cat.getTitle(),
                    "checkins", count,
                    "level", buildingLevel(count)));
        }
        return result;
    }

    private int buildingLevel(int checkins) {
        int level = 0;
        for (int threshold : LEVEL_THRESHOLDS) {
            if (checkins >= threshold) {
                level++;
            }
        }
        return level; // 0=工地, 1..4
    }

    private double placementRadius(WorldItem item) {
        return switch (item) {
            case CASTLE -> 22;
            case LIBRARY -> 18;
            case ARK -> 16;
            case FARM, LAKE -> 15;
            case FOREST -> 13;
            case OBSERVATORY -> 12;
            case SEEDVAULT -> 10;
            case CABIN, PAVILION, FOUNTAIN, CAMP, GARDEN,
                 CRATER, SPRING, ATMOSPHERE, COMET, SOUP -> 8;
            default -> 6; // ROCKS/CRYSTAL/ROVER/STROMA/MUSHROOM/FIREFLY
        };
    }

    /** 健康度：最近 7 天失败/产出 → FLOURISHING / GLOOMY / DESERT */
    private Map<String, Object> health(Long userId) {
        LocalDate today = LocalDate.now();
        LocalDateTime weekAgo = today.minusDays(6).atStartOfDay();
        List<PointLog> logs = pointLogRepository.findByUserIdAndCreatedAtBetween(
                userId, weekAgo, today.plusDays(1).atStartOfDay());

        Set<LocalDate> failedDays = new HashSet<>();
        Set<LocalDate> productiveDays = new HashSet<>();
        for (PointLog log : logs) {
            LocalDate day = log.getCreatedAt().toLocalDate();
            if (log.getKind() == PointKind.PUNISH) {
                failedDays.add(day);
            } else if (log.getKind() == PointKind.CHECKIN || log.getKind() == PointKind.TASK
                    || log.getKind() == PointKind.FOCUS || log.getKind() == PointKind.STREAK) {
                productiveDays.add(day);
            }
        }

        // 从今天往回数连续「颓废日」（有失败且无产出；今天无任何记录不打断也不累计）
        int failStreak = 0;
        for (LocalDate d = today; !d.isBefore(today.minusDays(6)); d = d.minusDays(1)) {
            boolean failed = failedDays.contains(d);
            boolean productive = productiveDays.contains(d);
            if (productive) {
                break;
            }
            if (failed) {
                failStreak++;
            }
        }

        String state = failStreak >= 4 ? "DESERT" : (failStreak >= 2 ? "GLOOMY" : "FLOURISHING");
        return Map.of(
                "state", state,
                "failStreak", failStreak,
                "recentFails", failedDays.size(),
                "recentProductiveDays", productiveDays.size());
    }

    private User mustFind(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));
    }
}
