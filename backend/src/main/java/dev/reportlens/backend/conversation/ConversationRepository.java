package dev.reportlens.backend.conversation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    List<Conversation> findAllByOrderByCreatedAtDesc();

    /** Conversations about a document, as the only or the second report; messages cascade in the database. */
    @Modifying
    @Transactional
    @Query("DELETE FROM Conversation c WHERE c.docId = :docId OR c.compareDocId = :docId")
    int deleteByDocument(String docId);
}
