package com.surgicalstudyplanner.app.backup

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupFileRulesTest {
    @Test fun limitCoversAFullAccount() {
        // 5,000 topics exported pretty-printed by older versions: about 5-6 MB.
        assertFalse(BackupFileRules.isTooLarge(6_000_000L))
        assertFalse(BackupFileRules.isTooLarge(BackupFileRules.MAX_BACKUP_BYTES.toLong()))
        assertTrue(BackupFileRules.isTooLarge(BackupFileRules.MAX_BACKUP_BYTES + 1L))
    }

    @Test fun tooLargeHasItsOwnCode() {
        assertEquals("E_TOO_LARGE", BackupFileRules.E_TOO_LARGE)
    }

    @Test fun keepsADatedName() {
        assertEquals(
            "surgical-study-planner-backup-2026-11-16.json",
            BackupFileRules.fileName("surgical-study-planner-backup-2026-11-16.json"),
        )
    }

    @Test fun blankFallsBackToTheDefault() {
        assertEquals(BackupFileRules.DEFAULT_FILE_NAME, BackupFileRules.fileName(""))
        assertEquals(BackupFileRules.DEFAULT_FILE_NAME, BackupFileRules.fileName("   "))
        assertEquals(BackupFileRules.DEFAULT_FILE_NAME, BackupFileRules.fileName(null))
        assertEquals(BackupFileRules.DEFAULT_FILE_NAME, BackupFileRules.fileName(".json"))
    }

    @Test fun addsTheJsonExtension() {
        assertEquals("my-backup.json", BackupFileRules.fileName("my-backup"))
        assertEquals("my-backup.json", BackupFileRules.fileName("my-backup.JSON"))
    }

    @Test fun removesFoldersAndUnsafeCharacters() {
        assertEquals("etcpasswd.json", BackupFileRules.fileName("../etc/passwd"))
        assertEquals("ab.json", BackupFileRules.fileName("a:*?\"<>|\nb.json"))
    }

    @Test fun capsTheLength() {
        val name = BackupFileRules.fileName("x".repeat(500))
        assertEquals(120, name.length)
        assertTrue(name.endsWith(".json"))
    }
}
