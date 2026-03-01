import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface ScanResult {
  port: number;
  service: string;
  open: boolean;
}

interface PrinterInfo {
  name: string;
  status: string;
  uri: string;
}

interface CommandResult {
  success: boolean;
  message: string;
}

interface DiscoveredPrinter {
  name: string;
  uri: string;
  ip: string;
}

let selectedFile: string | null = null;
let currentPrinterIP: string | null = null;

// HTML escaping to prevent XSS
function escapeHtml(str: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (c) => escapeMap[c]);
}

// Escape for use in JS string literals within onclick handlers
function escapeJs(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Tab switching
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");

      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(tabId!)?.classList.add("active");

      // Refresh printers when switching to printers tab
      if (tabId === "printers") {
        loadPrinterList();
      }
    });
  });
}

// Load printers into select and list
async function loadPrinters() {
  const select = document.getElementById("printer-select") as HTMLSelectElement;
  const printers: PrinterInfo[] = await invoke("get_printers");

  select.innerHTML = '<option value="">Select printer...</option>';

  printers.forEach((printer) => {
    const option = document.createElement("option");
    // Using textContent is safe - no need to escape
    option.value = printer.name;
    option.textContent = `${printer.name} (${printer.status})`;
    select.appendChild(option);
  });

  updatePrintButton();
}

async function loadPrinterList() {
  const list = document.getElementById("printer-list")!;
  const printers: PrinterInfo[] = await invoke("get_printers");

  if (printers.length === 0) {
    list.innerHTML = '<p class="empty-state">No printers configured</p>';
    return;
  }

  list.innerHTML = printers
    .map(
      (printer) => `
    <div class="printer-item">
      <div class="printer-info">
        <h4>${escapeHtml(printer.name)}</h4>
        <p>${escapeHtml(printer.uri)}</p>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="printer-status ${escapeHtml(printer.status)}">${escapeHtml(printer.status)}</span>
        <button class="btn-danger" onclick="removePrinter('${escapeJs(printer.name)}')">Remove</button>
      </div>
    </div>
  `
    )
    .join("");
}

// File selection
async function selectFile() {
  const file = await open({
    multiple: false,
    filters: [
      {
        name: "Documents",
        extensions: ["pdf", "jpg", "jpeg", "png", "txt"],
      },
    ],
  });

  if (file) {
    selectedFile = file as string;
    const fileInput = document.getElementById("file-path") as HTMLInputElement;
    fileInput.value = selectedFile.split("/").pop() || selectedFile;
    updatePrintButton();
  }
}

function updatePrintButton() {
  const select = document.getElementById("printer-select") as HTMLSelectElement;
  const printBtn = document.getElementById("print-btn") as HTMLButtonElement;
  printBtn.disabled = !select.value || !selectedFile;
}

// Print
async function print() {
  const select = document.getElementById("printer-select") as HTMLSelectElement;
  const status = document.getElementById("print-status")!;
  const printBtn = document.getElementById("print-btn") as HTMLButtonElement;

  if (!select.value || !selectedFile) return;

  printBtn.disabled = true;
  printBtn.textContent = "Printing...";

  try {
    const result: CommandResult = await invoke("print_file", {
      printer: select.value,
      filePath: selectedFile,
    });

    status.classList.remove("hidden", "error", "success");
    status.classList.add(result.success ? "success" : "error");
    status.textContent = result.message;
  } catch (err) {
    status.classList.remove("hidden", "success");
    status.classList.add("error");
    status.textContent = `Error: ${err}`;
  }

  printBtn.disabled = false;
  printBtn.textContent = "Print";
}

// Port scanning
async function scanPorts() {
  const ipInput = document.getElementById("printer-ip") as HTMLInputElement;
  const scanBtn = document.getElementById("scan-btn") as HTMLButtonElement;
  const resultsDiv = document.getElementById("scan-results")!;
  const portList = document.getElementById("port-list")!;
  const addForm = document.getElementById("add-printer-form")!;
  const status = document.getElementById("discover-status")!;

  const ip = ipInput.value.trim();
  if (!ip) {
    status.classList.remove("hidden", "success");
    status.classList.add("error");
    status.textContent = "Please enter an IP address";
    return;
  }

  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";
  status.classList.add("hidden");

  try {
    const results: ScanResult[] = await invoke("scan_ports", { ip });
    currentPrinterIP = ip;

    portList.innerHTML = results
      .map(
        (r) => `
      <div class="port-item">
        <div class="port-info">
          <span class="port-number">${escapeHtml(String(r.port))}</span>
          <span class="port-service">${escapeHtml(r.service)}</span>
        </div>
        <span class="port-status ${r.open ? "open" : "closed"}">${r.open ? "OPEN" : "closed"}</span>
      </div>
    `
      )
      .join("");

    resultsDiv.classList.remove("hidden");

    // Show add printer form if IPP port is open
    const ippOpen = results.some((r) => r.port === 631 && r.open);
    if (ippOpen) {
      addForm.classList.remove("hidden");
      const nameInput = document.getElementById("new-printer-name") as HTMLInputElement;
      nameInput.value = "CanonG3010";
    } else {
      addForm.classList.add("hidden");
      status.classList.remove("hidden", "success");
      status.classList.add("error");
      status.textContent = "IPP port (631) not open. Printer may not support driverless printing.";
    }
  } catch (err) {
    status.classList.remove("hidden", "success");
    status.classList.add("error");
    status.textContent = `Scan failed: ${err}`;
  }

  scanBtn.disabled = false;
  scanBtn.textContent = "Scan Ports";
}

