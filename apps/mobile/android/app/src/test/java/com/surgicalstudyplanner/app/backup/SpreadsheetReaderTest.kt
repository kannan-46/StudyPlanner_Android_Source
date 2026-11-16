package com.surgicalstudyplanner.app.backup

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Builds small synthetic workbooks in memory; no real files are used. */
class SpreadsheetReaderTest {
    private fun zip(parts: Map<String, String>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            for ((name, text) in parts) {
                z.putNextEntry(ZipEntry(name))
                z.write(text.toByteArray(Charsets.UTF_8))
                z.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private val ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    private val relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

    private fun workbook(sheets: List<Pair<String, String>>, shared: String? = null): ByteArray {
        val wb = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <workbook xmlns="$ns" xmlns:r="$relNs"><sheets>""" +
            sheets.mapIndexed { i, (name, _) ->
                """<sheet name="$name" sheetId="${i + 1}" r:id="rId${i + 1}"/>"""
            }.joinToString("") + "</sheets></workbook>"
        val rels = """<?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">""" +
            sheets.indices.joinToString("") { i ->
                // One relative and one absolute target, as different apps write them.
                val target = if (i == 0) "worksheets/sheet1.xml" else "/xl/worksheets/sheet${i + 1}.xml"
                """<Relationship Id="rId${i + 1}" Type="$relNs/worksheet" Target="$target"/>"""
            } + "</Relationships>"
        val parts = linkedMapOf(
            // The sheets come before the workbook in the zip on purpose.
            *sheets.mapIndexed { i, (_, body) ->
                "xl/worksheets/sheet${i + 1}.xml" to
                    """<?xml version="1.0"?><worksheet xmlns="$ns"><sheetData>$body</sheetData></worksheet>"""
            }.toTypedArray(),
            "xl/workbook.xml" to wb,
            "xl/_rels/workbook.xml.rels" to rels,
            "[Content_Types].xml" to "<Types/>",
        )
        if (shared != null) parts["xl/sharedStrings.xml"] = """<?xml version="1.0"?><sst xmlns="$ns">$shared</sst>"""
        return zip(parts)
    }

    @Test fun readsAllSheetsWithSharedInlineNumbersAndBooleans() {
        val shared = "<si><t>Book</t></si><si><t>Topic</t></si><si><t>SRB</t></si>" +
            "<si><r><t>Inguinal </t></r><r><t>hernia</t></r><rPh><t>x</t></rPh></si>"
        val revisions = """
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>
              <c r="C1" t="inlineStr"><is><t>First-reading date</t></is></c></row>
            <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="s"><v>3</v></c>
              <c r="C3"><v>46342</v></c><c r="E3" t="b"><v>1</v></c>
              <c r="F3"><f>C3+4</f><v>46346</v></c><c r="G3" t="str"><f>"Pen"&amp;"ding"</f><v>Pending</v></c>
              <c r="H3"><v>4.0000000000000009</v></c><c r="I3" t="b"><v>0</v></c></row>
        """
        val data = SpreadsheetReader.read(
            workbook(listOf("Spaced Revision" to revisions, "Topic Bank" to """<row><c t="inlineStr"><is><t>Topic</t></is></c><c><v>2.5</v></c></row>"""), shared),
            "plan.xlsx",
        )
        assertEquals("plan.xlsx", data.fileName)
        assertEquals(listOf("Spaced Revision", "Topic Bank"), data.sheets.map { it.name })
        val rows = data.sheets[0].rows
        assertEquals(listOf("Book", "Topic", "First-reading date"), rows[0])
        assertEquals(emptyList<String>(), rows[1])
        assertEquals(
            listOf("SRB", "Inguinal hernia", "46342", "", "TRUE", "46346", "Pending", "4", "FALSE"),
            rows[2],
        )
        assertFalse(data.sheets[0].truncated)
        assertEquals(listOf(listOf("Topic", "2.5")), data.sheets[1].rows)
    }

    @Test fun cellsWithoutReferencesFollowEachOther() {
        val body = """<row><c t="inlineStr"><is><t>a</t></is></c><c r="C1"><v>3</v></c><c><v>4</v></c></row>"""
        val rows = SpreadsheetReader.read(workbook(listOf("S" to body)), "a.xlsx").sheets[0].rows
        assertEquals(listOf(listOf("a", "", "3", "4")), rows)
    }

    @Test fun stopsAtTheRowLimit() {
        val body = """<row r="1"><c><v>1</v></c></row><row r="${SpreadsheetReader.MAX_ROWS + 1}"><c><v>2</v></c></row>"""
        val sheet = SpreadsheetReader.read(workbook(listOf("S" to body)), "a.xlsx").sheets[0]
        assertTrue(sheet.truncated)
        assertEquals(listOf(listOf("1")), sheet.rows)
    }

    @Test fun ignoresColumnsPastTheLimit() {
        val body = """<row r="1"><c r="A1"><v>1</v></c><c r="ZZ1"><v>2</v></c></row>"""
        val rows = SpreadsheetReader.read(workbook(listOf("S" to body)), "a.xlsx").sheets[0].rows
        assertEquals(listOf(listOf("1")), rows)
    }

    private fun assertCode(code: String, block: () -> Unit) {
        try {
            block()
            fail("expected $code")
        } catch (e: SpreadsheetException) {
            assertEquals(code, e.code)
        }
    }

    @Test fun explainsAnOldXlsFile() {
        val ole = byteArrayOf(
            0xD0.toByte(), 0xCF.toByte(), 0x11, 0xE0.toByte(),
            0xA1.toByte(), 0xB1.toByte(), 0x1A, 0xE1.toByte(), 0, 0,
        )
        assertCode(SpreadsheetReader.E_OLD_XLS) { SpreadsheetReader.read(ole, "old.xls") }
    }

    @Test fun rejectsFilesThatAreNotSpreadsheets() {
        // A zip without a workbook (e.g. a Word file).
        assertCode(SpreadsheetReader.E_NOT_SPREADSHEET) {
            SpreadsheetReader.read(zip(mapOf("word/document.xml" to "<d/>")), "a.docx")
        }
        // A damaged zip.
        assertCode(SpreadsheetReader.E_NOT_SPREADSHEET) {
            SpreadsheetReader.read(byteArrayOf('P'.code.toByte(), 'K'.code.toByte(), 3, 4, 9, 9, 9), "a.xlsx")
        }
        // Binary data that is not a zip.
        assertCode(SpreadsheetReader.E_NOT_SPREADSHEET) {
            SpreadsheetReader.read(byteArrayOf(1, 0, 2, 0, 3), "a.bin")
        }
        // Broken XML inside the workbook.
        assertCode(SpreadsheetReader.E_NOT_SPREADSHEET) {
            SpreadsheetReader.read(workbook(listOf("S" to "<row><c><v>1</v></row>")), "a.xlsx")
        }
    }

    @Test fun readsCsvWithQuotesAndSemicolons() {
        val csv = "\uFEFFBook,Topic,Studied\r\nSRB,\"Hernia, inguinal\",46342\r\nPearls,\"Say \"\"hi\"\"\",16/11/2026\n"
        val data = SpreadsheetReader.read(csv.toByteArray(), "plan.csv")
        assertEquals("plan", data.sheets[0].name)
        assertEquals(
            listOf(
                listOf("Book", "Topic", "Studied"),
                listOf("SRB", "Hernia, inguinal", "46342"),
                listOf("Pearls", "Say \"hi\"", "16/11/2026"),
            ),
            data.sheets[0].rows,
        )
        val semi = SpreadsheetReader.read("Topic;Studied\nShock;46342".toByteArray(), "x.csv")
        assertEquals(listOf(listOf("Topic", "Studied"), listOf("Shock", "46342")), semi.sheets[0].rows)
        assertFalse(semi.sheets[0].truncated)
    }

    @Test fun writesJsonWithEscapes() {
        val json = SpreadsheetData(
            "a\"b.xlsx",
            listOf(SheetData("S\\1", listOf(listOf("x\ny", "\u0001"), emptyList()), true)),
        ).toJson()
        assertEquals(
            "{\"fileName\":\"a\\\"b.xlsx\",\"sheets\":[{\"name\":\"S\\\\1\",\"truncated\":true," +
                "\"rows\":[[\"x\\ny\",\"\\u0001\"],[]]}]}",
            json,
        )
    }

    @Test fun helpers() {
        assertEquals(0, SpreadsheetReader.columnIndex("A1"))
        assertEquals(26, SpreadsheetReader.columnIndex("AA10"))
        assertEquals(null, SpreadsheetReader.columnIndex("12"))
        assertEquals("xl/worksheets/sheet1.xml", SpreadsheetReader.resolvePart("worksheets/sheet1.xml"))
        assertEquals("xl/worksheets/sheet2.xml", SpreadsheetReader.resolvePart("/xl/worksheets/sheet2.xml"))
        assertEquals("xl/sheet3.xml", SpreadsheetReader.resolvePart("worksheets/../sheet3.xml"))
        assertEquals("46342", SpreadsheetReader.number("46342"))
        assertEquals("4", SpreadsheetReader.number("3.9999999999999996"))
        assertEquals("0.5", SpreadsheetReader.number("0.5"))
        assertEquals("abc", SpreadsheetReader.number("abc"))
    }
}
