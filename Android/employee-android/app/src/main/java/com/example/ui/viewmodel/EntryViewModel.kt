package com.example.ui.viewmodel

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.model.DailyWorkEntry
import com.example.data.model.EmployeeBankAccountDto
import com.example.data.model.EntryStatus
import com.example.data.model.FinancialSummary
import com.example.data.repository.WorkLedgerRepository
import com.example.util.AndroidInputValidator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class EntryFormState(
    val websiteUrl: String = "",
    val bankAccountNumber: String = "",
    val referenceId: String = "",
    val amount: String = "",
    val withdrawalAmount: String = "",
    val screenshotUri: Uri? = null,
    val screenshotPreviewUrl: String? = null,
    val screenshotDataUrl: String? = null,
    val isUploadingScreenshot: Boolean = false,
    val uploadProgress: Float = 0f,
    val isSubmitting: Boolean = false,
    val availableBalance: Double = 0.0,
    val bankAccounts: List<EmployeeBankAccountDto> = emptyList(),
    val selectedBankAccount: EmployeeBankAccountDto? = null,
    val websiteError: String? = null,
    val bankError: String? = null,
    val referenceError: String? = null,
    val amountError: String? = null,
    val withdrawalError: String? = null,
    val screenshotError: String? = null,
    val submissionSuccessMessage: String? = null,
    val generalError: String? = null
)

data class EntryHistoryState(
    val entries: List<DailyWorkEntry> = emptyList(),
    val selectedFilter: EntryStatus? = null, // null means ALL
    val isLoading: Boolean = false,
    val cancelingEntryId: String? = null,
    val actionMessage: String? = null,
    val errorMessage: String? = null
)

