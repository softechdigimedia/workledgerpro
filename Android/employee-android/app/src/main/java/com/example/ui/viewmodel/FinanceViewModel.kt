package com.example.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.model.FinancialSummary
import com.example.data.model.FinancialTransaction
import com.example.data.repository.WorkLedgerRepository
import com.example.util.AndroidInputValidator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Locale

data class FinanceUiState(
    val summary: FinancialSummary = FinancialSummary(0.0, 0.0, 0.0),
    val transactions: List<FinancialTransaction> = emptyList(),
    val isLoading: Boolean = false,
    val currencySymbol: String = "₹"
)

class FinanceViewModel(
    private val repository: WorkLedgerRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FinanceUiState())
    val uiState: StateFlow<FinanceUiState> = _uiState.asStateFlow()

    fun initialize(employeeId: String) {
        viewModelScope.launch {
            repository.syncDataFromServer(employeeId)
            repository.getFinancialSummary(employeeId).collect { summary ->
                _uiState.value = _uiState.value.copy(summary = summary)
            }
        }

        viewModelScope.launch {
            repository.getTransactions(employeeId).collect { transactions ->
                _uiState.value = _uiState.value.copy(transactions = transactions)
            }
        }
    }

    fun requestFloatMoney(amount: Double, reason: String, onSuccess: (String) -> Unit, onError: (String) -> Unit) {
        val amountError = AndroidInputValidator.validatePositiveMoney(amount)
        if (amountError != null) { onError(amountError); return }
        val reasonError = AndroidInputValidator.validateReason(reason)
        if (reasonError != null) { onError(reasonError); return }
        if (_uiState.value.isLoading) { onError("A money request is already being submitted."); return }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val result = repository.requestFloatMoney(amount, reason)
            _uiState.value = _uiState.value.copy(isLoading = false)
            if (result.isSuccess) {
                onSuccess("Float money request for ₹${String.format(Locale.US, "%,.2f", amount)} submitted to Admin successfully!")
            } else {
                onError(result.exceptionOrNull()?.message ?: "Float money request failed.")
            }
        }
    }
}
