package com.surgicalstudyplanner.app.backup

import java.io.ByteArrayInputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.io.StringReader
import java.io.IOException
import java.util.zip.ZipInputStream
import javax.xml.parsers.SAXParserFactory
import org.xml.sax.Attributes
import org.xml.sax.InputSource
import org.xml.sax.SAXException
import org.xml.sax.helpers.DefaultHandler

/** One sheet: every cell as text ('' when empty); rows[0] is row 1, cells[0] column A. */
data class SheetData(val name: String, val rows: List<List<String>>, val truncated: Boolean)

data class SpreadsheetData(val fileName: String, val sheets: List<SheetData>) {
    /** {"fileName":..,"sheets":[{"name":..,"truncated":..,"rows":[[..]]}]} */
    fun toJson(): String {
        val out = StringBuilder()
        out.append("{\"fileName\":").appendJson(fileName).append(",\"sheets\":[")
        sheets.forEachIndexed { i, sheet ->
            if (i > 0) out.append(',')
            out.append("{\"name\":").appendJson(sheet.name)
            out.append(",\"truncated\":").append(sheet.truncated)
            out.append(",\"rows\":[")
            sheet.rows.forEachIndexed { r, row ->
                if (r > 0) out.append(',')
                out.append('[')
                row.forEachIndexed { c, cell ->
                    if (c > 0) out.append(',')
                    out.appendJson(cell)
                }
                out.append(']')
            }
            out.append("]}")
        }
        return out.append("]}").toString()
    }
}

/** A file that cannot be read as a spreadsheet; [code] tells the app why. */
class SpreadsheetException(val code: String, message: String) : RuntimeException(message)

private fun StringBuilder.appendJson(s: String): StringBuilder {
    append('"')
    for (ch in s) {
        when {
            ch == '"' -> append("\\\"")
            ch == '\\' -> append("\\\\")
            ch == '\n' -> append("\\n")
            ch == '\r' -> append("\\r")
            ch == '\t' -> append("\\t")
            ch < ' ' || ch == ' ' || ch == ' ' ->
                append("\\u").append(String.format("%04x", ch.code))
            else -> append(ch)
        }
    }
    return append('"')
}

/**
 * Reads an .xlsx workbook (every sheet) or a .csv file into text cells. Pure
 * JVM code (java.util.zip and SAX, no Android imports), so it is unit-tested
 * on the JVM. Numbers keep their stored text, so dates stay Excel serials.
 */
object SpreadsheetReader {
    const val E_NOT_SPREADSHEET = "E_NOT_SPREADSHEET"
    const val E_OLD_XLS = "E_OLD_XLS"

    /** Rows read per sheet (5,000 topics x 6 revisions fit). */
    const val MAX_ROWS = 40_000
    /** Columns read per row (A to AZ). */
    const val MAX_COLUMNS = 52
    const val MAX_SHEETS = 50
    /** Cells read over the whole file. */
    const val MAX_CELLS = 1_500_000
    /** Longest text kept in one cell (Excel's own limit). */
    const val MAX_CELL_CHARS = 32_767
    /** Unzipped size allowed for any one part of the workbook. */
    const val MAX_PART_BYTES = 64L * 1024 * 1024

    private val OLE2 = byteArrayOf(
        0xD0.toByte(), 0xCF.toByte(), 0x11, 0xE0.toByte(),
        0xA1.toByte(), 0xB1.toByte(), 0x1A, 0xE1.toByte(),
    )

    fun read(bytes: ByteArray, fileName: String): SpreadsheetData {
        if (startsWith(bytes, OLE2)) {
            throw SpreadsheetException(E_OLD_XLS, "This is an old .xls file.")
        }
        val isZip = bytes.size >= 4 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()
        if (isZip) return SpreadsheetData(fileName, readXlsx(bytes))
        if (looksLikeCsv(bytes, fileName)) {
            val base = fileName.substringBeforeLast('.').ifBlank { "Sheet1" }
            return SpreadsheetData(fileName, listOf(readCsv(bytes, base)))
        }
        throw SpreadsheetException(E_NOT_SPREADSHEET, "This file is not a spreadsheet.")
    }

