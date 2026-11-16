package com.example.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.model.User
import com.example.data.repository.WorkLedgerRepository
import com.example.util.AndroidInputValidator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val user: User? = null,
    val error: String? = null,
    val identifierInput: String = "",
    val passwordInput: String = "",
    val isPasswordVisible: Boolean = false
)

class AuthViewModel(
    private val repository: WorkLedgerRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        checkSession()
    }

    private fun checkSession() {
        val user = repository.getCurrentUser()
        if (user != null && repository.isLoggedIn()) {
            _uiState.value = _uiState.value.copy(
                isLoggedIn = true,
                user = user
            )
        }
    }

    fun onIdentifierChanged(value: String) {
        _uiState.value = _uiState.value.copy(identifierInput = value, error = null)
    }

    fun onPasswordChanged(value: String) {
        _uiState.value = _uiState.value.copy(passwordInput = value, error = null)
    }

    fun togglePasswordVisibility() {
        _uiState.value = _uiState.value.copy(isPasswordVisible = !_uiState.value.isPasswordVisible)
    }

    fun login() {
        val state = _uiState.value
        val identifierError = AndroidInputValidator.validateLoginIdentifier(state.identifierInput)
        if (identifierError != null) {
            _uiState.value = state.copy(error = identifierError)
            return
        }
        val passwordError = AndroidInputValidator.validatePassword(state.passwordInput)
        if (passwordError != null) {
            _uiState.value = state.copy(error = passwordError)
            return
        }

        _uiState.value = state.copy(isLoading = true, error = null)

        viewModelScope.launch {
            val result = repository.login(state.identifierInput.trim(), state.passwordInput)
            if (result.isSuccess) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isLoggedIn = true,
                    user = result.getOrNull(),
                    error = null
                )
            } else {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = result.exceptionOrNull()?.message ?: "Login failed. Please check your credentials."
                )
            }
        }
    }

    fun onSessionExpired() {
        _uiState.value = AuthUiState(
            isLoggedIn = false,
            user = null,
            error = "Session expired or invalid access token. Please sign in again.",
            identifierInput = "",
            passwordInput = ""
        )
        viewModelScope.launch {
            repository.logout()
        }
    }

    fun logout() {
        _uiState.value = AuthUiState(
            isLoggedIn = false,
            user = null,
            identifierInput = "",
            passwordInput = ""
        )
        viewModelScope.launch {
            repository.logout()
        }
    }
}