class EntryViewModel(
    private val repository: WorkLedgerRepository,
    private val appContext: Context
) : ViewModel() {
    private var isAddingBankAccount = false

    private val _formState = MutableStateFlow(EntryFormState())
    val formState: StateFlow<EntryFormState> = _formState.asStateFlow()

    private val _historyState = MutableStateFlow(EntryHistoryState())
    val historyState: StateFlow<EntryHistoryState> = _historyState.asStateFlow()

    fun initialize(employeeId: String) {
        viewModelScope.launch {
            repository.syncDataFromServer(employeeId)
            repository.getFinancialSummary(employeeId).collect { summary: FinancialSummary ->
                _formState.value = _formState.value.copy(availableBalance = summary.availableBalance)
            }
        }
        viewModelScope.launch {
            repository.syncBankAccounts(employeeId)
            repository.getBankAccounts(employeeId).collect { accounts ->
                val current = _formState.value.selectedBankAccount
                val updatedSelected = if (current != null) {
                    accounts.firstOrNull { it.canonicalId == current.canonicalId || it.id == current.id } ?: current
                } else {
                    accounts.firstOrNull { it.isPrimary } ?: accounts.firstOrNull()
                }
                _formState.value = _formState.value.copy(
                    bankAccounts = accounts,
                    selectedBankAccount = updatedSelected,
                    bankAccountNumber = updatedSelected?.accountNumber ?: _formState.value.bankAccountNumber
                )
            }
        }
        viewModelScope.launch {
            repository.getEntries(employeeId).collect { entries ->
                _historyState.value = _historyState.value.copy(entries = entries)
            }
        }
    }

    fun refreshBankAccounts(employeeId: String) {
        viewModelScope.launch {
            repository.syncBankAccounts(employeeId)
        }
    }

    fun selectBankAccount(account: EmployeeBankAccountDto) {
        _formState.value = _formState.value.copy(
            selectedBankAccount = account,
            bankAccountNumber = account.accountNumber,
            bankError = null,
            generalError = null
        )
    }

    fun updateBankTag(accountId: String, newTag: String, employeeId: String) {
        viewModelScope.launch {
            repository.updateBankTag(accountId, newTag)
            repository.syncBankAccounts(employeeId)
        }
    }

    fun markAccountAsUpiExhausted(account: EmployeeBankAccountDto, employeeId: String) {
        viewModelScope.launch {
            val updatedTag = if (account.customTag.contains("Exhausted", ignoreCase = true)) account.customTag else "${account.customTag} (UPI Exhausted)"
            repository.updateBankTag(account.id, updatedTag, statusTag = "UPI_EXHAUSTED")
            repository.syncBankAccounts(employeeId)
            _formState.value = _formState.value.copy(
                submissionSuccessMessage = "Account marked as 'UPI Exhausted'. Admins & team will disburse via alternative payment methods (NEFT/IMPS)."
            )
        }
    }

    fun addBankAccount(
        employeeId: String,
        employeeAccountName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        bankUsername: String,
        bankPassword: String,
        customTag: String,
        onSuccess: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        if (isAddingBankAccount) { onError("Bank account submission is already in progress."); return }
        val nameError = AndroidInputValidator.validateRequiredText(employeeAccountName, "Account holder name", 120)
        val account = AndroidInputValidator.normalizeBankAccount(accountNumber)
        val ifsc = AndroidInputValidator.normalizeIfsc(ifscCode)
        val bankError = AndroidInputValidator.validateRequiredText(bankName, "Bank name", 100)
        val usernameError = AndroidInputValidator.validateRequiredText(bankUsername, "Bank username", 120)
        val passwordError = AndroidInputValidator.validateRequiredText(bankPassword, "Bank password", 256)
        val validationError = nameError
            ?: (if (account == null) "Bank account number must contain 6–18 digits." else null)
            ?: (if (ifsc == null) "Enter a valid 11-character IFSC code." else null)
            ?: bankError ?: usernameError ?: passwordError
        if (validationError != null) { onError(validationError); return }
        isAddingBankAccount = true
        viewModelScope.launch {
            try {
                val result = repository.addBankAccount(
                    employeeId = employeeId,
                    employeeAccountName = employeeAccountName,
                    accountNumber = account!!,
                    ifscCode = ifsc!!,
                    bankName = bankName,
                    bankUsername = bankUsername,
                    bankPassword = bankPassword,
                    customTag = customTag
                )
                if (result.isSuccess) {
                    repository.syncBankAccounts(employeeId)
                    onSuccess("Bank account added & encrypted successfully!")
                } else {
                    onError(result.exceptionOrNull()?.message ?: "Failed to add bank account.")
                }
            } catch (e: Exception) {
                onError(e.message ?: "Failed to add bank account.")
            } finally {
                isAddingBankAccount = false
            }
        }
    }

    fun onWebsiteChanged(value: String) {
        val error = if (value.isBlank() || AndroidInputValidator.normalizeWebsite(value) == null) "Enter a valid http/https website URL." else null
        _formState.value = _formState.value.copy(websiteUrl = value, websiteError = error, generalError = null)
    }

    fun onBankChanged(value: String) {
        val digitsOnly = value.filter { it.isDigit() }.take(AndroidInputValidator.MAX_BANK_ACCOUNT_DIGITS)
        val error = if (digitsOnly.isNotEmpty() && AndroidInputValidator.normalizeBankAccount(digitsOnly) == null) "Bank account must contain 6–18 digits." else null
        _formState.value = _formState.value.copy(bankAccountNumber = digitsOnly, bankError = error, generalError = null)
    }

    fun onReferenceChanged(value: String) {
        val error = if (value.isNotBlank() && AndroidInputValidator.normalizeReference(value) == null) "Reference ID must be 3–64 characters (letters, numbers, . _ / -)." else null
        _formState.value = _formState.value.copy(referenceId = value, referenceError = error, generalError = null)
    }

    fun onAmountChanged(value: String) {
        val clean = AndroidInputValidator.sanitizeMoneyInput(value)
        val amountError = if (clean.isNotBlank() && AndroidInputValidator.parsePositiveMoney(clean) == null) "Enter a positive amount with at most 2 decimal places." else null
        val parsed = AndroidInputValidator.parsePositiveMoney(clean)?.toDouble()
        val withdrawalError = if (parsed != null) AndroidInputValidator.validateWithdrawal(parsed, _formState.value.availableBalance) else null
        _formState.value = _formState.value.copy(
            amount = clean,
            withdrawalAmount = clean,
            amountError = amountError,
            withdrawalError = withdrawalError,
            generalError = null
        )
    }

    fun onWithdrawalAmountChanged(value: String) {
        val clean = AndroidInputValidator.sanitizeMoneyInput(value)
        val parsed = AndroidInputValidator.parsePositiveMoney(clean)?.toDouble()
        val error = if (parsed != null) AndroidInputValidator.validateWithdrawal(parsed, _formState.value.availableBalance) else if (clean.isNotBlank()) "Enter a valid amount with at most 2 decimal places." else null
        _formState.value = _formState.value.copy(withdrawalAmount = clean, withdrawalError = error, generalError = null)
    }

    fun onScreenshotSelected(uri: Uri?) {
        if (uri == null) return
        viewModelScope.launch {
            try {
                val resolver = appContext.contentResolver
                val mime = resolver.getType(uri)
                val size = resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) cursor.getLong(0) else null
                }
                val metadataError = AndroidInputValidator.validateImageMetadata(mime, size)
                if (metadataError != null) {
                    _formState.value = _formState.value.copy(screenshotUri = null, screenshotDataUrl = null, screenshotPreviewUrl = null, screenshotError = metadataError)
                    return@launch
                }
                val bytes = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    resolver.openInputStream(uri)?.use { input ->
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        var total = 0
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            total += read
                            if (total > AndroidInputValidator.MAX_IMAGE_BYTES) throw IllegalArgumentException("Image must be 5 MB or smaller.")
                            output.write(buffer, 0, read)
                        }
                        output.toByteArray()
                    } ?: throw IllegalArgumentException("Unable to read the selected image.")
                }
                AndroidInputValidator.validateImageBytes(mime, bytes)?.let { throw IllegalArgumentException(it) }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                AndroidInputValidator.validateImageDimensions(bounds.outWidth, bounds.outHeight)?.let { throw IllegalArgumentException(it) }
                val mimeType = mime!!.lowercase(java.util.Locale.ROOT)
                val dataUrl = "data:$mimeType;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                _formState.value = _formState.value.copy(
                    screenshotUri = uri,
                    screenshotPreviewUrl = uri.toString(),
                    screenshotDataUrl = dataUrl,
                    screenshotError = null,
                    uploadProgress = 1.0f
                )
            } catch (e: Exception) {
                _formState.value = _formState.value.copy(screenshotUri = null, screenshotDataUrl = null, screenshotPreviewUrl = null, screenshotError = e.message ?: "Unable to read this image.")
            }
        }
    }

    fun submitEntry(employeeId: String, onSuccess: () -> Unit) {
        val state = _formState.value

        // Prevent duplicate submission while already submitting
        if (state.isSubmitting) return

        var hasError = false
        var webErr: String? = null
        var bankErr: String? = null
        var refErr: String? = null
        var amtErr: String? = null
        val withErr: String? = null
        var scrErr: String? = null

        if (AndroidInputValidator.normalizeWebsite(state.websiteUrl) == null) {
            webErr = "Website details with a valid http/https URL are required."
            hasError = true
        }
        if (AndroidInputValidator.normalizeBankAccount(state.bankAccountNumber) == null) {
            bankErr = "Valid bank account number required (6–18 digits)."
            hasError = true
        }
        if (AndroidInputValidator.normalizeReference(state.referenceId) == null) {
            refErr = "Reference ID must be 3–64 characters (letters, numbers, . _ / -)."
            hasError = true
        }
        val amtDecimal = AndroidInputValidator.parsePositiveMoney(state.amount)
        val amt = amtDecimal?.toDouble()
        if (amt == null || !amt.isFinite()) {
            amtErr = "Enter a positive amount with at most 2 decimal places."
            hasError = true
        } else {
            amtErr = AndroidInputValidator.validateWithdrawal(amt, state.availableBalance)
            if (amtErr != null) hasError = true
        }
        val withAmt = AndroidInputValidator.parsePositiveMoney(state.withdrawalAmount)?.toDouble()
        val withAmtError = if (withAmt == null) "Enter a valid withdrawal amount with at most 2 decimal places." else AndroidInputValidator.validateWithdrawal(withAmt, state.availableBalance)
        if (withAmtError != null) hasError = true
        val screenshot = state.screenshotDataUrl
        if (screenshot.isNullOrBlank()) {
            scrErr = "UPI payment screenshot upload is mandatory"
            hasError = true
        }

        if (hasError) {
            _formState.value = state.copy(
                websiteError = webErr,
                bankError = bankErr,
                referenceError = refErr,
                amountError = amtErr,
                withdrawalError = withAmtError ?: withErr,
                screenshotError = scrErr
            )
            return
        }

        _formState.value = state.copy(isSubmitting = true, generalError = null)

        viewModelScope.launch {
            val safeAmount = amt ?: return@launch
            val safeWithdrawal = withAmt ?: return@launch
            val result = repository.submitEntry(
                employeeId = employeeId,
                websiteUrl = state.websiteUrl.trim(),
                bankAccountNumber = state.bankAccountNumber.trim(),
                referenceId = state.referenceId.trim(),
                amount = safeAmount,
                withdrawalAmount = safeWithdrawal,
                screenshotDataUrl = screenshot!!
            )

            if (result.isSuccess) {
                repository.syncDataFromServer(employeeId)
                _formState.value = EntryFormState(
                    availableBalance = (_formState.value.availableBalance - safeWithdrawal).coerceAtLeast(0.0),
                    submissionSuccessMessage = "Entry #${state.referenceId} submitted successfully to admin!"
                )
                onSuccess()
            } else {
                _formState.value = _formState.value.copy(
                    isSubmitting = false,
                    generalError = result.exceptionOrNull()?.message ?: "Submission failed. Please try again."
                )
            }
        }
    }

    fun clearSubmissionFeedback() {
        _formState.value = _formState.value.copy(submissionSuccessMessage = null, generalError = null)
    }

    // --- History Filtering & Cancellation ---
    fun setHistoryFilter(status: EntryStatus?) {
        _historyState.value = _historyState.value.copy(selectedFilter = status)
    }

    fun cancelPendingEntry(entryId: String, employeeId: String) {
        _historyState.value = _historyState.value.copy(cancelingEntryId = entryId, actionMessage = null, errorMessage = null)
        viewModelScope.launch {
            val result = repository.cancelEntry(entryId, employeeId)
            if (result.isSuccess) {
                _historyState.value = _historyState.value.copy(
                    cancelingEntryId = null,
                    actionMessage = "Entry successfully cancelled. Reserved funds released to balance."
                )
            } else {
                _historyState.value = _historyState.value.copy(
                    cancelingEntryId = null,
                    errorMessage = result.exceptionOrNull()?.message ?: "Could not cancel entry."
                )
            }
        }
    }

    fun clearHistoryFeedback() {
        _historyState.value = _historyState.value.copy(actionMessage = null, errorMessage = null)
    }
}
