package com.example.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class AndroidInputValidatorTest {
    @Test fun `login identifier accepts employee ID`() {
        assertNull(AndroidInputValidator.validateLoginIdentifier("EMP-1007"))
    }

    @Test fun `login identifier accepts valid email`() {
        assertNull(AndroidInputValidator.validateLoginIdentifier("employee@example.com"))
    }

    @Test fun `login identifier rejects malformed email`() {
        assertNotNull(AndroidInputValidator.validateLoginIdentifier("employee@invalid"))
    }

    @Test fun `login identifier rejects blank value`() {
        assertNotNull(AndroidInputValidator.validateLoginIdentifier("  "))
    }

    @Test fun `password rejects blank and overlong values`() {
        assertNotNull(AndroidInputValidator.validatePassword(""))
        assertNotNull(AndroidInputValidator.validatePassword("x".repeat(257)))
        assertNull(AndroidInputValidator.validatePassword("valid password"))
    }

    @Test fun `website adds https to a valid domain`() {
        assertEquals("https://example.com/path", AndroidInputValidator.normalizeWebsite("example.com/path"))
    }

    @Test fun `website rejects javascript scheme`() {
        assertNull(AndroidInputValidator.normalizeWebsite("javascript:alert(1)"))
    }

    @Test fun `website rejects invalid host and whitespace`() {
        assertNull(AndroidInputValidator.normalizeWebsite("not a website"))
        assertNull(AndroidInputValidator.normalizeWebsite("https:///missing-host"))
    }

    @Test fun `website accepts explicit http and https`() {
        assertEquals("http://example.com", AndroidInputValidator.normalizeWebsite("http://example.com"))
        assertEquals("https://example.com", AndroidInputValidator.normalizeWebsite("https://example.com"))
    }

    @Test fun `bank account accepts 6 to 18 digits`() {
        assertEquals("123456", AndroidInputValidator.normalizeBankAccount("123456"))
        assertEquals("123456789012345678", AndroidInputValidator.normalizeBankAccount("123456789012345678"))
    }

    @Test fun `bank account rejects letters short and oversized values`() {
        assertNull(AndroidInputValidator.normalizeBankAccount("12345"))
        assertNull(AndroidInputValidator.normalizeBankAccount("12345A"))
        assertNull(AndroidInputValidator.normalizeBankAccount("1".repeat(19)))
    }

    @Test fun `IFSC is normalized and validated`() {
        assertEquals("HDFC0001234", AndroidInputValidator.normalizeIfsc("hdfc0001234"))
        assertNull(AndroidInputValidator.normalizeIfsc("HDFC1234"))
        assertNull(AndroidInputValidator.normalizeIfsc("12340001234"))
    }

    @Test fun `reference accepts supported punctuation`() {
        assertEquals("REF-2026/9102_A", AndroidInputValidator.normalizeReference("REF-2026/9102_A"))
    }

    @Test fun `reference rejects short long and unsupported characters`() {
        assertNull(AndroidInputValidator.normalizeReference("AB"))
        assertNull(AndroidInputValidator.normalizeReference("REF 123"))
        assertNull(AndroidInputValidator.normalizeReference("R".repeat(65)))
    }

    @Test fun `money sanitizer allows one decimal and two fractional digits`() {
        assertEquals("1234.56", AndroidInputValidator.sanitizeMoneyInput("₹1a234.567"))
        assertEquals("-12.00", AndroidInputValidator.sanitizeMoneyInput("-12.00"))
        assertEquals("-12.00", AndroidInputValidator.sanitizeMoneyInput("₹ -12.00"))
        assertNull(AndroidInputValidator.parsePositiveMoney(AndroidInputValidator.sanitizeMoneyInput("-12.00")))
    }

    @Test fun `positive money accepts valid decimal values`() {
        assertEquals("125.50", AndroidInputValidator.parsePositiveMoney("125.50")?.toPlainString())
        assertNull(AndroidInputValidator.parsePositiveMoney("0"))
        assertNull(AndroidInputValidator.parsePositiveMoney("-1"))
    }

    @Test fun `positive money rejects excessive precision and malformed values`() {
        assertNull(AndroidInputValidator.parsePositiveMoney("1.001"))
        assertNull(AndroidInputValidator.parsePositiveMoney("1..2"))
        assertNull(AndroidInputValidator.parsePositiveMoney("NaN"))
    }

    @Test fun `double money rejects non finite and excessive precision`() {
        assertNotNull(AndroidInputValidator.validatePositiveMoney(Double.NaN))
        assertNotNull(AndroidInputValidator.validatePositiveMoney(Double.POSITIVE_INFINITY))
        assertNotNull(AndroidInputValidator.validatePositiveMoney(1.234))
        assertNull(AndroidInputValidator.validatePositiveMoney(1.23))
    }

    @Test fun `withdrawal rejects amount over balance`() {
        assertNotNull(AndroidInputValidator.validateWithdrawal(101.0, 100.0))
        assertNull(AndroidInputValidator.validateWithdrawal(99.0, 100.0))
    }

    @Test fun `image metadata accepts supported image within limit`() {
        assertNull(AndroidInputValidator.validateImageMetadata("image/jpeg", 1024L))
        assertNull(AndroidInputValidator.validateImageMetadata("image/png", AndroidInputValidator.MAX_IMAGE_BYTES))
    }

    @Test fun `image metadata rejects unsupported mime missing size and oversized image`() {
        assertNotNull(AndroidInputValidator.validateImageMetadata("application/pdf", 1024L))
        assertNotNull(AndroidInputValidator.validateImageMetadata("image/jpeg", null))
        assertNotNull(AndroidInputValidator.validateImageMetadata("image/webp", AndroidInputValidator.MAX_IMAGE_BYTES + 1))
    }


    @Test fun `image bytes must match declared mime type`() {
        val pngHeader = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        assertNull(AndroidInputValidator.validateImageBytes("image/png", pngHeader))
        assertNotNull(AndroidInputValidator.validateImageBytes("image/jpeg", pngHeader))
        assertNotNull(AndroidInputValidator.validateImageBytes("image/png", byteArrayOf(1, 2, 3)))
    }

    @Test fun `image dimensions reject invalid and excessive images`() {
        assertNull(AndroidInputValidator.validateImageDimensions(1920, 1080))
        assertNotNull(AndroidInputValidator.validateImageDimensions(0, 1080))
        assertNotNull(AndroidInputValidator.validateImageDimensions(12000, 12000))
    }


    @Test fun `reason accepts normal multiline notes and rejects blank or oversized text`() {
        assertNull(AndroidInputValidator.validateReason("Travel expense\nClient visit"))
        assertNotNull(AndroidInputValidator.validateReason("  "))
        assertNotNull(AndroidInputValidator.validateReason("x".repeat(501)))
        assertNotNull(AndroidInputValidator.validateReason("bad\u0000text"))
    }

    @Test fun `required text enforces length and control character restrictions`() {
        assertNotNull(AndroidInputValidator.validateRequiredText(" ", "Name"))
        assertNotNull(AndroidInputValidator.validateRequiredText("x".repeat(121), "Name"))
        assertNotNull(AndroidInputValidator.validateRequiredText("Bad\u0000Name", "Name"))
        assertNull(AndroidInputValidator.validateRequiredText("Work Ledger", "Name"))
    }
}
