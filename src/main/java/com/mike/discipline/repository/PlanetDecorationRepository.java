package com.mike.discipline.repository;

import com.mike.discipline.entity.PlanetDecoration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanetDecorationRepository extends JpaRepository<PlanetDecoration, Long> {

    List<PlanetDecoration> findByUserIdOrderByCreatedAtAsc(Long userId);
}