    private fun startsWith(bytes: ByteArray, prefix: ByteArray): Boolean =
        bytes.size >= prefix.size && prefix.indices.all { bytes[it] == prefix[it] }

    private fun notSpreadsheet(): SpreadsheetException =
        SpreadsheetException(E_NOT_SPREADSHEET, "This file is not a spreadsheet.")

    // ---------- csv ----------

    private fun looksLikeCsv(bytes: ByteArray, fileName: String): Boolean {
        val lower = fileName.lowercase()
        if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) return true
        // No name hint: text without NUL bytes in the first 4 KB.
        val head = bytes.take(4096)
        return head.isNotEmpty() && head.none { it == 0.toByte() }
    }

    fun readCsv(bytes: ByteArray, sheetName: String): SheetData {
        var text = bytes.toString(Charsets.UTF_8)
        if (text.startsWith('﻿')) text = text.substring(1)
        val firstLine = text.lineSequence().firstOrNull().orEmpty()
        val delimiter = listOf(',', ';', '\t').maxByOrNull { d -> firstLine.count { it == d } } ?: ','
        val rows = ArrayList<List<String>>()
        var row = ArrayList<String>()
        val cell = StringBuilder()
        var quoted = false
        var truncated = false
        var i = 0
        fun endCell() {
            if (row.size < MAX_COLUMNS) row.add(cell.toString().take(MAX_CELL_CHARS))
            cell.setLength(0)
        }
        fun endRow(): Boolean {
            endCell()
            rows.add(trimRow(row))
            row = ArrayList()
            if (rows.size >= MAX_ROWS) {
                truncated = true
                return false
            }
            return true
        }
        while (i < text.length) {
            val ch = text[i]
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < text.length && text[i + 1] == '"') {
                        cell.append('"')
                        i++
                    } else {
                        quoted = false
                    }
                } else {
                    cell.append(ch)
                }
            } else when (ch) {
                '"' -> quoted = true
                delimiter -> endCell()
                '\r' -> {
                    if (i + 1 < text.length && text[i + 1] == '\n') i++
                    if (!endRow()) break
                }
                '\n' -> if (!endRow()) break
                else -> cell.append(ch)
            }
            i++
        }
        if (truncated) {
            // Stopped at the row limit: only cut short if more text follows.
            truncated = text.substring(minOf(i + 1, text.length)).isNotBlank()
        } else if (cell.isNotEmpty() || row.isNotEmpty()) {
            endRow()
        }
        return SheetData(sheetName, trimRows(rows), truncated)
    }

    // ---------- xlsx ----------

    private class StopReading : RuntimeException()

    /** Lets a SAX parser read one zip entry without closing the zip stream. */
    private class EntryStream(input: InputStream) : FilterInputStream(input) {
        private var total = 0L
        override fun read(): Int {
            val b = super.read()
            if (b >= 0) count(1)
            return b
        }
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            val n = super.read(b, off, len)
            if (n > 0) count(n)
            return n
        }
        private fun count(n: Int) {
            total += n
            if (total > MAX_PART_BYTES) {
                throw SpreadsheetException(BackupFileRules.E_TOO_LARGE, "The spreadsheet is too large.")
            }
        }
        override fun close() {}
    }

    private fun forEachEntry(bytes: ByteArray, block: (String, InputStream) -> Unit) {
        try {
            ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    if (!entry.isDirectory) block(entry.name.trimStart('/'), EntryStream(zip))
                    zip.closeEntry()
                }
            }
        } catch (e: IOException) {
            // A damaged zip (ZipException and EOFException are IOExceptions).
            throw notSpreadsheet()
        } catch (e: IllegalArgumentException) {
            // Bad entry names in a damaged zip.
            throw notSpreadsheet()
        }
    }

    private fun parse(input: InputStream, handler: DefaultHandler) {
        val factory = SAXParserFactory.newInstance()
        factory.isNamespaceAware = true
        for (feature in listOf(
            "http://xml.org/sax/features/external-general-entities",
            "http://xml.org/sax/features/external-parameter-entities",
        )) {
            try {
                factory.setFeature(feature, false)
            } catch (_: Exception) {
            }
        }
        val reader = factory.newSAXParser().xmlReader
        reader.contentHandler = handler
        // Never fetch anything a workbook points at.
        reader.setEntityResolver { _, _ -> InputSource(StringReader("")) }
        try {
            reader.parse(InputSource(input))
        } catch (e: Exception) {
            // Parsers may wrap what the handler or the stream threw.
            var cause: Throwable? = e
            while (cause != null) {
                if (cause is StopReading) return
                if (cause is SpreadsheetException) throw cause
                cause = if (cause is SAXException) cause.exception ?: cause.cause else cause.cause
            }
            throw notSpreadsheet()
        }
    }

    private fun local(localName: String?, qName: String?): String =
        if (!localName.isNullOrEmpty()) localName else qName.orEmpty().substringAfter(':')

    private fun attr(attributes: Attributes, name: String): String? {
        for (i in 0 until attributes.length) {
            if (local(attributes.getLocalName(i), attributes.getQName(i)) == name) {
                return attributes.getValue(i)
            }
        }
        return null
    }

    private fun readXlsx(bytes: ByteArray): List<SheetData> {
        val sheets = ArrayList<Pair<String, String>>() // name, relationship id
        val targets = HashMap<String, String>() // relationship id -> part path
        val shared = ArrayList<String>()
        var hasWorkbook = false
        forEachEntry(bytes) { name, input ->
            when (name) {
                "xl/workbook.xml" -> {
                    hasWorkbook = true
                    parse(input, object : DefaultHandler() {
                        override fun startElement(uri: String?, localName: String?, qName: String?, attributes: Attributes) {
                            if (local(localName, qName) == "sheet" && sheets.size < MAX_SHEETS) {
                                val id = attr(attributes, "id") ?: return
                                sheets.add((attr(attributes, "name") ?: "Sheet${sheets.size + 1}") to id)
                            }
                        }
                    })
                }
                "xl/_rels/workbook.xml.rels" -> parse(input, object : DefaultHandler() {
                    override fun startElement(uri: String?, localName: String?, qName: String?, attributes: Attributes) {
                        if (local(localName, qName) != "Relationship") return
                        val id = attr(attributes, "Id") ?: return
                        val target = attr(attributes, "Target") ?: return
                        targets[id] = resolvePart(target)
                    }
                })
                "xl/sharedStrings.xml" -> parse(input, SharedStringsHandler(shared))
            }
        }
        if (!hasWorkbook) throw notSpreadsheet()

        val wanted = HashMap<String, String>() // part path -> sheet name
        for ((sheetName, id) in sheets) targets[id]?.let { wanted[it] = sheetName }
        val read = HashMap<String, SheetData>()
        val budget = intArrayOf(MAX_CELLS)
        forEachEntry(bytes) { name, input ->
            val sheetName = wanted[name] ?: return@forEachEntry
            val handler = SheetHandler(shared, budget)
            parse(input, handler)
            read[name] = SheetData(sheetName, trimRows(handler.rows), handler.truncated)
        }
        return sheets.mapNotNull { (_, id) -> targets[id]?.let { read[it] } }
    }

    /** "worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml" -> "xl/worksheets/sheet1.xml". */
    fun resolvePart(target: String): String {
        val path = if (target.startsWith("/")) target.substring(1) else "xl/$target"
        val parts = ArrayList<String>()
        for (p in path.split('/')) {
            when (p) {
                "", "." -> {}
                ".." -> if (parts.isNotEmpty()) parts.removeAt(parts.size - 1)
                else -> parts.add(p)
            }
        }
        return parts.joinToString("/")
    }

    private class SharedStringsHandler(val out: MutableList<String>) : DefaultHandler() {
        private val text = StringBuilder()
        private var inText = false
        private var phonetic = 0

        override fun startElement(uri: String?, localName: String?, qName: String?, attributes: Attributes) {
            when (local(localName, qName)) {
                "si" -> text.setLength(0)
                "rPh" -> phonetic++
                "t" -> inText = phonetic == 0
            }
        }

        override fun endElement(uri: String?, localName: String?, qName: String?) {
            when (local(localName, qName)) {
                "si" -> out.add(text.toString())
                "rPh" -> phonetic--
                "t" -> inText = false
            }
        }

        override fun characters(ch: CharArray, start: Int, length: Int) {
            if (inText && text.length < MAX_CELL_CHARS) text.append(ch, start, length)
        }
    }

    private class SheetHandler(val shared: List<String>, val budget: IntArray) : DefaultHandler() {
        val rows = ArrayList<List<String>>()
        var truncated = false

        private var rowIndex = -1
        private var cells = ArrayList<String>()
        private var column = -1
        private var type: String? = null
        private val value = StringBuilder()
        private val inline = StringBuilder()
        private var inValue = false
        private var inInline = false
        private var inInlineText = false
        private var phonetic = 0

        override fun startElement(uri: String?, localName: String?, qName: String?, attributes: Attributes) {
            when (local(localName, qName)) {
                "row" -> {
                    val r = attr(attributes, "r")?.toIntOrNull()
                    rowIndex = if (r != null && r >= 1) r - 1 else rowIndex + 1
                    if (rowIndex >= MAX_ROWS) {
                        truncated = true
                        throw StopReading()
                    }
                    cells = ArrayList()
                    column = -1
                }
                "c" -> {
                    val ref = attr(attributes, "r")
                    column = ref?.let { columnIndex(it) } ?: (column + 1)
                    type = attr(attributes, "t")
                    value.setLength(0)
                    inline.setLength(0)
                }
                "v" -> inValue = true
                "is" -> inInline = true
                "rPh" -> phonetic++
                "t" -> inInlineText = inInline && phonetic == 0
            }
        }

        override fun endElement(uri: String?, localName: String?, qName: String?) {
            when (local(localName, qName)) {
                "v" -> inValue = false
                "is" -> inInline = false
                "rPh" -> phonetic--
                "t" -> inInlineText = false
                "c" -> {
                    if (column in 0 until MAX_COLUMNS) {
                        if (budget[0] <= 0) {
                            truncated = true
                            throw StopReading()
                        }
                        budget[0]--
                        while (cells.size < column) cells.add("")
                        val text = cellText()
                        if (cells.size == column) cells.add(text) else cells[column] = text
                    }
                }
                "row" -> {
                    while (rows.size < rowIndex) rows.add(emptyList())
                    val row = trimRow(cells)
                    if (rows.size == rowIndex) rows.add(row) else if (rows[rowIndex].isEmpty()) rows[rowIndex] = row
                }
            }
        }

        override fun characters(ch: CharArray, start: Int, length: Int) {
            if (inValue && value.length < MAX_CELL_CHARS) value.append(ch, start, length)
            if (inInlineText && inline.length < MAX_CELL_CHARS) inline.append(ch, start, length)
        }

        private fun cellText(): String {
            val v = value.toString()
            return when (type) {
                "s" -> v.trim().toIntOrNull()?.let { shared.getOrNull(it) } ?: ""
                "inlineStr" -> inline.toString()
                "b" -> if (v.trim() == "1") "TRUE" else if (v.isBlank()) "" else "FALSE"
                "str", "e", "d" -> v
                else -> number(v)
            }
        }
    }

    /** Stored numbers as written, except float noise like 4.0000000000000009 -> 4. */
    fun number(raw: String): String {
        val s = raw.trim()
        val d = s.toDoubleOrNull() ?: return s
        if (s.contains('E') || s.contains('e') || s.contains('.')) {
            val rounded = Math.round(d)
            if (Math.abs(d) < 1e15 && Math.abs(d - rounded) < 1e-9) return rounded.toString()
        }
        return s
    }

    /** "C5" -> 2, "AA10" -> 26; null when there are no column letters. */
    fun columnIndex(ref: String): Int? {
        var n = 0
        var letters = 0
        for (ch in ref) {
            val up = ch.uppercaseChar()
            if (up in 'A'..'Z') {
                n = n * 26 + (up - 'A' + 1)
                letters++
                if (letters > 3) return null
            } else {
                break
            }
        }
        return if (letters == 0) null else n - 1
    }

    private fun trimRow(row: List<String>): List<String> {
        var end = row.size
        while (end > 0 && row[end - 1].isEmpty()) end--
        return if (end == row.size) row else row.subList(0, end).toList()
    }

    private fun trimRows(rows: List<List<String>>): List<List<String>> {
        var end = rows.size
        while (end > 0 && rows[end - 1].isEmpty()) end--
        return rows.subList(0, end).toList()
    }
}
