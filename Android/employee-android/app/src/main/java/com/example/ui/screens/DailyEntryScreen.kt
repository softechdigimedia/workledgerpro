package com.example.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Numbers
import androidx.compose.material.icons.filled.Shield
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.ui.theme.BorderLight
import com.example.ui.theme.EmeraldAccent
import com.example.ui.theme.TealPrimaryDark
import com.example.ui.theme.NavyDark
import com.example.ui.theme.NavyMedium
import com.example.ui.theme.SlateMuted
import com.example.ui.theme.TealPrimary
import com.example.ui.viewmodel.EntryFormState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.example.data.model.EmployeeBankAccountDto
import com.example.util.AndroidInputValidator
import java.util.Locale

@Composable
fun DailyEntryScreen(
    formState: EntryFormState,
    onWebsiteChanged: (String) -> Unit,
    onBankChanged: (String) -> Unit,
    onReferenceChanged: (String) -> Unit,
    onAmountChanged: (String) -> Unit,
    onWithdrawalAmountChanged: (String) -> Unit,
    onScreenshotSelected: (Uri?) -> Unit,
    onSelectBankAccount: (EmployeeBankAccountDto) -> Unit = {},
    onMarkUpiExhausted: (EmployeeBankAccountDto) -> Unit = {},
    onUpdateBankTag: (accountId: String, newTag: String) -> Unit = { _, _ -> },
    onRefreshBankAccounts: () -> Unit = {},
    onAddBankAccount: (
        employeeAccountName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        bankUsername: String,
        bankPassword: String,
        customTag: String
    ) -> Unit = { _, _, _, _, _, _, _ -> },
    onSubmitClick: () -> Unit,
    onClearFeedback: () -> Unit,
    onNavigateBack: () -> Unit
) {
    var showConfirmDialog by remember { mutableStateOf(false) }
    var showAddBankDialog by remember { mutableStateOf(false) }
    var editingBankAcc by remember { mutableStateOf<EmployeeBankAccountDto?>(null) }

    if (editingBankAcc != null) {
        val currentAcc = editingBankAcc!!
        var activeTagsList by remember { mutableStateOf(currentAcc.allTagsList.toMutableList()) }
        var additionInput by remember { mutableStateOf("") }
        var tagErr by remember { mutableStateOf<String?>(null) }

        AlertDialog(
            onDismissRequest = { editingBankAcc = null },
            title = {
                Text("Edit Account Tags", fontWeight = FontWeight.Bold, color = NavyDark)
            },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "Manage assigned tags for ${currentAcc.bankName} (${currentAcc.accountNumberMasked}). Tags sync automatically to Admin.",
                        fontSize = 12.sp,
                        color = SlateMuted
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Currently Attached Tags (Removable Chips)
                    Text("Currently Attached Tags:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NavyDark)
                    Spacer(modifier = Modifier.height(6.dp))

                    if (activeTagsList.isEmpty()) {
                        Text("No tags attached yet. Add a new tag below.", fontSize = 11.sp, color = SlateMuted)
                    } else {
                        @OptIn(ExperimentalLayoutApi::class)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            activeTagsList.forEach { tagItem ->
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = Color(0xFFCCFBF1),
                                    border = BorderStroke(1.dp, TealPrimary)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(tagItem, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TealPrimaryDark)
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Remove tag",
                                            tint = TealPrimaryDark,
                                            modifier = Modifier
                                                .size(14.dp)
                                                .clickable {
                                                    activeTagsList = activeTagsList.filterNot { it == tagItem }.toMutableList()
                                                }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Dedicated Addition Box
                    Text("Add Custom Tag:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NavyDark)
                    Spacer(modifier = Modifier.height(6.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = additionInput,
                            onValueChange = { additionInput = it },
                            placeholder = { Text("e.g. Highway Toll, Fuel") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val trimmed = additionInput.trim()
                                if (trimmed.isNotBlank()) {
                                    if (!activeTagsList.contains(trimmed)) {
                                        activeTagsList = (activeTagsList + trimmed).toMutableList()
                                    }
                                    additionInput = ""
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = TealPrimary),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("+ Add")
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Quick Preset Chips
                    Text("Tap Presets to Add/Remove Tag:", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = NavyMedium)
                    Spacer(modifier = Modifier.height(6.dp))

                    @OptIn(ExperimentalLayoutApi::class)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        listOf("Primary Salary", "Travel Float", "Vendor Payout", "Highway Toll", "Emergency Float", "NEFT Only").forEach { preset ->
                            val isSelected = activeTagsList.contains(preset)

                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = if (isSelected) TealPrimary else Color(0xFFE2E8F0),
                                modifier = Modifier.clickable {
                                    activeTagsList = if (isSelected) {
                                        activeTagsList.filterNot { it == preset }.toMutableList()
                                    } else {
                                        (activeTagsList + preset).toMutableList()
                                    }
                                }
                            ) {
                                Text(
                                    text = if (isSelected) "✓ $preset" else "+ $preset",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isSelected) Color.White else NavyDark,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }

                    if (tagErr != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(tagErr!!, color = Color(0xFFDC2626), fontSize = 11.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (activeTagsList.isEmpty()) {
                            tagErr = "At least one tag is required."
                            return@Button
                        }
                        val finalTagsString = activeTagsList.joinToString(", ")
                        onUpdateBankTag(currentAcc.id, finalTagsString)
                        editingBankAcc = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = TealPrimary)
                ) {
                    Text("Save & Sync Tags")
                }
            },
            dismissButton = {
                TextButton(onClick = { editingBankAcc = null }) {
                    Text("Cancel", color = SlateMuted)
                }
            }
        )
    }

    if (showAddBankDialog) {
        var empAccName by remember { mutableStateOf("") }
        var accNum by remember { mutableStateOf("") }
        var ifsc by remember { mutableStateOf("") }
        var bName by remember { mutableStateOf("") }
        var bUser by remember { mutableStateOf("") }
        var bPass by remember { mutableStateOf("") }
        var cTag by remember { mutableStateOf("Primary Salary") }
        var addErr by remember { mutableStateOf<String?>(null) }

        AlertDialog(
            onDismissRequest = { showAddBankDialog = false },
            title = {
                Text("Add Assigned Bank Account", fontWeight = FontWeight.Bold, color = NavyDark)
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFFEF3C7),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(modifier = Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.Lock, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                "🔒 Credentials are encrypted and sent to Admin. Devices store zero raw passwords.",
                                fontSize = 10.sp,
                                color = Color(0xFF92400E)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = empAccName,
                        onValueChange = { empAccName = it.take(120) },
                        label = { Text("Employee Account Name *") },
                        placeholder = { Text("e.g. Rahul Sharma") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = accNum,
                        onValueChange = { accNum = it.filter { c -> c.isDigit() }.take(AndroidInputValidator.MAX_BANK_ACCOUNT_DIGITS) },
                        label = { Text("Account Number *") },
                        placeholder = { Text("Min 6 digits") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = ifsc,
                        onValueChange = { ifsc = it.filter { c -> c.isLetterOrDigit() }.take(11).uppercase() },
                        label = { Text("IFSC Code *") },
                        placeholder = { Text("e.g. HDFC0001234") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = bName,
                        onValueChange = { bName = it.take(100) },
                        label = { Text("Bank Name *") },
                        placeholder = { Text("e.g. HDFC Bank") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = bUser,
                        onValueChange = { bUser = it.take(120) },
                        label = { Text("Bank Username *") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = bPass,
                        onValueChange = { bPass = it.take(256) },
                        label = { Text("Bank Password *") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = cTag,
                        onValueChange = { cTag = it },
                        label = { Text("Custom Account Tag *") },
                        placeholder = { Text("e.g. Travel Float, Vendor Payout") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    if (addErr != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(addErr!!, color = Color(0xFFDC2626), fontSize = 11.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val accountValid = AndroidInputValidator.normalizeBankAccount(accNum) != null
                        val ifscValid = AndroidInputValidator.normalizeIfsc(ifsc) != null
                        if (empAccName.isBlank() || !accountValid || !ifscValid || bName.isBlank() || bUser.isBlank() || bPass.isBlank()) {
                            addErr = when {
                                empAccName.isBlank() -> "Account holder name is required."
                                !accountValid -> "Account number must contain 6–18 digits."
                                !ifscValid -> "Enter a valid 11-character IFSC code."
                                bName.isBlank() -> "Bank name is required."
                                bUser.isBlank() -> "Bank username is required."
                                else -> "Bank password is required."
                            }
                            return@Button
                        }
                        showAddBankDialog = false
                        onAddBankAccount(
                            empAccName.trim(),
                            accNum.trim(),
                            ifsc.trim(),
                            bName.trim(),
                            bUser.trim(),
                            bPass.trim(),
                            cTag.trim()
                        )
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = TealPrimary)
                ) {
                    Text("Save & Encrypt")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddBankDialog = false }) {
                    Text("Cancel", color = SlateMuted)
                }
            }
        )
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        onScreenshotSelected(uri)
    }

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = {
                Text(
                    text = "Confirm Entry Submission",
                    fontWeight = FontWeight.Bold,
                    color = NavyDark
                )
            },
            text = {
                Column {
                    Text(
                        text = "Are you sure you want to submit this daily work entry for ₹${formState.amount.ifBlank { "0.00" }}?",
                        style = MaterialTheme.typography.bodyMedium,
                        color = NavyMedium
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = "• Ref: ${formState.referenceId}\n• Bank Account: •••• ${formState.bankAccountNumber.takeLast(4)}\n• Total Amount: ₹${formState.amount}",
                        fontSize = 12.sp,
                        color = SlateMuted
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmDialog = false
                        onSubmitClick()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = TealPrimary)
                ) {
                    Text("Confirm & Submit")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Cancel", color = SlateMuted)
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        // Top Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onNavigateBack,
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Back",
                    tint = NavyDark
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(
                    text = "Daily Work Entry",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = NavyDark
                )
                Text(
                    text = "All 6 Fields Mandatory • Secure Ledger Integration",
                    style = MaterialTheme.typography.bodySmall,
                    color = SlateMuted
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Balance Available Notice Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = androidx.compose.foundation.BorderStroke(1.dp, BorderLight)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Available Balance for Withdrawal",
                        style = MaterialTheme.typography.labelSmall,
                        color = SlateMuted
                    )
                    Text(
                        text = "₹${String.format(Locale.US, "%,.2f", formState.availableBalance)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TealPrimary
                    )
                }
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFCCFBF1)
                ) {
                    Text(
                        text = "Live Limit",
                        color = Color(0xFF115E59),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Success message banner
        if (formState.submissionSuccessMessage != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFD1FAE5))
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = EmeraldAccent,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = formState.submissionSuccessMessage,
                        color = Color(0xFF065F46),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // General error banner
        if (formState.generalError != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFEE2E2))
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color(0xFFDC2626),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = formState.generalError,
                        color = Color(0xFF991B1B),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Form Fields Container
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = androidx.compose.foundation.BorderStroke(1.dp, BorderLight)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {

                // Field 1: Website Details
                Text("1. Website Details *", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = NavyDark)
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = formState.websiteUrl,
                    onValueChange = onWebsiteChanged,
                    placeholder = { Text("https://portal.clientdomain.com/task/88") },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Language, contentDescription = null, tint = SlateMuted)
                    },
                    isError = formState.websiteError != null,
                    supportingText = formState.websiteError?.let { { Text(it, color = Color(0xFFDC2626)) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("entry_website_input"),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TealPrimary,
                        unfocusedBorderColor = BorderLight
                    )
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Field 2: Assigned Bank Account Selection with Custom Tags
                Text("2. Assigned Bank Account *", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = NavyDark)
                Spacer(modifier = Modifier.height(4.dp))

                var isDropdownExpanded by remember { mutableStateOf(false) }

                if (formState.bankAccounts.isNotEmpty()) {
                    val selectedText = formState.selectedBankAccount?.let { acc ->
                        val statusSuffix = if (acc.isUpiExhausted) " [⚠️ UPI Exhausted]" else ""
                        "${acc.bankName} (${acc.customTag})$statusSuffix • ${acc.accountNumberMasked}"
                    } ?: formState.bankAccountNumber

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                isDropdownExpanded = !isDropdownExpanded
                                onRefreshBankAccounts()
                            }
                            .testTag("entry_bank_input")
                    ) {
                        OutlinedTextField(
                            value = selectedText,
                            onValueChange = {},
                            readOnly = true,
                            enabled = false,
                            label = { Text("Select Account Tag") },
                            leadingIcon = {
                                Icon(imageVector = Icons.Default.AccountBalance, contentDescription = null, tint = TealPrimary)
                            },
                            trailingIcon = {
                                Icon(imageVector = Icons.Default.ArrowDropDown, contentDescription = "Dropdown", tint = TealPrimary)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                disabledTextColor = NavyDark,
                                disabledBorderColor = BorderLight,
                                disabledLabelColor = SlateMuted,
                                disabledLeadingIconColor = TealPrimary,
                                disabledTrailingIconColor = TealPrimary
                            )
                        )

                        DropdownMenu(
                            expanded = isDropdownExpanded,
                            onDismissRequest = { isDropdownExpanded = false },
                            modifier = Modifier.fillMaxWidth(0.92f)
                        ) {
                            formState.bankAccounts.forEach { acc ->
                                DropdownMenuItem(
                                    text = {
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 4.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = acc.bankName,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp,
                                                    color = NavyDark
                                                )
                                                @OptIn(ExperimentalLayoutApi::class)
                                                FlowRow(
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                                ) {
                                                    acc.allTagsList.forEach { tagItem ->
                                                        Surface(
                                                            shape = RoundedCornerShape(4.dp),
                                                            color = Color(0xFFF1F5F9)
                                                        ) {
                                                            Text(
                                                                text = tagItem,
                                                                fontSize = 10.sp,
                                                                fontWeight = FontWeight.SemiBold,
                                                                color = NavyMedium,
                                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                            )
                                                        }
                                                    }
                                                }
                                            }

                                            Spacer(modifier = Modifier.height(2.dp))

                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = "Account: ${acc.accountNumberMasked}",
                                                    fontSize = 11.sp,
                                                    color = SlateMuted
                                                )

                                                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                                    TextButton(
                                                        onClick = {
                                                            editingBankAcc = acc
                                                            isDropdownExpanded = false
                                                        },
                                                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                                                    ) {
                                                        Icon(imageVector = Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(12.dp), tint = TealPrimary)
                                                        Spacer(modifier = Modifier.width(2.dp))
                                                        Text("Edit Tag", fontSize = 10.sp, color = TealPrimary)
                                                    }

                                                    if (!acc.isUpiExhausted) {
                                                        TextButton(
                                                            onClick = {
                                                                onMarkUpiExhausted(acc)
                                                                isDropdownExpanded = false
                                                            },
                                                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                                                        ) {
                                                            Text("Mark Exhausted", fontSize = 10.sp, color = Color(0xFFDC2626))
                                                        }
                                                    }
                                                }
                                            }

                                            if (acc.isUpiExhausted) {
                                                Spacer(modifier = Modifier.height(4.dp))
                                                Surface(
                                                    shape = RoundedCornerShape(4.dp),
                                                    color = Color(0xFFFEF3C7),
                                                    modifier = Modifier.fillMaxWidth()
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Icon(imageVector = Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(12.dp))
                                                        Spacer(modifier = Modifier.width(4.dp))
                                                        Text(
                                                            "⚠️ UPI Exhausted — Disburse team will use NEFT/IMPS",
                                                            fontSize = 10.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = Color(0xFF92400E)
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    onClick = {
                                        onSelectBankAccount(acc)
                                        isDropdownExpanded = false
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Default.AccountBalance,
                                            contentDescription = null,
                                            tint = if (acc.isUpiExhausted) Color(0xFFD97706) else (if (acc.id == formState.selectedBankAccount?.id) TealPrimary else SlateMuted)
                                        )
                                    }
                                )
                            }
                            DropdownMenuItem(
                                text = {
                                    Text("+ Add New Bank Account", fontWeight = FontWeight.Bold, color = TealPrimary, fontSize = 13.sp)
                                },
                                onClick = {
                                    isDropdownExpanded = false
                                    showAddBankDialog = true
                                },
                                leadingIcon = {
                                    Icon(imageVector = Icons.Default.Add, contentDescription = null, tint = TealPrimary)
                                }
                            )
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = formState.bankAccountNumber,
                        onValueChange = onBankChanged,
                        placeholder = { Text("Enter bank account number (digits)") },
                        leadingIcon = {
                            Icon(imageVector = Icons.Default.AccountBalance, contentDescription = null, tint = SlateMuted)
                        },
                        isError = formState.bankError != null,
                        supportingText = {
                            if (formState.bankError != null) {
                                Text(formState.bankError, color = Color(0xFFDC2626))
                            } else if (formState.bankAccountNumber.length >= 4) {
                                Text(
                                    "Masked Preview: •••• •••• ${formState.bankAccountNumber.takeLast(4)} (Encrypted)",
                                    color = EmeraldAccent
                                )
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("entry_bank_input"),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = TealPrimary,
                            unfocusedBorderColor = BorderLight
                        )
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Field 3: Reference ID
                Text("3. Reference ID *", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = NavyDark)
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = formState.referenceId,
                    onValueChange = onReferenceChanged,
                    placeholder = { Text("e.g. REF-2026-9102") },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Numbers, contentDescription = null, tint = SlateMuted)
                    },
                    isError = formState.referenceError != null,
                    supportingText = formState.referenceError?.let { { Text(it, color = Color(0xFFDC2626)) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("entry_reference_input"),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TealPrimary,
                        unfocusedBorderColor = BorderLight
                    )
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Field 4: Total Amount
                Text("4. Total Amount (₹) *", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = NavyDark)
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = formState.amount,
                    onValueChange = onAmountChanged,
                    placeholder = { Text("₹0.00") },
                    leadingIcon = {
                        Text(
                            text = "₹",
                            fontWeight = FontWeight.Bold,
                            color = SlateMuted,
                            fontSize = 16.sp
                        )
                    },
                    isError = formState.amountError != null,
                    supportingText = formState.amountError?.let { { Text(it, color = Color(0xFFDC2626)) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("entry_amount_input"),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TealPrimary,
                        unfocusedBorderColor = BorderLight
                    )
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Field 5: UPI Screenshot Upload
                Text("5. UPI Payment Screenshot *", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = NavyDark)
                Spacer(modifier = Modifier.height(4.dp))

                // Screenshot Preview & Selector Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, if (formState.screenshotError != null) Color(0xFFDC2626) else BorderLight, RoundedCornerShape(12.dp))
                        .background(Color(0xFFF8FAFC))
                        .padding(12.dp)
                ) {
                    if (formState.screenshotPreviewUrl != null || formState.screenshotUri != null) {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = EmeraldAccent,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Screenshot Attached & Validated",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = EmeraldAccent
                                    )
                                }
                                Text(
                                    text = "Change",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TealPrimary,
                                    modifier = Modifier.clickable {
                                        photoPickerLauncher.launch(
                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                        )
                                    }
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            AsyncImage(
                                model = formState.screenshotUri ?: formState.screenshotPreviewUrl,
                                contentDescription = "UPI Screenshot Preview",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(140.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                                contentScale = ContentScale.Crop
                            )
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.AddPhotoAlternate,
                                contentDescription = null,
                                tint = TealPrimary,
                                modifier = Modifier.size(32.dp)
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Attach UPI Transaction Screenshot",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp,
                                color = NavyDark
                            )
                            Text(
                                text = "JPEG, PNG up to 10MB",
                                fontSize = 11.sp,
                                color = SlateMuted
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Button(
                                onClick = {
                                    photoPickerLauncher.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = TealPrimary),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Pick from Gallery", fontSize = 12.sp)
                            }
                        }
                    }
                }
                if (formState.screenshotError != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = formState.screenshotError,
                        color = Color(0xFFDC2626),
                        fontSize = 12.sp
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Field 6: Remaining Balance Overview (non-editable: Available Balance - Total Amount)
                val totalAmountInput = formState.amount.toDoubleOrNull() ?: 0.0
                val remainingBalanceOverview = (formState.availableBalance - totalAmountInput).coerceAtLeast(0.0)
                val remainingBalanceDisplay = String.format(Locale.US, "₹%,.2f", remainingBalanceOverview)

                Text("6. Remaining Balance Overview", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = NavyDark)
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = remainingBalanceDisplay,
                    onValueChange = {},
                    readOnly = true,
                    enabled = false,
                    placeholder = { Text("₹0.00") },
                    leadingIcon = {
                        Text(
                            text = "₹",
                            fontWeight = FontWeight.Bold,
                            color = SlateMuted,
                            fontSize = 16.sp
                        )
                    },
                    supportingText = {
                        Text(
                            text = "Remaining available balance after deducting Total Amount",
                            color = SlateMuted,
                            fontSize = 11.sp
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("entry_withdrawal_input"),
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        disabledTextColor = NavyDark,
                        disabledBorderColor = BorderLight,
                        disabledLabelColor = SlateMuted,
                        disabledLeadingIconColor = SlateMuted,
                        disabledPlaceholderColor = SlateMuted,
                        focusedBorderColor = TealPrimary,
                        unfocusedBorderColor = BorderLight
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Submit Button (Prevents duplicate submissions)
        Button(
            onClick = { showConfirmDialog = true },
            enabled = !formState.isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .testTag("submit_entry_button"),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = TealPrimary,
                contentColor = Color.White
            )
        ) {
            if (formState.isSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = Color.White,
                    strokeWidth = 2.5.dp
                )
            } else {
                Text(
                    text = "Submit Entry & Reserve Ledger Funds",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        Spacer(modifier = Modifier.height(30.dp))
    }
}
