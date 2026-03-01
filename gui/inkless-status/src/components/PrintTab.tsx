import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { PrinterInfo, CommandResult } from "../types";

interface Props {
  printers: PrinterInfo[];
  onRefresh: () => void;
}

export function PrintTab({ printers, onRefresh }: Props) {
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Auto-select default printer when printers load
  useEffect(() => {
    if (printers.length > 0 && !selectedPrinter) {
      const defaultPrinter = localStorage.getItem("defaultPrinter");
      const printerExists = printers.some((p) => p.name === defaultPrinter);

      if (defaultPrinter && printerExists) {
        setSelectedPrinter(defaultPrinter);
      } else if (printers.length === 1) {
        // If only one printer, select it automatically
        setSelectedPrinter(printers[0].name);
      }
    }
  }, [printers, selectedPrinter]);

  const handleSelectFile = async () => {
    const file = await open({
      multiple: false,
      filters: [
        { name: "Documents", extensions: ["pdf", "jpg", "jpeg", "png", "txt"] },
      ],
    });

    if (file) {
      setSelectedFile(file as string);
      setFileName((file as string).split("/").pop() || (file as string));
    }
  };

  const handlePrint = async () => {
    if (!selectedPrinter || !selectedFile) return;

    setIsPrinting(true);
    setStatus(null);

    try {
      const result: CommandResult = await invoke("print_file", {
        printer: selectedPrinter,
        filePath: selectedFile,
      });

      setStatus({
        type: result.success ? "success" : "error",
        message: result.message,
      });
    } catch (err) {
      setStatus({ type: "error", message: `Error: ${err}` });
    }

    setIsPrinting(false);
  };

  const canPrint = selectedPrinter && selectedFile && !isPrinting;

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 text-text-primary dark:text-text-dark-primary">
        Print Document
      </h2>

      {/* Printer selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          Printer
        </label>
        <div className="flex gap-2">
          <select
            value={selectedPrinter}
            onChange={(e) => setSelectedPrinter(e.target.value)}
            className="flex-1"
          >
            <option value="">Select printer...</option>
            {printers.map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.name} ({printer.status})
              </option>
            ))}
          </select>
          <button
            className="btn-icon"
            title="Refresh"
            onClick={onRefresh}
          >
            ↻
          </button>
        </div>
      </div>

      {/* File selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          File
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            placeholder="No file selected"
            value={fileName}
            className="flex-1"
          />
          <button className="btn-secondary" onClick={handleSelectFile}>
            Browse
          </button>
        </div>
      </div>

      {/* Print button */}
      <button
        className="btn-primary"
        disabled={!canPrint}
        onClick={handlePrint}
      >
        {isPrinting ? "Printing..." : "Print"}
      </button>

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
