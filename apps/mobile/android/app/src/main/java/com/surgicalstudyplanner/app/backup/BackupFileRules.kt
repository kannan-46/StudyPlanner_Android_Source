package com.surgicalstudyplanner.app.backup

/** Pure rules for backup files. No Android imports: unit-tested on the JVM. */
object BackupFileRules {
    const val DEFAULT_FILE_NAME = "surgical-study-planner-backup.json"

    /**
     * Largest backup file the app reads (8 MiB). A full account (5,000 topics)
     * exported pretty-printed by older versions is about 5-6 MB.
     */
    const val MAX_BACKUP_BYTES = 8 * 1024 * 1024

    /** Rejection code for a file over [MAX_BACKUP_BYTES], so the app can say why. */
    const val E_TOO_LARGE = "E_TOO_LARGE"

    private const val MAX_NAME_CHARS = 120
    private val UNSAFE = Regex("""[\\/:*?"<>|\p{Cntrl}]""")

    fun isTooLarge(totalBytes: Long): Boolean = totalBytes > MAX_BACKUP_BYTES

    /**
     * The name suggested in the save dialog: [requested] made safe (no folders
     * or characters file systems reject), ending in .json, or the default name
     * when it is blank.
     */
    fun fileName(requested: String?): String {
        val cleaned = UNSAFE.replace(requested.orEmpty(), "").trim()
        val withoutExtension =
            if (cleaned.endsWith(".json", ignoreCase = true)) cleaned.dropLast(5) else cleaned
        val base = withoutExtension.trim(' ', '.').take(MAX_NAME_CHARS - 5).trimEnd(' ', '.')
        if (base.isEmpty()) return DEFAULT_FILE_NAME
        return "$base.json"
    }
}
