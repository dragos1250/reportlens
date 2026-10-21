package dev.reportlens.backend.conversation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    List<Conversation> findAllByOrderByCreatedAtDesc();
}
