const API_BASE = "http://43.207.163.235:3000/api/csv";

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = ['.csv', '.xlsx', '.xls'];

// DOM Elements
const fileInput = document.getElementById("file");
const typeSelect = document.getElementById("type");
const progressContainer = document.getElementById("progressContainer");
const progressBarFill = document.getElementById("progressBarFill");
const progressPercentage = document.getElementById("progressPercentage");
const progressStatus = document.getElementById("progressStatus");
const loader = document.getElementById("loader");
const submitBtn = document.getElementById("submitBtn");
const resultDiv = document.getElementById("result");
const uploadForm = document.getElementById("uploadForm");
const dropZone = document.getElementById("dropZone");
const dropZoneText = document.getElementById("dropZoneText");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const fileRemove = document.getElementById("fileRemove");
const fileRow = document.getElementById("fileRow");
const typeRow = document.getElementById("typeRow");
const fileError = document.getElementById("fileError");
const typeError = document.getElementById("typeError");
const toastContainer = document.getElementById("toastContainer");

// ============================================
// TOAST NOTIFICATION SYSTEM
// ============================================
function showToast(type, title, message, duration = 5000) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  
  const icons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️"
  };
  
  const toastDuration = duration / 1000; // Convert to seconds for CSS animation
  
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="通知を閉じる" onclick="this.parentElement.remove()">×</button>
    <div class="toast-progress" style="--toast-duration: ${toastDuration}s;"></div>
  `;
  
  toastContainer.appendChild(toast);
  
  // Auto remove after duration
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = "toastSlideIn 0.3s reverse";
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
  
  // Focus management for accessibility
  toast.querySelector('.toast-close').focus();
  
  return toast;
}

// ============================================
// VALIDATION & ERROR HANDLING
// ============================================
function validateFile(file) {
  const errors = [];
  
  if (!file) {
    errors.push("ファイルを選択してください。");
    return { valid: false, errors };
  }
  
  // Check file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_FILE_TYPES.some(ext => fileName.endsWith(ext));
  if (!hasValidExtension) {
    errors.push("CSVまたはExcel形式のファイルのみアップロードできます。");
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`ファイルサイズが大きすぎます。最大${formatFileSize(MAX_FILE_SIZE)}までアップロードできます。`);
  }
  
  if (file.size === 0) {
    errors.push("空のファイルはアップロードできません。");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function setFieldError(fieldRow, errorElement, message) {
  fieldRow.classList.add("error");
  errorElement.textContent = message;
  errorElement.style.display = "block";
  
  const input = fieldRow.querySelector("input, select");
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
}

function clearFieldError(fieldRow, errorElement) {
  fieldRow.classList.remove("error");
  errorElement.style.display = "none";
  
  const input = fieldRow.querySelector("input, select");
  if (input) {
    input.setAttribute("aria-invalid", "false");
  }
}

function clearAllErrors() {
  clearFieldError(fileRow, fileError);
  clearFieldError(typeRow, typeError);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function updateFileDisplay(file) {
  clearFieldError(fileRow, fileError);
  
  if (file) {
    const validation = validateFile(file);
    if (!validation.valid) {
      setFieldError(fileRow, fileError, validation.errors[0]);
      showToast("error", "ファイルエラー", validation.errors[0]);
      return;
    }
    
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.classList.add("show");
    dropZone.classList.add("has-file");
    dropZoneText.textContent = file.name;
    fileInput.setAttribute("aria-invalid", "false");
  } else {
    fileInfo.classList.remove("show");
    dropZone.classList.remove("has-file");
    dropZoneText.textContent = "ファイルをドラッグ＆ドロップ";
    fileInput.value = "";
    fileInput.setAttribute("aria-invalid", "false");
  }
}

// ============================================
// API FUNCTIONS
// ============================================
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Store all available types for CSV detection
let allAvailableTypes = [];

// Mapping from file prefixes to Japanese display names (from constants_6_15.js)
const FILE_ITEM_MATCH = {
  F0_TOM: ["取引先"],
  F0_SOM: ["商品管理"],
  F0_TKM: ["個別単価"],
  F0_MSM: ["ユーザー", "金種", "伝票種別", "年商規模", "業務形態", "立地条件", "メーカー", "銘柄", "原料", "原産地", "製造区分", "配送コース", "倉庫", "貯蔵区分", "地区", "部門", "支店", "備考", "大中小分類"],
  F0_SHM: ["商品関連付"],
  F0_SZM: ["ロケーション", "現在庫"],
  F1_SZR: ["月次受払在庫"],
  F9_CATE: ["大中小分類"] // Excel file for item categories
};

// Note: The API returns Japanese display names, not handler names
// So we match Japanese names directly from FILE_ITEM_MATCH

async function loadTypes() {
  loader.textContent = "読み込み中…";
  loader.classList.remove("sr-only");
  typeSelect.disabled = true;
  
  try {
    const data = await api(`${API_BASE}/types`);
    if (data.types && data.types.length > 0) {
      allAvailableTypes = data.types; // Store for CSV detection
      typeSelect.innerHTML = '<option value="">選択してください</option>' +
        data.types.map(t => `<option value="${t}">${t}</option>`).join("");
      typeSelect.disabled = false;
      showToast("success", "読み込み完了", `${data.types.length}種類のタイプを読み込みました。`, 3000);
      
      // If file is already selected, detect its type from filename
      const file = fileInput.files[0];
      if (file) {
        updateSelectFromFilename(file.name, allAvailableTypes);
      }
    } else {
      typeSelect.innerHTML = '<option value="" disabled>タイプが見つかりません</option>';
      showToast("warning", "警告", "利用可能なタイプが見つかりませんでした。");
    }
  } catch (err) {
    typeSelect.innerHTML = '<option value="" disabled>読み込みエラー</option>';
    showToast("error", "エラー", "タイプの読み込みに失敗しました。ページを再読み込みしてください。");
    console.error("Failed to load types:", err);
  } finally {
    loader.classList.add("sr-only");
    typeSelect.disabled = false;
  }
}

// ============================================
// CSV TYPE DETECTION FROM FILENAME
// ============================================
/**
 * Detects CSV type based on filename prefix (F0_TOM, F0_SOM, etc.)
 * Returns array of matching Japanese display names (which match what the API returns)
 */
function detectCSVTypeFromFilename(filename) {
  if (!filename) return [];
  
  const upperFilename = filename.toUpperCase();
  const matchingJapaneseNames = [];
  
  // Check for file prefix patterns (case-insensitive)
  for (const [prefix, japaneseNames] of Object.entries(FILE_ITEM_MATCH)) {
    if (upperFilename.includes(prefix)) {
      // Add all Japanese names for this prefix
      for (const japaneseName of japaneseNames) {
        if (!matchingJapaneseNames.includes(japaneseName)) {
          matchingJapaneseNames.push(japaneseName);
        }
      }
    }
  }
  
  // Debug logging
  if (matchingJapaneseNames.length > 0) {
    console.log(`[CSV Detection] Filename: "${filename}" → Detected prefixes → Japanese names:`, matchingJapaneseNames);
  }
  
  return matchingJapaneseNames;
}

/**
 * Updates select dropdown based on detected CSV type from filename
 */
function updateSelectFromFilename(filename, allTypes) {
  if (!filename || !allTypes || allTypes.length === 0) {
    return;
  }

  try {
    const matchingJapaneseNames = detectCSVTypeFromFilename(filename);
    
    if (matchingJapaneseNames.length === 0) {
      // No match found, show all types
      typeSelect.innerHTML = '<option value="">選択してください</option>' +
        allTypes.map(t => `<option value="${t}">${t}</option>`).join("");
      showToast("info", "タイプ検出", "ファイル名からCSVタイプを自動検出できませんでした。手動で選択してください。", 4000);
      return;
    }
    
    // Filter available types to only matching ones (allTypes contains Japanese names)
    const availableTypes = allTypes.filter(t => matchingJapaneseNames.includes(t));
    
    if (availableTypes.length === 0) {
      // No matching types found in available handlers
      // This might happen if the filename prefix doesn't match any known pattern
      // or if the detected Japanese names don't exist in the available types
      console.log('Debug: Filename:', filename);
      console.log('Debug: Detected Japanese names:', matchingJapaneseNames);
      console.log('Debug: Available types:', allTypes);
      typeSelect.innerHTML = '<option value="">選択してください</option>' +
        allTypes.map(t => `<option value="${t}">${t}</option>`).join("");
      showToast("warning", "タイプ不一致", `ファイル名「${filename}」から検出されたタイプが利用可能なタイプと一致しませんでした。`, 4000);
      return;
    }
    
    // Update select with matching types
    typeSelect.innerHTML = '<option value="">選択してください</option>' +
      availableTypes.map(t => `<option value="${t}">${t}</option>`).join("");
    
    // Auto-select if only one match
    if (availableTypes.length === 1) {
      typeSelect.value = availableTypes[0];
      clearFieldError(typeRow, typeError);
      showToast("success", "タイプ自動選択", `CSVタイプ「${availableTypes[0]}」を自動選択しました。`, 3000);
    } else {
      showToast("info", "タイプ検出", `${availableTypes.length}種類の一致するタイプが見つかりました。選択してください。`, 4000);
    }
    
    typeSelect.disabled = false;
  } catch (error) {
    console.error('Error updating select from filename:', error);
    // On error, show all types
    typeSelect.innerHTML = '<option value="">選択してください</option>' +
      allTypes.map(t => `<option value="${t}">${t}</option>`).join("");
  }
}

// ============================================
// FILE HANDLING
// ============================================
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  updateFileDisplay(file);
  
  // Detect CSV type from filename and update select
  if (file && allAvailableTypes.length > 0) {
    updateSelectFromFilename(file.name, allAvailableTypes);
  }
});

fileRemove.addEventListener("click", (e) => {
  e.stopPropagation();
  updateFileDisplay(null);
  
  // Reset select dropdown to show all types
  if (allAvailableTypes.length > 0) {
    typeSelect.innerHTML = '<option value="">選択してください</option>' +
      allAvailableTypes.map(t => `<option value="${t}">${t}</option>`).join("");
    typeSelect.value = "";
    clearFieldError(typeRow, typeError);
  }
  
  showToast("info", "ファイル削除", "ファイルが削除されました。");
});

// Drag and drop with keyboard support
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    fileInput.files = files;
    updateFileDisplay(file);
    
    // Detect CSV type from filename and update select
    if (allAvailableTypes.length > 0) {
      updateSelectFromFilename(file.name, allAvailableTypes);
    }
  }
});

// Keyboard support for drop zone
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

// ============================================
// FORM SUBMISSION
// ============================================
uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();
  
  const file = fileInput.files[0];
  const type = typeSelect.value;
  
  // Validate file
  const fileValidation = validateFile(file);
  if (!fileValidation.valid) {
    setFieldError(fileRow, fileError, fileValidation.errors[0]);
    showToast("error", "バリデーションエラー", fileValidation.errors[0]);
    return;
  }
  
  // Validate type
  if (!type) {
    setFieldError(typeRow, typeError, "タイプを選択してください。");
    showToast("error", "バリデーションエラー", "タイプを選択してください。");
    typeSelect.focus();
    return;
  }
  
  // Update UI for upload
  submitBtn.disabled = true;
  submitBtn.textContent = "アップロード中...";
  submitBtn.setAttribute("aria-busy", "true");
  progressContainer.style.display = "block";
  progressContainer.setAttribute("aria-valuenow", "0");
  progressBarFill.style.width = "0%";
  progressPercentage.textContent = "0%";
  progressStatus.textContent = "ファイルをアップロードしています...";
  resultDiv.textContent = "⏳ アップロード中…";
  resultDiv.style.borderColor = "#e1e8ed";
  resultDiv.style.background = "linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)";
  resultDiv.style.display = "block";
  
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);
  
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/upload`);
    
    xhr.upload.onprogress = (e) => {
      if (e.loaded && e.total) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressContainer.setAttribute("aria-valuenow", percent);
        progressBarFill.style.width = `${percent}%`;
        progressPercentage.textContent = `${percent}%`;
        progressContainer.setAttribute("aria-label", `アップロード進捗: ${percent}%`);
        
        // Update status text based on progress
        if (percent < 30) {
          progressStatus.textContent = "ファイルを読み込んでいます...";
        } else if (percent < 60) {
          progressStatus.textContent = "サーバーに送信中...";
        } else if (percent < 90) {
          progressStatus.textContent = "データを処理しています...";
        } else if (percent < 100) {
          progressStatus.textContent = "ほぼ完了です...";
        } else {
          progressStatus.textContent = "完了！";
        }
      }
    };
    
    xhr.onload = () => {
      submitBtn.disabled = false;
      submitBtn.textContent = "アップロード";
      submitBtn.setAttribute("aria-busy", "false");
      
      // Complete progress bar animation
      progressContainer.setAttribute("aria-valuenow", "100");
      progressBarFill.style.width = "100%";
      progressPercentage.textContent = "100%";
      progressStatus.textContent = "アップロード完了！";
      
      // Hide progress bar after a short delay
      setTimeout(() => {
        progressContainer.style.display = "none";
      }, 1000);
      
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          const inserted = json.inserted || 0;
          const failed = json.failed || 0;
          const skipped = json.skipped || 0;
          
          let message = `✅ ${json.message}\n\n📊 処理結果：\n`;
          
          // Show total database rows inserted across all tables if available
          if (json.totalRowsInserted !== undefined) {
            message += `   • 追加: ${json.totalRowsInserted} 行 (全テーブル合計)\n`;
          } else {
            message += `   • 追加: ${inserted} 行\n`;
          }
          
          if (skipped > 0) message += `   • スキップ: ${skipped} 行\n`;
          if (failed > 0) message += `   • 失敗: ${failed} 行\n`;
          
          // Display table names (support both tableNames array and tableName string for backward compatibility)
          const tableNames = json.tableNames || (json.tableName ? [json.tableName] : []);
          if (tableNames.length > 0) {
            if (tableNames.length === 1) {
              message += `\n📋 テーブル: ${tableNames[0]}`;
            } else {
              message += `\n📋 テーブル (${tableNames.length}件):\n   ${tableNames.map(t => `• ${t}`).join('\n   ')}`;
            }
          }
          
          // Display per-table statistics if available (for all import types)
          if (json.tableStats && Object.keys(json.tableStats).length > 0) {
            message += `\n\n📈 テーブル別統計：\n`;
            Object.keys(json.tableStats).forEach(table => {
              const stats = json.tableStats[table];
              const parts = [];
              if (stats.inserted > 0) parts.push(`追加: ${stats.inserted}`);
              if (stats.skipped > 0) parts.push(`スキップ: ${stats.skipped}`);
              if (stats.failed > 0) parts.push(`失敗: ${stats.failed}`);
              if (parts.length > 0) {
                message += `   • ${table}: ${parts.join(', ')}\n`;
              } else {
                // Show zero counts if all are zero
                message += `   • ${table}: 追加: 0, スキップ: 0, 失敗: 0\n`;
              }
            });
          }
          
          resultDiv.textContent = message;
          resultDiv.style.borderColor = "#27ae60";
          resultDiv.style.background = "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)";
          resultDiv.classList.add("success");
          
          // Show toast notification
          const toastMessage = `追加: ${inserted}行${failed > 0 ? `、失敗: ${failed}行` : ''}${skipped > 0 ? `、スキップ: ${skipped}行` : ''}`;
          showToast("success", "アップロード成功", toastMessage, 6000);
          
          // Reset form after success
          setTimeout(() => {
            resultDiv.classList.remove("success");
            updateFileDisplay(null);
            typeSelect.value = "";
          }, 3000);
        } catch (parseError) {
          throw new Error("レスポンスの解析に失敗しました。");
        }
      } else {
        let errorMessage = "アップロードに失敗しました。";
        try {
          const errorData = JSON.parse(xhr.responseText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          errorMessage = xhr.responseText || errorMessage;
        }
        
        resultDiv.textContent = `❌ アップロード失敗：\n${errorMessage}`;
        resultDiv.style.borderColor = "#e74c3c";
        resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
        showToast("error", "アップロード失敗", errorMessage);
      }
    };
    
    xhr.onerror = () => {
      const errorMessage = "通信エラーが発生しました。ネットワーク接続を確認してください。";
      resultDiv.textContent = `❌ ${errorMessage}`;
      resultDiv.style.borderColor = "#e74c3c";
      resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
      showToast("error", "通信エラー", errorMessage);
      submitBtn.disabled = false;
      submitBtn.textContent = "アップロード";
      submitBtn.setAttribute("aria-busy", "false");
      progressContainer.style.display = "none";
    };
    
    xhr.ontimeout = () => {
      const errorMessage = "リクエストがタイムアウトしました。もう一度お試しください。";
      resultDiv.textContent = `❌ ${errorMessage}`;
      resultDiv.style.borderColor = "#e74c3c";
      resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
      showToast("error", "タイムアウト", errorMessage);
      submitBtn.disabled = false;
      submitBtn.textContent = "アップロード";
      submitBtn.setAttribute("aria-busy", "false");
      progressContainer.style.display = "none";
    };
    
    xhr.timeout = 300000; // 5 minutes timeout
    
    xhr.send(formData);
  } catch (err) {
    const errorMessage = err.message || "予期しないエラーが発生しました。";
    resultDiv.textContent = `❌ エラー：\n${errorMessage}`;
    resultDiv.style.borderColor = "#e74c3c";
    resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
    showToast("error", "エラー", errorMessage);
    submitBtn.disabled = false;
    submitBtn.textContent = "アップロード";
    submitBtn.setAttribute("aria-busy", "false");
    progressContainer.style.display = "none";
  }
});

// ============================================
// INITIALIZATION
// ============================================
loadTypes();

// Initialize accessibility
fileInput.addEventListener("invalid", (e) => {
  e.preventDefault();
  setFieldError(fileRow, fileError, "CSVファイルを選択してください。");
});

typeSelect.addEventListener("change", () => {
  clearFieldError(typeRow, typeError);
});

// Prevent form submission on Enter key in file input
fileInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    fileInput.click();
  }
});
