import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScanResult, DiscoveredPrinter, CommandResult } from "../types";

interface Props {
  onPrinterAdded: () => void;
}

export function DiscoverTab({ onPrinterAdded }: Props) {
  const [ip, setIp] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [scanResults, setScanResults] = useState<ScanResult[] | null>(null);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<
    DiscoveredPrinter[]
  >([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setStatus(null);
    setDiscoveredPrinters([]);

    try {
      const printers: DiscoveredPrinter[] = await invoke("discover_printers");
      setDiscoveredPrinters(printers);
    } catch (err) {
      setStatus({ type: "error", message: `Discovery failed: ${err}` });
    }

    setIsDiscovering(false);
  };

  const handleSelectDiscovered = (printer: DiscoveredPrinter) => {
    setIp(printer.ip);
    setPrinterName(printer.name.replace(/[^a-zA-Z0-9_-]/g, ""));
    setShowAddForm(true);
    setScanResults(null);
  };

  const handleScan = async () => {
    if (!ip.trim()) {
      setStatus({ type: "error", message: "Please enter an IP address" });
      return;
    }

    setIsScanning(true);
    setStatus(null);
    setScanResults(null);
    setShowAddForm(false);

    try {
      const results: ScanResult[] = await invoke("scan_ports", {
        ip: ip.trim(),
      });
      setScanResults(results);

      const ippOpen = results.some((r) => r.port === 631 && r.open);
      if (ippOpen) {
        setShowAddForm(true);
        setPrinterName("Printer");
      } else {
        setStatus({
          type: "error",
          message:
            "IPP port (631) not open. Printer may not support driverless printing.",
        });
      }
    } catch (err) {
      setStatus({ type: "error", message: `Scan failed: ${err}` });
    }

    setIsScanning(false);
  };

  const handleAddPrinter = async () => {
    if (!printerName.trim() || !ip.trim()) return;

    setIsAdding(true);
    setStatus(null);

    try {
      const result: CommandResult = await invoke("add_printer", {
        name: printerName.trim(),
        ip: ip.trim(),
      });

      setStatus({
        type: result.success ? "success" : "error",
        message: result.message,
      });

      if (result.success) {
        onPrinterAdded();
        setShowAddForm(false);
        setPrinterName("");
        setIp("");
        setScanResults(null);
      }
    } catch (err) {
      setStatus({ type: "error", message: `Error: ${err}` });
    }

    setIsAdding(false);
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 text-text-primary dark:text-text-dark-primary">
        Add New Printer
      </h2>

      {/* Auto Discovery Section */}
      <div className="mb-5 pb-5 border-b border-surface-border dark:border-dark-border">
        <h3 className="text-base font-semibold mb-2 text-text-primary dark:text-text-dark-primary">
          Auto Discovery
        </h3>
        <p className="text-sm text-text-secondary mb-3">
          Find printers on your network automatically
        </p>
        <button
          className="btn-primary"
          onClick={handleDiscover}
          disabled={isDiscovering}
        >
          {isDiscovering ? "Searching..." : "Auto Discover"}
        </button>

        {/* Discovered printers list */}
        {discoveredPrinters.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {discoveredPrinters.map((printer, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-surface-2 dark:bg-dark-3 rounded-md"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-text-primary dark:text-text-dark-primary mb-0.5">
                    {printer.name}
                  </h4>
                  <p className="text-xs text-text-secondary truncate">
                    {printer.uri}
                  </p>
                </div>
                <button
                  className="btn-secondary btn-small ml-3"
                  onClick={() => handleSelectDiscovered(printer)}
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        )}

        {!isDiscovering && discoveredPrinters.length === 0 && (
          <div className="mt-3">
            <p className="text-center text-text-secondary py-3 text-sm">
              No printers found on network
            </p>
          </div>
        )}
      </div>

      {/* Manual Setup Section */}
      <div className="mb-4">
        <h3 className="text-base font-semibold mb-2 text-text-primary dark:text-text-dark-primary">
          Manual Setup
        </h3>
        <p className="text-sm text-text-secondary mb-3">
          Or enter printer IP address manually
        </p>

        <div className="mb-3">
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Printer IP Address
          </label>
          <input
            type="text"
            placeholder="192.168.1.X"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
          />
        </div>

        <button
          className="btn-secondary w-full"
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? "Scanning..." : "Scan Ports"}
        </button>
      </div>

      {/* Scan Results */}
      {scanResults && (
        <div className="mt-4 pt-4 border-t border-surface-border dark:border-dark-border">
          <h3 className="text-base font-semibold mb-3 text-text-primary dark:text-text-dark-primary">
            Scan Results
          </h3>
          <div className="flex flex-col gap-1">
            {scanResults.map((r) => (
              <div
                key={r.port}
                className="flex items-center justify-between py-2 border-b border-surface-border dark:border-dark-border last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary dark:text-text-dark-primary min-w-[50px]">
                    {r.port}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {r.service}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded ${
                    r.open
                      ? "bg-status-success text-status-success-text"
                      : "bg-surface-3 dark:bg-dark-3 text-text-secondary"
                  }`}
                >
                  {r.open ? "OPEN" : "closed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Printer Form */}
      {showAddForm && (
        <div className="mt-4 pt-4 border-t border-surface-border dark:border-dark-border">
          <div className="mb-3">
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Printer Name
            </label>
            <input
              type="text"
              placeholder="MyPrinter"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            onClick={handleAddPrinter}
            disabled={isAdding || !printerName.trim()}
          >
            {isAdding ? "Adding..." : "Add Printer"}
          </button>
        </div>
      )}

      {/* Status message */}
      {status && (
        <div
          className={`mt-4 p-3 rounded-md text-sm ${
            status.type === "success" ? "status-success" : "status-error"
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
