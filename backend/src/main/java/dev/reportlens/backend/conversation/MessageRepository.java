package dev.reportlens.backend.conversation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByConversationIdOrderByIdAsc(UUID conversationId);

    /** Estimated LLM cost of all answers since the given time; null when there are none. */
    @Query("SELECT SUM(m.costUsd) FROM Message m WHERE m.createdAt >= :since")
    BigDecimal sumCostSince(OffsetDateTime since);
}
