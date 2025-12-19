const API_BASE = "https://databridge.liquorhub-demo.cloud/api/csv";

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = ['.csv'];

// DOM Elements
const fileInput = document.getElementById("file");
const typeSelect = document.getElementById("type");
const progressBar = document.getElementById("progress");
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
    errors.push("CSV形式のファイルのみアップロードできます。");
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

async function loadTypes() {
  loader.textContent = "読み込み中…";
  loader.classList.remove("sr-only");
  typeSelect.disabled = true;
  
  try {
    const data = await api(`${API_BASE}/types`);
    if (data.types && data.types.length > 0) {
      typeSelect.innerHTML = '<option value="">選択してください</option>' +
        data.types.map(t => `<option value="${t}">${t}</option>`).join("");
      typeSelect.disabled = false;
      showToast("success", "読み込み完了", `${data.types.length}種類のタイプを読み込みました。`, 3000);
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
// FILE HANDLING
// ============================================
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  updateFileDisplay(file);
});

fileRemove.addEventListener("click", (e) => {
  e.stopPropagation();
  updateFileDisplay(null);
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
  progressBar.style.display = "block";
  progressBar.value = 0;
  progressBar.setAttribute("aria-valuenow", "0");
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
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBar.value = percent;
        progressBar.setAttribute("aria-valuenow", percent);
        progressBar.setAttribute("aria-label", `アップロード進捗: ${percent}%`);
      }
    };
    
    xhr.onload = () => {
      submitBtn.disabled = false;
      submitBtn.textContent = "アップロード";
      submitBtn.setAttribute("aria-busy", "false");
      progressBar.style.display = "none";
      
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          const inserted = json.inserted || 0;
          const failed = json.failed || 0;
          const skipped = json.skipped || 0;
          
          let message = `✅ ${json.message}\n\n📊 処理結果：\n   • 追加: ${inserted} 行\n`;
          if (failed > 0) message += `   • 失敗: ${failed} 行\n`;
          if (skipped > 0) message += `   • スキップ: ${skipped} 行\n`;
          message += `\n📋 テーブル: "${json.tableName}"`;
          
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
      progressBar.style.display = "none";
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
      progressBar.style.display = "none";
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
    progressBar.style.display = "none";
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
