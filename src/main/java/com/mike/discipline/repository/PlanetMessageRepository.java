package com.mike.discipline.repository;

import com.mike.discipline.entity.PlanetMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanetMessageRepository extends JpaRepository<PlanetMessage, Long> {

    List<PlanetMessage> findTop10ByOwnerIdOrderByCreatedAtDesc(Long ownerId);

    /** 带实物礼物的留言会永久留在星球地表。 */
    List<PlanetMessage> findByOwnerIdAndGiftIsNotNullOrderByCreatedAtAsc(Long ownerId);
}