// Add printer
async function addPrinter() {
  const nameInput = document.getElementById("new-printer-name") as HTMLInputElement;
  const status = document.getElementById("discover-status")!;
  const addBtn = document.getElementById("add-printer-btn") as HTMLButtonElement;

  const name = nameInput.value.trim();
  if (!name || !currentPrinterIP) return;

  addBtn.disabled = true;
  addBtn.textContent = "Adding...";

  try {
    const result: CommandResult = await invoke("add_printer", {
      name,
      ip: currentPrinterIP,
    });

    status.classList.remove("hidden", "error", "success");
    status.classList.add(result.success ? "success" : "error");
    status.textContent = result.message;

    if (result.success) {
      loadPrinters();
      document.getElementById("add-printer-form")!.classList.add("hidden");
    }
  } catch (err) {
    status.classList.remove("hidden", "success");
    status.classList.add("error");
    status.textContent = `Error: ${err}`;
  }

  addBtn.disabled = false;
  addBtn.textContent = "Add Printer";
}

// Remove printer (global function for onclick)
(window as any).removePrinter = async (name: string) => {
  if (!confirm(`Remove printer "${name}"?`)) return;

  try {
    const result: CommandResult = await invoke("remove_printer", { name });
    if (result.success) {
      loadPrinterList();
      loadPrinters();
    }
  } catch (err) {
    alert(`Failed to remove printer: ${err}`);
  }
};

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  initTabs();
  loadPrinters();

  document.getElementById("refresh-printers")?.addEventListener("click", loadPrinters);
  document.getElementById("select-file")?.addEventListener("click", selectFile);
  document.getElementById("print-btn")?.addEventListener("click", print);
  document.getElementById("printer-select")?.addEventListener("change", updatePrintButton);
  document.getElementById("scan-btn")?.addEventListener("click", scanPorts);
  document.getElementById("add-printer-btn")?.addEventListener("click", addPrinter);
  document.getElementById("auto-discover-btn")?.addEventListener("click", discoverPrinters);
});

// Auto-discover printers on the network
async function discoverPrinters() {
  const discoverBtn = document.getElementById("auto-discover-btn") as HTMLButtonElement;
  const discoveredList = document.getElementById("discovered-list")!;
  const status = document.getElementById("discover-status")!;

  discoverBtn.disabled = true;
  discoverBtn.textContent = "Searching...";
  status.classList.add("hidden");
  discoveredList.innerHTML = '<p class="empty-state">Searching for printers...</p>';

  try {
    const printers: DiscoveredPrinter[] = await invoke("discover_printers");

    if (printers.length === 0) {
      discoveredList.innerHTML = '<p class="empty-state">No printers found on network</p>';
    } else {
      discoveredList.innerHTML = printers
        .map(
          (printer) => `
          <div class="discovered-item" data-ip="${escapeHtml(printer.ip)}" data-name="${escapeHtml(printer.name)}">
            <div class="discovered-info">
              <h4>${escapeHtml(printer.name)}</h4>
              <p>${escapeHtml(printer.uri)}</p>
            </div>
            <button class="btn-secondary btn-small" onclick="selectDiscoveredPrinter('${escapeJs(printer.ip)}', '${escapeJs(printer.name)}')">Select</button>
          </div>
        `
        )
        .join("");
    }
  } catch (err) {
    status.classList.remove("hidden", "success");
    status.classList.add("error");
    status.textContent = `Discovery failed: ${err}`;
    discoveredList.innerHTML = "";
  }

  discoverBtn.disabled = false;
  discoverBtn.textContent = "Auto Discover";
}

// Select a discovered printer and fill the form
(window as any).selectDiscoveredPrinter = (ip: string, name: string) => {
  const ipInput = document.getElementById("printer-ip") as HTMLInputElement;
  const nameInput = document.getElementById("new-printer-name") as HTMLInputElement;
  const addForm = document.getElementById("add-printer-form")!;
  const scanResults = document.getElementById("scan-results")!;

  ipInput.value = ip;
  nameInput.value = name.replace(/[^a-zA-Z0-9_-]/g, "");
  currentPrinterIP = ip;

  addForm.classList.remove("hidden");
  scanResults.classList.add("hidden");
};
