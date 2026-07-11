package com.mike.discipline.repository;

import com.mike.discipline.entity.WorldObject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorldObjectRepository extends JpaRepository<WorldObject, Long> {

    List<WorldObject> findByUserIdOrderByCreatedAtAsc(Long userId);
}
