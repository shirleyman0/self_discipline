package com.mike.discipline.repository;

import com.mike.discipline.entity.Review;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    Optional<Review> findByUserIdAndReviewDate(Long userId, LocalDate date);

    List<Review> findTop30ByUserIdOrderByReviewDateDesc(Long userId);
}
