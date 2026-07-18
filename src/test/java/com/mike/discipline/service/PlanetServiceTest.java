package com.mike.discipline.service;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlanetServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private HabitRepository habitRepository;
    @Mock
    private HabitCheckinRepository checkinRepository;
    @Mock
    private PointLogRepository pointLogRepository;
    @Mock
    private FocusSessionRepository focusRepository;
    @Mock
    private PlanetMessageRepository messageRepository;
    @Mock
    private PlanetDecorationRepository decorationRepository;
    @Mock
    private GamificationService gamificationService;
    @Mock
    private WorldObjectRepository worldObjectRepository;

    private PlanetService planetService;

    @BeforeEach
    void setUp() {
        planetService = new PlanetService(userRepository, habitRepository, checkinRepository,
                pointLogRepository, focusRepository, messageRepository, decorationRepository,
                gamificationService, worldObjectRepository);
    }

    @Test
    void buildRejectsMissingCoordinateBeforeTouchingPersistence() {
        ApiException error = assertThrows(ApiException.class,
                () -> planetService.buildWorldObject(1L, "FOREST", null, 10.0));

        assertEquals("建造坐标不能为空且必须是有效数字", error.getMessage());
        verifyNoInteractions(userRepository, worldObjectRepository, gamificationService);
    }

    @Test
    void buildKeepsWholeCastleInsideWorldBoundary() {
        // 城堡半径为 22，世界边界为 190，所以中心最大只能到 168。
        ApiException error = assertThrows(ApiException.class,
                () -> planetService.buildWorldObject(1L, "CASTLE", 168.1, 0.0));

        assertEquals("只能在星球可建造区域内放置", error.getMessage());
        verifyNoInteractions(userRepository, worldObjectRepository, gamificationService);
    }

    @Test
    void buildUsesSumOfBothRadiiForCollisionDetection() {
        User user = user(1L, 1_000);
        WorldObject rocks = worldObject(8L, WorldItem.ROCKS, 25.0, 0.0);
        // 方舟已经建成，文明纪（城堡）才处于解锁状态。
        WorldObject ark = worldObject(9L, WorldItem.ARK, -100.0, -100.0);
        when(userRepository.findForUpdateById(1L)).thenReturn(Optional.of(user));
        when(worldObjectRepository.findByUserIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(rocks, ark));

        // 城堡半径 22 + 岩石半径 6 = 28；中心距 25 必须被拒绝。
        ApiException error = assertThrows(ApiException.class,
                () -> planetService.buildWorldObject(1L, "CASTLE", 0.0, 0.0));

        assertEquals("这里离其他建筑太近，请换一个位置", error.getMessage());
        verify(gamificationService, never()).redeem(any(), anyLong(), any());
        verify(worldObjectRepository, never()).save(any());
    }

    @Test
    void buildAcceptsExactBoundaryAndPersistsNormalizedObject() {
        User user = user(1L, 1_000);
        WorldObject ark = worldObject(9L, WorldItem.ARK, -100.0, -100.0);
        when(userRepository.findForUpdateById(1L)).thenReturn(Optional.of(user));
        when(worldObjectRepository.findByUserIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(ark));
        when(gamificationService.redeem(eq(1L), eq(800L), any())).thenReturn(200L);
        when(worldObjectRepository.save(any(WorldObject.class))).thenAnswer(invocation -> {
            WorldObject object = invocation.getArgument(0);
            object.setId(99L);
            return object;
        });

        PlanetService.WorldObjectView view =
                planetService.buildWorldObject(1L, "castle", 168.0, 1.04);

        assertEquals(99L, view.id());
        assertEquals("CASTLE", view.kind());
        assertEquals(168.0, view.x());
        assertEquals(1.0, view.z());

        ArgumentCaptor<WorldObject> captor = ArgumentCaptor.forClass(WorldObject.class);
        verify(worldObjectRepository).save(captor.capture());
        assertEquals(WorldItem.CASTLE, captor.getValue().getKind());
        assertEquals(168.0, captor.getValue().getX());
        assertEquals(1.0, captor.getValue().getZ());
    }

    private User user(Long id, long points) {
        User user = new User();
        user.setId(id);
        user.setPoints(points);
        return user;
    }

    private WorldObject worldObject(Long id, WorldItem kind, double x, double z) {
        WorldObject object = new WorldObject();
        object.setId(id);
        object.setUserId(1L);
        object.setKind(kind);
        object.setX(x);
        object.setZ(z);
        return object;
    }
}
