const API_BASE = "https://databridge.liquorhub-demo.cloud/api/csv";

const fileInput = document.getElementById("file");
const typeSelect = document.getElementById("type");
const progressBar = document.getElementById("progress");
const loader = document.getElementById("loader");
const submitBtn = document.getElementById("submitBtn");
const resultDiv = document.getElementById("result");

// Wrap fetch for reusability
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Load CSV types
async function loadTypes() {
  loader.style.display = "block";
  try {
    const data = await api(`${API_BASE}/types`);
    typeSelect.innerHTML = data.types
      .map(t => `<option value="${t}">${t}</option>`)
      .join("");
  } catch (err) {
    typeSelect.innerHTML = `<option disabled>読み込みエラー</option>`;
    console.error(err);
  } finally {
    loader.style.display = "none";
  }
}

loadTypes();

// File Input & Drag & Drop Handler
const dropZone = document.getElementById("dropZone");
const dropZoneText = document.getElementById("dropZoneText");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const fileRemove = document.getElementById("fileRemove");

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function updateFileDisplay(file) {
  if (file) {
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.classList.add("show");
    dropZone.classList.add("has-file");
    dropZoneText.textContent = file.name;
  } else {
    fileInfo.classList.remove("show");
    dropZone.classList.remove("has-file");
    dropZoneText.textContent = "ファイルをドラッグ＆ドロップ";
    fileInput.value = "";
  }
}

// File input change
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  updateFileDisplay(file);
});

// Remove file button
fileRemove.addEventListener("click", (e) => {
  e.stopPropagation();
  updateFileDisplay(null);
});

// Drag and drop
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
    if (file.name.endsWith(".csv")) {
      fileInput.files = files;
      updateFileDisplay(file);
    } else {
      resultDiv.textContent = "❌ CSV形式のファイルのみアップロードできます。";
      resultDiv.style.borderColor = "#e74c3c";
      resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
      resultDiv.style.display = "block";
    }
  }
});

// Upload CSV Handler
document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = fileInput.files[0];
  const type = typeSelect.value;

  if (!file) {
    resultDiv.textContent = "CSVファイルを選択してください。";
    return;
  }

  if (!file.name.endsWith(".csv")) {
    resultDiv.textContent = "❌ CSV形式のファイルのみアップロードできます。";
    resultDiv.style.borderColor = "#e74c3c";
    resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
    resultDiv.style.display = "block";
    updateFileDisplay(null);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "アップロード中...";
  progressBar.style.display = "block";
  progressBar.value = 0;
  resultDiv.textContent = "⏳ アップロード中…";
  resultDiv.style.borderColor = "#e1e8ed";
  resultDiv.style.background = "linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        progressBar.value = Math.round((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      submitBtn.disabled = false;
      submitBtn.textContent = "アップロード";
      progressBar.style.display = "none";
      if (xhr.status >= 200 && xhr.status < 300) {
        const json = JSON.parse(xhr.responseText);
        console.log("json: ", json);
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
        setTimeout(() => resultDiv.classList.remove("success"), 600);
      } else {
        resultDiv.textContent = `❌ アップロード失敗：\n${xhr.responseText}`;
        resultDiv.style.borderColor = "#e74c3c";
        resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
      }
    };

    xhr.onerror = () => {
      resultDiv.textContent = "❌ 通信エラーが発生しました。\nネットワーク接続を確認してください。";
      resultDiv.style.borderColor = "#e74c3c";
      resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
      submitBtn.disabled = false;
      submitBtn.textContent = "アップロード";
      progressBar.style.display = "none";
    };

    xhr.send(formData);
  } catch (err) {
    resultDiv.textContent = `❌ エラー：\n${err.message}`;
    resultDiv.style.borderColor = "#e74c3c";
    resultDiv.style.background = "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)";
    submitBtn.disabled = false;
    submitBtn.textContent = "アップロード";
    progressBar.style.display = "none";
  }
});

