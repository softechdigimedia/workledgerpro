package com.example.util

import java.math.BigDecimal
import java.net.URI
import java.util.Locale

/** Shared client-side validation. Server-side validation remains authoritative. */
object AndroidInputValidator {
    const val MAX_REFERENCE_LENGTH = 64
    const val MIN_BANK_ACCOUNT_DIGITS = 6
    const val MAX_BANK_ACCOUNT_DIGITS = 18

    fun validateLoginIdentifier(value: String): String? {
        val input = value.trim()
        if (input.isEmpty()) return "Please enter your Employee ID or Email."
        if (input.length > 254 || input.any { it.isISOControl() }) return "Enter a valid Employee ID or email."
        if ('@' in input && !EMAIL.matches(input)) return "Enter a valid email address."
        return null
    }

    fun validatePassword(value: String): String? = when {
        value.isBlank() -> "Please enter your password."
        value.length > 256 -> "Password is too long."
        else -> null
    }

    fun normalizeWebsite(value: String): String? {
        val raw = value.trim()
        if (raw.isEmpty() || raw.length > 2048 || raw.any { it.isWhitespace() || it.isISOControl() }) return null
        val candidate = if (raw.contains("://")) raw else "https://$raw"
        return try {
            val uri = URI(candidate).normalize()
            val host = uri.host ?: return null
            if (uri.scheme?.lowercase(Locale.ROOT) !in setOf("http", "https")) return null
            if (host.length > 253 || host.startsWith('.') || host.endsWith('.')) return null
            if (!host.contains('.') && !host.matches(Regex("\\d{1,3}(\\.\\d{1,3}){3}"))) return null
            if (uri.userInfo != null) return null
            uri.toASCIIString()
        } catch (_: Exception) { null }
    }

    fun normalizeBankAccount(value: String): String? {
        val digits = value.trim()
        return digits.takeIf { it.matches(Regex("\\d{$MIN_BANK_ACCOUNT_DIGITS,$MAX_BANK_ACCOUNT_DIGITS}")) }
    }

    fun normalizeIfsc(value: String): String? {
        val code = value.trim().uppercase(Locale.ROOT)
        return code.takeIf { IFSC.matches(it) }
    }

    fun validateRequiredText(value: String, label: String, maxLength: Int = 120): String? = when {
        value.isBlank() -> "$label is required."
        value.trim().length > maxLength -> "$label must be $maxLength characters or fewer."
        value.any { it.isISOControl() } -> "$label contains invalid characters."
        else -> null
    }

    fun validateReason(value: String): String? = when {
        value.isBlank() -> "Please enter a reason or notes."
        value.trim().length > 500 -> "Reason must be 500 characters or fewer."
        value.any { it.isISOControl() && it != '\n' && it != '\t' } -> "Reason contains invalid characters."
        else -> null
    }

    fun normalizeReference(value: String): String? {
        val ref = value.trim()
        return ref.takeIf { it.length in 3..MAX_REFERENCE_LENGTH && REFERENCE.matches(it) }
    }

    fun sanitizeMoneyInput(value: String): String {
        val signProbe = value.trim().removePrefix("₹").trimStart()
        val negativePrefix = if (signProbe.startsWith('-')) "-" else ""
        val filtered = value.filter { it.isDigit() || it == '.' }
        val dot = filtered.indexOf('.')
        val singleDot = if (dot < 0) filtered else filtered.substring(0, dot + 1) + filtered.substring(dot + 1).replace(".", "")
        val parts = singleDot.split('.', limit = 2)
        val whole = parts[0].take(12)
        val sanitized = if (parts.size == 1) whole else whole + "." + parts[1].take(2)
        return negativePrefix + sanitized
    }

    fun parsePositiveMoney(value: String): BigDecimal? {
        val raw = value.trim()
        if (raw.isEmpty() || raw.length > 16 || !MONEY.matches(raw)) return null
        return try {
            val amount = BigDecimal(raw)
            amount.takeIf { it > BigDecimal.ZERO && it.scale().coerceAtLeast(0) <= 2 && it.precision() <= 14 }
        } catch (_: Exception) { null }
    }

    fun validatePositiveMoney(value: Double): String? = when {
        !value.isFinite() -> "Enter a valid amount."
        value <= 0.0 -> "Amount must be greater than zero."
        BigDecimal.valueOf(value).scale().coerceAtLeast(0) > 2 -> "Amount can have at most 2 decimal places."
        BigDecimal.valueOf(value).precision() > 14 -> "Amount is too large."
        else -> null
    }

    fun validateWithdrawal(amount: Double, availableBalance: Double): String? = when {
        validatePositiveMoney(amount) != null -> validatePositiveMoney(amount)
        !availableBalance.isFinite() || availableBalance < 0.0 -> "Available balance is invalid. Refresh your balance."
        amount > availableBalance -> "Withdrawal exceeds your available balance."
        else -> null
    }


    fun validateImageBytes(mimeType: String?, bytes: ByteArray): String? {
        if (bytes.isEmpty()) return "The selected image is empty."
        val matches = when (mimeType?.lowercase(Locale.ROOT)) {
            "image/jpeg" -> bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()
            "image/png" -> bytes.size >= 8 && bytes.copyOfRange(0, 8).contentEquals(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))
            "image/webp" -> bytes.size >= 12 && String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" && String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP"
            else -> false
        }
        return if (matches) null else "The selected file content does not match its image type."
    }

    fun validateImageDimensions(width: Int, height: Int): String? {
        if (width <= 0 || height <= 0) return "The selected file is not a readable image."
        if (width > 12_000 || height > 12_000 || width.toLong() * height.toLong() > 40_000_000L) {
            return "Image dimensions are too large. Choose a smaller image."
        }
        return null
    }

    fun validateImageMetadata(mimeType: String?, sizeBytes: Long?): String? {
        if (mimeType?.lowercase(Locale.ROOT) !in setOf("image/jpeg", "image/png", "image/webp")) {
            return "Choose a JPEG, PNG or WEBP image."
        }
        if (sizeBytes == null || sizeBytes <= 0L) return "The selected image is empty or cannot be read."
        if (sizeBytes > MAX_IMAGE_BYTES) return "Image must be 5 MB or smaller."
        return null
    }

    const val MAX_IMAGE_BYTES = 5L * 1024L * 1024L
    private val EMAIL = Regex("^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")
    private val IFSC = Regex("^[A-Z]{4}0[A-Z0-9]{6}$")
    private val MONEY = Regex("^(?:[0-9]{1,12}(?:\\.[0-9]{1,2})?|\\.[0-9]{1,2})$")
    private val REFERENCE = Regex("^[A-Za-z0-9][A-Za-z0-9._/-]*$")
}
